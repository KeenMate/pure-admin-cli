const { describe, it } = require('node:test');
const assert = require('node:assert');

const { deepMerge, deepMergeInto } = require('../lib/helpers/objects');

describe('deepMerge (immutable)', () => {
  it('merges flat objects', () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  it('overwrites scalar values', () => {
    const result = deepMerge({ a: 1 }, { a: 2 });
    assert.deepStrictEqual(result, { a: 2 });
  });

  it('deep merges nested objects', () => {
    const result = deepMerge(
      { a: { x: 1, y: 2 } },
      { a: { y: 3, z: 4 } }
    );
    assert.deepStrictEqual(result, { a: { x: 1, y: 3, z: 4 } });
  });

  it('arrays are replaced, not concatenated', () => {
    const result = deepMerge({ a: [1, 2, 3] }, { a: [4, 5] });
    assert.deepStrictEqual(result, { a: [4, 5] });
  });

  it('does not mutate the target', () => {
    const target = { a: 1, nested: { x: 1 } };
    const snapshot = JSON.parse(JSON.stringify(target));
    deepMerge(target, { b: 2, nested: { y: 2 } });
    assert.deepStrictEqual(target, snapshot);
  });
});

describe('deepMergeInto (mutating)', () => {
  it('mutates the target and returns it', () => {
    const target = { a: 1 };
    const result = deepMergeInto(target, { b: 2 });
    assert.strictEqual(result, target);
    assert.deepStrictEqual(target, { a: 1, b: 2 });
  });

  it('deep merges nested objects into target', () => {
    const target = { a: { x: 1 } };
    deepMergeInto(target, { a: { y: 2 } });
    assert.deepStrictEqual(target, { a: { x: 1, y: 2 } });
  });

  it('arrays replace, not concatenate', () => {
    const target = { tags: ['a'] };
    deepMergeInto(target, { tags: ['b', 'c'] });
    assert.deepStrictEqual(target, { tags: ['b', 'c'] });
  });
});
