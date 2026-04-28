const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectCoreVersion, stripRangePrefix } = require('../lib/helpers/core-version');

function withTempProject(layout, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-corever-'));
  try {
    for (const [relPath, content] of Object.entries(layout)) {
      const full = path.join(tmp, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
    }
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('stripRangePrefix', () => {
  it('strips caret', () => assert.strictEqual(stripRangePrefix('^2.5.0'), '2.5.0'));
  it('strips tilde', () => assert.strictEqual(stripRangePrefix('~2.5.0'), '2.5.0'));
  it('strips >=', () => assert.strictEqual(stripRangePrefix('>=2.5.0'), '2.5.0'));
  it('strips =', () => assert.strictEqual(stripRangePrefix('=2.5.0'), '2.5.0'));
  it('passes plain version through', () => assert.strictEqual(stripRangePrefix('2.5.0'), '2.5.0'));
  it('handles 2.x wildcard', () => assert.strictEqual(stripRangePrefix('2.x'), '2.0'));
  it('handles 2.5.x wildcard', () => assert.strictEqual(stripRangePrefix('2.5.x'), '2.5.0'));
  it('returns null for "latest" tag', () => assert.strictEqual(stripRangePrefix('latest'), null));
  it('returns null for "next" tag', () => assert.strictEqual(stripRangePrefix('next'), null));
  it('returns null for file: specifier', () => assert.strictEqual(stripRangePrefix('file:../core'), null));
  it('returns null for github: specifier', () => assert.strictEqual(stripRangePrefix('github:org/repo'), null));
  it('returns null for git+ specifier', () => assert.strictEqual(stripRangePrefix('git+https://x.git'), null));
  it('returns null for *', () => assert.strictEqual(stripRangePrefix('*'), null));
  it('returns null for empty', () => assert.strictEqual(stripRangePrefix(''), null));
  it('returns null for non-string', () => assert.strictEqual(stripRangePrefix(null), null));
});

describe('detectCoreVersion', () => {
  it('prefers resolved version from node_modules over declared range', () => {
    withTempProject({
      'package.json': { dependencies: { '@keenmate/pure-admin-core': '^2.5.0' } },
      'node_modules/@keenmate/pure-admin-core/package.json': { name: '@keenmate/pure-admin-core', version: '2.5.3' },
    }, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, '2.5.3');
      assert.match(result.source, /node_modules/);
    });
  });

  it('falls back to declared dependencies range', () => {
    withTempProject({
      'package.json': { dependencies: { '@keenmate/pure-admin-core': '~2.4.1' } },
    }, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, '2.4.1');
      assert.match(result.source, /declared/);
    });
  });

  it('finds declaration in devDependencies', () => {
    withTempProject({
      'package.json': { devDependencies: { '@keenmate/pure-admin-core': '^2.0.0' } },
    }, (root) => {
      assert.strictEqual(detectCoreVersion(root).version, '2.0.0');
    });
  });

  it('finds declaration in peerDependencies', () => {
    withTempProject({
      'package.json': { peerDependencies: { '@keenmate/pure-admin-core': '^2.5.0' } },
    }, (root) => {
      assert.strictEqual(detectCoreVersion(root).version, '2.5.0');
    });
  });

  it('probes assets/package.json for Phoenix layout', () => {
    withTempProject({
      'assets/package.json': { dependencies: { '@keenmate/pure-admin-core': '^2.5.0' } },
    }, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, '2.5.0');
      assert.match(result.source, /assets\/package\.json/);
    });
  });

  it('returns null + reason when core is not declared', () => {
    withTempProject({
      'package.json': { name: 'someproject', dependencies: { svelte: '^5.0.0' } },
    }, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, null);
      assert.match(result.reason, /not found/);
    });
  });

  it('returns null + reason for non-version specifier (latest)', () => {
    withTempProject({
      'package.json': { dependencies: { '@keenmate/pure-admin-core': 'latest' } },
    }, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, null);
      assert.match(result.reason, /not a version range/);
    });
  });

  it('returns null + reason for file: specifier', () => {
    withTempProject({
      'package.json': { dependencies: { '@keenmate/pure-admin-core': 'file:../core' } },
    }, (root) => {
      assert.strictEqual(detectCoreVersion(root).version, null);
    });
  });

  it('returns null + reason for completely empty project', () => {
    withTempProject({}, (root) => {
      const result = detectCoreVersion(root);
      assert.strictEqual(result.version, null);
    });
  });

  it('root package.json wins over assets/package.json', () => {
    // If the root has a usable manifest, we don't fall through to assets.
    // (Resolution priority is 'first match', not 'most specific'.)
    withTempProject({
      'package.json': { dependencies: { '@keenmate/pure-admin-core': '^3.0.0' } },
      'assets/package.json': { dependencies: { '@keenmate/pure-admin-core': '^2.0.0' } },
    }, (root) => {
      assert.strictEqual(detectCoreVersion(root).version, '3.0.0');
    });
  });
});
