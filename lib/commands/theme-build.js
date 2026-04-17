// ---------------------------------------------------------------------------
// build command — compile SCSS -> CSS
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, green, yellow } = require('../helpers/formatting');

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

module.exports = { cmdBuild };
