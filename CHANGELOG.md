# Changelog

## 1.0.0-rc02 (2026-03-29)

### Added
- **`build` command** — compile SCSS to CSS for one or all themes in a workspace. Works in multi-theme workspaces and single-theme projects.
- **`pack` command** — build + package themes into distributable ZIPs with SHA-256 integrity checksums (`checksums.files`, `checksums.metadata`, `content_sha`). Detects external domains in CSS, rejects undeclared JavaScript. Supports `--no-build` to skip compilation.
- **`publish` command** — build + pack + upload themes to pureadmin.io. API key resolved from `--api-key` flag, `pure-admin.json`, `~/.pure-admin.json`, or `$PUREADMIN_API_KEY`. Detects unchanged themes via checksum comparison.
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
