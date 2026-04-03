# Changelog

## 1.0.0-rc05 (2026-04-03)

### Added
- **`--no-install`** — skip dependency installation during `pureadmin create` (useful for batch testing)
- **Package manager detection** — auto-detects pnpm > bun > npm, uses it for install/add/run commands and Makefile generation
- **`{{PM}}`, `{{PM_RUN}}`, `{{PM_EXEC}}` placeholders** — Makefile and README templates use the detected package manager
- **`template/` subfolder support** — `--template-path` reads manifest from root, copies only `template/` contents. Separates tooling (manifest, helper, pages) from project files
- **Template manifest merging** — when `--template-path` is used with a bundled recipe, features/pageTypes/instructions from the template manifest take priority
- **README.md and CHANGELOG.md** — recipe steps generate app docs with substituted placeholders
- **Page generators from template-path** — `fetchTemplate` checks `--template-path` root for `pages/` before falling back to API/bundled

### Fixed
- **`sv create` failed on names with spaces** — scaffold command used `{{APP_NAME}}` (display name) instead of `{{APP_ID}}` (kebab-case). Fixed in CLI defaults, bundled recipe, and IO server recipe
- **`cd` instruction showed display name** — recipe instructions used `{{APP_NAME}}` for `cd` step, now uses `{{APP_ID}}`
- **Makefile not substituted in template-path** — `Makefile` (no extension) wasn't in the file substitution list
- **`ppnpm run` doubling** — `npm run` replacement matched inside `pnpm run`, now uses `\b` word boundary
- **`themesDir` override** — app's `pureadmin.json` now takes priority over recipe's `themeSetup.themesDir` (fixes SPA templates using `public/themes`)
- **Process hanging after create** — added `process.exit(0)` after `main()` to prevent open HTTP handles keeping Node alive
- **Feature stripping with template-path** — `processTemplatePoints` now accepts recipe object directly, works when `template.json` isn't in appDir

### Changed
- **Template manifest naming** — aligned with theme convention: `id` (kebab-case identifier) + `name` (display name), replacing `name` + `displayName`
- **`sv create` uses detected pm** — `--install pnpm` instead of always `--no-install`

---

## 1.0.0-rc04 (2026-04-02)

### Added
- **Template manifest system** — templates self-describe via `template.json` with features, placeholders, and dependencies. CLI reads manifest, resolves features, strips disabled `data-pa` blocks.
- **`--template-path`** — use a local template repo instead of downloading: `pureadmin create my-app --template-path ../svelte-pure-admin-template`
- **`--settings-panel`** — opt-in SettingsPanel (theme switcher)
- **`--profile-panel`** — opt-in ProfilePanel (now opt-in, not opt-out)
- **Recipe system for `create`** — templates fetched from API, bundled locally as fallback
- **6 recipe step actions** — `create`, `patch`, `append`, `prepend`, `delete`, `json-merge`
- **Page generators** — `pageTypes` (dashboard, list, detail, master-detail, form) with auto-generated routes + sidebar items
- **Company/preset profiles** — `--company keenmate --preset full` from `~/.pureadmin.json`
- **`--name`** — custom display name
- **`--font-awesome`** — FontAwesome CDN
- **`--no-makefile`** — skip Makefile
- **`--verbose`** — debug output (template sources, file sizes, unreplaced vars)
- **`--themes-dir`** — alias for `--dir`
- **Unknown flag detection** — aborts with error and lists known flags

### Changed
- **`create` rewritten as pipeline** — copy/scaffold → substitute placeholders → process template points → generate pages → install deps → download themes
- **Placeholder syntax `__VAR__`** — replaces `{{VAR}}` which conflicts with Svelte's expression syntax
- **`npx sv create`** — updated from deprecated `npm create svelte@latest`
- **Both panels opt-in** — ProfilePanel and SettingsPanel excluded by default (no flash on load)
- **Sidebar toggle** — uses `document.body.classList` like svelte-pure-admin demo (not Svelte bindings)
- **SidebarItem `labelText`** — matches svelte-pure-admin API (was `label`)
- **Card `titleText`** — matches svelte-pure-admin API (was `title`)
- **Svelte 5 `onsubmit`** — no `|preventDefault` modifier syntax

---

## 1.0.0-rc03 (2026-03-30)

### Added
- **`validate` command** — check theme CSS for readability (WCAG contrast ratios for outline/filled buttons and color slots per mode), required CSS variable definitions, and hardcoded border-radius consistency
- **Version from package.json** — `TOOL_VERSION` now reads from `package.json` instead of hardcoded constant

### Changed
- **JSON-only config** — removed dotenv `.pureadmin` support. Config files are now `pureadmin.json` (project, checked in) + `.pureadmin.json` (local overrides, gitignored) + `~/.pureadmin.json` (user defaults)
- **Config layering** — `.pureadmin.json` merges on top of `pureadmin.json` in the same directory, so secrets stay gitignored while project config is shared

---

## 1.0.0-rc02 (2026-03-29)

### Added
- **`build` command** — compile SCSS to CSS for one or all themes in a workspace. Works in multi-theme workspaces and single-theme projects.
- **`pack` command** — build + package themes into distributable ZIPs with SHA-256 integrity checksums (`checksums.files`, `checksums.metadata`, `content_sha`). Detects external domains in CSS, rejects undeclared JavaScript. Supports `--no-build` to skip compilation.
- **`publish` command** — build + pack + upload themes to pureadmin.io. API key resolved from `--api-key` flag, config files, or `$PUREADMIN_API_KEY`. Detects unchanged themes via checksum comparison.
- **`pure-admin.json` config** — project-level configuration file. Searched up from cwd. Stores URL, API key, theme directory, and theme state (version, content_sha, offline flag).
- **`~/.pure-admin.json` user config** — user-level defaults merged under project config.
- **`--server` flag** — override API base URL for any command.
- **Config merge** — user config loads first as defaults, project config overrides on top.
- **Header on every command** — shows tool version, target server URL, and config source.

### Changed
- Standalone scripts (`build-themes.js`, `pack-theme.js`, `pack-themes.js`, `publish-themes.js`) are now superseded by built-in CLI commands. The CLI is the single tool for all theme operations.

## 1.0.0-rc01 (2026-03-28)

### Added
- **`list` command** — list all available themes with slug, version, core compatibility, and tags
- **`info` command** — show full theme details (versions, variants, modes, content SHA, etc.)
- **`versions` command** — show available versions for a theme
- **`search` command** — search themes by name or description
- **`compatible` command** — filter themes by pure-admin-core version compatibility (supports `^`, `~`, `>=` semver ranges)
- **`download` command** — download theme ZIP, supports `--version` for specific version and `--output` for custom filename
- **`themes` command** — manage project themes: list configured themes, add new ones with download + extract. Supports `--offline` for air-gapped builds and `--dir` for custom output directory.
- **`update` command** — check configured themes for updates via `content_sha` comparison, re-download only what changed
- **`init` command** — scaffold a new theme project with template files and development tools
- **`create` command** — scaffold a SvelteKit app with Pure Admin components, theme switching, and FOUC prevention. Supports `--themes` and `--theme` for theme selection.
- Zero dependencies — uses only Node.js builtins
- Self-contained single-file CLI
