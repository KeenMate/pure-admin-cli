// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

// Both deepMerge and deepMergeInto use the same rule:
// - Plain objects merge recursively
// - Arrays and scalars from `source` overwrite whatever is at `target[key]`
// - Arrays are NEVER concatenated — they represent discrete config values
function isMergeable(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Immutable deep merge. Returns a new object; target is not mutated.
 * Nested objects that exist on both sides get fresh merged copies.
 * (Nested objects present only in target are still shared by reference —
 * don't mutate them after calling; use deepMergeInto if you need that.)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (isMergeable(val) && isMergeable(target[key])) {
      result[key] = deepMerge(target[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * In-place deep merge. Mutates and returns `target`.
 * Use when you have a `const` binding and need to update it in place
 * (e.g. the module-level `config` object in lib/config.js).
 */
function deepMergeInto(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (isMergeable(val) && isMergeable(target[key])) {
      deepMergeInto(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

module.exports = { deepMerge, deepMergeInto };
