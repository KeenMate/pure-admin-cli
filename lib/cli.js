// ---------------------------------------------------------------------------
// CLI parsing and command routing
// ---------------------------------------------------------------------------
const { TOOL_VERSION, config } = require('./config');
const { bold, dim, cyan } = require('./formatting');
const { getBaseUrl, setBaseUrl } = require('./http');
const { cmdList, cmdInfo, cmdVersions, cmdSearch, cmdCompatible, cmdDownload } = require('./commands/browse');
const { cmdInit } = require('./commands/init');
const { cmdCreate } = require('./commands/create');
const { cmdThemesRouter, cmdUpdate } = require('./commands/themes');
const { cmdBuild } = require('./commands/theme-build');
const { cmdPack } = require('./commands/theme-pack');
const { cmdPublish } = require('./commands/theme-publish');
const { cmdValidate } = require('./commands/theme-validate');
const { cmdTemplates } = require('./commands/templates');
const { cmdProfiles, cmdPresets } = require('./commands/profiles');

function usage(error) {
  if (error) console.error(`\n  \x1b[31mError: ${error}\x1b[0m`);

  console.log(`
  ${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)} — Pure Admin theme CLI

  ${bold('Usage:')}
    pureadmin <command> [options]

  ${bold('Commands:')}
    create [name] [options]     Create a Pure Admin app (interactive wizard if no name)

  ${bold('Theme commands:')}
    themes list                 List all themes from API
    themes list --local         List themes configured in this project
    themes add [id...]          Add themes to project
    themes info <id>            Show theme details, versions, core compat
    themes versions <id>        Show available versions for a theme
    themes search <query>       Search themes by name or description
    themes compatible <ver>     List themes compatible with a core version
    themes download <id>        Download a theme ZIP
    themes init <id> [name]     Scaffold a new theme project
    themes update               Re-download changed themes
    themes build [id...]        Compile SCSS to CSS
    themes pack [id...]         Package theme(s) into ZIP
    themes publish [id...]      Pack + upload themes to pureadmin.io
    themes validate [id...]     Check CSS for readability, variables, consistency

  ${bold('Template commands:')}
    templates list              List available templates from API
    templates pack [id...]      Package template(s) into ZIP
    templates publish [id...]   Pack + upload templates to pureadmin.io

  ${bold('Config commands:')}
    profiles list               List company profiles and workspace mappings
    profiles show <id>          Show profile details
    profiles rm <id>            Remove a company profile
    presets list                List saved create presets
    presets show <name>         Show preset details
    presets rm <name>           Remove a preset

  ${bold('Download options:')}
    --version <ver>             Download specific version (default: latest)
    --output <file>             Output filename

  ${bold('Create options:')}
    --template <name>           App template (default: sveltekit)
    --name <name>               Display name (default: derived from directory or company name)
    --company <id>              Company profile from ~/.pureadmin.json
    --preset <id>               Technology preset from ~/.pureadmin.json
    --themes <list>             Comma-separated theme slugs (default: corporate,audi,dark)
    --theme <slug>              Default theme (default: first in --themes)
    --font-awesome              Include FontAwesome CDN
    --profile-panel             Include ProfilePanel component
    --settings-panel            Include SettingsPanel (theme switcher)
    --no-makefile               Skip Makefile generation
    --verbose                   Show template sources, file sizes, and debug info

  ${bold('Themes options:')}
    --offline                   Commit theme files to repo (for builds without network)
    --dir <path>                Theme output directory (default: static/themes, alias: --themes-dir)

  ${bold('Global options:')}
    --server <url>              Override API base URL for this invocation

  ${bold('Configuration (JSON, in order of precedence):')}
    --server / --api-key        CLI flags
    PUREADMIN_URL / _API_KEY    Environment variables
    .pureadmin.json             Local overrides (gitignored, merges into pureadmin.json)
    pureadmin.json              Project config (checked in)
    ~/.pureadmin.json           User defaults

  ${bold('Examples:')}
    pureadmin list
    pureadmin info audi
    pureadmin versions dark
    pureadmin search "dark font"
    pureadmin compatible 2.0.0
    pureadmin download audi
    pureadmin download audi --version 2.0.2
    pureadmin init my-theme "My Custom Theme"
    pureadmin create my-app
    pureadmin create my-app --themes audi,dark --theme audi
    pureadmin themes                                          ${dim('list configured')}
    pureadmin themes express                                  ${dim('add + download')}
    pureadmin themes express --offline                        ${dim('add + download (committed)')}
    pureadmin themes audi dark express                        ${dim('add multiple')}
    pureadmin themes express --dir public/themes              ${dim('custom output dir')}
    pureadmin update                                          ${dim('re-download changed')}
    pureadmin build                                           ${dim('build all themes')}
    pureadmin build audi                                      ${dim('build one theme')}
    pureadmin pack                                            ${dim('build + pack all')}
    pureadmin pack audi --no-build                            ${dim('pack without building')}
    pureadmin publish                                         ${dim('pack + upload all')}
    pureadmin publish audi --api-key KEY                      ${dim('publish one theme')}
    pureadmin validate                                         ${dim('validate all themes')}
    pureadmin validate audi                                    ${dim('validate one theme')}
`);
  process.exit(error ? 1 : 0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return usage();
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(`pureadmin v${TOOL_VERSION}`);
    return;
  }

  const command = args[0];
  const rest = args.slice(1);

  // Parse flags (pre-scan for --server since it affects BASE_URL)
  const opts = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--server' && rest[i + 1]) {
      opts.server = rest[++i];
    } else if (rest[i] === '--version' && rest[i + 1]) {
      opts.version = rest[++i];
    } else if (rest[i] === '--output' && rest[i + 1]) {
      opts.output = rest[++i];
    } else if (rest[i] === '--template' && rest[i + 1]) {
      opts.template = rest[++i];
    } else if (rest[i] === '--template-path' && rest[i + 1]) {
      opts.templatePath = rest[++i];
    } else if (rest[i] === '--name' && rest[i + 1]) {
      opts.name = rest[++i];
    } else if (rest[i] === '--themes' && rest[i + 1]) {
      opts.themes = rest[++i];
    } else if (rest[i] === '--theme' && rest[i + 1]) {
      opts.theme = rest[++i];
    } else if (rest[i] === '--company' && rest[i + 1]) {
      opts.company = rest[++i];
    } else if (rest[i] === '--preset' && rest[i + 1]) {
      opts.preset = rest[++i];
    } else if (rest[i] === '--font-awesome') {
      opts.fontAwesome = true;
    } else if (rest[i] === '--lucide') {
      opts.lucide = true;
    } else if (rest[i] === '--fluent-ui') {
      opts.fluentUi = true;
    } else if (rest[i] === '--profile-panel') {
      opts.profilePanel = true;
    } else if (rest[i] === '--settings-panel') {
      opts.settingsPanel = true;
    } else if (rest[i] === '--local') {
      opts.local = true;
    } else if (rest[i] === '--offline') {
      opts.offline = true;
    } else if (rest[i] === '--no-build') {
      opts.noBuild = true;
    } else if (rest[i] === '--no-install') {
      opts.noInstall = true;
    } else if (rest[i] === '--no-makefile') {
      opts.noMakefile = true;
    } else if (rest[i] === '--verbose' || rest[i] === '-v') {
      opts.verbose = true;
    } else if (rest[i] === '--api-key' && rest[i + 1]) {
      opts.apiKey = rest[++i];
    } else if ((rest[i] === '--dir' || rest[i] === '--themes-dir') && rest[i + 1]) {
      opts.dir = rest[++i];
    } else if (rest[i].startsWith('--')) {
      console.error(`\n  ${bold('Error:')} unknown flag "${rest[i]}"`);
      console.error(`  Known flags: --server, --api-key, --dir, --themes-dir, --name, --company, --preset, --template, --template-path, --font-awesome, --lucide, --fluent-ui, --settings-panel, --profile-panel, --no-makefile, --no-install, --offline, --local, --no-build, --verbose, --version, --output\n`);
      process.exit(1);
    } else {
      positional.push(rest[i]);
    }
  }

  // Apply --server override (highest priority after env var)
  let urlSource = '';
  if (opts.server) {
    setBaseUrl(opts.server.replace(/\/+$/, ''));
    urlSource = dim(' (--server)');
  } else if (process.env.PUREADMIN_URL) {
    urlSource = dim(' ($PUREADMIN_URL)');
  } else if (config._configPath) {
    urlSource = dim(` (${config._configPath})`);
  }

  // Header
  console.log(`${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)}  ${dim('\u2192')} ${cyan(getBaseUrl())}${urlSource}`);

  try {
    switch (command) {
      case 'list': return usage('Use "themes list" or "templates list"');
      case 'create': {
        if (!positional[0]) {
          const { cmdCreateInteractive } = require('./commands/create-interactive');
          return await cmdCreateInteractive(opts);
        }
        return await cmdCreate(positional[0], opts, usage);
      }
      case 'themes': return await cmdThemesRouter(positional, opts, usage);
      case 'templates': return await cmdTemplates(positional, opts);
      case 'profiles': return await cmdProfiles(positional);
      case 'presets': return await cmdPresets(positional);
      // Legacy top-level aliases for theme commands
      case 'info': return await cmdInfo(positional[0], usage);
      case 'versions': return await cmdVersions(positional[0], usage);
      case 'search': return await cmdSearch(positional.join(' '), usage);
      case 'compatible': return await cmdCompatible(positional[0], usage);
      case 'download': return await cmdDownload(positional[0], opts, usage);
      case 'init': return await cmdInit(positional[0], positional.slice(1).join(' ') || undefined, usage);
      case 'update': return await cmdUpdate();
      case 'build': return await cmdBuild(positional);
      case 'pack': return await cmdPack(positional, opts);
      case 'publish': return await cmdPublish(positional, opts);
      case 'validate': return await cmdValidate(positional);
      default: return usage(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`\n  \x1b[31mError: ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

module.exports = { main, usage };
