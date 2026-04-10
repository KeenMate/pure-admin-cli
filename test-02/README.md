# KeenMate s.r.o.

Phoenix LiveView application built with [Pure Admin](https://pureadmin.io) — a lightweight, data-focused CSS/SCSS admin framework wrapped into LiveView components via [`keen_pure_admin`](https://hex.pm/packages/keen_pure_admin).

This project was scaffolded with the [PureAdmin CLI](https://www.npmjs.com/package/@keenmate/pureadmin):

```bash
npx @keenmate/pureadmin create test-02 --template elixir-phoenix-liveview --themes express --profile-panel --company keenmate
```

## Prerequisites

- Elixir `~> 1.15`
- Erlang/OTP 26+
- PostgreSQL (if Ecto is enabled)
- Node.js (only to run the PureAdmin CLI for theme management)

## Quick start

```bash
make setup     # fetch deps, download themes, create DB, build assets
make dev       # start Phoenix server at http://localhost:4000
```

Or step by step:

```bash
mix deps.get
mix ecto.create
mix phx.server
```

## Make commands

| Command | What it does |
|---|---|
| `make help` | Show all available targets |
| `make setup` | Full setup: deps + themes + DB + assets |
| `make deps` | Fetch Elixir dependencies |
| `make server` / `make dev` | Start Phoenix server |
| `make build` | Compile the project |
| `make assets` | Build JS/CSS assets via esbuild |
| `make themes` | Download configured Pure Admin themes |
| `make themes-update` | Re-download themes that have changed |
| `make ecto-create` | Create the database |
| `make ecto-reset` | Drop and recreate the database |
| `make format` | Format Elixir code |
| `make test` | Run the test suite |
| `make clean` | Clean build artifacts |

## Configuration

The project follows the standard Phoenix config layout, with one addition for local overrides.

### `config/` layout

| File | Env | Committed | Purpose |
|---|---|---|---|
| `config.exs` | all | ✓ | Shared configuration loaded first |
| `dev.exs` | `:dev` | ✓ | Development defaults (safe to commit) |
| `test.exs` | `:test` | ✓ | Test configuration |
| `prod.exs` | `:prod` | ✓ | Production compile-time settings |
| `runtime.exs` | all | ✓ | Runtime config (reads env vars in prod) |
| `.local.exs` | all | ✗ | **Personal dev overrides (gitignored)** |

### Local development overrides — `config/.local.exs`

This file is gitignored and loaded by `config.exs` at the very end. Use it for personal dev-only overrides (database credentials, custom port, disabling features locally) without touching committed files.

**Example `config/.local.exs`:**

```elixir
import Config

# Custom database credentials
config :test_02, Test02.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "test_02_dev"

# Custom port (default is 4000)
config :test_02, Test02Web.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4030]

# Disable the FOUC (flash of unstyled content) prevention while debugging themes
# config :keen_pure_admin, fouc_prevention: false
```

The `.local.exs` file is only created when you need it. It's automatically loaded when present — no additional setup required.

### Production — `config/runtime.exs`

Production uses environment variables read at runtime (not at compile time). Set these in your deployment environment:

| Variable | Purpose |
|---|---|
| `SECRET_KEY_BASE` | Phoenix session secret (generate with `mix phx.gen.secret`) |
| `PHX_HOST` | Your public hostname (e.g. `app.example.com`) |
| `PORT` | HTTP port (default `4000`) |
| `DATABASE_URL` | Full Postgres URL (e.g. `ecto://user:pass@host/db`) |
| `POOL_SIZE` | DB connection pool size (default `10`) |
| `PHX_SERVER` | Set to `true` to start the HTTP endpoint |

See `config/runtime.exs` for the full list and required/optional semantics.

## Themes

Themes are managed by the PureAdmin CLI. Each theme is a self-contained CSS package that includes the core framework + typography + color variants.

### Installed themes

Configured themes are listed in `pureadmin.json`. To add more:

```bash
# Add one or more themes to this project
npx @keenmate/pureadmin themes add corporate express dark --dir priv/static/themes

# Re-download only themes whose content has changed
npx @keenmate/pureadmin themes update
```

Browse all available themes at **[pureadmin.io](https://pureadmin.io)**.

### Switching the default theme

Edit `lib/test_02_web/components/layouts/root.html.heex` and change the theme CSS link:

```heex
<link rel="stylesheet" href="/themes/<theme-slug>/css/<theme-slug>.css" />
```

Or enable runtime switching via the `SettingsPanel` component (see [keen_pure_admin docs](https://hexdocs.pm/keen_pure_admin)).

## Icons

Icons are provided by [Font Awesome 6](https://fontawesome.com) via CDN (configured in `root.html.heex`). Usage:

```heex
<i class="fa-solid fa-gauge"></i>
<.sidebar_item label="Dashboard" icon="fa-solid fa-gauge" href="/" />
```

Browse and search icons at **[icons.pureadmin.io](https://icons.pureadmin.io)** — a curated catalog with copy-to-clipboard class names across multiple icon libraries.

## Project structure

```
test-02/
├── assets/js/app.js              # LiveSocket + PureAdminHooks wiring
├── config/
│   ├── config.exs                # Shared config + PureAdmin block + .local.exs import
│   ├── dev.exs                   # Dev defaults
│   ├── prod.exs                  # Prod compile-time config
│   └── runtime.exs               # Runtime env vars (prod)
├── lib/test_02/         # Business logic, schemas, contexts
├── lib/test_02_web/
│   ├── components/layouts/       # root.html.heex + app.html.heex (PureAdmin layout)
│   ├── controllers/              # PageController, etc.
│   ├── live/                     # LiveView modules
│   └── router.ex                 # Routes + browser pipeline
├── priv/static/themes/           # Downloaded Pure Admin themes (via CLI)
└── Makefile                      # Standard dev targets
```

## Learn more

- **Pure Admin:** [pureadmin.io](https://pureadmin.io) — themes, docs, component showcase
- **keen_pure_admin:** [hexdocs.pm/keen_pure_admin](https://hexdocs.pm/keen_pure_admin) — Elixir component library docs
- **Live demo:** [elixir.demo.pureadmin.io](https://elixir.demo.pureadmin.io)
- **Icon catalog:** [icons.pureadmin.io](https://icons.pureadmin.io)
- **Phoenix LiveView:** [hexdocs.pm/phoenix_live_view](https://hexdocs.pm/phoenix_live_view)
