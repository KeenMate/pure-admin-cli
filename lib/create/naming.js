// ---------------------------------------------------------------------------
// naming — pure case-conversion primitives
//
// These are trivially testable: input string → output string, no side effects.
// Used by the preparator helpers (lib/create/preparators.js) and by templates
// that need custom derivations inside their helper.js prepare() function.
// ---------------------------------------------------------------------------
'use strict';

/**
 * Split a string into lowercase word tokens. Accepts kebab-case, snake_case,
 * camelCase, PascalCase, or any mix. Empty tokens are dropped.
 *
 *   "my-app"                → ["my", "app"]
 *   "my_app"                → ["my", "app"]
 *   "MyApp"                 → ["my", "app"]
 *   "myApp"                 → ["my", "app"]
 *   "keen-pure-admin-01"    → ["keen", "pure", "admin", "01"]
 */
function splitWords(s) {
  return String(s)
    // insert a separator before uppercase letters that follow lower/digit
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // runs of uppercase followed by lower should split before the last upper
    // (so "XMLParser" → "XML Parser", not "X M L Parser")
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // split letters from trailing digits ("test02" → "test 02", "Test02" → "Test 02")
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
}

/**
 * Convert to snake_case.
 *   "my-app"  → "my_app"
 *   "MyApp"   → "my_app"
 *   "my_app"  → "my_app"
 */
function toSnakeCase(s) {
  return splitWords(s).join('_');
}

/**
 * Convert to kebab-case.
 *   "my_app"  → "my-app"
 *   "MyApp"   → "my-app"
 */
function toKebabCase(s) {
  return splitWords(s).join('-');
}

/**
 * Convert to PascalCase.
 *   "my-app"  → "MyApp"
 *   "my_app"  → "MyApp"
 *   "myApp"   → "MyApp"
 */
function toPascalCase(s) {
  return splitWords(s)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Convert to camelCase.
 *   "my-app"  → "myApp"
 *   "MyApp"   → "myApp"
 */
function toCamelCase(s) {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert to Title Case (human-readable, spaces between words, each word capitalized).
 *   "my-app"  → "My App"
 *   "my_app"  → "My App"
 */
function toTitleCase(s) {
  return splitWords(s)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Convert a CLI flag to its camelCase opts key. Strips leading `--`.
 *   "--profile-panel" → "profilePanel"
 *   "--no-ecto"       → "noEcto"
 */
function flagToOpt(flag) {
  return String(flag)
    .replace(/^--/, '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports = {
  splitWords,
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  toTitleCase,
  flagToOpt,
};
