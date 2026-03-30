# @keenmate/pureadmin

CLI for building, publishing, and consuming [Pure Admin](https://pureadmin.io) themes. Scaffold apps, manage theme packages, and integrate with pureadmin.io.

## Usage

```bash
npx @keenmate/pureadmin <command> [options]
```

Or install globally:

```bash
npm install -g @keenmate/pureadmin
pureadmin <command> [options]
```

## Commands

### build — Compile SCSS to CSS

```bash
# Build all themes in workspace
pureadmin build

# Build specific theme(s)
pureadmin build audi corporate
```

Works in multi-theme workspaces (directories with `theme.json`) and single-theme projects.

### pack — Package theme into ZIP

```bash
# Build + pack all themes
pureadmin pack

# Pack specific theme(s)
pureadmin pack audi

# Pack without building (use existing CSS)
pureadmin pack audi --no-build
```

Computes SHA-256 checksums for all files, metadata hash, `content_sha`, detects external domains in CSS, and rejects undeclared JavaScript.

### publish — Pack + upload to pureadmin.io

```bash
# Build + pack + upload all themes
pureadmin publish

# Publish specific theme
pureadmin publish audi

# With explicit API key
pureadmin publish audi --api-key YOUR_KEY
```

API key resolution (in order of precedence):
1. `--api-key` flag
2. `.pureadmin.json` → `apiKey` (gitignored, local overrides)
3. `pureadmin.json` → `apiKey` (project config)
4. `~/.pureadmin.json` → `apiKey` (user defaults)
5. `$PUREADMIN_API_KEY` environment variable

### validate — Check theme CSS quality

```bash
# Validate all themes in workspace
pureadmin validate

# Validate specific theme
pureadmin validate audi
```

Checks:
- **Readability** — WCAG contrast ratios for outline/filled buttons and color slots per mode (dark/light)
- **CSS Variables** — Required `--pa-*` variable definitions
- **Consistency** — Hardcoded border-radius values that should use CSS variables

### list — List all themes

```bash
pureadmin list
```

Shows all available themes with slug, version, and tags.

### info — Show theme details

```bash
pureadmin info audi
```

Output includes versions, core compatibility, font, tags, variants, and content SHA.

### versions — Show available versions

```bash
pureadmin versions audi
```

### search — Search themes

```bash
pureadmin search dark
pureadmin search "custom font"
```

### compatible — List compatible themes

Filter themes by pure-admin-core version:

```bash
pureadmin compatible 2.0.0
```

### download — Download a theme ZIP

```bash
# Latest version
pureadmin download audi

# Specific version
pureadmin download audi --version 2.0.2

# Custom output filename
pureadmin download audi --output my-theme.zip
```

### themes — Manage project themes

List configured themes:

```bash
pureadmin themes
```

Add themes to your project (downloads + extracts to the configured directory):

```bash
# Add a single theme
pureadmin themes express

# Add multiple themes
pureadmin themes audi dark express

# Offline mode — theme files committed to repo for builds without network
pureadmin themes express --offline

# Custom output directory
pureadmin themes express --dir public/themes
```

Theme configuration is saved to `pureadmin.json`:

```json
{
  "themesDir": "static/themes",
  "themes": {
    "audi": { "version": "2.0.2", "content_sha": "sha256:61df...", "offline": false },
    "express": { "version": "2.0.2", "content_sha": "sha256:1d77...", "offline": true }
  }
}
```

- **online** (`--offline` not set) — theme files are re-downloaded on `pureadmin update`. Gitignore them.
- **offline** (`--offline`) — theme files are committed to the repo. Build pipelines work without network access. `pureadmin update` still refreshes them when run with network.

### update — Update themes

Checks each configured theme's `content_sha` against the server and re-downloads only what changed:

```bash
pureadmin update
```

### init — Scaffold a new theme project

Creates a theme package project with template files and development tools:

```bash
pureadmin init my-theme "My Custom Theme"
cd my-theme
npm install
npm run build
npm run pack
```

### create — Create a SvelteKit app

Scaffolds a SvelteKit app with Pure Admin components, theme switching, and FOUC prevention:

```bash
pureadmin create my-app
pureadmin create my-app --themes audi,dark --theme audi
```

Options:

| Flag | Description |
|------|-------------|
| `--template <name>` | App template (default: `sveltekit`) |
| `--themes <list>` | Comma-separated theme slugs (default: `corporate,audi,dark`) |
| `--theme <slug>` | Default theme (default: first in `--themes`) |

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
  "apiKey": "your-default-key"
}
```

## Links

- [pureadmin.io](https://pureadmin.io) — theme gallery
- [Documentation](https://pureadmin.io/docs) — guides for using and creating themes
- [API Reference](https://pureadmin.io/api) — REST endpoints
- [GitHub](https://github.com/keenmate/pure-admin) — Pure Admin framework

## License

MIT
