// ---------------------------------------------------------------------------
// themes subcommand router + themes list/add + update
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green, yellow, red } = require('../helpers/formatting');
const { loadProjectConfig, saveProjectConfig } = require('../config');
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
  // add: explicit verb for adding themes to project
  if (sub === 'add') return await cmdThemesAdd(rest, opts);
  if (sub === 'show') return await cmdInfo(rest[0], usage);
  if (sub === 'versions') return await cmdVersions(rest[0], usage);
  if (sub === 'search') return await cmdSearch(rest.join(' '), usage);
  if (sub === 'compatible') return await cmdCompatible(rest[0], usage);
  if (sub === 'download') return await cmdDownload(rest[0], opts, usage);
  if (sub === 'init') return await cmdInit(rest[0], rest.slice(1).join(' ') || undefined, usage);
  if (sub === 'update') return await cmdUpdate();
  if (sub === 'build') return await cmdBuild(rest);
  if (sub === 'pack') return await cmdPack(rest, opts);
  if (sub === 'publish') return await cmdPublish(rest, opts);
  if (sub === 'validate') return await cmdValidate(rest);
  if (sub === 'lint') return await cmdLint(rest);

  // Legacy: bare slugs → treat as add
  return await cmdThemesAdd(subArgs, opts);
}

// List project-configured themes
async function cmdThemesLocal() {
  const proj = loadProjectConfig();
  const data = proj.data;
  const themes = data.themes || {};
  const themesDir = data.themesDir || 'static/themes';
  const entries = Object.entries(themes);

  if (entries.length === 0) {
    console.log(`\n  No themes configured. Add one with: ${bold('pureadmin themes add <id>')}\n`);
    return;
  }

  console.log(bold(`\n  ${entries.length} theme(s) configured`) + dim(` (${proj.path})\n`));
  console.log(`  ${dim('themes dir:')} ${themesDir}\n`);

  for (const [slug, info] of entries) {
    const ver = info.version ? dim(`v${info.version}`) : dim('unknown');
    // Path-based themes get a distinct "local" label and append the source
    // path so users see where it points. Online/offline applies only to
    // API-fetched themes (online = gitignored, offline = committed).
    const mode = info.path ? cyan(`local: ${info.path}`)
      : info.offline ? yellow('offline')
      : dim('online');
    const themeDir = path.join(path.dirname(proj.path), themesDir, slug);
    const exists = fs.existsSync(themeDir) ? green('installed') : yellow('not installed');
    console.log(`  ${cyan(slug.padEnd(20))} ${ver}  ${mode}  ${exists}`);
  }
  console.log();
}

// Add themes to project
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
  const data = proj.data;

  // Add/update themes
  const offline = opts.offline || false;
  const themesDir = opts.dir || data.themesDir || 'static/themes';
  data.themesDir = themesDir;
  data.themes = data.themes || {};

  const projectRoot = path.dirname(proj.path);

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
    const themeDir = path.join(projectRoot, themesDir, slug);
    const zipPath = path.join(projectRoot, themesDir, `${slug}.zip`);

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      mkdir(path.join(projectRoot, themesDir));
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

    // Save to config
    data.themes[slug] = {
      version: themeInfo.latest,
      content_sha: themeInfo.content_sha || null,
      offline
    };

    console.log(`  ${slug}: ${offline ? yellow('offline') : dim('online')} — ${dim(`saved to ${proj.path}`)}`);
  }

  saveProjectConfig(proj.path, data);
  console.log();
}

// Register a theme from a local directory. Reads <srcPath>/theme.json for the
// slug+version, validates against expectedSlug if the user passed one, then
// snapshots the directory contents into <projectRoot>/<themesDir>/<slug>/.
// The destination is wiped first so leftover files from a prior version don't
// linger. Skips .git and node_modules during the copy.
async function addLocalTheme(srcPath, expectedSlug, opts) {
  const proj = loadProjectConfig();
  const data = proj.data;
  const themesDir = opts.dir || data.themesDir || 'static/themes';
  data.themesDir = themesDir;
  data.themes = data.themes || {};
  const projectRoot = path.dirname(proj.path);

  // Resolve relative paths against the pureadmin.json location, not cwd —
  // the same path string then survives `cd` to anywhere inside the project.
  const absPath = path.isAbsolute(srcPath) ? srcPath : path.resolve(projectRoot, srcPath);

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

  const themeDir = path.join(projectRoot, themesDir, slug);
  const offline = opts.offline || false;

  console.log();
  console.log(`  ${slug}: ${green(manifest.name || slug)} v${manifest.version || '?'} ${dim(`(local: ${srcPath})`)}`);

  process.stdout.write(`  ${slug}: copying to ${themesDir}/${slug}/... `);
  try {
    mkdir(path.join(projectRoot, themesDir));
    if (fs.existsSync(themeDir)) removeDir(themeDir);
    copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
    console.log(green('done'));
  } catch (err) {
    console.log(red(`failed: ${err.message}`));
    return;
  }

  data.themes[slug] = {
    path: srcPath,
    version: manifest.version || null,
    offline,
  };

  console.log(`  ${slug}: ${cyan('local')} — ${dim(`saved to ${proj.path}`)}`);
  saveProjectConfig(proj.path, data);
  console.log();
}

async function cmdUpdate() {
  const proj = loadProjectConfig();
  const data = proj.data;
  const themes = data.themes || {};
  const themesDir = data.themesDir || 'static/themes';
  const projectRoot = path.dirname(proj.path);
  const entries = Object.entries(themes);

  if (entries.length === 0) {
    console.log(`\n  No themes configured. Add one with: pureadmin themes <slug>\n`);
    return;
  }

  console.log(bold(`\n  Checking ${entries.length} theme(s) for updates...\n`));

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [slug, info] of entries) {
    // Local-path themes: re-snapshot from the source directory instead of
    // hitting the API. The on-disk theme.json is the source of truth for the
    // version; we always re-copy because there's no cheap content_sha check
    // against an arbitrary directory and the user is iterating, so they want
    // changes reflected.
    if (info && info.path) {
      const absPath = path.isAbsolute(info.path) ? info.path : path.resolve(projectRoot, info.path);
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
      const themeDir = path.join(projectRoot, themesDir, slug);
      try {
        mkdir(path.join(projectRoot, themesDir));
        if (fs.existsSync(themeDir)) removeDir(themeDir);
        copyDirSync(absPath, themeDir, ['.git', 'node_modules']);
        const newVersion = manifest.version || info.version || null;
        const versionLabel = info.version && newVersion && info.version !== newVersion
          ? `v${info.version} → v${newVersion}`
          : `v${newVersion || '?'}`;
        console.log(green('done') + ` ${dim(versionLabel)}`);
        data.themes[slug] = { ...info, version: newVersion };
        updated++;
      } catch (err) {
        console.log(red(`failed: ${err.message}`));
        failed++;
      }
      continue;
    }

    process.stdout.write(`  ${slug}: checking... `);

    // Fetch current info from server
    let themeInfo;
    try {
      const result = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
      themeInfo = result.theme;
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    // Compare content_sha
    if (info.content_sha && themeInfo.content_sha === info.content_sha) {
      console.log(dim(`v${themeInfo.latest} — unchanged`));
      unchanged++;
      continue;
    }

    // Changed or new — re-download
    const versionChange = info.version && info.version !== themeInfo.latest
      ? `v${info.version} → v${themeInfo.latest}`
      : `v${themeInfo.latest}`;
    console.log(yellow(versionChange));

    const themeDir = path.join(projectRoot, themesDir, slug);
    const zipPath = path.join(projectRoot, themesDir, `${slug}.zip`);

    process.stdout.write(`  ${slug}: downloading... `);
    try {
      mkdir(path.join(projectRoot, themesDir));
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

    // Update config
    data.themes[slug] = {
      ...info,
      version: themeInfo.latest,
      content_sha: themeInfo.content_sha || null
    };
    updated++;
  }

  saveProjectConfig(proj.path, data);

  console.log();
  console.log(bold('  Summary:') + ` ${green(`${updated} updated`)}, ${dim(`${unchanged} unchanged`)}, ${failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : dim(`${failed} failed`)}`);
  console.log();
}

module.exports = { cmdThemesRouter, cmdThemesLocal, cmdThemesAdd, cmdUpdate };
