// ---------------------------------------------------------------------------
// validate — hard correctness checks for a theme package
//
// Anything failing here means the package is broken and should not ship:
//   - Asset manifest mismatches (would 404 after publish, or silently drop files)
//   - Required CSS variables missing (framework features won't work)
//   - Color slots all missing (theme color buttons invisible)
//   - dist/<id>.css missing (nothing to publish)
//
// For quality/accessibility recommendations (WCAG contrast, hardcoded
// border-radius), see theme-lint.js.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow, red } = require('../formatting');
const { auditAssetManifest } = require('../asset-manifest');

function validateThemeCss(css, themeDir, theme) {
  const errors = [];
  const warnings = [];
  const results = { assets: [], variables: [] };

  // --- Asset manifest audit ---
  const audit = auditAssetManifest({ themeDir, theme, cssContent: css });
  if (audit.undeclaredRefs.length === 0) {
    results.assets.push({ name: 'CSS references all declared in theme.json', status: 'pass', detail: '' });
  } else {
    results.assets.push({ name: 'CSS references missing from theme.json', status: 'fail', detail: audit.undeclaredRefs.join(', ') });
    errors.push(`${audit.undeclaredRefs.length} undeclared asset ref(s) — will 404 after publish`);
  }
  if (audit.missingDeclared.length > 0) {
    results.assets.push({ name: 'Manifest declares files missing on disk', status: 'fail', detail: audit.missingDeclared.join(', ') });
    errors.push(`${audit.missingDeclared.length} declared file(s) missing on disk`);
  }
  if (audit.orphans.length > 0) {
    results.assets.push({ name: 'Files in assets/ not in manifest', status: 'warn', detail: audit.orphans.join(', ') });
    warnings.push(`${audit.orphans.length} orphaned asset file(s)`);
  } else if (audit.undeclaredRefs.length === 0 && audit.missingDeclared.length === 0) {
    results.assets.push({ name: 'No orphaned asset files', status: 'pass', detail: '' });
  }

  // --- Required CSS variables ---
  const required = [
    '--pa-border-radius', '--pa-border-radius-sm', '--pa-border-radius-lg',
    '--pa-accent', '--pa-accent-hover',
    '--pa-text-color-1', '--pa-text-color-2',
    '--pa-main-bg', '--pa-page-bg',
    '--pa-btn-secondary-outline-color',
    '--pa-border-color',
  ];
  for (const varName of required) {
    if (css.includes(varName + ':')) {
      results.variables.push({ name: `${varName} defined`, status: 'pass', detail: '' });
    } else {
      results.variables.push({ name: `${varName}`, status: 'fail', detail: 'missing' });
      errors.push(`${varName} missing`);
    }
  }

  // --- Color slots: error if all missing, warning if some missing ---
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

  return { results, errors, warnings };
}

async function cmdValidate(themeNames) {
  const root = process.cwd();
  const PASS = green('\u2713');
  const FAIL = red('\u2717');
  const WARN = yellow('\u26A0');

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

    const { results, errors, warnings } = validateThemeCss(css, themeDir, theme);

    if (results.assets.length > 0) {
      console.log(`\n  ${bold('Assets')}`);
      for (const r of results.assets) {
        const icon = r.status === 'pass' ? PASS : r.status === 'warn' ? WARN : FAIL;
        const detail = r.detail ? dim(`  ${r.detail}`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    if (results.variables.length > 0) {
      console.log(`\n  ${bold('CSS Variables')}`);
      for (const r of results.variables) {
        const icon = r.status === 'pass' ? PASS : r.status === 'warn' ? WARN : FAIL;
        const detail = r.detail ? (r.status === 'fail' ? red(r.detail) : dim(r.detail)) : '';
        const sep = r.detail ? '  ' : '';
        console.log(`    ${icon} ${r.name}${sep}${detail}`);
      }
    }

    const parts = [];
    if (errors.length > 0) parts.push(red(`${errors.length} error(s)`));
    if (warnings.length > 0) parts.push(yellow(`${warnings.length} warning(s)`));
    if (parts.length === 0) parts.push(green('all passed'));
    console.log(`\n  ${dim(id + ':')} ${parts.join(', ')}\n`);

    totalErrors += errors.length;
    totalWarnings += warnings.length;
    if (errors.length === 0) passedThemes++;
  }

  if (targets.length > 1) {
    const failedThemes = targets.length - passedThemes;
    console.log(`  ${bold('Summary:')} Validated ${targets.length} theme(s): ${green(`${passedThemes} passed`)}${failedThemes > 0 ? `, ${red(`${failedThemes} with errors`)}` : ''}\n`);
  }

  if (totalErrors > 0) process.exit(1);
}

module.exports = {
  cmdValidate,
  validateThemeCss,
};
