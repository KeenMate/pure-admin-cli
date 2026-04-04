// ---------------------------------------------------------------------------
// validate — Check theme CSS for readability, missing variables, consistency
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow, red } = require('../formatting');

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

async function cmdValidate(themeNames) {
  const root = process.cwd();
  const PASS = green('\u2713');
  const FAIL = red('\u2717');
  const WARN = yellow('\u26A0');

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
        const icon = r.status === 'pass' ? PASS : r.status === 'fail' ? FAIL : r.status === 'warn' ? WARN : dim('\u2013');
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

module.exports = {
  cmdValidate,
  validateThemeCss,
  hexToRgb,
  wcagLuminance,
  contrastRatio,
  extractCssVars,
  extractCssVarFromBlock,
  splitCssModes,
};
