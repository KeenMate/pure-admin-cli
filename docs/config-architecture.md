# Configuration Architecture

> Reference doc for future maintainers. Describes how pureadmin reads, merges, and writes its JSON config files. If you're touching `lib/config.js` or any `themes` command, read this first.

## TL;DR

Four config files, two merge strategies, three save targets, one provenance-aware view.

```
                                        ┌──────────────────────┐
~/.pureadmin.json (global, base)     →  │                      │
./pureadmin.json (project, declared) →  │  loadConfig() flat   │  ← what targets, apiKeys,
./.pureadmin.json (project, secrets) →  │  merge for top-level │     timeouts, themesDir read
                                        └──────────────────────┘

                                        ┌──────────────────────┐
./pureadmin.json                     →  │  loadProjectConfig() │
./.pureadmin.json                    →  │  layered structure   │  ← what `themes` commands use
./pureadmin.lock.json                →  │  + per-theme merge   │
                                        │  + provenance        │
                                        └──────────────────────┘
```

`loadConfig()` is for global stuff that any command might need. `loadProjectConfig()` is for theme-specific stuff that only `themes` commands need.

## The four files

### `~/.pureadmin.json` — user defaults

Lives in your home directory (`$HOME` on Unix, `%USERPROFILE%` on Windows). Hand-edited. Personal to you, never checked into anything.

Contains:
- Personal API keys (top-level `apiKey`, or under a `targets.<name>.apiKey`)
- Default API target (`defaultTarget` + `targets` block)
- Companies, workspaces, presets (used by `pureadmin create`)
- HTTP timeouts, extractor preference, verbose flag

This is the only file that's truly *global* — applies regardless of which project you `cd` into.

### `./pureadmin.json` — project declarations

Lives at the project root. **Hand-edited by humans, checked in.** This is the team-shared statement of intent.

Contains:
- `themesDir` — where theme assets get extracted (`static/themes` for SvelteKit, `public/themes` for Vite, etc.)
- `themes` — declarations: which themes the project uses, and for each one, where it's sourced from. Entry shape:
  - `{}` — remote, fetched from pureadmin.io (default)
  - `{ "offline": true }` — remote, but commit theme files into the repo (for airgapped builds)
  - `{ "path": "../shared-themes/audi" }` — local source (rare; for teams that genuinely co-locate theme source alongside the project)

**Rule: this file is never modified by automated commands.** Only explicit `themes add` and `themes remove` touch it. `themes update` writes the lockfile, not this. So `git diff pureadmin.json` always shows changes in human intent.

### `./pureadmin.lock.json` — project resolutions

Lives at the project root. **Tool-managed, checked in.** Modeled on `package-lock.json`. Read by `themes install` and `themes ci`; written by `themes install`, `themes update`, and `themes add`. Humans don't edit this directly.

Shape:
```json
{
  "_format": 1,
  "themes": {
    "audi": {
      "version": "2.3.4",
      "content_sha": "sha256:abc...",
      "fetched_at": "2026-04-28T09:38:05.110Z",
      "source": "remote"
    },
    "ayu": {
      "version": "2.3.4",
      "content_sha": null,
      "fetched_at": "2026-04-28T09:38:06.220Z",
      "source": "../pure-admin-themes/ayu"
    }
  }
}
```

Per-theme fields:
- `version` — the resolved version string. Required.
- `content_sha` — content hash from the API. `null` for local-path themes (we don't compute it for arbitrary directories).
- `fetched_at` — ISO timestamp of when this entry was last written.
- `source` — `"remote"` for API-fetched themes, or the source path string for local-path themes. Diagnostic only — `themes install` uses the declared source from `pureadmin.json` / `.pureadmin.json`, not this field.

`_format` is the lockfile schema version. If we ever change the lockfile shape incompatibly, bump this and have `loadProjectConfig` migrate or refuse to read older versions.

The themes block is sorted alphabetically by slug on save, for stable diffs.

### `./.pureadmin.json` — per-developer overrides

Lives at the project root. **Hand-edited, gitignored.** Personal to whoever's working on the project on this machine.

Contains:
- Personal `themes.<slug>.path` overrides (one developer reworks `audi` locally; everyone else uses the API version)
- Project-specific API keys / dev targets (`targets.local: { url, apiKey }`)
- Anything else that's per-developer and not for the team

The bare-string shorthand for theme entries works here for backward compatibility:
```json
{
  "themes": {
    "audi": "../pure-admin-themes/audi"
  }
}
```
Auto-promoted to `{ "path": "../pure-admin-themes/audi" }` on read by `loadProjectConfig` so callers always see the object form.

## The two load functions

### `loadConfig()` — flat global merge (in `config.js`)

Walks: `~/.pureadmin.json` → walks up from `cwd` looking for the first directory containing either `pureadmin.json` or `.pureadmin.json`, then loads both from that directory.

Returns a single flat object with everything deep-merged, deeper-priority files winning.

Used by `cli.js` (for `resolveTarget`, `setBaseUrl`, `setTimeouts`, `setExtractor`, `setFsVerbose`) and by every command that reads top-level config (`templates`, `theme-publish`, `profiles`, `create`, `create-interactive`).

**Important:** `loadConfig` does NOT read `pureadmin.lock.json` — the lockfile is only for theme-resolution metadata, not for global settings. If you ever decide to put non-theme metadata in the lockfile, this needs to be revisited.

### `loadProjectConfig()` — layered structure with provenance (in `config.js`)

Walks: walks up from `cwd` looking for the first directory containing ANY of `pureadmin.json` / `.pureadmin.json` / `pureadmin.lock.json`. Treats that directory as `projectRoot`. Loads each file (defaulting to empty when absent).

Returns:

```js
{
  baseFile,    baseData,    // ./pureadmin.json + parsed contents
  localFile,   localData,   // ./.pureadmin.json + parsed contents
  lockFile,    lockData,    // ./pureadmin.lock.json + parsed contents
  data,                     // top-level merged view (deepMerge of base + local), for themesDir/etc.
  themes,                   // per-theme merged view with provenance
  projectRoot,              // path to the directory the three files live in
}
```

Used **only** by `lib/commands/themes.js`. No other command reads it.

#### The `themes` view

For each slug that appears in any of the three layers, `themes[slug]` contains:

```js
{
  // Declarations (deep-merged; localData wins on conflict)
  path?,            // from base or local
  offline?,         // from base (offline is a team-wide statement)
  // Resolutions (from lockData, if present)
  version?,
  content_sha?,
  fetched_at?,
  source?,
  // Provenance — which layers declared this theme
  _layers: { base, local, lock },  // booleans
}
```

`_layers` lets command code make decisions like:
- "Save this theme back to whichever layer originally declared it" (so a base-only theme stays in base, a local-only theme stays in local, a both-layers theme has its declarations split).
- "Display this theme as a personal override" if `_layers.local` is true.
- "Refuse to install this theme if `_layers.lock` is false" — that's `themes ci`'s consistency check.

#### Critical detail: immutable merge for the top-level `data` view

```js
const data = deepMerge(deepMerge({}, baseData), localData);
```

We use the **immutable** `deepMerge` here, not the in-place `deepMergeInto`. The in-place version would alias nested objects between `data`, `baseData`, and `localData` — so mutating `data.themes[slug]` (which command code might do for convenience) would silently mutate `baseData.themes[slug]` through the shared reference. A subsequent `saveBaseConfig` would then write the local override into `pureadmin.json` — which is exactly the leak this whole refactor was designed to prevent.

If you ever change this merge call, **read the regression test in `test/config.test.js: "saveBaseConfig writes only baseData (local override does not leak in)"`** — it catches the alias bug.

## The three save functions

```js
saveBaseConfig(baseFile, baseData)    // writes pureadmin.json
saveLocalConfig(localFile, localData) // writes .pureadmin.json (no-op if localData is empty)
saveLockData(lockFile, lockData)      // writes pureadmin.lock.json (sorted, with _format)
```

There is **no merged save**. The merged blob is never round-tripped through a single save — that was the previous bug. Each layer is written explicitly with the layer-appropriate data.

`saveLocalConfig` skips writing entirely when `localData` is empty (or contains only `{ themes: {} }`). This avoids creating a stale `.pureadmin.json` on disk when a developer clears all their overrides.

`saveLockData` always carries `_format` and sorts theme entries alphabetically by slug.

## Save routing per command

This is the entire point of the lockfile split. The 1.3.1 invariant
**`pureadmin.lock.json` mirrors `pureadmin.json` exclusively** is what makes
the columns below predictable — `.pureadmin.json` never causes a lock write,
ever.

| Command | Writes |
|---|---|
| `themes install` | `pureadmin.lock.json` (only when a base-declared theme was resolved fresh, a leaked path-source lock entry was healed, or a stale entry was pruned) |
| `themes update` | `pureadmin.lock.json` only |
| `themes ci` | nothing |
| `themes add <id>` | `pureadmin.json` (declarations) + `pureadmin.lock.json` (resolutions) |
| `themes add <id> --path <dir>` (default) | `.pureadmin.json` only — **never the lock** |
| `themes add <id> --path <dir> --shared` | `pureadmin.json` (declarations) + `pureadmin.lock.json` (resolutions) |
| `themes list --local` | nothing |
| `themes show / search / versions / compatible / download` | nothing (browse-only API calls) |

`pureadmin.json` is touched only when a human explicitly adds or removes a theme. So `git status` after `themes install` or `themes update` shows only `pureadmin.lock.json`.

`themes install` separates "what to put on disk" (uses the merged view, so a `.pureadmin.json` `path` override snapshots from the path) from "what to write to the lock" (uses `pureadmin.json` exclusively). When base declares registry but the lock entry has a path source — the leaked-from-1.3.0 case — the entry is treated as missing and re-resolved fresh from the registry. So an existing polluted lockfile self-heals on next install.

## Auto-migration: legacy schema → new schema

For backward compatibility with projects that have the old shape (resolved fields like `version` / `content_sha` baked into `pureadmin.json`), `loadProjectConfig` calls `hoistResolvedFieldsToLock` on `baseData` and `stripResolvedFields` on `localData`:

1. **`baseData`** — walks every theme entry. If the entry has any of `version` / `content_sha` / `fetched_at`, removes those fields from the entry **in memory only**. Creates a corresponding lockfile entry from the hoisted fields, **only if no lockfile entry already exists** for that slug (the lockfile is more authoritative than a stale inline version field). The `source` field on the new lock entry is set to the entry's `path` if any, else `"remote"`.
2. **`localData`** — walks every theme entry and **strips** `version` / `content_sha` / `fetched_at` from the entry in memory. Does NOT hoist them anywhere. The lock mirrors `pureadmin.json` exclusively, and a personal override is a runtime overlay that never contributes a lock entry. Legacy projects where someone wrote a `version` into `.pureadmin.json` simply lose it on first read; `themes install` resolves the base declaration fresh from the registry next time.

**The base file isn't physically rewritten until something else triggers a save** (e.g. `themes add` or `themes remove`). At that point `saveBaseConfig` writes the cleaned-up declarations-only shape. So the migration is *opportunistic*, not forced. A project that only ever runs `themes install`, `themes update`, or `themes ci` will keep its legacy shape forever and that's fine — the in-memory hoist makes everything Just Work.

The bare-string promotion (`{ "audi": "../path" }` → `{ "audi": { "path": "../path" } }`) works the same way: applied in memory by `promoteBareStringThemes`, persisted to disk only on a subsequent save.

## Bare-string entry corruption (historical bug)

Before the auto-promotion, a `.pureadmin.json` entry like `{ "audi": "../path" }` would survive a deep-merge as a bare string. Command code that did `data.themes[slug] = { ...info, version }` (where `info` was the bare string) would spread the string into character-indexed keys: `{ "0": ".", "1": ".", ..., "version": "2.3.4" }`. The corruption would then get written back to `pureadmin.json` on the next save. This was the original motivation for the layered refactor.

`promoteBareStringThemes` and the regression tests in `test/config.test.js` guard against this.

## API key resolution

This is independent of the project config refactor — it uses `loadConfig()` (the flat merger), not `loadProjectConfig()`. The chain in `lib/commands/templates.js` and `lib/commands/theme-publish.js`:

```
opts.apiKey                      ← --api-key flag, or stashed by cli.js from resolveTarget()
  || config.apiKey               ← top-level merged config (any of the JSON files, deepest wins)
  || PUREADMIN_API_KEY env var   ← fallback
```

`resolveTarget(opts.server)` (called by `cli.js` before any command runs) resolves a target name (`--server production`) or raw URL into `{ url, apiKey, source }`. The apiKey there comes from `config.targets[name].apiKey`. If a target is resolved and has an apiKey, `cli.js` stashes it on `opts.apiKey` so commands can read it.

Where to put an apiKey:
- `~/.pureadmin.json` top-level — global default, used everywhere. Most common.
- `./.pureadmin.json` top-level — project-specific override. Use when this project needs a different key than your default.
- `./.pureadmin.json` under `targets.<name>.apiKey` — when you switch between targets via `--server`.
- **Never** in `./pureadmin.json` — that's checked in.

## Adding a new top-level config field

If you add a new top-level field (like a new global preference), follow the existing `themesDir` pattern:

1. It's automatically picked up by both `loadConfig()` (for top-level reads anywhere) and `loadProjectConfig().data` (for project-scoped reads).
2. If a command needs to write it, route through `saveBaseConfig(proj.baseFile, proj.baseData)` after mutating `proj.baseData`.
3. Don't put it in the lockfile unless it's specifically about resolved theme metadata.

## Adding a new per-theme field

Decide whether the new field is a **declaration** (intent) or a **resolution** (machine state):

- **Declaration** (e.g. "this theme has its own custom CSS variants enabled") → goes into `pureadmin.json` (or `.pureadmin.json` for per-developer). Read from `proj.themes[slug]` (it'll be merged in from the layer it lives in).
- **Resolution** (e.g. "the file size of the last download") → goes into `pureadmin.lock.json`. Read from `proj.themes[slug]` (the lock fields are merged in). Write by mutating `proj.lockData.themes[slug]` and calling `saveLockData`.

If unsure, ask: "would two developers on the same project want different values for this?" Yes → local override. "Is this the result of a successful command run?" Yes → lockfile. Otherwise → base declarations.

## Tests

`test/config.test.js` — unit tests covering:
- `tryLoadJson` / `TOOL_VERSION` basics.
- Bare-string promotion in `.pureadmin.json` doesn't corrupt anything.
- Merged themes view exposes the promoted path with correct `_layers` provenance.
- **`saveBaseConfig` does NOT leak local overrides into `pureadmin.json`** (the regression test for the entire refactor).
- `saveLockData` writes resolved fields only into the lockfile, not into the base file.
- `saveLocalConfig` is a no-op when localData is empty (avoids stale `.pureadmin.json`).
- Lockfile entries are sorted alphabetically by slug.

If you change `loadProjectConfig` or any of the save functions, run these and add new tests for any new behavior.

## Common gotchas

- **Don't reach for `proj.data.themes`** — `data` is the merged top-level view, but it doesn't carry layer provenance. Always use `proj.themes[slug]` for per-theme reads. The `data` view is for top-level fields like `themesDir`.
- **Don't call `deepMergeInto(data, baseData)` to compute the merged view.** Use `deepMerge` (immutable). The in-place version aliases nested objects and reintroduces the leak.
- **Don't mutate `proj.themes[slug]` and expect it to persist.** That's the merged-with-provenance VIEW. To persist, mutate the appropriate raw layer (`proj.baseData.themes[slug]` or `proj.localData.themes[slug]` or `proj.lockData.themes[slug]`) and call the matching save function.
- **Don't write to `pureadmin.json` from a command other than `themes add`/`themes remove`.** That's the whole contract. If you need to record state, it goes in the lockfile.

## File naming

- Convention: `pureadmin.lock.json` (with the dot, like `package-lock.json`). Not `pureadmin-lock.json` or `pureadmin.lockfile`.
- The hidden override file is `.pureadmin.json` (with the leading dot, gitignored by convention).
