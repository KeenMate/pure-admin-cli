// Regression tests for the v1.3.1 lock-mirrors-base invariant.
//
// The bug: in v1.3.0 a developer's `.pureadmin.json` path override leaked
// into the shared `pureadmin.lock.json` because `themes install` / `update` /
// `add --path` consulted the merged view (base ⊕ local) when computing
// what to write to the lock. Once committed, the leaked lock pointed at
// a filesystem path that only existed on that one developer's machine,
// breaking CI and Docker builds for everyone else.
//
// Invariant the v1.3.1 fix enforces:
//
//   pureadmin.lock.json mirrors pureadmin.json exclusively.
//   .pureadmin.json overrides are runtime overlays only — they affect
//   what files end up on disk, but they NEVER cause a lock write.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadProjectConfig } = require('../lib/config');
const { cmdThemesAdd, cmdInstall } = require('../lib/commands/themes');

async function withTempProject(layout, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-themes-'));
  const cwd = process.cwd();
  try {
    for (const [name, content] of Object.entries(layout)) {
      const p = path.join(tmp, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
    }
    process.chdir(tmp);
    return await fn(tmp);
  } finally {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('loadProjectConfig — .pureadmin.json never hoists into lock', () => {
  it('legacy inline version in .pureadmin.json is stripped, not migrated to the lockfile', () => {
    withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { audi: {} } },
      '.pureadmin.json': {
        themes: {
          audi: {
            path: '../pure-admin-themes/audi',
            // Legacy fields that pre-1.3.1 install/update would have written.
            version: '2.3.0',
            content_sha: 'sha256:legacy',
            fetched_at: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    }, () => {
      const proj = loadProjectConfig();
      // The lock must not contain audi: a personal override never produces
      // a lock entry.
      assert.strictEqual(
        proj.lockData.themes && proj.lockData.themes.audi,
        undefined,
        '.pureadmin.json inline fields must not be hoisted into the lock',
      );
      // The legacy resolved fields are stripped from localData in memory so
      // a subsequent saveLocalConfig writes a clean overlay.
      assert.strictEqual(proj.localData.themes.audi.version, undefined);
      assert.strictEqual(proj.localData.themes.audi.content_sha, undefined);
      assert.strictEqual(proj.localData.themes.audi.fetched_at, undefined);
      // Declaration fields stay.
      assert.strictEqual(proj.localData.themes.audi.path, '../pure-admin-themes/audi');
    });
  });

  it('legacy inline version in pureadmin.json IS hoisted to lock (base layer still migrates)', () => {
    withTempProject({
      'pureadmin.json': {
        themesDir: 'static/themes',
        themes: {
          audi: { version: '2.3.5', content_sha: 'sha256:abc' },
        },
      },
    }, () => {
      const proj = loadProjectConfig();
      assert.strictEqual(proj.lockData.themes.audi.version, '2.3.5');
      assert.strictEqual(proj.lockData.themes.audi.content_sha, 'sha256:abc');
      assert.strictEqual(proj.lockData.themes.audi.source, 'remote');
      // The inline fields are stripped from baseData in memory.
      assert.strictEqual(proj.baseData.themes.audi.version, undefined);
      assert.strictEqual(proj.baseData.themes.audi.content_sha, undefined);
    });
  });
});

describe('cmdThemesAdd --path — personal override does not write the lock', () => {
  it('default mode (writes to .pureadmin.json) leaves pureadmin.lock.json untouched', async () => {
    await withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { audi: {} } },
      'pureadmin.lock.json': {
        _format: 1,
        themes: {
          audi: {
            version: '2.3.5',
            content_sha: 'sha256:registry',
            fetched_at: '2026-04-01T00:00:00.000Z',
            source: 'remote',
          },
        },
      },
      // Local theme source: a sibling-like dir with a valid theme.json.
      'fake-theme/theme.json': { id: 'audi', name: 'Audi', version: '2.4.0-dev' },
      'fake-theme/theme.scss': '/* dev iteration */',
    }, async (tmp) => {
      const lockBefore = fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8');

      // Quietly capture stdout so the test output isn't noisy.
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true;
      const origLog = console.log;
      console.log = () => {};
      try {
        await cmdThemesAdd([], { path: './fake-theme' });
      } finally {
        process.stdout.write = origWrite;
        console.log = origLog;
      }

      const lockAfter = fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8');
      assert.strictEqual(
        lockAfter,
        lockBefore,
        'pureadmin.lock.json must be byte-identical after `themes add --path` (default mode)',
      );

      // .pureadmin.json should now declare the override.
      const local = JSON.parse(fs.readFileSync(path.join(tmp, '.pureadmin.json'), 'utf-8'));
      assert.strictEqual(local.themes.audi.path, './fake-theme');
      // No version field leaked into the override either.
      assert.strictEqual(local.themes.audi.version, undefined);
    });
  });

  it('--shared mode (writes to pureadmin.json) DOES write the lock', async () => {
    await withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: {} },
      'shared-theme/theme.json': { id: 'corporate', name: 'Corporate', version: '1.5.0' },
      'shared-theme/theme.scss': '/* shared local theme */',
    }, async (tmp) => {
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true;
      const origLog = console.log;
      console.log = () => {};
      try {
        await cmdThemesAdd([], { path: './shared-theme', shared: true });
      } finally {
        process.stdout.write = origWrite;
        console.log = origLog;
      }

      const base = JSON.parse(fs.readFileSync(path.join(tmp, 'pureadmin.json'), 'utf-8'));
      const lock = JSON.parse(fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8'));

      assert.strictEqual(base.themes.corporate.path, './shared-theme');
      assert.strictEqual(lock.themes.corporate.source, './shared-theme');
      assert.strictEqual(lock.themes.corporate.version, '1.5.0');
    });
  });
});

describe('cmdInstall — .pureadmin.json override never writes the lock', () => {
  it('override on top of valid registry lock entry installs from path, lock unchanged', async () => {
    await withTempProject({
      'pureadmin.json': { themesDir: 'static/themes', themes: { audi: {} } },
      'pureadmin.lock.json': {
        _format: 1,
        themes: {
          audi: {
            version: '2.3.5',
            content_sha: 'sha256:registry',
            fetched_at: '2026-04-01T00:00:00.000Z',
            source: 'remote',
          },
        },
      },
      '.pureadmin.json': { themes: { audi: { path: './fake-theme' } } },
      'fake-theme/theme.json': { id: 'audi', name: 'Audi', version: '2.4.0-dev' },
      'fake-theme/theme.scss': '/* dev iteration */',
    }, async (tmp) => {
      const lockBefore = fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8');

      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true;
      const origLog = console.log;
      console.log = () => {};
      try {
        await cmdInstall();
      } finally {
        process.stdout.write = origWrite;
        console.log = origLog;
      }

      const lockAfter = fs.readFileSync(path.join(tmp, 'pureadmin.lock.json'), 'utf-8');
      assert.strictEqual(
        lockAfter,
        lockBefore,
        'pureadmin.lock.json must be byte-identical after install when override sits on top of a valid registry lock entry',
      );

      // The dev's local theme files are on disk under static/themes/audi/.
      const installedScss = path.join(tmp, 'static', 'themes', 'audi', 'theme.scss');
      assert.strictEqual(fs.existsSync(installedScss), true,
        'override files must end up on disk');
      assert.strictEqual(fs.readFileSync(installedScss, 'utf-8'), '/* dev iteration */');
    });
  });
});
