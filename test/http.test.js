const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getBaseUrl, setBaseUrl } = require('../lib/http');

describe('http', () => {
  it('getBaseUrl returns default URL', () => {
    const url = getBaseUrl();
    assert.ok(url.startsWith('http'));
  });

  it('setBaseUrl changes the base URL', () => {
    const original = getBaseUrl();
    setBaseUrl('http://test.example.com');
    assert.strictEqual(getBaseUrl(), 'http://test.example.com');
    setBaseUrl(original); // restore
  });

  it('setBaseUrl stores the URL as-is', () => {
    const original = getBaseUrl();
    setBaseUrl('http://example.com');
    assert.strictEqual(getBaseUrl(), 'http://example.com');
    setBaseUrl(original); // restore
  });
});
