// ---------------------------------------------------------------------------
// Config: pureadmin.json + .pureadmin.json -> env var -> default
// ---------------------------------------------------------------------------
const fs = require('fs');
const { writeFile } = require('./helpers/files');
const path = require('path');
const { deepMerge, deepMergeInto } = require('./helpers/objects');

const TOOL_VERSION = require(path.join(__dirname, '..', 'package.json')).version;
const TOOL_NAME = 'pureadmin';

function tryLoadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function loadConfig() {
  const config = {};

  // 1. User home (~/.pureadmin.json) — base defaults
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const data = tryLoadJson(path.join(home, '.pureadmin.json'));
    if (data) {
      deepMergeInto(config, data);
      config._configPath = path.join(home, '.pureadmin.json');
    }
  }

  // 2. Project-level (walks up from cwd)
  //    pureadmin.json  — base config (checked in)
  //    .pureadmin.json — local overrides merged on top (gitignored, secrets)
  //
  // Deep merge ensures project-level targets don't nuke home-level apiKeys.
  // e.g. project sets defaultTarget: "local", home has targets.production.apiKey
  // → both survive.
  let dir = process.cwd();
  while (true) {
    const base = tryLoadJson(path.join(dir, 'pureadmin.json'));
    const local = tryLoadJson(path.join(dir, '.pureadmin.json'));
    if (base || local) {
      if (base) {
        deepMergeInto(config, base);
        config._configPath = path.join(dir, 'pureadmin.json');
      }
      if (local) {
        deepMergeInto(config, local);
        config._configPath = path.join(dir, '.pureadmin.json');
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Project config helpers — three-file layered model
// ---------------------------------------------------------------------------
//
// pureadmin.json       — declarations: which themes, sourced from where (path
//                        for team-shared local themes, otherwise remote).
//                        Hand-edited. Checked in.
// pureadmin.lock.json  — resolutions: version + content_sha + fetched_at +
//                        source per theme. Tool-managed. Checked in. Same
//                        purpose as package-lock.json.
// .pureadmin.json      — per-developer overrides: a `path` for a theme they're
//                        reworking locally, a personal target/apiKey, etc.
//                        Hand-edited. Gitignored.
//
// `themes update` writes ONLY to the lockfile (and possibly the local override
// file when a developer runs `themes add --path`). It NEVER mutates
// pureadmin.json — that file changes only when a human explicitly runs
// `themes add` / `themes remove` for a team-shared theme.
//
// `themes install` is the CI-equivalent of `npm ci` — reads the lockfile,
// fetches exactly those versions, fails if declarations and lockfile are out
// of sync. Writes nothing.

const LOCKFILE_FORMAT = 1;

function findProjectConfig() {
  // Find the nearest pureadmin.json from cwd (not home — project only).
  // Used by callers that need just the project file path; the layered read
  // is in loadProjectConfig.
  let dir = process.cwd();
  while (true) {
    const p = path.join(dir, 'pureadmin.json');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Read all three project config layers. Walks up from cwd to find the first
// directory containing any of pureadmin.json / .pureadmin.json /
// pureadmin.lock.json, treats that directory as the project root, then loads
// each file (defaulting empty when absent).
//
// Returns:
//   {
//     baseFile, baseData,         // pureadmin.json (declarations)
//     localFile, localData,       // .pureadmin.json (per-dev overrides)
//     lockFile, lockData,         // pureadmin.lock.json (resolutions)
//     data,                       // top-level merged view (for themesDir, targets, etc.)
//     themes                      // merged per-theme view (declarations + lock + provenance)
//   }
//
// `themes` is the convenience for command code: each entry is the deep-merge
// of base, local, and lock for that slug, plus a `_layers` field marking
// which files declared it. Mutating these objects is fine for read-side use;
// for writes, callers must update the appropriate raw layer (baseData /
// localData / lockData) and call the matching save function.
function loadProjectConfig() {
  let dir = process.cwd();
  let projectRoot = null;
  while (true) {
    const base = path.join(dir, 'pureadmin.json');
    const local = path.join(dir, '.pureadmin.json');
    const lock = path.join(dir, 'pureadmin.lock.json');
    if (fs.existsSync(base) || fs.existsSync(local) || fs.existsSync(lock)) {
      projectRoot = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // No config files found anywhere — fall back to cwd. The would-be paths are
  // returned so callers can still save (creating the files).
  if (!projectRoot) projectRoot = process.cwd();

  const baseFile = path.join(projectRoot, 'pureadmin.json');
  const localFile = path.join(projectRoot, '.pureadmin.json');
  const lockFile = path.join(projectRoot, 'pureadmin.lock.json');

  const baseData = tryLoadJson(baseFile) || {};
  const localData = tryLoadJson(localFile) || {};
  const lockData = tryLoadJson(lockFile) || { _format: LOCKFILE_FORMAT, themes: {} };

  // Auto-promote legacy bare-string theme entries to { path: <string> } in
  // BOTH base and local. Some users wrote `{ "audi": "../path" }` before the
  // 1.2.1 --path feature existed; without promotion, callers that spread the
  // entry would corrupt the file with character-index keys on save.
  promoteBareStringThemes(baseData);
  promoteBareStringThemes(localData);

  // Auto-migrate pre-lockfile-split entries: pureadmin.json used to carry
  // resolved fields (version, content_sha) in the same place as declarations.
  // Hoist any such fields into lockData in memory so the rest of the code
  // sees the new shape; the base file isn't rewritten until something else
  // triggers a saveBaseConfig (e.g. `themes add`), at which point the
  // resolved fields will be stripped.
  //
  // For .pureadmin.json: strip inline resolved fields in memory but DO NOT
  // hoist them into the lock. The lock mirrors pureadmin.json exclusively;
  // a personal override is a runtime overlay and never contributes a lock
  // entry. Legacy projects where someone wrote a `version` into
  // .pureadmin.json simply lose it — `themes install` will resolve the
  // base declaration fresh from the registry next time.
  hoistResolvedFieldsToLock(baseData, lockData, 'remote');
  stripResolvedFields(localData);

  // Top-level merged view (for non-themes fields like themesDir, targets).
  // IMPORTANT: use the immutable deepMerge here, NOT deepMergeInto. The latter
  // would alias nested objects between `data` and `baseData`/`localData`, so
  // mutating `data.themes[slug]` would silently mutate `baseData.themes[slug]`
  // — and a subsequent `saveBaseConfig` would write the local override into
  // the team-shared file. That's the entire footgun we're refactoring away.
  const data = deepMerge(deepMerge({}, baseData), localData);

  // Per-theme merged view with provenance.
  const baseThemes = baseData.themes || {};
  const localThemes = localData.themes || {};
  const lockThemes = (lockData && lockData.themes) || {};
  const allSlugs = new Set([
    ...Object.keys(baseThemes),
    ...Object.keys(localThemes),
    ...Object.keys(lockThemes),
  ]);

  const themes = {};
  for (const slug of allSlugs) {
    const layers = {
      base: Object.prototype.hasOwnProperty.call(baseThemes, slug),
      local: Object.prototype.hasOwnProperty.call(localThemes, slug),
      lock: Object.prototype.hasOwnProperty.call(lockThemes, slug),
    };
    // Declarations: base then local override.
    const declared = {};
    if (layers.base) Object.assign(declared, baseThemes[slug] || {});
    if (layers.local) Object.assign(declared, localThemes[slug] || {});
    // Resolution: lockfile entry (version, content_sha, fetched_at, source).
    const resolved = layers.lock ? (lockThemes[slug] || {}) : {};
    themes[slug] = { ...declared, ...resolved, _layers: layers };
  }

  return {
    baseFile, baseData,
    localFile, localData,
    lockFile, lockData,
    data,
    themes,
    projectRoot,
  };
}

function promoteBareStringThemes(layer) {
  if (!layer || !layer.themes || typeof layer.themes !== 'object') return;
  for (const [slug, entry] of Object.entries(layer.themes)) {
    if (typeof entry === 'string') layer.themes[slug] = { path: entry };
  }
}

// Pre-lockfile-split layouts had `version` / `content_sha` (and sometimes
// `fetched_at`) inline with declarations. Move those into the lockfile so the
// rest of the code only sees declarations in baseData/localData. Lockfile
// entries already present win over migrated values (the lockfile is more
// authoritative than a stale in-base version field).
// Strip inline resolved fields from a layer without writing them anywhere.
// Used for .pureadmin.json: legacy `version` / `content_sha` / `fetched_at`
// fields are removed in memory so that subsequent saveLocalConfig writes a
// clean per-developer overlay.
function stripResolvedFields(layer) {
  if (!layer || !layer.themes || typeof layer.themes !== 'object') return;
  const RESOLVED_FIELDS = ['version', 'content_sha', 'fetched_at'];
  for (const entry of Object.values(layer.themes)) {
    if (!entry || typeof entry !== 'object') continue;
    for (const f of RESOLVED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, f)) delete entry[f];
    }
  }
}

function hoistResolvedFieldsToLock(layer, lockData, defaultSource) {
  if (!layer || !layer.themes || typeof layer.themes !== 'object') return;
  lockData.themes = lockData.themes || {};
  const RESOLVED_FIELDS = ['version', 'content_sha', 'fetched_at'];
  for (const [slug, entry] of Object.entries(layer.themes)) {
    if (!entry || typeof entry !== 'object') continue;
    const hoisted = {};
    let any = false;
    for (const f of RESOLVED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, f)) {
        hoisted[f] = entry[f];
        delete entry[f];
        any = true;
      }
    }
    if (!any) continue;
    if (lockData.themes[slug]) continue; // lockfile wins if it already has an entry
    // For a local-path theme, record the path as the source; otherwise
    // assume remote (the default for the base layer).
    const source = entry.path || defaultSource || 'remote';
    lockData.themes[slug] = { ...hoisted, source };
  }
}

function saveBaseConfig(baseFile, baseData) {
  if (!baseFile) throw new Error('saveBaseConfig: baseFile is required');
  const clean = stripInternalFields(baseData);
  writeFile(baseFile, JSON.stringify(clean, null, 2) + '\n');
}

function saveLocalConfig(localFile, localData) {
  if (!localFile) throw new Error('saveLocalConfig: localFile is required');
  // Don't write empty .pureadmin.json — if a developer cleared all their
  // overrides, just delete the file (or skip the write). Skipping is safer.
  const clean = stripInternalFields(localData);
  if (isEmptyConfig(clean)) {
    // No-op if the file doesn't exist; if it does, leave it alone (the
    // developer can delete it themselves if they want).
    return;
  }
  writeFile(localFile, JSON.stringify(clean, null, 2) + '\n');
}

function saveLockData(lockFile, lockData) {
  if (!lockFile) throw new Error('saveLockData: lockFile is required');
  const clean = stripInternalFields(lockData);
  // Always carry the format version so future readers can detect schema bumps.
  if (clean._format == null) clean._format = LOCKFILE_FORMAT;
  // Order keys for stable diffs (themes sorted alphabetically by slug).
  if (clean.themes && typeof clean.themes === 'object') {
    const ordered = {};
    for (const slug of Object.keys(clean.themes).sort()) ordered[slug] = clean.themes[slug];
    clean.themes = ordered;
  }
  writeFile(lockFile, JSON.stringify(clean, null, 2) + '\n');
}

function stripInternalFields(data) {
  const clean = { ...data };
  delete clean._configPath;
  return clean;
}

function isEmptyConfig(data) {
  if (!data || typeof data !== 'object') return true;
  const keys = Object.keys(data);
  if (keys.length === 0) return true;
  // Treat `{ themes: {} }` as empty too.
  if (keys.length === 1 && keys[0] === 'themes' && Object.keys(data.themes || {}).length === 0) return true;
  return false;
}

// Initialize config and BASE_URL at load time
const config = loadConfig();

/**
 * Resolve a server target to { url, apiKey }.
 *
 * The --server flag (or resolved default) can be:
 *   - A target name ("production", "local") → looked up in config.targets
 *   - A raw URL ("http://localhost:8888") → used directly, apiKey from
 *     the matching target (if any) or top-level config.apiKey
 *
 * Resolution order:
 *   1. --server flag / PUREADMIN_URL env var
 *   2. config.defaultTarget → config.targets[name]
 *   3. Fallback: { url: "https://pureadmin.io", apiKey: null }
 *
 * Config format:
 *   {
 *     "defaultTarget": "production",
 *     "targets": {
 *       "production": { "url": "https://pureadmin.io", "apiKey": "..." },
 *       "local":      { "url": "http://localhost:8888", "apiKey": "dev-upload-key" }
 *     }
 *   }
 *
 * Backward compat: if no targets block, falls back to config.url + config.apiKey.
 */
function resolveTarget(serverFlag) {
  const targets = config.targets || {};

  // Helper: find target by name or by matching URL
  function findByName(name) {
    return targets[name] || null;
  }
  function findByUrl(url) {
    for (const [, t] of Object.entries(targets)) {
      if (t.url && t.url.replace(/\/+$/, '') === url.replace(/\/+$/, '')) return t;
    }
    return null;
  }

  // 1. Explicit --server or PUREADMIN_URL
  const explicit = serverFlag || process.env.PUREADMIN_URL;
  if (explicit) {
    // Could be a target name or a raw URL. Distinguish by shape — a URL has
    // a scheme (e.g. "http://..."), a name doesn't. This prevents unknown
    // names from being silently treated as URLs (e.g. `--server development`
    // with no "development" target would pass "development" through as a URL
    // and fail with cryptic errors at upload time).
    const looksLikeUrl = /:\/\//.test(explicit);
    const byName = findByName(explicit);

    if (byName) {
      return { url: byName.url.replace(/\/+$/, ''), apiKey: byName.apiKey || null, source: `target "${explicit}"` };
    }

    if (!looksLikeUrl) {
      const available = Object.keys(targets);
      const hint = available.length > 0
        ? `Available targets: ${available.join(', ')}`
        : 'No targets defined in config (add a targets block to .pureadmin.json or pureadmin.json).';
      throw new Error(`Unknown server target "${explicit}". ${hint}`);
    }

    // Raw URL — find matching target for its apiKey
    const url = explicit.replace(/\/+$/, '');
    const match = findByUrl(url);
    return { url, apiKey: match?.apiKey || null, source: '--server' };
  }

  // 2. defaultTarget — must resolve if set (don't silently fall through to
  // the pureadmin.io fallback when the config author misspells the name).
  if (config.defaultTarget) {
    const t = targets[config.defaultTarget];
    if (!t) {
      const available = Object.keys(targets);
      const hint = available.length > 0
        ? `Available targets: ${available.join(', ')}`
        : 'No targets defined.';
      throw new Error(`config.defaultTarget = "${config.defaultTarget}" but no such target. ${hint}`);
    }
    return { url: t.url.replace(/\/+$/, ''), apiKey: t.apiKey || null, source: `target "${config.defaultTarget}"` };
  }

  // 3. Legacy: config.url + config.apiKey (backward compat)
  if (config.url) {
    return { url: config.url.replace(/\/+$/, ''), apiKey: config.apiKey || null, source: config._configPath || 'config' };
  }

  // 4. Fallback
  return { url: 'https://pureadmin.io', apiKey: process.env.PUREADMIN_API_KEY || null, source: 'default' };
}

module.exports = {
  TOOL_VERSION,
  TOOL_NAME,
  LOCKFILE_FORMAT,
  config,
  tryLoadJson,
  loadConfig,
  findProjectConfig,
  loadProjectConfig,
  saveBaseConfig,
  saveLocalConfig,
  saveLockData,
  resolveTarget,
};
