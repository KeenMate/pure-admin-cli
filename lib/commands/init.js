// ---------------------------------------------------------------------------
// init command — scaffold a new theme project
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, green, yellow } = require('../helpers/formatting');
const { downloadFile } = require('../http');

async function cmdInit(id, name, usage) {
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
    console.log(`  Next steps:`);
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

module.exports = { cmdInit };
