const { describe, it } = require('node:test');
const assert = require('node:assert');

const { recordResponse, getCliVersion, _compareVersions } = require('../lib/version-check');
const { parseCurlIncluded } = require('../lib/helpers/upload');

describe('version-check._compareVersions', () => {
  it('orders simple semvers', () => {
    assert.strictEqual(_compareVersions('1.0.0', '1.0.0'), 0);
    assert.strictEqual(_compareVersions('1.0.0', '1.0.1'), -1);
    assert.strictEqual(_compareVersions('1.0.1', '1.0.0'), 1);
    assert.strictEqual(_compareVersions('1.2.0', '1.10.0'), -1);
  });

  it('treats x as 0 for compat ranges', () => {
    assert.strictEqual(_compareVersions('1.2.0', '1.2.x'), 0);
    assert.strictEqual(_compareVersions('1.3.0', '1.2.x'), 1);
  });

  it('strips prerelease for comparison', () => {
    assert.strictEqual(_compareVersions('1.0.0-rc1', '1.0.0'), 0);
  });

  it('treats missing/garbage as 0', () => {
    assert.strictEqual(_compareVersions('', '0.0.0'), 0);
    assert.strictEqual(_compareVersions(undefined, '0.0.0'), 0);
  });
});

describe('version-check.recordResponse', () => {
  it('no-ops when no advertise headers are present', () => {
    // Should not throw, should not change state
    assert.doesNotThrow(() => recordResponse({ 'content-type': 'text/plain' }));
  });

  it('throws serverTooOld when CLI version > server max-compat', () => {
    // CLI is at whatever package.json says; pin synthetic max-compat to 0.0.1
    // so any real CLI version triggers the check.
    let caught;
    try {
      recordResponse({
        'x-pureadmin-server-version': '0.0.5',
        'x-pureadmin-cli-latest': '0.0.1',
        'x-pureadmin-cli-min-write': '0.0.1',
        'x-pureadmin-cli-max-compat': '0.0.1',
      });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'expected serverTooOld throw');
    assert.strictEqual(caught.serverTooOld, true);
    assert.match(caught.message, /Server reports pureadmin\.io v0\.0\.5/);
    assert.match(caught.message, /Install a CLI compatible with this server/);
  });

  it('does not throw when CLI is at or below max-compat', () => {
    // Use a max-compat that's well above any plausible CLI version.
    assert.doesNotThrow(() =>
      recordResponse({
        'x-pureadmin-server-version': '999.0.0',
        'x-pureadmin-cli-latest': '999.0.0',
        'x-pureadmin-cli-min-write': '999.0.0',
        'x-pureadmin-cli-max-compat': '999.0.0',
      })
    );
  });
});

describe('version-check.getCliVersion', () => {
  it('returns a non-empty version string from package.json', () => {
    const v = getCliVersion();
    assert.ok(typeof v === 'string' && v.length > 0);
    assert.match(v, /^\d+\.\d+/);
  });
});

describe('upload.parseCurlIncluded', () => {
  it('parses status line, headers, and body from curl -i output', () => {
    const raw =
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      'X-Pureadmin-Server-Version: 0.1.0\r\n' +
      '\r\n' +
      '{"status":"updated"}';
    const { status, headers, body } = parseCurlIncluded(raw);
    assert.strictEqual(status, 200);
    assert.strictEqual(headers['content-type'], 'application/json');
    assert.strictEqual(headers['x-pureadmin-server-version'], '0.1.0');
    assert.strictEqual(body, '{"status":"updated"}');
  });

  it('parses 426 with structured error body', () => {
    const raw =
      'HTTP/1.1 426 Upgrade Required\r\n' +
      'Content-Type: application/json\r\n' +
      '\r\n' +
      '{"error":"cli_too_old","message":"upgrade pls"}';
    const { status, body } = parseCurlIncluded(raw);
    assert.strictEqual(status, 426);
    assert.deepStrictEqual(JSON.parse(body), { error: 'cli_too_old', message: 'upgrade pls' });
  });

  it('tolerates LF-only line endings', () => {
    const raw = 'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello';
    const { status, headers, body } = parseCurlIncluded(raw);
    assert.strictEqual(status, 200);
    assert.strictEqual(headers['content-type'], 'text/plain');
    assert.strictEqual(body, 'hello');
  });

  it('returns status 0 + raw body when no blank-line separator', () => {
    const { status, body } = parseCurlIncluded('garbled output');
    assert.strictEqual(status, 0);
    assert.strictEqual(body, 'garbled output');
  });
});
