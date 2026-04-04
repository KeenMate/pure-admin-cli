// ---------------------------------------------------------------------------
// create command — create a SvelteKit app with Pure Admin
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, green, yellow } = require('../formatting');
const { config } = require('../config');
const { fetchJson, fetchText, downloadFile } = require('../http');
const { copyDirSync, deepMerge, extractThemeZip } = require('../files');

/**
 * Process template points: remove blocks for disabled features.
 * Reads template.json manifest from the app directory, resolves enabled features,
 * then strips data-pa blocks for disabled features from all affected files.
 */
function processTemplatePoints(appDir, enabledFlags, verbose, recipe) {
  // Use passed recipe or read from appDir
  const manifestPath = path.join(appDir, 'template.json');
  const manifest = recipe?.features ? recipe
    : fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : null;
  if (!manifest) return;

  const features = manifest.features || {};

  // Resolve which features are enabled
  const enabled = {};
  for (const [id, feat] of Object.entries(features)) {
    enabled[id] = enabledFlags[id] !== undefined ? enabledFlags[id] : feat.default;
  }

  // Auto-enable dependencies
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

  // Collect points to remove (from disabled features)
  const pointsToRemove = new Set();
  for (const [id, feat] of Object.entries(features)) {
    if (!enabled[id] && feat.points) {
      for (const p of feat.points) pointsToRemove.add(p);
    }
  }

  if (pointsToRemove.size === 0) {
    if (verbose) console.log(dim('    all features enabled, no points to remove'));
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    const helperPath = path.join(appDir, 'template.helper.js');
    if (fs.existsSync(helperPath)) fs.unlinkSync(helperPath);
    return;
  }

  if (verbose) console.log(dim(`    removing ${pointsToRemove.size} point(s) for disabled features`));

  // Build marker patterns
  const htmlStart = (id) => `<!-- data-pa="${id}" -->`;
  const htmlEnd = (id) => `<!-- /data-pa="${id}" -->`;
  const jsStart = (id) => `// data-pa="${id}"`;
  const jsEnd = (id) => `// /data-pa="${id}"`;

  // Scan all source files for data-pa markers
  const filesToScan = new Set();
  const scanExts = ['.svelte', '.html', '.css', '.ts', '.js'];
  function findFiles(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (['node_modules', '.svelte-kit', '.git', 'build', 'dist'].includes(entry)) continue;
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
      // Try HTML-style markers
      const hStart = htmlStart(pointId);
      const hEnd = htmlEnd(pointId);
      if (content.includes(hStart) && content.includes(hEnd)) {
        const startIdx = content.indexOf(hStart);
        const endIdx = content.indexOf(hEnd) + hEnd.length;
        // Remove the entire block including surrounding whitespace/newline
        const before = content.lastIndexOf('\n', startIdx - 1);
        const after = content.indexOf('\n', endIdx);
        content = content.slice(0, before >= 0 ? before : startIdx) + content.slice(after >= 0 ? after : endIdx);
        modified = true;
      }

      // Try JS-style markers
      const jStart = jsStart(pointId);
      const jEnd = jsEnd(pointId);
      if (content.includes(jStart) && content.includes(jEnd)) {
        const startIdx = content.indexOf(jStart);
        const endIdx = content.indexOf(jEnd) + jEnd.length;
        const before = content.lastIndexOf('\n', startIdx - 1);
        const after = content.indexOf('\n', endIdx);
        content = content.slice(0, before >= 0 ? before : startIdx) + content.slice(after >= 0 ? after : endIdx);
        modified = true;
      }
    }

    if (modified) {
      // Clean up empty lines left behind
      content = content.replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(filePath, content);
      if (verbose) console.log(`    ${green('~')} ${relPath} ${dim('(points removed)')}`);
    }
  }

  // Clean up manifest and helper from the generated app
  if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  const helperFile = path.join(appDir, 'template.helper.js');
  if (fs.existsSync(helperFile)) fs.unlinkSync(helperFile);
}

async function cmdCreate(appName, opts, usage) {
  if (!appName) return usage('create requires an app name (e.g. my-app)');

  // Resolve company + preset profiles from config
  const company = opts.company ? (config.companies || {})[opts.company] : null;
  const preset = opts.preset ? (config.presets || {})[opts.preset] : null;
  const fallback = config.create || {};

  // Merge: CLI flags > preset > company > config.create defaults
  function resolve(key, cliVal) {
    if (cliVal !== undefined) return cliVal;
    if (preset && preset[key] !== undefined) return preset[key];
    if (company && company[key] !== undefined) return company[key];
    return fallback[key];
  }

  const template = resolve('template', opts.template) || 'sveltekit';
  const themeIds = (resolve('themes', opts.themes) || resolve('defaultThemes') || 'corporate,audi,dark').split(',').map(s => s.trim());
  const defaultTheme = resolve('defaultTheme', opts.theme) || themeIds[0];
  const displayName = opts.name || (company?.name) || appName.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const copyright = resolve('copyright') || displayName;
  const logo = resolve('logo') || '';
  const includeFontAwesome = opts.fontAwesome || resolve('fontAwesome') || false;
  const includeProfilePanel = opts.profilePanel || resolve('profilePanel') || false;
  const includeSettingsPanel = opts.settingsPanel || resolve('settingsPanel') || false;
  const includeMakefile = !opts.noMakefile && (resolve('makefile') !== false);
  const skipInstall = opts.noInstall || false;
  const verbose = opts.verbose || false;

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

  // Icon provider resolution
  const iconProvider = opts.lucide ? 'lucide' : opts.fluentUi ? 'fluent-ui' : 'font-awesome';

  // Lucide icon name mapping (FA name → Lucide component name)
  const lucideMap = {
    'rocket': 'Rocket', 'chart-line': 'ChartLine', 'briefcase': 'Briefcase',
    'users': 'Users', 'settings': 'Settings', 'cog': 'Settings', 'user': 'User',
    'log-out': 'LogOut', 'sign-out-alt': 'LogOut',
    'plus': 'Plus', 'user-plus': 'UserPlus', 'file-export': 'FileOutput',
    'chart-bar': 'BarChart3', 'pen': 'Pencil', 'trash': 'Trash2',
    'shopping-cart': 'ShoppingCart', 'save': 'Save', 'broom': 'Brush',
  };

  // FA icon class mapping (normalized name → FA class)
  const faMap = {
    'rocket': 'fa-rocket', 'chart-line': 'fa-chart-line', 'briefcase': 'fa-briefcase',
    'users': 'fa-users', 'settings': 'fa-cog', 'cog': 'fa-cog', 'user': 'fa-user',
    'log-out': 'fa-sign-out-alt', 'sign-out-alt': 'fa-sign-out-alt',
    'plus': 'fa-plus', 'user-plus': 'fa-user-plus', 'file-export': 'fa-file-export',
    'chart-bar': 'fa-chart-bar', 'pen': 'fa-pen', 'trash': 'fa-trash',
    'shopping-cart': 'fa-shopping-cart', 'save': 'fa-save', 'broom': 'fa-broom',
  };

  function resolveIcon(name) {
    if (iconProvider === 'lucide') {
      const component = lucideMap[name] || name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      return `<${component} size={18} />`;
    }
    // Default: Font Awesome
    const faClass = faMap[name] || `fa-${name}`;
    return `<i class="fas ${faClass}"></i>`;
  }

  // Helper: substitute placeholders — supports both {{VAR}} and __VAR__ syntax
  function substituteVars(text) {
    let result = text;

    // Simple replacements (both formats)
    function sub(name, value) {
      result = result.split(`{{${name}}}`).join(value);
      result = result.split(`__${name}__`).join(value);
    }

    sub('APP_NAME', displayName);
    sub('APP_DISPLAY_NAME', displayName);
    sub('APP_ID', appName);
    sub('COPYRIGHT', copyright);
    sub('LOGO', logo);
    sub('DEFAULT_THEME', defaultTheme);
    sub('DEFAULT_MODE', defaultMode);
    sub('DEFAULT_VARIANT', opts.defaultVariant || '');
    sub('THEME_IDS_QUOTED', themeIds.map(id => `'${id}'`).join(', '));
    sub('USER_NAME', 'User');
    sub('USER_EMAIL', 'user@example.com');
    sub('USER_NAME_URL', 'User');
    sub('PM', pm);
    sub('PM_RUN', `${pm} run`);
    sub('PM_EXEC', pm === 'bun' ? 'bunx' : pm === 'pnpm' ? 'pnpm exec' : 'npx');

    // Icon placeholders: __ICON:name__ → provider-specific markup
    result = result.replace(/__ICON:([a-z0-9-]+)__/g, (_, iconName) => {
      return resolveIcon(iconName);
    });

    // Conditional blocks (old bundled template format only)
    result = result.replace(/\{\{#FONT_AWESOME\}\}([\s\S]*?)\{\{\/FONT_AWESOME\}\}/g,
      includeFontAwesome ? '$1' : '');
    result = result.replace(/\{\{#PROFILE_PANEL\}\}([\s\S]*?)\{\{\/PROFILE_PANEL\}\}/g,
      includeProfilePanel ? '$1' : '');
    result = result.replace(/\{\{#SETTINGS_PANEL\}\}([\s\S]*?)\{\{\/SETTINGS_PANEL\}\}/g,
      includeSettingsPanel ? '$1' : '');

    // Late-bound variables (set after theme data is fetched)
    if (substituteVars._themeOptions) { sub('THEME_OPTIONS', substituteVars._themeOptions); }
    if (substituteVars._themesConfig) { sub('THEMES_CONFIG', substituteVars._themesConfig); }
    if (substituteVars._sidebarItems) { sub('SIDEBAR_ITEMS', substituteVars._sidebarItems); }

    // Per-page variables (set by caller)
    if (substituteVars._pageLabel) { sub('PAGE_LABEL', substituteVars._pageLabel); }
    if (substituteVars._pageEntity) { sub('PAGE_ENTITY', substituteVars._pageEntity); }

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
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        execSync(`unzip -o "${tmpZip}" -d "${tmpDir}"`, { stdio: 'pipe' });
      } catch {
        execSync(`tar -xf "${tmpZip}" -C "${tmpDir}"`, { stdio: 'pipe' });
      }
      fs.unlinkSync(tmpZip);

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
      try { fs.unlinkSync(tmpZip); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

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
    // --template-path: still fetch recipe for merge
    process.stdout.write(`  Fetching ${template} recipe... `);
    try {
      recipe = await fetchJson(`/api/tools/templates/${template}`);
      console.log(green(`v${recipe.version || 'latest'}`));
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

  // Use downloaded template as template-path
  const effectiveTemplatePath = opts.templatePath || downloadedTemplatePath;

  const appDir = path.join(process.cwd(), appName);

  // 2. Scaffold or copy template
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
        }
      } catch {}
    }

    // If template/ subfolder exists, copy only that; otherwise copy the whole dir (legacy)
    const templateSubdir = path.join(srcDir, 'template');
    const copyFrom = fs.existsSync(templateSubdir) ? templateSubdir : srcDir;
    console.log(`  Copying template from ${dim(copyFrom)}...`);
    copyDirSync(copyFrom, appDir, ['node_modules', '.svelte-kit', 'dist', '.git', 'build']);

    // Copy template.helper.js to appDir so processTemplatePoints can find it
    const helperSrc = path.join(srcDir, 'template.helper.js');
    if (fs.existsSync(helperSrc)) {
      fs.copyFileSync(helperSrc, path.join(appDir, 'template.helper.js'));
    }

    console.log(green(`  Template copied (${recipe?.displayName || template})`));
  } else {
    // Scaffold from scratch — use detected pm for sv create install
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

  // 3b. Resolve default mode from default theme's manifest (skip if already provided by wizard)
  let defaultMode = opts.defaultMode || 'dark';
  if (!opts.defaultMode) {
    try {
      const themeDetail = await fetchJson(`/api/themes/${encodeURIComponent(defaultTheme)}`);
      const variants = themeDetail?.theme?.variants || [];
      if (variants.length > 0) {
        const modes = variants[0].modes || [];
        const defaultModeObj = modes.find(m => m.default) || modes[0];
        if (defaultModeObj?.mode) defaultMode = defaultModeObj.mode;
      }
    } catch {}
  }

  // 4. Set theme-dependent template variables
  substituteVars._themeOptions = themesData.map(t =>
    `\t\t{ id: '${t.slug}', name: '${t.name}', cssPath: '/themes/${t.slug}/css/${t.slug}.css' }`
  ).join(',\n');
  substituteVars._themesConfig = themeIds.map(id => {
    const t = themesData.find(d => d.slug === id);
    return `    "${id}": { "version": "${t?.latest || 'latest'}", "offline": false }`;
  }).join(',\n');

  // 5. Resolve pages from preset or recipe defaults
  const pageTypes = recipe?.pageTypes || {};
  const pages = (preset?.pages) || recipe?.defaultPages || [{ type: 'dashboard', label: 'Dashboard' }];

  // Build sidebar items from pages
  const sidebarItems = pages
    .filter(p => pageTypes[p.type]?.icon !== null)
    .map(p => {
      const pt = pageTypes[p.type] || {};
      const label = p.label || pt.defaultLabel || p.type;
      const icon = p.icon || pt.icon || 'fa fa-circle';
      const entity = p.entity || p.type;
      const href = p.type === 'dashboard' ? '/' : `/${entity}`;
      return `\t\t\t\t<SidebarItem href="${href}" labelText="${label}">\n\t\t\t\t\t{#snippet icon()}<i class="${icon}"></i>{/snippet}\n\t\t\t\t</SidebarItem>`;
    })
    .join('\n');

  // Register sidebar items for variable substitution
  substituteVars._sidebarItems = sidebarItems;

  // Generate page route steps
  const pageSteps = pages.map(p => {
    const pt = pageTypes[p.type] || {};
    const entity = p.entity || p.type;
    const route = (pt.route || `src/routes/${entity}/+page.svelte`).replace(/\{\{entity\}\}/g, entity);
    return {
      action: 'create',
      path: route,
      template: pt.template || `pages/${p.type}.svelte`,
      _pageLabel: p.label || pt.defaultLabel || entity,
      _pageEntity: entity,
    };
  });

  // 6. If using template path, substitute placeholders in all copied files
  if (effectiveTemplatePath) {
    console.log(`  Substituting placeholders...`);
    const exts = ['.svelte', '.html', '.css', '.ts', '.js', '.json', '.md', ''];
    const exactNames = ['Makefile'];
    function walkAndSubstitute(dir) {
      for (const entry of fs.readdirSync(dir)) {
        if (['node_modules', '.svelte-kit', '.git'].includes(entry)) continue;
        const p = path.join(dir, entry);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          walkAndSubstitute(p);
        } else if (exts.some(e => e && entry.endsWith(e)) || exactNames.includes(entry)) {
          let content = fs.readFileSync(p, 'utf-8');
          const replaced = substituteVars(content);
          if (replaced !== content) {
            fs.writeFileSync(p, replaced);
            if (verbose) console.log(`    ${green('~')} ${path.relative(appDir, p)}`);
          }
        }
      }
    }
    walkAndSubstitute(appDir);

    // Inject Lucide imports if selected
    if (iconProvider === 'lucide') {
      // Find all __ICON:name__ that were resolved to <Component /> and collect unique imports
      const usedIcons = new Set();
      function scanForLucideIcons(dir) {
        for (const entry of fs.readdirSync(dir)) {
          if (['node_modules', '.svelte-kit', '.git'].includes(entry)) continue;
          const p = path.join(dir, entry);
          if (fs.statSync(p).isDirectory()) { scanForLucideIcons(p); continue; }
          if (!entry.endsWith('.svelte')) continue;
          const content = fs.readFileSync(p, 'utf-8');
          // Find <ComponentName size={18} /> patterns from Lucide
          const matches = content.matchAll(/<([A-Z][A-Za-z0-9]+)\s+size=/g);
          for (const m of matches) usedIcons.add(m[1]);
        }
      }
      scanForLucideIcons(path.join(appDir, 'src'));

      if (usedIcons.size > 0) {
        // Generate import statements
        const imports = [...usedIcons].sort().map(name => {
          const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          return `\timport ${name} from '@lucide/svelte/icons/${kebab}';`;
        }).join('\n');

        // Inject into .svelte files that use these icons (after the last import line in <script>)
        function injectImports(dir) {
          for (const entry of fs.readdirSync(dir)) {
            if (['node_modules', '.svelte-kit', '.git'].includes(entry)) continue;
            const p = path.join(dir, entry);
            if (fs.statSync(p).isDirectory()) { injectImports(p); continue; }
            if (!entry.endsWith('.svelte')) continue;
            let content = fs.readFileSync(p, 'utf-8');
            const fileIcons = [...usedIcons].filter(name => content.includes(`<${name} `));
            if (fileIcons.length === 0) continue;

            const fileImports = fileIcons.sort().map(name => {
              const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
              return `\timport ${name} from '@lucide/svelte/icons/${kebab}';`;
            }).join('\n');

            // Find last import line and insert after it
            const lines = content.split('\n');
            let lastImportLine = -1;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].match(/^\s*import\s/)) lastImportLine = i;
            }
            if (lastImportLine >= 0) {
              lines.splice(lastImportLine + 1, 0, fileImports);
              fs.writeFileSync(p, lines.join('\n'));
              if (verbose) console.log(`    ${green('~')} ${path.relative(appDir, p)} ${dim('(lucide imports)')}`);
            }
          }
        }
        injectImports(path.join(appDir, 'src'));
      }
    }
  }

  // 7. Execute recipe steps + page steps
  const allSteps = [
    ...(recipe?.steps || [
      { action: 'create', path: 'src/app.html', template: 'app.html' },
      { action: 'create', path: 'src/app.css', template: 'app.css' },
      { action: 'create', path: 'src/routes/+layout.svelte', template: 'layout.svelte' },
      { action: 'create', path: 'pureadmin.json', template: 'pureadmin.json' },
      { action: 'json-merge', path: 'package.json', data: { scripts: { themes: 'pureadmin themes', 'themes:update': 'pureadmin update' } } },
    ]),
    ...(includeMakefile ? [{ action: 'create', path: 'Makefile', template: 'Makefile' }] : []),
    ...pageSteps,
  ];
  // When using template path, skip 'create' steps (files already copied), keep json-merge and pages
  const steps = effectiveTemplatePath
    ? allSteps.filter(s => s.action !== 'create' || s._pageLabel)  // keep page creates + non-create steps
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
    const destPath = path.join(appDir, step.path);
    const action = step.action || 'create';

    // --- delete action ---
    if (action === 'delete') {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
        console.log(`    ${green('-')} ${step.path} ${verbose ? dim('[deleted]') : ''}`);
      } else if (verbose) {
        console.log(`    ${dim('-')} ${step.path} ${dim('[already absent]')}`);
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
        fs.writeFileSync(destPath, JSON.stringify(merged, null, 2) + '\n');
        console.log(`    ${green('~')} ${step.path} ${verbose ? dim(`[json-merge, ${Object.keys(mergeData).length} keys]`) : ''}`);
      } else if (mergeData) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, JSON.stringify(mergeData, null, 2) + '\n');
        console.log(`    ${green('+')} ${step.path} ${verbose ? dim('[json-merge, new file]') : ''}`);
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
          fs.writeFileSync(destPath, fileContent);
          console.log(`    ${green('~')} ${step.path} ${verbose ? dim('[patch]') : ''}`);
        } else if (verbose) {
          console.log(`    ${yellow('!')} ${step.path} ${dim('[patch target not found]')}`);
        }
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
        fs.writeFileSync(destPath, fileContent);
        console.log(`    ${green('~')} ${step.path} ${verbose ? dim(`[${action}]`) : ''}`);
      }
      continue;
    }

    // --- create action (default) ---
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const tmpl = step.template ? await fetchTemplate(step.template) : null;
    if (!tmpl) {
      console.log(`    ${yellow('!')} ${step.path} ${dim('(template not available)')}`);
      continue;
    }

    // Set per-page variables if this is a page step
    substituteVars._pageLabel = step._pageLabel || null;
    substituteVars._pageEntity = step._pageEntity || null;

    let content = substituteVars(tmpl.content);
    fs.writeFileSync(destPath, content);

    if (verbose) {
      const sizeKB = (content.length / 1024).toFixed(1);
      const vars = (content.match(/\{\{[A-Z_]+\}\}/g) || []);
      const unreplaced = vars.length > 0 ? yellow(` ${vars.length} unreplaced var(s): ${vars.join(', ')}`) : '';
      console.log(`    ${green('+')} ${step.path} ${dim(`[${tmpl.source}, ${step.template}, ${sizeKB}KB]`)}${unreplaced}`);
    } else {
      console.log(`    ${green('+')} ${step.path}`);
    }
  }

  // 6. Process template points — remove disabled feature blocks
  const featureFlags = {
    'navbar': true,
    'sidebar': true,
    'footer': true,
    'profile-panel': includeProfilePanel,
    'settings-panel': includeSettingsPanel,
    'icons': includeFontAwesome || opts.lucide || opts.fluentUi,
    'font-awesome': includeFontAwesome && iconProvider === 'font-awesome',
    'floating-ui': true,
    'page-loader': true,
  };
  console.log();
  console.log(`  Processing template features...`);
  processTemplatePoints(appDir, featureFlags, verbose, recipe);

  // 7. Install dependencies
  const deps = { ...(recipe?.dependencies || {
    '@keenmate/svelte-pure-admin': 'latest',
    '@keenmate/pure-admin-core': 'latest'
  }) };
  if (iconProvider === 'lucide') deps['@lucide/svelte'] = 'next';
  const depList = Object.entries(deps).map(([k, v]) => `${k}@${v}`).join(' ');

  if (skipInstall) {
    console.log();
    console.log(dim(`  Skipping install (--no-install). Run "${pm} install" manually.`));
  } else {
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

  // 7. Download themes via pureadmin themes (uses the pureadmin.json we just wrote)
  console.log();
  console.log(`  Downloading themes...`);
  for (const id of themeIds) {
    // Read themesDir: app's pureadmin.json > recipe > default
    let themesDir = recipe?.themeSetup?.themesDir || 'static/themes';
    const appPureadminJson = path.join(appDir, 'pureadmin.json');
    if (fs.existsSync(appPureadminJson)) {
      try {
        const appThemesDir = JSON.parse(fs.readFileSync(appPureadminJson, 'utf-8')).themesDir;
        if (appThemesDir) themesDir = appThemesDir;
      } catch {}
    }
    const themeDir = path.join(appDir, themesDir, id);
    const zipPath = path.join(appDir, themesDir, `${id}.zip`);

    process.stdout.write(`    ${id}... `);
    try {
      fs.mkdirSync(path.join(appDir, themesDir), { recursive: true });
      await downloadFile(`/api/themes/${id}/download`, zipPath);
      extractThemeZip(zipPath, themeDir);
      fs.unlinkSync(zipPath);
      console.log(green('done'));
    } catch (err) {
      console.log(yellow(`failed: ${err.message}`));
    }
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
    try { fs.rmSync(downloadedTemplatePath, { recursive: true }); } catch {}
  }
}

module.exports = { cmdCreate, processTemplatePoints };
