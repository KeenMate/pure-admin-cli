const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  splitWords, toSnakeCase, toKebabCase, toPascalCase,
  toCamelCase, toTitleCase, flagToOpt
} = require('../lib/create/naming');

describe('splitWords', () => {
  it('splits kebab-case', () => {
    assert.deepStrictEqual(splitWords('my-app'), ['my', 'app']);
  });

  it('splits snake_case', () => {
    assert.deepStrictEqual(splitWords('my_app'), ['my', 'app']);
  });

  it('splits camelCase', () => {
    assert.deepStrictEqual(splitWords('myApp'), ['my', 'app']);
  });

  it('splits PascalCase', () => {
    assert.deepStrictEqual(splitWords('MyApp'), ['my', 'app']);
  });

  it('handles complex names', () => {
    assert.deepStrictEqual(splitWords('keen-pure-admin-test-02'), ['keen', 'pure', 'admin', 'test', '02']);
  });

  it('handles acronyms', () => {
    assert.deepStrictEqual(splitWords('XMLParser'), ['xml', 'parser']);
  });

  it('separates letters from trailing digits', () => {
    assert.deepStrictEqual(splitWords('test02'), ['test', '02']);
    assert.deepStrictEqual(splitWords('KeenPureAdminTest02'), ['keen', 'pure', 'admin', 'test', '02']);
  });

  it('handles single word', () => {
    assert.deepStrictEqual(splitWords('hello'), ['hello']);
  });

  it('handles empty string', () => {
    assert.deepStrictEqual(splitWords(''), []);
  });
});

describe('toSnakeCase', () => {
  it('converts kebab to snake', () => {
    assert.strictEqual(toSnakeCase('my-app'), 'my_app');
  });

  it('converts PascalCase to snake', () => {
    assert.strictEqual(toSnakeCase('MyApp'), 'my_app');
  });

  it('is idempotent on snake_case', () => {
    assert.strictEqual(toSnakeCase('my_app'), 'my_app');
  });

  it('handles complex names', () => {
    assert.strictEqual(toSnakeCase('keen-pure-admin-test-02'), 'keen_pure_admin_test_02');
  });
});

describe('toKebabCase', () => {
  it('converts snake to kebab', () => {
    assert.strictEqual(toKebabCase('my_app'), 'my-app');
  });

  it('converts PascalCase to kebab', () => {
    assert.strictEqual(toKebabCase('MyApp'), 'my-app');
  });

  it('is idempotent on kebab-case', () => {
    assert.strictEqual(toKebabCase('my-app'), 'my-app');
  });
});

describe('toPascalCase', () => {
  it('converts kebab to PascalCase', () => {
    assert.strictEqual(toPascalCase('my-app'), 'MyApp');
  });

  it('converts snake to PascalCase', () => {
    assert.strictEqual(toPascalCase('my_app'), 'MyApp');
  });

  it('handles complex names with numbers', () => {
    assert.strictEqual(toPascalCase('keen-pure-admin-test-02'), 'KeenPureAdminTest02');
  });

  it('is idempotent on PascalCase', () => {
    assert.strictEqual(toPascalCase('MyApp'), 'MyApp');
  });
});

describe('toCamelCase', () => {
  it('converts kebab to camelCase', () => {
    assert.strictEqual(toCamelCase('my-app'), 'myApp');
  });

  it('converts PascalCase to camelCase', () => {
    assert.strictEqual(toCamelCase('MyApp'), 'myApp');
  });
});

describe('toTitleCase', () => {
  it('converts kebab to Title Case', () => {
    assert.strictEqual(toTitleCase('my-app'), 'My App');
  });

  it('converts snake to Title Case', () => {
    assert.strictEqual(toTitleCase('my_app'), 'My App');
  });
});

describe('flagToOpt', () => {
  it('converts --kebab-flag to camelCase', () => {
    assert.strictEqual(flagToOpt('--profile-panel'), 'profilePanel');
  });

  it('converts --no-ecto to noEcto', () => {
    assert.strictEqual(flagToOpt('--no-ecto'), 'noEcto');
  });

  it('strips leading dashes', () => {
    assert.strictEqual(flagToOpt('--verbose'), 'verbose');
  });
});
