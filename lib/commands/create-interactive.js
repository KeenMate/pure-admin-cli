// ---------------------------------------------------------------------------
// Interactive create wizard using @clack/prompts
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green } = require('../formatting');
const { fetchJson } = require('../http');
const { config } = require('../config');

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

function ifAvailable(saved, available) {
  return saved && available.includes(saved) ? saved : undefined;
}

async function cmdCreateInteractive(opts) {
  const { intro, outro, text, select, multiselect, confirm, note, isCancel, cancel, spinner, log } = await import('@clack/prompts');
  const last = loadLastCreate();
  const s = spinner();

  intro(bold('pureadmin create'));

  // ── 1. Load data in parallel ──
  s.start('Loading...');
  let templates = [], availableThemes = [];
  try {
    const [tplResult, themeResult] = await Promise.all([
      fetchJson('/api/templates').catch(() => ({ templates: [] })),
      fetchJson('/api/themes').catch(() => ({ themes: [] })),
    ]);
    templates = tplResult.templates || [];
    availableThemes = (themeResult.themes || []).map(t => t.slug || t.id);
    s.stop(`${templates.length} template(s), ${availableThemes.length} theme(s)`);
  } catch {
    s.stop('Could not reach server');
  }

  if (templates.length === 0) {
    cancel('No templates available. Check your --server URL.');
    process.exit(0);
  }

  // ── 2. Company profile (if configured) ──
  const companies = Object.keys(config.companies || {});
  let company = null;
  if (companies.length > 0) {
    company = await select({
      message: 'Profile',
      initialValue: ifAvailable(last.company, ['', ...companies]) || '',
      options: [
        { value: '', label: 'None', hint: 'no company defaults' },
        ...companies.map(c => ({
          value: c,
          label: config.companies[c].name || c,
        }))
      ]
    });
    if (isCancel(company)) { cancel('Cancelled.'); process.exit(0); }
    if (company === '') company = null;
  }

  // ── 3. Template (technology + variant combined) ──
  const templateId = templates.length === 1
    ? templates[0].id
    : await select({
        message: 'Template',
        initialValue: ifAvailable(last.templateId, templates.map(t => t.id)),
        options: templates.map(t => ({
          value: t.id,
          label: t.name,
          hint: `${t.technology}/${t.variant}`
        }))
      });
  if (isCancel(templateId)) { cancel('Cancelled.'); process.exit(0); }
  const template = templates.find(t => t.id === templateId);

  // ── 4. App name + display name ──
  const appName = await text({
    message: 'App name',
    placeholder: 'my-app',
    validate: (val) => {
      if (!val?.trim()) return 'Required';
      if (!/^[a-z][a-z0-9-]*$/.test(val.trim())) return 'Kebab-case only (lowercase, hyphens)';
    }
  });
  if (isCancel(appName)) { cancel('Cancelled.'); process.exit(0); }

  const autoDisplayName = appName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const companyName = company ? config.companies[company]?.name : null;
  const displayName = companyName || autoDisplayName;

  // ── 5. Features (single multiselect) ──
  const features = template.features || {};
  const featureSelections = {};
  const lastFeatures = last.features || {};

  // Separate required, toggleable, and dropdown features
  const toggleableFeatures = [];
  const dropdownFeatures = [];

  for (const [key, feature] of Object.entries(features)) {
    if (feature.isRequired) {
      featureSelections[key] = { enabled: true, flag: null };
      continue;
    }
    if (Array.isArray(feature.cli)) {
      dropdownFeatures.push({ key, feature });
    } else {
      toggleableFeatures.push({ key, feature });
    }
  }

  // Toggleable features as one multiselect
  if (toggleableFeatures.length > 0) {
    const lastSelected = toggleableFeatures
      .filter(({ key, feature }) => {
        if (lastFeatures[key] !== undefined) return lastFeatures[key].enabled;
        return feature.isDefault === true;
      })
      .map(({ key }) => key);

    const selected = await multiselect({
      message: 'Features',
      options: toggleableFeatures.map(({ key, feature }) => ({
        value: key,
        label: key,
        hint: feature.description,
      })),
      initialValues: lastSelected,
      required: false,
    });
    if (isCancel(selected)) { cancel('Cancelled.'); process.exit(0); }

    for (const { key, feature } of toggleableFeatures) {
      const enabled = selected.includes(key);
      featureSelections[key] = { enabled, flag: enabled ? feature.cli : null };
    }
  }

  // Dropdown features (e.g. icon provider)
  for (const { key, feature } of dropdownFeatures) {
    const defaultOpt = feature.cli.find(o => o.isDefault);
    const lastFlag = lastFeatures[key]?.flag;
    const options = [
      { value: '', label: 'None' },
      ...feature.cli.map(o => ({
        value: o.flag,
        label: o.name,
        hint: o.isDefault ? 'default' : undefined,
      }))
    ];

    const picked = await select({
      message: key.charAt(0).toUpperCase() + key.slice(1),
      initialValue: ifAvailable(lastFlag, feature.cli.map(o => o.flag)) || defaultOpt?.flag || '',
      options,
    });
    if (isCancel(picked)) { cancel('Cancelled.'); process.exit(0); }
    featureSelections[key] = { enabled: !!picked, flag: picked || null };
  }

  // ── 6. Themes (multiselect + default) ──
  if (availableThemes.length === 0) availableThemes = ['corporate', 'audi', 'dark'];
  const lastThemes = (last.themes || ['corporate', 'audi', 'dark']).filter(t => availableThemes.includes(t));

  const selectedThemes = await multiselect({
    message: 'Themes',
    options: availableThemes.map(t => ({ value: t, label: t })),
    initialValues: lastThemes,
    required: true,
  });
  if (isCancel(selectedThemes)) { cancel('Cancelled.'); process.exit(0); }

  // Default theme + variant + mode in one step
  let defaultTheme = selectedThemes[0];
  let defaultVariant = '';
  let defaultMode = 'dark';

  // Build combined options: theme / variant / mode
  const themeOptions = [];
  for (const themeId of selectedThemes) {
    let variants = [];
    try {
      const detail = await fetchJson(`/api/themes/${encodeURIComponent(themeId)}`);
      variants = detail?.theme?.variants || [];
    } catch {}

    if (variants.length === 0) {
      themeOptions.push({ value: `${themeId}||dark`, label: themeId });
    } else {
      for (const v of variants) {
        const vName = v.name || 'Default';
        const vClass = v.cssClass || '';
        const modes = v.modes || [];
        if (modes.length <= 1) {
          const mode = modes[0]?.mode || 'dark';
          const label = variants.length === 1
            ? `${themeId} ${dim(`(${modes[0]?.name || mode})`)}`
            : `${themeId} / ${vName} ${dim(`(${modes[0]?.name || mode})`)}`;
          themeOptions.push({ value: `${themeId}|${vClass}|${mode}`, label });
        } else {
          for (const m of modes) {
            const label = variants.length === 1
              ? `${themeId} ${dim(`(${m.name})`)}`
              : `${themeId} / ${vName} ${dim(`(${m.name})`)}`;
            themeOptions.push({
              value: `${themeId}|${vClass}|${m.mode}`,
              label,
              hint: m.default ? 'default' : undefined,
            });
          }
        }
      }
    }
  }

  if (themeOptions.length > 1) {
    const lastCombo = `${last.defaultTheme || ''}|${last.defaultVariant || ''}|${last.defaultMode || 'dark'}`;
    const picked = await select({
      message: 'Default appearance',
      initialValue: ifAvailable(lastCombo, themeOptions.map(o => o.value)),
      options: themeOptions,
    });
    if (isCancel(picked)) { cancel('Cancelled.'); process.exit(0); }
    [defaultTheme, defaultVariant, defaultMode] = picked.split('|');
  } else if (themeOptions.length === 1) {
    [defaultTheme, defaultVariant, defaultMode] = themeOptions[0].value.split('|');
  }

  // ── 7. Build opts and show summary ──
  const createOpts = {
    ...opts,
    template: template.id,
    name: displayName,
    themes: selectedThemes.join(','),
    theme: defaultTheme,
    defaultVariant,
    defaultMode,
    company: company || undefined,
  };

  for (const [key, sel] of Object.entries(featureSelections)) {
    if (!sel.enabled) continue;
    const feature = features[key];
    if (Array.isArray(feature?.cli)) {
      if (sel.flag === '--font-awesome') createOpts.fontAwesome = true;
      else if (sel.flag === '--lucide') createOpts.lucide = true;
      else if (sel.flag === '--fluent-ui') createOpts.fluentUi = true;
    } else if (feature?.cli === '--profile-panel') createOpts.profilePanel = true;
    else if (feature?.cli === '--settings-panel') createOpts.settingsPanel = true;
  }

  // Summary
  const flags = [`--template ${template.id}`];
  if (createOpts.name) flags.push(`--name "${createOpts.name}"`);
  flags.push(`--themes ${createOpts.themes}`);
  if (defaultTheme !== selectedThemes[0]) flags.push(`--theme ${defaultTheme}`);
  if (createOpts.fontAwesome) flags.push('--font-awesome');
  if (createOpts.lucide) flags.push('--lucide');
  if (createOpts.profilePanel) flags.push('--profile-panel');
  if (createOpts.settingsPanel) flags.push('--settings-panel');
  if (company) flags.push(`--company ${company}`);

  note(`pureadmin create ${appName} \\\n  ${flags.join(' \\\n  ')}`, 'Command');

  const proceed = await confirm({ message: 'Create?', initialValue: true });
  if (isCancel(proceed) || !proceed) { cancel('Cancelled.'); process.exit(0); }

  // ── 8. Save + run ──
  saveLastCreate({
    technology: template.technology,
    templateId: template.id,
    features: featureSelections,
    themes: selectedThemes,
    defaultTheme,
    defaultVariant,
    defaultMode,
    company: company || undefined,
  });

  const { cmdCreate } = require('./create');
  await cmdCreate(appName.trim(), createOpts, () => {});

  outro(green('Done!'));
}

module.exports = { cmdCreateInteractive };
