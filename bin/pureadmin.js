#!/usr/bin/env node

// =============================================================================
// pureadmin-cli.js — Pure Admin theme management CLI
// =============================================================================
// Distributed by pureadmin.io — https://pureadmin.io/api/tools/pureadmin-cli.js
//
// Usage:
//   npx @keenmate/pureadmin <command> [args]
//   node pureadmin-cli.js <command> [args]
//
// Commands:
//   list                     List all themes
//   info <slug>              Show theme details (versions, core compat, etc.)
//   download <slug>          Download latest theme ZIP
//   search <query>           Search themes by name/description
//   init <id> [name]         Scaffold a new theme project
//   versions <slug>          Show available versions
//   compatible <core-ver>    List themes compatible with a core version
//   create <name>            Create a SvelteKit app with Pure Admin
//   themes [slug...]         List or add themes to project
//   update                   Re-download changed themes
//   build [theme...]         Compile SCSS → CSS
//   pack [theme...]          Build + package into ZIP
//   publish [theme...]       Build + pack + upload to pureadmin.io
// =============================================================================

const TOOL_VERSION = '1.0.0-rc02';
const TOOL_NAME = 'pureadmin-cli.js';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config: pure-admin.json → env var → default
// ---------------------------------------------------------------------------
function loadConfig() {
  const config = {};

  // 1. User home (~/.pure-admin.json) — base defaults
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const homePath = path.join(home, '.pure-admin.json');
    if (fs.existsSync(homePath)) {
      try {
        Object.assign(config, JSON.parse(fs.readFileSync(homePath, 'utf-8')));
        config._configPath = homePath;
      } catch {}
    }
  }

  // 2. Project-level (pure-admin.json, walks up from cwd) — overrides home
  let dir = process.cwd();
  while (true) {
    const configPath = path.join(dir, 'pure-admin.json');
    if (fs.existsSync(configPath)) {
      try {
        Object.assign(config, JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        config._configPath = configPath;
      } catch {}
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return config;
}

const config = loadConfig();
let BASE_URL = process.env.PUREADMIN_URL
  ? process.env.PUREADMIN_URL.replace(/\/api\/.*$/, '')
  : (config.url || 'https://pureadmin.io').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpClient() {
  return require(BASE_URL.startsWith('https') ? 'https' : 'http');
}

function fetchJson(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 304) return resolve(null);
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlPath}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${urlPath}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadFile(urlPath, destPath) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const bold = s => `\x1b[1m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length !== 6) return null;
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

function wcagLuminance(r, g, b) {
  const [rs, gs, bs] = [r,g,b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1), rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 0;
  const l1 = wcagLuminance(...rgb1), l2 = wcagLuminance(...rgb2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractCssVars(css, name) {
  // Returns all values for a CSS variable definition (last one wins in cascade)
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(css))) matches.push(m[1].trim());
  return matches;
}

function extractCssVarFromBlock(css, name) {
  const matches = extractCssVars(css, name);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function splitCssModes(css) {
  // Split CSS into mode blocks: :root/dark (default) and .pa-mode-light, .pa-color-* variants
  const modes = [];
  const modeRegex = /(:root[^{]*|\.pa-mode-light|\.pa-mode-dark|\.pa-color-[a-z]+)\s*\{/g;
  const blocks = [];
  let m;
  while ((m = modeRegex.exec(css))) {
    blocks.push({ selector: m[1].trim(), start: m.index });
  }

  // For simple extraction: find :root block and .pa-mode-light block
  // Use text between selectors as approximate block content
  if (blocks.length === 0) return [{ name: 'default', css }];

  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].start;
    const end = i + 1 < blocks.length ? blocks[i + 1].start : css.length;
    const blockCss = css.slice(start, end);
    let name;
    const sel = blocks[i].selector;
    if (sel.includes(':root') || sel.includes('.pa-mode-dark')) {
      name = 'dark';
    } else if (sel.includes('.pa-mode-light')) {
      name = 'light';
    } else {
      const variantMatch = sel.match(/\.pa-color-([a-z]+)/);
      name = variantMatch ? variantMatch[1] : sel;
    }
    // Merge blocks with same name (e.g. multiple :root blocks)
    const existing = modes.find(b => b.name === name);
    if (existing) {
      existing.css += '\n' + blockCss;
    } else {
      modes.push({ name, css: blockCss });
    }
  }

  return modes;
}

function validateThemeCss(css, themeId) {
  const errors = [];
  const warnings = [];
  const results = { readability: [], variables: [], consistency: [] };

  // --- Readability: outline button contrast per mode ---
  const modes = splitCssModes(css);
  const outlineVariants = [
    { name: 'primary',   varName: '--pa-btn-primary-bg' },
    { name: 'secondary', varName: '--pa-btn-secondary-outline-color' },
    { name: 'success',   varName: '--pa-btn-success-bg' },
    { name: 'danger',    varName: '--pa-btn-danger-bg' },
    { name: 'warning',   varName: '--pa-btn-warning-bg' },
    { name: 'info',      varName: '--pa-btn-info-bg' },
  ];

  // Filled button: text on background contrast
  const filledVariants = [
    { name: 'primary',   bgVar: '--pa-accent',          textVar: '--pa-btn-primary-text' },
    { name: 'secondary', bgVar: '--pa-btn-secondary-bg', textVar: '--pa-btn-secondary-text' },
    { name: 'success',   bgVar: '--pa-btn-success-bg',   textVar: '--pa-btn-success-text' },
    { name: 'danger',    bgVar: '--pa-btn-danger-bg',    textVar: '--pa-btn-danger-text' },
    { name: 'warning',   bgVar: '--pa-btn-warning-bg',   textVar: '--pa-btn-warning-text' },
    { name: 'info',      bgVar: '--pa-btn-info-bg',      textVar: '--pa-btn-info-text' },
  ];

  for (const mode of modes) {
    const pageBg = extractCssVarFromBlock(mode.css, '--pa-page-bg');
    if (!pageBg || !pageBg.startsWith('#')) continue;

    // Outline buttons vs page background
    for (const v of outlineVariants) {
      const color = extractCssVarFromBlock(mode.css, v.varName);
      if (!color || !color.startsWith('#')) continue;

      const ratio = contrastRatio(color, pageBg);
      const label = `${mode.name} → outline-${v.name}`;
      const detail_colors = `${v.varName}: ${color} on --pa-page-bg: ${pageBg}`;
      if (ratio < 3) {
        results.readability.push({ name: label, status: 'fail', detail: `${ratio.toFixed(1)}:1  ${detail_colors}  (min 3:1)` });
        errors.push(`${label} ${ratio.toFixed(1)}:1`);
      } else if (ratio < 4.5) {
        results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail_colors}  (recommended 4.5:1)` });
        warnings.push(`${label} ${ratio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
      }
    }

    // Filled buttons: text on button background
    for (const v of filledVariants) {
      const bg = extractCssVarFromBlock(mode.css, v.bgVar);
      const text = extractCssVarFromBlock(mode.css, v.textVar);
      if (!bg || !text || !bg.startsWith('#') || !text.startsWith('#')) continue;

      const ratio = contrastRatio(text, bg);
      const label = `${mode.name} → filled-${v.name} text`;
      const detail_colors = `${v.textVar}: ${text} on ${v.bgVar}: ${bg}`;
      if (ratio < 3) {
        results.readability.push({ name: label, status: 'fail', detail: `${ratio.toFixed(1)}:1  ${detail_colors}  (min 3:1)` });
        errors.push(`${label} ${ratio.toFixed(1)}:1`);
      } else if (ratio < 4.5) {
        results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail_colors}  (recommended 4.5:1)` });
        warnings.push(`${label} ${ratio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
      }
    }

    // Color slots (1-9): outline vs page bg, filled text vs slot bg
    for (let i = 1; i <= 9; i++) {
      const slotColor = extractCssVarFromBlock(mode.css, `--pa-color-${i}`);
      const slotText = extractCssVarFromBlock(mode.css, `--pa-color-${i}-text`);
      if (!slotColor || !slotColor.startsWith('#')) continue;

      // Outline: slot color on page bg
      const outlineRatio = contrastRatio(slotColor, pageBg);
      const outlineLabel = `${mode.name} → outline-color-${i}`;
      if (outlineRatio < 3) {
        results.readability.push({ name: outlineLabel, status: 'fail', detail: `${outlineRatio.toFixed(1)}:1  --pa-color-${i}: ${slotColor} on --pa-page-bg: ${pageBg}  (min 3:1)` });
        errors.push(`${outlineLabel} ${outlineRatio.toFixed(1)}:1`);
      } else if (outlineRatio < 4.5) {
        results.readability.push({ name: outlineLabel, status: 'warn', detail: `${outlineRatio.toFixed(1)}:1  --pa-color-${i}: ${slotColor} on --pa-page-bg: ${pageBg}  (recommended 4.5:1)` });
        warnings.push(`${outlineLabel} ${outlineRatio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: outlineLabel, status: 'pass', detail: `${outlineRatio.toFixed(1)}:1` });
      }

      // Filled: text on slot bg
      if (slotText && slotText.startsWith('#')) {
        const filledRatio = contrastRatio(slotText, slotColor);
        const filledLabel = `${mode.name} → filled-color-${i} text`;
        if (filledRatio < 3) {
          results.readability.push({ name: filledLabel, status: 'fail', detail: `${filledRatio.toFixed(1)}:1  --pa-color-${i}-text: ${slotText} on --pa-color-${i}: ${slotColor}  (min 3:1)` });
          errors.push(`${filledLabel} ${filledRatio.toFixed(1)}:1`);
        } else if (filledRatio < 4.5) {
          results.readability.push({ name: filledLabel, status: 'warn', detail: `${filledRatio.toFixed(1)}:1  --pa-color-${i}-text: ${slotText} on --pa-color-${i}: ${slotColor}  (recommended 4.5:1)` });
          warnings.push(`${filledLabel} ${filledRatio.toFixed(1)}:1`);
        } else {
          results.readability.push({ name: filledLabel, status: 'pass', detail: `${filledRatio.toFixed(1)}:1` });
        }
      }
    }
  }

  // --- CSS Variables: required definitions ---
  const required = [
    '--pa-border-radius', '--pa-border-radius-sm', '--pa-border-radius-lg',
    '--pa-accent', '--pa-accent-hover',
    '--pa-text-color-1', '--pa-text-color-2',
    '--pa-main-bg', '--pa-page-bg',
    '--pa-btn-secondary-outline-color',
    '--pa-border-color',
  ];
  for (const varName of required) {
    const found = css.includes(varName + ':');
    if (found) {
      results.variables.push({ name: `${varName} defined`, status: 'pass', detail: '' });
    } else {
      results.variables.push({ name: `${varName}`, status: 'fail', detail: 'missing' });
      errors.push(`${varName} missing`);
    }
  }

  // Theme color slots (1-9) — warn if missing, not error
  const missingSlots = [];
  for (let i = 1; i <= 9; i++) {
    if (!css.includes(`--pa-color-${i}:`)) missingSlots.push(i);
  }
  if (missingSlots.length === 0) {
    results.variables.push({ name: '--pa-color-{1-9} defined', status: 'pass', detail: '' });
  } else if (missingSlots.length === 9) {
    results.variables.push({ name: '--pa-color-{1-9}', status: 'fail', detail: 'none defined — theme color buttons will be invisible' });
    errors.push('--pa-color-{1-9} none defined');
  } else {
    results.variables.push({ name: '--pa-color-{1-9}', status: 'warn', detail: `missing slots: ${missingSlots.join(', ')}` });
    warnings.push(`color slots missing: ${missingSlots.join(', ')}`);
  }

  // --- Consistency: hardcoded border-radius ---
  // Match border-radius properties but NOT CSS variable definitions (--pa-border-radius: ...)
  const brRegex = /(?<![-\w])border-radius:\s*([^;]+);/g;
  const hardcoded = new Set();
  let brMatch;
  while ((brMatch = brRegex.exec(css))) {
    const val = brMatch[1].trim();
    // Skip CSS variable usage, zero, circles, pills, inherit, decorative shapes
    if (val.includes('var(') || val === '0' || val === '0px' || val === '0rem'
        || val === 'inherit' || val === '50%' || val.includes('50rem')
        || val.includes('500px') || val.includes('50%')
        || val.includes('12rem') || val === '0 !important'
        || val === '0.8rem') continue;  // notification badge pill
    hardcoded.add(val);
  }
  if (hardcoded.size === 0) {
    results.consistency.push({ name: 'No hardcoded border-radius values', status: 'pass', detail: '' });
  } else {
    const vals = [...hardcoded].join(', ');
    results.consistency.push({ name: `${hardcoded.size} hardcoded border-radius value(s)`, status: 'warn', detail: vals });
    warnings.push(`${hardcoded.size} hardcoded border-radius: ${vals}`);
  }

  return { results, errors, warnings };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function cmdList() {
  const data = await fetchJson('/api/themes');
  const themes = data.themes;

  console.log(bold(`\n  ${themes.length} themes available\n`));

  const maxName = Math.max(...themes.map(t => t.name.length));
  const maxSlug = Math.max(...themes.map(t => t.slug.length));
  for (const t of themes) {
    const name = t.name.padEnd(maxName);
    const slug = dim(t.slug.padEnd(maxSlug));
    const ver = dim(`v${t.latest}`);
    const tags = t.tags ? dim(t.tags.join(', ')) : '';
    console.log(`  ${cyan(name)}  ${slug}  ${ver}  ${tags}`);
  }
  console.log();
}

async function cmdInfo(slug) {
  if (!slug) return usage('info requires a theme slug');

  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;

  console.log();
  console.log(bold(`  ${t.name}`) + dim(` (${t.slug})`));
  console.log();
  console.log(`  ${dim('Description:')}  ${t.description}`);
  console.log(`  ${dim('Latest:')}       ${green(t.latest)}`);
  console.log(`  ${dim('Versions:')}     ${t.versions.join(', ')}`);
  console.log(`  ${dim('Core:')}         ${t.core_version || 'not specified'}`);
  console.log(`  ${dim('Font:')}         ${t.font}`);
  console.log(`  ${dim('Tags:')}         ${(t.tags || []).join(', ')}`);
  console.log(`  ${dim('Package:')}      ${t.package || 'n/a'}`);
  if (t.content_sha) {
    console.log(`  ${dim('Content SHA:')}  ${t.content_sha}`);
  }

  if (t.variants && t.variants.length > 0) {
    console.log();
    console.log(`  ${dim('Variants:')}`);
    for (const v of t.variants) {
      const modes = (v.modes || []).map(m => m.name).join(', ');
      console.log(`    ${v.name}${v.description ? dim(` — ${v.description}`) : ''}  ${dim(`[${modes}]`)}`);
    }
  }

  console.log();
  console.log(`  ${dim('Download:')}  curl -o ${slug}.zip ${BASE_URL}/api/themes/${slug}/download`);
  console.log(`  ${dim('Detail:')}    ${BASE_URL}/t/${slug}`);
  console.log();
}

async function cmdVersions(slug) {
  if (!slug) return usage('versions requires a theme slug');

  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;

  console.log();
  console.log(bold(`  ${t.name}`) + dim(` — versions`));
  console.log();
  for (const v of t.versions) {
    const marker = v === t.latest ? green(' (latest)') : '';
    console.log(`  ${v}${marker}`);
  }
  console.log();
}

async function cmdSearch(query) {
  if (!query) return usage('search requires a query');

  const data = await fetchJson(`/api/themes?q=${encodeURIComponent(query)}`);
  const themes = data.themes;

  if (themes.length === 0) {
    console.log(`\n  No themes found for "${query}"\n`);
    return;
  }

  console.log(bold(`\n  ${themes.length} theme(s) matching "${query}"\n`));
  for (const t of themes) {
    console.log(`  ${cyan(t.name)}  ${dim(`v${t.latest}`)}  ${dim(t.description)}`);
  }
  console.log();
}

async function cmdCompatible(coreVersion) {
  if (!coreVersion) return usage('compatible requires a core version (e.g. 2.0.0)');

  const data = await fetchJson(`/api/themes?core_version=${encodeURIComponent(coreVersion)}`);
  const themes = data.themes;

  if (themes.length === 0) {
    console.log(`\n  No themes compatible with core ${coreVersion}\n`);
    return;
  }

  console.log(bold(`\n  ${themes.length} theme(s) compatible with pure-admin-core ${coreVersion}\n`));
  for (const t of themes) {
    const core = t.core_version ? dim(`requires ${t.core_version}`) : dim('no requirement');
    console.log(`  ${cyan(t.name)}  ${dim(`v${t.latest}`)}  ${core}`);
  }
  console.log();
}

async function cmdDownload(slug, opts) {
  if (!slug) return usage('download requires a theme slug');

  const version = opts.version;
  const versionParam = version ? `?version=${encodeURIComponent(version)}` : '';
  const urlPath = `/api/themes/${encodeURIComponent(slug)}/download${versionParam}`;

  // Get theme info first for the filename
  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;
  const ver = version || t.latest;
  const filename = opts.output || `pure-admin-theme-${slug}-${ver}.zip`;

  process.stdout.write(`  Downloading ${t.name} v${ver}... `);

  try {
    await downloadFile(urlPath, filename);
    console.log(green('done'));
    console.log(`  ${dim('Saved to:')} ${filename}`);
    console.log();
  } catch (err) {
    console.log(`\x1b[31mfailed\x1b[0m`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

async function cmdInit(id, name) {
  if (!id) return usage('init requires a theme id (e.g. my-theme)');

  const displayName = name || id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const urlPath = `/api/tools/template?id=${encodeURIComponent(id)}&name=${encodeURIComponent(displayName)}`;
  const zipFile = `${id}-template.zip`;

  process.stdout.write(`  Downloading template for "${displayName}"... `);

  try {
    await downloadFile(urlPath, zipFile);
    console.log(green('done'));
  } catch (err) {
    console.log(`\x1b[31mfailed\x1b[0m`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  // Try to extract
  try {
    const { execSync } = require('child_process');
    fs.mkdirSync(id, { recursive: true });
    execSync(`unzip -o "${zipFile}" -d "${id}"`, { stdio: 'pipe' });
    fs.unlinkSync(zipFile);

    // Download tools
    const toolsDir = path.join(id, 'scripts');
    fs.mkdirSync(toolsDir, { recursive: true });

    const tools = ['pack-theme.js', 'build-themes.js', 'publish-themes.js'];
    for (const tool of tools) {
      process.stdout.write(`  Downloading ${tool}... `);
      await downloadFile(`/api/tools/${tool}`, path.join(toolsDir, tool));
      console.log(green('done'));
    }

    console.log();
    console.log(bold('  Theme project created!'));
    console.log();
    console.log(`  ${dim('Next steps:')}`);
    console.log(`    cd ${id}`);
    console.log(`    npm install`);
    console.log(`    npm run build`);
    console.log(`    npm run pack`);
    console.log();
  } catch {
    console.log(`  ${yellow('Could not auto-extract.')} Unzip manually: unzip ${zipFile} -d ${id}/`);
    console.log();
  }
}

async function cmdCreate(appName, opts) {
  if (!appName) return usage('create requires an app name (e.g. my-app)');

  const template = opts.template || 'sveltekit';
  const themeIds = (opts.themes || 'corporate,audi,dark').split(',').map(s => s.trim());
  const defaultTheme = opts.theme || themeIds[0];
  const displayName = appName.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  console.log();
  console.log(bold(`  Creating ${displayName}`) + dim(` (${template} + Pure Admin)`));
  console.log(`  ${dim('Themes:')} ${themeIds.join(', ')} ${dim(`(default: ${defaultTheme})`)}`);
  console.log();

  // 1. Fetch recipe
  process.stdout.write(`  Fetching ${template} recipe... `);
  let recipe;
  try {
    recipe = await fetchJson(`/api/tools/templates/${template}`);
    console.log(green('done'));
  } catch {
    console.log(yellow('not found on server, using built-in'));
    recipe = null;
  }

  // 2. Run framework scaffold
  const { execSync } = require('child_process');

  console.log(`  Running SvelteKit scaffold...`);
  try {
    execSync(`npm create svelte@latest ${appName} -- --template skeleton --types ts`, {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
  } catch {
    console.error(`\n  ${bold('Scaffold failed.')} You can create the project manually and re-run.`);
    process.exit(1);
  }

  const appDir = path.join(process.cwd(), appName);

  // 3. Fetch available theme data for building the config
  process.stdout.write(`  Fetching theme data... `);
  let themesData;
  try {
    const result = await fetchJson('/api/themes');
    themesData = result.themes.filter(t => themeIds.includes(t.slug));
    console.log(green(`${themesData.length} theme(s)`));
  } catch (err) {
    console.log(yellow('failed, using defaults'));
    themesData = themeIds.map(id => ({ slug: id, name: id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') }));
  }

  // 4. Write template files
  console.log(`  Writing Pure Admin integration files...`);

  // Build template variables
  const themeIdsQuoted = themeIds.map(id => `'${id}'`).join(', ');
  const themeOptions = themesData.map(t =>
    `\t\t{ id: '${t.slug}', name: '${t.name}', cssPath: '/themes/${t.slug}/css/${t.slug}.css' }`
  ).join(',\n');

  // app.html
  const appHtml = `<!doctype html>
<html lang="en">
\t<head>
\t\t<meta charset="utf-8" />
\t\t<link rel="icon" href="%sveltekit.assets%/favicon.png" />
\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />
\t\t<script>
\t\t\t(function() {
\t\t\t\tvar validThemes = [${themeIdsQuoted}];
\t\t\t\tvar theme = localStorage.getItem('theme');
\t\t\t\tif (!theme || validThemes.indexOf(theme) === -1) {
\t\t\t\t\tvar match = document.cookie.match(/(^| )theme=([^;]+)/);
\t\t\t\t\ttheme = match ? match[2] : '${defaultTheme}';
\t\t\t\t}
\t\t\t\tif (validThemes.indexOf(theme) === -1) theme = '${defaultTheme}';
\t\t\t\tvar link = document.createElement('link');
\t\t\t\tlink.id = 'pa-theme-css';
\t\t\t\tlink.rel = 'stylesheet';
\t\t\t\tlink.href = '/themes/' + theme + '/css/' + theme + '.css';
\t\t\t\tdocument.currentScript.parentNode.insertBefore(link, document.currentScript);
\t\t\t})();
\t\t</script>
\t\t%sveltekit.head%
\t</head>
\t<body data-sveltekit-preload-data="hover">
\t\t<script>
\t\t\t(function() {
\t\t\t\tvar themeMode = localStorage.getItem('theme-mode') || 'light';
\t\t\t\tvar resolvedMode = themeMode === 'auto'
\t\t\t\t\t? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
\t\t\t\t\t: themeMode;
\t\t\t\tdocument.body.classList.add('pa-mode-' + resolvedMode);
\t\t\t\tif (localStorage.getItem('sidebar-hidden') === 'true') document.body.classList.add('sidebar-hidden');
\t\t\t\tif (localStorage.getItem('compact-mode') === 'true') document.body.classList.add('compact-mode');
\t\t\t})();
\t\t</script>
\t\t<div style="display: contents">%sveltekit.body%</div>
\t</body>
</html>`;

  // +layout.svelte
  const layoutSvelte = `<script lang="ts">
\timport {
\t\tPureAdminProvider,
\t\tLayout,
\t\tLayoutInner,
\t\tLayoutContent,
\t\tNavbar,
\t\tSidebar,
\t\tSidebarItem,
\t\tMain,
\t\tFooter,
\t\tSettingsPanel
\t} from '@keenmate/svelte-pure-admin';
\timport type { PureAdminConfig, ThemeOption } from '@keenmate/svelte-pure-admin';
\timport '../app.css';

\tconst availableThemes: ThemeOption[] = [
${themeOptions}
\t];

\tlet { children } = $props();

\tlet sidebarHidden = $state(false);
\tlet sidebarMobileVisible = $state(false);

\tfunction toggleSidebar() {
\t\tif (typeof document !== 'undefined') {
\t\t\tconst isMobile = window.innerWidth <= 768;
\t\t\tif (isMobile) {
\t\t\t\tsidebarMobileVisible = !sidebarMobileVisible;
\t\t\t} else {
\t\t\t\tsidebarHidden = !sidebarHidden;
\t\t\t}
\t\t}
\t}

\tconst config: PureAdminConfig = {
\t\tappName: '${displayName}',
\t\tcopyright: {
\t\t\ttext: '${displayName}',
\t\t\tyear: new Date().getFullYear()
\t\t}
\t};
</script>

<PureAdminProvider {config}>
\t<Layout>
\t\t<Navbar appName={config.appName} onburgerclick={toggleSidebar} />

\t\t<LayoutInner>
\t\t\t<Sidebar bind:hidden={sidebarHidden} bind:mobileVisible={sidebarMobileVisible}>
\t\t\t\t<SidebarItem href="/" label="Dashboard" icon="fa fa-home" />
\t\t\t</Sidebar>

\t\t\t<LayoutContent>
\t\t\t\t<Main>
\t\t\t\t\t{@render children()}
\t\t\t\t</Main>
\t\t\t\t<Footer copyright={config.copyright} />
\t\t\t</LayoutContent>
\t\t</LayoutInner>

\t\t<SettingsPanel themes={availableThemes} defaultTheme="${defaultTheme}" />
\t</Layout>
</PureAdminProvider>`;

  // +page.svelte
  const pageSvelte = `<script lang="ts">
\timport { Card, Heading, Paragraph } from '@keenmate/svelte-pure-admin';
</script>

<Heading level={1}>Dashboard</Heading>

<div class="pa-grid pa-grid--3">
\t<Card title="Welcome">
\t\t<Paragraph>
\t\t\tYour Pure Admin app is ready. Edit <code>src/routes/+page.svelte</code> to get started.
\t\t</Paragraph>
\t</Card>

\t<Card title="Theme">
\t\t<Paragraph>
\t\t\tOpen the settings panel (gear icon) to switch between themes and modes.
\t\t</Paragraph>
\t</Card>

\t<Card title="Components">
\t\t<Paragraph>
\t\t\tSee the <a href="https://pureadmin.io/docs">documentation</a> for available components.
\t\t</Paragraph>
\t</Card>
</div>`;

  // app.css
  const appCss = `/* All styling comes from @keenmate/pure-admin-core via theme CSS files.
   Add your app-specific overrides here. */
`;

  // copy-themes.js
  process.stdout.write(`  Downloading copy-themes.js... `);
  try {
    fs.mkdirSync(path.join(appDir, 'scripts'), { recursive: true });
    await downloadFile('/api/tools/templates/sveltekit/copy-themes.js', path.join(appDir, 'scripts', 'copy-themes.js'));
    console.log(green('done'));
  } catch {
    // Fall back to writing a minimal version
    console.log(yellow('using embedded version'));
  }

  // Write files
  fs.writeFileSync(path.join(appDir, 'src', 'app.html'), appHtml);
  fs.writeFileSync(path.join(appDir, 'src', 'app.css'), appCss);
  fs.writeFileSync(path.join(appDir, 'src', 'routes', '+layout.svelte'), layoutSvelte);
  fs.writeFileSync(path.join(appDir, 'src', 'routes', '+page.svelte'), pageSvelte);

  console.log(`    src/app.html ${dim('(FOUC-free theme loading)')}`);
  console.log(`    src/app.css`);
  console.log(`    src/routes/+layout.svelte ${dim('(Pure Admin layout + settings)')}`);
  console.log(`    src/routes/+page.svelte ${dim('(starter dashboard)')}`);

  // 5. Install dependencies
  console.log();
  console.log(`  Installing dependencies...`);
  try {
    execSync('npm install', { cwd: appDir, stdio: 'inherit' });
    execSync('npm install @keenmate/svelte-pure-admin @keenmate/pure-admin-core', {
      cwd: appDir,
      stdio: 'inherit'
    });
  } catch {
    console.log(yellow('  npm install failed — run it manually'));
  }

  // 6. Download themes
  console.log();
  console.log(`  Downloading themes...`);
  for (const id of themeIds) {
    const themeDir = path.join(appDir, 'static', 'themes', id);
    const zipPath = path.join(appDir, 'static', 'themes', `${id}.zip`);

    process.stdout.write(`    ${id}... `);
    try {
      fs.mkdirSync(path.join(appDir, 'static', 'themes'), { recursive: true });
      await downloadFile(`/api/themes/${id}/download`, zipPath);
      fs.mkdirSync(themeDir, { recursive: true });
      execSync(`unzip -o "${zipPath}" -d "${themeDir}"`, { stdio: 'pipe' });
      fs.unlinkSync(zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(yellow(`failed: ${err.message}`));
    }
  }

  // 7. Done
  console.log();
  console.log(bold('  App created!'));
  console.log();
  console.log(`  ${dim('Next steps:')}`);
  console.log(`    cd ${appName}`);
  console.log(`    npm run dev`);
  console.log(`    ${dim('Open http://localhost:5173')}`);
  console.log();
}

// ---------------------------------------------------------------------------
// Project config helpers
// ---------------------------------------------------------------------------
function findProjectConfig() {
  // Find the nearest pure-admin.json from cwd (not home — project only)
  let dir = process.cwd();
  while (true) {
    const p = path.join(dir, 'pure-admin.json');
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
  return { path: path.join(process.cwd(), 'pure-admin.json'), data: {} };
}

function saveProjectConfig(configPath, data) {
  // Don't persist internal fields
  const clean = { ...data };
  delete clean._configPath;
  fs.writeFileSync(configPath, JSON.stringify(clean, null, 2) + '\n');
}

function extractThemeZip(zipPath, destDir) {
  const { execSync } = require('child_process');
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  } catch {
    // Try tar on systems without unzip
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
    } catch {
      throw new Error('Could not extract ZIP — install unzip or tar');
    }
  }
}

// ---------------------------------------------------------------------------
// themes command
// ---------------------------------------------------------------------------
async function cmdThemes(slugs, opts) {
  const proj = loadProjectConfig();
  const data = proj.data;

  // No args → list configured themes
  if (slugs.length === 0) {
    const themes = data.themes || {};
    const themesDir = data.themesDir || 'static/themes';
    const entries = Object.entries(themes);

    if (entries.length === 0) {
      console.log(`\n  No themes configured. Add one with: pureadmin themes <slug>\n`);
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
    return;
  }

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

// ---------------------------------------------------------------------------
// update command
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// build command — compile SCSS → CSS
// ---------------------------------------------------------------------------
async function cmdBuild(themeNames) {
  const { execSync } = require('child_process');
  const root = process.cwd();

  // Discover themes: directories with theme.json
  const allThemes = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'theme.json'))
      && fs.statSync(path.join(root, dir)).isDirectory();
  });

  // If run from inside a theme dir (has theme.json in cwd), build self
  if (allThemes.length === 0 && fs.existsSync(path.join(root, 'theme.json'))) {
    const theme = JSON.parse(fs.readFileSync(path.join(root, 'theme.json'), 'utf-8'));
    const id = theme.id || path.basename(root);
    const scss = theme.exports?.scss || `./src/scss/${id}.scss`;
    const outDir = path.join(root, 'dist');
    const css = path.join(outDir, `${id}.css`);

    fs.mkdirSync(outDir, { recursive: true });
    console.log(`\n  Building ${theme.name || id}...`);

    const loadPaths = [];
    if (fs.existsSync(path.join(root, 'node_modules'))) loadPaths.push('node_modules');
    const lpArgs = loadPaths.map(p => `--load-path="${p}"`).join(' ');

    execSync(`npx sass "${scss}" "${css}" --no-source-map --silence-deprecation=import ${lpArgs}`, {
      cwd: root, stdio: 'inherit'
    });
    console.log(green(`  Built: ${css}\n`));
    return;
  }

  const targets = themeNames.length > 0 ? themeNames : allThemes;

  if (targets.length === 0) {
    console.log(`\n  No themes found. Run from a theme directory or a multi-theme workspace.\n`);
    return;
  }

  // Validate
  for (const t of targets) {
    if (!allThemes.includes(t)) {
      console.error(`\n  ${bold(t)}: not found. Available: ${allThemes.join(', ')}\n`);
      process.exit(1);
    }
  }

  console.log();
  for (const t of targets) {
    const scss = path.join(t, 'src', 'scss', `${t}.scss`);
    const outDir = path.join(t, 'dist');
    const css = path.join(outDir, `${t}.css`);

    if (!fs.existsSync(path.join(root, scss))) {
      console.error(`  ${t}: ${yellow(`SCSS not found: ${scss}`)}`);
      continue;
    }

    fs.mkdirSync(path.join(root, outDir), { recursive: true });
    process.stdout.write(`  ${t}: building... `);
    try {
      execSync(`npx sass ${scss} ${css} --no-source-map --silence-deprecation=import --load-path=node_modules`, {
        cwd: root, stdio: 'pipe'
      });
      console.log(green('done'));
    } catch (err) {
      console.log(`\x1b[31mfailed\x1b[0m`);
      if (err.stderr) console.error(`    ${err.stderr.toString().trim()}`);
    }
  }
  console.log(`\n  Built ${targets.length} theme(s): ${targets.join(', ')}\n`);
}

// ---------------------------------------------------------------------------
// pack command — package theme into distributable ZIP
// ---------------------------------------------------------------------------
function sha256File(filePath) {
  const crypto = require('crypto');
  const data = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function sha256String(content) {
  const crypto = require('crypto');
  return `sha256:${crypto.createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

async function cmdPack(themeNames, opts) {
  const { execSync } = require('child_process');
  const root = process.cwd();
  const outputDir = opts.output || 'dist';

  // Discover themes
  let allThemes = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'theme.json'))
      && fs.statSync(path.join(root, dir)).isDirectory();
  });

  // Single-theme mode: cwd has theme.json
  let singleMode = false;
  if (allThemes.length === 0 && fs.existsSync(path.join(root, 'theme.json'))) {
    singleMode = true;
    allThemes = ['.'];
  }

  const targets = themeNames.length > 0 ? themeNames : allThemes;

  if (targets.length === 0) {
    console.log(`\n  No themes found. Run from a theme directory or a multi-theme workspace.\n`);
    return;
  }

  // Build first (unless --no-build)
  if (!opts.noBuild) {
    console.log(`\n  === Building ===`);
    await cmdBuild(singleMode ? [] : themeNames);
  }

  console.log(`  === Packing ===\n`);

  let archiver;
  try {
    archiver = require('archiver');
  } catch {
    // Try to find it in the project
    try {
      archiver = require(path.join(root, 'node_modules', 'archiver'));
    } catch {
      console.error(`  Error: "archiver" package is required but not installed.`);
      console.error(`  Install it with: npm install archiver --save-dev\n`);
      process.exit(1);
    }
  }

  fs.mkdirSync(path.resolve(root, outputDir), { recursive: true });

  for (const t of targets) {
    const themeDir = singleMode ? root : path.join(root, t);
    const themeJsonPath = path.join(themeDir, 'theme.json');

    if (!fs.existsSync(themeJsonPath)) {
      console.error(`  ${t}: theme.json not found, skipping`);
      continue;
    }

    const theme = JSON.parse(fs.readFileSync(themeJsonPath, 'utf-8'));
    const id = theme.id || t;

    // Set manifest version
    theme.manifestVersion = '1.0';

    console.log(`  Packing: ${theme.name || id} v${theme.version}`);

    // Find CSS
    let cssPath = null;
    const cssCandidates = [
      theme.exports?.css ? path.resolve(themeDir, theme.exports.css) : null,
      path.join(themeDir, 'dist', `${id}.css`),
    ].filter(Boolean);

    for (const c of cssCandidates) {
      if (fs.existsSync(c)) { cssPath = c; break; }
    }

    if (!cssPath) {
      console.error(`    ${yellow('No CSS found, skipping')}`);
      continue;
    }

    // Find SCSS
    let scssPath = null;
    const scssCandidates = [
      theme.exports?.scss ? path.resolve(themeDir, theme.exports.scss) : null,
      path.join(themeDir, 'src', 'scss', `${id}.scss`),
    ].filter(Boolean);

    for (const c of scssCandidates) {
      if (fs.existsSync(c)) { scssPath = c; break; }
    }

    // Collect assets
    const ALLOWED_EXTS = new Set([
      '.woff2', '.woff', '.ttf', '.eot', '.otf',
      '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
      '.json', '.txt', '.md',
    ]);

    const assetFiles = [];
    const seenPaths = new Set();

    function addAsset(src, zipPath) {
      const resolved = path.resolve(themeDir, src);
      if (!fs.existsSync(resolved)) return;
      const ext = path.extname(resolved).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) return;
      const normalized = zipPath.replace(/\\/g, '/');
      if (seenPaths.has(normalized)) return;
      seenPaths.add(normalized);
      assetFiles.push({ src: resolved, zip: normalized });
    }

    // Font files
    if (theme.fonts?.files) {
      for (const f of theme.fonts.files) {
        if (f.src) addAsset(f.src, `assets/fonts/${path.basename(f.src)}`);
      }
    }

    // Named assets
    if (theme.assets) {
      if (theme.assets.favicon) addAsset(theme.assets.favicon, `assets/${path.basename(theme.assets.favicon)}`);
      if (theme.assets.logo) addAsset(theme.assets.logo, `assets/${path.basename(theme.assets.logo)}`);
      if (theme.assets.logoSmall) addAsset(theme.assets.logoSmall, `assets/${path.basename(theme.assets.logoSmall)}`);
      if (Array.isArray(theme.assets.files)) {
        for (const f of theme.assets.files) addAsset(f, `assets/${path.normalize(f).replace(/\\/g, '/')}`);
      }
    }

    // URL rewriting for bundled assets
    const assetLookup = new Map();
    for (const af of assetFiles) assetLookup.set(path.basename(af.zip), af.zip);

    function rewriteUrls(content) {
      if (assetLookup.size === 0) return content;
      return content.replace(/url\(([^)]+)\)/g, (match, rawUrl) => {
        const url = rawUrl.trim().replace(/^['"]|['"]$/g, '');
        if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return match;
        const filename = path.posix.basename(url.split('?')[0].split('#')[0]);
        if (assetLookup.has(filename)) return `url(../${assetLookup.get(filename)})`;
        return match;
      });
    }

    let cssContent = rewriteUrls(fs.readFileSync(cssPath, 'utf-8'));
    let scssContent = scssPath ? rewriteUrls(fs.readFileSync(scssPath, 'utf-8')) : null;

    // Find thumbnail
    let thumbnailPath = null;
    for (const c of [
      theme.preview?.thumbnail ? path.resolve(themeDir, theme.preview.thumbnail) : null,
      path.join(themeDir, 'preview', 'thumbnail.png'),
      path.join(themeDir, 'preview', 'thumbnail.jpg'),
    ].filter(Boolean)) {
      if (fs.existsSync(c)) { thumbnailPath = c; break; }
    }

    // Generate README
    const allModeIds = new Set();
    for (const v of (theme.colorVariants || [])) {
      for (const m of (v.modes || [])) allModeIds.add(m.id);
    }
    const modesText = allModeIds.size > 0 ? [...allModeIds].join(', ') : 'light';
    const coreVersionText = theme.coreVersion || theme.dependencies?.core || '>=1.5.0';

    const readme = `# ${theme.name}\n\n${theme.description || ''}\n\n- **Version:** ${theme.version}\n- **Author:** ${theme.author || 'Unknown'}\n- **License:** ${theme.license || 'MIT'}\n- **Modes:** ${modesText}\n- **Core Version:** ${coreVersionText}\n${theme.tags?.length ? `- **Tags:** ${theme.tags.join(', ')}` : ''}\n\n## Quick Start\n\n\`\`\`html\n<link rel="stylesheet" href="css/${id}.css">\n\`\`\`\n\n---\n*Generated by pureadmin v${TOOL_VERSION}*\n`;

    // Compute checksums
    const checksums = {
      css: sha256String(cssContent),
    };
    if (scssContent) checksums.scss = sha256String(scssContent);

    if (assetFiles.length > 0) {
      checksums.assets = {};
      for (const af of assetFiles) checksums.assets[af.zip] = sha256File(af.src);
    }

    // checksums.files — all files
    const fileChecksums = {};
    fileChecksums[`css/${id}.css`] = sha256String(cssContent);
    if (scssContent) fileChecksums[`scss/${id}.scss`] = sha256String(scssContent);
    if (thumbnailPath) fileChecksums[`preview/${path.basename(thumbnailPath)}`] = sha256File(thumbnailPath);
    for (const af of assetFiles) fileChecksums[af.zip] = sha256File(af.src);
    fileChecksums['README.md'] = sha256String(readme);
    checksums.files = fileChecksums;

    // checksums.metadata
    const METADATA_FIELDS = ['author', 'content', 'description', 'id', 'license', 'name', 'tags', 'version'];
    const metadataObj = {};
    for (const key of METADATA_FIELDS) {
      if (theme[key] !== undefined) metadataObj[key] = theme[key];
    }
    checksums.metadata = sha256String(JSON.stringify(metadataObj, METADATA_FIELDS.filter(k => k in metadataObj)));

    // checksums.content_sha
    const contentShaPayload = Object.entries(fileChecksums)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([p, h]) => `${p}:${h}`)
      .join('\n') + '\n' + checksums.metadata;
    checksums.content_sha = sha256String(contentShaPayload);

    // Detect external domains
    const URL_RE = /url\(\s*['"]?(https?:\/\/[^'"\)\s]+)['"]?\s*\)/gi;
    const IMPORT_RE = /@import\s+['"]?(https?:\/\/[^'"\s;]+)['"]?/gi;
    const detected = new Set();
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(cssContent))) { try { detected.add(new URL(m[1]).hostname.toLowerCase()); } catch {} }
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(cssContent))) { try { detected.add(new URL(m[1]).hostname.toLowerCase()); } catch {} }

    const declared = new Set(theme.external_domains || []);
    const undeclared = [...detected].filter(d => !declared.has(d));
    if (undeclared.length > 0) {
      console.log(yellow(`    Warning: undeclared external domains: ${undeclared.join(', ')}`));
    }

    const externalDomains = [...new Set([...(theme.external_domains || []), ...detected])].sort();

    // Check undeclared JS
    const declaredScripts = new Set((theme.scripts || []).map(s => s.file));
    const undeclaredJs = assetFiles.filter(af => af.zip.endsWith('.js') && !declaredScripts.has(af.zip));
    if (undeclaredJs.length > 0) {
      console.error(`    ${bold('Error:')} undeclared JS files: ${undeclaredJs.map(a => a.zip).join(', ')}`);
      continue;
    }

    // Build enriched theme.json
    const enriched = {
      ...theme,
      checksums,
      external_domains: externalDomains.length > 0 ? externalDomains : undefined,
      scripts: theme.scripts?.length > 0 ? theme.scripts : undefined,
    };
    delete enriched.$schema;
    const enrichedJson = JSON.stringify(enriched, null, 2) + '\n';

    // Create ZIP
    const zipName = `pure-admin-theme-${id}-${theme.version}.zip`;
    const zipPath = path.resolve(root, outputDir, zipName);

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      output.on('close', resolve);

      archive.pipe(output);
      archive.append(enrichedJson, { name: 'theme.json' });
      archive.append(cssContent, { name: `css/${id}.css` });
      if (scssContent) archive.append(scssContent, { name: `scss/${id}.scss` });
      if (thumbnailPath) archive.file(thumbnailPath, { name: `preview/${path.basename(thumbnailPath)}` });
      for (const af of assetFiles) archive.file(af.src, { name: af.zip });
      archive.append(readme, { name: 'README.md' });
      archive.finalize();
    });

    const sizeKB = (fs.statSync(zipPath).size / 1024).toFixed(1);
    console.log(`    ${green(zipName)} ${dim(`(${sizeKB} KB)`)}  ${dim(`content_sha: ${checksums.content_sha.slice(0, 20)}...`)}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// publish command — pack + upload to pureadmin.io
// ---------------------------------------------------------------------------
async function cmdPublish(themeNames, opts) {
  const { execSync } = require('child_process');
  const root = process.cwd();

  // Resolve API key: --api-key > pure-admin.json > ~/.pure-admin.json > env
  const apiKey = opts.apiKey
    || config.apiKey
    || process.env.PUREADMIN_API_KEY
    || '';

  if (!apiKey) {
    console.error(`\n  ${bold('Error:')} API key is required.`);
    console.error(`  Set it via:`);
    console.error(`    --api-key KEY`);
    console.error(`    pure-admin.json: { "apiKey": "..." }`);
    console.error(`    ~/.pure-admin.json: { "apiKey": "..." }`);
    console.error(`    PUREADMIN_API_KEY=... environment variable\n`);
    process.exit(1);
  }

  // Pack first
  await cmdPack(themeNames, { ...opts, output: opts.output || 'dist' });

  // Find packed ZIPs
  const distDir = path.resolve(root, opts.output || 'dist');
  const allThemes = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'theme.json'))
      && fs.statSync(path.join(root, dir)).isDirectory();
  });

  // Single theme mode
  let targets;
  if (allThemes.length === 0 && fs.existsSync(path.join(root, 'theme.json'))) {
    const tj = JSON.parse(fs.readFileSync(path.join(root, 'theme.json'), 'utf-8'));
    targets = [{ slug: tj.id, version: tj.version }];
  } else {
    const slugs = themeNames.length > 0 ? themeNames : allThemes;
    targets = slugs.map(t => {
      const tj = JSON.parse(fs.readFileSync(path.join(root, t, 'theme.json'), 'utf-8'));
      return { slug: tj.id || t, version: tj.version };
    });
  }

  const uploadUrl = `${BASE_URL}/api/themes/upload`;
  console.log(bold(`  === Uploading ===\n`));

  let updated = 0, unchanged = 0, errors = 0;

  for (const { slug, version } of targets) {
    const zipName = `pure-admin-theme-${slug}-${version}.zip`;
    const zipPath = path.join(distDir, zipName);

    if (!fs.existsSync(zipPath)) {
      console.log(`  ${slug}: \x1b[31mZIP not found: ${zipName}\x1b[0m`);
      errors++;
      continue;
    }

    process.stdout.write(`  ${slug} v${version}: uploading... `);
    try {
      const output = execSync(
        `curl -sf -X POST "${uploadUrl}" -H "Authorization: Bearer ${apiKey}" -F "theme=@${zipPath}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const result = JSON.parse(output);
      if (result.status === 'unchanged') {
        console.log(yellow('unchanged'));
        unchanged++;
      } else {
        console.log(green('updated'));
        updated++;
      }
    } catch {
      console.log(`\x1b[31mfailed\x1b[0m`);
      errors++;
    }
  }

  console.log(`\n  ${bold('Summary:')} ${green(`${updated} updated`)}, ${yellow(`${unchanged} unchanged`)}, ${errors > 0 ? `\x1b[31m${errors} failed\x1b[0m` : dim(`${errors} failed`)}\n`);
  if (errors > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function usage(error) {
  if (error) console.error(`\n  \x1b[31mError: ${error}\x1b[0m`);

  console.log(`
  ${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)} — Pure Admin theme CLI

  ${bold('Usage:')}
    pureadmin <command> [options]

  ${bold('Commands:')}
    list                        List all themes
    info <slug>                 Show theme details, versions, core compat
    versions <slug>             Show available versions for a theme
    search <query>              Search themes by name or description
    compatible <core-version>   List themes compatible with a core version
    download <slug> [options]   Download a theme ZIP
    init <id> [name]            Scaffold a new theme project with tools
    create <name> [options]     Create a SvelteKit app with Pure Admin
    themes [slug...]            List or add themes to project
    update                      Re-download changed themes
    build [theme...]            Compile SCSS to CSS
    pack [theme...]             Package theme(s) into ZIP
    publish [theme...]          Pack + upload to pureadmin.io
    validate [theme...]         Check CSS for readability, variables, consistency

  ${bold('Download options:')}
    --version <ver>             Download specific version (default: latest)
    --output <file>             Output filename

  ${bold('Create options:')}
    --template <name>           App template (default: sveltekit)
    --themes <list>             Comma-separated theme slugs (default: corporate,audi,dark)
    --theme <slug>              Default theme (default: first in --themes)

  ${bold('Themes options:')}
    --offline                   Commit theme files to repo (for builds without network)
    --dir <path>                Theme output directory (default: static/themes)

  ${bold('Global options:')}
    --server <url>              Override API base URL for this invocation

  ${bold('Configuration (in order of precedence):')}
    --server <url>              CLI flag
    PUREADMIN_URL               Environment variable
    pure-admin.json             Project config (searched up from cwd)
    ~/.pure-admin.json          User config

  ${bold('Examples:')}
    pureadmin list
    pureadmin info audi
    pureadmin versions dark
    pureadmin search "dark font"
    pureadmin compatible 2.0.0
    pureadmin download audi
    pureadmin download audi --version 2.0.2
    pureadmin init my-theme "My Custom Theme"
    pureadmin create my-app
    pureadmin create my-app --themes audi,dark --theme audi
    pureadmin themes                                          ${dim('list configured')}
    pureadmin themes express                                  ${dim('add + download')}
    pureadmin themes express --offline                        ${dim('add + download (committed)')}
    pureadmin themes audi dark express                        ${dim('add multiple')}
    pureadmin themes express --dir public/themes              ${dim('custom output dir')}
    pureadmin update                                          ${dim('re-download changed')}
    pureadmin build                                           ${dim('build all themes')}
    pureadmin build audi                                      ${dim('build one theme')}
    pureadmin pack                                            ${dim('build + pack all')}
    pureadmin pack audi --no-build                            ${dim('pack without building')}
    pureadmin publish                                         ${dim('pack + upload all')}
    pureadmin publish audi --api-key KEY                      ${dim('publish one theme')}
    pureadmin validate                                         ${dim('validate all themes')}
    pureadmin validate audi                                    ${dim('validate one theme')}
`);
  process.exit(error ? 1 : 0);
}

// ---------------------------------------------------------------------------
// validate — Check theme CSS for readability, missing variables, consistency
// ---------------------------------------------------------------------------
async function cmdValidate(themeNames) {
  const root = process.cwd();
  const PASS = green('✓');
  const FAIL = red('✗');
  const WARN = yellow('⚠');

  // Discover themes
  let allThemes = fs.readdirSync(root).filter(dir =>
    fs.existsSync(path.join(root, dir, 'theme.json'))
    && fs.statSync(path.join(root, dir)).isDirectory()
  );

  let singleMode = false;
  if (allThemes.length === 0 && fs.existsSync(path.join(root, 'theme.json'))) {
    singleMode = true;
  }

  const targets = themeNames.length > 0 ? themeNames : (singleMode ? ['.'] : allThemes);

  if (targets.length === 0) {
    console.log(`\n  No themes found. Run from a theme directory or a multi-theme workspace.\n`);
    return;
  }

  // Validate requested themes exist
  if (!singleMode) {
    for (const t of themeNames) {
      if (!allThemes.includes(t)) {
        console.error(`\n  ${bold(t)}: not found. Available: ${allThemes.join(', ')}\n`);
        process.exit(1);
      }
    }
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let passedThemes = 0;

  console.log();
  for (const t of targets) {
    const themeDir = singleMode ? root : path.join(root, t);
    const themeJsonPath = path.join(themeDir, 'theme.json');
    if (!fs.existsSync(themeJsonPath)) {
      console.log(`  ${bold(t)}: ${red('theme.json not found')}\n`);
      totalErrors++;
      continue;
    }
    const theme = JSON.parse(fs.readFileSync(themeJsonPath, 'utf-8'));
    const id = theme.id || (singleMode ? path.basename(root) : t);
    const cssPath = path.join(themeDir, 'dist', `${id}.css`);

    if (!fs.existsSync(cssPath)) {
      console.log(`  ${bold(id)}: ${red(`CSS not found: dist/${id}.css — run build first`)}\n`);
      totalErrors++;
      continue;
    }

    const css = fs.readFileSync(cssPath, 'utf-8');
    console.log(`  ${bold(`Validating ${theme.name || id}...`)}`);

    const { results, errors, warnings } = validateThemeCss(css, id);

    // Readability
    if (results.readability.length > 0) {
      console.log(`\n  ${bold('Readability')}`);
      for (const r of results.readability) {
        const icon = r.status === 'pass' ? PASS : r.status === 'fail' ? FAIL : r.status === 'warn' ? WARN : dim('–');
        const detail = r.detail ? dim(`  ${r.detail}`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    // CSS Variables
    if (results.variables.length > 0) {
      console.log(`\n  ${bold('CSS Variables')}`);
      for (const r of results.variables) {
        const icon = r.status === 'pass' ? PASS : FAIL;
        const detail = r.detail ? `  ${red(r.detail)}` : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    // Consistency
    if (results.consistency.length > 0) {
      console.log(`\n  ${bold('Consistency')}`);
      for (const r of results.consistency) {
        const icon = r.status === 'pass' ? PASS : r.status === 'warn' ? WARN : FAIL;
        const detail = r.detail ? dim(`  (${r.detail})`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    // Per-theme summary
    const parts = [];
    if (errors.length > 0) parts.push(red(`${errors.length} error(s)`));
    if (warnings.length > 0) parts.push(yellow(`${warnings.length} warning(s)`));
    if (parts.length === 0) parts.push(green('all passed'));
    console.log(`\n  ${dim(id + ':')} ${parts.join(', ')}\n`);

    totalErrors += errors.length;
    totalWarnings += warnings.length;
    if (errors.length === 0) passedThemes++;
  }

  // Multi-theme summary
  if (targets.length > 1) {
    const failedThemes = targets.length - passedThemes;
    console.log(`  ${bold('Summary:')} Validated ${targets.length} theme(s): ${green(`${passedThemes} passed`)}${failedThemes > 0 ? `, ${red(`${failedThemes} with errors`)}` : ''}\n`);
  }

  if (totalErrors > 0) process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return usage();
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(`pureadmin v${TOOL_VERSION}`);
    return;
  }

  const command = args[0];
  const rest = args.slice(1);

  // Parse flags (pre-scan for --server since it affects BASE_URL)
  const opts = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--server' && rest[i + 1]) {
      opts.server = rest[++i];
    } else if (rest[i] === '--version' && rest[i + 1]) {
      opts.version = rest[++i];
    } else if (rest[i] === '--output' && rest[i + 1]) {
      opts.output = rest[++i];
    } else if (rest[i] === '--template' && rest[i + 1]) {
      opts.template = rest[++i];
    } else if (rest[i] === '--themes' && rest[i + 1]) {
      opts.themes = rest[++i];
    } else if (rest[i] === '--theme' && rest[i + 1]) {
      opts.theme = rest[++i];
    } else if (rest[i] === '--offline') {
      opts.offline = true;
    } else if (rest[i] === '--no-build') {
      opts.noBuild = true;
    } else if (rest[i] === '--api-key' && rest[i + 1]) {
      opts.apiKey = rest[++i];
    } else if (rest[i] === '--dir' && rest[i + 1]) {
      opts.dir = rest[++i];
    } else if (!rest[i].startsWith('--')) {
      positional.push(rest[i]);
    }
  }

  // Apply --server override (highest priority after env var)
  let urlSource = '';
  if (opts.server) {
    BASE_URL = opts.server.replace(/\/+$/, '');
    urlSource = dim(' (--server)');
  } else if (process.env.PUREADMIN_URL) {
    urlSource = dim(' ($PUREADMIN_URL)');
  } else if (config._configPath) {
    urlSource = dim(` (${config._configPath})`);
  }

  // Header
  console.log(`${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)}  ${dim('→')} ${cyan(BASE_URL)}${urlSource}`);

  try {
    switch (command) {
      case 'list': return await cmdList();
      case 'info': return await cmdInfo(positional[0]);
      case 'versions': return await cmdVersions(positional[0]);
      case 'search': return await cmdSearch(positional.join(' '));
      case 'compatible': return await cmdCompatible(positional[0]);
      case 'download': return await cmdDownload(positional[0], opts);
      case 'init': return await cmdInit(positional[0], positional.slice(1).join(' ') || undefined);
      case 'create': return await cmdCreate(positional[0], opts);
      case 'themes': return await cmdThemes(positional, opts);
      case 'update': return await cmdUpdate();
      case 'build': return await cmdBuild(positional);
      case 'pack': return await cmdPack(positional, opts);
      case 'publish': return await cmdPublish(positional, opts);
      case 'validate': return await cmdValidate(positional);
      default: return usage(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`\n  \x1b[31mError: ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

main();
