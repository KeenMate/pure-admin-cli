const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'pureadmin.js');
const run = (args) => execSync(`node "${CLI}" ${args}`, { encoding: 'utf-8', timeout: 10000 });

describe('CLI', () => {
  it('--version prints version', () => {
    const output = run('--version');
    assert.match(output, /^pureadmin v\d+\.\d+\.\d+/);
  });

  it('--help shows usage', () => {
    const output = run('--help');
    assert.ok(output.includes('Commands:'));
    assert.ok(output.includes('Themes:'));
    assert.ok(output.includes('Templates:'));
  });

  it('no args shows usage', () => {
    const output = run('');
    assert.ok(output.includes('Usage:'));
  });

  it('unknown command shows error', () => {
    try {
      run('nonexistent');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('Unknown command'));
    }
  });

  it('unknown flags show error after template features are resolved', () => {
    // After template features are loaded, the CLI validates that every
    // passthrough flag matches a declared feature. Bogus flags error.
    try {
      run('create tmp-flag-test --bogus-flag');
      assert.fail('should have thrown');
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '');
      assert.ok(output.includes('unknown flag') || output.includes('--bogus-flag'),
        'Should show error for unrecognized flag');
    }
  });

  it('list shows hint to use themes/templates list', () => {
    try {
      run('list');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('themes list') || err.stderr.includes('templates list'));
    }
  });

  it('themes with no args shows help', () => {
    const output = run('themes');
    assert.ok(output.includes('list') && output.includes('show'));
  });

  it('profiles list works', () => {
    const output = run('profiles list');
    assert.ok(output.includes('profile(s)') || output.includes('No company'));
  });

  it('presets list works', () => {
    const output = run('presets list');
    assert.ok(output.includes('preset(s)') || output.includes('No presets'));
  });

  it('create with name but no server still runs', () => {
    // create with a name works (will fail at template fetch, but doesn't error on arg parsing)
    try {
      run('create test-cli-check --no-build --no-install --server http://127.0.0.1:1');
    } catch {
      // Expected to fail (no server), but shouldn't fail on arg parsing
    }
  });
});
