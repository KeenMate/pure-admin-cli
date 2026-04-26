// ---------------------------------------------------------------------------
// Curl-based multipart upload, shared by `themes publish` and
// `templates publish`. We shell out to curl (rather than use Node's https)
// so that multipart streaming, retries, and progress are handled by an
// existing well-tested binary instead of reinventing them.
//
// Differs from earlier `curl -sf` usage in two important ways:
//
//   1. Sends X-Pureadmin-Cli-Version on the request so the server can
//      gate writes on minimum-version compliance (and return 426).
//   2. Uses `-i` to include response headers in stdout, and drops `-f`
//      so the body comes back even on 4xx/5xx. This lets the caller
//      distinguish 200/unchanged/426/other and surface the server's
//      error message — the previous behavior swallowed everything.
// ---------------------------------------------------------------------------
'use strict';

const { execSync } = require('child_process');
const versionCheck = require('../version-check');

// Parse `curl -i` output: HTTP status line, headers, blank line, body.
// Tolerates \r\n and bare \n line endings (Windows curl + Unix curl).
function parseCurlIncluded(raw) {
  // Split on the first blank line — that separates headers from body.
  // Use a regex that matches either CRLFCRLF or LFLF.
  const splitMatch = raw.match(/\r?\n\r?\n/);
  if (!splitMatch) {
    // No blank line — treat the whole thing as body, no headers/status.
    return { status: 0, headers: {}, body: raw };
  }
  const headerBlock = raw.slice(0, splitMatch.index);
  const body = raw.slice(splitMatch.index + splitMatch[0].length);

  const lines = headerBlock.split(/\r?\n/);
  const statusLine = lines.shift() || '';
  const statusMatch = statusLine.match(/^HTTP\/[\d.]+\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = value;
  }
  return { status, headers, body };
}

// Run a multipart POST and return { status, headers, body }.
// Always succeeds at the curl level (no `-f`) — caller checks `status`.
// Calls versionCheck.recordResponse on the parsed headers, which may throw
// if the server is too old for this CLI (the only hard fail this helper
// re-emits — every other status code is reported via `status`).
function curlUpload({ url, apiKey, fieldName, filePath }) {
  const cmd = [
    'curl', '-s', '-i', '-X', 'POST',
    `"${url}"`,
    '-H', `"Authorization: Bearer ${apiKey}"`,
    '-H', `"X-Pureadmin-Cli-Version: ${versionCheck.getCliVersion()}"`,
    '-F', `"${fieldName}=@${filePath}"`,
  ].join(' ');

  const raw = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  const parsed = parseCurlIncluded(raw);
  // recordResponse may throw serverTooOld — bubble it up unchanged.
  versionCheck.recordResponse(parsed.headers);
  return parsed;
}

module.exports = { curlUpload, parseCurlIncluded };
