// ---------------------------------------------------------------------------
// templates subcommand router + pack + publish
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow } = require('../formatting');
const { config } = require('../config');
const { fetchJson, getBaseUrl } = require('../http');

async function cmdTemplates(subArgs, opts) {
  const sub = subArgs[0];
  const rest = subArgs.slice(1);

  if (!sub || sub === 'help') {
    const { formatCommandHelp, commands: cmdDefs } = require('../commands');
    console.log(formatCommandHelp('templates', cmdDefs.templates));
    return;
  }

  if (sub === 'list') {
    // list templates (same as themes list — show from API)
    console.log(`\n  ${bold('Templates:')}\n`);
    try {
      const result = await fetchJson('/api/templates');
      const templates = result.templates || [];
      if (templates.length === 0) {
        console.log(dim('  No templates found.\n'));
        return;
      }
      for (const t of templates) {
        console.log(`  ${bold(t.id || t.name)}  ${dim(`v${t.version}`)}  ${t.technology}/${t.variant}  ${dim(t.description || '')}`);
      }
      console.log();
    } catch {
      console.log(yellow('  Could not reach server. No templates to list.\n'));
    }
  } else if (sub === 'pack') {
    await cmdTemplatePack(rest, opts);
  } else if (sub === 'publish') {
    await cmdTemplatePublish(rest, opts);
  } else {
    console.error(`\n  ${bold('Error:')} Unknown templates subcommand: ${sub}`);
    console.error(`  Available: list, pack, publish\n`);
    process.exit(1);
  }
}

async function cmdTemplatePack(templateNames, opts) {
  const root = process.cwd();
  const outputDir = opts.output || 'dist';
  const distDir = path.resolve(root, outputDir);
  fs.mkdirSync(distDir, { recursive: true });

  // Find templates: workspace (multiple template.json in subdirs) or single
  const allTemplates = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'template.json'))
      && fs.statSync(path.join(root, dir)).isDirectory()
      && !['schemas', 'scripts', 'dist', 'node_modules'].includes(dir);
  });

  let targets;
  if (allTemplates.length === 0 && fs.existsSync(path.join(root, 'template.json'))) {
    targets = [{ dir: root, name: path.basename(root) }];
  } else {
    const names = templateNames.length > 0 ? templateNames : allTemplates;
    targets = names.map(t => ({ dir: path.join(root, t), name: t }));
  }

  if (targets.length === 0) {
    console.error(`\n  ${bold('Error:')} No templates found. Run from a templates workspace or template directory.\n`);
    process.exit(1);
  }

  console.log(bold(`\n  === Packing ${targets.length} template(s) ===\n`));

  for (const { dir: templateDir, name } of targets) {
    const manifestPath = path.join(templateDir, 'template.json');
    if (!fs.existsSync(manifestPath)) {
      console.log(`  ${name}: ${yellow('skipped (no template.json)')}`);
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const id = manifest.id || name;
    const version = manifest.version || '0.0.0';

    process.stdout.write(`  ${id} v${version}: packing... `);

    const zipName = `${id}-${version}.zip`;
    const zipPath = path.join(distDir, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    try {
      // Collect files to pack
      const items = ['template.json'];
      if (fs.existsSync(path.join(templateDir, 'template.helper.js'))) items.push('template.helper.js');
      if (fs.existsSync(path.join(templateDir, 'template'))) items.push('template');
      if (fs.existsSync(path.join(templateDir, 'pages'))) items.push('pages');

      const isWin = process.platform === 'win32';
      const { execSync } = require('child_process');

      if (isWin) {
        const itemPaths = items.map(i => `"${path.join(templateDir, i)}"`).join(', ');
        execSync(
          `powershell -Command "Compress-Archive -Path ${itemPaths} -DestinationPath '${path.resolve(zipPath)}' -Force"`,
          { stdio: 'pipe' }
        );
      } else {
        execSync(`zip -r "${path.resolve(zipPath)}" ${items.join(' ')}`, { cwd: templateDir, stdio: 'pipe' });
      }

      const size = (fs.statSync(zipPath).size / 1024).toFixed(1);
      console.log(green(`done`) + dim(` (${size} KB)`));
    } catch (err) {
      console.log(`\x1b[31mfailed\x1b[0m`);
      if (opts.verbose) console.error(`    ${err.message}`);
    }
  }

  console.log();
}

async function cmdTemplatePublish(templateNames, opts) {
  const { execSync } = require('child_process');
  const root = process.cwd();

  const apiKey = process.env.PUREADMIN_API_KEY
    || config.apiKey
    || '';

  if (!apiKey) {
    console.error(`\n  ${bold('Error:')} API key is required.`);
    console.error(`  Set it via:`);
    console.error(`    .pureadmin.json: { "apiKey": "..." }  ${dim('(gitignored)')}`);
    console.error(`    pureadmin.json: { "apiKey": "..." }`);
    console.error(`    ~/.pureadmin.json: { "apiKey": "..." }`);
    console.error(`    PUREADMIN_API_KEY=... environment variable\n`);
    process.exit(1);
  }

  // Pack first
  await cmdTemplatePack(templateNames, { ...opts, output: opts.output || 'dist' });

  // Find packed ZIPs
  const distDir = path.resolve(root, opts.output || 'dist');
  const allTemplates = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'template.json'))
      && fs.statSync(path.join(root, dir)).isDirectory()
      && !['schemas', 'scripts', 'dist', 'node_modules'].includes(dir);
  });

  let targets;
  if (allTemplates.length === 0 && fs.existsSync(path.join(root, 'template.json'))) {
    const tj = JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf-8'));
    targets = [{ id: tj.id, version: tj.version }];
  } else {
    const names = templateNames.length > 0 ? templateNames : allTemplates;
    targets = names.map(t => {
      const tj = JSON.parse(fs.readFileSync(path.join(root, t, 'template.json'), 'utf-8'));
      return { id: tj.id || t, version: tj.version };
    });
  }

  const BASE_URL = getBaseUrl();
  const uploadUrl = `${BASE_URL}/api/templates/upload`;
  console.log(bold(`  === Uploading ===\n`));

  let updated = 0, unchanged = 0, errors = 0;

  for (const { id, version } of targets) {
    const zipName = `${id}-${version}.zip`;
    const zipPath = path.join(distDir, zipName);

    if (!fs.existsSync(zipPath)) {
      console.log(`  ${id}: \x1b[31mZIP not found: ${zipName}\x1b[0m`);
      errors++;
      continue;
    }

    process.stdout.write(`  ${id} v${version}: uploading... `);
    try {
      const output = execSync(
        `curl -sf -X POST "${uploadUrl}" -H "Authorization: Bearer ${apiKey}" -F "template=@${zipPath}"`,
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

module.exports = { cmdTemplates, cmdTemplatePack, cmdTemplatePublish };
