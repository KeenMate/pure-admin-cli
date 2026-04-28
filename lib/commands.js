// ---------------------------------------------------------------------------
// Command definitions — single source of truth for routing, validation, help
// ---------------------------------------------------------------------------

/**
 * Command schema:
 * {
 *   description: string,
 *   handler: string,           // module path + export name (e.g. './commands/create:cmdCreate')
 *   args: [{ name, required, description }],
 *   flags: [{ flag, alias, value, description }],
 *   subcommands: { name: CommandSchema }
 * }
 */

const commands = {
  create: {
    description: 'Create a Pure Admin app (interactive wizard if no name)',
    args: [
      { name: 'name', required: false, description: 'App name (kebab-case). Omit for interactive wizard.' }
    ],
    flags: [
      { flag: '--template', value: '<id>', description: 'Template to use (fetched from API)' },
      { flag: '--template-path', value: '<dir>', description: 'Use a local template directory' },
      { flag: '--name', value: '<name>', description: 'Display name' },
      { flag: '--themes', value: '<list>', description: 'Comma-separated theme slugs' },
      { flag: '--theme', value: '<slug>', description: 'Default theme' },
      { flag: '--font-awesome', description: 'FontAwesome 6 icons (default)' },
      { flag: '--lucide', description: 'Lucide icons (Svelte components)' },
      { flag: '--fluent-ui', description: 'Fluent UI icons' },
      { flag: '--profile-panel', description: 'User profile panel' },
      { flag: '--settings-panel', description: 'Theme switcher panel' },
      { flag: '--company', value: '<id>', description: 'Company profile from ~/.pureadmin.json' },
      { flag: '--preset', value: '<name>', description: 'Feature/page preset' },
      { flag: '--no-install', description: 'Skip dependency installation' },
      { flag: '--no-build', description: 'Skip initial build' },
      { flag: '--no-makefile', description: 'Skip Makefile generation' },
      { flag: '--verbose', alias: '-v', description: 'Debug output' },
    ],
  },

  themes: {
    description: 'Browse and manage Pure Admin themes',
    subcommands: {
      list: {
        description: 'List all themes from API',
        flags: [
          { flag: '--local', description: 'List themes configured in this project instead' },
        ],
      },
      show: {
        description: 'Show theme details, versions, core compat',
        args: [{ name: 'id', required: true, description: 'Theme identifier' }],
      },
      add: {
        description: 'Add themes to project',
        args: [{ name: 'id', required: true, variadic: true, description: 'Theme identifier(s)' }],
        flags: [
          { flag: '--offline', description: 'Commit theme files to repo' },
          { flag: '--dir', value: '<path>', alias: '--themes-dir', description: 'Theme output directory' },
          { flag: '--path', value: '<dir>', description: 'Add a theme from a local directory instead of the API (slug taken from theme.json)' },
        ],
      },
      search: {
        description: 'Search themes by name or description',
        args: [{ name: 'query', required: true, description: 'Search query' }],
      },
      versions: {
        description: 'Show available versions for a theme',
        args: [{ name: 'id', required: true, description: 'Theme identifier' }],
      },
      compatible: {
        description: 'List themes compatible with a core version',
        args: [{ name: 'version', required: true, description: 'Core version (e.g. 2.0.0)' }],
      },
      download: {
        description: 'Download a theme ZIP',
        args: [{ name: 'id', required: true, description: 'Theme identifier' }],
        flags: [
          { flag: '--version', value: '<ver>', description: 'Specific version (default: latest)' },
          { flag: '--output', value: '<file>', description: 'Output filename' },
        ],
      },
      init: {
        description: 'Scaffold a new theme project',
        args: [
          { name: 'id', required: true, description: 'Theme identifier' },
          { name: 'name', required: false, description: 'Display name' },
        ],
      },
      update: {
        description: 'Refresh themes; resolve latest versions and write the lockfile',
      },
      install: {
        description: 'Install exactly what the lockfile records (CI-equivalent of npm ci)',
      },
      build: {
        description: 'Compile SCSS to CSS',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to build (default: all)' }],
      },
      pack: {
        description: 'Package theme(s) into ZIP',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to pack (default: all)' }],
        flags: [
          { flag: '--no-build', description: 'Skip building before packing' },
          { flag: '--output', value: '<dir>', description: 'Output directory (default: dist)' },
        ],
      },
      publish: {
        description: 'Pack + upload themes to pureadmin.io',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to publish (default: all)' }],
        flags: [
          { flag: '--no-build', description: 'Skip building before packing' },
        ],
      },
      validate: {
        description: 'Hard correctness checks: manifest, required vars, color slots',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to validate (default: all)' }],
      },
      lint: {
        description: 'Quality recommendations: WCAG contrast, hardcoded values',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to lint (default: all)' }],
      },
    },
  },

  templates: {
    description: 'Browse and publish Pure Admin templates',
    subcommands: {
      list: {
        description: 'List available templates from API',
      },
      show: {
        description: 'Show a template with rendered markdown description',
        args: [{ name: 'id', required: true, description: 'Template identifier' }],
      },
      pack: {
        description: 'Package template(s) into ZIP',
        args: [{ name: 'id', required: false, variadic: true, description: 'Template(s) to pack (default: all)' }],
      },
      publish: {
        description: 'Pack + upload templates to pureadmin.io',
        args: [{ name: 'id', required: false, variadic: true, description: 'Template(s) to publish (default: all)' }],
      },
      validate: {
        description: 'Verify manifest integrity and checksums before publish',
        args: [{ name: 'id', required: false, variadic: true, description: 'Template(s) to validate (default: all)' }],
      },
    },
  },

  profiles: {
    description: 'Manage company profiles and workspace mappings',
    subcommands: {
      list: {
        description: 'List all profiles',
      },
      show: {
        description: 'Show profile details',
        args: [{ name: 'id', required: true, description: 'Profile identifier' }],
      },
      delete: {
        description: 'Remove a profile',
        args: [{ name: 'id', required: true, description: 'Profile identifier' }],
      },
    },
  },

  presets: {
    description: 'Manage saved create configurations',
    subcommands: {
      list: {
        description: 'List all presets',
      },
      show: {
        description: 'Show preset details',
        args: [{ name: 'name', required: true, description: 'Preset name' }],
      },
      delete: {
        description: 'Remove a preset',
        args: [{ name: 'name', required: true, description: 'Preset name' }],
      },
    },
  },
};

// Global flags (available on all commands)
const globalFlags = [
  { flag: '--server', value: '<url>', description: 'Override API base URL' },
];

// ---------------------------------------------------------------------------
// Help text generators
// ---------------------------------------------------------------------------

function formatCommandHelp(name, cmd, prefix = 'pureadmin') {
  const { bold, dim } = require('./helpers/formatting');
  const lines = [];

  lines.push(`\n  ${bold(name)} — ${cmd.description}\n`);

  if (cmd.subcommands) {
    const subs = Object.entries(cmd.subcommands);
    const maxLen = Math.max(...subs.map(([n]) => n.length), 0);
    for (const [subName, sub] of subs) {
      const argsStr = (sub.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '...' : ''}]`).join(' ');
      const left = `${subName}${argsStr ? ' ' + argsStr : ''}`.padEnd(maxLen + 12);
      lines.push(`    ${left} ${sub.description}`);
    }
    lines.push('');
  }

  if (cmd.args) {
    for (const arg of cmd.args) {
      lines.push(`    ${arg.required ? `<${arg.name}>` : `[${arg.name}]`}  ${dim(arg.description)}`);
    }
  }

  if (cmd.flags?.length) {
    for (const f of cmd.flags) {
      const left = `${f.flag}${f.value ? ' ' + f.value : ''}`.padEnd(24);
      lines.push(`    ${left} ${f.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatGlobalHelp() {
  const { bold, dim } = require('./helpers/formatting');
  const { TOOL_VERSION } = require('./config');
  const lines = [];

  lines.push(`\n  ${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)} — Pure Admin CLI`);
  lines.push(`  ${dim('Use --llm for full reference (LLM/AI assistants)')}\n`);
  lines.push(`  ${bold('Usage:')}`);
  lines.push(`    pureadmin <command> [options]\n`);

  // Top-level commands (no subcommands)
  lines.push(`  ${bold('Commands:')}`);
  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd.subcommands) {
      const argsStr = (cmd.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}]`).join(' ');
      lines.push(`    ${(name + (argsStr ? ' ' + argsStr : '')).padEnd(28)} ${cmd.description}`);
    }
  }
  lines.push('');

  // Resource commands (with subcommands)
  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd.subcommands) continue;
    lines.push(`  ${bold(name.charAt(0).toUpperCase() + name.slice(1) + ':')}`);
    for (const [subName, sub] of Object.entries(cmd.subcommands)) {
      const argsStr = (sub.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '...' : ''}]`).join(' ');
      const flagHints = (sub.flags || []).filter(f => !f.flag.startsWith('--no-')).map(f => f.flag).join(' ');
      lines.push(`    ${(`${name} ${subName}${argsStr ? ' ' + argsStr : ''}`).padEnd(28)} ${sub.description}`);
    }
    lines.push('');
  }

  // Global flags
  lines.push(`  ${bold('Global:')}`);
  for (const f of globalFlags) {
    lines.push(`    ${(`${f.flag}${f.value ? ' ' + f.value : ''}`).padEnd(28)} ${f.description}`);
  }
  lines.push(`    ${'--llm'.padEnd(28)} Output full CLI reference for LLM/AI assistants`);
  lines.push('');

  return lines.join('\n');
}

function formatSubcommandHelp(parentName, subName, sub) {
  const { bold, dim } = require('./helpers/formatting');
  const lines = [];

  const argsStr = (sub.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '...' : ''}]`).join(' ');
  lines.push(`\n  ${bold(`${parentName} ${subName}`)}${argsStr ? ' ' + argsStr : ''}`);
  lines.push(`  ${sub.description}\n`);

  if (sub.args?.length) {
    lines.push(`  ${bold('Arguments:')}`);
    for (const a of sub.args) {
      const label = a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '...' : ''}]`;
      lines.push(`    ${label.padEnd(20)} ${a.description}`);
    }
    lines.push('');
  }

  if (sub.flags?.length) {
    lines.push(`  ${bold('Flags:')}`);
    for (const f of sub.flags) {
      const left = `${f.flag}${f.value ? ' ' + f.value : ''}`;
      lines.push(`    ${left.padEnd(20)} ${f.description}`);
    }
    lines.push('');
  }

  // Global flags
  lines.push(`  ${bold('Global:')}`);
  for (const f of globalFlags) {
    lines.push(`    ${(`${f.flag}${f.value ? ' ' + f.value : ''}`).padEnd(20)} ${f.description}`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatLlmOutput() {
  const { TOOL_VERSION } = require('./config');
  return `pureadmin v${TOOL_VERSION} — CLI for Pure Admin
https://pureadmin.io | npm: @keenmate/pureadmin

Pure Admin is a lightweight, data-focused CSS/SCSS admin framework. This CLI scaffolds apps from templates, manages theme packages, and publishes to pureadmin.io.

CONCEPTS

Themes:
  CSS packages that style Pure Admin apps. Each theme is a self-contained ZIP containing:
    css/<id>.css — compiled CSS (includes pure-admin-core + theme overrides)
    scss/<id>.scss — SCSS source for customization
    theme.json — manifest with id, name, version, colorVariants, modes (dark/light), fonts
  Themes support color variants (e.g. Default, Blue, Red) and modes (dark, light).
  Themes are downloaded from pureadmin.io and extracted to a themes directory in your project
  (typically static/themes/ for SvelteKit, public/themes/ for Vite/SPA, priv/static/themes/ for Phoenix, wwwroot/themes/ for .NET).
  Online themes are gitignored and re-fetched on CI via "themes install" (which honors pureadmin.lock.json for reproducibility).
  Offline themes (--offline) are committed to the repo for builds without network.

  Project config is split across three files (modeled on package.json/package-lock.json):
    pureadmin.json       — declarations (which themes, sourced from where). Hand-edited. Never modified by automated commands.
    pureadmin.lock.json  — resolutions (version, content_sha, fetched_at, source per theme). Tool-managed. Committed.
    .pureadmin.json      — per-developer overrides (personal --path, dev API keys). Hand-edited. Gitignored.

  "themes update" writes pureadmin.lock.json only (use during development, then commit the lockfile diff in a PR).
  "themes install" reads the lockfile and fetches exact recorded versions (use on CI and fresh clones; it's the "npm ci" equivalent).

Templates:
  Project scaffolds stored on pureadmin.io. Each template defines a technology (svelte, react, elixir)
  and variant (sveltekit, spa, phoenix). Templates include:
    template.json — manifest with features, placeholders, scaffold commands, page generators
    template.helper.js — technology-specific operations (addDependency, addRoute, inject, etc.)
    template/ — the actual project files with __PLACEHOLDER__ variables and data-pa feature markers
    pages/ — page generators (dashboard, list, detail, form, master-detail)
  Features can be required (always included), default (included, toggleable), or opt-in.
  Icon providers (Font Awesome, Lucide, Fluent UI) are handled via __ICON:name__ placeholders.

Profiles:
  Company configurations stored in ~/.pureadmin.json. Define company name, copyright, default themes.
  Workspace mappings auto-select a company based on the current directory path.

Presets:
  Saved create wizard configurations. After creating an app, you can save all selections
  (template, features, themes, variant, mode) as a named preset for quick reuse.

Config files (in priority order — later wins on conflict):
  --api-key / --server flags         — highest priority
  PUREADMIN_API_KEY / PUREADMIN_URL  — env vars
  ./.pureadmin.json (project)        — gitignored. Personal overrides: per-dev theme --path overrides, dev API keys, local target.
  ./pureadmin.json (project)         — committed. Theme declarations (slugs + source), themesDir, top-level URL.
  ./pureadmin.lock.json (project)    — committed. Tool-managed resolutions (version + content_sha + fetched_at + source per theme).
                                       Read by "themes install"; written by "themes update" and "themes add".
  ~/.pureadmin.json (user)           — companies, workspaces, presets, default API key, default target.

API key resolution chain (used by "themes publish" / "templates publish"):
  1. --api-key flag
  2. resolved target's apiKey (from "targets" block in any of the JSON config files; resolved by --server / defaultTarget)
  3. top-level "apiKey" field in the merged config (from any of the JSON files; deepest file wins)
  4. PUREADMIN_API_KEY env var (fallback)

Package manager:
  Auto-detected: pnpm > bun > npm. Used for install, Makefile generation, and CLI output.

COMMANDS

pureadmin create [name]
  Create a Pure Admin app. Without a name, launches an interactive wizard (@clack/prompts)
  that guides through template, features, themes, variant/mode selection.
  With a name, creates directly using flags.
  --template <id> — template to fetch from API (e.g. svelte-sveltekit, svelte-spa)
  --template-path <dir> — use a local template directory instead of fetching from API
  --name <name> — display name shown in navbar and README
  --themes <list> — comma-separated theme IDs to download (e.g. corporate,audi,dark)
  --theme <slug> — which theme is the default (determines initial CSS load and FOUC prevention)
  --font-awesome — use Font Awesome 6 icons via CDN (default icon provider)
  --lucide — use Lucide icons (tree-shakeable Svelte components, adds @lucide/svelte dependency)
  --fluent-ui — use Fluent UI icons
  --profile-panel — include user profile slide-in panel component
  --settings-panel — include theme/mode switcher panel component
  --company <id> — apply company profile (name, copyright, default themes) from ~/.pureadmin.json
  --preset <name> — apply a saved feature/page preset from ~/.pureadmin.json
  --no-install — skip dependency installation (useful for batch testing)
  --no-build — skip initial build step
  --no-makefile — skip Makefile generation
  --verbose — show template sources, file sizes, unreplaced variables

pureadmin themes
  Browse, download, and manage Pure Admin themes.
  themes list — list all themes available on pureadmin.io (name, version, tags)
    --local — list themes configured in this project's pureadmin.json instead
  themes show <id> — show theme details: versions, core compatibility, fonts, color variants, modes
  themes add <id...> — download and add theme(s) to this project. Extracts ZIP to the themes directory,
    writes the slug to pureadmin.json (declarations) and the resolved version + content_sha to
    pureadmin.lock.json (resolutions). pureadmin.lock.json should be committed alongside pureadmin.json.
    --path <dir> — register a local directory as the theme source (per-developer override; goes to
      .pureadmin.json by default, which should be gitignored). Pass --shared to write to pureadmin.json
      instead (rare; for teams that genuinely co-locate theme source).
    --offline — commit theme files to repo (for Docker/CI builds without network access)
    --dir <path> — theme output directory where ZIPs are extracted (default: static/themes for SvelteKit,
      public/themes for Vite. For Phoenix use priv/static/themes, for .NET use wwwroot/themes)
  themes search <query> — search themes by name, description, or tags
  themes versions <id> — list all available versions for a theme
  themes compatible <version> — list themes compatible with a specific pure-admin-core version
  themes download <id> — download a theme ZIP file to the current directory
    --version <ver> — download a specific version instead of latest
    --output <file> — custom output filename
  themes init <id> [name] — scaffold a new theme development project with SCSS source, build scripts,
    pack/publish tooling. Creates a directory with theme.json, src/scss/, and npm scripts.
  themes update — refresh themes for development. For each declared theme, checks content_sha against
    the server (or re-snapshots local --path themes from disk), downloads if changed, and writes the
    resolved version + content_sha into pureadmin.lock.json. Never modifies pureadmin.json or
    .pureadmin.json. Use this when you want to bump versions; review the lockfile diff in your PR.
  themes install — install exactly what the lockfile records. CI-equivalent of "npm ci". Reads
    pureadmin.lock.json and fetches each theme at its locked version, verifying content_sha. Fails if
    any declared theme is missing from the lockfile (run "themes update" first to resolve). Writes
    nothing. Use this in CI pipelines and on fresh clones.
  themes build [id...] — compile SCSS to CSS for theme(s) in the current workspace.
    Works in multi-theme workspaces (directories with theme.json) and single-theme projects.
  themes pack [id...] — build + package theme(s) into distributable ZIP files in dist/.
    Computes SHA-256 checksums, content_sha, detects external domains in CSS.
    --no-build — use existing CSS without recompiling
    --output <dir> — output directory (default: dist)
  themes publish [id...] — pack + upload theme(s) to pureadmin.io.
    API key resolved from: PUREADMIN_API_KEY env > .pureadmin.json > pureadmin.json > ~/.pureadmin.json
    --no-build — use existing CSS without recompiling
  themes validate [id...] — hard correctness checks. Asset manifest audit (CSS url() refs vs theme.json
    fonts.files / assets.files vs files on disk — catches missing-from-zip bugs that cause 404s after
    publish), required --pa-* CSS variable definitions, color slot definitions. Exits non-zero on errors.
  themes lint [id...] — quality/accessibility recommendations: WCAG contrast ratios for buttons and
    color slots, hardcoded border-radius detection. Advisory only; never exits non-zero.

pureadmin templates
  Browse and publish project templates.
  templates list — list all templates available on pureadmin.io (id, version, technology/variant)
  templates show <id> — show template detail: metadata + rendered markdown description/content
  templates pack [id...] — package template(s) into ZIP for upload. Recomputes SHA-256 checksums
    for template/ and pages/ files at pack time and injects an enriched template.json into the zip
    (prevents upload failures from stale checksums). Includes template.helper.js if present.
  templates publish [id...] — pack + upload template(s) to pureadmin.io with integrity verification.
  templates validate [id...] — verify manifest integrity before publish. Checks required fields
    (id, name, version), required structure (template/ dir), and cross-checks declared checksums
    against actual file contents (catches stale manifests that would fail server-side integrity).

pureadmin profiles
  Manage company profiles stored in ~/.pureadmin.json.
  profiles list — list all company profiles with their workspace path mappings
  profiles show <id> — show profile details: name, copyright, default themes, workspace associations
  profiles delete <id> — remove a company profile and its workspace associations

pureadmin presets
  Manage saved create wizard configurations stored in ~/.pureadmin.json → createPresets.
  presets list — list all saved presets with their template, features, and themes
  presets show <name> — show full preset details
  presets delete <name> — remove a saved preset

pureadmin help [command] [subcommand]
  Show help for a command or subcommand. Examples:
    pureadmin help create
    pureadmin help themes download

Global flags:
  --server <url> — override pureadmin.io API base URL for this invocation
  --llm — output this reference document`;
}


module.exports = { commands, globalFlags, formatCommandHelp, formatSubcommandHelp, formatGlobalHelp, formatLlmOutput };
