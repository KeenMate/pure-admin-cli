// ---------------------------------------------------------------------------
// Asset manifest auditor
//
// Cross-checks three sources of truth for a theme's bundled assets:
//   1. Files actually present in the theme's `assets/` directory
//   2. Files referenced from the compiled CSS via url(...)
//   3. Files declared in theme.json (fonts.files, assets.favicon/logo/logoSmall/files)
//
// Reports three kinds of problems:
//   - undeclaredRefs    CSS uses a file that the manifest doesn't list →
//                       pack will skip it → 404 after publish (the NATO bug)
//   - missingDeclared   manifest lists a file that doesn't exist on disk
//   - orphans           file is on disk but not declared anywhere → won't
//                       be packed; usually a stale leftover
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

function walkAssets(dir, baseDir = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkAssets(full, baseDir, out);
    } else {
      out.push(path.relative(baseDir, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function extractCssAssetRefs(css) {
  const refs = new Set();
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let m;
  while ((m = re.exec(css))) {
    const raw = m[1].trim();
    if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) continue;
    // Strip query/hash, normalize separators
    const cleaned = raw.split('?')[0].split('#')[0].replace(/\\/g, '/');
    // Normalize "../assets/foo.woff2" → "assets/foo.woff2"
    const parts = cleaned.split('/').filter(p => p && p !== '.');
    while (parts.length && parts[0] === '..') parts.shift();
    if (parts.length === 0) continue;
    refs.add(parts.join('/'));
  }
  return refs;
}

function collectDeclaredAssets(theme) {
  const declared = new Set();
  if (theme.fonts?.files) {
    for (const f of theme.fonts.files) {
      if (f.src) declared.add(f.src.replace(/\\/g, '/').replace(/^\.\//, ''));
    }
  }
  if (theme.assets) {
    const single = ['favicon', 'logo', 'logoSmall'];
    for (const key of single) {
      if (theme.assets[key]) {
        const p = theme.assets[key].replace(/\\/g, '/').replace(/^\.\//, '');
        // Single-named assets are placed at assets/<basename> by pack
        declared.add(`assets/${path.posix.basename(p)}`);
        declared.add(p);
      }
    }
    if (Array.isArray(theme.assets.files)) {
      for (const f of theme.assets.files) {
        const p = f.replace(/\\/g, '/').replace(/^\.\//, '');
        // theme.assets.files entries are relative paths under assets/
        declared.add(p.startsWith('assets/') ? p : `assets/${p}`);
        declared.add(p);
      }
    }
  }
  return declared;
}

function auditAssetManifest({ themeDir, theme, cssContent }) {
  const onDisk = new Set(walkAssets(path.join(themeDir, 'assets')).map(p => `assets/${p}`));
  const declared = collectDeclaredAssets(theme);
  const cssRefs = extractCssAssetRefs(cssContent || '');

  // Build a normalized declared set for "is this declared?" checks.
  // We accept a CSS ref as declared if any declared entry's basename matches,
  // since pack rewrites url(...) to ../assets/fonts/<basename> regardless of the
  // declared src path.
  const declaredBasenames = new Set();
  for (const d of declared) declaredBasenames.add(path.posix.basename(d));

  const undeclaredRefs = [];
  for (const ref of cssRefs) {
    const base = path.posix.basename(ref);
    if (!declaredBasenames.has(base)) undeclaredRefs.push(ref);
  }

  const missingDeclared = [];
  for (const d of declared) {
    // Skip duplicates we added with multiple normalizations
    const candidate = path.join(themeDir, d);
    if (!fs.existsSync(candidate)) {
      // Don't report if a sibling normalization of the same file does exist
      const base = path.posix.basename(d);
      const altOnDisk = [...onDisk].some(p => path.posix.basename(p) === base);
      if (!altOnDisk) missingDeclared.push(d);
    }
  }
  // Dedupe (we may have stored "assets/foo.png" and "foo.png" for the same item)
  const uniqMissing = [...new Set(missingDeclared.map(p => p.replace(/^assets\//, '')))];

  const orphans = [];
  for (const f of onDisk) {
    const base = path.posix.basename(f);
    if (!declaredBasenames.has(base)) orphans.push(f);
  }

  return {
    undeclaredRefs: [...new Set(undeclaredRefs)].sort(),
    missingDeclared: uniqMissing.sort(),
    orphans: orphans.sort(),
  };
}

module.exports = {
  auditAssetManifest,
  walkAssets,
  extractCssAssetRefs,
  collectDeclaredAssets,
};
