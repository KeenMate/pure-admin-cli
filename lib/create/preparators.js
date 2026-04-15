// ---------------------------------------------------------------------------
// preparators — pure ctx mutators for standard placeholders
//
// Each preparator is a function of shape (ctx) → void that reads from ctx's
// raw inputs (ctx.appName, ctx.opts, ctx.displayName, etc.) and writes to
// ctx.placeholders. Preparators are ORDER-INDEPENDENT — they do not depend
// on each other's output, only on ctx inputs. The only exception is the
// late-bound group (setThemeOptions, setSidebarItems, setCreateCommand)
// which reads fields that are populated by later phases.
//
// Templates use these via helper.prepare(ctx, helpers):
//
//     // in template.helper.js
//     module.exports = {
//       prepare(ctx, helpers) {
//         helpers.setAppId(ctx);
//         helpers.setAppName(ctx);
//         helpers.setAppIdSnake(ctx);    // only if template needs snake_case
//         helpers.setAppModule(ctx);     // only if template needs PascalCase
//         helpers.setCopyright(ctx);
//         helpers.setPackageManager(ctx);
//         // custom template-specific derivations inline here
//         ctx.placeholders.DB_NAME = `${ctx.placeholders.APP_ID_SNAKE}_dev`;
//       }
//     };
//
// The CLI runs helpers.prepare() after buildContext() and before
// walkAndSubstitute().
// ---------------------------------------------------------------------------
'use strict';

const { toSnakeCase, toKebabCase, toPascalCase } = require('./naming');
const { resolveIconAttr, resolveFA, resolveHero, resolveLucide } = require('./icons');

// ── Low-level setters ──────────────────────────────────────────────────────

/**
 * Generic setter — write a value to ctx.placeholders[key].
 * Use for custom template-specific derivations in prepare().
 */
function set(ctx, key, value) {
  ctx.placeholders[key] = value == null ? '' : String(value);
}

/**
 * Compute a placeholder from a function that receives ctx.
 * Equivalent to `set(ctx, key, fn(ctx))` but reads nicer.
 */
function derive(ctx, key, fn) {
  ctx.placeholders[key] = String(fn(ctx) ?? '');
}

// ── App identifier preparators ─────────────────────────────────────────────

/**
 * APP_ID — the directory/package name exactly as the user passed it on the
 * command line. For kebab-case-friendly technologies (Node, Python packages).
 */
function setAppId(ctx) {
  ctx.placeholders.APP_ID = ctx.appName;
}

/**
 * APP_ID_SNAKE — snake_case form. For Elixir apps, Python modules, Rails
 * engines, and any identifier that can't contain hyphens.
 */
function setAppIdSnake(ctx) {
  ctx.placeholders.APP_ID_SNAKE = toSnakeCase(ctx.appName);
}

/**
 * APP_ID_KEBAB — kebab-case form. Useful when the user passed a snake_case
 * or PascalCase name but the template needs kebab (e.g. npm package names).
 */
function setAppIdKebab(ctx) {
  ctx.placeholders.APP_ID_KEBAB = toKebabCase(ctx.appName);
}

/**
 * APP_MODULE — PascalCase form. For Elixir modules, C# namespaces, Go types,
 * Java classes, any CamelCase identifier.
 */
function setAppModule(ctx) {
  ctx.placeholders.APP_MODULE = toPascalCase(ctx.appName);
}

/**
 * APP_NAME / APP_DISPLAY_NAME — human-readable display name. Sourced from
 * --name flag, company profile, or derived from appName via Title Case.
 */
function setAppName(ctx) {
  ctx.placeholders.APP_NAME = ctx.displayName;
  ctx.placeholders.APP_DISPLAY_NAME = ctx.displayName;
}

/**
 * COPYRIGHT — footer copyright text. Resolved from --copyright, company
 * profile, or defaults to displayName.
 */
function setCopyright(ctx) {
  ctx.placeholders.COPYRIGHT = ctx.copyright;
}

/**
 * LOGO — logo URL or path (empty string if none configured).
 */
function setLogo(ctx) {
  ctx.placeholders.LOGO = ctx.logo || '';
}

// ── Default user (for demo content) ────────────────────────────────────────

/**
 * USER_NAME / USER_EMAIL / USER_NAME_URL — placeholder identity used in
 * demo navbar / profile panel content.
 */
function setUserDefaults(ctx) {
  ctx.placeholders.USER_NAME = 'User';
  ctx.placeholders.USER_EMAIL = 'user@example.com';
  ctx.placeholders.USER_NAME_URL = 'User';
}

// ── Theme preparators ──────────────────────────────────────────────────────

/**
 * DEFAULT_THEME / DEFAULT_MODE / DEFAULT_VARIANT — the theme the app loads
 * by default (from --theme or the first of --themes).
 */
function setDefaultTheme(ctx) {
  ctx.placeholders.DEFAULT_THEME = ctx.defaultTheme;
  ctx.placeholders.DEFAULT_MODE = ctx.defaultMode;
  ctx.placeholders.DEFAULT_VARIANT = ctx.opts.defaultVariant || '';
}

/**
 * THEME_IDS_QUOTED — comma-separated list of themes wrapped in single quotes,
 * suitable for embedding in a JS/TS array literal.
 */
function setThemeIds(ctx) {
  ctx.placeholders.THEME_IDS_QUOTED = ctx.themeIds.map(id => `'${id}'`).join(', ');
}

/**
 * THEME_OPTIONS — theme array literal for injection into layout templates.
 * Late-bound: requires ctx.themesData (populated by fetchThemeData phase).
 *
 * Output format (indentation-sensitive, tabs):
 *     { id: 'audi', name: 'Audi', cssPath: '/themes/audi/css/audi.css' },
 *     { id: 'dark', name: 'Dark', cssPath: '/themes/dark/css/dark.css' }
 */
function setThemeOptions(ctx) {
  const data = ctx.themesData || [];
  ctx.placeholders.THEME_OPTIONS = data.map(t =>
    `\t\t{ id: '${t.slug}', name: '${t.name}', cssPath: '/themes/${t.slug}/css/${t.slug}.css' }`
  ).join(',\n');
}

/**
 * THEMES_CONFIG — pureadmin.json themes object. Late-bound.
 */
function setThemesConfig(ctx) {
  const data = ctx.themesData || [];
  ctx.placeholders.THEMES_CONFIG = ctx.themeIds.map(id => {
    const t = data.find(d => d.slug === id);
    return `    "${id}": { "version": "${t?.latest || 'latest'}", "offline": false }`;
  }).join(',\n');
}

// ── Package manager preparators ────────────────────────────────────────────

/**
 * PM / PM_RUN / PM_EXEC — package manager commands, for Node-based templates.
 * Detected by ctx.pm (set by buildContext from auto-detection).
 */
function setPackageManager(ctx) {
  const pm = ctx.pm || 'npm';
  ctx.placeholders.PM = pm;
  ctx.placeholders.PM_RUN = `${pm} run`;
  ctx.placeholders.PM_EXEC =
    pm === 'bun' ? 'bunx' :
    pm === 'pnpm' ? 'pnpm exec' :
    'npx';
}

// ── Feature / scaffold preparators ─────────────────────────────────────────

/**
 * SCAFFOLD_FLAGS — flags built from disabled features' scaffoldFlag fields.
 * Requires ctx.features (from resolveFeatures) and ctx.recipe.features.
 *
 * This is read from ctx.scaffoldFlags which is populated by the feature phase.
 */
function setScaffoldFlags(ctx) {
  ctx.placeholders.SCAFFOLD_FLAGS = ctx.scaffoldFlags || '';
}

/**
 * CREATE_COMMAND — the full `npx @keenmate/pureadmin create ...` invocation
 * with all flags the user actually used. Read from ctx.createCommand which
 * is populated by buildContext.
 */
function setCreateCommand(ctx) {
  ctx.placeholders.CREATE_COMMAND = ctx.createCommand || '';
}

// ── Data collectors ─────────────────────────────────────────────────────────
//
// Collectors build technology-agnostic OBJECT arrays from ctx inputs (pages,
// preset, recipe). Templates call these in their prepare() function and then
// render the objects into their own markup.
//
// Pattern:
//   const items = helpers.collectSidebarItems(ctx);
//   ctx.placeholders.SIDEBAR_ITEMS = items.map(renderMyMarkup).join('\n');

/**
 * Collect sidebar navigation items from ctx.pages + ctx.pageTypes.
 * Returns an array of objects, each with: { href, label, icon, children? }
 *
 * - Pages whose pageType has `sidebar: false` are excluded
 * - Dashboard pages get href "/"
 * - Other pages get href "/<entity>"
 * - `children` is reserved for future submenu support (not populated yet)
 *
 * Late-bound: requires ctx.pages and ctx.pageTypes (set after theme phase).
 */
function collectSidebarItems(ctx) {
  const pages = ctx.pages || [];
  const pageTypes = ctx.pageTypes || {};
  return pages
    .filter(p => pageTypes[p.type]?.sidebar !== false)
    .map(p => {
      const pt = pageTypes[p.type] || {};
      const entity = p.entity || p.type;
      return {
        href: p.type === 'dashboard' ? '/' : `/${entity}`,
        label: p.label || pt.defaultLabel || p.type,
        icon: p.icon || pt.icon || 'fa fa-circle',
        entity,
        type: p.type,
      };
    });
}

/**
 * Collect navbar navigation items. Currently returns items from
 * ctx.recipe.navbar or a sensible default. Templates render these
 * as <NavItem>, <.navbar_nav_item>, etc.
 *
 * Returns: [{ href, label, hasDropdown?, children? }]
 */
function collectNavbarItems(ctx) {
  if (ctx.recipe?.navbar?.items) return ctx.recipe.navbar.items;
  // Default: no extra navbar items (just brand + profile button)
  return [];
}

/**
 * Collect profile panel navigation items. Templates render these as
 * <.profile_nav_item>, <ProfilePanelNavItem>, etc.
 *
 * Returns: [{ href, label, icon }]
 */
function collectProfileItems(ctx) {
  if (ctx.recipe?.profilePanel?.items) return ctx.recipe.profilePanel.items;
  // Default profile nav items (canonical icon names — resolved per-provider by templates)
  return [
    { href: '#', label: 'Profile Settings', icon: 'user' },
    { href: '#', label: 'Security', icon: 'lock' },
    { href: '#', label: 'Notifications', icon: 'bell' },
    { href: '#', label: 'Preferences', icon: 'gear' },
  ];
}

/**
 * Collect brand/logo data. Templates render this as <.navbar_brand>,
 * <Navbar brand={...}>, etc. Or they may skip this and use runtime
 * config (e.g. PureAdmin.Config.app_name in Elixir).
 *
 * Returns: { name, logo?, logoAlt? }
 */
function collectBrand(ctx) {
  return {
    name: ctx.displayName,
    logo: ctx.logo || null,
    logoAlt: ctx.displayName,
  };
}

/**
 * Collect footer data. Templates render this as <.footer>, <Footer>, etc.
 * Or they may skip and use runtime config.
 *
 * Returns: { copyright, version?, links? }
 */
function collectFooter(ctx) {
  return {
    copyright: ctx.copyright,
    version: ctx.opts?.appVersion || null,
    links: [],
  };
}

/**
 * Collect theme option objects for template rendering (e.g. theme switcher).
 * Late-bound: requires ctx.themesData.
 *
 * Returns: [{ id, name, cssPath }]
 */
function collectThemeOptions(ctx) {
  const data = ctx.themesData || [];
  return data.map(t => ({
    id: t.slug,
    name: t.name,
    cssPath: `/themes/${t.slug}/css/${t.slug}.css`,
  }));
}

/**
 * Collect a summary of how the app was created. Useful for rendering
 * a "Project Info" section on the home page.
 *
 * Returns: {
 *   template: string,          // e.g. "phoenix-liveview"
 *   createCommand: string,     // full CLI invocation
 *   featuresOn: string[],      // enabled feature IDs
 *   featuresOff: string[],     // disabled feature IDs
 *   themes: string[],          // theme slugs
 *   defaultTheme: string,      // default theme slug
 *   defaultMode: string,       // dark/light
 * }
 */
function collectCreateSummary(ctx) {
  const featuresOn = [];
  const featuresOff = [];
  for (const [id, enabled] of Object.entries(ctx.features || {})) {
    (enabled ? featuresOn : featuresOff).push(id);
  }
  return {
    template: ctx.template || '',
    createCommand: ctx.createCommand || '',
    featuresOn,
    featuresOff,
    themes: ctx.themeIds || [],
    defaultTheme: ctx.defaultTheme || '',
    defaultMode: ctx.defaultMode || '',
  };
}

// ── Legacy placeholder setters (call collect* then render) ─────────────────
// These exist so older templates that set SIDEBAR_ITEMS / THEME_OPTIONS as
// placeholders still work. New templates should call collect* + render inline.

/**
 * @deprecated Use collectSidebarItems() + template-specific rendering instead.
 */
function setSidebarItems(ctx) {
  const items = collectSidebarItems(ctx);
  // Svelte-specific rendering (legacy)
  ctx.placeholders.SIDEBAR_ITEMS = items.map(item =>
    `\t\t\t\t<SidebarItem href="${item.href}" labelText="${item.label}">\n\t\t\t\t\t{#snippet icon()}<i class="${item.icon}"></i>{/snippet}\n\t\t\t\t</SidebarItem>`
  ).join('\n');
}

// ── Aggregate: default Svelte prepare ──────────────────────────────────────

/**
 * Default preparator suite for templates that don't export their own
 * prepare() function. Mirrors the legacy behavior of create.js's substituteVars.
 *
 * Includes every preparator in this module. Useful as a fallback or as a
 * starting point for new templates.
 */
function prepareDefault(ctx) {
  setAppId(ctx);
  setAppIdSnake(ctx);
  setAppIdKebab(ctx);
  setAppModule(ctx);
  setAppName(ctx);
  setCopyright(ctx);
  setLogo(ctx);
  setUserDefaults(ctx);
  setDefaultTheme(ctx);
  setThemeIds(ctx);
  setPackageManager(ctx);
}

/**
 * Late-bound preparator suite that runs after theme data + features + pages
 * are resolved. Split from prepareDefault because these preparators need
 * data that isn't available during the initial prepare phase.
 */
function prepareLateBound(ctx) {
  setThemeOptions(ctx);
  setThemesConfig(ctx);
  setSidebarItems(ctx);
  setScaffoldFlags(ctx);
  setCreateCommand(ctx);
}

module.exports = {
  // low-level
  set,
  derive,

  // app identifiers
  setAppId,
  setAppIdSnake,
  setAppIdKebab,
  setAppModule,
  setAppName,
  setCopyright,
  setLogo,

  // user defaults
  setUserDefaults,

  // themes
  setDefaultTheme,
  setThemeIds,
  setThemeOptions,
  setThemesConfig,

  // package manager
  setPackageManager,

  // features / scaffold / create command
  setScaffoldFlags,
  setCreateCommand,

  // data collectors (technology-agnostic → object arrays)
  collectSidebarItems,
  collectNavbarItems,
  collectProfileItems,
  collectBrand,
  collectFooter,
  collectThemeOptions,
  collectCreateSummary,

  // icon resolution (for templates to use in prepare/prepareLate)
  resolveIconAttr,
  resolveFA,
  resolveHero,
  resolveLucide,

  // legacy placeholder setters (collect + Svelte-specific render)
  setSidebarItems,

  // aggregates
  prepareDefault,
  prepareLateBound,
};
