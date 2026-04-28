# Test Plan — themes verb realignment + core-version filtering

Manual verification plan for the unreleased changes on branch `prod`
(see `CHANGELOG.md` `[Unreleased]` section): `themes install` is now
permissive (default dev/setup verb), `themes update` only bumps versions,
new `themes ci` is the strict CI verb. All three filter API resolution by
the project's `@keenmate/pure-admin-core` version. `pureadmin create`
delegates theme download to `themes install`. Templates no longer ship
`pureadmin.json`.

## Setup

Tests need a working API target (local pureadmin server preferred so theme
requests don't go to prod). The templates I modified live in the sibling
repo, so `pureadmin create` uses `--template-path` to read the local edits
without re-publishing first.

```bash
mkdir /tmp/pa-test && cd /tmp/pa-test

# Optional: point at local pureadmin server if you have one
export PUREADMIN_URL=http://localhost:8888
```

## Part A — Unit verification (already automated)

```bash
cd C:/Git/KM/pure-admin-cli
make test
```

Expect: 149/149 passing, including the 25 new `core-version` tests.
Already verified during implementation.

## Part B — Detector smoke test

Run the CLI from inside three different project shapes to confirm the
detector picks the right manifest:

```bash
# 1. Svelte project (root package.json)
cd <some-svelte-project> && pureadmin themes install
# Expect: log line "pure-admin-core: vX.Y.Z (package.json → node_modules)" or "(declared)"

# 2. Phoenix project (assets/package.json)
cd <some-phoenix-project> && pureadmin themes install
# Expect: "pure-admin-core: vX.Y.Z (assets/package.json …)"

# 3. Project missing the dep
cd <empty-dir-with-pureadmin.json> && pureadmin themes install
# Expect: yellow "pure-admin-core: not detected — fresh themes will resolve to absolute latest"
```

## Part C — Verb semantics

In any existing project that has a `pureadmin.json` with at least 2
declared themes:

### C1. `themes install` — permissive default

**Case 1: lock missing entirely.**

```bash
rm pureadmin.lock.json
pureadmin themes install
```

Expect: `pure-admin-core: vX.Y.Z` line appears, each theme prints
`resolving... vX.Y.Z` then `downloading... done`, summary mentions
`N resolved fresh`, `pureadmin.lock.json` is created.

**Case 2: lock complete (re-run on populated lock).**

```bash
pureadmin themes install
```

Expect: each theme prints `downloading vX.Y.Z... done` (no `resolving...`
line), summary says `N installed`, no `resolved fresh`, **lockfile not
rewritten** (check `git diff pureadmin.lock.json` — should be empty).

**Case 3: partial lock — declare a new theme, don't run update.**

```bash
echo '{"themesDir":"static/themes","themes":{"audi":{},"corporate":{},"newone":{}}}' > pureadmin.json
pureadmin themes install
```

Expect: `audi` and `corporate` download from lock, `newone` shows
`resolving...` then downloads, lockfile gains a `newone` entry.

### C2. `themes update` — bump versions

```bash
pureadmin themes update
```

Expect: `pure-admin-core: vX.Y.Z` line appears, each theme prints
`checking...` then either `vX — unchanged` or `vOld → vNew`, summary line,
lockfile updated only when versions changed (`git diff pureadmin.lock.json`
should show only changed entries).

### C3. `themes ci` — strict

**Case 1: in sync.**

```bash
pureadmin themes ci
```

Expect: prints `Installing N theme(s) from lockfile (CI mode)`, downloads
each at locked version, **no API resolution call**. Exit code 0.

**Case 2: declaration missing from lock.**

```bash
echo '{"themesDir":"static/themes","themes":{"audi":{},"corporate":{},"unlocked":{}}}' > pureadmin.json
pureadmin themes ci
echo "exit=$?"
```

Expect: red error "The following theme(s) are declared in pureadmin.json
but missing from the lockfile: unlocked", hint to run `themes install`,
exit code 1.

### C4. Verify the API filter

While running `install` or `update`, check that the actual HTTP request
includes `?core_version=` — easiest with a local server's logs, or
intercept with mitmproxy, or temporarily add a `console.log` to
`lib/http.js`'s fetch.

## Part D — `pureadmin create` end-to-end (the original concern)

Run create against each of the three local templates. After each, check
that:

1. `pureadmin.json` exists and contains exactly the themes you asked for as
   **declarations only** (no `version` / `content_sha`)
2. `pureadmin.lock.json` exists with a resolved entry per theme
3. The themes directory has the actual CSS files extracted

```bash
cd /tmp/pa-test

# D1. SvelteKit
pureadmin create test-sveltekit \
  --template-path ../pure-admin-templates/svelte-sveltekit \
  --themes corporate,audi,dark --no-install

cat test-sveltekit/pureadmin.json        # expect: themesDir=static/themes, themes={corporate:{},audi:{},dark:{}}
cat test-sveltekit/pureadmin.lock.json   # expect: 3 entries with version/content_sha/fetched_at/source
ls test-sveltekit/static/themes/         # expect: corporate/  audi/  dark/

# D2. Svelte SPA
pureadmin create test-spa \
  --template-path ../pure-admin-templates/svelte-spa \
  --themes corporate,audi --no-install

cat test-spa/pureadmin.json              # expect: themesDir=public/themes, 2 themes
ls test-spa/public/themes/               # expect: corporate/  audi/

# D3. Phoenix LiveView (needs Elixir; skip if not installed)
pureadmin create test-phoenix \
  --template elixir-phoenix-liveview \
  --template-path ../pure-admin-templates/elixir-phoenix-liveview \
  --themes corporate,audi --no-install

cat test-phoenix/pureadmin.json          # expect: themesDir=priv/static/themes — KEY SIGNAL: file exists at all
ls test-phoenix/priv/static/themes/      # expect: corporate/  audi/
```

**Critical regression checks:**

- No `pureadmin.json` should contain `version` or `content_sha` fields
  (the legacy footgun).
- Phoenix project gets a `pureadmin.json` (the v1.3.0 gap is closed).
- Sveltekit project does NOT have the old hardcoded
  `audi: { version: "2.3.0", … }` shape.

## Part E — Failure modes

**E1. Network outage during install.**

```bash
# (kill local server or unplug, then:)
pureadmin themes install
echo "exit=$?"
```

Expect: per-theme "failed: …" lines, summary with `N failed` in red, exit
code 1.

**E2. Failure during create — verify create still finishes.**

```bash
# (kill server, try create with --no-install for speed)
pureadmin create flaky --template-path ... --themes corporate,audi --no-install
```

Expect: yellow "N theme(s) failed to install — re-run …" message, but
**"App created!" still prints** and `cd flaky/` is a real (if theme-less)
project. Exit code 0 (don't kill create on theme failure).

**E3. Local-path theme with broken path.**

```bash
# Edit .pureadmin.json to add a path that doesn't exist on this box, then:
pureadmin themes ci
```

Expect: red error with hint "this theme was locked from a personal
.pureadmin.json path", exit 1.

## Part F — Migration smoke test (legacy schema in the wild)

If you have a real project still on the v1.3.0 release shape (inline
`version` / `content_sha` in `pureadmin.json`), run `themes install` once.
Expect: it Just Works (auto-migration in `loadProjectConfig` hoists the
inline fields into the lock). After: `pureadmin.json` is unchanged on
disk; new `pureadmin.lock.json` is correct.

---

**Time estimate:** Part A is instant; B-E with a local server take 15-25
minutes; F is a 2-minute add-on if you have a v1.3.0 project handy. The
most important checks are **D1-D3** (the original question — "do templates
work properly?") and **C3 case 2** (proves `ci` is genuinely strict).
