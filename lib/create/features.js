// ---------------------------------------------------------------------------
// features — resolve feature state, build scaffold flags, strip data-pa blocks
// ---------------------------------------------------------------------------
'use strict';

const fs = require('fs');
const { writeFile, removeFile } = require('../helpers/files');
const path = require('path');
const { flagToOpt } = require('./naming');

/**
 * Resolve which features are enabled based on recipe.features + CLI opts + preset.
 *
 * Resolution rules per feature:
 *   - isRequired: always true
 *   - cli is string "--flag":  enabled if opts[camelCase(flag)] is truthy.
 *                              Negative form "--no-X" enables when opts.noX is set.
 *                              Falls back to isDefault if opts is undefined.
 *   - cli is array (multi-option group, e.g. icons):
 *                              enabled if ANY option flag is set, OR if any option has isDefault: true
 *   - no cli, only isDefault:  enabled = isDefault
 *   - no cli, no defaults:     enabled = false
 *
 * Then preset overrides apply, then dependency chains are auto-enabled (transitive).
 *
 * Returns { [featureId]: boolean }.
 */
function resolveFeatures(features, opts, preset) {
  features = features || {};
  opts = opts || {};
  const enabled = {};

  for (const [id, feat] of Object.entries(features)) {
    if (feat.isRequired) {
      enabled[id] = true;
      continue;
    }

    if (Array.isArray(feat.cli)) {
      let isOn = false;
      let hasDefault = false;
      for (const entry of feat.cli) {
        const flag = typeof entry === 'string' ? entry : entry.flag;
        if (!flag) continue;
        const optKey = flagToOpt(flag);
        if (opts[optKey]) isOn = true;
        if (typeof entry === 'object' && entry.isDefault) hasDefault = true;
      }
      enabled[id] = isOn || hasDefault || feat.isDefault === true;
      continue;
    }

    if (typeof feat.cli === 'string') {
      const flag = feat.cli;
      const optKey = flagToOpt(flag);
      if (flag.startsWith('--no-')) {
        const baseKey = flagToOpt(flag.slice(5));
        if (opts[baseKey] !== undefined) {
          enabled[id] = !!opts[baseKey];
        } else if (opts[optKey] !== undefined) {
          enabled[id] = !opts[optKey];
        } else {
          enabled[id] = feat.isDefault !== false;
        }
      } else {
        if (opts[optKey] !== undefined) {
          enabled[id] = !!opts[optKey];
        } else {
          enabled[id] = feat.isDefault === true;
        }
      }
      continue;
    }

    enabled[id] = feat.isDefault === true;
  }

  if (preset && preset.features) {
    for (const [id, val] of Object.entries(preset.features)) {
      if (id in enabled) enabled[id] = !!val;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, feat] of Object.entries(features)) {
      if (enabled[id] && Array.isArray(feat.requires)) {
        for (const dep of feat.requires) {
          if (!enabled[dep]) {
            enabled[dep] = true;
            changed = true;
          }
        }
      }
    }
  }

  return enabled;
}

/**
 * Build the __SCAFFOLD_FLAGS__ string from feature state.
 */
function buildScaffoldFlags(features, enabled) {
  features = features || {};
  const flags = [];
  for (const [id, feat] of Object.entries(features)) {
    const isOn = !!enabled[id];
    if (!isOn) {
      const f = feat.scaffoldFlag || feat.scaffoldFlagWhenDisabled;
      if (f) flags.push(f);
    } else {
      if (feat.scaffoldFlagWhenEnabled) flags.push(feat.scaffoldFlagWhenEnabled);
    }
  }
  return flags.join(' ');
}

/**
 * Process template points: remove blocks for disabled features.
 * Scans all source files for data-pa markers and strips blocks belonging
 * to disabled features.
 */
function processTemplatePoints(appDir, enabledFlags, verbose, recipe) {
  const { bold, dim, green, yellow } = require('../helpers/formatting');
  const manifestPath = path.join(appDir, 'template.json');
  const manifest = recipe?.features ? recipe
    : fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : null;
  if (!manifest) return;

  const features = manifest.features || {};

  const enabled = {};
  for (const [id, feat] of Object.entries(features)) {
    enabled[id] = enabledFlags[id] !== undefined ? enabledFlags[id] : feat.default;
  }

  for (const [id, feat] of Object.entries(features)) {
    if (enabled[id] && feat.requires) {
      for (const dep of feat.requires) {
        if (!enabled[dep]) {
          enabled[dep] = true;
          if (verbose) console.log(dim(`    auto-enabled "${dep}" (required by "${id}")`));
        }
      }
    }
  }

  const pointsToRemove = new Set();
  for (const [id, feat] of Object.entries(features)) {
    if (!enabled[id] && feat.points) {
      for (const p of feat.points) pointsToRemove.add(p);
    }
  }

  if (pointsToRemove.size === 0) {
    if (verbose) console.log(dim('    all features enabled, no points to remove'));
    if (fs.existsSync(manifestPath)) removeFile(manifestPath);
    const helperPath = path.join(appDir, 'template.helper.js');
    if (fs.existsSync(helperPath)) removeFile(helperPath);
    return;
  }

  if (verbose) console.log(dim(`    removing ${pointsToRemove.size} point(s) for disabled features`));

  const htmlStart = (id) => `<!-- data-pa="${id}" -->`;
  const htmlEnd = (id) => `<!-- /data-pa="${id}" -->`;
  const jsStart = (id) => `// data-pa="${id}"`;
  const jsEnd = (id) => `// /data-pa="${id}"`;
  // HEEx markers
  const heexStart = (id) => `<%!-- data-pa="${id}" --%>`;
  const heexEnd = (id) => `<%!-- /data-pa="${id}" --%>`;

  const filesToScan = new Set();
  const scanExts = ['.svelte', '.html', '.heex', '.css', '.ts', '.js', '.ex', '.exs'];
  function findFiles(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (['node_modules', '.svelte-kit', '.git', 'build', 'dist', '_build', 'deps'].includes(entry)) continue;
      const p = path.join(dir, entry);
      if (fs.statSync(p).isDirectory()) findFiles(p);
      else if (scanExts.some(e => entry.endsWith(e))) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content.includes('data-pa=')) filesToScan.add(path.relative(appDir, p));
      }
    }
  }
  findFiles(appDir);

  for (const relPath of filesToScan) {
    const filePath = path.join(appDir, relPath);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    for (const pointId of pointsToRemove) {
      // Try each marker format: HTML, JS, HEEx
      for (const [startFn, endFn] of [[htmlStart, htmlEnd], [jsStart, jsEnd], [heexStart, heexEnd]]) {
        const hStart = startFn(pointId);
        const hEnd = endFn(pointId);
        if (content.includes(hStart) && content.includes(hEnd)) {
          const startIdx = content.indexOf(hStart);
          const endIdx = content.indexOf(hEnd) + hEnd.length;
          const before = content.lastIndexOf('\n', startIdx - 1);
          const after = content.indexOf('\n', endIdx);
          content = content.slice(0, before >= 0 ? before : startIdx) + content.slice(after >= 0 ? after : endIdx);
          modified = true;
        }
      }
    }

    if (modified) {
      content = content.replace(/\n{3,}/g, '\n\n');
      writeFile(filePath, content);
      if (verbose) console.log(`    ${green('~')} ${relPath} ${dim('(points removed)')}`);
    }
  }

  if (fs.existsSync(manifestPath)) removeFile(manifestPath);
  const helperFile = path.join(appDir, 'template.helper.js');
  if (fs.existsSync(helperFile)) removeFile(helperFile);
}

module.exports = {
  resolveFeatures,
  buildScaffoldFlags,
  processTemplatePoints,
};
