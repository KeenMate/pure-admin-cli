#!/usr/bin/env node

// =============================================================================
// pureadmin-cli.js — Pure Admin theme management CLI
// =============================================================================
// Distributed by pureadmin.io — https://pureadmin.io/api/tools/pureadmin-cli.js
//
// Usage:
//   npx @keenmate/pureadmin <command> [args]
//   node pureadmin-cli.js <command> [args]
// =============================================================================

const { main } = require('../lib/cli');

main().then(() => process.exit(0));
