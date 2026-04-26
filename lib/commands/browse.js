// ---------------------------------------------------------------------------
// Browse commands: list, info, versions, search, compatible, download
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { bold, dim, cyan, green, yellow } = require('../helpers/formatting');
const { renderMarkdown } = require('../helpers/markdown');
const { fetchJson, downloadFile, getBaseUrl } = require('../http');

async function cmdList() {
  const data = await fetchJson('/api/themes');
  const themes = data.themes;

  console.log(bold(`\n  ${themes.length} themes available\n`));

  const maxName = Math.max(...themes.map(t => t.name.length));
  const maxSlug = Math.max(...themes.map(t => t.slug.length));
  for (const t of themes) {
    const name = t.name.padEnd(maxName);
    const slug = dim(t.slug.padEnd(maxSlug));
    const ver = dim(`v${t.latest}`);
    const tags = t.tags ? dim(t.tags.join(', ')) : '';
    console.log(`  ${cyan(name)}  ${slug}  ${ver}  ${tags}`);
  }
  console.log();
}

async function cmdInfo(slug, usage) {
  if (!slug) return usage('info requires a theme slug');

  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;
  const BASE_URL = getBaseUrl();

  console.log();
  console.log(bold(`  ${t.name}`) + dim(` (${t.slug})`));
  console.log();
  console.log(`  ${dim('Description:')}  ${t.description}`);
  console.log(`  ${dim('Latest:')}       ${green(t.latest)}`);
  console.log(`  ${dim('Versions:')}     ${t.versions.join(', ')}`);
  console.log(`  ${dim('Core:')}         ${t.core_version || 'not specified'}`);
  console.log(`  ${dim('Font:')}         ${t.font}`);
  console.log(`  ${dim('Tags:')}         ${(t.tags || []).join(', ')}`);
  console.log(`  ${dim('Package:')}      ${t.package || 'n/a'}`);
  if (t.content_sha) {
    console.log(`  ${dim('Content SHA:')}  ${t.content_sha}`);
  }

  if (t.variants && t.variants.length > 0) {
    console.log();
    console.log(`  ${dim('Variants:')}`);
    for (const v of t.variants) {
      const modes = (v.modes || []).map(m => m.name).join(', ');
      console.log(`    ${v.name}${v.description ? dim(` — ${v.description}`) : ''}  ${dim(`[${modes}]`)}`);
    }
  }

  // Long-form markdown content (theme.json `content` field). Indent each line
  // by 2 so it aligns with the rest of the block when marked-terminal renders.
  if (t.content) {
    console.log();
    const rendered = renderMarkdown(t.content);
    for (const line of rendered.split('\n')) console.log(`  ${line}`);
  }

  console.log();
  console.log(`  ${dim('Download:')}  curl -o ${slug}.zip ${BASE_URL}/api/themes/${slug}/download`);
  console.log(`  ${dim('Detail:')}    ${BASE_URL}/t/${slug}`);
  console.log();
}

async function cmdVersions(slug, usage) {
  if (!slug) return usage('versions requires a theme slug');

  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;

  console.log();
  console.log(bold(`  ${t.name}`) + dim(` — versions`));
  console.log();
  for (const v of t.versions) {
    const marker = v === t.latest ? green(' (latest)') : '';
    console.log(`  ${v}${marker}`);
  }
  console.log();
}

async function cmdSearch(query, usage) {
  if (!query) return usage('search requires a query');

  const data = await fetchJson(`/api/themes?q=${encodeURIComponent(query)}`);
  const themes = data.themes;

  if (themes.length === 0) {
    console.log(`\n  No themes found for "${query}"\n`);
    return;
  }

  console.log(bold(`\n  ${themes.length} theme(s) matching "${query}"\n`));
  for (const t of themes) {
    console.log(`  ${cyan(t.name)}  ${dim(`v${t.latest}`)}  ${dim(t.description)}`);
  }
  console.log();
}

async function cmdCompatible(coreVersion, usage) {
  if (!coreVersion) return usage('compatible requires a core version (e.g. 2.0.0)');

  const data = await fetchJson(`/api/themes?core_version=${encodeURIComponent(coreVersion)}`);
  const themes = data.themes;

  if (themes.length === 0) {
    console.log(`\n  No themes compatible with core ${coreVersion}\n`);
    return;
  }

  console.log(bold(`\n  ${themes.length} theme(s) compatible with pure-admin-core ${coreVersion}\n`));
  for (const t of themes) {
    const core = t.core_version ? dim(`requires ${t.core_version}`) : dim('no requirement');
    console.log(`  ${cyan(t.name)}  ${dim(`v${t.latest}`)}  ${core}`);
  }
  console.log();
}

async function cmdDownload(slug, opts, usage) {
  if (!slug) return usage('download requires a theme slug (e.g. `pureadmin themes download default`). To install or refresh themes listed in a pureadmin.json project, use `pureadmin themes add <slug>` or `pureadmin themes update` instead.');

  const version = opts.version;
  const versionParam = version ? `?version=${encodeURIComponent(version)}` : '';
  const urlPath = `/api/themes/${encodeURIComponent(slug)}/download${versionParam}`;

  // Get theme info first for the filename
  const data = await fetchJson(`/api/themes/${encodeURIComponent(slug)}`);
  const t = data.theme;
  const ver = version || t.latest;
  const filename = opts.output || `pure-admin-theme-${slug}-${ver}.zip`;

  process.stdout.write(`  Downloading ${t.name} v${ver}... `);

  try {
    await downloadFile(urlPath, filename);
    console.log(green('done'));
    console.log(`  ${dim('Saved to:')} ${filename}`);
    console.log();
  } catch (err) {
    console.log(`\x1b[31mfailed\x1b[0m`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

module.exports = { cmdList, cmdInfo, cmdVersions, cmdSearch, cmdCompatible, cmdDownload };
