# @keenmate/pureadmin

The official CLI for [Pure Admin](https://github.com/keenmate/pure-admin) — a lightweight, data-focused CSS/SCSS admin framework built for real applications.

Build themes, validate accessibility, scaffold apps, and publish to [pureadmin.io](https://pureadmin.io).

## What's New in v1.2.2
- **Wildcard segments in CLI ↔ server version negotiation** — `compareVersions` now treats explicit `x` or `*` segments as wildcards. The pureadmin.io server can advertise `max_compat: "1.2.x"` once and have any `1.2.*` CLI match — no more per-patch server-config bumps to admit each new CLI release.

## What's New in v1.2.1
- **`themes add --path <dir>`** — register a theme from a local directory instead of fetching from the API. Slug is auto-derived from `theme.json`, contents are snapshotted into `static/themes/<slug>/`, and the entry persists with a `path` field in `pureadmin.json`. Lets devs iterate on a sibling theme repo (e.g. `../pure-admin-themes/audi`) without a publish round-trip.
- **`themes update` honors local-path themes** — entries with a `path` re-snapshot from disk on every update (using `theme.json`'s version), so changes in the source repo land in the consuming app with one command. `themes list --local` labels them `local: <path>` so they're visually distinct from API-sourced themes.
- **Fixed: `themes` commands now read `.pureadmin.json`** — `loadProjectConfig` previously only loaded `pureadmin.json`, so themes declared in the gitignored override file were silently ignored ("No themes configured" even when they were listed there). Now deep-merges both files, matching the global config layering.

- **14 themes** — Audi, Ayu, Cobalt2, Corporate, Dark, Darkmatter, Dracula, Express, Gruvbox, Minimal, Night Owl, One Dark, Tokyo Night, Cafe Industrial
- **Browse & download** — [pureadmin.io](https://pureadmin.io)
- **Theme source** — [github.com/keenmate/pure-admin-themes](https://github.com/keenmate/pure-admin-themes)
- **Framework source** — [github.com/keenmate/pure-admin](https://github.com/keenmate/pure-admin)

## Install

```bash
npm install -g @keenmate/pureadmin
```

Or use without installing:

```bash
npx @keenmate/pureadmin <command>
```

## Commands

### create — Create a Pure Admin app

```bash
# Interactive wizard
pureadmin create

# Direct
pureadmin create my-app --template svelte-spa --font-awesome --profile-panel

# With company preset
pureadmin create my-app --company keenmate --preset full
```

| Flag | Description |
|------|-------------|
| `--template <id>` | Template to use (fetched from API) |
| `--template-path <dir>` | Use a local template directory |
| `--name <name>` | Custom display name |
| `--themes <list>` | Comma-separated theme slugs |
| `--theme <slug>` | Default theme |
| `--font-awesome` | FontAwesome 6 icons (default) |
| `--lucide` | Lucide icons (Svelte components) |
| `--fluent-ui` | Fluent UI icons |
| `--profile-panel` | User profile panel |
| `--settings-panel` | Theme switcher panel |
| `--company <id>` | Company profile from `~/.pureadmin.json` |
| `--preset <name>` | Feature/page preset |
| `--no-install` | Skip dependency installation |
| `--no-build` | Skip initial build |
| `--no-makefile` | Skip Makefile |
| `--verbose` | Debug output |

Package manager is auto-detected (pnpm > bun > npm).

### themes — Browse and manage themes

```bash
pureadmin themes list                   # List all themes from API
pureadmin themes list --local           # List project-configured themes
pureadmin themes show audi              # Show theme details
pureadmin themes search "dark font"     # Search themes
pureadmin themes versions audi          # Available versions
pureadmin themes compatible 2.0.0       # Themes for a core version
pureadmin themes download audi          # Download theme ZIP
pureadmin themes add express dark       # Add themes to project
pureadmin themes add express --offline  # Add and commit to repo
pureadmin themes add audi --path ../pure-admin-themes/audi  # Local-dev override (writes to .pureadmin.json by default)
pureadmin themes update                 # Refresh: resolve latest, write the lockfile (DEV use)
pureadmin themes install                # Install exactly what the lockfile records (CI use; like npm ci)
pureadmin themes init my-theme          # Scaffold a new theme project
pureadmin themes build                  # Compile SCSS to CSS
pureadmin themes pack                   # Package into ZIP
pureadmin themes publish                # Pack + upload to pureadmin.io
pureadmin themes validate               # Check CSS quality
```

### templates — Browse and publish templates

```bash
pureadmin templates list                # List available templates from API
pureadmin templates pack                # Package into ZIP
pureadmin templates publish             # Pack + upload to pureadmin.io
```

### profiles — Company profiles

```bash
pureadmin profiles list                 # List profiles and workspace mappings
pureadmin profiles show keenmate        # Show profile details
pureadmin profiles delete keenmate      # Remove a profile
```

### presets — Saved create configurations

```bash
pureadmin presets list                  # List saved presets
pureadmin presets show my-setup         # Show preset details
pureadmin presets delete my-setup       # Remove a preset
```

## Configuration

JSON files at three levels for global config, plus a project-local lockfile. Modeled on npm's `package.json` / `package-lock.json` split.

| File | Purpose | Check in? |
|------|---------|-----------|
| `~/.pureadmin.json` | User defaults (API URL, default target, API keys) | N/A |
| `pureadmin.json` | **Declarations**: which themes the project uses, themesDir, etc. Hand-edited by humans. | Yes |
| `pureadmin.lock.json` | **Resolutions**: resolved version + content_sha + fetched_at per theme. Tool-managed. | Yes |
| `.pureadmin.json` | **Per-developer overrides**: personal local `path`, dev API keys, etc. | No (gitignore) |

CLI flags (`--server`, `--api-key`) and env vars (`PUREADMIN_URL`, `PUREADMIN_API_KEY`) override all config files.

### pureadmin.json (declarations)

Checked into the repo. **Never modified by `themes update`** — only by explicit `themes add` / `themes remove`. So `git diff pureadmin.json` always shows intent changes only:

```json
{
  "themesDir": "static/themes",
  "themes": {
    "audi": {},
    "ayu": { "offline": true }
  }
}
```

A theme entry can be `{}` (remote, default), `{ "offline": true }` (commit theme files to repo for airgapped builds), or `{ "path": "../shared-themes/audi" }` (rare: team co-locates the source).

### pureadmin.lock.json (resolutions)

Checked into the repo. Tool-managed. Records exact resolved state per theme so installs are reproducible. Same purpose as `package-lock.json`:

```json
{
  "_format": 1,
  "themes": {
    "audi": {
      "version": "2.3.4",
      "content_sha": "sha256:abc...",
      "fetched_at": "2026-04-28T09:38:05.110Z",
      "source": "remote"
    }
  }
}
```

Updated by `themes update` (and `themes add`). Read by `themes install`. Sorted alphabetically by slug for stable diffs.

### .pureadmin.json (per-developer overrides)

Gitignored. Merges on top of `pureadmin.json` — use for personal local-path overrides and secrets:

```json
{
  "themes": {
    "audi": { "path": "../pure-admin-themes/audi" }
  },
  "targets": {
    "local": { "url": "http://localhost:8888", "apiKey": "dev-key" }
  }
}
```

Your personal `path` overrides the team's `pureadmin.json` declaration for `audi`. **Crucially, `themes update` will not write your override into `pureadmin.json`** — that file stays pristine. Only your own `pureadmin.lock.json` will record the resolved version under your local source path.

### `themes update` vs `themes install`

| | `themes update` | `themes install` |
|---|---|---|
| **Purpose** | "I want fresh versions" | "Reproduce what the lockfile records" |
| **Use case** | Developer iterating | CI pipeline / fresh clone |
| **Reads from** | API (or local `path`) | Lockfile (then API at the recorded version) |
| **Writes to** | `pureadmin.lock.json` | nothing |
| **Fails if lockfile out of sync** | No (it updates the lockfile) | Yes (with hint to run `update`) |

Use `themes update` locally when you want to bump theme versions, then commit the resulting lockfile diff. Your CI pipeline should call `themes install` so it always installs exactly what was reviewed and merged.

### ~/.pureadmin.json (user defaults)

Base defaults for all projects. On Windows: `C:\Users\<username>\.pureadmin.json`

```json
{
  "url": "https://pureadmin.io",
  "apiKey": "your-default-key",
  "companies": {
    "keenmate": {
      "name": "KeenMate s.r.o.",
      "copyright": "© 2026 KeenMate s.r.o.",
      "defaultThemes": "corporate,audi,dark",
      "defaultTheme": "corporate"
    }
  },
  "workspaces": {
    "C:/Git/KM": {
      "defaultCompany": "keenmate",
      "companies": ["keenmate", "babetti"]
    }
  }
}
```

**Workspace detection:** When you run `pureadmin create` from a directory matching a workspace path (e.g. `C:\Git\KM\my-project`), the matching company profile is auto-selected. The wizard filters to workspace companies and preselects `defaultCompany`.

## License

MIT
