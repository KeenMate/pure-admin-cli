const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveIconProvider } = require('../lib/create/icons');

describe('resolveIconProvider', () => {
  it('returns provider from CLI flag (--font-awesome)', () => {
    const r = resolveIconProvider({ opts: { fontAwesome: true } });
    assert.strictEqual(r.provider, 'font-awesome');
    assert.ok(r.source.includes('--font-awesome'));
  });

  it('returns provider from CLI flag (--lucide)', () => {
    const r = resolveIconProvider({ opts: { lucide: true } });
    assert.strictEqual(r.provider, 'lucide');
  });

  it('returns provider from CLI flag (--heroicons)', () => {
    const r = resolveIconProvider({ opts: { heroicons: true } });
    assert.strictEqual(r.provider, 'heroicons');
  });

  it('returns provider from CLI flag (--fluent-ui)', () => {
    const r = resolveIconProvider({ opts: { fluentUi: true } });
    assert.strictEqual(r.provider, 'fluent-ui');
  });

  it('returns "none" when --no-icons is set', () => {
    const r = resolveIconProvider({ opts: { noIcons: true } });
    assert.strictEqual(r.provider, 'none');
    assert.ok(r.source.includes('--no-icons'));
  });

  it('throws when --no-icons conflicts with a provider flag', () => {
    assert.throws(
      () => resolveIconProvider({ opts: { noIcons: true, fontAwesome: true } }),
      /--no-icons cannot be combined with --font-awesome/,
    );
  });

  it('throws when --no-icons conflicts with multiple provider flags', () => {
    assert.throws(
      () => resolveIconProvider({ opts: { noIcons: true, lucide: true, heroicons: true } }),
      /--no-icons cannot be combined with --heroicons, --lucide/,
    );
  });

  it('honors preset.fontAwesome when no flag set', () => {
    const r = resolveIconProvider({ opts: { preset: 'full' }, preset: { fontAwesome: true } });
    assert.strictEqual(r.provider, 'font-awesome');
    assert.ok(r.source.includes('preset'));
  });

  it('honors company.fontAwesome when no flag/preset set', () => {
    const r = resolveIconProvider({ opts: {}, company: { fontAwesome: true }, companyId: 'keenmate' });
    assert.strictEqual(r.provider, 'font-awesome');
    assert.ok(r.source.includes('company'));
  });

  it('honors template manifest default (isDefault on --font-awesome)', () => {
    // Reproduces the registr-smluv bug: elixir-phoenix-liveview declares FA as default,
    // but the old CLI ignored it and fell through to "none".
    const recipe = {
      features: {
        icons: {
          isDefault: true,
          cli: [
            { name: 'Font Awesome', flag: '--font-awesome', isDefault: true },
            { name: 'Heroicons', flag: '--heroicons' },
          ],
        },
      },
    };
    const r = resolveIconProvider({ opts: {}, recipe });
    assert.strictEqual(r.provider, 'font-awesome');
    assert.ok(r.source.includes('template default'));
    assert.ok(r.source.includes('--font-awesome'));
  });

  it('honors template manifest default (isDefault on --lucide)', () => {
    const recipe = {
      features: {
        icons: {
          cli: [
            { name: 'Lucide', flag: '--lucide', isDefault: true },
            { name: 'Font Awesome', flag: '--font-awesome' },
          ],
        },
      },
    };
    const r = resolveIconProvider({ opts: {}, recipe });
    assert.strictEqual(r.provider, 'lucide');
  });

  it('falls back to "none" when manifest has no isDefault', () => {
    const recipe = {
      features: {
        icons: {
          cli: [
            { name: 'Font Awesome', flag: '--font-awesome' },
            { name: 'Heroicons', flag: '--heroicons' },
          ],
        },
      },
    };
    const r = resolveIconProvider({ opts: {}, recipe });
    assert.strictEqual(r.provider, 'none');
  });

  it('falls back to "none" when recipe has no icons feature', () => {
    const r = resolveIconProvider({ opts: {}, recipe: { features: {} } });
    assert.strictEqual(r.provider, 'none');
  });

  it('falls back to "none" when recipe is null', () => {
    const r = resolveIconProvider({ opts: {}, recipe: null });
    assert.strictEqual(r.provider, 'none');
  });

  it('CLI flag wins over template manifest default', () => {
    const recipe = {
      features: { icons: { cli: [{ flag: '--font-awesome', isDefault: true }] } },
    };
    const r = resolveIconProvider({ opts: { lucide: true }, recipe });
    assert.strictEqual(r.provider, 'lucide');
  });

  it('--no-icons wins over template manifest default', () => {
    const recipe = {
      features: { icons: { cli: [{ flag: '--font-awesome', isDefault: true }] } },
    };
    const r = resolveIconProvider({ opts: { noIcons: true }, recipe });
    assert.strictEqual(r.provider, 'none');
  });

  it('preset wins over template manifest default', () => {
    // preset.fontAwesome is a coarse-grained company/preset signal — it should
    // beat the template's own declared default (the user picked the preset).
    const recipe = {
      features: { icons: { cli: [{ flag: '--lucide', isDefault: true }] } },
    };
    const r = resolveIconProvider({ opts: { preset: 'corp' }, preset: { fontAwesome: true }, recipe });
    assert.strictEqual(r.provider, 'font-awesome');
  });

  it('handles undefined opts gracefully', () => {
    const r = resolveIconProvider({});
    assert.strictEqual(r.provider, 'none');
  });
});
