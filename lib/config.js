// ---------------------------------------------------------------------------
// Config: pureadmin.json + .pureadmin.json -> env var -> default
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const TOOL_VERSION = require(path.join(__dirname, '..', 'package.json')).version;
const TOOL_NAME = 'pureadmin';

function tryLoadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function loadConfig() {
  const config = {};

  // 1. User home (~/.pureadmin.json) — base defaults
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const data = tryLoadJson(path.join(home, '.pureadmin.json'));
    if (data) {
      Object.assign(config, data);
      config._configPath = path.join(home, '.pureadmin.json');
    }
  }

  // 2. Project-level (walks up from cwd)
  //    pureadmin.json  — base config (checked in)
  //    .pureadmin.json — local overrides merged on top (gitignored, secrets)
  let dir = process.cwd();
  while (true) {
    const base = tryLoadJson(path.join(dir, 'pureadmin.json'));
    const local = tryLoadJson(path.join(dir, '.pureadmin.json'));
    if (base || local) {
      if (base) {
        Object.assign(config, base);
        config._configPath = path.join(dir, 'pureadmin.json');
      }
      if (local) {
        Object.assign(config, local);
        config._configPath = path.join(dir, '.pureadmin.json');
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Project config helpers
// ---------------------------------------------------------------------------
function findProjectConfig() {
  // Find the nearest pureadmin.json from cwd (not home — project only)
  let dir = process.cwd();
  while (true) {
    const p = path.join(dir, 'pureadmin.json');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadProjectConfig() {
  const configPath = findProjectConfig();
  if (configPath) {
    try {
      return { path: configPath, data: JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    } catch {}
  }
  return { path: path.join(process.cwd(), 'pureadmin.json'), data: {} };
}

function saveProjectConfig(configPath, data) {
  // Don't persist internal fields
  const clean = { ...data };
  delete clean._configPath;
  fs.writeFileSync(configPath, JSON.stringify(clean, null, 2) + '\n');
}

// Initialize config and BASE_URL at load time
const config = loadConfig();

module.exports = {
  TOOL_VERSION,
  TOOL_NAME,
  config,
  tryLoadJson,
  loadConfig,
  findProjectConfig,
  loadProjectConfig,
  saveProjectConfig,
};
