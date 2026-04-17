const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { copyDirSync, setExtractor } = require('../lib/helpers/files');

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

describe('setExtractor', () => {
  it('accepts all valid names', () => {
    for (const name of ['auto', 'unzip', 'tar', '7zip', '7z']) {
      assert.doesNotThrow(() => setExtractor(name));
    }
    setExtractor('auto'); // restore default for other tests
  });

  it('throws on unknown name with list of valid options', () => {
    assert.throws(() => setExtractor('winzip'), /Unknown extractor "winzip"\. Valid: auto, unzip, tar, 7zip, 7z/);
  });

  it('ignores falsy values (no-op)', () => {
    // cli.js passes config.extractor which is undefined when unset — must not throw
    assert.doesNotThrow(() => setExtractor(undefined));
    assert.doesNotThrow(() => setExtractor(null));
    assert.doesNotThrow(() => setExtractor(''));
  });
});
