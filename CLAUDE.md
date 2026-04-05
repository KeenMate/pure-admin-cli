# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

`@keenmate/pureadmin` — CLI for Pure Admin. Manages themes, templates, and app scaffolding via [pureadmin.io](https://pureadmin.io).

## Repository Structure

```
bin/pureadmin.js              # Entry point (15 lines: shebang + require + main)
lib/
  cli.js                      # main(), arg parsing, command routing, usage()
  config.js                   # Config loading (project, local, user-level)
  http.js                     # fetchJson, downloadFile, BASE_URL
  formatting.js               # ANSI helpers (bold, dim, green, etc.)
  files.js                    # copyDirSync, sha256, extractThemeZip
  commands/
    browse.js                 # list, info, versions, search, compatible, download
    init.js                   # Theme project scaffolding
    create.js                 # App creation pipeline + processTemplatePoints
    create-interactive.js     # Interactive wizard (@clack/prompts)
    themes.js                 # themes router, add, update
    theme-build.js            # SCSS compilation
    theme-pack.js             # ZIP packaging with checksums
    theme-publish.js          # Pack + upload themes
    theme-validate.js         # CSS validation (WCAG, variables, consistency)
    templates.js              # Template list, pack, publish
templates/
  sveltekit.json              # Bundled recipe fallback
  sveltekit/                  # Bundled template files (app.html, layout, pages)
test/
  *.test.js                   # Tests using node:test
```

## Commands

```bash
make test                     # Run all tests (node --test)
node bin/pureadmin.js --help  # Show usage
npm pack --dry-run            # Check what gets published
npm publish --access public --tag rc  # Publish to npm
```

## Create Pipeline

`pureadmin create` processes templates in this order:

1. **Fetch** — download template ZIP from API or copy from `--template-path`
2. **Scaffold** — run `sv create` / `npm create vite` (API recipe only)
3. **Substitute** — replace `__VAR__` placeholders + `__ICON:name__` → provider markup
4. **Extra imports** — resolve `__EXTRA_IMPORTS__` per file (Lucide imports or empty)
5. **Recipe steps** — `create`, `create-if`, `json-merge`, `patch`, `append`, `prepend`, `delete`, `call`
6. **Feature strip** — remove `data-pa` blocks for disabled features
7. **Install** — pnpm/npm/bun install + add extra deps (e.g. @lucide/svelte)
8. **Themes** — download theme ZIPs from API

### Template Operations

Recipe steps can call template-defined operations via `{ "action": "call", "op": "...", "args": [...] }`. Operations are defined in `template.helper.js` and are technology-specific:

- `addDependency(name, version)` — add to package.json / mix.exs
- `setConfigValue(key, value)` — set in pureadmin.json / config.exs
- `inject(file, marker, content, position)` — insert at marker
- `addHeadTag(tag)` — add to HTML head
- `addRoute(path, ...)` — add route
- `addSidebarItem(href, label, iconMarkup)` — add sidebar entry

### Icon Provider System

Templates use `__ICON:name__` placeholders. The CLI resolves based on `--font-awesome` (default), `--lucide`, or `--fluent-ui`:

- FA: `<i class="fas fa-rocket"></i>` + CDN link
- Lucide: `<Rocket size={18} />` + per-file imports + npm dep

## Config Resolution (highest priority first)

1. CLI flags (`--server`)
2. Env vars (`PUREADMIN_URL`, `PUREADMIN_API_KEY`)
3. `.pureadmin.json` — local overrides (gitignored)
4. `pureadmin.json` — project config (checked in)
5. `~/.pureadmin.json` — user defaults

## Dependencies

- `@clack/prompts` — interactive wizard (ESM, loaded via dynamic import)
- No other runtime dependencies

## Related Repositories

- **pure-admin** — CSS framework (`../pure-admin`)
- **pure-admin-templates** — template definitions (`../pure-admin-templates`)
- **pure-admin-themes** — theme packages (`../pure-admin-themes`)
- **pure-admin-io** — pureadmin.io website (`../pure-admin-io`)
- **svelte-pure-admin** — Svelte component library (`../svelte-pure-admin`)
