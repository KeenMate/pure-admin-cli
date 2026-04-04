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
    assert.ok(output.includes('Theme commands:'));
    assert.ok(output.includes('Template commands:'));
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

  it('unknown flag shows error with known flags list', () => {
    try {
      run('create test --bogus-flag');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('unknown flag'));
      assert.ok(err.stderr.includes('Known flags'));
    }
  });

  it('list command is recognized', () => {
    // Will fail to reach server but should not error on command parsing
    const output = run('list --server http://127.0.0.1:1');
    assert.ok(output.includes('Templates:'));
  });

  it('themes with no args shows configured themes', () => {
    const output = run('themes');
    assert.ok(output.includes('No themes configured') || output.includes('theme(s) configured'));
  });

  it('create without name shows error', () => {
    try {
      run('create');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('requires'));
    }
  });
});
