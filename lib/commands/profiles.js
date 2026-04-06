// ---------------------------------------------------------------------------
// profiles + presets commands — manage ~/.pureadmin.json entries
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green, yellow } = require('../formatting');
const { config } = require('../config');

function getUserConfigPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.pureadmin.json');
}

function loadUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(getUserConfigPath(), 'utf-8'));
  } catch { return {}; }
}

function saveUserConfig(cfg) {
  fs.writeFileSync(getUserConfigPath(), JSON.stringify(cfg, null, 2) + '\n');
}

// ── pureadmin profiles ──
async function cmdProfiles(subArgs) {
  const sub = subArgs[0];
  const cfg = loadUserConfig();

  if (!sub) {
    console.error(`\n  Use ${bold('profiles list')}, ${bold('profiles show <id>')}, or ${bold('profiles delete <id>')}.\n`);
    return;
  }

  if (sub === 'show') {
    const id = subArgs[1];
    if (!id) { console.error(`\n  ${bold('Error:')} usage: pureadmin profiles show <id>\n`); return; }
    const company = cfg.companies?.[id];
    if (!company) { console.log(`\n  Profile "${id}" not found.\n`); return; }
    console.log(`\n  ${bold(id)}\n`);
    if (company.name) console.log(`  ${dim('Name:')}       ${company.name}`);
    if (company.copyright) console.log(`  ${dim('Copyright:')}  ${company.copyright}`);
    if (company.defaultTheme) console.log(`  ${dim('Theme:')}      ${company.defaultTheme}`);
    if (company.defaultThemes) console.log(`  ${dim('Themes:')}     ${company.defaultThemes}`);
    for (const [wsPath, ws] of Object.entries(cfg.workspaces || {})) {
      const isMatch = (typeof ws === 'string' && ws === id) || ws?.companies?.includes(id);
      if (isMatch) {
        const isDefault = (typeof ws === 'string') || ws?.defaultCompany === id;
        console.log(`  ${dim('Workspace:')}  ${wsPath}${isDefault ? dim(' (default)') : ''}`);
      }
    }
    console.log();
    return;
  }

  if (sub === 'delete' || sub === 'rm') {
    const id = subArgs[1];
    if (!id) { console.error(`\n  ${bold('Error:')} usage: pureadmin profiles delete <id>\n`); return; }
    if (!cfg.companies?.[id]) { console.log(`\n  Profile "${id}" not found.\n`); return; }
    delete cfg.companies[id];
    // Also remove from workspaces
    for (const [wsPath, ws] of Object.entries(cfg.workspaces || {})) {
      if (typeof ws === 'string' && ws === id) delete cfg.workspaces[wsPath];
      else if (ws?.companies) {
        ws.companies = ws.companies.filter(c => c !== id);
        if (ws.defaultCompany === id) ws.defaultCompany = ws.companies[0] || null;
      }
    }
    saveUserConfig(cfg);
    console.log(`\n  ${green('Removed')} profile "${id}".\n`);
    return;
  }

  if (sub !== 'list') {
    console.error(`\n  ${bold('Error:')} Unknown profiles subcommand: ${sub}`);
    console.error(`  Available: list, show, delete\n`);
    return;
  }

  // list
  const companies = cfg.companies || {};
  const workspaces = cfg.workspaces || {};
  const entries = Object.entries(companies);

  if (entries.length === 0) {
    console.log(`\n  No company profiles configured.\n`);
    console.log(`  Add one to ${dim(getUserConfigPath())}:\n`);
    console.log(dim(`  {
    "companies": {
      "mycompany": {
        "name": "My Company",
        "copyright": "© 2026 My Company",
        "defaultThemes": "corporate,dark",
        "defaultTheme": "corporate"
      }
    }
  }`));
    console.log();
    return;
  }

  console.log(bold(`\n  ${entries.length} profile(s)\n`));

  for (const [id, company] of entries) {
    // Find workspace associations
    const wsMatches = [];
    for (const [wsPath, ws] of Object.entries(workspaces)) {
      if (typeof ws === 'string' && ws === id) wsMatches.push({ path: wsPath, isDefault: true });
      else if (ws?.companies?.includes(id)) wsMatches.push({ path: wsPath, isDefault: ws.defaultCompany === id });
    }

    console.log(`  ${cyan(id.padEnd(20))} ${company.name || id}`);
    if (company.copyright) console.log(`  ${' '.repeat(20)} ${dim(company.copyright)}`);
    if (company.defaultThemes) console.log(`  ${' '.repeat(20)} ${dim('themes: ' + company.defaultThemes)}`);
    for (const ws of wsMatches) {
      console.log(`  ${' '.repeat(20)} ${dim('workspace: ' + ws.path)}${ws.isDefault ? dim(' (default)') : ''}`);
    }
    console.log();
  }
}

// ── pureadmin presets ──
async function cmdPresets(subArgs) {
  const sub = subArgs[0];
  const cfg = loadUserConfig();

  if (!sub) {
    console.error(`\n  Use ${bold('presets list')}, ${bold('presets show <name>')}, or ${bold('presets delete <name>')}.\n`);
    return;
  }

  if (sub === 'delete' || sub === 'rm') {
    const name = subArgs[1];
    if (!name) { console.error(`\n  ${bold('Error:')} usage: pureadmin presets delete <name>\n`); return; }
    if (!cfg.createPresets?.[name]) { console.log(`\n  Preset "${name}" not found.\n`); return; }
    delete cfg.createPresets[name];
    saveUserConfig(cfg);
    console.log(`\n  ${green('Removed')} preset "${name}".\n`);
    return;
  }

  if (sub === 'show') {
    const name = subArgs[1];
    if (!name) { console.error(`\n  ${bold('Error:')} usage: pureadmin presets show <name>\n`); return; }
    const preset = cfg.createPresets?.[name];
    if (!preset) { console.log(`\n  Preset "${name}" not found.\n`); return; }
    console.log(`\n  ${bold(name)}\n`);
    console.log(`  ${dim('Template:')}  ${preset.templateId || '?'}`);
    if (preset.company) console.log(`  ${dim('Company:')}   ${preset.company}`);
    if (preset.themes?.length) console.log(`  ${dim('Themes:')}    ${preset.themes.join(', ')}`);
    if (preset.defaultTheme) console.log(`  ${dim('Default:')}   ${preset.defaultTheme}${preset.defaultVariant ? ' / ' + preset.defaultVariant : ''} (${preset.defaultMode || 'dark'})`);
    const features = preset.features || {};
    const enabled = Object.entries(features).filter(([, v]) => v.enabled && v.flag).map(([, v]) => v.flag);
    const disabled = Object.entries(features).filter(([k, v]) => !v.enabled && !v.flag === null).map(([k]) => k);
    if (enabled.length) console.log(`  ${dim('Features:')}  ${enabled.join(' ')}`);
    console.log();
    return;
  }

  if (sub !== 'list') {
    console.error(`\n  ${bold('Error:')} Unknown presets subcommand: ${sub}`);
    console.error(`  Available: list, show, delete\n`);
    return;
  }

  // list
  const presets = cfg.createPresets || {};
  const entries = Object.entries(presets);

  // Also show legacy presets
  const legacyPresets = cfg.presets || {};
  const legacyEntries = Object.entries(legacyPresets);

  if (entries.length === 0 && legacyEntries.length === 0) {
    console.log(`\n  No presets saved. Run ${cyan('pureadmin create')} and save one at the end.\n`);
    return;
  }

  if (entries.length > 0) {
    console.log(bold(`\n  ${entries.length} create preset(s)\n`));
    for (const [name, preset] of entries) {
      const parts = [];
      if (preset.templateId) parts.push(preset.templateId);
      const flags = Object.entries(preset.features || {})
        .filter(([, v]) => v.enabled && v.flag)
        .map(([, v]) => v.flag.replace('--', ''));
      if (flags.length) parts.push(flags.join(', '));
      if (preset.themes?.length) parts.push(preset.themes.join('+'));
      console.log(`  ${cyan(name.padEnd(20))} ${dim(parts.join(' · '))}`);
    }
    console.log();
  }

  if (legacyEntries.length > 0) {
    console.log(bold(`  ${legacyEntries.length} company preset(s)`) + dim(' (legacy --preset flag)\n'));
    for (const [name, preset] of legacyEntries) {
      const parts = [];
      if (preset.fontAwesome) parts.push('FA');
      if (preset.profilePanel) parts.push('profile');
      if (preset.pages?.length) parts.push(`${preset.pages.length} pages`);
      console.log(`  ${cyan(name.padEnd(20))} ${dim(parts.join(', '))}`);
    }
    console.log();
  }
}

module.exports = { cmdProfiles, cmdPresets };
