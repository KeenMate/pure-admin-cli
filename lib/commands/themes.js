// ---------------------------------------------------------------------------
// themes subcommand router + themes list/add + update
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green, yellow } = require('../formatting');
const { loadProjectConfig, saveProjectConfig } = require('../config');
const { fetchJson, downloadFile } = require('../http');
const { extractThemeZip } = require('../files');
const { cmdList, cmdInfo, cmdVersions, cmdSearch, cmdCompatible, cmdDownload } = require('./browse');
const { cmdInit } = require('./init');
const { cmdBuild } = require('./theme-build');
const { cmdPack } = require('./theme-pack');
const { cmdPublish } = require('./theme-publish');
const { cmdValidate } = require('./theme-validate');

async function cmdThemesRouter(subArgs, opts, usage) {
  const sub = subArgs[0];
  const rest = subArgs.slice(1);

  // No args → hint
  if (!sub) {
    console.log(`\n  Use ${bold('themes list')} (API) or ${bold('themes list --local')} (project)\n`);
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
    const mode = info.offline ? yellow('offline') : dim('online');
    const themeDir = path.join(path.dirname(proj.path), themesDir, slug);
    const exists = fs.existsSync(themeDir) ? green('installed') : yellow('not installed');
    console.log(`  ${cyan(slug.padEnd(20))} ${ver}  ${mode}  ${exists}`);
  }
  console.log();
}

// Add themes to project
async function cmdThemesAdd(slugs, opts) {
  if (slugs.length === 0) {
    console.error(`\n  Usage: ${bold('pureadmin themes add <id> [id...]')}\n`);
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
      fs.mkdirSync(path.join(projectRoot, themesDir), { recursive: true });
      await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download`, zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      continue;
    }

    // Extract
    process.stdout.write(`  ${slug}: extracting to ${themesDir}/${slug}/... `);
    try {
      extractThemeZip(zipPath, themeDir);
      fs.unlinkSync(zipPath);
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
      fs.mkdirSync(path.join(projectRoot, themesDir), { recursive: true });
      await downloadFile(`/api/themes/${encodeURIComponent(slug)}/download`, zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed: ${err.message}\x1b[0m`);
      failed++;
      continue;
    }

    process.stdout.write(`  ${slug}: extracting... `);
    try {
      extractThemeZip(zipPath, themeDir);
      fs.unlinkSync(zipPath);
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
