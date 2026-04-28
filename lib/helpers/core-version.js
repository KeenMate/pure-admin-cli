// ---------------------------------------------------------------------------
// Detect the project's @keenmate/pure-admin-core version.
// ---------------------------------------------------------------------------
//
// Used by `themes install` / `themes update` to filter API resolution to theme
// versions compatible with the project's pure-admin-core (the CSS framework).
//
// Detection probes two manifest locations (in order):
//   1. <projectRoot>/package.json          — Svelte (sveltekit, spa, anything npm-rooted)
//   2. <projectRoot>/assets/package.json    — Phoenix LiveView (npm lives under assets/)
//
// In each manifest, looks for `@keenmate/pure-admin-core` in dependencies,
// devDependencies, then peerDependencies. For the manifest's containing
// directory, the resolved version (from `node_modules/@keenmate/pure-admin-
// core/package.json`) wins over the declared range, since the resolved value
// is what's actually being built against.
//
// Returns:
//   { version: "2.5.0", source: "<short description>" }   on success
//   { version: null, reason: "<short description>" }      on failure
//
// Failure is non-fatal — callers fall back to "no core_version filter" and
// warn the user.

const fs = require('fs');
const path = require('path');

const CORE_PACKAGE = '@keenmate/pure-admin-core';

function detectCoreVersion(projectRoot) {
  const root = projectRoot || process.cwd();
  const candidates = [
    { manifestDir: root, label: 'package.json' },
    { manifestDir: path.join(root, 'assets'), label: 'assets/package.json' },
  ];

  for (const { manifestDir, label } of candidates) {
    const manifestPath = path.join(manifestDir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      continue;
    }

    // Resolved version wins (most accurate — what the build actually uses).
    const resolvedPath = path.join(manifestDir, 'node_modules', CORE_PACKAGE, 'package.json');
    if (fs.existsSync(resolvedPath)) {
      try {
        const resolved = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
        if (resolved.version) {
          return { version: resolved.version, source: `${label} → node_modules` };
        }
      } catch {
        // Fall through to declared.
      }
    }

    // Declared range, stripped to a concrete version. Order: deps then dev
    // then peer (the wrapper svelte-pure-admin lists core as peerDependencies,
    // so peer is the most likely place for transitive Svelte projects).
    const declared =
      (manifest.dependencies && manifest.dependencies[CORE_PACKAGE]) ||
      (manifest.devDependencies && manifest.devDependencies[CORE_PACKAGE]) ||
      (manifest.peerDependencies && manifest.peerDependencies[CORE_PACKAGE]) ||
      null;

    if (declared) {
      const stripped = stripRangePrefix(declared);
      if (stripped) {
        return { version: stripped, source: `${label} (declared)` };
      }
      // Non-version specifier (e.g. "file:../core", "github:...", "latest").
      // Don't try to interpret these — leave version unresolved so we fall
      // back to no filter rather than passing nonsense to the API.
      return { version: null, reason: `${label} declares ${CORE_PACKAGE} as "${declared}" (not a version range)` };
    }
  }

  return { version: null, reason: `${CORE_PACKAGE} not found in package.json or assets/package.json` };
}

// Strip semver range prefixes to a concrete version. We don't try to resolve
// the range (that's the API's job once we send a concrete number); we just
// hand back a sensible lower-bound that the API can match themes against.
//
// Handles: "^2.5.0", "~2.5.0", ">=2.5.0", ">2.5.0", "=2.5.0", "2.5.0",
//          "2.5.x", "2.x", "*". Bails (returns null) on tags ("latest",
//          "next") and non-registry specifiers ("file:", "github:", "git+").
function stripRangePrefix(range) {
  if (typeof range !== 'string') return null;
  const trimmed = range.trim();
  if (!trimmed) return null;

  // Non-registry specifiers are not version ranges at all.
  if (/^(file:|link:|github:|git\+|https?:|workspace:)/i.test(trimmed)) return null;

  // Strip the well-known range operators. We don't care about the upper end
  // of a range like ">=1.0.0 <2.0.0" — for our use case (filter compatible
  // themes) the lower bound is the right signal.
  const m = trimmed.match(/^[\^~><=\s]*([0-9][^\s<>=]*)/);
  if (!m) return null;

  const version = m[1];
  // "x"/"*" wildcards: replace with 0 so the API gets a concrete number.
  // (e.g. "2.x" → "2.0", "2.5.x" → "2.5.0".) Some callers may want to skip
  // the filter entirely instead — they can check `version` for ".0" tails
  // if needed; we don't.
  return version.replace(/\.[xX*]/g, '.0').replace(/^[xX*]$/, '0');
}

module.exports = { detectCoreVersion, stripRangePrefix, CORE_PACKAGE };
