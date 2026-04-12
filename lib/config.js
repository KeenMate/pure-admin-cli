// ---------------------------------------------------------------------------
// Config: pureadmin.json + .pureadmin.json -> env var -> default
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

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
      Object.assign(config, data);
      config._configPath = path.join(home, '.pureadmin.json');
    }
  }

  // 2. Project-level (walks up from cwd)
  //    pureadmin.json  — base config (checked in)
  //    .pureadmin.json — local overrides merged on top (gitignored, secrets)
  let dir = process.cwd();
  while (true) {
    const base = tryLoadJson(path.join(dir, 'pureadmin.json'));
    const local = tryLoadJson(path.join(dir, '.pureadmin.json'));
    if (base || local) {
      if (base) {
        Object.assign(config, base);
        config._configPath = path.join(dir, 'pureadmin.json');
      }
      if (local) {
        Object.assign(config, local);
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
// Project config helpers
// ---------------------------------------------------------------------------
function findProjectConfig() {
  // Find the nearest pureadmin.json from cwd (not home — project only)
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

function loadProjectConfig() {
  const configPath = findProjectConfig();
  if (configPath) {
    try {
      return { path: configPath, data: JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    } catch {}
  }
  return { path: path.join(process.cwd(), 'pureadmin.json'), data: {} };
}

function saveProjectConfig(configPath, data) {
  // Don't persist internal fields
  const clean = { ...data };
  delete clean._configPath;
  fs.writeFileSync(configPath, JSON.stringify(clean, null, 2) + '\n');
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
    // Could be a target name or a raw URL
    const byName = findByName(explicit);
    if (byName) {
      return { url: byName.url.replace(/\/+$/, ''), apiKey: byName.apiKey || null, source: `target "${explicit}"` };
    }
    // Raw URL — find matching target for its apiKey
    const url = explicit.replace(/\/+$/, '');
    const match = findByUrl(url);
    return { url, apiKey: match?.apiKey || null, source: '--server' };
  }

  // 2. defaultTarget
  if (config.defaultTarget && targets[config.defaultTarget]) {
    const t = targets[config.defaultTarget];
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
  config,
  tryLoadJson,
  loadConfig,
  findProjectConfig,
  loadProjectConfig,
  saveProjectConfig,
  resolveTarget,
};
