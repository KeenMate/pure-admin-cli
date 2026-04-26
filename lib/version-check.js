// ---------------------------------------------------------------------------
// Bidirectional CLI ↔ server version checking.
//
// The server advertises 4 headers on every API response:
//   X-Pureadmin-Server-Version  — server's own version
//   X-Pureadmin-Cli-Latest      — newest CLI on npm
//   X-Pureadmin-Cli-Min-Write   — floor for write ops (server enforces via 426)
//   X-Pureadmin-Cli-Max-Compat  — newest CLI version this server understands
//
// recordResponse() captures those, and HARD-FAILS (throws) if THIS CLI is
// newer than the server's max-compat — meaning the server is too old to talk
// to. The thrown error includes a friendly downgrade hint.
//
// printPendingNudge() runs once at end of command. If THIS CLI is older than
// the advertised latest, it prints a one-line nudge — throttled to once per
// 24h via a state file in ~/.pureadmin/.
// ---------------------------------------------------------------------------
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { yellow, dim, bold } = require('./helpers/formatting');
const { TOOL_VERSION } = require('./config');

const STATE_DIR = path.join(os.homedir(), '.pureadmin');
const STATE_FILE = path.join(STATE_DIR, '.last-update-check');
const THROTTLE_HOURS = 24;

// Last-seen advertise headers. Updated by recordResponse() on every API call.
// `null` until the first response arrives — printPendingNudge() then no-ops.
let lastAdvertise = null;

// Compare two semver-ish strings. Returns -1 if a<b, 0 if equal, 1 if a>b.
//
// Wildcard segments: an explicit `x` or `*` at position N matches any value
// at position N. So `compareVersions("1.2.5", "1.2.x") === 0` (within range),
// but `compareVersions("1.3.0", "1.2.x") === 1` (major.minor still compares).
// Lets the server advertise `max_compat: "1.2.x"` once and accept any 1.2.*
// CLI without per-patch config bumps.
//
// Also tolerates "1.2.0-rc1" by stripping the prerelease — the version-check
// is a coarse upgrade nudge, not a strict semver gate.
function compareVersions(a, b) {
  const norm = v => String(v || '0').split('-')[0]
    .split('.').map(p => (p === 'x' || p === '*') ? 'x' : (parseInt(p, 10) || 0));
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    // Wildcard on either side → segments from here are unconstrained, treat
    // as equal. Callers use `>=` / `>` / `<` so returning 0 here gives the
    // right semantics (e.g. CLI 1.2.5 vs max_compat "1.2.x" → not "newer
    // than max-compat").
    if (x === 'x' || y === 'x') return 0;
    const xn = x ?? 0;
    const yn = y ?? 0;
    if (xn < yn) return -1;
    if (xn > yn) return 1;
  }
  return 0;
}

function lowercaseHeaders(headers) {
  // Node's http.IncomingMessage.headers is already lowercased, but be defensive
  // so this also works with curl-parsed header dumps that may not be.
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

function extractAdvertise(headers) {
  const lc = lowercaseHeaders(headers);
  const adv = {
    serverVersion: lc['x-pureadmin-server-version'],
    cliLatest: lc['x-pureadmin-cli-latest'],
    cliMinWrite: lc['x-pureadmin-cli-min-write'],
    cliMaxCompat: lc['x-pureadmin-cli-max-compat'],
  };
  // If none of the four are present, the response wasn't from a version-aware
  // server (or a CDN stripped them) — return null so the caller skips updating.
  return Object.values(adv).some(Boolean) ? adv : null;
}

function formatServerTooOld(adv) {
  const sv = adv.serverVersion || 'unknown';
  return [
    `Server reports pureadmin.io v${sv}, but this CLI (${TOOL_VERSION}) is newer than the highest CLI it understands (${adv.cliMaxCompat}).`,
    `Either:`,
    `  - Update the pureadmin.io server, or`,
    `  - Install a CLI compatible with this server: npm i -g @keenmate/pureadmin@${adv.cliMaxCompat}`,
  ].join('\n  ');
}

// Called by http.js after every response and by the curl-upload paths in
// templates.js / theme-publish.js. Updates module state; throws if the server
// is too old for this CLI (the only hard fail this module emits — the soft
// nudge is deferred to printPendingNudge).
function recordResponse(headers) {
  const adv = extractAdvertise(headers);
  if (!adv) return;
  lastAdvertise = adv;

  if (adv.cliMaxCompat && compareVersions(TOOL_VERSION, adv.cliMaxCompat) > 0) {
    const err = new Error(formatServerTooOld(adv));
    err.serverTooOld = true;
    throw err;
  }
}

function shouldShowNudge() {
  try {
    if (!fs.existsSync(STATE_FILE)) return true;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    const lastShown = data.lastShown || 0;
    return Date.now() - lastShown > THROTTLE_HOURS * 3600 * 1000;
  } catch {
    return true;
  }
}

function recordNudgeShown() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastShown: Date.now() }) + '\n');
  } catch { /* best-effort — never block the user on a state-file failure */ }
}

// Print a one-line nudge if THIS CLI is older than the advertised latest.
// Throttled. Safe to call unconditionally at end of command.
function printPendingNudge() {
  if (!lastAdvertise || !lastAdvertise.cliLatest) return;
  if (compareVersions(TOOL_VERSION, lastAdvertise.cliLatest) >= 0) return;
  if (!shouldShowNudge()) return;
  console.log(
    `\n${yellow('▲')} A newer ${bold('pureadmin')} is available: ${TOOL_VERSION} ${dim('→')} ${yellow(lastAdvertise.cliLatest)}`
  );
  console.log(`  ${dim('Update:')} npm i -g @keenmate/pureadmin@latest`);
  recordNudgeShown();
}

function getCliVersion() {
  return TOOL_VERSION;
}

// Exposed for tests / curl-upload callers that want to inspect what the server
// said (e.g. to format a tailored 426 message).
function getLastAdvertise() {
  return lastAdvertise;
}

module.exports = {
  recordResponse,
  printPendingNudge,
  getCliVersion,
  getLastAdvertise,
  // Exported for tests; not part of public API.
  _compareVersions: compareVersions,
};
