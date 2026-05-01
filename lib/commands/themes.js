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
//
// IMPORTANT: writes to .pureadmin.json never touch pureadmin.lock.json. A
// per-developer override is a runtime overlay only — the lockfile mirrors
// pureadmin.json exclusively, and CI/Docker (which never see .pureadmin.json)
// must be able to reproduce a build from pureadmin.json + lock alone. Lock
// entries are written here only when --shared puts the declaration into
// pureadmin.json itself.
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

  // Lock write: only when --shared (declaration goes into pureadmin.json).
  // Personal overrides never touch the lock — that's the whole invariant.
  if (targetIsShared) {
    proj.lockData.themes[slug] = {
      version: manifest.version || null,
      content_sha: null,
      fetched_at: new Date().toISOString(),
      source: srcPath,
    };
  }

  console.log(`  ${slug}: ${cyan('local')} — ${dim(`saved to ${targetFile}`)}`);
  if (!targetIsShared) {
    console.log(`  ${dim('Personal override — pureadmin.lock.json unchanged. Other devs / CI will install this theme from the registry per pureadmin.json.')}`);
  }
  if (opts.offline) saveBaseConfig(proj.baseFile, proj.baseData);
  targetSaveFn(targetFile, targetData);
  if (targetIsShared) saveLockData(proj.lockFile, proj.lockData);
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
// Iterates pureadmin.json declarations only — .pureadmin.json overrides are
// runtime overlays and never influence the lockfile. For each base-declared
// theme:
//
//   - If baseEntry.path (team-shared local theme): re-read the source's
//     theme.json, update the lock with that version + base path. If a
//     personal .pureadmin.json override is active, the disk content stays
//     as the developer's override (the lock still describes the team path).
//   - Otherwise (registry): fetch latest version compatible with the project's
//     pure-admin-core. Update the lock. If a personal override is active,
//     skip the disk re-download (keep the override files on disk); otherwise
//     re-download when content_sha changed.
//
// Writes ONLY to pureadmin.lock.json. pureadmin.json and .pureadmin.json are
// never touched.
async function cmdUpdate() {
  const proj = loadProjectConfig();
  const baseThemes = (proj.baseData && proj.baseData.themes) || {};
  const localThemes = (proj.localData && proj.localData.themes) || {};
  const baseSlugs = Object.keys(baseThemes);
  const themesDir = proj.data.themesDir || 'static/themes';

  if (baseSlugs.length === 0) {
    // .pureadmin.json-only themes are intentionally not updatable — they're
    // personal overlays. Direct the user at `themes add` for the shared case.
    const localOnly = Object.keys(localThemes).filter(s => !baseThemes[s]);
    if (localOnly.length > 0) {
      console.log(`\n  No themes declared in pureadmin.json. ${localOnly.length} personal override(s) in .pureadmin.json are not updated by this command (re-snapshot via ${bold('pureadmin themes install')} instead).\n`);
    } else {
      console.log(`\n  No themes configured. Add one with: pureadmin themes add <slug>\n`);
    }
    return;
  }

  console.log(bold(`\n  Checking ${baseSlugs.length} theme(s) for updates...\n`));
  const coreInfo = detectAndAnnounceCoreVersion(proj.projectRoot);
  console.log();

  proj.lockData.themes = proj.lockData.themes || {};
  let updated = 0, unchanged = 0, failed = 0;

  for (const slug of baseSlugs) {
    const baseEntry = baseThemes[slug];
    const lockEntry = proj.lockData.themes[slug];
    const overridePath = localThemes[slug] && localThemes[slug].path;

    // Team-shared local theme.
    if (baseEntry.path) {
      process.stdout.write(`  ${slug}: re-reading manifest at ${baseEntry.path}... `);
      try {
        const previousVersion = lockEntry?.version || null;
        let manifestVersion = previousVersion;
        const absPath = path.isAbsolute(baseEntry.path) ? baseEntry.path : path.resolve(proj.projectRoot, baseEntry.path);
        if (fs.existsSync(path.join(absPath, 'theme.json'))) {
          try {
            const m = JSON.parse(fs.readFileSync(path.join(absPath, 'theme.json'), 'utf-8'));
            if (m.version) manifestVersion = m.version;
          } catch {}
        }
        const versionLabel = previousVersion && manifestVersion && previousVersion !== manifestVersion
          ? `v${previousVersion} → v${manifestVersion}`
          : `v${manifestVersion || '?'}`;
        console.log(green('ok') + ` ${dim(versionLabel)}`);

        // Disk: re-snapshot from base path UNLESS the developer has an active
        // .pureadmin.json override (in which case their override files stay
        // on disk and the lock still describes the team's base path).
        if (!overridePath) {
          process.stdout.write(`  ${slug}: re-copying from ${baseEntry.path}... `);
          try {
            reSnapshotLocalTheme(slug, baseEntry.path, proj.projectRoot, themesDir, manifestVersion);
            console.log(green('done'));
          } catch (err) {
            console.log(red(`failed: ${err.message}`));
            failed++;
            continue;
          }
        } else {
          console.log(dim(`  ${slug}: skipping disk re-copy (.pureadmin.json override active for ${overridePath})`));
        }

        proj.lockData.themes[slug] = {
          version: manifestVersion,
          content_sha: null,
          fetched_at: new Date().toISOString(),
          source: baseEntry.path,
        };
        updated++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Registry theme: hit the API filtered by core version.
    process.stdout.write(`  ${slug}: checking... `);
    let resolved;
    try {
      resolved = await resolveRemoteTheme(slug, coreInfo.version);
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    // Compare content_sha against the lockfile entry. (Only meaningful when
    // the lock entry is registry-shaped; a leaked path-source entry never
    // matches the registry's content_sha so we'll fall through to the
    // download path and heal it.)
    const lockIsRegistry = lockEntry?.source === 'remote' && lockEntry?.version;
    if (lockIsRegistry && lockEntry.content_sha && resolved.content_sha === lockEntry.content_sha) {
      console.log(dim(`v${resolved.version} — unchanged`));
      unchanged++;
      continue;
    }

    const previousVersion = lockIsRegistry ? lockEntry.version : null;
    const versionChange = previousVersion && previousVersion !== resolved.version
      ? `v${previousVersion} → v${resolved.version}`
      : `v${resolved.version}`;
    console.log(yellow(versionChange));

    // Disk: re-download UNLESS the developer has an active .pureadmin.json
    // override.
    if (!overridePath) {
      process.stdout.write(`  ${slug}: downloading... `);
      try {
        await downloadAndExtract(slug, resolved.version, proj.projectRoot, themesDir);
        console.log(green('done'));
      } catch (err) {
        console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
        failed++;
        continue;
      }
    } else {
      console.log(dim(`  ${slug}: skipping disk download (.pureadmin.json override active for ${overridePath})`));
    }

    proj.lockData.themes[slug] = {
      version: resolved.version,
      content_sha: resolved.content_sha,
      fetched_at: new Date().toISOString(),
      source: 'remote',
    };
    updated++;
  }

  // Prune lock entries not in baseData. The lock mirrors pureadmin.json only.
  for (const lockedSlug of Object.keys(proj.lockData.themes)) {
    if (!Object.prototype.hasOwnProperty.call(baseThemes, lockedSlug)) {
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
// Like `npm install`. Two responsibilities, kept strictly separate:
//
//   (a) What to put on disk — uses the merged view (base ⊕ local). A path
//       declared in .pureadmin.json overrides the base declaration so the
//       developer sees their in-progress theme files.
//
//   (b) What to write to pureadmin.lock.json — uses pureadmin.json (baseData)
//       exclusively. .pureadmin.json never causes a lock write. The lock is
//       a function of base alone, so CI / Docker / other devs can reproduce
//       the build from pureadmin.json + lock without ever needing
//       .pureadmin.json.
//
// On a fresh clone (no lock) of a project where pureadmin.json declares a
// remote theme, install resolves it from the registry and writes the lock
// entry. If the developer also has a .pureadmin.json path override for the
// same theme, files come from the path but the lock still reflects what
// the registry would have produced.
//
// Self-healing: a lock entry whose `source` is a filesystem path but whose
// base declaration is registry (= leaked from a pre-1.3.1 .pureadmin.json
// override) is treated as missing and re-resolved from the registry.
async function cmdInstall() {
  const proj = loadProjectConfig();
  const baseThemes = (proj.baseData && proj.baseData.themes) || {};
  const localThemes = (proj.localData && proj.localData.themes) || {};
  // Anything declared by base OR local-only is installed on disk; the
  // distinction below decides whether the lock is touched.
  const declaredSlugs = Array.from(new Set([
    ...Object.keys(baseThemes),
    ...Object.keys(localThemes),
  ]));
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
  let installed = 0, resolved = 0, failed = 0, lockHealed = 0;

  for (const slug of declaredSlugs.sort()) {
    const baseEntry = baseThemes[slug];
    const localEntry = localThemes[slug];
    const lockEntry = proj.lockData.themes[slug];

    // Effective on-disk source: local override wins for files; otherwise
    // base declaration; otherwise the lock entry's recorded source.
    const overridePath = localEntry && localEntry.path;
    const basePath = baseEntry && baseEntry.path;

    // Pure local-only entry (theme isn't in pureadmin.json at all). The
    // developer is testing one that nobody else on the team consumes yet.
    // Snapshot from the path; no lock entry. Other devs / CI never see it.
    if (!baseEntry && overridePath) {
      process.stdout.write(`  ${slug}: copying from ${overridePath} ${dim('(local-only)')}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, overridePath, proj.projectRoot, themesDir, lockEntry?.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || '?'))}`);
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        console.error(`    ${dim('Hint: this theme is in .pureadmin.json only; ensure the path exists or remove the override.')}`);
        failed++;
      }
      continue;
    }

    // From here down: baseEntry exists. Lock writes are gated on baseEntry.

    // Team-shared local theme (baseEntry has a `path`, no override). Snapshot
    // from base path; lock records the base path + manifest version.
    if (basePath && !overridePath) {
      process.stdout.write(`  ${slug}: copying from ${basePath}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, basePath, proj.projectRoot, themesDir, lockEntry?.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || '?'))}`);
        const needsLockWrite = !lockEntry || lockEntry.source !== basePath || lockEntry.version !== newVersion;
        if (needsLockWrite) {
          proj.lockData.themes[slug] = {
            version: newVersion,
            content_sha: null,
            fetched_at: new Date().toISOString(),
            source: basePath,
          };
          resolved++;
        }
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Team-shared local with a personal override on top: snapshot from the
    // override on disk, but the lock keeps describing the team's basePath
    // (not the override). This is the "I'm testing my own version of the
    // shared local theme" edge case.
    if (basePath && overridePath) {
      process.stdout.write(`  ${slug}: copying from ${overridePath} ${dim('(override of shared local)')}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, overridePath, proj.projectRoot, themesDir, lockEntry?.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || '?'))}`);
        // Lock invariant: if base path is unchanged we leave the lock alone;
        // if base path changed (or the lock entry doesn't reflect base), we
        // re-read the base path's manifest to refresh the lock.
        if (!lockEntry || lockEntry.source !== basePath) {
          let baseVersion = lockEntry?.version || null;
          try {
            const m = JSON.parse(fs.readFileSync(path.join(path.isAbsolute(basePath) ? basePath : path.resolve(proj.projectRoot, basePath), 'theme.json'), 'utf-8'));
            if (m.version) baseVersion = m.version;
          } catch {}
          proj.lockData.themes[slug] = {
            version: baseVersion,
            content_sha: null,
            fetched_at: new Date().toISOString(),
            source: basePath,
          };
          resolved++;
        }
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Registry-declared (baseEntry has no `path`). Two sub-cases on the lock
    // side: (1) lock entry is registry-shaped and present → fast path,
    // download exact version; (2) lock entry is missing or has a path source
    // (= leaked from a pre-1.3.1 .pureadmin.json override) → resolve fresh.
    const lockIsValidRegistry = !!lockEntry && lockEntry.source === 'remote' && !!lockEntry.version;
    const lockNeedsHealing = !!lockEntry && !lockIsValidRegistry;

    if (lockIsValidRegistry) {
      // Disk: if there's a personal override, snapshot from path. Otherwise
      // download from the locked registry version.
      if (overridePath) {
        process.stdout.write(`  ${slug}: copying from ${overridePath} ${dim('(override; lock=registry v' + lockEntry.version + ')')}... `);
        try {
          reSnapshotLocalTheme(slug, overridePath, proj.projectRoot, themesDir, lockEntry.version);
          console.log(green('done'));
          installed++;
        } catch (err) {
          console.log(red(`failed: ${err.message}`));
          console.error(`    ${dim('Hint: remove the .pureadmin.json override or ensure the path exists.')}`);
          failed++;
        }
      } else {
        process.stdout.write(`  ${slug}: downloading v${lockEntry.version}... `);
        try {
          await downloadAndExtract(slug, lockEntry.version, proj.projectRoot, themesDir);
          console.log(green('done'));
          installed++;
        } catch (err) {
          console.log(red(`failed: ${err.message}`));
          failed++;
        }
      }
      continue;
    }

    // No valid registry lock entry — resolve fresh.
    const core = ensureCoreInfo();
    process.stdout.write(`  ${slug}: resolving${lockNeedsHealing ? dim(' (healing leaked lock entry)') : ''}... `);
    let resolution;
    try {
      resolution = await resolveRemoteTheme(slug, core.version);
    } catch (err) {
      console.log(red(`failed: ${err.message}`));
      failed++;
      continue;
    }
    console.log(green(`v${resolution.version}`));

    proj.lockData.themes[slug] = {
      version: resolution.version,
      content_sha: resolution.content_sha,
      fetched_at: new Date().toISOString(),
      source: 'remote',
    };
    if (lockNeedsHealing) lockHealed++;
    else resolved++;

    // Disk: override wins if present.
    if (overridePath) {
      process.stdout.write(`  ${slug}: copying from ${overridePath} ${dim('(lock=registry v' + resolution.version + ')')}... `);
      try {
        reSnapshotLocalTheme(slug, overridePath, proj.projectRoot, themesDir, resolution.version);
        console.log(green('done'));
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
    } else {
      process.stdout.write(`  ${slug}: downloading... `);
      try {
        await downloadAndExtract(slug, resolution.version, proj.projectRoot, themesDir);
        console.log(green('done'));
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
    }
  }

  // Prune stale lockfile entries — lock should mirror baseData exclusively.
  // Anything in lock that isn't declared in pureadmin.json is dropped.
  let prunedCount = 0;
  for (const lockedSlug of Object.keys(proj.lockData.themes)) {
    if (!Object.prototype.hasOwnProperty.call(baseThemes, lockedSlug)) {
      delete proj.lockData.themes[lockedSlug];
      prunedCount++;
    }
  }

  if (resolved > 0 || lockHealed > 0 || prunedCount > 0) {
    saveLockData(proj.lockFile, proj.lockData);
  }

  console.log();
  const summary = [`${green(`${installed} installed`)}`];
  if (resolved > 0) summary.push(`${dim(`${resolved} resolved fresh`)}`);
  if (lockHealed > 0) summary.push(`${yellow(`${lockHealed} lock entries healed`)}`);
  if (prunedCount > 0) summary.push(`${dim(`${prunedCount} pruned from lock`)}`);
  if (failed > 0) summary.push(`${red(`${failed} failed`)}`);
  console.log(bold('  Summary:') + ' ' + summary.join(', '));
  if (resolved > 0 || lockHealed > 0 || prunedCount > 0) {
    console.log(dim(`  Lockfile updated: ${proj.lockFile}`));
  }
  console.log();

  return { installed, resolved, lockHealed, failed };
}

// ---------------------------------------------------------------------------
// themes ci — CI use case ("just give me what's recorded")
// ---------------------------------------------------------------------------
//
// Like `npm ci`: lockfile is the source of truth. Operates exclusively on
// pureadmin.json + pureadmin.lock.json — .pureadmin.json overrides are
// IGNORED (CI/Docker won't have one anyway, and a dev running `ci` locally
// is asking for a strict reproduction). Fails fast (before doing any work)
// if any base-declared theme is missing from the lockfile. Writes nothing.
async function cmdCi() {
  const proj = loadProjectConfig();
  const baseThemes = (proj.baseData && proj.baseData.themes) || {};
  const lockThemes = (proj.lockData && proj.lockData.themes) || {};
  const baseSlugs = Object.keys(baseThemes);
  const themesDir = proj.data.themesDir || 'static/themes';

  if (baseSlugs.length === 0) {
    console.log(`\n  No themes declared in pureadmin.json. Add one with: ${bold('pureadmin themes add <slug>')}\n`);
    return;
  }

  // Validate: every base-declared theme must be in the lockfile, and the
  // lock entry must be coherent (have a version).
  const missingFromLock = baseSlugs.filter(s => !lockThemes[s] || !lockThemes[s].version);
  if (missingFromLock.length > 0) {
    console.error(`\n  ${red('Error:')} The following theme(s) are declared in pureadmin.json but have no valid entry in the lockfile:\n`);
    for (const s of missingFromLock) console.error(`    - ${s}`);
    console.error(`\n  Run ${bold('pureadmin themes install')} to resolve and lock them, then commit the lockfile.\n`);
    process.exit(1);
  }

  console.log(bold(`\n  Installing ${baseSlugs.length} theme(s) from lockfile (CI mode)...\n`));
  console.log(dim(`  Lockfile: ${proj.lockFile}\n`));

  let installed = 0, failed = 0;

  for (const slug of baseSlugs.sort()) {
    const lockEntry = lockThemes[slug];

    // Path-source lock entry: only legitimate when --shared was used to put
    // the path declaration in pureadmin.json. Re-copy from the recorded path.
    if (lockEntry.source && lockEntry.source !== 'remote') {
      process.stdout.write(`  ${slug}: copying from ${lockEntry.source}... `);
      try {
        const newVersion = reSnapshotLocalTheme(slug, lockEntry.source, proj.projectRoot, themesDir, lockEntry.version);
        console.log(green('done') + ` ${dim('v' + (newVersion || lockEntry.version || '?'))}`);
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        console.error(`    ${dim('Hint: lockfile records a local path. If this is a CI/Docker build, switch the declaration in pureadmin.json to a registry source and run `themes update`.')}`);
        failed++;
      }
      continue;
    }

    // Registry: fetch the locked version exactly.
    process.stdout.write(`  ${slug}: downloading v${lockEntry.version}... `);
    try {
      await downloadAndExtract(slug, lockEntry.version, proj.projectRoot, themesDir);
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
