// ---------------------------------------------------------------------------
// themes subcommand router + project-side commands (list/add/update/install/ci)
// ---------------------------------------------------------------------------
//
// This file owns the reading and writing of the three project config files
// (pureadmin.json, .pureadmin.json, pureadmin.lock.json). See config.js for
// the layered model.
//
// Verb model (mirrors npm):
//   - themes install — like `npm install`. Lock present → install from lock.
//                      Lock missing or some declared theme not in lock → resolve
//                      from declarations against the API (filtered by the
//                      project's pure-admin-core version), download, write
//                      pureadmin.lock.json.
//   - themes update  — like `npm update`. Bumps every declared theme to the
//                      latest version compatible with the project's pure-admin-
//                      core, re-downloads changed ones, rewrites the lockfile.
//   - themes ci      — like `npm ci`. Lockfile must exist and exactly cover
//                      every declared theme. Writes nothing. Fails fast if
//                      declarations and lock are out of sync. CI use.
//
// All three honor the project's pure-admin-core version (detected from
// package.json / assets/package.json) and pass it as ?core_version=X to the
// API so themes resolve to versions the project's CSS framework supports.
//
// Save routing rules:
//   - themes install / update                → writes pureadmin.lock.json only.
//   - themes ci                              → writes nothing.
//   - themes add <id> [<id>…]                → writes baseData (team-shared).
//   - themes add <id> --path <dir>           → writes localData (per-developer
//                                              override) by default. With
//                                              --shared, writes baseData.
//
// pureadmin.json is never auto-modified except by explicit add / remove.
// That's the entire point of the lockfile split.

const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green, yellow, red } = require('../helpers/formatting');
const {
  loadProjectConfig,
  saveBaseConfig,
  saveLocalConfig,
  saveLockData,
} = require('../config');
const { fetchJson, downloadFile } = require('../http');
const { extractZip, mkdir, removeFile, removeDir, copyDirSync } = require('../helpers/files');
const { detectCoreVersion } = require('../helpers/core-version');
const { cmdList, cmdInfo, cmdVersions, cmdSearch, cmdCompatible, cmdDownload } = require('./browse');
const { cmdInit } = require('./init');
const { cmdBuild } = require('./theme-build');
const { cmdPack } = require('./theme-pack');
const { cmdPublish } = require('./theme-publish');
const { cmdValidate } = require('./theme-validate');
const { cmdLint } = require('./theme-lint');

async function cmdThemesRouter(subArgs, opts, usage) {
  const sub = subArgs[0];
  const rest = subArgs.slice(1);

  // No args → hint
  if (!sub || sub === 'help') {
    const { formatCommandHelp, formatSubcommandHelp, commands: cmdDefs } = require('../commands');
    if (rest[0] && cmdDefs.themes.subcommands?.[rest[0]]) {
      console.log(formatSubcommandHelp('themes', rest[0], cmdDefs.themes.subcommands[rest[0]]));
    } else {
      console.log(formatCommandHelp('themes', cmdDefs.themes));
    }
    return;
  }
  // list: --local shows project themes, otherwise API
  if (sub === 'list') {
    if (opts.local) return await cmdThemesLocal();
    return await cmdList();
  }
  if (sub === 'add') return await cmdThemesAdd(rest, opts);
  if (sub === 'show') return await cmdInfo(rest[0], usage);
  if (sub === 'versions') return await cmdVersions(rest[0], usage);
  if (sub === 'search') return await cmdSearch(rest.join(' '), usage);
  if (sub === 'compatible') return await cmdCompatible(rest[0], usage);
  if (sub === 'download') return await cmdDownload(rest[0], opts, usage);
  if (sub === 'init') return await cmdInit(rest[0], rest.slice(1).join(' ') || undefined, usage);
  // Install/update/ci return { failed, ... } — the router converts a non-zero
  // failure count into a process exit so CI scripts (and the Makefile) get
  // the right exit code. Internal callers (like `pureadmin create`) bypass
  // the router and inspect the return value themselves.
  if (sub === 'update') {
    const r = await cmdUpdate();
    if (r && r.failed > 0) process.exit(1);
    return r;
  }
  if (sub === 'install') {
    const r = await cmdInstall();
    if (r && r.failed > 0) process.exit(1);
    return r;
  }
  if (sub === 'ci') {
    const r = await cmdCi();
    if (r && r.failed > 0) process.exit(1);
    return r;
  }
  if (sub === 'build') return await cmdBuild(rest);
  if (sub === 'pack') return await cmdPack(rest, opts);
  if (sub === 'publish') return await cmdPublish(rest, opts);
  if (sub === 'validate') return await cmdValidate(rest);
  if (sub === 'lint') return await cmdLint(rest);

  // Legacy: bare slugs → treat as add
  return await cmdThemesAdd(subArgs, opts);
}

// ---------------------------------------------------------------------------
// themes list --local
// ---------------------------------------------------------------------------
async function cmdThemesLocal() {
  const proj = loadProjectConfig();
  const slugs = Object.keys(proj.themes);
  const themesDir = proj.data.themesDir || 'static/themes';

  if (slugs.length === 0) {
    console.log(`\n  No themes configured. Add one with: ${bold('pureadmin themes add <id>')}\n`);
    return;
  }

  console.log(bold(`\n  ${slugs.length} theme(s) configured`) + dim(` (${proj.baseFile})\n`));
  console.log(`  ${dim('themes dir:')} ${themesDir}\n`);

  for (const slug of slugs.sort()) {
    const info = proj.themes[slug];
    const ver = info.version ? dim(`v${info.version}`) : dim('unknown');
    // Mode shows source plus which layer declared it. `path` wins over remote;
    // local-layer overrides are flagged with "(local override)" so the dev
    // can see which themes are personal vs team-shared.
    let mode;
    if (info.path) {
      const layerTag = info._layers.local && !info._layers.base
        ? dim(' (local override)')
        : info._layers.local
          ? dim(' (local override)')
          : '';
      mode = cyan(`local: ${info.path}`) + layerTag;
    } else if (info.offline) {
      mode = yellow('offline');
    } else {
      mode = dim('online');
    }
    const themeDir = path.join(proj.projectRoot, themesDir, slug);
    const exists = fs.existsSync(themeDir) ? green('installed') : yellow('not installed');
    const lockTag = info._layers.lock ? '' : ' ' + yellow('(no lock)');
    console.log(`  ${cyan(slug.padEnd(20))} ${ver}  ${mode}  ${exists}${lockTag}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// themes add
// ---------------------------------------------------------------------------
async function cmdThemesAdd(slugs, opts) {
  // --path mode: register a local theme directory instead of fetching from API.
  // Slug is read from <path>/theme.json's `id`. If a slug arg is also passed,
  // it's validated against the manifest. More than one slug arg is rejected
  // because --path only describes a single theme directory.
  if (opts.path) {
    if (slugs.length > 1) {
      console.error(`\n  ${red('Error:')} --path takes at most one slug arg (got ${slugs.length}). The slug is derived from theme.json.\n`);
      return;
    }
    return await addLocalTheme(opts.path, slugs[0], opts);
  }

  if (slugs.length === 0) {
    console.error(`\n  Usage: ${bold('pureadmin themes add <id> [id...]')}\n  Or, for a local directory: ${bold('pureadmin themes add --path <dir>')}\n`);
    return;
  }

  const proj = loadProjectConfig();
  const offline = opts.offline || false;
  const themesDir = opts.dir || proj.data.themesDir || 'static/themes';
  const coreInfo = detectAndAnnounceCoreVersion(proj.projectRoot);

  // Ensure base file has the themesDir + themes object initialized.
  proj.baseData.themesDir = themesDir;
  proj.baseData.themes = proj.baseData.themes || {};
  proj.lockData.themes = proj.lockData.themes || {};

  for (const slug of slugs) {
    console.log();

    // Fetch theme info from server (filtered by core version when known).
    process.stdout.write(`  ${slug}: fetching info... `);
    let themeInfo;
    try {
      const url = `/api/themes/${encodeURIComponent(slug)}` + buildCoreVersionQuery(coreInfo.version);
      const result = await fetchJson(url);
      themeInfo = result.theme;
      console.log(green(`${themeInfo.name} v${themeInfo.latest}`));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      continue;
    }

    // Download ZIP
    const themeDir = path.join(proj.projectRoot, themesDir, slug);
    const zipPath = path.join(proj.projectRoot, themesDir, `${slug}.zip`);

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      mkdir(path.join(proj.projectRoot, themesDir));
      await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download`, zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      continue;
    }

    // Extract
    process.stdout.write(`  ${slug}: extracting to ${themesDir}/${slug}/... `);
    try {
      extractZip(zipPath, themeDir);
      removeFile(zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      continue;
    }

    // Declarations → base file (offline is a team-wide statement of how the
    // theme should be installed). Resolution → lockfile.
    proj.baseData.themes[slug] = offline ? { offline: true } : {};
    proj.lockData.themes[slug] = {
      version: themeInfo.latest,
      content_sha: themeInfo.content_sha || null,
      fetched_at: new Date().toISOString(),
      source: 'remote',
    };

    console.log(`  ${slug}: ${offline ? yellow('offline') : dim('online')} — ${dim(`saved to ${proj.baseFile}`)}`);
  }

  saveBaseConfig(proj.baseFile, proj.baseData);
  saveLockData(proj.lockFile, proj.lockData);
  console.log();
}

// Register a theme from a local directory.
//
// By default the path goes into .pureadmin.json (per-developer override) —
// this matches the common case where one developer is reworking a theme that
// the rest of the team consumes from the API. With --shared, the path is
// written into pureadmin.json instead (rare; for teams that genuinely co-
// locate a theme alongside the project source).
async function addLocalTheme(srcPath, expectedSlug, opts) {
  const proj = loadProjectConfig();
  const themesDir = opts.dir || proj.data.themesDir || 'static/themes';

  const targetIsShared = !!opts.shared;
  const targetData = targetIsShared ? proj.baseData : proj.localData;
  const targetFile = targetIsShared ? proj.baseFile : proj.localFile;
  const targetSaveFn = targetIsShared ? saveBaseConfig : saveLocalConfig;

  // themesDir is a team-wide setting; always set on baseData if missing.
  proj.baseData.themesDir = proj.baseData.themesDir || themesDir;
  targetData.themes = targetData.themes || {};
  proj.lockData.themes = proj.lockData.themes || {};

  const absPath = path.isAbsolute(srcPath) ? srcPath : path.resolve(proj.projectRoot, srcPath);

  if (!fs.existsSync(absPath)) {
    console.error(`\n  ${red('Error:')} Path does not exist: ${absPath}\n`);
    return;
  }
  const manifestPath = path.join(absPath, 'theme.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`\n  ${red('Error:')} No theme.json found at ${absPath}\n`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    console.error(`\n  ${red('Error:')} Invalid theme.json at ${absPath}: ${err.message}\n`);
    return;
  }

  const slug = manifest.id || manifest.slug;
  if (!slug) {
    console.error(`\n  ${red('Error:')} theme.json at ${absPath} has no "id" field\n`);
    return;
  }
  if (expectedSlug && expectedSlug !== slug) {
    console.error(`\n  ${red('Error:')} Slug mismatch — arg was "${expectedSlug}" but theme.json id is "${slug}". Drop the slug arg or fix the manifest.\n`);
    return;
  }

  const themeDir = path.join(proj.projectRoot, themesDir, slug);

  console.log();
  console.log(`  ${slug}: ${green(manifest.name || slug)} v${manifest.version || '?'} ${dim(`(local: ${srcPath})`)}`);

  process.stdout.write(`  ${slug}: copying to ${themesDir}/${slug}/... `);
  try {
    mkdir(path.join(proj.projectRoot, themesDir));
    if (fs.existsSync(themeDir)) removeDir(themeDir);
    copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
    console.log(green('done'));
  } catch (err) {
    console.log(red(`failed: ${err.message}`));
    return;
  }

  // Declaration: only the path goes into the targeted layer. `offline` (if
  // the user passed it) is a team-shared decision so it lives in baseData.
  targetData.themes[slug] = { path: srcPath };
  if (opts.offline) {
    proj.baseData.themes = proj.baseData.themes || {};
    proj.baseData.themes[slug] = { ...(proj.baseData.themes[slug] || {}), offline: true };
  }
  // Resolution: the lockfile records the resolved version + source path so
  // `themes ci` can reproduce this developer's working copy on machines where
  // the path exists. (For machines where it doesn't exist, ci will fail
  // loudly with a hint to remove the local override.)
  proj.lockData.themes[slug] = {
    version: manifest.version || null,
    content_sha: null,
    fetched_at: new Date().toISOString(),
    source: srcPath,
  };

  console.log(`  ${slug}: ${cyan('local')} — ${dim(`saved to ${targetFile}`)}`);
  if (opts.offline) saveBaseConfig(proj.baseFile, proj.baseData);
  targetSaveFn(targetFile, targetData);
  saveLockData(proj.lockFile, proj.lockData);
  console.log();
}

// ---------------------------------------------------------------------------
// Shared helpers for resolve + download + lock
// ---------------------------------------------------------------------------

// Detect once per command and announce so users see what's filtering the
// resolution. Returns { version, source, reason } from the detector, never
// throws.
function detectAndAnnounceCoreVersion(projectRoot) {
  const info = detectCoreVersion(projectRoot);
  if (info.version) {
    console.log(dim(`  pure-admin-core: v${info.version} (${info.source})`));
  } else {
    console.log(yellow('  pure-admin-core: ') + dim(`not detected — themes will resolve to absolute latest (${info.reason})`));
  }
  return info;
}

function buildCoreVersionQuery(coreVersion) {
  return coreVersion ? `?core_version=${encodeURIComponent(coreVersion)}` : '';
}

// Resolve a remote theme: hit the API, return { version, content_sha } or
// throw. Filters by core_version when provided so the API gives us back a
// theme version compatible with this project's pure-admin-core.
async function resolveRemoteTheme(slug, coreVersion) {
  const url = `/api/themes/${encodeURIComponent(slug)}` + buildCoreVersionQuery(coreVersion);
  const result = await fetchJson(url);
  if (!result || !result.theme) throw new Error(`API returned no theme entry for ${slug}`);
  return {
    version: result.theme.latest,
    content_sha: result.theme.content_sha || null,
  };
}

// Download + extract a remote theme at a specific version. Used by both the
// "lock-driven" and "fresh-resolve" paths.
async function downloadAndExtract(slug, version, projectRoot, themesDir) {
  const themeDir = path.join(projectRoot, themesDir, slug);
  const zipPath = path.join(projectRoot, themesDir, `${slug}.zip`);
  mkdir(path.join(projectRoot, themesDir));
  const versionParam = version ? `?version=${encodeURIComponent(version)}` : '';
  await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download${versionParam}`, zipPath);
  if (fs.existsSync(themeDir)) removeDir(themeDir);
  extractZip(zipPath, themeDir);
  removeFile(zipPath);
}

// Re-snapshot a local-path theme. Used by both update (refresh) and install
// (when a local-path entry has no lock yet). Returns the version read from
// the source theme.json (or the previous version when no manifest is found).
function reSnapshotLocalTheme(slug, srcPath, projectRoot, themesDir, previousVersion) {
  const absPath = path.isAbsolute(srcPath) ? srcPath : path.resolve(projectRoot, srcPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`path does not exist (${absPath})`);
  }
  let manifest = {};
  const manifestPath = path.join(absPath, 'theme.json');
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {}
  }
  const themeDir = path.join(projectRoot, themesDir, slug);
  mkdir(path.join(projectRoot, themesDir));
  if (fs.existsSync(themeDir)) removeDir(themeDir);
  copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
  return manifest.version || previousVersion || null;
}

// ---------------------------------------------------------------------------
// themes update — DEV use case ("I want fresh versions")
// ---------------------------------------------------------------------------
//
// For each declared theme:
//   - If `path` is set (local source): re-snapshot from disk; record the
//     manifest version into the lockfile.
//   - Otherwise (remote): fetch the latest version compatible with this
//     project's pure-admin-core. If content_sha differs from lockfile,
//     re-download. If unchanged, no-op.
//
// Writes ONLY to pureadmin.lock.json. pureadmin.json and .pureadmin.json are
// never touched.
async function cmdUpdate() {
  const proj = loadProjectConfig();
  const slugs = Object.keys(proj.themes);
  const themesDir = proj.data.themesDir || 'static/themes';

  if (slugs.length === 0) {
    console.log(`\n  No themes configured. Add one with: pureadmin themes add <slug>\n`);
    return;
  }

  console.log(bold(`\n  Checking ${slugs.length} theme(s) for updates...\n`));
  const coreInfo = detectAndAnnounceCoreVersion(proj.projectRoot);
  console.log();

  proj.lockData.themes = proj.lockData.themes || {};
  let updated = 0, unchanged = 0, failed = 0;

  for (const slug of slugs) {
    const info = proj.themes[slug];

    // Local-path themes: re-snapshot from the source directory.
    if (info.path) {
      process.stdout.write(`  ${slug}: re-copying from ${info.path}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, info.path, proj.projectRoot, themesDir, info.version);
        const previousVersion = info.version || null;
        const versionLabel = previousVersion && newVersion && previousVersion !== newVersion
          ? `v${previousVersion} → v${newVersion}`
          : `v${newVersion || '?'}`;
        console.log(green('done') + ` ${dim(versionLabel)}`);
        proj.lockData.themes[slug] = {
          version: newVersion,
          content_sha: null,
          fetched_at: new Date().toISOString(),
          source: info.path,
        };
        updated++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Remote themes: hit the API (filtered by core version).
    process.stdout.write(`  ${slug}: checking... `);
    let resolved;
    try {
      resolved = await resolveRemoteTheme(slug, coreInfo.version);
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    // Compare content_sha against the lockfile entry.
    if (info.content_sha && resolved.content_sha === info.content_sha) {
      console.log(dim(`v${resolved.version} — unchanged`));
      unchanged++;
      continue;
    }

    // Changed (or new) — re-download.
    const versionChange = info.version && info.version !== resolved.version
      ? `v${info.version} → v${resolved.version}`
      : `v${resolved.version}`;
    console.log(yellow(versionChange));

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      await downloadAndExtract(slug, resolved.version, proj.projectRoot, themesDir);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    proj.lockData.themes[slug] = {
      version: resolved.version,
      content_sha: resolved.content_sha,
      fetched_at: new Date().toISOString(),
      source: 'remote',
    };
    updated++;
  }

  // Prune lockfile entries for themes that have been removed from declarations.
  for (const lockedSlug of Object.keys(proj.lockData.themes)) {
    if (!proj.themes[lockedSlug] || !(proj.themes[lockedSlug]._layers.base || proj.themes[lockedSlug]._layers.local)) {
      delete proj.lockData.themes[lockedSlug];
    }
  }

  saveLockData(proj.lockFile, proj.lockData);

  console.log();
  console.log(bold('  Summary:') + ` ${green(`${updated} updated`)}, ${dim(`${unchanged} unchanged`)}, ${failed > 0 ? red(`${failed} failed`) : dim(`${failed} failed`)}`);
  console.log(dim(`  Lockfile: ${proj.lockFile}`));
  console.log();

  return { updated, unchanged, failed };
}

// ---------------------------------------------------------------------------
// themes install — default DEV/setup use case ("get the project running")
// ---------------------------------------------------------------------------
//
// Like `npm install`: declarations are the source of truth for *which* themes
// to install; the lockfile is consulted to pin *what version* of each. If a
// declared theme has a lockfile entry, we download exactly that version. If
// not, we resolve fresh against the API (filtered by core version) and write
// a new lockfile entry. Either way the project ends up install-ready.
//
// Writes pureadmin.lock.json (when anything had to be resolved fresh, or when
// a stale entry was pruned).
async function cmdInstall() {
  const proj = loadProjectConfig();
  const declaredSlugs = Object.keys(proj.themes).filter(s =>
    proj.themes[s]._layers.base || proj.themes[s]._layers.local
  );
  const themesDir = proj.data.themesDir || 'static/themes';

  if (declaredSlugs.length === 0) {
    console.log(`\n  No themes declared. Add one with: ${bold('pureadmin themes add <slug>')}\n`);
    return;
  }

  console.log(bold(`\n  Installing ${declaredSlugs.length} theme(s)...\n`));
  // Detect core version up front but only announce when at least one theme
  // actually needs fresh resolution (otherwise the message is noise on a
  // pure lockfile-replay run).
  let coreInfo = null;
  let coreAnnounced = false;
  function ensureCoreInfo() {
    if (coreInfo) return coreInfo;
    coreInfo = detectCoreVersion(proj.projectRoot);
    if (!coreAnnounced) {
      if (coreInfo.version) {
        console.log(dim(`  pure-admin-core: v${coreInfo.version} (${coreInfo.source})\n`));
      } else {
        console.log(yellow('  pure-admin-core: ') + dim(`not detected — fresh themes will resolve to absolute latest (${coreInfo.reason})\n`));
      }
      coreAnnounced = true;
    }
    return coreInfo;
  }

  proj.lockData.themes = proj.lockData.themes || {};
  let installed = 0, resolved = 0, failed = 0;

  for (const slug of declaredSlugs.sort()) {
    const info = proj.themes[slug];
    const themeDir = path.join(proj.projectRoot, themesDir, slug);
    const hasLock = !!info._layers.lock;

    // Local-path themes — always re-copy from disk. Lock entry is updated
    // on first install (no lock) but otherwise only verified against the
    // current path declaration.
    if (info.path) {
      process.stdout.write(`  ${slug}: copying from ${info.path}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, info.path, proj.projectRoot, themesDir, info.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || '?'))}`);
        if (!hasLock) {
          proj.lockData.themes[slug] = {
            version: newVersion,
            content_sha: null,
            fetched_at: new Date().toISOString(),
            source: info.path,
          };
          resolved++;
        }
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        if (info.path) {
          console.error(`    ${dim('Hint: this theme is locally-pathed; ensure the path exists or remove the override from .pureadmin.json.')}`);
        }
        failed++;
      }
      continue;
    }

    // Remote theme with a lockfile entry — fetch that exact version. No API
    // round-trip beyond the download itself.
    if (hasLock && info.version) {
      process.stdout.write(`  ${slug}: downloading v${info.version}... `);
      try {
        await downloadAndExtract(slug, info.version, proj.projectRoot, themesDir);
        console.log(green('done'));
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Remote theme with no lock entry (or lock entry without a version) —
    // resolve fresh against the API filtered by core version, write a new
    // lockfile entry.
    const core = ensureCoreInfo();
    process.stdout.write(`  ${slug}: resolving... `);
    let resolution;
    try {
      resolution = await resolveRemoteTheme(slug, core.version);
    } catch (err) {
      console.log(red(`failed: ${err.message}`));
      failed++;
      continue;
    }
    console.log(green(`v${resolution.version}`));

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      await downloadAndExtract(slug, resolution.version, proj.projectRoot, themesDir);
      console.log(green('done'));
    } catch (err) {
      console.log(red(`failed: ${err.message}`));
      failed++;
      continue;
    }

    proj.lockData.themes[slug] = {
      version: resolution.version,
      content_sha: resolution.content_sha,
      fetched_at: new Date().toISOString(),
      source: 'remote',
    };
    installed++;
    resolved++;
  }

  // Prune stale lockfile entries (themes no longer declared).
  let prunedCount = 0;
  for (const lockedSlug of Object.keys(proj.lockData.themes)) {
    if (!proj.themes[lockedSlug] || !(proj.themes[lockedSlug]._layers.base || proj.themes[lockedSlug]._layers.local)) {
      delete proj.lockData.themes[lockedSlug];
      prunedCount++;
    }
  }

  if (resolved > 0 || prunedCount > 0) {
    saveLockData(proj.lockFile, proj.lockData);
  }

  console.log();
  const summary = [`${green(`${installed} installed`)}`];
  if (resolved > 0) summary.push(`${dim(`${resolved} resolved fresh`)}`);
  if (prunedCount > 0) summary.push(`${dim(`${prunedCount} pruned from lock`)}`);
  if (failed > 0) summary.push(`${red(`${failed} failed`)}`);
  console.log(bold('  Summary:') + ' ' + summary.join(', '));
  if (resolved > 0 || prunedCount > 0) {
    console.log(dim(`  Lockfile updated: ${proj.lockFile}`));
  }
  console.log();

  return { installed, resolved, failed };
}

// ---------------------------------------------------------------------------
// themes ci — CI use case ("just give me what's recorded")
// ---------------------------------------------------------------------------
//
// Like `npm ci`: lockfile is the source of truth. Fails fast (before doing
// any work) if any declared theme is missing from the lockfile, or if any
// lock entry references a path that doesn't exist on this machine. Writes
// nothing.
async function cmdCi() {
  const proj = loadProjectConfig();
  const declaredSlugs = Object.keys(proj.themes).filter(s =>
    proj.themes[s]._layers.base || proj.themes[s]._layers.local
  );
  const themesDir = proj.data.themesDir || 'static/themes';

  if (declaredSlugs.length === 0) {
    console.log(`\n  No themes declared. Add one with: ${bold('pureadmin themes add <slug>')}\n`);
    return;
  }

  // Validate: every declared theme must be in the lockfile.
  const missingFromLock = declaredSlugs.filter(s => !proj.themes[s]._layers.lock);
  if (missingFromLock.length > 0) {
    console.error(`\n  ${red('Error:')} The following theme(s) are declared in pureadmin.json but missing from the lockfile:\n`);
    for (const s of missingFromLock) console.error(`    - ${s}`);
    console.error(`\n  Run ${bold('pureadmin themes install')} to resolve and lock them, then commit the lockfile.\n`);
    process.exit(1);
  }

  console.log(bold(`\n  Installing ${declaredSlugs.length} theme(s) from lockfile (CI mode)...\n`));
  console.log(dim(`  Lockfile: ${proj.lockFile}\n`));

  let installed = 0, failed = 0;

  for (const slug of declaredSlugs.sort()) {
    const info = proj.themes[slug];

    // Local-path themes: re-copy from the recorded path. Refuse to invent a
    // different source — ci must reproduce what install/update wrote.
    if (info.path) {
      process.stdout.write(`  ${slug}: copying from ${info.path}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, info.path, proj.projectRoot, themesDir, info.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || info.version || '?'))}`);
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        console.error(`    ${dim('Hint: this theme was locked from a personal .pureadmin.json path that this machine does not have.')}`);
        failed++;
      }
      continue;
    }

    // Remote themes: fetch the locked version specifically.
    process.stdout.write(`  ${slug}: downloading v${info.version}... `);
    try {
      await downloadAndExtract(slug, info.version, proj.projectRoot, themesDir);
      console.log(green('done'));
      installed++;
    } catch (err) {
      console.log(red(`failed: ${err.message}`));
      failed++;
    }
  }

  console.log();
  console.log(bold('  Summary:') + ` ${green(`${installed} installed`)}, ${failed > 0 ? red(`${failed} failed`) : dim(`${failed} failed`)}`);
  console.log();

  return { installed, failed };
}

module.exports = { cmdThemesRouter, cmdThemesLocal, cmdThemesAdd, cmdUpdate, cmdInstall, cmdCi };
