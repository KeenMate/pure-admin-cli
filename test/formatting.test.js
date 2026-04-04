const { describe, it } = require('node:test');
const assert = require('node:assert');

const { bold, dim, cyan, green, yellow, red } = require('../lib/formatting');

describe('formatting', () => {
  it('bold wraps text in ANSI bold', () => {
    assert.strictEqual(bold('hello'), '\x1b[1mhello\x1b[0m');
  });

  it('dim wraps text in ANSI dim', () => {
    assert.strictEqual(dim('hello'), '\x1b[2mhello\x1b[0m');
  });

  it('green wraps text in ANSI green', () => {
    assert.strictEqual(green('ok'), '\x1b[32mok\x1b[0m');
  });

  it('yellow wraps text in ANSI yellow', () => {
    assert.strictEqual(yellow('warn'), '\x1b[33mwarn\x1b[0m');
  });

  it('red wraps text in ANSI red', () => {
    assert.strictEqual(red('err'), '\x1b[31merr\x1b[0m');
  });

  it('cyan wraps text in ANSI cyan', () => {
    assert.strictEqual(cyan('info'), '\x1b[36minfo\x1b[0m');
  });
});
