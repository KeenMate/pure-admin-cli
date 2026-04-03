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

const fs = require('fs');
const path = require('path');

const TOOL_VERSION = require(path.join(__dirname, '..', 'package.json')).version;
const TOOL_NAME = 'pureadmin';

// ---------------------------------------------------------------------------
// Config: pureadmin.json + .pureadmin.json → env var → default
// ---------------------------------------------------------------------------

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

function fetchText(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlPath}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
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

  // --- Command Palette readability ---
  for (const mode of modes) {
    const modalBg = extractCssVarFromBlock(mode.css, '--pa-modal-content-bg');
    const textColor = extractCssVarFromBlock(mode.css, '--pa-text-color-1');
    const highlightBg = extractCssVarFromBlock(mode.css, '--pa-command-palette-highlight-bg');
    const highlightText = extractCssVarFromBlock(mode.css, '--pa-command-palette-highlight-text');

    if (modalBg && textColor && modalBg.startsWith('#') && textColor.startsWith('#')) {
      const ratio = contrastRatio(textColor, modalBg);
      const label = `${mode.name} → command palette text`;
      const detail = `--pa-text-color-1: ${textColor} on --pa-modal-content-bg: ${modalBg}`;
      if (ratio < 3) {
        results.readability.push({ name: label, status: 'fail', detail: `${ratio.toFixed(1)}:1  ${detail}  (min 3:1)` });
        errors.push(`${label} ${ratio.toFixed(1)}:1`);
      } else if (ratio < 4.5) {
        results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail}  (recommended 4.5:1)` });
        warnings.push(`${label} ${ratio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
      }
    }

    const keyBg = extractCssVarFromBlock(mode.css, '--pa-command-palette-key-bg');
    const keyText = extractCssVarFromBlock(mode.css, '--pa-command-palette-key-text');
    if (keyBg && keyText && keyBg.startsWith('#') && keyText.startsWith('#')) {
      const ratio = contrastRatio(keyText, keyBg);
      const label = `${mode.name} → command palette key badge`;
      const detail = `--pa-command-palette-key-text: ${keyText} on --pa-command-palette-key-bg: ${keyBg}`;
      if (ratio < 3) {
        results.readability.push({ name: label, status: 'fail', detail: `${ratio.toFixed(1)}:1  ${detail}  (min 3:1)` });
        errors.push(`${label} ${ratio.toFixed(1)}:1`);
      } else if (ratio < 4.5) {
        results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail}  (recommended 4.5:1)` });
        warnings.push(`${label} ${ratio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
      }
    }

    if (highlightBg && highlightText && highlightBg.startsWith('#') && highlightText.startsWith('#')) {
      const ratio = contrastRatio(highlightText, highlightBg);
      const label = `${mode.name} → command palette highlight`;
      const detail = `--pa-command-palette-highlight-text: ${highlightText} on --pa-command-palette-highlight-bg: ${highlightBg}`;
      if (ratio < 3) {
        results.readability.push({ name: label, status: 'fail', detail: `${ratio.toFixed(1)}:1  ${detail}  (min 3:1)` });
        errors.push(`${label} ${ratio.toFixed(1)}:1`);
      } else if (ratio < 4.5) {
        results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail}  (recommended 4.5:1)` });
        warnings.push(`${label} ${ratio.toFixed(1)}:1`);
      } else {
        results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
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

  // Resolve company + preset profiles from config
  const company = opts.company ? (config.companies || {})[opts.company] : null;
  const preset = opts.preset ? (config.presets || {})[opts.preset] : null;
  const fallback = config.create || {};

  // Merge: CLI flags > preset > company > config.create defaults
  function resolve(key, cliVal) {
    if (cliVal !== undefined) return cliVal;
    if (preset && preset[key] !== undefined) return preset[key];
    if (company && company[key] !== undefined) return company[key];
    return fallback[key];
  }

  const template = resolve('template', opts.template) || 'sveltekit';
  const themeIds = (resolve('themes', opts.themes) || resolve('defaultThemes') || 'corporate,audi,dark').split(',').map(s => s.trim());
  const defaultTheme = resolve('defaultTheme', opts.theme) || themeIds[0];
  const displayName = opts.name || (company?.name) || appName.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const copyright = resolve('copyright') || displayName;
  const logo = resolve('logo') || '';
  const includeFontAwesome = opts.fontAwesome || resolve('fontAwesome') || false;
  const includeProfilePanel = opts.profilePanel || resolve('profilePanel') || false;
  const includeSettingsPanel = opts.settingsPanel || resolve('settingsPanel') || false;
  const includeMakefile = !opts.noMakefile && (resolve('makefile') !== false);
  const skipInstall = opts.noInstall || false;
  const verbose = opts.verbose || false;

  console.log();
  console.log(bold(`  Creating ${displayName}`) + dim(` (${template} + Pure Admin)`));
  if (opts.company) console.log(`  ${dim('Company:')} ${company?.name || opts.company}`);
  if (opts.preset) console.log(`  ${dim('Preset:')} ${opts.preset}`);
  console.log(`  ${dim('Themes:')} ${themeIds.join(', ')} ${dim(`(default: ${defaultTheme})`)}`);
  if (includeFontAwesome) console.log(`  ${dim('Icons:')} FontAwesome (CDN)`);
  console.log();

  const { execSync } = require('child_process');

  // Detect package manager: prefer pnpm > bun > npm
  function detectPm() {
    for (const pm of ['pnpm', 'bun']) {
      try { execSync(`${pm} --version`, { stdio: 'pipe' }); return pm; } catch {}
    }
    return 'npm';
  }
  const pm = detectPm();
  if (pm !== 'npm') console.log(`  ${dim('Package manager:')} ${pm}`);

  // Helper: substitute placeholders — supports both {{VAR}} and __VAR__ syntax
  function substituteVars(text) {
    let result = text;

    // Simple replacements (both formats)
    function sub(name, value) {
      result = result.split(`{{${name}}}`).join(value);
      result = result.split(`__${name}__`).join(value);
    }

    sub('APP_NAME', displayName);
    sub('APP_DISPLAY_NAME', displayName);
    sub('APP_ID', appName);
    sub('COPYRIGHT', copyright);
    sub('LOGO', logo);
    sub('DEFAULT_THEME', defaultTheme);
    sub('THEME_IDS_QUOTED', themeIds.map(id => `'${id}'`).join(', '));
    sub('USER_NAME', 'User');
    sub('USER_EMAIL', 'user@example.com');
    sub('USER_NAME_URL', 'User');

    // Conditional blocks (old bundled template format only)
    result = result.replace(/\{\{#FONT_AWESOME\}\}([\s\S]*?)\{\{\/FONT_AWESOME\}\}/g,
      includeFontAwesome ? '$1' : '');
    result = result.replace(/\{\{#PROFILE_PANEL\}\}([\s\S]*?)\{\{\/PROFILE_PANEL\}\}/g,
      includeProfilePanel ? '$1' : '');
    result = result.replace(/\{\{#SETTINGS_PANEL\}\}([\s\S]*?)\{\{\/SETTINGS_PANEL\}\}/g,
      includeSettingsPanel ? '$1' : '');

    // Late-bound variables (set after theme data is fetched)
    if (substituteVars._themeOptions) { sub('THEME_OPTIONS', substituteVars._themeOptions); }
    if (substituteVars._themesConfig) { sub('THEMES_CONFIG', substituteVars._themesConfig); }
    if (substituteVars._sidebarItems) { sub('SIDEBAR_ITEMS', substituteVars._sidebarItems); }

    // Per-page variables (set by caller)
    if (substituteVars._pageLabel) { sub('PAGE_LABEL', substituteVars._pageLabel); }
    if (substituteVars._pageEntity) { sub('PAGE_ENTITY', substituteVars._pageEntity); }

    return result;
  }

  // 1. Fetch recipe from server
  process.stdout.write(`  Fetching ${template} recipe... `);
  let recipe;
  try {
    recipe = await fetchJson(`/api/tools/templates/${template}`);
    console.log(green(`v${recipe.version || 'latest'}`));
    if (opts.verbose) {
      console.log(dim(`    recipe: ${recipe.steps?.length || 0} steps, ${Object.keys(recipe.dependencies || {}).length} deps`));
    }
  } catch {
    // Fall back to bundled recipe JSON
    const localRecipePath = path.join(__dirname, '..', 'templates', `${template}.json`);
    if (fs.existsSync(localRecipePath)) {
      try { recipe = JSON.parse(fs.readFileSync(localRecipePath, 'utf-8')); } catch { recipe = null; }
      console.log(yellow(`local fallback v${recipe?.version || '?'}`));
    } else {
      console.log(yellow('no recipe available'));
      recipe = null;
    }
    if (opts.verbose) console.log(dim(`    fallback: bundled templates from ${path.join(__dirname, '..', 'templates', template)}`));
  }

  const appDir = path.join(process.cwd(), appName);

  // 2. Scaffold or copy template
  if (opts.templatePath) {
    // Local template path — copy entire directory (skip node_modules, .svelte-kit, dist, .git)
    const srcDir = path.resolve(opts.templatePath);
    if (!fs.existsSync(srcDir)) {
      console.error(`\n  ${bold('Error:')} template path not found: ${srcDir}`);
      process.exit(1);
    }
    console.log(`  Copying template from ${dim(srcDir)}...`);
    copyDirSync(srcDir, appDir, ['node_modules', '.svelte-kit', 'dist', '.git', 'build']);

    // Read template manifest if present
    const tmplManifestPath = path.join(appDir, 'template.json');
    if (fs.existsSync(tmplManifestPath) && !recipe) {
      try { recipe = JSON.parse(fs.readFileSync(tmplManifestPath, 'utf-8')); } catch {}
    }
    console.log(green(`  Template copied (${recipe?.displayName || template})`));
  } else {
    // Scaffold from scratch (always --no-install — we install after recipe steps)
    const scaffoldCmd = recipe?.scaffold?.command || `npx sv create {{APP_ID}} --template minimal --types ts --no-add-ons --no-install`;
    const scaffoldFallback = recipe?.scaffold?.fallback || `npm create svelte@latest {{APP_ID}} -- --template skeleton --types ts`;

    console.log(`  Running ${template} scaffold...`);
    if (opts.verbose) console.log(dim(`    command: ${substituteVars(scaffoldCmd)}`));
    try {
      execSync(substituteVars(scaffoldCmd), { cwd: process.cwd(), stdio: 'inherit' });
    } catch {
      try {
        execSync(substituteVars(scaffoldFallback), { cwd: process.cwd(), stdio: 'inherit' });
      } catch {
        console.error(`\n  ${bold('Scaffold failed.')} Create the project manually and re-run.`);
        process.exit(1);
      }
    }
  }

  // 3. Fetch theme data for template variables
  process.stdout.write(`  Fetching theme data... `);
  let themesData;
  try {
    const result = await fetchJson('/api/themes');
    themesData = result.themes.filter(t => themeIds.includes(t.slug));
    console.log(green(`${themesData.length} theme(s)`));
  } catch {
    console.log(yellow('failed, using defaults'));
    themesData = themeIds.map(id => ({
      slug: id,
      name: id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      latest: 'latest'
    }));
  }

  // 4. Set theme-dependent template variables
  substituteVars._themeOptions = themesData.map(t =>
    `\t\t{ id: '${t.slug}', name: '${t.name}', cssPath: '/themes/${t.slug}/css/${t.slug}.css' }`
  ).join(',\n');
  substituteVars._themesConfig = themeIds.map(id => {
    const t = themesData.find(d => d.slug === id);
    return `    "${id}": { "version": "${t?.latest || 'latest'}", "offline": false }`;
  }).join(',\n');

  // 5. Resolve pages from preset or recipe defaults
  const pageTypes = recipe?.pageTypes || {};
  const pages = (preset?.pages) || recipe?.defaultPages || [{ type: 'dashboard', label: 'Dashboard' }];

  // Build sidebar items from pages
  const sidebarItems = pages
    .filter(p => pageTypes[p.type]?.icon !== null)
    .map(p => {
      const pt = pageTypes[p.type] || {};
      const label = p.label || pt.defaultLabel || p.type;
      const icon = p.icon || pt.icon || 'fa fa-circle';
      const entity = p.entity || p.type;
      const href = p.type === 'dashboard' ? '/' : `/${entity}`;
      return `\t\t\t\t<SidebarItem href="${href}" labelText="${label}">\n\t\t\t\t\t{#snippet icon()}<i class="${icon}"></i>{/snippet}\n\t\t\t\t</SidebarItem>`;
    })
    .join('\n');

  // Register sidebar items for variable substitution
  substituteVars._sidebarItems = sidebarItems;

  // Generate page route steps
  const pageSteps = pages.map(p => {
    const pt = pageTypes[p.type] || {};
    const entity = p.entity || p.type;
    const route = (pt.route || `src/routes/${entity}/+page.svelte`).replace(/\{\{entity\}\}/g, entity);
    return {
      action: 'create',
      path: route,
      template: pt.template || `pages/${p.type}.svelte`,
      _pageLabel: p.label || pt.defaultLabel || entity,
      _pageEntity: entity,
    };
  });

  // 6. If using --template-path, substitute placeholders in all copied files
  if (opts.templatePath) {
    console.log(`  Substituting placeholders...`);
    const exts = ['.svelte', '.html', '.css', '.ts', '.js', '.json', '.md'];
    function walkAndSubstitute(dir) {
      for (const entry of fs.readdirSync(dir)) {
        if (['node_modules', '.svelte-kit', '.git'].includes(entry)) continue;
        const p = path.join(dir, entry);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          walkAndSubstitute(p);
        } else if (exts.some(e => entry.endsWith(e))) {
          let content = fs.readFileSync(p, 'utf-8');
          const replaced = substituteVars(content);
          if (replaced !== content) {
            fs.writeFileSync(p, replaced);
            if (verbose) console.log(`    ${green('~')} ${path.relative(appDir, p)}`);
          }
        }
      }
    }
    walkAndSubstitute(appDir);
  }

  // 7. Execute recipe steps + page steps
  const allSteps = [
    ...(recipe?.steps || [
      { action: 'create', path: 'src/app.html', template: 'app.html' },
      { action: 'create', path: 'src/app.css', template: 'app.css' },
      { action: 'create', path: 'src/routes/+layout.svelte', template: 'layout.svelte' },
      { action: 'create', path: 'pureadmin.json', template: 'pureadmin.json' },
      { action: 'json-merge', path: 'package.json', data: { scripts: { themes: 'pureadmin themes', 'themes:update': 'pureadmin update' } } },
    ]),
    ...(includeMakefile ? [{ action: 'create', path: 'Makefile', template: 'Makefile' }] : []),
    ...pageSteps,
  ];
  // When using --template-path, skip 'create' steps (files already copied), keep json-merge and pages
  const steps = opts.templatePath
    ? allSteps.filter(s => s.action !== 'create' || s._pageLabel)  // keep page creates + non-create steps
    : allSteps;

  // Pipeline: fetch all templates, then substitute, then write
  const localTemplatesDir = path.join(__dirname, '..', 'templates', template);

  // Fetch template content from server or local fallback
  async function fetchTemplate(templateName) {
    try {
      const content = await fetchText(`/api/tools/templates/${template}/${templateName}`);
      return { content, source: 'server' };
    } catch {
      const localPath = path.join(localTemplatesDir, templateName);
      if (fs.existsSync(localPath)) {
        return { content: fs.readFileSync(localPath, 'utf-8'), source: 'local' };
      }
      return null;
    }
  }

  console.log(`  Applying ${steps.length} template steps...`);
  for (const step of steps) {
    const destPath = path.join(appDir, step.path);
    const action = step.action || 'create';

    // --- delete action ---
    if (action === 'delete') {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
        console.log(`    ${green('-')} ${step.path} ${verbose ? dim('[deleted]') : ''}`);
      } else if (verbose) {
        console.log(`    ${dim('-')} ${step.path} ${dim('[already absent]')}`);
      }
      continue;
    }

    // --- json-merge action ---
    if (action === 'json-merge') {
      let mergeData;
      if (step.template) {
        const tmpl = await fetchTemplate(step.template);
        if (tmpl) mergeData = JSON.parse(substituteVars(tmpl.content));
      } else if (step.data) {
        mergeData = JSON.parse(substituteVars(JSON.stringify(step.data)));
      }
      if (mergeData && fs.existsSync(destPath)) {
        const existing = JSON.parse(fs.readFileSync(destPath, 'utf-8'));
        const merged = deepMerge(existing, mergeData);
        fs.writeFileSync(destPath, JSON.stringify(merged, null, 2) + '\n');
        console.log(`    ${green('~')} ${step.path} ${verbose ? dim(`[json-merge, ${Object.keys(mergeData).length} keys]`) : ''}`);
      } else if (mergeData) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, JSON.stringify(mergeData, null, 2) + '\n');
        console.log(`    ${green('+')} ${step.path} ${verbose ? dim('[json-merge, new file]') : ''}`);
      }
      continue;
    }

    // --- patch action (find/replace in existing file) ---
    if (action === 'patch') {
      if (fs.existsSync(destPath) && step.find && step.replace != null) {
        let fileContent = fs.readFileSync(destPath, 'utf-8');
        const find = substituteVars(step.find);
        const replace = substituteVars(step.replace);
        if (fileContent.includes(find)) {
          fileContent = fileContent.replace(find, replace);
          fs.writeFileSync(destPath, fileContent);
          console.log(`    ${green('~')} ${step.path} ${verbose ? dim('[patch]') : ''}`);
        } else if (verbose) {
          console.log(`    ${yellow('!')} ${step.path} ${dim('[patch target not found]')}`);
        }
      }
      continue;
    }

    // --- append / prepend actions ---
    if (action === 'append' || action === 'prepend') {
      const tmpl = step.template ? await fetchTemplate(step.template) : null;
      const text = tmpl ? substituteVars(tmpl.content) : (step.text ? substituteVars(step.text) : null);
      if (text && fs.existsSync(destPath)) {
        let fileContent = fs.readFileSync(destPath, 'utf-8');
        fileContent = action === 'append' ? fileContent + text : text + fileContent;
        fs.writeFileSync(destPath, fileContent);
        console.log(`    ${green('~')} ${step.path} ${verbose ? dim(`[${action}]`) : ''}`);
      }
      continue;
    }

    // --- create action (default) ---
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const tmpl = step.template ? await fetchTemplate(step.template) : null;
    if (!tmpl) {
      console.log(`    ${yellow('!')} ${step.path} ${dim('(template not available)')}`);
      continue;
    }

    // Set per-page variables if this is a page step
    substituteVars._pageLabel = step._pageLabel || null;
    substituteVars._pageEntity = step._pageEntity || null;

    let content = substituteVars(tmpl.content);
    fs.writeFileSync(destPath, content);

    if (verbose) {
      const sizeKB = (content.length / 1024).toFixed(1);
      const vars = (content.match(/\{\{[A-Z_]+\}\}/g) || []);
      const unreplaced = vars.length > 0 ? yellow(` ${vars.length} unreplaced var(s): ${vars.join(', ')}`) : '';
      console.log(`    ${green('+')} ${step.path} ${dim(`[${tmpl.source}, ${step.template}, ${sizeKB}KB]`)}${unreplaced}`);
    } else {
      console.log(`    ${green('+')} ${step.path}`);
    }
  }

  // 6. Process template points — remove disabled feature blocks
  const featureFlags = {
    'navbar': true,
    'sidebar': true,
    'footer': true,
    'profile-panel': includeProfilePanel,
    'settings-panel': includeSettingsPanel,
    'font-awesome': includeFontAwesome,
    'floating-ui': true,
    'page-loader': true,
  };
  console.log();
  console.log(`  Processing template features...`);
  processTemplatePoints(appDir, featureFlags, verbose);

  // 7. Install dependencies
  const deps = recipe?.dependencies || {
    '@keenmate/svelte-pure-admin': 'latest',
    '@keenmate/pure-admin-core': 'latest'
  };
  const depList = Object.entries(deps).map(([k, v]) => `${k}@${v}`).join(' ');

  if (skipInstall) {
    console.log();
    console.log(dim(`  Skipping install (--no-install). Run "${pm} install" manually.`));
  } else {
    const addCmd = pm === 'bun' ? 'bun add' : pm === 'pnpm' ? 'pnpm add' : 'npm install';
    const installCmd = pm === 'bun' ? 'bun install' : pm === 'pnpm' ? 'pnpm install' : 'npm install';
    console.log();
    console.log(`  Installing dependencies...` + (pm !== 'npm' ? dim(` (${pm})`) : ''));
    try {
      execSync(installCmd, { cwd: appDir, stdio: 'inherit' });
      if (depList) {
        execSync(`${addCmd} ${depList}`, { cwd: appDir, stdio: 'inherit' });
      }
    } catch {
      console.log(yellow(`  ${pm} install failed — run it manually`));
    }
  }

  // 7. Download themes via pureadmin themes (uses the pureadmin.json we just wrote)
  console.log();
  console.log(`  Downloading themes...`);
  for (const id of themeIds) {
    const themesDir = recipe?.themeSetup?.themesDir || 'static/themes';
    const themeDir = path.join(appDir, themesDir, id);
    const zipPath = path.join(appDir, themesDir, `${id}.zip`);

    process.stdout.write(`    ${id}... `);
    try {
      fs.mkdirSync(path.join(appDir, themesDir), { recursive: true });
      await downloadFile(`/api/themes/${id}/download`, zipPath);
      extractThemeZip(zipPath, themeDir);
      fs.unlinkSync(zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(yellow(`failed: ${err.message}`));
    }
  }

  // 8. Done
  const runCmd = pm === 'bun' ? 'bun run' : `${pm} run`;
  const defaultInstructions = [`cd ${appName}`];
  if (skipInstall) defaultInstructions.push(`${pm} install`);
  defaultInstructions.push(`${runCmd} dev`, 'Open http://localhost:5173');
  let instructions;
  if (recipe?.instructions) {
    instructions = recipe.instructions.map(i =>
      substituteVars(i).replace(/npm run/g, runCmd)
    );
    if (skipInstall) instructions.splice(1, 0, `${pm} install`);
  } else {
    instructions = defaultInstructions;
  }
  console.log();
  console.log(bold('  App created!'));
  console.log();
  console.log(`  ${dim('Next steps:')}`);
  instructions.forEach(i => console.log(`    ${substituteVars(i)}`));
  console.log();
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

/**
 * Process template points: remove blocks for disabled features.
 * Reads template.json manifest from the app directory, resolves enabled features,
 * then strips data-pa blocks for disabled features from all affected files.
 */
function processTemplatePoints(appDir, enabledFlags, verbose) {
  const manifestPath = path.join(appDir, 'template.json');
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const features = manifest.features || {};

  // Resolve which features are enabled
  const enabled = {};
  for (const [id, feat] of Object.entries(features)) {
    enabled[id] = enabledFlags[id] !== undefined ? enabledFlags[id] : feat.default;
  }

  // Auto-enable dependencies
  for (const [id, feat] of Object.entries(features)) {
    if (enabled[id] && feat.requires) {
      for (const dep of feat.requires) {
        if (!enabled[dep]) {
          enabled[dep] = true;
          if (verbose) console.log(dim(`    auto-enabled "${dep}" (required by "${id}")`));
        }
      }
    }
  }

  // Collect points to remove (from disabled features)
  const pointsToRemove = new Set();
  for (const [id, feat] of Object.entries(features)) {
    if (!enabled[id] && feat.points) {
      for (const p of feat.points) pointsToRemove.add(p);
    }
  }

  if (pointsToRemove.size === 0) {
    if (verbose) console.log(dim('    all features enabled, no points to remove'));
    // Clean up manifest file
    fs.unlinkSync(manifestPath);
    const helperPath = path.join(appDir, 'template.helper.js');
    if (fs.existsSync(helperPath)) fs.unlinkSync(helperPath);
    return;
  }

  if (verbose) console.log(dim(`    removing ${pointsToRemove.size} point(s) for disabled features`));

  // Build marker patterns
  const htmlStart = (id) => `<!-- data-pa="${id}" -->`;
  const htmlEnd = (id) => `<!-- /data-pa="${id}" -->`;
  const jsStart = (id) => `// data-pa="${id}"`;
  const jsEnd = (id) => `// /data-pa="${id}"`;

  // Scan all source files for data-pa markers
  const filesToScan = new Set();
  const scanExts = ['.svelte', '.html', '.css', '.ts', '.js'];
  function findFiles(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (['node_modules', '.svelte-kit', '.git', 'build', 'dist'].includes(entry)) continue;
      const p = path.join(dir, entry);
      if (fs.statSync(p).isDirectory()) findFiles(p);
      else if (scanExts.some(e => entry.endsWith(e))) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content.includes('data-pa=')) filesToScan.add(path.relative(appDir, p));
      }
    }
  }
  findFiles(appDir);

  for (const relPath of filesToScan) {
    const filePath = path.join(appDir, relPath);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    for (const pointId of pointsToRemove) {
      // Try HTML-style markers
      const hStart = htmlStart(pointId);
      const hEnd = htmlEnd(pointId);
      if (content.includes(hStart) && content.includes(hEnd)) {
        const startIdx = content.indexOf(hStart);
        const endIdx = content.indexOf(hEnd) + hEnd.length;
        // Remove the entire block including surrounding whitespace/newline
        const before = content.lastIndexOf('\n', startIdx - 1);
        const after = content.indexOf('\n', endIdx);
        content = content.slice(0, before >= 0 ? before : startIdx) + content.slice(after >= 0 ? after : endIdx);
        modified = true;
      }

      // Try JS-style markers
      const jStart = jsStart(pointId);
      const jEnd = jsEnd(pointId);
      if (content.includes(jStart) && content.includes(jEnd)) {
        const startIdx = content.indexOf(jStart);
        const endIdx = content.indexOf(jEnd) + jEnd.length;
        const before = content.lastIndexOf('\n', startIdx - 1);
        const after = content.indexOf('\n', endIdx);
        content = content.slice(0, before >= 0 ? before : startIdx) + content.slice(after >= 0 ? after : endIdx);
        modified = true;
      }
    }

    if (modified) {
      // Clean up empty lines left behind
      content = content.replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(filePath, content);
      if (verbose) console.log(`    ${green('~')} ${relPath} ${dim('(points removed)')}`);
    }
  }

  // Clean up manifest and helper from the generated app
  fs.unlinkSync(manifestPath);
  const helperFile = path.join(appDir, 'template.helper.js');
  if (fs.existsSync(helperFile)) fs.unlinkSync(helperFile);
}

function copyDirSync(src, dest, exclude = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
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

  // Resolve API key: --api-key > pureadmin.json/.pureadmin > env
  const apiKey = opts.apiKey
    || config.apiKey
    || process.env.PUREADMIN_API_KEY
    || '';

  if (!apiKey) {
    console.error(`\n  ${bold('Error:')} API key is required.`);
    console.error(`  Set it via:`);
    console.error(`    --api-key KEY`);
    console.error(`    .pureadmin.json: { "apiKey": "..." }  ${dim('(gitignored)')}`);
    console.error(`    pureadmin.json: { "apiKey": "..." }`);
    console.error(`    ~/.pureadmin.json: { "apiKey": "..." }`);
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
    --name <name>               Display name (default: derived from directory or company name)
    --company <id>              Company profile from ~/.pureadmin.json
    --preset <id>               Technology preset from ~/.pureadmin.json
    --themes <list>             Comma-separated theme slugs (default: corporate,audi,dark)
    --theme <slug>              Default theme (default: first in --themes)
    --font-awesome              Include FontAwesome CDN
    --profile-panel             Include ProfilePanel component
    --settings-panel            Include SettingsPanel (theme switcher)
    --no-makefile               Skip Makefile generation
    --verbose                   Show template sources, file sizes, and debug info

  ${bold('Themes options:')}
    --offline                   Commit theme files to repo (for builds without network)
    --dir <path>                Theme output directory (default: static/themes, alias: --themes-dir)

  ${bold('Global options:')}
    --server <url>              Override API base URL for this invocation

  ${bold('Configuration (JSON, in order of precedence):')}
    --server / --api-key        CLI flags
    PUREADMIN_URL / _API_KEY    Environment variables
    .pureadmin.json             Local overrides (gitignored, merges into pureadmin.json)
    pureadmin.json              Project config (checked in)
    ~/.pureadmin.json           User defaults

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
    } else if (rest[i] === '--template-path' && rest[i + 1]) {
      opts.templatePath = rest[++i];
    } else if (rest[i] === '--name' && rest[i + 1]) {
      opts.name = rest[++i];
    } else if (rest[i] === '--themes' && rest[i + 1]) {
      opts.themes = rest[++i];
    } else if (rest[i] === '--theme' && rest[i + 1]) {
      opts.theme = rest[++i];
    } else if (rest[i] === '--company' && rest[i + 1]) {
      opts.company = rest[++i];
    } else if (rest[i] === '--preset' && rest[i + 1]) {
      opts.preset = rest[++i];
    } else if (rest[i] === '--font-awesome') {
      opts.fontAwesome = true;
    } else if (rest[i] === '--profile-panel') {
      opts.profilePanel = true;
    } else if (rest[i] === '--settings-panel') {
      opts.settingsPanel = true;
    } else if (rest[i] === '--offline') {
      opts.offline = true;
    } else if (rest[i] === '--no-build') {
      opts.noBuild = true;
    } else if (rest[i] === '--no-install') {
      opts.noInstall = true;
    } else if (rest[i] === '--no-makefile') {
      opts.noMakefile = true;
    } else if (rest[i] === '--verbose' || rest[i] === '-v') {
      opts.verbose = true;
    } else if (rest[i] === '--api-key' && rest[i + 1]) {
      opts.apiKey = rest[++i];
    } else if ((rest[i] === '--dir' || rest[i] === '--themes-dir') && rest[i + 1]) {
      opts.dir = rest[++i];
    } else if (rest[i].startsWith('--')) {
      console.error(`\n  ${bold('Error:')} unknown flag "${rest[i]}"`);
      console.error(`  Known flags: --server, --api-key, --dir, --themes-dir, --name, --company, --preset, --template, --template-path, --font-awesome, --settings-panel, --profile-panel, --no-makefile, --no-install, --offline, --no-build, --verbose, --version, --output\n`);
      process.exit(1);
    } else {
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
