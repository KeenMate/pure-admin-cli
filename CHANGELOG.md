# Changelog

## [1.3.0] - 2026-04-30

### Added — three-file project config (lockfile split)

The project config is now split across three files, modeled on the
`package.json` / `package-lock.json` convention:

- **`pureadmin.json`** — declarations only: which themes the project uses, and
  for each theme whether it's sourced from the API or from a path. Hand-edited
  by humans, checked in, and now **never modified by `themes update` or any
  other automated command**.
- **`pureadmin.lock.json`** *(new, checked in)* — the resolved state: the
  exact `version`, `content_sha`, `fetched_at`, and `source` per theme. Same
  shape and purpose as `package-lock.json`. Tool-managed; humans don't edit it
  directly.
- **`.pureadmin.json`** *(unchanged, gitignored)* — per-developer overrides:
  a personal local `path` for a theme they're reworking, dev API keys, etc.

The previous footgun was that `themes update` (and `themes add`, etc.)
mutated and re-saved the entire merged blob into `pureadmin.json`. So if a
developer added a personal `--path` override in `.pureadmin.json`, the next
`themes update` would silently bake that personal path into the team-shared
`pureadmin.json` — a guaranteed conflict on the next `git pull`. The
lockfile split eliminates this entirely: each command writes only the
file(s) appropriate for the change it's making.

### Added — three install verbs that mirror npm

| pureadmin verb | npm equivalent | Behavior |
|---|---|---|
| `themes install` | `npm install` | Default dev/setup verb. Lock present → install from lock. Lock missing or some declared theme not yet locked → resolve fresh from API (filtered by core version), download, write lockfile. |
| `themes update` | `npm update` | Bump every declared theme to the latest version compatible with the project's pure-admin-core. Re-download changed ones. Rewrite lockfile. |
| `themes ci` | `npm ci` | Strict reproduce. Fail if declarations and lock are out of sync, never write. CI use. |

`themes install` is the default — fresh clones, "get this project running"
flows. `themes update` is the deliberate "bump versions" verb. `themes ci`
is the strict CI verb that fails fast on lockfile drift instead of
silently advancing versions mid-pipeline.

### Added — theme resolution filtered by `@keenmate/pure-admin-core` version

`themes install`, `themes update`, and `themes add` auto-detect the
project's `@keenmate/pure-admin-core` version and pass it to the API as
`?core_version=X` so themes resolve to versions compatible with the
project's CSS framework. Detection probes:

1. `<projectRoot>/package.json` (Svelte / generic npm projects)
2. `<projectRoot>/assets/package.json` (Phoenix LiveView projects)

The resolved version in `node_modules/@keenmate/pure-admin-core/package.json`
wins over the declared range; declared ranges are stripped to their concrete
lower bound (e.g. `^2.5.0` → `2.5.0`). Non-version specifiers (`latest`,
`file:...`, `github:...`) skip the filter and warn — themes resolve to
absolute latest in that case.

### Added — `themes add --path <dir> [--shared]`

`themes add --path <dir>` now writes to `.pureadmin.json` (per-developer
override) by default, since the typical scenario is one developer reworking
a theme that the rest of the team consumes from the API. Pass `--shared` to
write to `pureadmin.json` instead — for the rare case where the team
genuinely co-locates theme source alongside the project.

### Changed — save routing per command

| Command | Writes |
|---|---|
| `themes install` | `pureadmin.lock.json` (only when something resolved fresh) |
| `themes update` | `pureadmin.lock.json` (always) |
| `themes ci` | nothing |
| `themes add <id>` | `pureadmin.json` (declarations) + `pureadmin.lock.json` (resolutions) |
| `themes add <id> --path <dir>` | `.pureadmin.json` (default) or `pureadmin.json` (`--shared`) + `pureadmin.lock.json` |

`pureadmin.json` is touched only when a human explicitly adds or removes a
team-shared theme. `git diff pureadmin.json` now shows intent changes only;
version movements show up in `git diff pureadmin.lock.json` for review.

### Changed — `pureadmin.json` schema for new projects

The `themes` block in `pureadmin.json` now contains declarations only:

```json
{
  "themes": {
    "audi": {},
    "ayu": { "offline": true }
  }
}
```

`version`, `content_sha`, and `fetched_at` are no longer written here —
they live in `pureadmin.lock.json`. `pureadmin create` now writes both
files. **Existing projects with the old shape continue to work**:
`loadProjectConfig` auto-migrates any `version` / `content_sha` /
`fetched_at` fields it finds in `pureadmin.json` into the lockfile in
memory. The base file isn't physically rewritten until a `themes add` /
`themes remove` triggers a base save, at which point the inline resolved
fields are stripped.

### Changed — `pureadmin create` no longer ships `pureadmin.json`

`pureadmin create` now generates `pureadmin.json` from `--themes` and
`recipe.themeSetup.themesDir`, then runs `themes install` to download themes
and write `pureadmin.lock.json`. Same flow a fresh-cloned project would use.
Templates no longer ship `template/pureadmin.json` — `themeSetup.themesDir`
in each `template.json` is the single source of truth for where themes are
extracted (`static/themes` for sveltekit, `public/themes` for spa,
`priv/static/themes` for phoenix). Phoenix LiveView projects now get a
`pureadmin.json` for free (was previously missing).

### Migration

For existing projects:

1. Run `pureadmin themes install` once. The auto-migration in
   `loadProjectConfig` hoists any inline `version` / `content_sha` /
   `fetched_at` fields from `pureadmin.json` into the lockfile in memory,
   and `themes install` then writes `pureadmin.lock.json` to disk.
2. Commit `pureadmin.lock.json` alongside `pureadmin.json`.
3. (Optional) Hand-edit `pureadmin.json` to remove the now-redundant `version`
   / `content_sha` fields. Or wait for the next `themes add` / `themes remove`
   to do it for you.
4. Update CI to call `pureadmin themes ci` instead of any prior verb — it's
   the strict-reproduce verb (fails fast on lockfile drift, writes nothing).

The `.pureadmin.json` file (per-developer overrides) is unchanged.

### Internal

- `lib/config.js` — `loadProjectConfig()` now returns `{ baseFile, baseData,
  localFile, localData, lockFile, lockData, data, themes, projectRoot }`.
  `data` is the merged top-level view (for `themesDir`, `targets`, etc.);
  `themes` is the per-theme merged view with provenance (`_layers: { base,
  local, lock }`). Replaces the old `{ path, data }` return.
- `saveProjectConfig` is replaced by three separate `saveBaseConfig` /
  `saveLocalConfig` / `saveLockData`. The merged blob is never round-tripped
  through a single save — each layer is written explicitly.
- The merged `data` view is computed via the immutable `deepMerge` helper
  (not `deepMergeInto`). Prevents `data.themes[slug]` mutations from
  silently mutating `baseData.themes[slug]` through shared references — a
  subtle bug that would have re-introduced the leak the refactor was meant
  to fix.
- `loadProjectConfig` walks up from cwd looking for any of the three files
  (previously only base + local). Project root is wherever the first match
  is found.
- New tests in `test/config.test.js` exercise the layered save routing
  (asserting that local overrides do NOT leak into the base file on
  `saveBaseConfig`, and that the lockfile is sorted for stable diffs).
- New `lib/helpers/core-version.js` with `detectCoreVersion(projectRoot)`
  and `stripRangePrefix(range)`. Pure functions, 25 tests.
- `cmdInstall` / `cmdUpdate` / `cmdCi` no longer call `process.exit` — they
  return `{ installed, failed, ... }`. The router converts non-zero failure
  counts into exit codes; internal callers (like `pureadmin create`) inspect
  the result and decide whether to continue.

### Documentation

- README — config section rewritten to describe the four-file model with a
  comparison table, full schema examples for each file, and a new
  "API key resolution" subsection that walks through the resolution chain
  and recommends where to put apiKeys (home for global default,
  `./.pureadmin.json` for project-specific, `PUREADMIN_API_KEY` env var for
  CI). Plus an `install` / `update` / `ci` comparison table.
- `--llm` reference output (`pureadmin --llm`) — config-files priority list
  expanded to include `pureadmin.lock.json` and the API-key resolution chain.
  Themes section now describes the lockfile model and the update/install
  split.
- New `docs/config-architecture.md` — long-form technical reference for
  future maintainers covering: the four files and their roles, the two load
  functions (`loadConfig` vs `loadProjectConfig`), the three save functions,
  save routing per command, auto-migration of legacy schemas, the
  immutable-deepMerge gotcha (and the regression test that catches it),
  guidance on adding new top-level / per-theme fields, and the API key
  resolution chain.

## [1.2.2] - 2026-04-26 [PUBLISHED]

### Changed
- **Wildcard segments in the version comparator.** `compareVersions` (`lib/version-check.js`) now treats explicit `x` or `*` segments as wildcards rather than 0. Lets pure-admin-io advertise `max_compat: "1.2.x"` (or `latest: "1.2.x"`) once and have any `1.2.*` CLI match — no more per-patch server-config bumps. The previous coincidental `"1.2.0" === "1.2.x"` case is preserved (1.2.0 falls within the 1.2.* wildcard). Server-side `min_write` parsing is unchanged: Elixir's `Version.parse!` still rejects wildcards there, so wildcards are useful for the two CLI-checked fields (`max_compat`, `latest`) only.

## [1.2.1] - 2026-04-26 [PUBLISHED]

### Added
- **`themes add --path <dir>`** — register a theme from a local directory instead of fetching from the API. Slug is read from `<dir>/theme.json`'s `id`; if a slug arg is also passed, it's validated against the manifest. The directory contents are snapshotted to `<projectRoot>/<themesDir>/<slug>/` (excluding `.git` / `node_modules`); the destination is wiped first so leftover files from a prior version don't linger. Persisted in `pureadmin.json` as `{ "path": "...", "version": "...", "offline": false }`.
- **`themes update` re-snapshots local-path themes** from disk instead of hitting the API. `theme.json`'s version becomes the new entry version on each refresh. Lets devs iterate on a sibling theme repo (e.g. `../pure-admin-themes/audi`) and pull changes into the consuming app with a single command.
- **`themes list --local` shows path-based themes distinctly** — entries with a `path` field render as `local: <path>` instead of the online/offline label, so you can see at a glance which themes are dev-iteration sources vs. published downloads.

### Fixed
- **`loadProjectConfig` now merges `.pureadmin.json` over `pureadmin.json`** for reads. Previously only `pureadmin.json` was loaded, so all `themes` commands silently ignored entries declared in the local override file (`themes update` would print "No themes configured" even when `.pureadmin.json` listed them). Saves still target `pureadmin.json` only — overrides stay in `.pureadmin.json` as intended. Brings `loadProjectConfig` in line with the global `loadConfig` layering.

## [1.2.0] - 2026-04-26 [PUBLISHED]

### Added
- **Symmetric `if: "feature-id"` condition on recipe steps** in `lib/commands/create.js`. Previously only `unless:` was supported (skip when feature enabled); now `if:` skips when feature is disabled. Universal — applies to `delete`, `patch`, `append`, `prepend`, `create`, `json-merge`, `call`. Lets opt-in features (e.g. Phoenix template's new `--form-demo`) attach their own patches and conditional creates without abusing `create-if` (which is restricted to file creation).
- **Bidirectional CLI ↔ server version negotiation.** The CLI now sends `X-Pureadmin-Cli-Version` on every API request (Node `http.get` and both `curl` upload sites). The server (pure-admin-io) advertises four headers on every API response: `X-Pureadmin-Server-Version`, `X-Pureadmin-Cli-Latest`, `X-Pureadmin-Cli-Min-Write`, `X-Pureadmin-Cli-Max-Compat`. Server-side values live in `config :pure_admin_io, :cli_compat` and can be overridden at boot via `PUREADMIN_CLI_LATEST` / `PUREADMIN_CLI_MIN_WRITE` / `PUREADMIN_CLI_MAX_COMPAT` env vars (no recompile).
- **Soft upgrade nudge on reads.** When the server's `Cli-Latest` is newer than this CLI, a one-line `▲ A newer pureadmin is available` notice prints after the command finishes. Throttled to once per 24 h via `~/.pureadmin/.last-update-check`.
- **Hard upgrade gate on writes.** `themes publish` / `templates publish` surface a `426 Upgrade Required` response from the server (when this CLI is below the server's `Cli-Min-Write`), printing the server's `message` and the `npm i -g @keenmate/pureadmin@latest` hint instead of the previous mute "failed".
- **Server-too-old detection (CLI side).** When this CLI is newer than the server's `Cli-Max-Compat`, the very first response triggers a hard fail with a downgrade hint pointing to a CLI version compatible with that server. Prevents footguns when developing against an outdated local pureadmin.io instance.
- **`lib/helpers/upload.js`** — shared `curlUpload({ url, apiKey, fieldName, filePath })` + `parseCurlIncluded(raw)`. Replaces the duplicated `curl -sf` blocks in `theme-publish.js` and `templates.js` with one helper that captures status + headers + body (so 4xx/5xx responses surface their messages instead of being swallowed by `-f`).
- **`lib/version-check.js`** — single source of truth for the version-negotiation contract: `recordResponse(headers)` (called by `http.js` and `upload.js`), `printPendingNudge()` (wired into `lib/cli.js` `finally`), `getCliVersion()`. Includes a tolerant semver compare that handles `1.2.x`-style ranges and prerelease suffixes.

### Changed
- **Upload error handling.** Both publish commands now distinguish 200 / unchanged / 426 / other-error and report each with its own status line + colored label.
- **`themes download` error message.** When invoked without a slug, the error now points to `themes add <slug>` / `themes update` for project-driven flows (those use `pureadmin.json`) instead of leaving users to wonder why the project file wasn't picked up.

## [1.1.0] - 2026-04-17 [UNPUBLISHED]

### Added
- **Asset manifest audit** (`lib/asset-manifest.js`) — cross-checks `assets/` folder, `theme.json` declarations, and CSS `url()` references. Catches the case where CSS uses a font that isn't listed in `theme.json` (file gets omitted from the zip → 404 after publish).
- **`themes pack` blocks bad packs** — undeclared CSS asset references and manifest-declared files missing on disk now stop the zip with a red error pointing to the fix. Files in `assets/` not declared in `theme.json` are flagged as yellow warnings.
- **`themes lint` (new command)** — quality/accessibility recommendations: WCAG contrast ratios for buttons and color slots, hardcoded border-radius detection. Advisory only; never exits non-zero.
- **Auto mode** — `--default-mode auto` (and new default for fresh apps) follows the OS `prefers-color-scheme` at runtime. Wizard offers an "Auto — follow OS" option per theme alongside the theme's declared modes.
- **Provenance tracking for `create`** — every resolved input (company, template, themes, default theme, display name, copyright, icon provider, default mode) now records where it came from (CLI flag / preset / company / workspace default / built-in fallback).
- **`ORG_PROFILE` and `APP_PROFILE` README placeholders** — new `setProfiles` preparator (`lib/create/preparators.js`) renders the raw company profile and the resolved app inputs as markdown bullet lists, each value annotated with a muted `_(source)_` suffix. Templates can drop these placeholders into their generated README.
- **`--default-mode` validation** — CLI rejects values outside `light|dark|auto` before the pipeline starts.
- **`templates validate` (new command)** — verifies manifest integrity before publish. Checks required fields (id, name, version), required structure (`template/` dir), and cross-checks declared checksums against actual file contents. Catches the stale-manifest case that causes server-side upload rejections.
- **`archiver` runtime dependency** — added to enable cross-platform zip creation in `templates pack` (previously relied on platform-specific PowerShell + Python fallbacks).
- **Configurable HTTP timeouts** — `pureadmin.json` / `~/.pureadmin.json` now honors optional top-level `"timeout"` (default 10000 ms, applies to API fetches) and `"downloadTimeout"` (default 30000 ms, applies to theme/template ZIP downloads). Useful for slow networks or local dev servers that are slower to respond.
- **Configurable zip extractor** — new optional `"extractor"` config field: `"unzip"`, `"tar"`, `"7zip"` (alias `"7z"`), or `"auto"` (default — tries unzip, falls back to tar). Set it in `.pureadmin.json` when your environment uses a specific tool. Unknown values fail fast at startup with the list of valid names; named extractors error clearly if the binary isn't on PATH.
- **`extractZip` renamed from `extractThemeZip`** — the function is fully generic (used to unpack theme *and* template ZIPs). The old name was misleading.
- **Markdown rendering in detail views.** `themes show <id>` and the new `templates show <id>` now render the manifest's `content` field (rich markdown with headings, lists, inline code, etc.) using `marked` + `marked-terminal`. Reflow to 80 columns, indented 2 spaces to align with the metadata block above.
- **New `templates show` command** — mirrors `themes show`: compact metadata (id, version, technology/variant, author, license, tags) on top, rendered markdown description below.
- **`marked` + `marked-terminal` runtime dependencies** added (~150KB) for the above.
- **Mutating filesystem ops centralized in `lib/helpers/files.js`.** Five new wrappers — `mkdir`, `writeFile`, `removeFile`, `removeDir`, `copyFile` — cover all 42 mutating `fs.*Sync` call sites across the CLI. They provide ergonomic defaults (mkdir is always recursive; removeDir is always recursive + force, matching every existing usage) and emit a one-line dim trace `[fs] <action> <path>` when verbose mode is on. Read-only ops (`readFileSync`, `existsSync`, `statSync`, `readdirSync`) are intentionally NOT wrapped — they don't mutate state and tracing them would drown out the useful output.
- **Verbose mode now reachable from config too.** Existing `--verbose` / `-v` CLI flag still works; you can also set `"verbose": true` in `pureadmin.json` / `~/.pureadmin.json`. The CLI flag wins when both are set.
- **`templates pack` no longer emits directory entries in zips.** The previous switch to `archiver.directory()` re-introduced explicit dir entries (`template/lib/`, `template/src/`, etc.), which the server's integrity check rejects with "file in ZIP but not declared". Pack now walks the tree and adds files individually via `archive.file()`, matching the server's per-file manifest model. The walker (`walkFiles`) is shared with checksum computation so both views of the tree stay in sync.
- **`cliDisable` feature field** — companion to the existing `cli` field in `template.json` features. `cli: "--foo"` enables a feature when the flag is passed; `cliDisable: "--bare"` *disables* a feature when the flag is passed. Lets templates expose meaningful opt-out flags without forcing the `--no-foo` naming convention. Used by the `demo-pages` feature in all three official templates.
- **Universal `unless: "feature-id"` on recipe steps.** Any recipe step (`delete`, `patch`, `append`, `prepend`, `json-merge`, `call`, etc.) can now skip itself when a named feature is enabled. Lives at the top of the steps loop in `create.js` so all action types get the gate for free. Templates use this to delete demo content when `--bare` flips the corresponding feature off.
- **`delete` recipe action handles directories.** Detects whether the path is a file or a directory and dispatches to `removeFile` or `removeDir` accordingly. Templates can now `{ "action": "delete", "path": "src/routes/users" }` to drop an entire route folder.
- **`--template-path` prefers the local `template.json`.** When iterating on a template via `--template-path /path/to/template`, the CLI now loads that path's `template.json` first instead of always hitting the API. API and bundled-CLI templates remain the fallback. Edits to a local template.json take effect on the next `create` run with no publish step needed.
- **"Generated pages" label** in the README App Profile + Project Info card (was "Pages"). The old label read as "all pages in the app" but only ever meant "pages from `--pages` flag-driven generators" — the rename makes the field's scope honest.
- **"Demo pages" row** in the README App Profile + Project Info card. Surfaces the bundled scaffold routes (Users, Settings) gated by the optional `demo-pages` template feature. Reads "Users, Settings (pass --bare to remove)" by default; "none (--bare)" when the feature was disabled. Skipped entirely when the template doesn't declare the feature.

### Fixed
- **`__ICON:*` placeholders no longer emit Font Awesome `<i>` tags when no icon flag is set.** Previously `iconProvider` silently defaulted to `'font-awesome'` even with no `--font-awesome` flag, so the resolver emitted `<i class="fa-solid fa-X">` tags but the FA stylesheet never loaded — invisible empty boxes in every generated app. Now `iconProvider = 'none'` when no flag/preset/company chose one, and `resolveIconMarkup` / `resolveIconAttr` return empty strings for `'none'`. The `collectCreateSummary` workaround that masked the lie for display ("font-awesome but actually none") is removed too.

### Changed
- **`themes validate` is now a hard correctness gate.** Checks asset manifest integrity, required `--pa-*` CSS variables, and color slot definitions. Exits non-zero on any error so it works as a CI gate. The previous WCAG/border-radius checks moved to `themes lint`.
- **Default mode flipped from `dark` to `auto`.** New apps follow OS appearance by default instead of forcing dark.
- **Reproducible `create` command includes more flags.** The "run this to recreate the app" line now emits `--name`, `--default-mode`, `--default-variant`, and the resolved `--company` (workspace-auto-detected) so the command works outside the matched workspace directory.
- **`lib/http.js` single source of truth for server URL.** Removed the stale init block that picked BASE_URL from env/config at module load — that value was always overwritten by `setBaseUrl()` in `cli.js:118`. Fetch functions now throw a clear error if called before `setBaseUrl()`, eliminating the two-different-precedence-orders smell.
- **`lib/http.js` refactored for shared error handling.** Extracted private `httpGet()` (URL + timeout + status check + request-level error plumbing) and `readBody()` (promisified buffer collector). `fetchJson` / `fetchText` / `downloadFile` each drop to 1–5 lines and use a consistent `HTTP <code> from <path>` error format (previously `downloadFile` just said `HTTP <code>`).
- **Helpers reorganized under `lib/helpers/`.** The old grab-bag `lib/files.js` had drifted to hold file ops, hashing, and object merging; `lib/formatting.js` was the only other pure helper. Split into four modules by concern: `lib/helpers/files.js` (copyDirSync, extractThemeZip), `lib/helpers/objects.js` (deepMerge + deepMergeInto), `lib/helpers/hashing.js` (sha256File, sha256String), `lib/helpers/formatting.js` (ANSI wrappers). All call sites updated; tests split correspondingly into `test/files.test.js`, `test/objects.test.js`, `test/hashing.test.js`.
- **Consolidated the duplicate `deepMerge` implementation.** Previously `lib/config.js` had a private `deepMergeConfig` (mutating) and `lib/files.js` exported `deepMerge` (immutable) — same semantics, different bodies, drift hazard. Both now route through `lib/helpers/objects.js` which exports two variants with shared behavior: `deepMerge(target, source)` (immutable, returns new object) for fresh bindings; `deepMergeInto(target, source)` (in-place) for `const`-held state like the module-level config object.

### Removed
- **Theme-manifest default-mode fallback in `create`** — the block that fetched `/api/themes/<id>` to read the theme's default mode is gone. `auto` handles the "don't force a mode" case without a network round-trip.

### Fixed
- **Unknown `--server <name>` now errors early.** Previously, `--server development` (with no "development" target defined) was silently treated as a raw URL — the CLI proceeded happily until it failed at upload time with cryptic network errors. Now `resolveTarget` distinguishes URL vs name by checking for `://` and throws `Unknown server target "X". Available targets: ...` before any command runs.
- **Misspelled `config.defaultTarget` no longer falls through silently.** Previously, a typo in `defaultTarget` would silently drop to the `https://pureadmin.io` fallback, risking unintended publishes to production. Now it throws with the available target list.
- **`templates pack` now recomputes checksums at pack time.** Previously, the CLI shipped whatever `checksums` block `template.json` had on disk — if files in `template/` or `pages/` had been edited since the last manual run of `scripts/update-checksums.js`, the server would reject the upload with "checksum mismatch". Pack now walks the template directory, hashes every file, computes metadata + summary shas, and injects an enriched `template.json` into the zip. No external script required; no side effects on the source tree.
- **`templates pack` now uses `archiver` instead of PowerShell/`zip`/Python.** Removes the platform-specific fallback dance and the Python-based directory-entry stripping workaround. Same module already used by `themes pack`.

---

## 1.0.1 (2026-04-15)

### Fixed
- **Config deep merge** — project-level `.pureadmin.json` with `targets` no longer nukes home-level apiKeys. Objects merge recursively; scalars/arrays overwrite.
- **Icon provider for Phoenix** — `--heroicons` flag + `lib/create/icons.js` with FA/Heroicons/Lucide maps
- **Makefile ecto-create** — gracefully skips when Ecto not installed (`--no-ecto`)
- **Endpoint URL display** — patch adds `port: 4000` to Phoenix config so it shows `http://localhost:4000`

---

## 1.0.0 (2026-04-15)

First stable release. Cross-technology template system with Phoenix LiveView support.

### Added
- **Phoenix LiveView template** (`--template phoenix-liveview`) — full Phoenix app with PureAdmin layout, sidebar, navbar, footer, profile panel, settings panel, toast container, page context, Makefile
- **Icon provider system** — `lib/create/icons.js` with FA + Heroicons for Phoenix (`--heroicons`), Lucide for Svelte (`--lucide`). Canonical icon maps, per-provider resolution
- **Template lifecycle** — `prepare(ctx, helpers)` + `prepareLate(ctx, helpers)`. Templates declare which preparators they need
- **Data collectors** — `collectSidebarItems/NavbarItems/ProfileItems/Brand/Footer/ThemeOptions/CreateSummary`. Technology-agnostic objects; templates render their own markup
- **`ctx` pipeline** — explicit `ctx.placeholders` dictionary, no closure magic
- **Extracted modules** — `naming.js` (case conversion), `preparators.js` (25+ helpers), `features.js` (resolve/scaffold/points), `icons.js` (maps + resolution)
- **Named targets** — `targets: { production: { url, apiKey }, local: { ... } }` in config
- **`scaffold.runFirst`** — run `mix phx.new` / `rails new` before template overrides
- **Flag validation** — unknown `--flags` checked against template features, catches typos
- **New placeholders** — `__APP_MODULE__`, `__APP_ID_SNAKE__`, `__PAGE_MODULE__`, `__CREATE_COMMAND__`, `__SCAFFOLD_FLAGS__`, `__ICON_CDN__`
- **Project Info card** — generated home pages show features, themes, CLI command
- **97 unit tests**

### Changed
- Single `__VAR__` format (dropped `{{VAR}}`)
- Default template: `svelte-sveltekit`
- Strict `prepare()` requirement for all templates
- Windows ZIP packer strips directory entries

---

## 1.0.0-rc09 (2026-04-06)

### Added
- **Data-driven command definitions** (`lib/commands.js`) — single source of truth for all commands, subcommands, args, flags. Drives help text, validation, and `--llm` output
- **`pureadmin help <command> [subcommand]`** — detailed help for any command (args, flags, descriptions)
- **`<resource> help <subcommand>`** — same, e.g. `pureadmin themes help download`
- **`--llm`** — outputs comprehensive reference document (concepts, commands, context) for LLM consumption
- **Per-resource help** — `pureadmin themes`, `templates`, `profiles`, `presets` show subcommand list

### Changed
- **Removed all legacy aliases** — no more top-level `build/pack/publish/info/rm`. All through `themes`/`templates` subcommands
- **`themes show`** replaces `themes info`
- **`profiles/presets delete`** replaces `rm`
- **Unknown flag validation** now reads known flags from command definitions, not hardcoded list

---

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
