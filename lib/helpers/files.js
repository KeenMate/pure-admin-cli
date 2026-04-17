// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest, exclude = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Extractor command templates. Note the 7zip `-o` flag has NO space after it
// (7z quirk). Each runner is invoked with no output unless it fails.
const EXTRACTORS = {
  unzip: (zip, dest) => `unzip -o "${zip}" -d "${dest}"`,
  tar:   (zip, dest) => `tar -xf "${zip}" -C "${dest}"`,
  '7zip': (zip, dest) => `7z x "${zip}" -o"${dest}" -y`,
};
// Common alias — 7z is both the binary name and a reasonable config value.
EXTRACTORS['7z'] = EXTRACTORS['7zip'];

const EXTRACTOR_NAMES = ['auto', ...Object.keys(EXTRACTORS)];

const state = { extractor: 'auto' };

function setExtractor(name) {
  if (!name) return;
  if (!EXTRACTOR_NAMES.includes(name)) {
    throw new Error(`Unknown extractor "${name}". Valid: ${EXTRACTOR_NAMES.join(', ')}`);
  }
  state.extractor = name;
}

function extractZip(zipPath, destDir) {
  const { execSync } = require('child_process');
  fs.mkdirSync(destDir, { recursive: true });

  if (state.extractor !== 'auto') {
    const cmd = EXTRACTORS[state.extractor](zipPath, destDir);
    try {
      execSync(cmd, { stdio: 'pipe' });
      return;
    } catch (err) {
      throw new Error(`Extractor "${state.extractor}" failed — is it installed and on PATH? (${err.message.split('\n')[0]})`);
    }
  }

  // auto — try unzip first (handles zip metadata better), fall back to tar.
  // 7zip is not in the auto chain because it's uncommon on dev machines; users
  // who want it set "extractor": "7zip" in .pureadmin.json.
  for (const name of ['unzip', 'tar']) {
    try {
      execSync(EXTRACTORS[name](zipPath, destDir), { stdio: 'pipe' });
      return;
    } catch {}
  }
  throw new Error('Could not extract ZIP — install unzip or tar, or set "extractor" (unzip|tar|7zip) in .pureadmin.json');
}

module.exports = { copyDirSync, extractZip, setExtractor };
