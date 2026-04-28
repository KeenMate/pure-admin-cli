const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  tryLoadJson,
  loadProjectConfig,
  saveBaseConfig,
  saveLocalConfig,
  saveLockData,
  TOOL_VERSION,
  TOOL_NAME,
} = require('../lib/config');

describe('config', () => {
  it('TOOL_VERSION matches package.json', () => {
    const pkg = require('../package.json');
    assert.strictEqual(TOOL_VERSION, pkg.version);
  });

  it('TOOL_NAME is pureadmin', () => {
    assert.strictEqual(TOOL_NAME, 'pureadmin');
  });

  it('tryLoadJson returns parsed JSON for valid file', () => {
    const result = tryLoadJson(path.join(__dirname, '..', 'package.json'));
    assert.strictEqual(result.name, '@keenmate/pureadmin');
  });

  it('tryLoadJson returns null for missing file', () => {
    const result = tryLoadJson('/nonexistent/path.json');
    assert.strictEqual(result, null);
  });
});

// Helper for the file-fixture tests below.
function withTempProject(layout, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cfg-'));
  const cwd = process.cwd();
  try {
    for (const [name, content] of Object.entries(layout)) {
      fs.writeFileSync(path.join(tmp, name), JSON.stringify(content));
    }
    process.chdir(tmp);
    return fn(tmp);
  } finally {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Regression: bare-string theme entries in .pureadmin.json (legacy attempt at
// local-path themes) used to silently corrupt pureadmin.json. The chain was:
//   1. .pureadmin.json: { themes: { audi: "../path" } }   (string)
//   2. pureadmin.json:  { themes: { audi: { ... } } }
//   3. loadProjectConfig deep-merged → audi became the string (overwrote)
//   4. cmdUpdate did { ...info, version, ... } where info was a string
//      → string spread into char-indexed keys: { "0": ".", "1": ".", ... }
//   5. saveProjectConfig wrote that mess back to pureadmin.json.
//
// Fix: loadProjectConfig auto-promotes string theme entries to { path: <s> }
// in BOTH base and local data, matching the --path feature shape.
describe('loadProjectConfig — string theme entry promotion', () => {
  it('normalizes a string theme entry in .pureadmin.json to { path } in localData', () => {
    withTempProject({
      'pureadmin.json': { themes: { audi: { offline: false } } },
      '.pureadmin.json': { themes: { audi: '../pure-admin-themes/audi' } },
    }, () => {
      const proj = loadProjectConfig();
      const localAudi = proj.localData.themes.audi;
      assert.strictEqual(typeof localAudi, 'object', 'string entry must be promoted to an object');
      assert.ok(localAudi !== null, 'entry must not be null');
      assert.strictEqual(localAudi.path, '../pure-admin-themes/audi');
      // Corruption signature: spreading a string yields {0:".",1:".",...}.
      assert.strictEqual(localAudi['0'], undefined, 'no character-index keys (corruption signature)');
    });
  });

  it('merged themes view exposes the promoted path with provenance', () => {
    withTempProject({
      'pureadmin.json': { themes: { audi: { offline: false } } },
      '.pureadmin.json': { themes: { audi: '../pure-admin-themes/audi' } },
    }, () => {
      const proj = loadProjectConfig();
      const audi = proj.themes.audi;
      assert.strictEqual(audi.path, '../pure-admin-themes/audi');
      assert.strictEqual(audi.offline, false);
      assert.deepStrictEqual(audi._layers, { base: true, local: true, lock: false });
    });
  });
});

// The whole point of the lockfile split: a developer's local override in
// .pureadmin.json must never leak into the shared pureadmin.json, even after
// `themes update` resolves new versions and persists them.
describe('layered save routing', () => {
  it('saveBaseConfig writes only baseData (local override does not leak in)', () => {
    withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { audi: {} } },
      '.pureadmin.json': { themes: { audi: { path: '../pure-admin-themes/audi' } } },
    }, (tmp) => {
      const proj = loadProjectConfig();
      // Sanity: merged view sees the override
      assert.strictEqual(proj.themes.audi.path, '../pure-admin-themes/audi');
      // Save base — should NOT pick up the local path
      saveBaseConfig(proj.baseFile, proj.baseData);
      const baseOnDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'pureadmin.json'), 'utf-8'));
      assert.deepStrictEqual(baseOnDisk.themes.audi, {},
        'pureadmin.json must NOT contain the local override .path');
    });
  });

  it('saveLockData writes resolved fields (version, content_sha) only into the lockfile', () => {
    withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { audi: {} } },
    }, (tmp) => {
      const proj = loadProjectConfig();
      proj.lockData.themes = {
        audi: {
          version: '2.3.5',
          content_sha: 'sha256:xyz',
          fetched_at: '2026-04-28T00:00:00.000Z',
          source: 'remote',
        },
      };
      saveLockData(proj.lockFile, proj.lockData);

      const baseOnDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'pureadmin.json'), 'utf-8'));
      const lockOnDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8'));

      // Base file is untouched (no version, no content_sha)
      assert.deepStrictEqual(baseOnDisk.themes.audi, {});
      // Lockfile carries the resolved metadata
      assert.strictEqual(lockOnDisk.themes.audi.version, '2.3.5');
      assert.strictEqual(lockOnDisk.themes.audi.content_sha, 'sha256:xyz');
      assert.strictEqual(lockOnDisk._format, 1, 'lockfile carries the format version');
    });
  });

  it('saveLocalConfig is a no-op when localData is empty', () => {
    withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: {} },
    }, (tmp) => {
      const localPath = path.join(tmp, '.pureadmin.json');
      saveLocalConfig(localPath, {});
      assert.strictEqual(fs.existsSync(localPath), false,
        'empty localData should not create .pureadmin.json');
    });
  });

  it('lockfile entries are sorted by slug for stable diffs', () => {
    withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { z: {}, a: {}, m: {} } },
    }, (tmp) => {
      const proj = loadProjectConfig();
      proj.lockData.themes = {
        z: { version: '1.0.0', source: 'remote' },
        a: { version: '1.0.0', source: 'remote' },
        m: { version: '1.0.0', source: 'remote' },
      };
      saveLockData(proj.lockFile, proj.lockData);
      const onDisk = fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8');
      // The first slug-line in the themes block must be "a", then "m", then "z"
      const themesIdx = onDisk.indexOf('"themes"');
      const tail = onDisk.slice(themesIdx);
      const aIdx = tail.indexOf('"a"');
      const mIdx = tail.indexOf('"m"');
      const zIdx = tail.indexOf('"z"');
      assert.ok(aIdx < mIdx && mIdx < zIdx, `expected slugs sorted alphabetically; got order a=${aIdx} m=${mIdx} z=${zIdx}`);
    });
  });
});
