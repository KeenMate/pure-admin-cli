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
        description: 'Re-download changed themes',
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
        description: 'Check CSS for readability, variables, consistency',
        args: [{ name: 'id', required: false, variadic: true, description: 'Theme(s) to validate (default: all)' }],
      },
    },
  },

  templates: {
    description: 'Browse and publish Pure Admin templates',
    subcommands: {
      list: {
        description: 'List available templates from API',
      },
      pack: {
        description: 'Package template(s) into ZIP',
        args: [{ name: 'id', required: false, variadic: true, description: 'Template(s) to pack (default: all)' }],
      },
      publish: {
        description: 'Pack + upload templates to pureadmin.io',
        args: [{ name: 'id', required: false, variadic: true, description: 'Template(s) to publish (default: all)' }],
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
  const { bold, dim } = require('./formatting');
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
  const { bold, dim } = require('./formatting');
  const { TOOL_VERSION } = require('./config');
  const lines = [];

  lines.push(`\n  ${bold('pureadmin')} ${dim(`v${TOOL_VERSION}`)} — Pure Admin CLI\n`);
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
  lines.push(`    ${'--llm'.padEnd(28)} Output full CLI schema as JSON for LLM consumption`);
  lines.push('');

  return lines.join('\n');
}

function formatSubcommandHelp(parentName, subName, sub) {
  const { bold, dim } = require('./formatting');
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
  const lines = [];

  lines.push(`pureadmin v${TOOL_VERSION} — CLI for Pure Admin`);
  lines.push(`Scaffold apps, manage themes and templates, publish to pureadmin.io`);
  lines.push('');

  for (const [name, cmd] of Object.entries(commands)) {
    const argsStr = (cmd.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}]`).join(' ');
    lines.push(`pureadmin ${name}${argsStr ? ' ' + argsStr : ''} — ${cmd.description}`);

    for (const f of cmd.flags || []) {
      lines.push(`  ${f.flag}${f.value ? ' ' + f.value : ''} — ${f.description}`);
    }

    if (cmd.subcommands) {
      for (const [subName, sub] of Object.entries(cmd.subcommands)) {
        const subArgs = (sub.args || []).map(a => a.required ? `<${a.name}>` : `[${a.name}${a.variadic ? '...' : ''}]`).join(' ');
        lines.push(`  ${name} ${subName}${subArgs ? ' ' + subArgs : ''} — ${sub.description}`);
        for (const f of sub.flags || []) {
          lines.push(`    ${f.flag}${f.value ? ' ' + f.value : ''} — ${f.description}`);
        }
      }
    }

    lines.push('');
  }

  lines.push('Global flags:');
  for (const f of globalFlags) {
    lines.push(`  ${f.flag}${f.value ? ' ' + f.value : ''} — ${f.description}`);
  }

  return lines.join('\n');
}

module.exports = { commands, globalFlags, formatCommandHelp, formatSubcommandHelp, formatGlobalHelp, formatLlmOutput };
