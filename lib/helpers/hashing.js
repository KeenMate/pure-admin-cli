// ---------------------------------------------------------------------------
// SHA-256 helpers — return strings prefixed with "sha256:" so output slots
// directly into manifests (theme.json, template.json, server integrity checks).
// ---------------------------------------------------------------------------
const fs = require('fs');
const crypto = require('crypto');

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function sha256String(content) {
  return `sha256:${crypto.createHash('sha256').update(content, 'utf-8').digest('hex')}`;
}

module.exports = { sha256File, sha256String };
