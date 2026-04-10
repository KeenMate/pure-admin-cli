// ---------------------------------------------------------------------------
// Offline fallback helper for the bundled sveltekit recipe.
// Loaded by cmdCreate when the CLI can't reach the template API and falls
// back to templates/sveltekit.json + templates/sveltekit/*.
// ---------------------------------------------------------------------------

module.exports = {
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

  prepareLate(ctx, helpers) {
    const sidebarItems = helpers.collectSidebarItems(ctx);
    ctx.placeholders.SIDEBAR_ITEMS = sidebarItems.map(item =>
      `\t\t\t\t<SidebarItem href="${item.href}" labelText="${item.label}">\n\t\t\t\t\t{#snippet icon()}<i class="${item.icon}"></i>{/snippet}\n\t\t\t\t</SidebarItem>`
    ).join('\n');

    const themeOpts = helpers.collectThemeOptions(ctx);
    ctx.placeholders.THEME_OPTIONS = themeOpts.map(t =>
      `\t\t{ id: '${t.id}', name: '${t.name}', cssPath: '${t.cssPath}' }`
    ).join(',\n');

    helpers.setThemesConfig(ctx);
  },

  markerFormat: {
    htmlStart: (id) => `<!-- data-pa="${id}" -->`,
    htmlEnd: (id) => `<!-- /data-pa="${id}" -->`,
    jsStart: (id) => `// data-pa="${id}"`,
    jsEnd: (id) => `// /data-pa="${id}"`,
  },
};
