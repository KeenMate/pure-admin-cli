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
 * Resolve a canonical icon name to inline HTML/Svelte markup.
 * This is used by substituteVars for __ICON:name__ patterns.
 *
 * @param {string} name - canonical icon name
 * @param {string} provider - 'font-awesome' | 'lucide' | 'heroicons'
 * @param {Map} [usedLucideIcons] - collector for Lucide import resolution
 * @returns {string} - inline markup
 */
function resolveIconMarkup(name, provider, usedLucideIcons) {
  if (provider === 'lucide') {
    const component = resolveLucide(name);
    const kebab = toKebabCase(component);
    if (usedLucideIcons) usedLucideIcons.set(component, kebab);
    return `<${component} size={18} />`;
  }
  if (provider === 'heroicons') {
    return `<.icon name="${resolveHero(name)}" class="size-5" />`;
  }
  // Default: Font Awesome
  return `<i class="${resolveFA(name)}"></i>`;
}

/**
 * Resolve a canonical icon name to a string value for component attrs.
 * Used by templates in their prepare() to build sidebar/profile items.
 *
 * @param {string} name - canonical icon name
 * @param {string} provider - 'font-awesome' | 'heroicons' | 'lucide'
 * @returns {string} - attr value (e.g. "fa-solid fa-rocket" or "hero-rocket-launch")
 */
function resolveIconAttr(name, provider) {
  if (provider === 'heroicons') return resolveHero(name);
  if (provider === 'lucide') return resolveLucide(name);
  return resolveFA(name);
}

module.exports = {
  // Maps (for direct access)
  faMap,
  lucideMap,
  heroMap,

  // Per-provider resolvers
  resolveFA,
  resolveHero,
  resolveLucide,

  // High-level resolvers
  resolveIconMarkup,
  resolveIconAttr,
};
