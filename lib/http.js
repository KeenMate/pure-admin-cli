// ---------------------------------------------------------------------------
// HTTP helpers
//
// BASE_URL is set by cli.js after resolveTarget() runs — single source of
// truth for "which server are we talking to". Kept on an object property so
// mutations are visible to everyone who imported the module.
// ---------------------------------------------------------------------------
const fs = require('fs');

// Defaults used when neither the config nor a per-call override sets a value.
// fetchTimeout covers fetchJson/fetchText; downloadTimeout covers downloadFile
// (larger because theme zips can be several hundred KB over a slow link).
const state = { BASE_URL: null, fetchTimeout: 10000, downloadTimeout: 30000 };

function requireBaseUrl() {
  if (!state.BASE_URL) {
    throw new Error('BASE_URL not set — setBaseUrl() must be called before any HTTP request (normally done by cli.js after resolveTarget).');
  }
  return state.BASE_URL;
}

function setTimeouts({ fetch, download } = {}) {
  if (Number.isFinite(fetch) && fetch > 0) state.fetchTimeout = fetch;
  if (Number.isFinite(download) && download > 0) state.downloadTimeout = download;
}

function httpClient() {
  return require(requireBaseUrl().startsWith('https') ? 'https' : 'http');
}

// Issue a GET and resolve with the response stream once the status check
// passes. Centralizes URL construction, timeout, status-code handling, and
// request-level error plumbing so each caller just consumes the body.
//
// Returns `null` when the server replies 304 and `allow304` is set (used by
// fetchJson for ETag-style caching). Otherwise resolves with the IncomingMessage.
function httpGet(urlPath, { timeout, allow304 = false } = {}) {
  const t = Number.isFinite(timeout) ? timeout : state.fetchTimeout;
  return new Promise((resolve, reject) => {
    const url = `${requireBaseUrl()}${urlPath}`;
    httpClient().get(url, { timeout: t }, (res) => {
      if (allow304 && res.statusCode === 304) return resolve(null);
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlPath}`));
      }
      resolve(res);
    }).on('error', reject);
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    res.on('error', reject);
  });
}

async function fetchJson(urlPath) {
  const res = await httpGet(urlPath, { allow304: true });
  if (res === null) return null;
  const body = await readBody(res);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Invalid JSON from ${urlPath}`);
  }
}

async function fetchText(urlPath) {
  const res = await httpGet(urlPath);
  return readBody(res);
}

async function downloadFile(urlPath, destPath) {
  const res = await httpGet(urlPath, { timeout: state.downloadTimeout });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    res.pipe(file);
    file.on('finish', () => { file.close(); resolve(); });
    file.on('error', reject);
  });
}

function getBaseUrl() {
  return state.BASE_URL;
}

function setBaseUrl(url) {
  state.BASE_URL = url;
}

module.exports = { httpClient, fetchJson, fetchText, downloadFile, getBaseUrl, setBaseUrl, setTimeouts };
