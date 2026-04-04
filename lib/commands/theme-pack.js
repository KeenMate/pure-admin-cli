// ---------------------------------------------------------------------------
// pack command — package theme into distributable ZIP
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow } = require('../formatting');
const { TOOL_VERSION } = require('../config');
const { sha256File, sha256String } = require('../files');
const { cmdBuild } = require('./theme-build');

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

module.exports = { cmdPack };
