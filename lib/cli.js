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

const { formatGlobalHelp, formatCommandHelp, commands: cmdDefs } = require('./commands');

function usage(error) {
  if (error) console.error(`\n  \x1b[31mError: ${error}\x1b[0m`);
  console.log(formatGlobalHelp());
  process.exit(error ? 1 : 0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return usage();
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(`pureadmin v${TOOL_VERSION}`);
    return;
  }
  if (args[0] === '--llm') {
    const { formatLlmOutput } = require('./commands');
    console.log(formatLlmOutput());
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
    } else if (rest[i] === '--heroicons') {
      opts.heroicons = true;
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
      // Unknown flag — treat as a template-defined boolean flag (passthrough).
      // This lets templates declare custom features (e.g. --no-ecto for Phoenix)
      // without needing CLI changes per template. The flag is stored as a
      // camelCase opts key, e.g. --no-ecto → opts.noEcto = true.
      // Supports `--flag value` (next arg as value if not another --flag) and
      // bare `--flag` (boolean true).
      const flag = rest[i].slice(2); // strip leading --
      const camelKey = flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[camelKey] = next;
        i++;
      } else {
        opts[camelKey] = true;
      }
    } else {
      positional.push(rest[i]);
    }
  }

  // Resolve target: --server flag → target name or URL → config.targets → default
  const { resolveTarget } = require('./config');
  const target = resolveTarget(opts.server);
  setBaseUrl(target.url);
  // Stash resolved API key on opts so commands can read it (e.g. templates publish)
  if (target.apiKey && !opts.apiKey) opts.apiKey = target.apiKey;

  // Header
  const urlSource = dim(` (${target.source})`);
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
      case 'help': {
        const target = positional[0];
        if (!target) return usage();
        const def = cmdDefs[target];
        if (!def) return usage(`Unknown command: ${target}`);
        if (def.subcommands) {
          const { formatSubcommandHelp } = require('./commands');
          const subTarget = positional[1];
          if (subTarget && def.subcommands[subTarget]) {
            console.log(formatSubcommandHelp(target, subTarget, def.subcommands[subTarget]));
          } else {
            console.log(formatCommandHelp(target, def));
          }
        } else {
          console.log(formatCommandHelp(target, def));
        }
        return;
      }
      default: return usage(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`\n  \x1b[31mError: ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

module.exports = { main, usage };
