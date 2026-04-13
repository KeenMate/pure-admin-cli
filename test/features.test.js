const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveFeatures, buildScaffoldFlags } = require('../lib/create/features');

describe('resolveFeatures', () => {
  it('enables isRequired features', () => {
    const features = { navbar: { description: 'Nav', isRequired: true, points: [] } };
    const result = resolveFeatures(features, {}, null);
    assert.strictEqual(result.navbar, true);
  });

  it('enables isDefault features', () => {
    const features = { icons: { description: 'Icons', isDefault: true, points: [] } };
    const result = resolveFeatures(features, {}, null);
    assert.strictEqual(result.icons, true);
  });

  it('disables opt-in features by default', () => {
    const features = { 'profile-panel': { description: 'Profile', points: [], cli: '--profile-panel' } };
    const result = resolveFeatures(features, {}, null);
    assert.strictEqual(result['profile-panel'], false);
  });

  it('enables opt-in features via CLI flag', () => {
    const features = { 'profile-panel': { description: 'Profile', points: [], cli: '--profile-panel' } };
    const result = resolveFeatures(features, { profilePanel: true }, null);
    assert.strictEqual(result['profile-panel'], true);
  });

  it('handles --no-X flags (negative form)', () => {
    const features = { ecto: { description: 'Ecto', isDefault: true, points: [], cli: '--no-ecto', scaffoldFlag: '--no-ecto' } };
    const result = resolveFeatures(features, { noEcto: true }, null);
    assert.strictEqual(result.ecto, false);
  });

  it('defaults --no-X features to enabled', () => {
    const features = { ecto: { description: 'Ecto', isDefault: true, points: [], cli: '--no-ecto' } };
    const result = resolveFeatures(features, {}, null);
    assert.strictEqual(result.ecto, true);
  });

  it('handles cli array (multi-option group)', () => {
    const features = {
      icons: {
        description: 'Icons', isDefault: true, points: [],
        cli: [
          { name: 'Font Awesome', flag: '--font-awesome', isDefault: true },
          { name: 'Lucide', flag: '--lucide' },
        ]
      }
    };
    const result = resolveFeatures(features, {}, null);
    assert.strictEqual(result.icons, true);
  });

  it('auto-enables required dependencies', () => {
    const features = {
      navbar: { description: 'Nav', isRequired: true, points: [] },
      'profile-panel': { description: 'Profile', points: [], cli: '--profile-panel', requires: ['navbar'] },
    };
    const result = resolveFeatures(features, { profilePanel: true }, null);
    assert.strictEqual(result['profile-panel'], true);
    assert.strictEqual(result.navbar, true);
  });

  it('applies preset overrides', () => {
    const features = { ecto: { description: 'Ecto', isDefault: true, points: [], cli: '--no-ecto' } };
    const preset = { features: { ecto: false } };
    const result = resolveFeatures(features, {}, preset);
    assert.strictEqual(result.ecto, false);
  });
});

describe('buildScaffoldFlags', () => {
  it('adds scaffoldFlag for disabled features', () => {
    const features = {
      ecto: { scaffoldFlag: '--no-ecto' },
      mailer: { scaffoldFlag: '--no-mailer' },
      navbar: { /* no scaffoldFlag */ },
    };
    const enabled = { ecto: false, mailer: false, navbar: true };
    const result = buildScaffoldFlags(features, enabled);
    assert.strictEqual(result, '--no-ecto --no-mailer');
  });

  it('returns empty string when all features enabled', () => {
    const features = { ecto: { scaffoldFlag: '--no-ecto' } };
    const enabled = { ecto: true };
    assert.strictEqual(buildScaffoldFlags(features, enabled), '');
  });

  it('handles scaffoldFlagWhenEnabled', () => {
    const features = { postgres: { scaffoldFlagWhenEnabled: '--database postgres' } };
    const enabled = { postgres: true };
    assert.strictEqual(buildScaffoldFlags(features, enabled), '--database postgres');
  });
});
