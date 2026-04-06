# Changelog

## 1.0.0-rc08 (2026-04-06)

### Added
- **`profiles list/show/delete`** — manage company profiles and workspace mappings
- **`presets list/show/delete`** — manage saved create presets
- **Workspace auto-detection** — `~/.pureadmin.json` → `workspaces` maps directory paths to companies with `defaultCompany` and `companies` list
- **Preset hints** — preset selection shows template, features, and themes

### Changed
- **Consistent command verbs** — all resources use `list`, `show`, `delete` (not `info`/`rm`)
- **`themes list`** replaces bare `themes` (no-args shows hint)
- **`themes list --local`** for project-configured themes
- **`themes add [id...]`** replaces bare `themes [id...]`
- **Top-level `list` removed** — use `themes list` or `templates list`

---

## 1.0.0-rc07 (2026-04-06)

### Added
- **Template operations API** — `template.helper.js` exports technology-specific operations: `addDependency`, `setConfigValue`, `inject`, `addHeadTag`, `addRoute`, `addSidebarItem`. Invoked via `{ "action": "call", "op": "...", "args": [...] }` recipe steps
- **`create-if` pipeline action** — create files conditionally based on feature flags
- **Wizard presets** — save wizard selections as named presets in `~/.pureadmin.json` → `createPresets`. Load "Last used" or any saved preset at wizard start to pre-fill all defaults
- **Condensed wizard** — parallel data loading, combined template select (technology+variant), single multiselect for features, combined theme/variant/mode "Default appearance" picker, summary as `note` box. ~5 prompts instead of 10+
- **`CLAUDE.md`** — CLI project documentation with pipeline, operations API, icon system

### Changed
- **Wizard company/profile moved first** — select profile before template
- **Display name auto-derived** — from company name or app name, no longer prompted separately

---

## 1.0.0-rc06 (2026-04-04)

### Added
- **Icon provider system** — `--font-awesome` (default), `--lucide`, `--fluent-ui` flags. Templates use `__ICON:name__` placeholders resolved to provider-specific markup at create time
- **Lucide support** — `@lucide/svelte@next` added as dependency, per-file imports auto-generated via `__EXTRA_IMPORTS__` placeholder
- **Interactive create wizard** — `pureadmin create` (no args) launches @clack/prompts wizard: pick technology → template → name → features → icon provider → themes → variant → mode → company
- **Wizard remembers selections** — saves to `~/.pureadmin.json` `lastCreate`, preselects on next run
- **Theme variant + mode selection** — wizard fetches theme metadata, prompts for default variant (e.g. Default/Blue/Green/Red) and mode (dark/light)
- **`__DEFAULT_MODE__` and `__DEFAULT_VARIANT__`** — FOUC script uses theme's actual default mode and variant instead of hardcoding
- **`pureadmin templates list/pack/publish`** — template management commands
- **`pureadmin themes` subcommands** — `update`, `build`, `pack`, `publish`, `validate` moved under `themes`
- **`--template <id>` fetches from API** — downloads template ZIP from `/api/templates/<id>/download`
- **`--no-install`** — skip dependency installation
- **Package manager detection** — pnpm > bun > npm, used for install, Makefile (`{{PM}}`/`{{PM_RUN}}`/`{{PM_EXEC}}`), and next steps
- **`template/` subfolder support** — separates tooling from project files
- **CLI split into 14 modules** under `lib/` — entry point is 15 lines
- **31 tests** using `node:test` (zero test dependencies)

### Fixed
- **`sv create` failed on names with spaces** — `{{APP_NAME}}` → `{{APP_ID}}` in scaffold commands
- **Makefile not substituted** in template-path (missing from extension list)
- **`ppnpm run` doubling** — `\b` word boundary in npm run replacement
- **`themesDir` priority** — app's `pureadmin.json` wins over recipe
- **Process hanging** — `process.exit(0)` after `main()`
- **Feature stripping** with downloaded templates (recipe object passed directly)
- **API key priority** — env var now overrides config files

### Changed
- **`pureadmin list`** — now lists templates (matches `create` flow), themes moved to `themes list`
- **Template manifest naming** — `id` + `name` aligned with theme convention
- **`sv create` uses detected pm** — `--install pnpm` instead of `--no-install`

---

## 1.0.0-rc05 (2026-04-04) — published to npm

(see rc06 for consolidated changelog)
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
