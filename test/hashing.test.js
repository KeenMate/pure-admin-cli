const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { sha256File, sha256String } = require('../lib/helpers/hashing');

describe('sha256String', () => {
  it('returns sha256: prefixed hash', () => {
    const result = sha256String('hello');
    assert.match(result, /^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    assert.strictEqual(sha256String('test'), sha256String('test'));
  });

  it('different inputs produce different hashes', () => {
    assert.notStrictEqual(sha256String('a'), sha256String('b'));
  });
});

describe('sha256File', () => {
  it('hashes a real file', () => {
    const result = sha256File(path.join(__dirname, '..', 'package.json'));
    assert.match(result, /^sha256:[a-f0-9]{64}$/);
  });
});
