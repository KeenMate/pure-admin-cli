// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const fs = require('fs');
const { config } = require('./config');

// BASE_URL is mutable — can be overridden by --server flag
// Stored as object property so mutations are visible to all importers
const state = {
  BASE_URL: process.env.PUREADMIN_URL
    ? process.env.PUREADMIN_URL.replace(/\/api\/.*$/, '')
    : (config.url || 'https://pureadmin.io').replace(/\/+$/, ''),
};

function httpClient() {
  return require(state.BASE_URL.startsWith('https') ? 'https' : 'http');
}

function fetchJson(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${state.BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 304) return resolve(null);
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlPath}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${urlPath}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchText(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${state.BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${urlPath}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadFile(urlPath, destPath) {
  return new Promise((resolve, reject) => {
    const url = `${state.BASE_URL}${urlPath}`;
    httpClient().get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

function getBaseUrl() {
  return state.BASE_URL;
}

function setBaseUrl(url) {
  state.BASE_URL = url;
}

module.exports = { httpClient, fetchJson, fetchText, downloadFile, getBaseUrl, setBaseUrl };
