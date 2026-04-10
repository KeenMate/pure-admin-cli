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

  markerFormat: {
    htmlStart: (id) => `<!-- data-pa="${id}" -->`,
    htmlEnd: (id) => `<!-- /data-pa="${id}" -->`,
    jsStart: (id) => `// data-pa="${id}"`,
    jsEnd: (id) => `// /data-pa="${id}"`,
  },
};
