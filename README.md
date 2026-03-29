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
2. `pure-admin.json` → `apiKey`
3. `~/.pure-admin.json` → `apiKey`
4. `$PUREADMIN_API_KEY` environment variable

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

Theme configuration is saved to `pure-admin.json`:

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

```
  Checking 3 theme(s) for updates...
  audi: v2.0.2 → v2.1.0          ← re-downloaded
  corporate: v2.0.2 — unchanged  ← skipped
  dark: v2.0.2 — unchanged       ← skipped
  Summary: 1 updated, 2 unchanged, 0 failed
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

Configuration is resolved in order of precedence:

| Source | Description |
|--------|-------------|
| `--server <url>` | CLI flag, highest priority |
| `PUREADMIN_URL` | Environment variable |
| `pure-admin.json` | Project config (searched up from cwd) |
| `~/.pure-admin.json` | User-level defaults |
| `https://pureadmin.io` | Fallback |

### pure-admin.json

Place a `pure-admin.json` in your project root to configure the CLI and track themes:

```json
{
  "url": "http://localhost:8888",
  "themesDir": "static/themes",
  "themes": {
    "audi": { "version": "2.0.2", "content_sha": "sha256:...", "offline": false }
  }
}
```

### ~/.pure-admin.json

User-level defaults (e.g., always use a local dev server):

```json
{
  "url": "http://localhost:8888"
}
```

Project config values override user config. The `--server` flag overrides both.

## Links

- [pureadmin.io](https://pureadmin.io) — theme gallery
- [Documentation](https://pureadmin.io/docs) — guides for using and creating themes
- [API Reference](https://pureadmin.io/api) — REST endpoints
- [GitHub](https://github.com/keenmate/pure-admin) — Pure Admin framework

## License

MIT
