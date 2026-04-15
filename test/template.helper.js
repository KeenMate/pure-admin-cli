/**
 * Template Helper for SvelteKit + Pure Admin
 *
 * Defines data-pa marker format, point definitions, and template operations.
 * The CLI loads this module for feature stripping and recipe step execution.
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  /**
   * prepare(ctx, helpers) — populate ctx.placeholders for this template.
   *
   * SvelteKit + Svelte 5 + pnpm/npm/bun. Needs the standard npm-app
   * identifiers plus package manager commands and theme/sidebar data.
   */
  prepare(ctx, helpers) {
    helpers.setAppId(ctx);
    helpers.setAppName(ctx);
    helpers.setCopyright(ctx);
    helpers.setLogo(ctx);
    helpers.setUserDefaults(ctx);
    helpers.setDefaultTheme(ctx);
    helpers.setThemeIds(ctx);
    helpers.setPackageManager(ctx);
  },

  /**
   * prepareLate — called after ctx.themesData and ctx.pages are populated.
   * Renders technology-specific markup from collected data objects.
   */
  prepareLate(ctx, helpers) {
    // Sidebar items → Svelte SidebarItem components
    const sidebarItems = helpers.collectSidebarItems(ctx);
    ctx.placeholders.SIDEBAR_ITEMS = sidebarItems.map(item =>
      `\t\t\t\t<SidebarItem href="${item.href}" labelText="${item.label}">\n\t\t\t\t\t{#snippet icon()}<i class="${item.icon}"></i>{/snippet}\n\t\t\t\t</SidebarItem>`
    ).join('\n');

    // Theme options → JS array literal for theme switcher
    const themeOpts = helpers.collectThemeOptions(ctx);
    ctx.placeholders.THEME_OPTIONS = themeOpts.map(t =>
      `\t\t{ id: '${t.id}', name: '${t.name}', cssPath: '${t.cssPath}' }`
    ).join(',\n');

    // Themes config for pureadmin.json
    helpers.setThemesConfig(ctx);

    // Project info summary for home page
    const summary = helpers.collectCreateSummary(ctx);
    const on = summary.featuresOn.map(f => `<Badge variant="success">${f}</Badge>`).join(' ');
    const off = summary.featuresOff.map(f => `<Badge variant="secondary">${f}</Badge>`).join(' ');
    const themes = summary.themes.map(t =>
      t === summary.defaultTheme
        ? `<Badge variant="primary">${t}</Badge>`
        : `<Badge>${t}</Badge>`
    ).join(' ');

    ctx.placeholders.PROJECT_INFO = [
      `<Card titleText="Project Info">`,
      `\t<Heading level={4}>Template</Heading>`,
      `\t<Paragraph><code>${summary.template}</code></Paragraph>`,
      `\t<Heading level={4}>Features</Heading>`,
      `\t<Paragraph>${on || '<em>none</em>'}</Paragraph>`,
      summary.featuresOff.length > 0 ? `\t<Paragraph class="text-muted">Disabled: ${off}</Paragraph>` : '',
      `\t<Heading level={4}>Themes</Heading>`,
      `\t<Paragraph>${themes || '<em>none</em>'}</Paragraph>`,
      `\t<Paragraph class="text-muted">Default: <strong>${summary.defaultTheme}</strong> (${summary.defaultMode})</Paragraph>`,
      `\t<Heading level={4}>Created with</Heading>`,
      `\t<CodeBlock language="bash">${summary.createCommand}</CodeBlock>`,
      `</Card>`,
    ].filter(Boolean).join('\n');
  },

  markerFormat: {
    htmlStart: (id) => `<!-- data-pa="${id}" -->`,
    htmlEnd: (id) => `<!-- /data-pa="${id}" -->`,
    jsStart: (id) => `// data-pa="${id}"`,
    jsEnd: (id) => `// /data-pa="${id}"`,
  },

  points: {
    // ── app.html ──
    'font-awesome-cdn': { file: 'src/app.html', type: 'block' },
    'floating-ui-cdn': { file: 'src/app.html', type: 'block' },
    'page-loader-css': { file: 'src/app.html', type: 'block' },
    'page-loader-html': { file: 'src/app.html', type: 'block' },
    'page-loader-script': { file: 'src/app.html', type: 'block' },

    // ── +layout.svelte — imports ──
    'navbar-imports': { file: 'src/routes/+layout.svelte', type: 'block' },
    'sidebar-imports': { file: 'src/routes/+layout.svelte', type: 'block' },
    'profile-imports': { file: 'src/routes/+layout.svelte', type: 'block' },
    'settings-imports': { file: 'src/routes/+layout.svelte', type: 'block' },
    'footer-imports': { file: 'src/routes/+layout.svelte', type: 'block' },
    'popover-imports': { file: 'src/routes/+layout.svelte', type: 'block' },

    // ── +layout.svelte — state & functions ──
    'profile-state': { file: 'src/routes/+layout.svelte', type: 'block' },
    'profile-toggle': { file: 'src/routes/+layout.svelte', type: 'block' },
    'settings-data': { file: 'src/routes/+layout.svelte', type: 'block' },
    'page-loader-onmount': { file: 'src/routes/+layout.svelte', type: 'block' },

    // ── +layout.svelte — components ──
    'navbar-component': { file: 'src/routes/+layout.svelte', type: 'block' },
    'navbar-profile-snippet': { file: 'src/routes/+layout.svelte', type: 'block' },
    'sidebar-component': { file: 'src/routes/+layout.svelte', type: 'block' },
    'sidebar-items': { file: 'src/routes/+layout.svelte', type: 'slot' },
    'footer-component': { file: 'src/routes/+layout.svelte', type: 'block' },
    'profile-panel-component': { file: 'src/routes/+layout.svelte', type: 'block' },
    'settings-panel-component': { file: 'src/routes/+layout.svelte', type: 'block' },
    'popover-container': { file: 'src/routes/+layout.svelte', type: 'block' },
  },

  /**
   * Template operations — technology-specific file manipulation.
   * Called by the CLI pipeline via { action: "call", op: "operationName", args: [...] }
   * All operations receive (appDir, ...args) and mutate files in place.
   */
  operations: {
    /**
     * Add a dependency to package.json
     */
    addDependency(appDir, name, version, section = 'dependencies') {
      const pkgPath = path.join(appDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg[section] = pkg[section] || {};
      pkg[section][name] = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    },

    /**
     * Set a value in pureadmin.json (dot-notation key)
     */
    setConfigValue(appDir, key, value) {
      const cfgPath = path.join(appDir, 'pureadmin.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const keys = key.split('.');
      let obj = cfg;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = obj[keys[i]] || {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    },

    /**
     * Inject text into a file at a marker position
     */
    inject(appDir, file, marker, content, position = 'after') {
      const filePath = path.join(appDir, file);
      if (!fs.existsSync(filePath)) return false;
      let text = fs.readFileSync(filePath, 'utf-8');
      if (!text.includes(marker)) return false;

      if (position === 'replace') {
        text = text.replace(marker, content);
      } else if (position === 'before') {
        text = text.replace(marker, content + marker);
      } else {
        text = text.replace(marker, marker + content);
      }
      fs.writeFileSync(filePath, text);
      return true;
    },

    /**
     * Add a <script> or <link> tag to src/app.html <head>
     */
    addHeadTag(appDir, tag) {
      const htmlPath = path.join(appDir, 'src', 'app.html');
      let html = fs.readFileSync(htmlPath, 'utf-8');
      html = html.replace('%sveltekit.head%', `${tag}\n\t\t%sveltekit.head%`);
      fs.writeFileSync(htmlPath, html);
    },

    /**
     * Add a SvelteKit route (creates the page file)
     */
    addRoute(appDir, routePath, content) {
      const dir = path.join(appDir, 'src', 'routes', routePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '+page.svelte'), content);
    },

    /**
     * Add a sidebar item to +layout.svelte
     */
    addSidebarItem(appDir, href, label, iconMarkup) {
      const filePath = path.join(appDir, 'src', 'routes', '+layout.svelte');
      if (!fs.existsSync(filePath)) return false;
      let content = fs.readFileSync(filePath, 'utf-8');
      const marker = '<!-- /data-pa="sidebar-items" -->';
      if (!content.includes(marker)) return false;

      const item = `\t\t\t\t<SidebarItem href="${href}" labelText="${label}">\n\t\t\t\t\t{#snippet icon()}${iconMarkup}{/snippet}\n\t\t\t\t</SidebarItem>\n\t\t\t\t`;
      content = content.replace(marker, item + marker);
      fs.writeFileSync(filePath, content);
      return true;
    },
  },
};
