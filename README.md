# @keenmate/pureadmin

The official CLI for [Pure Admin](https://github.com/keenmate/pure-admin) — a lightweight, data-focused CSS/SCSS admin framework built for real applications.

Build themes, validate accessibility, scaffold apps, and publish to [pureadmin.io](https://pureadmin.io).

## What's New

### v1.1.0
- **Asset manifest audit** — `themes pack` and `themes validate` now cross-check `assets/` folder, `theme.json` declarations, and CSS `url()` refs. Catches the case where a font is used in CSS but not listed in the manifest (would 404 after publish).
- **`themes lint`** (new command) — quality/accessibility recommendations: WCAG contrast ratios for buttons and color slots, hardcoded border-radius detection. Advisory only; never exits non-zero.
- **`themes validate` is now a hard correctness gate** — checks asset manifest, required `--pa-*` CSS variables, color slot definitions. Exits non-zero on errors so it works in CI. Soft checks (contrast, hardcoded values) moved to `themes lint`.
- **Auto theme mode** — new apps default to `--default-mode auto`, which follows the OS `prefers-color-scheme` at runtime instead of being locked to dark. Wizard offers an "Auto — follow OS" option per theme.
- **Provenance-annotated profiles** — `create` now tracks where every resolved input came from (CLI flag / preset / company / workspace / default). New `ORG_PROFILE` and `APP_PROFILE` README placeholders render the company profile and resolved app inputs as markdown bullet lists with muted `_(source)_` suffixes.

### v1.0.1
- **Config deep merge** — project-level `.pureadmin.json` with `targets` no longer nukes home-level apiKeys
- **`--heroicons`** for Phoenix — Heroicons (built into Phoenix, no CDN needed) as alternative to Font Awesome
- **`lib/create/icons.js`** — extracted icon maps (FA, Heroicons, Lucide) with `resolveIconAttr` and `resolveIconMarkup` for templates
- **Makefile ecto-create** — gracefully skips when Ecto not installed (`--no-ecto` apps)
- **Endpoint URL display** — Phoenix config patched to show `http://localhost:4000` instead of `http://localhost`

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
