// ---------------------------------------------------------------------------
// Interactive create wizard using @clack/prompts
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green } = require('../formatting');
const { fetchJson, getBaseUrl } = require('../http');
const { config } = require('../config');

// Load/save last wizard selections from ~/.pureadmin.json
function loadLastCreate() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.pureadmin.json'), 'utf-8'));
    return cfg.lastCreate || {};
  } catch { return {}; }
}

function saveLastCreate(selections) {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    const cfgPath = path.join(home, '.pureadmin.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch {}
    cfg.lastCreate = selections;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  } catch {}
}

// Only return initialValue if it exists in the available options
function ifAvailable(saved, available) {
  return saved && available.includes(saved) ? saved : undefined;
}

async function cmdCreateInteractive(opts) {
  // Dynamic import for ESM-only @clack/prompts
  const { intro, outro, text, select, multiselect, confirm, isCancel, cancel, spinner } = await import('@clack/prompts');

  const last = loadLastCreate();

  intro(bold('pureadmin create'));

  // 1. Fetch templates from API
  const s = spinner();
  s.start('Loading templates...');
  let templates;
  try {
    const result = await fetchJson('/api/templates');
    templates = result.templates || [];
    s.stop(`${templates.length} template(s) available`);
  } catch {
    s.stop('Could not reach server');
    templates = [];
  }

  if (templates.length === 0) {
    cancel('No templates available. Check your --server URL.');
    process.exit(0);
  }

  // 2. Group by technology
  const techGroups = {};
  for (const t of templates) {
    const tech = t.technology || 'other';
    if (!techGroups[tech]) techGroups[tech] = [];
    techGroups[tech].push(t);
  }

  // 3. Pick technology
  const techKeys = Object.keys(techGroups).sort();
  const technology = await select({
    message: 'Technology',
    initialValue: ifAvailable(last.technology, techKeys),
    options: techKeys.map(t => ({
      value: t,
      label: t.charAt(0).toUpperCase() + t.slice(1),
      hint: `${techGroups[t].length} template(s)`
    }))
  });
  if (isCancel(technology)) { cancel('Cancelled.'); process.exit(0); }

  // 4. Pick variant
  const variants = techGroups[technology].sort((a, b) => a.id.localeCompare(b.id));
  const templateId = await select({
    message: 'Template',
    initialValue: ifAvailable(last.templateId, variants.map(v => v.id)),
    options: variants.map(t => ({
      value: t.id,
      label: t.name,
      hint: t.description
    }))
  });
  if (isCancel(templateId)) { cancel('Cancelled.'); process.exit(0); }
  const template = variants.find(t => t.id === templateId);

  // 5. App name
  const appName = await text({
    message: 'App name (kebab-case)',
    placeholder: 'my-app',
    defaultValue: last.appName || undefined,
    validate: (val) => {
      if (!val || !val.trim()) return 'Required';
      if (!/^[a-z][a-z0-9-]*$/.test(val.trim())) return 'Must be kebab-case (lowercase, hyphens)';
    }
  });
  if (isCancel(appName)) { cancel('Cancelled.'); process.exit(0); }

  // 6. Display name
  const defaultDisplayName = appName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const displayName = await text({
    message: 'Display name',
    placeholder: defaultDisplayName,
    defaultValue: defaultDisplayName
  });
  if (isCancel(displayName)) { cancel('Cancelled.'); process.exit(0); }

  // 7. Features
  const features = template.features || {};
  const featureKeys = Object.keys(features).sort();
  const featureSelections = {};
  const lastFeatures = last.features || {};

  for (const key of featureKeys) {
    const feature = features[key];

    if (feature.isRequired) {
      featureSelections[key] = { enabled: true, flag: null };
      continue;
    }

    if (Array.isArray(feature.cli)) {
      // Dropdown: pick one option or skip
      const lastEnabled = lastFeatures[key] !== undefined ? lastFeatures[key].enabled : (feature.isDefault !== false);
      const enableIt = await confirm({
        message: `Include ${key}? ${dim(feature.description)}`,
        initialValue: lastEnabled
      });
      if (isCancel(enableIt)) { cancel('Cancelled.'); process.exit(0); }

      if (enableIt) {
        const lastFlag = lastFeatures[key]?.flag;
        const defaultOpt = feature.cli.find(o => o.isDefault);
        const optionFlags = feature.cli.map(o => o.flag);
        if (feature.cli.length === 1) {
          featureSelections[key] = { enabled: true, flag: feature.cli[0].flag };
        } else {
          const picked = await select({
            message: `${key} provider`,
            initialValue: ifAvailable(lastFlag, optionFlags) || defaultOpt?.flag,
            options: feature.cli.map(o => ({
              value: o.flag,
              label: o.name,
              hint: o.isDefault ? 'default' : undefined
            }))
          });
          if (isCancel(picked)) { cancel('Cancelled.'); process.exit(0); }
          featureSelections[key] = { enabled: true, flag: picked };
        }
      } else {
        featureSelections[key] = { enabled: false, flag: null };
      }
    } else {
      // Simple toggle
      const lastEnabled = lastFeatures[key] !== undefined ? lastFeatures[key].enabled : (feature.isDefault === true);
      const enableIt = await confirm({
        message: `Include ${key}? ${dim(feature.description)}`,
        initialValue: lastEnabled
      });
      if (isCancel(enableIt)) { cancel('Cancelled.'); process.exit(0); }
      featureSelections[key] = { enabled: enableIt, flag: enableIt ? feature.cli : null };
    }
  }

  // 8. Themes
  s.start('Loading themes...');
  let availableThemes = [];
  try {
    const result = await fetchJson('/api/themes');
    availableThemes = (result.themes || []).map(t => t.slug || t.id);
    s.stop(`${availableThemes.length} theme(s) available`);
  } catch {
    s.stop('Could not load themes, using defaults');
    availableThemes = ['corporate', 'audi', 'dark'];
  }

  const lastThemes = (last.themes || ['corporate', 'audi', 'dark']).filter(t => availableThemes.includes(t));
  const selectedThemes = await multiselect({
    message: 'Themes to include',
    options: availableThemes.map(t => ({ value: t, label: t })),
    initialValues: lastThemes.filter(t => availableThemes.includes(t)),
    required: true
  });
  if (isCancel(selectedThemes)) { cancel('Cancelled.'); process.exit(0); }

  const lastDefaultTheme = last.defaultTheme;
  const defaultTheme = selectedThemes.length === 1
    ? selectedThemes[0]
    : await select({
        message: 'Default theme',
        initialValue: ifAvailable(lastDefaultTheme, selectedThemes),
        options: selectedThemes.map(t => ({ value: t, label: t }))
      });
  if (isCancel(defaultTheme)) { cancel('Cancelled.'); process.exit(0); }

  // 8b. Fetch default theme metadata and pick default mode
  let defaultMode = 'dark';
  s.start(`Loading ${defaultTheme} metadata...`);
  let themeModes = [];
  try {
    const themeDetail = await fetchJson(`/api/themes/${encodeURIComponent(defaultTheme)}`);
    const variants = themeDetail?.theme?.variants || [];
    if (variants.length > 0) {
      themeModes = (variants[0].modes || []).map(m => ({
        id: m.mode,
        name: m.name,
        isDefault: !!m.default
      }));
    }
    s.stop(`${themeModes.length} mode(s)`);
  } catch {
    s.stop('Could not load theme metadata');
  }

  if (themeModes.length > 1) {
    const themeDefault = themeModes.find(m => m.isDefault);
    defaultMode = await select({
      message: 'Default color mode',
      initialValue: ifAvailable(last.defaultMode, themeModes.map(m => m.id)) || themeDefault?.id,
      options: themeModes.map(m => ({
        value: m.id,
        label: m.name,
        hint: m.isDefault ? 'theme default' : undefined
      }))
    });
    if (isCancel(defaultMode)) { cancel('Cancelled.'); process.exit(0); }
  } else if (themeModes.length === 1) {
    defaultMode = themeModes[0].id;
  }

  // 9. Company / preset
  const companies = Object.keys(config.companies || {});
  let company = null;
  if (companies.length > 0) {
    const useCompany = await confirm({
      message: 'Use a company profile?',
      initialValue: !!last.company
    });
    if (isCancel(useCompany)) { cancel('Cancelled.'); process.exit(0); }

    if (useCompany) {
      company = await select({
        message: 'Company',
        initialValue: ifAvailable(last.company, companies),
        options: companies.map(c => ({
          value: c,
          label: (config.companies[c].name || c)
        }))
      });
      if (isCancel(company)) { cancel('Cancelled.'); process.exit(0); }
    }
  }

  // 10. Build the command args
  const createOpts = {
    ...opts,
    template: template.id,
    name: displayName || undefined,
    themes: selectedThemes.join(','),
    theme: defaultTheme,
    defaultMode,
    company: company || undefined,
  };

  // Map feature selections to CLI opts
  for (const [key, sel] of Object.entries(featureSelections)) {
    if (!sel.enabled) continue;
    const feature = features[key];

    if (Array.isArray(feature.cli)) {
      if (sel.flag === '--font-awesome') createOpts.fontAwesome = true;
      else if (sel.flag === '--lucide') createOpts.lucide = true;
      else if (sel.flag === '--fluent-ui') createOpts.fluentUi = true;
    } else if (feature.cli === '--profile-panel') {
      createOpts.profilePanel = true;
    } else if (feature.cli === '--settings-panel') {
      createOpts.settingsPanel = true;
    } else if (feature.cli === '--floating-ui') {
      createOpts.floatingUi = true;
    } else if (feature.cli === '--page-loader') {
      createOpts.pageLoader = true;
    } else if (feature.cli === '--footer') {
      createOpts.footer = true;
    }
  }

  // Show summary
  const flags = [];
  flags.push(`--template ${template.id}`);
  if (createOpts.name) flags.push(`--name "${createOpts.name}"`);
  flags.push(`--themes ${createOpts.themes}`);
  if (createOpts.theme !== selectedThemes[0]) flags.push(`--theme ${createOpts.theme}`);
  if (createOpts.fontAwesome) flags.push('--font-awesome');
  if (createOpts.profilePanel) flags.push('--profile-panel');
  if (createOpts.settingsPanel) flags.push('--settings-panel');
  if (createOpts.company) flags.push(`--company ${createOpts.company}`);

  console.log();
  console.log(dim(`  pureadmin create ${appName} ${flags.join(' ')}`));
  console.log();

  const proceed = await confirm({
    message: 'Create this app?',
    initialValue: true
  });
  if (isCancel(proceed) || !proceed) { cancel('Cancelled.'); process.exit(0); }

  // 11. Save selections for next time
  saveLastCreate({
    technology,
    templateId: template.id,
    features: featureSelections,
    themes: selectedThemes,
    defaultTheme,
    defaultMode,
    company: company || undefined,
  });

  // 12. Run create
  const { cmdCreate } = require('./create');
  await cmdCreate(appName.trim(), createOpts, () => {});

  outro(green('Done!'));
}

module.exports = { cmdCreateInteractive };
