// ---------------------------------------------------------------------------
// create command — create a SvelteKit app with Pure Admin
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow } = require('../helpers/formatting');
const { config } = require('../config');
const { fetchJson, fetchText, downloadFile } = require('../http');
const { copyDirSync, mkdir, writeFile, removeFile, removeDir, copyFile } = require('../helpers/files');
const { deepMerge } = require('../helpers/objects');
const { toSnakeCase, toPascalCase, toTitleCase, flagToOpt } = require('../create/naming');
const preparators = require('../create/preparators');
const { resolveFeatures, buildScaffoldFlags, processTemplatePoints } = require('../create/features');
const { resolveIconMarkup } = require('../create/icons');

async function cmdCreate(appName, opts, usage) {
  if (!appName) return usage('create requires an app name (e.g. my-app)');

  // Validate --default-mode at the CLI boundary. Unknown values silently
  // corrupt the FOUC-prevention script (falls through to localStorage value
  // not matching any pa-mode-* class).
  if (opts.defaultMode && !['light', 'dark', 'auto'].includes(opts.defaultMode)) {
    return usage(`--default-mode must be one of: light, dark, auto (got "${opts.defaultMode}")`);
  }

  // Provenance — tracks where each resolved value came from so the README
  // can show "value (source)" annotations. Keys match ctx fields.
  const provenance = {};

  // Resolve company from --company flag or workspace path
  let companyId = opts.company;
  let companyWorkspacePath = null;
  if (opts.company) {
    provenance.company = `CLI flag --company`;
  } else if (!companyId) {
    const cwd = process.cwd().replace(/\\/g, '/');
    const workspaces = config.workspaces || {};
    const sorted = Object.keys(workspaces).sort((a, b) => b.length - a.length);
    for (const wsPath of sorted) {
      const normalized = wsPath.replace(/\\/g, '/').replace(/\/+$/, '');
      if (cwd.toLowerCase().startsWith(normalized.toLowerCase())) {
        const ws = workspaces[wsPath];
        companyId = typeof ws === 'string' ? ws : ws.defaultCompany;
        companyWorkspacePath = wsPath;
        if (companyId) provenance.company = `workspace "${wsPath}" defaultCompany`;
        break;
      }
    }
  }
  const company = companyId ? (config.companies || {})[companyId] : null;
  const preset = opts.preset ? (config.presets || {})[opts.preset] : null;
  if (opts.preset) provenance.preset = 'CLI flag --preset';
  const fallback = config.create || {};

  // Merge: CLI flags > preset > company > config.create defaults.
  // Returns both the resolved value and its source for provenance tracking.
  function resolveWithSource(key, cliVal, cliFlag) {
    if (cliVal !== undefined) return { value: cliVal, source: cliFlag ? `CLI flag ${cliFlag}` : 'CLI flag' };
    if (preset && preset[key] !== undefined) return { value: preset[key], source: `preset "${opts.preset}"` };
    if (company && company[key] !== undefined) return { value: company[key], source: `company "${companyId}"` };
    if (fallback[key] !== undefined) return { value: fallback[key], source: 'config.create defaults' };
    return { value: undefined, source: null };
  }
  function resolve(key, cliVal) {
    return resolveWithSource(key, cliVal).value;
  }

  // Track provenance for each resolved value
  const tplR = resolveWithSource('template', opts.template, '--template');
  const template = tplR.value || 'svelte-sveltekit';
  provenance.template = tplR.source || 'default (svelte-sveltekit)';

  let themesR;
  if (opts.themes !== undefined) themesR = { value: opts.themes, source: 'CLI flag --themes' };
  else if (preset?.themes !== undefined) themesR = { value: preset.themes, source: `preset "${opts.preset}"` };
  else if (company?.defaultThemes !== undefined) themesR = { value: company.defaultThemes, source: `company "${companyId}"` };
  else if (fallback.defaultThemes !== undefined) themesR = { value: fallback.defaultThemes, source: 'config.create defaults' };
  else themesR = { value: 'corporate,audi,dark', source: 'built-in default' };
  const themeIds = themesR.value.split(',').map(s => s.trim());
  provenance.themes = themesR.source;

  let defaultThemeR;
  if (opts.theme !== undefined) defaultThemeR = { value: opts.theme, source: 'CLI flag --theme' };
  else if (preset?.defaultTheme !== undefined) defaultThemeR = { value: preset.defaultTheme, source: `preset "${opts.preset}"` };
  else if (company?.defaultTheme !== undefined) defaultThemeR = { value: company.defaultTheme, source: `company "${companyId}"` };
  else defaultThemeR = { value: themeIds[0], source: 'first of themes' };
  const defaultTheme = defaultThemeR.value;
  provenance.defaultTheme = defaultThemeR.source;

  let displayName, displayNameSource;
  if (opts.name) { displayName = opts.name; displayNameSource = 'CLI flag --name'; }
  else if (company?.name) { displayName = company.name; displayNameSource = `company "${companyId}"`; }
  else { displayName = toTitleCase(appName); displayNameSource = 'derived from app name'; }
  provenance.displayName = displayNameSource;

  const copyrightR = resolveWithSource('copyright', undefined);
  const copyright = copyrightR.value || displayName;
  provenance.copyright = copyrightR.source || `derived from display name`;

  const logo = resolve('logo') || '';
  const includeFontAwesome = opts.fontAwesome || resolve('fontAwesome') || false;
  const includeProfilePanel = opts.profilePanel || resolve('profilePanel') || false;
  const includeSettingsPanel = opts.settingsPanel || resolve('settingsPanel') || false;
  const skipInstall = opts.noInstall || false;
  const verbose = opts.verbose || false;

  // Build the full create-invocation string so templates can embed it in README.
  // Captures the actual flags the user (or wizard) chose, so the command is
  // reproducible and auditable after the fact.
  function buildCreateCommand() {
    const parts = ['npx @keenmate/pureadmin create', appName];
    if (opts.name) parts.push(`--name "${opts.name}"`);
    if (template) parts.push(`--template ${template}`);
    if (themeIds && themeIds.length) parts.push(`--themes ${themeIds.join(',')}`);
    if (opts.theme && opts.theme !== themeIds[0]) parts.push(`--theme ${opts.theme}`);
    if (includeFontAwesome) parts.push('--font-awesome');
    if (opts.lucide) parts.push('--lucide');
    if (opts.heroicons) parts.push('--heroicons');
    if (opts.fluentUi) parts.push('--fluent-ui');
    if (includeProfilePanel) parts.push('--profile-panel');
    if (includeSettingsPanel) parts.push('--settings-panel');
    // Use resolved companyId (includes workspace-auto-detected) so the command
    // is reproducible outside the current workspace directory.
    if (companyId) parts.push(`--company ${companyId}`);
    if (opts.preset) parts.push(`--preset ${opts.preset}`);
    if (opts.defaultMode) parts.push(`--default-mode ${opts.defaultMode}`);
    if (opts.defaultVariant) parts.push(`--default-variant ${opts.defaultVariant}`);
    // Passthrough flags — any unknown --foo captured in opts that doesn't already
    // map to one of the explicit flags above. Covers feature-defined flags like --no-ecto.
    const handledOpts = new Set([
      'template', 'templatePath', 'themes', 'theme', 'fontAwesome', 'lucide', 'heroicons', 'fluentUi',
      'profilePanel', 'settingsPanel', 'company', 'preset', 'verbose', 'noInstall',
      'noBuild', 'noMakefile', 'name', 'server', 'local', 'offline', 'dir', 'output',
      'version', 'apiKey', 'defaultMode', 'defaultVariant',
    ]);
    for (const [key, val] of Object.entries(opts)) {
      if (handledOpts.has(key)) continue;
      // Convert camelCase back to --kebab-case
      const flag = '--' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      if (val === true) parts.push(flag);
      else if (val !== false && val != null) parts.push(`${flag} ${val}`);
    }
    return parts.join(' ');
  }
  const createCommand = buildCreateCommand();
  // The createCommand value is finalized up-front; register it on ctx so
  // setCreateCommand can populate the CREATE_COMMAND placeholder.
  // (Populated here because ctx was built above.)

  console.log();
  console.log(bold(`  Creating ${displayName}`) + dim(` (${template} + Pure Admin)`));
  if (opts.company) console.log(`  ${dim('Company:')} ${company?.name || opts.company}`);
  if (opts.preset) console.log(`  ${dim('Preset:')} ${opts.preset}`);
  console.log(`  ${dim('Themes:')} ${themeIds.join(', ')} ${dim(`(default: ${defaultTheme})`)}`);
  if (includeFontAwesome) console.log(`  ${dim('Icons:')} FontAwesome (CDN)`);
  console.log();

  const { execSync } = require('child_process');

  // Detect package manager: prefer pnpm > bun > npm
  function detectPm() {
    for (const pm of ['pnpm', 'bun']) {
      try { execSync(`${pm} --version`, { stdio: 'pipe' }); return pm; } catch {}
    }
    return 'npm';
  }
  const pm = detectPm();
  if (pm !== 'npm') console.log(`  ${dim('Package manager:')} ${pm}`);

  // Icon provider resolution: lucide (Svelte only), heroicons (Phoenix), font-awesome,
  // or 'none' when no flag/preset/company sets one — __ICON:*__ placeholders then
  // resolve to empty strings (no <i> in the DOM).
  let iconProvider, iconProviderSource;
  if (opts.lucide) { iconProvider = 'lucide'; iconProviderSource = 'CLI flag --lucide'; }
  else if (opts.heroicons) { iconProvider = 'heroicons'; iconProviderSource = 'CLI flag --heroicons'; }
  else if (opts.fluentUi) { iconProvider = 'fluent-ui'; iconProviderSource = 'CLI flag --fluent-ui'; }
  else if (opts.fontAwesome) { iconProvider = 'font-awesome'; iconProviderSource = 'CLI flag --font-awesome'; }
  else if (preset?.fontAwesome) { iconProvider = 'font-awesome'; iconProviderSource = `preset "${opts.preset}"`; }
  else if (company?.fontAwesome) { iconProvider = 'font-awesome'; iconProviderSource = `company "${companyId}"`; }
  else { iconProvider = 'none'; iconProviderSource = 'default (no icon flag)'; }
  provenance.iconProvider = iconProviderSource;
  provenance.pm = 'auto-detected';
  provenance.defaultMode = opts.defaultMode ? 'CLI flag --default-mode' : 'default "auto"';

  // ──────────────────────────────────────────────────────────────────────
  // Build ctx — the single mutable bag passed through the pipeline.
  // ctx.placeholders is the SOURCE OF TRUTH for __VAR__ substitutions.
  // Preparators (lib/create/preparators.js) write into it.
  // ──────────────────────────────────────────────────────────────────────
  const ctx = {
    // Raw inputs
    appName,
    opts,
    preset,
    company,
    companyId,

    // Resolved inputs
    displayName,
    copyright,
    logo,
    template,
    themeIds,
    defaultTheme,
    defaultMode: opts.defaultMode || 'auto',   // 'auto' resolves via prefers-color-scheme at runtime
    pm,
    iconProvider,

    // Feature toggles derived from opts/preset/company
    includeFontAwesome,
    includeProfilePanel,
    includeSettingsPanel,
    skipInstall,
    verbose,

    // Populated by later phases
    recipe: null,
    features: {},
    themesData: null,
    pages: null,
    pageTypes: null,
    scaffoldFlags: '',
    createCommand: '',

    // Placeholder dictionary — preparators write here, substituteVars reads here
    placeholders: {},

    // Provenance — maps resolved-value keys to human-readable source strings
    // (e.g. `workspace "C:/Git/KM" defaultCompany`, `preset "full"`, `CLI flag --theme`).
    // Used by setProfiles to annotate README values with where they came from.
    provenance,
  };

  // createCommand is available now (derived from opts, no theme/feature deps)
  ctx.createCommand = createCommand;

  // Icon resolution — used by substituteVars for __ICON:name__ patterns.
  // Lucide import tracking needs a mutable map for the resolveExtraImports pass.
  const usedLucideIcons = new Map();
  function resolveIcon(name) {
    return resolveIconMarkup(name, iconProvider, usedLucideIcons);
  }

  /**
   * Substitute placeholders in a text string.
   *
   * Pipeline:
   *   1. Every entry in ctx.placeholders is substituted (__KEY__ form only)
   *   2. `__ICON:name__` is resolved per icon provider
   *
   * All state lives in ctx.placeholders. There are no closure-captured
   * locals — callers update ctx.placeholders directly (via preparators
   * or `preparators.set(ctx, ...)`) before calling substituteVars.
   *
   * For conditional content based on enabled features, use data-pa markers
   * in source files — processTemplatePoints strips blocks for disabled
   * features automatically.
   */
  function substituteVars(text) {
    if (text == null) return text;
    let result = text;

    // 1. Dictionary-driven substitution from ctx.placeholders
    for (const [key, value] of Object.entries(ctx.placeholders)) {
      const str = value == null ? '' : String(value);
      result = result.split(`__${key}__`).join(str);
    }

    // 2. Icon placeholders: __ICON:name__ → provider-specific markup
    result = result.replace(/__ICON:([a-z0-9-]+)__/g, (_, iconName) => {
      return resolveIcon(iconName);
    });

    return result;
  }

  // 1. Fetch template or recipe
  let recipe;
  let downloadedTemplatePath = null; // set if we download a template ZIP

  if (!opts.templatePath) {
    // Try downloading template ZIP from templates API first
    process.stdout.write(`  Fetching ${template} template... `);
    const os = require('os');
    const tmpZip = path.join(os.tmpdir(), `pureadmin-template-${template}-${Date.now()}.zip`);
    const tmpDir = path.join(os.tmpdir(), `pureadmin-template-${template}-${Date.now()}`);

    try {
      await downloadFile(`/api/templates/${template}/download`, tmpZip);
      // Extract ZIP to temp dir
      const { execSync } = require('child_process');
      mkdir(tmpDir);
      try {
        execSync(`unzip -o "${tmpZip}" -d "${tmpDir}"`, { stdio: 'pipe' });
      } catch {
        execSync(`tar -xf "${tmpZip}" -C "${tmpDir}"`, { stdio: 'pipe' });
      }
      removeFile(tmpZip);

      // Read template.json from extracted ZIP
      const tmplManifestPath = path.join(tmpDir, 'template.json');
      if (fs.existsSync(tmplManifestPath)) {
        recipe = JSON.parse(fs.readFileSync(tmplManifestPath, 'utf-8'));
        downloadedTemplatePath = tmpDir;
        console.log(green(`v${recipe.version || 'latest'}`) + dim(' (template ZIP)'));
      } else {
        throw new Error('No template.json in ZIP');
      }
    } catch {
      // Clean up failed download
      try { removeFile(tmpZip); } catch {}
      try { removeDir(tmpDir); } catch {}

      // Fall back to old recipe API
      process.stdout.write(`\r  Fetching ${template} recipe...  `);
      try {
        recipe = await fetchJson(`/api/tools/templates/${template}`);
        console.log(green(`v${recipe.version || 'latest'}`));
      } catch {
        // Fall back to bundled recipe JSON
        const localRecipePath = path.join(__dirname, '..', '..', 'templates', `${template}.json`);
        if (fs.existsSync(localRecipePath)) {
          try { recipe = JSON.parse(fs.readFileSync(localRecipePath, 'utf-8')); } catch { recipe = null; }
          console.log(yellow(`local fallback v${recipe?.version || '?'}`));
        } else {
          console.log(yellow('no recipe available'));
          recipe = null;
        }
      }
      if (opts.verbose) console.log(dim(`    fallback: bundled templates from ${path.join(__dirname, '..', '..', 'templates', template)}`));
    }
  } else {
    // --template-path: prefer the local template.json from the path itself
    // (so devs iterating on a template see their edits immediately). Fall
    // back to the API, then bundled CLI templates.
    process.stdout.write(`  Loading ${template} recipe... `);
    const pathManifestPath = path.join(path.resolve(opts.templatePath), 'template.json');
    if (fs.existsSync(pathManifestPath)) {
      try {
        recipe = JSON.parse(fs.readFileSync(pathManifestPath, 'utf-8'));
        console.log(green(`v${recipe.version || 'local'}`) + dim(' (template-path)'));
      } catch {
        recipe = null;
        console.log(yellow('failed to parse local template.json'));
      }
    } else {
      try {
        recipe = await fetchJson(`/api/tools/templates/${template}`);
        console.log(green(`v${recipe.version || 'latest'}`) + dim(' (API)'));
      } catch {
        const localRecipePath = path.join(__dirname, '..', '..', 'templates', `${template}.json`);
        if (fs.existsSync(localRecipePath)) {
          try { recipe = JSON.parse(fs.readFileSync(localRecipePath, 'utf-8')); } catch { recipe = null; }
          console.log(yellow(`local fallback v${recipe?.version || '?'}`));
        } else {
          console.log(yellow('no recipe available'));
          recipe = null;
        }
      }
    }
  }

  // Use downloaded template as template-path
  const effectiveTemplatePath = opts.templatePath || downloadedTemplatePath;

  const appDir = path.join(process.cwd(), appName);

  // ──────────────────────────────────────────────────────────────────────
  // PREPARE phase — run template.helper.js prepare(ctx, helpers).
  //
  // Every template MUST load a template.helper.js that exports a prepare()
  // function. The template picks which identifier preparators from the
  // CLI's library it needs (e.g. Phoenix calls setAppIdSnake, Svelte
  // doesn't). Custom derivations can be inlined in the same function.
  //
  // Helper lookup order:
  //   1. effectiveTemplatePath/template.helper.js (--template-path or ZIP tmp)
  //   2. bundled templates/<template>/template.helper.js (offline fallback)
  // ──────────────────────────────────────────────────────────────────────
  let templateHelper = null;
  const helperCandidates = [];
  if (effectiveTemplatePath) {
    helperCandidates.push(path.join(path.resolve(effectiveTemplatePath), 'template.helper.js'));
  }
  helperCandidates.push(path.join(__dirname, '..', '..', 'templates', template, 'template.helper.js'));

  for (const helperPath of helperCandidates) {
    if (!fs.existsSync(helperPath)) continue;
    try {
      templateHelper = require(helperPath);
      if (verbose) console.log(dim(`    loaded helper: ${path.relative(process.cwd(), helperPath)}`));
      break;
    } catch (e) {
      console.error(`\n  ${bold('Error:')} failed to load ${helperPath}: ${e.message}`);
      process.exit(1);
    }
  }

  if (!templateHelper || typeof templateHelper.prepare !== 'function') {
    console.error(`\n  ${bold('Error:')} template "${template}" has no helper.prepare() function.`);
    console.error(`  Every template must export a prepare(ctx, helpers) function from template.helper.js.`);
    console.error(`  See pure-admin-templates/svelte-sveltekit/template.helper.js for an example.`);
    process.exit(1);
  }

  templateHelper.prepare(ctx, preparators);
  if (verbose) {
    const keys = Object.keys(ctx.placeholders).sort();
    console.log(dim(`    helper.prepare() set ${keys.length} placeholder(s): ${keys.join(', ')}`));
  }

  // CREATE_COMMAND placeholder is populated after prepare so templates can
  // override it in their prepare() function if desired.
  if (!('CREATE_COMMAND' in ctx.placeholders)) {
    preparators.setCreateCommand(ctx);
  }

  // Helper: resolve features and build __SCAFFOLD_FLAGS__ from current recipe
  // Must be called after the final recipe.features is known (which may differ
  // between the template-path and scaffold-only branches).
  function setupFeatureState() {
    const enabled = resolveFeatures(recipe?.features, opts, preset);
    const scaffoldFlagsStr = buildScaffoldFlags(recipe?.features, enabled);
    // Update ctx + placeholder dict
    ctx.features = enabled;
    ctx.scaffoldFlags = scaffoldFlagsStr;
    preparators.setScaffoldFlags(ctx);
    if (opts.verbose && Object.keys(enabled).length > 0) {
      const enabledList = Object.entries(enabled).filter(([_, v]) => v).map(([k]) => k).join(', ');
      const disabledList = Object.entries(enabled).filter(([_, v]) => !v).map(([k]) => k).join(', ');
      if (enabledList) console.log(dim(`    features (on):  ${enabledList}`));
      if (disabledList) console.log(dim(`    features (off): ${disabledList}`));
      if (scaffoldFlagsStr) console.log(dim(`    __SCAFFOLD_FLAGS__ = ${scaffoldFlagsStr}`));
    }
    return enabled;
  }

  // Helper: run a recipe.scaffold.command (with substituteVars and fallback support)
  function runScaffoldCommand() {
    const svInstallFlag = skipInstall ? '--no-install' : `--install ${pm}`;
    const scaffoldCmd = (recipe?.scaffold?.command || `npx sv create {{APP_ID}} --template minimal --types ts --no-add-ons --no-install`)
      .replace('--no-install', svInstallFlag);
    const scaffoldFallback = recipe?.scaffold?.fallback || `npm create svelte@latest {{APP_ID}} -- --template skeleton --types ts`;

    console.log(`  Running ${template} scaffold...`);
    if (opts.verbose) console.log(dim(`    command: ${substituteVars(scaffoldCmd)}`));
    try {
      execSync(substituteVars(scaffoldCmd), { cwd: process.cwd(), stdio: 'inherit' });
    } catch {
      try {
        execSync(substituteVars(scaffoldFallback), { cwd: process.cwd(), stdio: 'inherit' });
      } catch {
        console.error(`\n  ${bold('Scaffold failed.')} Create the project manually and re-run.`);
        process.exit(1);
      }
    }
  }

  // 2. Scaffold or copy template
  let resolvedFeatures;
  if (effectiveTemplatePath) {
    // Template path (local or downloaded) — supports both flat layout and template/ subfolder
    const srcDir = path.resolve(effectiveTemplatePath);
    if (!fs.existsSync(srcDir)) {
      console.error(`\n  ${bold('Error:')} template path not found: ${srcDir}`);
      process.exit(1);
    }

    // Read template manifest from root (before copying)
    // Read template manifest — merge into recipe (template manifest takes priority for features/pageTypes)
    const tmplManifestPath = path.join(srcDir, 'template.json');
    if (fs.existsSync(tmplManifestPath)) {
      try {
        const tmplManifest = JSON.parse(fs.readFileSync(tmplManifestPath, 'utf-8'));
        if (!recipe) {
          recipe = tmplManifest;
        } else {
          // Merge template-specific fields into recipe
          if (tmplManifest.features) recipe.features = tmplManifest.features;
          if (tmplManifest.pageTypes) recipe.pageTypes = tmplManifest.pageTypes;
          if (tmplManifest.name) recipe.displayName = tmplManifest.name;
          else if (tmplManifest.displayName) recipe.displayName = tmplManifest.displayName;
          if (tmplManifest.placeholders) recipe.placeholders = tmplManifest.placeholders;
          if (tmplManifest.instructions) recipe.instructions = tmplManifest.instructions;
          if (tmplManifest.scaffold) recipe.scaffold = tmplManifest.scaffold;
        }
      } catch {}
    }

    // Resolve features now that the merged recipe is final
    resolvedFeatures = setupFeatureState();

    // If recipe.scaffold.runFirst is set, run the scaffold command BEFORE copying
    // template files. This lets templates like phoenix-liveview run `mix phx.new`
    // and then layer customizations on top.
    if (recipe?.scaffold?.runFirst && recipe?.scaffold?.command) {
      runScaffoldCommand();
    }

    // If template/ subfolder exists, copy only that; otherwise copy the whole dir (legacy)
    const templateSubdir = path.join(srcDir, 'template');
    const copyFrom = fs.existsSync(templateSubdir) ? templateSubdir : srcDir;
    console.log(`  Copying template from ${dim(copyFrom)}...`);
    copyDirSync(copyFrom, appDir, ['node_modules', '.svelte-kit', 'dist', '.git', 'build', '_build', 'deps']);

    // Rename any directories/files whose names contain placeholder patterns
    // (e.g. lib/__APP_ID_SNAKE___web/ → lib/test_app_web/). When the destination
    // already exists (e.g. because runFirst:true ran a scaffold), MERGE contents
    // into the existing dir instead of failing.
    //
    // Walks bottom-up so child paths are valid before parent is renamed.
    function mergeMove(srcPath, destPath) {
      if (!fs.existsSync(destPath)) {
        fs.renameSync(srcPath, destPath);
        return;
      }
      const srcStat = fs.statSync(srcPath);
      const destStat = fs.statSync(destPath);
      if (srcStat.isDirectory() && destStat.isDirectory()) {
        // Merge directory contents
        for (const entry of fs.readdirSync(srcPath)) {
          mergeMove(path.join(srcPath, entry), path.join(destPath, entry));
        }
        fs.rmdirSync(srcPath);
      } else if (srcStat.isFile() && destStat.isFile()) {
        // Overwrite (template wins)
        copyFile(srcPath, destPath);
        removeFile(srcPath);
      } else {
        // Type mismatch — bail with a helpful error
        throw new Error(`Cannot merge ${srcPath} (${srcStat.isDirectory() ? 'dir' : 'file'}) into ${destPath} (${destStat.isDirectory() ? 'dir' : 'file'})`);
      }
    }

    function renamePathsWithPlaceholders(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          renamePathsWithPlaceholders(p);
        }
        if (entry.includes('__') || entry.includes('{{')) {
          const newName = substituteVars(entry);
          if (newName !== entry) {
            const newPath = path.join(dir, newName);
            mergeMove(p, newPath);
            if (verbose) console.log(`    ${dim('mv')} ${path.relative(appDir, p)} → ${path.relative(appDir, newPath)}`);
          }
        }
      }
    }
    renamePathsWithPlaceholders(appDir);

    // Copy template.helper.js to appDir so processTemplatePoints can find it
    const helperSrc = path.join(srcDir, 'template.helper.js');
    if (fs.existsSync(helperSrc)) {
      copyFile(helperSrc, path.join(appDir, 'template.helper.js'));
    }

    console.log(green(`  Template copied (${recipe?.displayName || template})`));
  } else {
    // Scaffold from scratch — resolve features first so __SCAFFOLD_FLAGS__ is available
    resolvedFeatures = setupFeatureState();
    runScaffoldCommand();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Validate passthrough flags — now that recipe.features is final, check
  // that every unknown --flag the user passed matches a declared feature.
  // This catches typos like --no-ectp or --profil-panel.
  // ──────────────────────────────────────────────────────────────────────
  const knownOpts = new Set([
    'server', 'version', 'output', 'template', 'templatePath', 'name',
    'themes', 'theme', 'company', 'preset', 'fontAwesome', 'lucide',
    'heroicons', 'fluentUi', 'profilePanel', 'settingsPanel', 'local', 'offline',
    'noBuild', 'noInstall', 'noMakefile', 'verbose', 'apiKey', 'dir',
    'defaultMode', 'defaultVariant',
  ]);

  // Collect valid feature flags from recipe.features (both `cli` enable and
  // `cliDisable` opt-out flags count as valid).
  const featureOpts = new Set();
  for (const [, feat] of Object.entries(recipe?.features || {})) {
    if (typeof feat.cli === 'string') {
      featureOpts.add(flagToOpt(feat.cli));
    } else if (Array.isArray(feat.cli)) {
      for (const entry of feat.cli) {
        const flag = typeof entry === 'string' ? entry : entry.flag;
        if (flag) featureOpts.add(flagToOpt(flag));
      }
    }
    if (typeof feat.cliDisable === 'string') {
      featureOpts.add(flagToOpt(feat.cliDisable));
    }
  }

  const unknownFlags = [];
  for (const key of Object.keys(opts)) {
    if (!knownOpts.has(key) && !featureOpts.has(key)) {
      // Convert camelCase back to --kebab for display
      const flag = '--' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      unknownFlags.push(flag);
    }
  }

  if (unknownFlags.length > 0) {
    console.error(`\n  ${bold('Error:')} unknown flag(s): ${unknownFlags.join(', ')}`);
    if (featureOpts.size > 0) {
      const featureFlagList = [...featureOpts].map(k => '--' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())).sort();
      console.error(`  Template "${template}" supports: ${featureFlagList.join(', ')}`);
    }
    console.error(`  Run ${dim(`pureadmin help create`)} to see all options.\n`);
    process.exit(1);
  }

  // 3. Fetch theme data for template variables
  process.stdout.write(`  Fetching theme data... `);
  let themesData;
  try {
    const result = await fetchJson('/api/themes');
    themesData = result.themes.filter(t => themeIds.includes(t.slug));
    console.log(green(`${themesData.length} theme(s)`));
  } catch {
    console.log(yellow('failed, using defaults'));
    themesData = themeIds.map(id => ({
      slug: id,
      name: id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      latest: 'latest'
    }));
  }


  // 4. Populate late-bound ctx fields (theme data + pages).
  // Templates render these into placeholders in their prepare() or via
  // late-bound rendering after this point. The CLI populates the RAW DATA
  // on ctx; rendering is the template's job.
  ctx.themesData = themesData;
  ctx.pageTypes = recipe?.pageTypes || {};
  ctx.pages = (preset?.pages) || recipe?.defaultPages || [{ type: 'dashboard', label: 'Dashboard' }];
  const pageTypes = ctx.pageTypes;
  const pages = ctx.pages;

  // Call the template's late-bound rendering if it has one.
  // This lets templates call collectSidebarItems / collectThemeOptions etc.
  // AFTER ctx.themesData and ctx.pages are populated.
  if (templateHelper && typeof templateHelper.prepareLate === 'function') {
    templateHelper.prepareLate(ctx, preparators);
  }

  // Generate page route steps.
  // Each page type must declare `file` (template source path) and `route`
  // (destination path pattern). Both support placeholder substitution via
  // substituteVars (so `lib/__APP_ID_SNAKE___web/live/__PAGE_ENTITY___live.ex`
  // resolves correctly after prepare runs).
  const pageSteps = pages.map(p => {
    const pt = pageTypes[p.type];
    if (!pt || !pt.file || !pt.route) {
      if (verbose) console.log(dim(`    skipping page "${p.type}": missing pageType, file, or route`));
      return null;
    }
    const entity = p.entity || p.type;
    // Route supports both {{entity}} legacy syntax and placeholder substitution later in the pipeline
    const route = pt.route.replace(/\{\{entity\}\}/g, entity);
    // Module name from entity: kebab/snake_case → PascalCase. e.g. "users" → "Users", "user_profile" → "UserProfile"
    const pageModule = toPascalCase(entity);
    return {
      action: 'create',
      path: route,
      template: pt.file,
      _pageLabel: p.label || pt.defaultLabel || entity,
      _pageEntity: entity,
      _pageModule: pageModule,
    };
  }).filter(Boolean);

  // 6. If using template path, substitute placeholders in all copied files
  if (effectiveTemplatePath) {
    console.log(`  Substituting placeholders...`);
    const exts = ['.svelte', '.html', '.heex', '.css', '.ts', '.js', '.json', '.md', '.ex', '.exs', '.eex', ''];
    const exactNames = ['Makefile'];
    function walkAndSubstitute(dir) {
      for (const entry of fs.readdirSync(dir)) {
        if (['node_modules', '.svelte-kit', '.git', '_build', 'deps', 'dist', 'build'].includes(entry)) continue;
        const p = path.join(dir, entry);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          walkAndSubstitute(p);
        } else if (exts.some(e => e && entry.endsWith(e)) || exactNames.includes(entry)) {
          let content = fs.readFileSync(p, 'utf-8');
          const replaced = substituteVars(content);
          if (replaced !== content) {
            writeFile(p, replaced);
            if (verbose) console.log(`    ${green('~')} ${path.relative(appDir, p)}`);
          }
        }
      }
    }
    walkAndSubstitute(appDir);

    // Second pass: resolve __EXTRA_IMPORTS__ per file based on which Lucide icons it uses
    function resolveExtraImports(dir) {
      for (const entry of fs.readdirSync(dir)) {
        if (['node_modules', '.svelte-kit', '.git'].includes(entry)) continue;
        const p = path.join(dir, entry);
        if (fs.statSync(p).isDirectory()) { resolveExtraImports(p); continue; }
        if (!entry.endsWith('.svelte') && !entry.endsWith('.ts')) continue;
        let content = fs.readFileSync(p, 'utf-8');
        if (!content.includes('__EXTRA_IMPORTS__')) continue;

        let importLines = '';
        if (iconProvider === 'lucide') {
          const fileIcons = [...usedLucideIcons.entries()]
            .filter(([component]) => content.includes(`<${component} `))
            .sort(([a], [b]) => a.localeCompare(b));
          if (fileIcons.length > 0) {
            importLines = fileIcons
              .map(([component, kebab]) => `\timport ${component} from '@lucide/svelte/icons/${kebab}';`)
              .join('\n');
          }
        }

        content = content.replace(/\t__EXTRA_IMPORTS__\n?/g, importLines ? importLines + '\n' : '');
        writeFile(p, content);
      }
    }
    // Only run extra-imports pass if there's a src/ directory (Svelte/Vite layouts).
    // Other technologies (e.g. Phoenix) have different file layouts and don't use this.
    if (fs.existsSync(path.join(appDir, 'src'))) {
      resolveExtraImports(path.join(appDir, 'src'));
    }
  }

  // 7. Execute recipe steps + page steps
  // Feature flags — used by create-if steps and processTemplatePoints.
  // Sourced from template.json features resolved via resolveFeatures().
  // Icons are a special case: the `icons` feature is enabled if any icon
  // provider is selected, and `font-awesome` is enabled only if FA is the
  // chosen provider.
  const featureFlags = { ...(resolvedFeatures || {}) };
  featureFlags['icons'] = includeFontAwesome || opts.lucide || opts.fluentUi;
  featureFlags['font-awesome'] = includeFontAwesome && iconProvider === 'font-awesome';

  // Steps pipeline: templates declare their steps in recipe.steps.
  // Page steps are appended automatically from resolved pageTypes.
  const allSteps = [...(recipe?.steps || []), ...pageSteps];
  // When using template path, skip 'create' steps for non-page files (those
  // are already copied from template/). Page creates and non-create steps
  // (patch/json-merge/call/delete) still run.
  const steps = effectiveTemplatePath
    ? allSteps.filter(s => s.action !== 'create' || s._pageLabel)
    : allSteps;

  // Pipeline: fetch all templates, then substitute, then write
  const localTemplatesDir = path.join(__dirname, '..', '..', 'templates', template);

  // Fetch template content from server, template path, or local CLI fallback
  const templateSrcDir = effectiveTemplatePath ? path.resolve(effectiveTemplatePath) : null;
  async function fetchTemplate(templateName) {
    // 1. Check --template-path root (for pages/ and other generators)
    if (templateSrcDir) {
      const tplPath = path.join(templateSrcDir, templateName);
      if (fs.existsSync(tplPath)) {
        return { content: fs.readFileSync(tplPath, 'utf-8'), source: 'template-path' };
      }
    }
    // 2. Try API server
    try {
      const content = await fetchText(`/api/tools/templates/${template}/${templateName}`);
      return { content, source: 'server' };
    } catch {
      // 3. Bundled CLI fallback
      const localPath = path.join(localTemplatesDir, templateName);
      if (fs.existsSync(localPath)) {
        return { content: fs.readFileSync(localPath, 'utf-8'), source: 'local' };
      }
      return null;
    }
  }

  console.log(`  Applying ${steps.length} template steps...`);
  for (const step of steps) {
    // Substitute placeholders in step.path (e.g. lib/__APP_ID___web/router.ex).
    // Some actions (e.g. "call") have no path — in that case destPath is unused.
    const resolvedStepPath = substituteVars(step.path);
    const destPath = resolvedStepPath ? path.join(appDir, resolvedStepPath) : null;
    const action = step.action || 'create';

    // Skip step entirely when `unless: "feature-id"` matches an enabled feature.
    // Universal — applies to delete, patch, append, prepend, create, json-merge, call.
    // (create-if has its own positive `feature` field; don't combine the two.)
    if (step.unless && featureFlags[step.unless]) {
      if (verbose) console.log(`    ${dim('-')} ${resolvedStepPath || step.action || step.op || '?'} ${dim(`[skipped: ${step.unless} enabled]`)}`);
      continue;
    }

    // Symmetric positive condition — skip when `if: "feature-id"` is disabled.
    // Lets opt-in features add their own patches/deletes without abusing
    // create-if (which is restricted to file creation).
    if (step.if && !featureFlags[step.if]) {
      if (verbose) console.log(`    ${dim('-')} ${resolvedStepPath || step.action || step.op || '?'} ${dim(`[skipped: ${step.if} disabled]`)}`);
      continue;
    }

    // --- delete action ---
    // Handles both files and directories (recursive when dir).
    if (action === 'delete') {
      if (fs.existsSync(destPath)) {
        if (fs.statSync(destPath).isDirectory()) {
          removeDir(destPath);
        } else {
          removeFile(destPath);
        }
        console.log(`    ${green('-')} ${resolvedStepPath || step.path} ${verbose ? dim('[deleted]') : ''}`);
      } else if (verbose) {
        console.log(`    ${dim('-')} ${resolvedStepPath || step.path} ${dim('[already absent]')}`);
      }
      continue;
    }

    // --- json-merge action ---
    if (action === 'json-merge') {
      let mergeData;
      if (step.template) {
        const tmpl = await fetchTemplate(step.template);
        if (tmpl) mergeData = JSON.parse(substituteVars(tmpl.content));
      } else if (step.data) {
        mergeData = JSON.parse(substituteVars(JSON.stringify(step.data)));
      }
      if (mergeData && fs.existsSync(destPath)) {
        const existing = JSON.parse(fs.readFileSync(destPath, 'utf-8'));
        const merged = deepMerge(existing, mergeData);
        writeFile(destPath, JSON.stringify(merged, null, 2) + '\n');
        console.log(`    ${green('~')} ${resolvedStepPath || step.path} ${verbose ? dim(`[json-merge, ${Object.keys(mergeData).length} keys]`) : ''}`);
      } else if (mergeData) {
        mkdir(path.dirname(destPath));
        writeFile(destPath, JSON.stringify(mergeData, null, 2) + '\n');
        console.log(`    ${green('+')} ${resolvedStepPath || step.path} ${verbose ? dim('[json-merge, new file]') : ''}`);
      }
      continue;
    }

    // --- patch action (find/replace in existing file) ---
    if (action === 'patch') {
      if (fs.existsSync(destPath) && step.find && step.replace != null) {
        let fileContent = fs.readFileSync(destPath, 'utf-8');
        const find = substituteVars(step.find);
        const replace = substituteVars(step.replace);
        if (fileContent.includes(find)) {
          fileContent = fileContent.replace(find, replace);
          writeFile(destPath, fileContent);
          console.log(`    ${green('~')} ${resolvedStepPath || step.path} ${verbose ? dim('[patch]') : ''}`);
        } else if (verbose) {
          console.log(`    ${yellow('!')} ${resolvedStepPath || step.path} ${dim('[patch target not found]')}`);
        }
      }
      continue;
    }

    // --- call action (invoke template.helper.js operation) ---
    if (action === 'call') {
      const helperPath = path.join(appDir, 'template.helper.js');
      if (fs.existsSync(helperPath) && step.op) {
        const helper = require(helperPath);
        const op = helper.operations?.[step.op];
        if (op) {
          // Recursively substitute placeholders in args (strings, including nested objects/arrays)
          function substDeep(v) {
            if (typeof v === 'string') return substituteVars(v);
            if (Array.isArray(v)) return v.map(substDeep);
            if (v && typeof v === 'object') {
              const out = {};
              for (const [k, val] of Object.entries(v)) out[k] = substDeep(val);
              return out;
            }
            return v;
          }
          const args = (step.args || []).map(substDeep);
          const result = op(appDir, ...args);
          console.log(`    ${green('*')} ${step.op}(${args.map(a => typeof a === 'string' ? `"${a}"` : a).join(', ')}) ${verbose ? dim(`[call${result === false ? ', no match' : ''}]`) : ''}`);
        } else {
          console.log(`    ${yellow('!')} ${step.op} ${dim('[operation not found in template.helper.js]')}`);
        }
      }
      continue;
    }

    // --- create-if action (create file only if feature is enabled) ---
    if (action === 'create-if') {
      if (!featureFlags[step.feature]) {
        if (verbose) console.log(`    ${dim('-')} ${resolvedStepPath || step.path} ${dim(`[create-if: ${step.feature} disabled]`)}`);
        continue;
      }
      // Enabled — create the file (same as create action)
      mkdir(path.dirname(destPath));
      const tmpl = step.template ? await fetchTemplate(step.template) : null;
      if (tmpl) {
        // Per-page placeholders (null/undefined clears so they don't leak
        // into later steps that aren't page steps)
        ctx.placeholders.PAGE_LABEL = step._pageLabel || '';
        ctx.placeholders.PAGE_ENTITY = step._pageEntity || '';
        ctx.placeholders.PAGE_MODULE = step._pageModule || '';
        writeFile(destPath, substituteVars(tmpl.content));
        console.log(`    ${green('+')} ${resolvedStepPath || step.path} ${verbose ? dim(`[create-if: ${step.feature}]`) : ''}`);
      }
      continue;
    }

    // --- append / prepend actions ---
    if (action === 'append' || action === 'prepend') {
      const tmpl = step.template ? await fetchTemplate(step.template) : null;
      const text = tmpl ? substituteVars(tmpl.content) : (step.text ? substituteVars(step.text) : null);
      if (text && fs.existsSync(destPath)) {
        let fileContent = fs.readFileSync(destPath, 'utf-8');
        fileContent = action === 'append' ? fileContent + text : text + fileContent;
        writeFile(destPath, fileContent);
        console.log(`    ${green('~')} ${resolvedStepPath || step.path} ${verbose ? dim(`[${action}]`) : ''}`);
      }
      continue;
    }

    // --- create action (default) ---
    mkdir(path.dirname(destPath));

    const tmpl = step.template ? await fetchTemplate(step.template) : null;
    if (!tmpl) {
      console.log(`    ${yellow('!')} ${resolvedStepPath || step.path} ${dim('(template not available)')}`);
      continue;
    }

    // Set per-page placeholders (cleared for non-page steps so they don't
    // leak PAGE_LABEL/PAGE_ENTITY/PAGE_MODULE from a prior page step)
    ctx.placeholders.PAGE_LABEL = step._pageLabel || '';
    ctx.placeholders.PAGE_ENTITY = step._pageEntity || '';
    ctx.placeholders.PAGE_MODULE = step._pageModule || '';

    let content = substituteVars(tmpl.content);
    writeFile(destPath, content);

    if (verbose) {
      const sizeKB = (content.length / 1024).toFixed(1);
      const vars = (content.match(/\{\{[A-Z_]+\}\}/g) || []);
      const unreplaced = vars.length > 0 ? yellow(` ${vars.length} unreplaced var(s): ${vars.join(', ')}`) : '';
      console.log(`    ${green('+')} ${resolvedStepPath || step.path} ${dim(`[${tmpl.source}, ${step.template}, ${sizeKB}KB]`)}${unreplaced}`);
    } else {
      console.log(`    ${green('+')} ${resolvedStepPath || step.path}`);
    }
  }

  // 6. Process template points — remove disabled feature blocks
  console.log();
  console.log(`  Processing template features...`);
  processTemplatePoints(appDir, featureFlags, verbose, recipe);

  // 7. Install dependencies (npm-based templates only).
  // Skipped when:
  //   - --no-install flag is set
  //   - the project has no root package.json (e.g. Phoenix, Rails — they manage deps differently)
  //   - recipe.dependencies is explicitly set to false
  const hasRootPackageJson = fs.existsSync(path.join(appDir, 'package.json'));
  const skipDeps = skipInstall || recipe?.dependencies === false || !hasRootPackageJson;

  if (skipDeps) {
    if (skipInstall) {
      console.log();
      console.log(dim(`  Skipping install (--no-install). Run "${pm} install" manually.`));
    } else if (!hasRootPackageJson && verbose) {
      console.log(dim(`  No root package.json — skipping npm dependency install (template manages deps elsewhere).`));
    }
  } else {
    const deps = { ...(recipe?.dependencies || {
      '@keenmate/svelte-pure-admin': 'latest',
      '@keenmate/pure-admin-core': 'latest'
    }) };
    if (iconProvider === 'lucide') deps['@lucide/svelte'] = 'next';
    const depList = Object.entries(deps).map(([k, v]) => `${k}@${v}`).join(' ');

    const addCmd = pm === 'bun' ? 'bun add' : pm === 'pnpm' ? 'pnpm add' : 'npm install';
    const installCmd = pm === 'bun' ? 'bun install' : pm === 'pnpm' ? 'pnpm install' : 'npm install';
    console.log();
    console.log(`  Installing dependencies...` + (pm !== 'npm' ? dim(` (${pm})`) : ''));
    try {
      execSync(installCmd, { cwd: appDir, stdio: 'inherit' });
      if (depList) {
        execSync(`${addCmd} ${depList}`, { cwd: appDir, stdio: 'inherit' });
      }
    } catch {
      console.log(yellow(`  ${pm} install failed — run it manually`));
    }
  }

  // 7. Write pureadmin.json declarations + run `themes install` to download
  //    themes and create the lockfile. Same flow a fresh-cloned project would
  //    use: declarations (themesDir + slugs) are the source of truth; install
  //    resolves them against the API filtered by the project's pure-admin-core
  //    version, downloads, and writes pureadmin.lock.json.
  const themesDir = recipe?.themeSetup?.themesDir || 'static/themes';
  const declarations = {
    themesDir,
    themes: Object.fromEntries(themeIds.map(id => [id, {}])),
  };
  writeFile(path.join(appDir, 'pureadmin.json'), JSON.stringify(declarations, null, 2) + '\n');

  console.log();
  // Lazy require to avoid any circular-import hazard between create and themes.
  const { cmdInstall } = require('./themes');
  const previousCwd = process.cwd();
  let installResult;
  try {
    process.chdir(appDir);
    installResult = await cmdInstall();
  } finally {
    process.chdir(previousCwd);
  }
  // Don't exit on partial theme failure — the project is otherwise usable
  // and the user can re-run `pureadmin themes install` to retry. The summary
  // printed by cmdInstall makes the failure visible.
  if (installResult && installResult.failed > 0) {
    console.log(yellow(`  ${installResult.failed} theme(s) failed to install — re-run "${pm === 'bun' ? 'bunx' : 'npx'} @keenmate/pureadmin themes install" inside the project to retry.`));
  }

  // 8. Done
  const runCmd = pm === 'bun' ? 'bun run' : `${pm} run`;
  const defaultInstructions = [`cd ${appName}`];
  if (skipInstall) defaultInstructions.push(`${pm} install`);
  defaultInstructions.push(`${runCmd} dev`, 'Open http://localhost:5173');
  let instructions;
  if (recipe?.instructions) {
    instructions = recipe.instructions.map(i =>
      substituteVars(i).replace(/\bnpm run\b/g, runCmd)
    );
    if (skipInstall) instructions.splice(1, 0, `${pm} install`);
  } else {
    instructions = defaultInstructions;
  }
  console.log();
  console.log(bold('  App created!'));
  console.log();
  console.log(`  ${dim('Next steps:')}`);
  instructions.forEach(i => console.log(`    ${substituteVars(i)}`));
  console.log();

  // Clean up downloaded template temp dir
  if (downloadedTemplatePath) {
    try { removeDir(downloadedTemplatePath); } catch {}
  }
}

module.exports = { cmdCreate, processTemplatePoints };
