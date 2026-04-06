# @keenmate/pureadmin

The official CLI for [Pure Admin](https://github.com/keenmate/pure-admin) — a lightweight, data-focused CSS/SCSS admin framework built for real applications.

Build themes, validate accessibility, scaffold apps, and publish to [pureadmin.io](https://pureadmin.io).

## What's New

### v1.0.0-rc08
- **Interactive wizard** — `pureadmin create` with no args launches a guided setup using @clack/prompts
- **Icon providers** — `--font-awesome` (default), `--lucide`, `--fluent-ui` with `__ICON:name__` placeholders
- **Template operations API** — `template.helper.js` exports `addDependency`, `inject`, `addRoute`, `addSidebarItem` etc., called via `{ "action": "call" }` recipe steps
- **Wizard presets** — save/load create configurations, workspace-based company auto-detection
- **Consistent CLI structure** — `themes/templates/profiles/presets` with `list`, `show`, `delete` subcommands

### v1.0.0-rc07
- **Condensed wizard** — parallel data loading, combined selects, ~5 prompts instead of 10+
- **Theme variant + mode selection** — pick default appearance from theme metadata
- **`create-if` pipeline action** — conditional file creation based on feature flags
- **CLI split into 14 modules** — `lib/` structure, 33 tests

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
pureadmin themes update                 # Re-download changed themes
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

All configuration is JSON. Three levels, merged in order (later overrides earlier):

| File | Purpose | Check in? |
|------|---------|-----------|
| `~/.pureadmin.json` | User defaults (API URL, key) | N/A |
| `pureadmin.json` | Project config (themes, URL) | Yes |
| `.pureadmin.json` | Local overrides (API key) | No (gitignore) |

CLI flags (`--server`, `--api-key`) and env vars (`PUREADMIN_URL`, `PUREADMIN_API_KEY`) override all config files.

### pureadmin.json (project config)

Checked into the repo. Tracks themes and project settings:

```json
{
  "url": "https://pureadmin.io",
  "themesDir": "static/themes",
  "themes": {
    "audi": { "version": "2.3.2", "content_sha": "sha256:...", "offline": false }
  }
}
```

### .pureadmin.json (local overrides)

Gitignored. Merges on top of `pureadmin.json` — use for secrets:

```json
{
  "apiKey": "your-api-key-here"
}
```

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
