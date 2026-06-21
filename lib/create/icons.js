// ---------------------------------------------------------------------------
// icons — icon provider maps and resolution
//
// Each icon is identified by a canonical name (e.g. "rocket", "users").
// The CLI resolves these to technology + provider-specific output:
//
//   Svelte + FA:     '<i class="fas fa-rocket"></i>'
//   Svelte + Lucide: '<Rocket size={18} />'
//   Phoenix + FA:    'fa-solid fa-rocket'      (string for icon= attr)
//   Phoenix + Hero:  'hero-rocket-launch'      (string for .icon name= attr)
// ---------------------------------------------------------------------------
'use strict';

const { toPascalCase, toKebabCase } = require('./naming');

// ── Icon name maps ─────────────────────────────────────────────────────────

/**
 * Font Awesome: canonical name → FA class (without "fa-solid " prefix).
 * Missing names fall back to `fa-${name}`.
 */
const faMap = {
  'rocket': 'fa-rocket',
  'chart-line': 'fa-chart-line',
  'briefcase': 'fa-briefcase',
  'users': 'fa-users',
  'settings': 'fa-cog',
  'cog': 'fa-cog',
  'user': 'fa-user',
  'log-out': 'fa-sign-out-alt',
  'sign-out-alt': 'fa-sign-out-alt',
  'plus': 'fa-plus',
  'user-plus': 'fa-user-plus',
  'file-export': 'fa-file-export',
  'chart-bar': 'fa-chart-bar',
  'pen': 'fa-pen',
  'trash': 'fa-trash',
  'shopping-cart': 'fa-shopping-cart',
  'save': 'fa-save',
  'broom': 'fa-broom',
  'gauge': 'fa-gauge',
  'house': 'fa-house',
  'list': 'fa-list',
  'table-columns': 'fa-table-columns',
  'pen-to-square': 'fa-pen-to-square',
  'lock': 'fa-lock',
  'bell': 'fa-bell',
  'gear': 'fa-gear',
  'right-from-bracket': 'fa-right-from-bracket',
  'palette': 'fa-palette',
  'icons': 'fa-icons',
  'book': 'fa-book',
};

/**
 * Lucide: canonical name → Svelte component name.
 * Missing names are auto-derived via PascalCase.
 *
 * These match `@lucide/svelte` component names. Some are slightly out of
 * date vs. current upstream Lucide (e.g. `BarChart3` is now `ChartBar`),
 * but the npm package still exports the old names as aliases. For the
 * Phoenix path see `lucideKebabMap` below — that targets the actual
 * `<lucide-icons>/icons/*.svg` filenames in the upstream repo.
 */
const lucideMap = {
  'rocket': 'Rocket',
  'chart-line': 'ChartLine',
  'briefcase': 'Briefcase',
  'users': 'Users',
  'settings': 'Settings',
  'cog': 'Settings',
  'user': 'User',
  'log-out': 'LogOut',
  'sign-out-alt': 'LogOut',
  'plus': 'Plus',
  'user-plus': 'UserPlus',
  'file-export': 'FileOutput',
  'chart-bar': 'BarChart3',
  'pen': 'Pencil',
  'trash': 'Trash2',
  'shopping-cart': 'ShoppingCart',
  'save': 'Save',
  'broom': 'Brush',
  'gauge': 'Gauge',
  'house': 'Home',
  'list': 'List',
  'table-columns': 'Columns',
  'pen-to-square': 'FileEdit',
  'lock': 'Lock',
  'bell': 'Bell',
  'gear': 'Settings',
};

/**
 * Lucide for Phoenix: canonical name → upstream Lucide SVG filename (without
 * .svg). Matches the actual file names in lucide-icons/lucide@main/icons.
 *
 * Used when emitting `<.icon name="lucide-X" />` for Elixir templates — the
 * Phoenix template ships the matching SVG at
 * `priv/static/assets/icons/lucide/X.svg` and routes through the configured
 * `icon_callback` to render it as `<img src="/assets/icons/lucide/X.svg">`.
 *
 * Missing names fall back to the canonical name as-is.
 */
const lucideKebabMap = {
  'rocket': 'rocket',
  'chart-line': 'chart-line',
  'briefcase': 'briefcase',
  'users': 'users',
  'settings': 'settings',
  'cog': 'settings',
  'gear': 'settings',
  'user': 'user',
  'log-out': 'log-out',
  'sign-out-alt': 'log-out',
  'right-from-bracket': 'log-out',
  'plus': 'plus',
  'user-plus': 'user-plus',
  'file-export': 'file-output',
  'chart-bar': 'chart-bar',
  'pen': 'pencil',
  'pen-to-square': 'square-pen',
  'trash': 'trash-2',
  'shopping-cart': 'shopping-cart',
  'save': 'save',
  'broom': 'brush',
  'gauge': 'gauge',
  'house': 'house',
  'list': 'list',
  'table-columns': 'columns-3',
  'lock': 'lock',
  'bell': 'bell',
  'palette': 'palette',
  'icons': 'layout-grid',
  'book': 'book-open',
  'eye': 'eye',
};

/**
 * Heroicons: canonical name → hero icon name (for Phoenix .icon component).
 * Uses "hero-{name}" format. Missing names fall back to `hero-${name}`.
 */
const heroMap = {
  'rocket': 'hero-rocket-launch',
  'chart-line': 'hero-chart-bar',
  'briefcase': 'hero-briefcase',
  'users': 'hero-user-group',
  'settings': 'hero-cog-6-tooth',
  'cog': 'hero-cog-6-tooth',
  'user': 'hero-user',
  'log-out': 'hero-arrow-right-on-rectangle',
  'sign-out-alt': 'hero-arrow-right-on-rectangle',
  'plus': 'hero-plus',
  'user-plus': 'hero-user-plus',
  'file-export': 'hero-arrow-down-tray',
  'chart-bar': 'hero-chart-bar',
  'pen': 'hero-pencil',
  'trash': 'hero-trash',
  'shopping-cart': 'hero-shopping-cart',
  'save': 'hero-bookmark',
  'broom': 'hero-paint-brush',
  'gauge': 'hero-chart-bar-square',
  'house': 'hero-home',
  'list': 'hero-list-bullet',
  'table-columns': 'hero-view-columns',
  'pen-to-square': 'hero-pencil-square',
  'lock': 'hero-lock-closed',
  'bell': 'hero-bell',
  'gear': 'hero-cog-6-tooth',
  'right-from-bracket': 'hero-arrow-right-on-rectangle',
  'palette': 'hero-swatch',
  'icons': 'hero-squares-2x2',
  'book': 'hero-book-open',
};

// ── Resolution functions ───────────────────────────────────────────────────

/**
 * Resolve a canonical icon name to a Font Awesome class string.
 * Returns the full class: "fa-solid fa-rocket"
 */
function resolveFA(name) {
  const cls = faMap[name] || `fa-${name}`;
  return `fa-solid ${cls}`;
}

/**
 * Resolve a canonical icon name to a Heroicon name string.
 * Returns: "hero-rocket-launch"
 */
function resolveHero(name) {
  return heroMap[name] || `hero-${name}`;
}

/**
 * Resolve a canonical icon name to a Lucide Svelte component name.
 * Returns: "Rocket"
 */
function resolveLucide(name) {
  return lucideMap[name] || toPascalCase(name);
}

/**
 * Resolve a canonical icon name to a Lucide SVG filename (kebab, no .svg).
 * Used by the Phoenix path — the file ships at
 * `priv/static/assets/icons/lucide/X.svg`.
 */
function resolveLucideKebab(name) {
  return lucideKebabMap[name] || name;
}

/**
 * Resolve a canonical icon name to inline HTML/Svelte markup.
 * This is used by substituteVars for __ICON:name__ patterns.
 *
 * @param {string} name - canonical icon name
 * @param {string} provider - 'font-awesome' | 'lucide' | 'heroicons'
 * @param {Map} [usedLucideIcons] - collector for Lucide import resolution
 * @param {string} [technology] - template technology id (e.g. 'elixir', 'svelte').
 *   Used to pick the FA emission style: Elixir templates emit `<.faicon name="X" />`
 *   so the icon flows through `PureAdmin.Components.Faicon` (single code path with
 *   sidebar / button icon-attr usage); other techs fall back to `<i class="fa-…">`.
 * @returns {string} - inline markup
 */
function resolveIconMarkup(name, provider, usedLucideIcons, technology) {
  if (provider === 'none') return '';
  if (provider === 'lucide') {
    // Phoenix path — route through `<.icon>` so the configured
    // `:icon_callback` ({MyAppWeb.Icons, :render}) renders the SVG.
    // The kebab name matches the SVG filename shipped under
    // priv/static/assets/icons/lucide/.
    if (technology === 'elixir') {
      return `<.icon name="lucide-${resolveLucideKebab(name)}" class="size-5" />`;
    }
    // Svelte path — emit the Svelte component and track it for the
    // per-file extra-imports pass.
    const component = resolveLucide(name);
    const kebab = toKebabCase(component);
    if (usedLucideIcons) usedLucideIcons.set(component, kebab);
    return `<${component} size={18} />`;
  }
  if (provider === 'heroicons') {
    // Strip the `hero-` prefix — PureAdmin.Components.Heroicon takes the bare
    // kebab name (e.g. "rocket-launch"), not "hero-rocket-launch". Sidebar
    // icon-attr strings keep the "hero-" prefix because they go through the
    // smart `<.icon>` dispatcher in keen_pure_admin which routes on prefix.
    const heroName = resolveHero(name).replace(/^hero-/, '');
    return `<.heroicon name="${heroName}" class="size-5" />`;
  }
  // Font Awesome — route Phoenix templates through `<.faicon>` so inline FA
  // uses the same component path as sidebar/button icon-attr renderings.
  // Svelte / other techs keep the raw `<i class>` emission.
  if (technology === 'elixir') {
    const cls = faMap[name] || `fa-${name}`;
    const faName = cls.replace(/^fa-/, '');
    return `<.faicon name="${faName}" />`;
  }
  return `<i class="${resolveFA(name)}"></i>`;
}

/**
 * Resolve a canonical icon name to a string value for component attrs.
 * Used by templates in their prepare() to build sidebar/profile items.
 *
 * @param {string} name - canonical icon name
 * @param {string} provider - 'font-awesome' | 'heroicons' | 'lucide'
 * @param {string} [technology] - template technology id (e.g. 'elixir').
 *   For Lucide on Elixir, returns the `"lucide-X"` form that flows through
 *   the `<.icon>` dispatcher + configured `:icon_callback`. For Svelte
 *   (default), returns the PascalCase component name.
 * @returns {string} - attr value (e.g. "fa-solid fa-rocket" or "hero-rocket-launch" or "lucide-rocket")
 */
function resolveIconAttr(name, provider, technology) {
  if (provider === 'none') return '';
  if (provider === 'heroicons') return resolveHero(name);
  if (provider === 'lucide') {
    if (technology === 'elixir') return `lucide-${resolveLucideKebab(name)}`;
    return resolveLucide(name);
  }
  return resolveFA(name);
}

// ── Provider selection ────────────────────────────────────────────────────

/**
 * Map a CLI flag string to its provider name.
 */
const FLAG_TO_PROVIDER = {
  '--font-awesome': 'font-awesome',
  '--heroicons': 'heroicons',
  '--lucide': 'lucide',
  '--fluent-ui': 'fluent-ui',
};

/**
 * Resolve which icon provider should be used.
 *
 * Priority (highest first):
 *   1. --no-icons opt → 'none' (errors if combined with a provider flag)
 *   2. Provider flag (--font-awesome / --heroicons / --lucide / --fluent-ui)
 *   3. preset.fontAwesome → 'font-awesome'
 *   4. company.fontAwesome → 'font-awesome'
 *   5. recipe.features.icons.cli[].isDefault → that provider (template default)
 *   6. 'none'
 *
 * @param {object} args
 * @param {object} [args.opts]
 * @param {object} [args.preset]
 * @param {object} [args.company]
 * @param {string} [args.companyId]
 * @param {object} [args.recipe] - template manifest (or null if not yet loaded)
 * @returns {{ provider: string, source: string }}
 * @throws {Error} if opts.noIcons conflicts with a provider flag
 */
function resolveIconProvider({ opts = {}, preset = null, company = null, companyId = null, recipe = null } = {}) {
  const providerFlags = ['fontAwesome', 'heroicons', 'lucide', 'fluentUi'].filter(k => opts[k]);

  if (opts.noIcons && providerFlags.length > 0) {
    const passed = providerFlags.map(k => '--' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())).join(', ');
    throw new Error(`--no-icons cannot be combined with ${passed}`);
  }

  if (opts.noIcons) return { provider: 'none', source: 'CLI flag --no-icons' };
  if (opts.lucide) return { provider: 'lucide', source: 'CLI flag --lucide' };
  if (opts.heroicons) return { provider: 'heroicons', source: 'CLI flag --heroicons' };
  if (opts.fluentUi) return { provider: 'fluent-ui', source: 'CLI flag --fluent-ui' };
  if (opts.fontAwesome) return { provider: 'font-awesome', source: 'CLI flag --font-awesome' };
  if (preset?.fontAwesome) return { provider: 'font-awesome', source: `preset "${opts.preset}"` };
  if (company?.fontAwesome) return { provider: 'font-awesome', source: `company "${companyId}"` };

  // Template manifest default — read features.icons.cli[].isDefault
  const iconsFeature = recipe?.features?.icons;
  if (iconsFeature && Array.isArray(iconsFeature.cli)) {
    for (const entry of iconsFeature.cli) {
      if (typeof entry === 'object' && entry.isDefault && entry.flag && FLAG_TO_PROVIDER[entry.flag]) {
        return {
          provider: FLAG_TO_PROVIDER[entry.flag],
          source: `template default (${entry.flag})`,
        };
      }
    }
  }

  return { provider: 'none', source: 'default (no icon flag)' };
}

module.exports = {
  // Maps (for direct access)
  faMap,
  lucideMap,
  lucideKebabMap,
  heroMap,

  // Per-provider resolvers
  resolveFA,
  resolveHero,
  resolveLucide,
  resolveLucideKebab,

  // High-level resolvers
  resolveIconMarkup,
  resolveIconAttr,
  resolveIconProvider,
  FLAG_TO_PROVIDER,
};
