// ---------------------------------------------------------------------------
// themes subcommand router + project-side commands (list/add/update/install)
// ---------------------------------------------------------------------------
//
// This file owns the reading and writing of the three project config files
// (pureadmin.json, .pureadmin.json, pureadmin.lock.json). See config.js for
// the layered model.
//
// Save routing rules:
//   - themes update  → writes ONLY the lockfile (and possibly a local override
//                      file when a developer's locally-pathed theme bumps its
//                      version — though we don't need that, since the lock
//                      tracks the resolved version anyway).
//   - themes install → writes nothing.
//   - themes add <id> [<id>…]                → writes baseData (team-shared).
//   - themes add <id> --path <dir>           → writes localData (per-developer
//                                              override) by default. With
//                                              --shared, writes baseData.
//
// pureadmin.json must remain untouched by everything except explicit add /
// remove. That's the entire point of the lockfile split.

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
  if (sub === 'update') return await cmdUpdate();
  if (sub === 'install') return await cmdInstall();
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

  // Ensure base file has the themesDir + themes object initialized.
  proj.baseData.themesDir = themesDir;
  proj.baseData.themes = proj.baseData.themes || {};
  proj.lockData.themes = proj.lockData.themes || {};

  for (const slug of slugs) {
    console.log();

    // Fetch theme info from server
    process.stdout.write(`  ${slug}: fetching info... `);
    let themeInfo;
    try {
      const result = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
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
  // `themes install` can reproduce this developer's working copy on machines
  // where the path exists. (For machines where it doesn't exist, install
  // will fail loudly with a hint to remove the local override.)
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
// themes update — DEV use case ("I want fresh versions")
// ---------------------------------------------------------------------------
//
// For each declared theme:
//   - If `path` is set (local source): re-snapshot from disk; record the
//     manifest version into the lockfile.
//   - Otherwise (remote): fetch theme info; if content_sha differs from
//     lockfile, re-download and update lockfile entry. If unchanged, no-op.
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

  proj.lockData.themes = proj.lockData.themes || {};
  let updated = 0, unchanged = 0, failed = 0;

  for (const slug of slugs) {
    const info = proj.themes[slug];

    // Local-path themes: re-snapshot from the source directory.
    if (info.path) {
      const absPath = path.isAbsolute(info.path) ? info.path : path.resolve(proj.projectRoot, info.path);
      process.stdout.write(`  ${slug}: re-copying from ${info.path}... `);
      if (!fs.existsSync(absPath)) {
        console.log(red(`failed: path does not exist (${absPath})`));
        failed++;
        continue;
      }
      const manifestPath = path.join(absPath, 'theme.json');
      let manifest = {};
      if (fs.existsSync(manifestPath)) {
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {}
      }
      const themeDir = path.join(proj.projectRoot, themesDir, slug);
      try {
        mkdir(path.join(proj.projectRoot, themesDir));
        if (fs.existsSync(themeDir)) removeDir(themeDir);
        copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
        const previousVersion = info.version || null;
        const newVersion = manifest.version || previousVersion;
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

    // Remote themes: hit the API.
    process.stdout.write(`  ${slug}: checking... `);
    let themeInfo;
    try {
      const result = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
      themeInfo = result.theme;
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    // Compare content_sha against the lockfile entry.
    if (info.content_sha && themeInfo.content_sha === info.content_sha) {
      console.log(dim(`v${themeInfo.latest} — unchanged`));
      unchanged++;
      continue;
    }

    // Changed (or new) — re-download.
    const versionChange = info.version && info.version !== themeInfo.latest
      ? `v${info.version} → v${themeInfo.latest}`
      : `v${themeInfo.latest}`;
    console.log(yellow(versionChange));

    const themeDir = path.join(proj.projectRoot, themesDir, slug);
    const zipPath = path.join(proj.projectRoot, themesDir, `${slug}.zip`);

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      mkdir(path.join(proj.projectRoot, themesDir));
      await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download`, zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    process.stdout.write(`  ${slug}: extracting... `);
    try {
      extractZip(zipPath, themeDir);
      removeFile(zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    proj.lockData.themes[slug] = {
      version: themeInfo.latest,
      content_sha: themeInfo.content_sha || null,
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
}

// ---------------------------------------------------------------------------
// themes install — CI use case ("just give me what's recorded")
// ---------------------------------------------------------------------------
//
// Reads the lockfile and reproduces those exact versions:
//   - Remote themes: fetch ?version=<lockedVersion>, verify content_sha if
//     recorded, copy.
//   - Local-path themes: re-copy from the recorded path. If the path doesn't
//     exist on this machine, fail with a hint (typically the install was run
//     on a CI box where someone's personal .pureadmin.json `path` got into
//     the lockfile somehow — the right fix is to remove that local override
//     locally and run `themes update`).
//
// Fails fast (before doing any work) if any declared theme is missing from
// the lockfile — that means declarations and resolutions are out of sync,
// same shape as `npm ci` failing on a missing/stale package-lock.json.
// Writes nothing.
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

  // Validate: every declared theme must be in the lockfile.
  const missingFromLock = declaredSlugs.filter(s => !proj.themes[s]._layers.lock);
  if (missingFromLock.length > 0) {
    console.error(`\n  ${red('Error:')} The following theme(s) are declared in pureadmin.json but missing from the lockfile:\n`);
    for (const s of missingFromLock) console.error(`    - ${s}`);
    console.error(`\n  Run ${bold('pureadmin themes update')} to resolve and lock them, then commit the lockfile.\n`);
    process.exit(1);
  }

  console.log(bold(`\n  Installing ${declaredSlugs.length} theme(s) from lockfile...\n`));
  console.log(dim(`  Lockfile: ${proj.lockFile}\n`));

  let installed = 0, failed = 0;

  for (const slug of declaredSlugs.sort()) {
    const info = proj.themes[slug];
    const themeDir = path.join(proj.projectRoot, themesDir, slug);

    // Local-path themes: re-copy from the recorded path. Refuse to invent a
    // different source — install must reproduce what `update` wrote.
    if (info.path) {
      const absPath = path.isAbsolute(info.path) ? info.path : path.resolve(proj.projectRoot, info.path);
      process.stdout.write(`  ${slug}: copying from ${info.path}... `);
      if (!fs.existsSync(absPath)) {
        console.log(red(`failed: path does not exist (${absPath})`));
        console.error(`    ${dim('Hint: this theme was locked from a personal .pureadmin.json path that this machine does not have.')}`);
        failed++;
        continue;
      }
      try {
        mkdir(path.join(proj.projectRoot, themesDir));
        if (fs.existsSync(themeDir)) removeDir(themeDir);
        copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
        console.log(green('done') + ` ${dim('v' + (info.version || '?'))}`);
        installed++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    // Remote themes: fetch the locked version specifically.
    process.stdout.write(`  ${slug}: downloading v${info.version}... `);
    const zipPath = path.join(proj.projectRoot, themesDir, `${slug}.zip`);
    try {
      mkdir(path.join(proj.projectRoot, themesDir));
      const versionParam = info.version ? `?version=${encodeURIComponent(info.version)}` : '';
      await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download${versionParam}`, zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(red(`failed: ${err.message}`));
      failed++;
      continue;
    }

    process.stdout.write(`  ${slug}: extracting... `);
    try {
      if (fs.existsSync(themeDir)) removeDir(themeDir);
      extractZip(zipPath, themeDir);
      removeFile(zipPath);
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

  if (failed > 0) process.exit(1);
}

module.exports = { cmdThemesRouter, cmdThemesLocal, cmdThemesAdd, cmdUpdate, cmdInstall };
