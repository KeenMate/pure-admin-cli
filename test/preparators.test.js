const { describe, it } = require('node:test');
const assert = require('node:assert');
const p = require('../lib/create/preparators');

function makeCtx(overrides = {}) {
  return {
    appName: 'my-test-app',
    displayName: 'My Test App',
    copyright: '© 2026 Test Co',
    logo: '/logo.svg',
    template: 'svelte-sveltekit',
    themeIds: ['audi', 'dark'],
    defaultTheme: 'audi',
    defaultMode: 'dark',
    opts: {},
    pm: 'npm',
    iconProvider: 'font-awesome',
    features: {},
    themesData: [
      { slug: 'audi', name: 'Audi', latest: '2.3.4' },
      { slug: 'dark', name: 'Dark', latest: '2.3.4' },
    ],
    pages: [
      { type: 'dashboard', label: 'Dashboard' },
      { type: 'users', label: 'Users', icon: 'fa fa-users' },
    ],
    pageTypes: {
      dashboard: { defaultLabel: 'Dashboard', icon: 'fa fa-home' },
      users: { defaultLabel: 'Users', icon: 'fa fa-users' },
    },
    createCommand: 'npx @keenmate/pureadmin create my-test-app --template svelte-sveltekit',
    scaffoldFlags: '--no-ecto',
    placeholders: {},
    ...overrides,
  };
}

describe('setAppId', () => {
  it('sets APP_ID from appName', () => {
    const ctx = makeCtx();
    p.setAppId(ctx);
    assert.strictEqual(ctx.placeholders.APP_ID, 'my-test-app');
  });
});

describe('setAppIdSnake', () => {
  it('sets APP_ID_SNAKE as snake_case', () => {
    const ctx = makeCtx();
    p.setAppIdSnake(ctx);
    assert.strictEqual(ctx.placeholders.APP_ID_SNAKE, 'my_test_app');
  });
});

describe('setAppIdKebab', () => {
  it('sets APP_ID_KEBAB as kebab-case', () => {
    const ctx = makeCtx({ appName: 'my_test_app' });
    p.setAppIdKebab(ctx);
    assert.strictEqual(ctx.placeholders.APP_ID_KEBAB, 'my-test-app');
  });
});

describe('setAppModule', () => {
  it('sets APP_MODULE as PascalCase', () => {
    const ctx = makeCtx();
    p.setAppModule(ctx);
    assert.strictEqual(ctx.placeholders.APP_MODULE, 'MyTestApp');
  });
});

describe('setAppName', () => {
  it('sets APP_NAME and APP_DISPLAY_NAME', () => {
    const ctx = makeCtx();
    p.setAppName(ctx);
    assert.strictEqual(ctx.placeholders.APP_NAME, 'My Test App');
    assert.strictEqual(ctx.placeholders.APP_DISPLAY_NAME, 'My Test App');
  });
});

describe('setCopyright', () => {
  it('sets COPYRIGHT', () => {
    const ctx = makeCtx();
    p.setCopyright(ctx);
    assert.strictEqual(ctx.placeholders.COPYRIGHT, '© 2026 Test Co');
  });
});

describe('setLogo', () => {
  it('sets LOGO', () => {
    const ctx = makeCtx();
    p.setLogo(ctx);
    assert.strictEqual(ctx.placeholders.LOGO, '/logo.svg');
  });

  it('defaults to empty string when no logo', () => {
    const ctx = makeCtx({ logo: null });
    p.setLogo(ctx);
    assert.strictEqual(ctx.placeholders.LOGO, '');
  });
});

describe('setPackageManager', () => {
  it('sets PM, PM_RUN, PM_EXEC for npm', () => {
    const ctx = makeCtx({ pm: 'npm' });
    p.setPackageManager(ctx);
    assert.strictEqual(ctx.placeholders.PM, 'npm');
    assert.strictEqual(ctx.placeholders.PM_RUN, 'npm run');
    assert.strictEqual(ctx.placeholders.PM_EXEC, 'npx');
  });

  it('sets PM_EXEC to pnpm exec for pnpm', () => {
    const ctx = makeCtx({ pm: 'pnpm' });
    p.setPackageManager(ctx);
    assert.strictEqual(ctx.placeholders.PM, 'pnpm');
    assert.strictEqual(ctx.placeholders.PM_EXEC, 'pnpm exec');
  });

  it('sets PM_EXEC to bunx for bun', () => {
    const ctx = makeCtx({ pm: 'bun' });
    p.setPackageManager(ctx);
    assert.strictEqual(ctx.placeholders.PM_EXEC, 'bunx');
  });
});

describe('setDefaultTheme', () => {
  it('sets DEFAULT_THEME, DEFAULT_MODE, DEFAULT_VARIANT', () => {
    const ctx = makeCtx();
    p.setDefaultTheme(ctx);
    assert.strictEqual(ctx.placeholders.DEFAULT_THEME, 'audi');
    assert.strictEqual(ctx.placeholders.DEFAULT_MODE, 'dark');
    assert.strictEqual(ctx.placeholders.DEFAULT_VARIANT, '');
  });
});

describe('setScaffoldFlags', () => {
  it('sets SCAFFOLD_FLAGS from ctx.scaffoldFlags', () => {
    const ctx = makeCtx();
    p.setScaffoldFlags(ctx);
    assert.strictEqual(ctx.placeholders.SCAFFOLD_FLAGS, '--no-ecto');
  });
});

describe('setCreateCommand', () => {
  it('sets CREATE_COMMAND from ctx.createCommand', () => {
    const ctx = makeCtx();
    p.setCreateCommand(ctx);
    assert.strictEqual(ctx.placeholders.CREATE_COMMAND, 'npx @keenmate/pureadmin create my-test-app --template svelte-sveltekit');
  });
});

describe('set (low-level)', () => {
  it('sets arbitrary key', () => {
    const ctx = makeCtx();
    p.set(ctx, 'CUSTOM_KEY', 'hello');
    assert.strictEqual(ctx.placeholders.CUSTOM_KEY, 'hello');
  });

  it('coerces null to empty string', () => {
    const ctx = makeCtx();
    p.set(ctx, 'KEY', null);
    assert.strictEqual(ctx.placeholders.KEY, '');
  });
});

describe('derive', () => {
  it('computes placeholder from function', () => {
    const ctx = makeCtx();
    p.setAppIdSnake(ctx);
    p.derive(ctx, 'DB_NAME', (c) => `${c.placeholders.APP_ID_SNAKE}_dev`);
    assert.strictEqual(ctx.placeholders.DB_NAME, 'my_test_app_dev');
  });
});

// ── Data collectors ──────────────────────────────────────────

describe('collectSidebarItems', () => {
  it('returns objects from pages + pageTypes', () => {
    const ctx = makeCtx();
    const items = p.collectSidebarItems(ctx);
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].href, '/');
    assert.strictEqual(items[0].label, 'Dashboard');
    assert.strictEqual(items[1].href, '/users');
    assert.strictEqual(items[1].label, 'Users');
  });

  it('skips pages with sidebar: false', () => {
    const ctx = makeCtx({
      pageTypes: {
        dashboard: { defaultLabel: 'Dashboard', icon: 'fa fa-home' },
        users: { defaultLabel: 'Users', icon: 'fa fa-users', sidebar: false },
      },
    });
    const items = p.collectSidebarItems(ctx);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].label, 'Dashboard');
  });
});

describe('collectProfileItems', () => {
  it('returns default profile items', () => {
    const ctx = makeCtx();
    const items = p.collectProfileItems(ctx);
    assert.ok(items.length >= 3);
    assert.strictEqual(items[0].label, 'Profile Settings');
    assert.ok(items[0].icon);
    assert.ok(items[0].href);
  });
});

describe('collectBrand', () => {
  it('returns brand data', () => {
    const ctx = makeCtx();
    const brand = p.collectBrand(ctx);
    assert.strictEqual(brand.name, 'My Test App');
    assert.strictEqual(brand.logo, '/logo.svg');
  });
});

describe('collectFooter', () => {
  it('returns footer data', () => {
    const ctx = makeCtx();
    const footer = p.collectFooter(ctx);
    assert.strictEqual(footer.copyright, '© 2026 Test Co');
  });
});

describe('collectThemeOptions', () => {
  it('returns theme objects with cssPath', () => {
    const ctx = makeCtx();
    const opts = p.collectThemeOptions(ctx);
    assert.strictEqual(opts.length, 2);
    assert.strictEqual(opts[0].id, 'audi');
    assert.strictEqual(opts[0].cssPath, '/themes/audi/css/audi.css');
    assert.strictEqual(opts[1].id, 'dark');
  });
});

describe('collectCreateSummary', () => {
  it('returns full summary', () => {
    const ctx = makeCtx({
      features: { ecto: false, navbar: true, sidebar: true },
    });
    const summary = p.collectCreateSummary(ctx);
    assert.strictEqual(summary.template, 'svelte-sveltekit');
    assert.deepStrictEqual(summary.featuresOn, ['navbar', 'sidebar']);
    assert.deepStrictEqual(summary.featuresOff, ['ecto']);
    assert.deepStrictEqual(summary.themes, ['audi', 'dark']);
    assert.strictEqual(summary.defaultTheme, 'audi');
    assert.ok(summary.createCommand.includes('pureadmin create'));
  });
});

describe('prepareDefault', () => {
  it('sets all standard placeholders', () => {
    const ctx = makeCtx();
    p.prepareDefault(ctx);
    const keys = Object.keys(ctx.placeholders);
    assert.ok(keys.includes('APP_ID'));
    assert.ok(keys.includes('APP_NAME'));
    assert.ok(keys.includes('COPYRIGHT'));
    assert.ok(keys.includes('DEFAULT_THEME'));
    assert.ok(keys.includes('PM'));
    assert.ok(keys.length >= 15, `Expected >= 15 placeholders, got ${keys.length}`);
  });
});
