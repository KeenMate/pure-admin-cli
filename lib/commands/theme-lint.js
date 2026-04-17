// ---------------------------------------------------------------------------
// lint — quality/accessibility recommendations for theme CSS
//
// Soft checks: WCAG contrast ratios, hardcoded border-radius, etc. These are
// recommendations, not pass/fail gates. For "the package is broken" checks,
// see theme-validate.js.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow, red } = require('../formatting');

// ---------------------------------------------------------------------------
// Helpers
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
  const modes = [];
  const modeRegex = /(:root[^{]*|\.pa-mode-light|\.pa-mode-dark|\.pa-color-[a-z]+)\s*\{/g;
  const blocks = [];
  let m;
  while ((m = modeRegex.exec(css))) {
    blocks.push({ selector: m[1].trim(), start: m.index });
  }

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
    const existing = modes.find(b => b.name === name);
    if (existing) {
      existing.css += '\n' + blockCss;
    } else {
      modes.push({ name, css: blockCss });
    }
  }

  return modes;
}

function pushContrastResult(results, warnings, label, ratio, detail) {
  if (ratio < 3) {
    results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail}  (min 3:1)` });
    warnings.push(`${label} ${ratio.toFixed(1)}:1`);
  } else if (ratio < 4.5) {
    results.readability.push({ name: label, status: 'warn', detail: `${ratio.toFixed(1)}:1  ${detail}  (recommended 4.5:1)` });
    warnings.push(`${label} ${ratio.toFixed(1)}:1`);
  } else {
    results.readability.push({ name: label, status: 'pass', detail: `${ratio.toFixed(1)}:1` });
  }
}

// ---------------------------------------------------------------------------
// Main lint logic
// ---------------------------------------------------------------------------
function lintThemeCss(css) {
  const warnings = [];
  const results = { readability: [], consistency: [] };

  const modes = splitCssModes(css);

  const outlineVariants = [
    { name: 'primary',   varName: '--pa-btn-primary-bg' },
    { name: 'secondary', varName: '--pa-btn-secondary-outline-color' },
    { name: 'success',   varName: '--pa-btn-success-bg' },
    { name: 'danger',    varName: '--pa-btn-danger-bg' },
    { name: 'warning',   varName: '--pa-btn-warning-bg' },
    { name: 'info',      varName: '--pa-btn-info-bg' },
  ];

  const filledVariants = [
    { name: 'primary',   bgVar: '--pa-accent',           textVar: '--pa-btn-primary-text' },
    { name: 'secondary', bgVar: '--pa-btn-secondary-bg', textVar: '--pa-btn-secondary-text' },
    { name: 'success',   bgVar: '--pa-btn-success-bg',   textVar: '--pa-btn-success-text' },
    { name: 'danger',    bgVar: '--pa-btn-danger-bg',    textVar: '--pa-btn-danger-text' },
    { name: 'warning',   bgVar: '--pa-btn-warning-bg',   textVar: '--pa-btn-warning-text' },
    { name: 'info',      bgVar: '--pa-btn-info-bg',      textVar: '--pa-btn-info-text' },
  ];

  for (const mode of modes) {
    const pageBg = extractCssVarFromBlock(mode.css, '--pa-page-bg');
    if (!pageBg || !pageBg.startsWith('#')) continue;

    for (const v of outlineVariants) {
      const color = extractCssVarFromBlock(mode.css, v.varName);
      if (!color || !color.startsWith('#')) continue;
      pushContrastResult(results, warnings, `${mode.name} → outline-${v.name}`, contrastRatio(color, pageBg),
        `${v.varName}: ${color} on --pa-page-bg: ${pageBg}`);
    }

    for (const v of filledVariants) {
      const bg = extractCssVarFromBlock(mode.css, v.bgVar);
      const text = extractCssVarFromBlock(mode.css, v.textVar);
      if (!bg || !text || !bg.startsWith('#') || !text.startsWith('#')) continue;
      pushContrastResult(results, warnings, `${mode.name} → filled-${v.name} text`, contrastRatio(text, bg),
        `${v.textVar}: ${text} on ${v.bgVar}: ${bg}`);
    }

    for (let i = 1; i <= 9; i++) {
      const slotColor = extractCssVarFromBlock(mode.css, `--pa-color-${i}`);
      const slotText = extractCssVarFromBlock(mode.css, `--pa-color-${i}-text`);
      if (!slotColor || !slotColor.startsWith('#')) continue;
      pushContrastResult(results, warnings, `${mode.name} → outline-color-${i}`, contrastRatio(slotColor, pageBg),
        `--pa-color-${i}: ${slotColor} on --pa-page-bg: ${pageBg}`);
      if (slotText && slotText.startsWith('#')) {
        pushContrastResult(results, warnings, `${mode.name} → filled-color-${i} text`, contrastRatio(slotText, slotColor),
          `--pa-color-${i}-text: ${slotText} on --pa-color-${i}: ${slotColor}`);
      }
    }
  }

  // Command palette
  for (const mode of modes) {
    const modalBg = extractCssVarFromBlock(mode.css, '--pa-modal-content-bg');
    const textColor = extractCssVarFromBlock(mode.css, '--pa-text-color-1');
    const highlightBg = extractCssVarFromBlock(mode.css, '--pa-command-palette-highlight-bg');
    const highlightText = extractCssVarFromBlock(mode.css, '--pa-command-palette-highlight-text');
    const keyBg = extractCssVarFromBlock(mode.css, '--pa-command-palette-key-bg');
    const keyText = extractCssVarFromBlock(mode.css, '--pa-command-palette-key-text');

    if (modalBg && textColor && modalBg.startsWith('#') && textColor.startsWith('#')) {
      pushContrastResult(results, warnings, `${mode.name} → command palette text`, contrastRatio(textColor, modalBg),
        `--pa-text-color-1: ${textColor} on --pa-modal-content-bg: ${modalBg}`);
    }
    if (keyBg && keyText && keyBg.startsWith('#') && keyText.startsWith('#')) {
      pushContrastResult(results, warnings, `${mode.name} → command palette key badge`, contrastRatio(keyText, keyBg),
        `--pa-command-palette-key-text: ${keyText} on --pa-command-palette-key-bg: ${keyBg}`);
    }
    if (highlightBg && highlightText && highlightBg.startsWith('#') && highlightText.startsWith('#')) {
      pushContrastResult(results, warnings, `${mode.name} → command palette highlight`, contrastRatio(highlightText, highlightBg),
        `--pa-command-palette-highlight-text: ${highlightText} on --pa-command-palette-highlight-bg: ${highlightBg}`);
    }
  }

  // Hardcoded border-radius
  const brRegex = /(?<![-\w])border-radius:\s*([^;]+);/g;
  const hardcoded = new Set();
  let brMatch;
  while ((brMatch = brRegex.exec(css))) {
    const val = brMatch[1].trim();
    if (val.includes('var(') || val === '0' || val === '0px' || val === '0rem'
        || val === 'inherit' || val === '50%' || val.includes('50rem')
        || val.includes('500px') || val.includes('50%')
        || val.includes('12rem') || val === '0 !important'
        || val === '0.8rem') continue;
    hardcoded.add(val);
  }
  if (hardcoded.size === 0) {
    results.consistency.push({ name: 'No hardcoded border-radius values', status: 'pass', detail: '' });
  } else {
    const vals = [...hardcoded].join(', ');
    results.consistency.push({ name: `${hardcoded.size} hardcoded border-radius value(s)`, status: 'warn', detail: vals });
    warnings.push(`${hardcoded.size} hardcoded border-radius: ${vals}`);
  }

  return { results, warnings };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------
async function cmdLint(themeNames) {
  const root = process.cwd();
  const PASS = green('\u2713');
  const WARN = yellow('\u26A0');
  const FAIL = red('\u2717');

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

  if (!singleMode) {
    for (const t of themeNames) {
      if (!allThemes.includes(t)) {
        console.error(`\n  ${bold(t)}: not found. Available: ${allThemes.join(', ')}\n`);
        process.exit(1);
      }
    }
  }

  let totalWarnings = 0;
  let cleanThemes = 0;

  console.log();
  for (const t of targets) {
    const themeDir = singleMode ? root : path.join(root, t);
    const theme = JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf-8'));
    const id = theme.id || (singleMode ? path.basename(root) : t);
    const cssPath = path.join(themeDir, 'dist', `${id}.css`);

    if (!fs.existsSync(cssPath)) {
      console.log(`  ${bold(id)}: ${yellow(`CSS not found: dist/${id}.css — run build first`)}\n`);
      continue;
    }

    const css = fs.readFileSync(cssPath, 'utf-8');
    console.log(`  ${bold(`Linting ${theme.name || id}...`)}`);

    const { results, warnings } = lintThemeCss(css);

    if (results.readability.length > 0) {
      console.log(`\n  ${bold('Readability')}`);
      for (const r of results.readability) {
        const icon = r.status === 'pass' ? PASS : WARN;
        const detail = r.detail ? dim(`  ${r.detail}`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    if (results.consistency.length > 0) {
      console.log(`\n  ${bold('Consistency')}`);
      for (const r of results.consistency) {
        const icon = r.status === 'pass' ? PASS : WARN;
        const detail = r.detail ? dim(`  (${r.detail})`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    const summary = warnings.length > 0 ? yellow(`${warnings.length} suggestion(s)`) : green('clean');
    console.log(`\n  ${dim(id + ':')} ${summary}\n`);

    totalWarnings += warnings.length;
    if (warnings.length === 0) cleanThemes++;
  }

  if (targets.length > 1) {
    console.log(`  ${bold('Summary:')} Linted ${targets.length} theme(s): ${green(`${cleanThemes} clean`)}, ${yellow(`${totalWarnings} suggestion(s) total`)}\n`);
  }
}

module.exports = {
  cmdLint,
  lintThemeCss,
  hexToRgb,
  wcagLuminance,
  contrastRatio,
  extractCssVars,
  extractCssVarFromBlock,
  splitCssModes,
};
