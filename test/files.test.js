const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { copyDirSync, deepMerge, sha256File, sha256String } = require('../lib/files');

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

describe('deepMerge', () => {
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

  it('returns merged result', () => {
    const target = { a: 1 };
    const result = deepMerge(target, { b: 2 });
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);
  });
});

describe('copyDirSync', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pureadmin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies files recursively', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'world');

    copyDirSync(src, dest);

    assert.strictEqual(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8'), 'hello');
    assert.strictEqual(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf-8'), 'world');
  });

  it('respects exclude list', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(path.join(src, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'keep');
    fs.writeFileSync(path.join(src, 'node_modules', 'b.txt'), 'skip');

    copyDirSync(src, dest, ['node_modules']);

    assert.ok(fs.existsSync(path.join(dest, 'a.txt')));
    assert.ok(!fs.existsSync(path.join(dest, 'node_modules')));
  });
});
