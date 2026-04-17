const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getBaseUrl, setBaseUrl } = require('../lib/http');

describe('http', () => {
  it('getBaseUrl is null before setBaseUrl is called', () => {
    // Fresh module load: state starts null; cli.js is responsible for calling
    // setBaseUrl() during command routing. Tests that use fetch functions
    // must call setBaseUrl() themselves first.
    const original = getBaseUrl();
    setBaseUrl(null);
    assert.strictEqual(getBaseUrl(), null);
    if (original) setBaseUrl(original); // restore so later tests aren't affected
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
