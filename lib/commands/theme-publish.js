// ---------------------------------------------------------------------------
// publish command — pack + upload to pureadmin.io
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow } = require('../helpers/formatting');
const { config } = require('../config');
const { getBaseUrl } = require('../http');
const { cmdPack } = require('./theme-pack');

async function cmdPublish(themeNames, opts) {
  const { curlUpload } = require('../helpers/upload');
  const { red } = require('../helpers/formatting');
  const root = process.cwd();

  // Resolve API key: opts (from resolved target) > env > config files
  const apiKey = opts.apiKey
    || process.env.PUREADMIN_API_KEY
    || config.apiKey
    || '';

  if (!apiKey) {
    console.error(`\n  ${bold('Error:')} API key is required.`);
    console.error(`  Set it via:`);
    console.error(`    targets: { "production": { "apiKey": "..." } }  ${dim('in ~/.pureadmin.json')}`);
    console.error(`    --api-key KEY`);
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

  const BASE_URL = getBaseUrl();
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
      const { status, body } = curlUpload({
        url: uploadUrl, apiKey, fieldName: 'theme', filePath: zipPath,
      });
      if (status === 200) {
        let result;
        try { result = JSON.parse(body); } catch { result = {}; }
        if (result.status === 'unchanged') { console.log(yellow('unchanged')); unchanged++; }
        else { console.log(green('updated')); updated++; }
      } else if (status === 426) {
        console.log(red('upgrade required'));
        let err = {};
        try { err = JSON.parse(body); } catch {}
        if (err.message) console.log(`    ${err.message}`);
        if (err.upgrade) console.log(`    ${dim('Run:')} ${err.upgrade}`);
        errors++;
      } else {
        console.log(red('failed'));
        if (opts.verbose && body) console.error(`    ${dim(body.slice(0, 300))}`);
        errors++;
      }
    } catch (err) {
      if (err.serverTooOld) throw err;
      console.log(red('failed'));
      if (opts.verbose) console.error(`    ${err.message}`);
      errors++;
    }
  }

  console.log(`\n  ${bold('Summary:')} ${green(`${updated} updated`)}, ${yellow(`${unchanged} unchanged`)}, ${errors > 0 ? `\x1b[31m${errors} failed\x1b[0m` : dim(`${errors} failed`)}\n`);
  if (errors > 0) process.exit(1);
}

module.exports = { cmdPublish };
