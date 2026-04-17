const { describe, it } = require('node:test');
const assert = require('node:assert');

const { bold, dim, cyan, green, yellow, red } = require('../lib/helpers/formatting');

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

  it('nesting preserves both attributes up to the first reset', () => {
    // bold(yellow("x")) → bold + yellow both active on "x"
    assert.strictEqual(bold(yellow('x')), '\x1b[1m\x1b[33mx\x1b[0m\x1b[0m');
  });

  it('inner reset kills outer color when concatenating styled strings', () => {
    // Documented gotcha: bold("a") emits \x1b[0m, which turns off the
    // surrounding yellow before "b" renders. "b" is plain, not yellow.
    const out = yellow(bold('a') + 'b');
    assert.strictEqual(out, '\x1b[33m\x1b[1ma\x1b[0mb\x1b[0m');
  });
});
