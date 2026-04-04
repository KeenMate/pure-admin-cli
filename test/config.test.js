const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { tryLoadJson, TOOL_VERSION, TOOL_NAME } = require('../lib/config');

describe('config', () => {
  it('TOOL_VERSION matches package.json', () => {
    const pkg = require('../package.json');
    assert.strictEqual(TOOL_VERSION, pkg.version);
  });

  it('TOOL_NAME is pureadmin', () => {
    assert.strictEqual(TOOL_NAME, 'pureadmin');
  });

  it('tryLoadJson returns parsed JSON for valid file', () => {
    const result = tryLoadJson(path.join(__dirname, '..', 'package.json'));
    assert.strictEqual(result.name, '@keenmate/pureadmin');
  });

  it('tryLoadJson returns null for missing file', () => {
    const result = tryLoadJson('/nonexistent/path.json');
    assert.strictEqual(result, null);
  });
});
