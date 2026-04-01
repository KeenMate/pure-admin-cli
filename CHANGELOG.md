# Changelog

## 1.0.0-rc04 (2026-04-01)

### Added
- **Recipe system for `create`** — templates fetched from API (`/api/tools/templates/:framework/:file`), bundled locally as fallback. No more hardcoded template strings in CLI.
- **6 recipe step actions** — `create`, `patch`, `append`, `prepend`, `delete`, `json-merge` for flexible project scaffolding
- **Page generators** — recipe defines `pageTypes` (dashboard, list, detail, master-detail, form). Presets define which pages to scaffold. Auto-generates SvelteKit routes + sidebar items.
- **Company/preset profiles** — `--company keenmate --preset full` reads from `~/.pureadmin.json`. Companies define branding (name, copyright, themes), presets define technology choices (icons, pages, features).
- **`--name`** — custom display name for created apps
- **`--font-awesome`** — include FontAwesome CDN in `app.html`
- **`--no-profile-panel`** — skip ProfilePanel component
- **`--no-makefile`** — skip Makefile generation
- **`--verbose`** — show template sources (server/local), file sizes, unreplaced variables
- **`--themes-dir`** — alias for `--dir`
- **Makefile template** — generated apps include Makefile with setup, dev, build, preview, themes, clean
- **`pureadmin.json` template** — generated apps use `pureadmin.json` for theme config instead of `copy-themes.js`
- **Conditional template blocks** — `{{#FONT_AWESOME}}...{{/FONT_AWESOME}}`, `{{#PROFILE_PANEL}}...{{/PROFILE_PANEL}}`
- **`fetchText()` helper** — fetch raw template content from API
- **Unknown flag detection** — aborts with error and lists known flags

### Changed
- **`create` command rewritten** — pipeline: fetch recipe → scaffold → fetch templates → substitute → write. Templates are the single source of truth on the server.
- **`npx sv create`** — updated from deprecated `npm create svelte@latest`, with `--no-add-ons --no-install` for non-interactive scaffold
- **Layout template** — uses `PureAdminProvider config.app` pattern, `SidebarItem` icon as Svelte snippet, `{{SIDEBAR_ITEMS}}` populated from page definitions
- **Page template** — `Card` uses `titleText` prop (not `title` snippet)

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
