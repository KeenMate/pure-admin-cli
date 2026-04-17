// ---------------------------------------------------------------------------
// Filesystem helpers
//
// Thin wrappers around fs.*Sync that:
//   1. Provide ergonomic defaults (mkdir is always recursive; removeDir is
//      always recursive + force — those are the only patterns we use).
//   2. Print a one-line dim trace when verbose mode is on, so the user can
//      see exactly which files the CLI mutates. Read-only ops (readFileSync,
//      existsSync, etc.) are NOT wrapped — they don't mutate state and
//      logging them would drown out the useful output.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

function logFs(action, target) {
  if (!state.verbose) return;
  const { dim } = require('./formatting');
  console.log(dim(`  [fs] ${action.padEnd(7)} ${target}`));
}

function mkdir(dir) {
  logFs('mkdir', dir);
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  logFs('write', filePath);
  fs.writeFileSync(filePath, content);
}

function removeFile(filePath) {
  logFs('rm', filePath);
  fs.unlinkSync(filePath);
}

function removeDir(dirPath) {
  logFs('rm -rf', dirPath);
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyFile(src, dest) {
  logFs('cp', `${src} → ${dest}`);
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest, exclude = []) {
  mkdir(dest);
  for (const entry of fs.readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      copyFile(srcPath, destPath);
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

const state = { extractor: 'auto', verbose: false };

function setVerbose(v) {
  state.verbose = !!v;
}

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

module.exports = {
  // mutating ops (verbose-logged)
  mkdir, writeFile, removeFile, removeDir, copyFile, copyDirSync, extractZip,
  // setup
  setExtractor, setVerbose,
};
