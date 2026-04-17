// ---------------------------------------------------------------------------
// templates subcommand router + pack + publish
// ---------------------------------------------------------------------------
const fs = require('fs');
const { mkdir, removeFile } = require('../helpers/files');
const path = require('path');
const { bold, dim, green, yellow } = require('../helpers/formatting');
const { renderMarkdown } = require('../helpers/markdown');
const { config } = require('../config');
const { fetchJson, getBaseUrl } = require('../http');
const { sha256File, sha256String } = require('../helpers/hashing');

// ---------------------------------------------------------------------------
// Checksum computation — mirrors pure-admin-io's server-side verifier and
// pure-admin-templates' scripts/update-checksums.js. Without fresh checksums
// the server rejects uploads when any file in template/ or pages/ has been
// edited since the last manual checksum refresh.
// ---------------------------------------------------------------------------
const METADATA_FIELDS = ['id', 'name', 'version', 'description', 'content', 'author', 'license', 'tags'];

function walkFileHashes(dir, base = '') {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.posix.join(base, entry);
    if (fs.statSync(full).isDirectory()) {
      Object.assign(out, walkFileHashes(full, rel));
    } else {
      out[rel] = sha256File(full);
    }
  }
  return out;
}

function computeTemplateChecksums(templateDir, manifest) {
  const checksums = {};
  const templateSubdir = path.join(templateDir, 'template');
  if (fs.existsSync(templateSubdir)) checksums.files = walkFileHashes(templateSubdir);
  const pagesDir = path.join(templateDir, 'pages');
  if (fs.existsSync(pagesDir)) checksums.pages = walkFileHashes(pagesDir);
  const helperPath = path.join(templateDir, 'template.helper.js');
  if (fs.existsSync(helperPath)) checksums.helper = sha256File(helperPath);

  const metadata = {};
  for (const key of [...METADATA_FIELDS].sort()) {
    if (manifest[key] !== undefined) metadata[key] = manifest[key];
  }
  checksums.metadata = sha256String(JSON.stringify(metadata));

  const allHashes = [
    ...Object.entries(checksums.files || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `files:${k}:${v}`),
    ...Object.entries(checksums.pages || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `pages:${k}:${v}`),
    ...(checksums.helper ? [`helper:${checksums.helper}`] : []),
    ...(checksums.metadata ? [`metadata:${checksums.metadata}`] : []),
  ];
  checksums.summary = sha256String(allHashes.join('\n'));
  return checksums;
}

function loadArchiver(root) {
  try {
    return require('archiver');
  } catch {
    try {
      return require(path.join(root, 'node_modules', 'archiver'));
    } catch {
      console.error(`  Error: "archiver" package is required but not installed.`);
      console.error(`  Install it with: npm install archiver --save-dev\n`);
      process.exit(1);
    }
  }
}

async function cmdTemplates(subArgs, opts) {
  const sub = subArgs[0];
  const rest = subArgs.slice(1);

  if (!sub || sub === 'help') {
    const { formatCommandHelp, formatSubcommandHelp, commands: cmdDefs } = require('../commands');
    if (rest[0] && cmdDefs.templates.subcommands?.[rest[0]]) {
      console.log(formatSubcommandHelp('templates', rest[0], cmdDefs.templates.subcommands[rest[0]]));
    } else {
      console.log(formatCommandHelp('templates', cmdDefs.templates));
    }
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
  } else if (sub === 'show') {
    await cmdTemplateShow(rest[0]);
  } else if (sub === 'pack') {
    await cmdTemplatePack(rest, opts);
  } else if (sub === 'publish') {
    await cmdTemplatePublish(rest, opts);
  } else if (sub === 'validate') {
    await cmdTemplateValidate(rest, opts);
  } else {
    console.error(`\n  ${bold('Error:')} Unknown templates subcommand: ${sub}`);
    console.error(`  Available: list, show, pack, publish, validate\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// show — fetch a template's detail view from the API and render its markdown
// description. Pairs with `themes show` and uses the same layout: compact
// metadata table on top, long-form markdown `content` below.
// ---------------------------------------------------------------------------
async function cmdTemplateShow(id) {
  if (!id) {
    console.error(`\n  ${bold('Error:')} templates show requires a template id\n`);
    process.exit(1);
  }
  let result;
  try {
    result = await fetchJson(`/api/templates/${encodeURIComponent(id)}`);
  } catch (err) {
    console.error(`\n  ${bold('Error:')} ${err.message}\n`);
    process.exit(1);
  }
  const t = result.template || result;
  console.log();
  console.log(bold(`  ${t.name || t.id}`) + dim(` (${t.id})`));
  console.log();
  if (t.description) console.log(`  ${dim('Description:')}  ${t.description}`);
  if (t.version) console.log(`  ${dim('Version:')}      ${green(t.version)}`);
  if (t.technology) console.log(`  ${dim('Technology:')}   ${t.technology}${t.variant ? `/${t.variant}` : ''}`);
  if (t.author) console.log(`  ${dim('Author:')}       ${t.author}`);
  if (t.license) console.log(`  ${dim('License:')}      ${t.license}`);
  if (t.tags?.length) console.log(`  ${dim('Tags:')}         ${t.tags.join(', ')}`);

  if (t.content) {
    console.log();
    const rendered = renderMarkdown(t.content);
    for (const line of rendered.split('\n')) console.log(`  ${line}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// validate — verify template manifest integrity before packing/publishing
// ---------------------------------------------------------------------------
async function cmdTemplateValidate(templateNames, opts) {
  const { red } = require('../helpers/formatting');
  const root = process.cwd();
  const PASS = green('\u2713');
  const FAIL = red('\u2717');
  const WARN = yellow('\u26A0');

  const allTemplates = fs.readdirSync(root).filter(dir => {
    return fs.existsSync(path.join(root, dir, 'template.json'))
      && fs.statSync(path.join(root, dir)).isDirectory()
      && !['schemas', 'scripts', 'dist', 'node_modules'].includes(dir);
  });

  let singleMode = false;
  if (allTemplates.length === 0 && fs.existsSync(path.join(root, 'template.json'))) {
    singleMode = true;
  }

  const targets = templateNames.length > 0 ? templateNames : (singleMode ? ['.'] : allTemplates);

  if (targets.length === 0) {
    console.log(`\n  No templates found. Run from a templates workspace or template directory.\n`);
    return;
  }

  if (!singleMode) {
    for (const t of templateNames) {
      if (!allTemplates.includes(t)) {
        console.error(`\n  ${bold(t)}: not found. Available: ${allTemplates.join(', ')}\n`);
        process.exit(1);
      }
    }
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let passedTemplates = 0;

  console.log();
  for (const t of targets) {
    const templateDir = singleMode ? root : path.join(root, t);
    const manifestPath = path.join(templateDir, 'template.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const id = manifest.id || (singleMode ? path.basename(root) : t);

    console.log(`  ${bold(`Validating ${id} v${manifest.version || '?'}...`)}`);

    const errors = [];
    const warnings = [];
    const results = { manifest: [], structure: [], checksums: [] };

    // --- Required manifest fields ---
    const requiredFields = ['id', 'name', 'version'];
    const missingFields = requiredFields.filter(f => !manifest[f]);
    if (missingFields.length === 0) {
      results.manifest.push({ name: 'Required fields present (id, name, version)', status: 'pass' });
    } else {
      results.manifest.push({ name: 'Required manifest fields', status: 'fail', detail: `missing: ${missingFields.join(', ')}` });
      errors.push(`missing manifest fields: ${missingFields.join(', ')}`);
    }

    // --- Required structure ---
    const hasTemplateDir = fs.existsSync(path.join(templateDir, 'template'));
    const hasHelper = fs.existsSync(path.join(templateDir, 'template.helper.js'));
    const hasPages = fs.existsSync(path.join(templateDir, 'pages'));
    if (!hasTemplateDir) {
      results.structure.push({ name: 'template/ directory exists', status: 'fail', detail: 'no template/ directory — nothing to scaffold' });
      errors.push('template/ directory missing');
    } else {
      const fileCount = Object.keys(walkFileHashes(path.join(templateDir, 'template'))).length;
      results.structure.push({ name: `template/ directory (${fileCount} files)`, status: 'pass' });
    }
    results.structure.push({ name: 'template.helper.js', status: hasHelper ? 'pass' : 'warn', detail: hasHelper ? '' : 'no helper — template can still scaffold but has no feature operations' });
    if (!hasHelper) warnings.push('no template.helper.js');
    if (hasPages) {
      const pageCount = Object.keys(walkFileHashes(path.join(templateDir, 'pages'))).length;
      results.structure.push({ name: `pages/ directory (${pageCount} files)`, status: 'pass' });
    }

    // --- Checksum integrity: declared vs actual on disk ---
    // This is the killer check — if declared shas in template.json don't
    // match file contents, the server rejects uploads (exactly the bug that
    // happens when files are edited without re-running checksum computation).
    if (!manifest.checksums) {
      results.checksums.push({ name: 'Manifest has checksums block', status: 'warn', detail: 'no checksums — pack will compute fresh ones anyway' });
      warnings.push('no checksums block in manifest (pack regenerates)');
    } else {
      const fresh = computeTemplateChecksums(templateDir, manifest);
      const declaredFiles = manifest.checksums.files || {};
      const freshFiles = fresh.files || {};
      const declaredPages = manifest.checksums.pages || {};
      const freshPages = fresh.pages || {};

      const staleFiles = [];
      const missingFromManifest = [];
      const missingOnDisk = [];
      for (const [key, declared] of Object.entries(declaredFiles)) {
        if (!(key in freshFiles)) missingOnDisk.push(`template/${key}`);
        else if (freshFiles[key] !== declared) staleFiles.push(`template/${key}`);
      }
      for (const key of Object.keys(freshFiles)) {
        if (!(key in declaredFiles)) missingFromManifest.push(`template/${key}`);
      }
      for (const [key, declared] of Object.entries(declaredPages)) {
        if (!(key in freshPages)) missingOnDisk.push(`pages/${key}`);
        else if (freshPages[key] !== declared) staleFiles.push(`pages/${key}`);
      }
      for (const key of Object.keys(freshPages)) {
        if (!(key in declaredPages)) missingFromManifest.push(`pages/${key}`);
      }

      if (manifest.checksums.helper && fresh.helper && manifest.checksums.helper !== fresh.helper) {
        staleFiles.push('template.helper.js');
      }

      if (staleFiles.length === 0 && missingFromManifest.length === 0 && missingOnDisk.length === 0) {
        results.checksums.push({ name: 'Manifest checksums match actual files', status: 'pass' });
      }
      if (staleFiles.length > 0) {
        results.checksums.push({ name: 'Stale checksums (manifest out of date)', status: 'warn', detail: staleFiles.slice(0, 5).join(', ') + (staleFiles.length > 5 ? `, +${staleFiles.length - 5} more` : '') });
        warnings.push(`${staleFiles.length} stale checksum(s) — pack regenerates them`);
      }
      if (missingFromManifest.length > 0) {
        results.checksums.push({ name: 'Files on disk not in manifest', status: 'warn', detail: missingFromManifest.slice(0, 5).join(', ') + (missingFromManifest.length > 5 ? `, +${missingFromManifest.length - 5} more` : '') });
        warnings.push(`${missingFromManifest.length} file(s) missing from manifest — pack regenerates`);
      }
      if (missingOnDisk.length > 0) {
        results.checksums.push({ name: 'Manifest declares files missing on disk', status: 'fail', detail: missingOnDisk.join(', ') });
        errors.push(`${missingOnDisk.length} declared file(s) missing on disk`);
      }

      // Metadata / summary checks
      if (manifest.checksums.metadata && fresh.metadata !== manifest.checksums.metadata) {
        results.checksums.push({ name: 'Metadata checksum', status: 'warn', detail: 'stale — descriptive fields changed since last checksum' });
        warnings.push('metadata checksum stale');
      }
    }

    // --- Render ---
    for (const [section, label] of [['manifest', 'Manifest'], ['structure', 'Structure'], ['checksums', 'Checksums']]) {
      if (results[section].length === 0) continue;
      console.log(`\n  ${bold(label)}`);
      for (const r of results[section]) {
        const icon = r.status === 'pass' ? PASS : r.status === 'warn' ? WARN : FAIL;
        const detail = r.detail ? dim(`  ${r.detail}`) : '';
        console.log(`    ${icon} ${r.name}${detail}`);
      }
    }

    const parts = [];
    if (errors.length > 0) parts.push(red(`${errors.length} error(s)`));
    if (warnings.length > 0) parts.push(yellow(`${warnings.length} warning(s)`));
    if (parts.length === 0) parts.push(green('all passed'));
    console.log(`\n  ${dim(id + ':')} ${parts.join(', ')}\n`);

    totalErrors += errors.length;
    totalWarnings += warnings.length;
    if (errors.length === 0) passedTemplates++;
  }

  if (targets.length > 1) {
    const failed = targets.length - passedTemplates;
    console.log(`  ${bold('Summary:')} Validated ${targets.length} template(s): ${green(`${passedTemplates} passed`)}${failed > 0 ? `, ${require('../helpers/formatting').red(`${failed} with errors`)}` : ''}\n`);
  }

  if (totalErrors > 0) process.exit(1);
}

async function cmdTemplatePack(templateNames, opts) {
  const root = process.cwd();
  const outputDir = opts.output || 'dist';
  const distDir = path.resolve(root, outputDir);
  mkdir(distDir);

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
    if (fs.existsSync(zipPath)) removeFile(zipPath);

    try {
      // Recompute checksums from actual file contents — the on-disk
      // template.json may have stale shas if files were edited since the
      // last run of scripts/update-checksums.js. Server rejects uploads
      // with mismatched shas.
      const checksums = computeTemplateChecksums(templateDir, manifest);
      const enriched = { ...manifest, checksums };
      delete enriched.$schema;
      const enrichedJson = JSON.stringify(enriched, null, 2) + '\n';

      const archiver = loadArchiver(root);
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', reject);
        output.on('close', resolve);
        archive.pipe(output);

        archive.append(enrichedJson, { name: 'template.json' });

        const helperPath = path.join(templateDir, 'template.helper.js');
        if (fs.existsSync(helperPath)) archive.file(helperPath, { name: 'template.helper.js' });

        const templateSubdir = path.join(templateDir, 'template');
        if (fs.existsSync(templateSubdir)) archive.directory(templateSubdir, 'template');

        const pagesDir = path.join(templateDir, 'pages');
        if (fs.existsSync(pagesDir)) archive.directory(pagesDir, 'pages');

        archive.finalize();
      });

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

  // API key comes from resolved target (via opts.apiKey set by cli.js),
  // or from explicit --api-key flag, or from env var as last resort.
  const apiKey = opts.apiKey
    || process.env.PUREADMIN_API_KEY
    || config.apiKey
    || '';

  if (!apiKey) {
    console.error(`\n  ${bold('Error:')} API key is required.`);
    console.error(`  Set it via:`);
    console.error(`    targets: { "production": { "apiKey": "..." } }  ${dim('in ~/.pureadmin.json')}`);
    console.error(`    --api-key YOUR_KEY`);
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
