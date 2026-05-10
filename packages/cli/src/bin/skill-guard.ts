#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { scanCommand } from '../commands/scan.js';
import { reportCommand } from '../commands/report.js';
import { updateRulesCommand } from '../commands/update-rules.js';

const VERSION = '0.1.0';

const showHelp = (): void => {
  console.log(`
skill-guard v${VERSION} — AI Skill security scanner

Usage:
  skill-guard <command> [options]

Commands:
  scan <path>          Scan a skill directory or ZIP file
  report <path>        Generate metadata card for a skill
  update-rules         Update local rule cache

Options:
  --help, -h           Show this help message
  --version, -v        Show version number

Scan Options:
  --mode <mode>        Scan mode: quick | standard | deep (default: standard)
  --format <format>    Output format: terminal | json | sarif (default: terminal)
  --adapter <adapter>  Adapter: newmax | auto (default: auto)
  --rules-dir <dir>    Custom rules directory
  --threshold <n>      Score threshold for blocking (default: 30)

Examples:
  skill-guard scan ./my-skill
  skill-guard scan --mode quick ./my-skill
  skill-guard scan --format json ./my-skill
  skill-guard scan --format sarif ./my-skill > results.sarif
  skill-guard report ./my-skill
`);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  try {
    switch (command) {
      case 'scan':
        await scanCommand(restArgs);
        break;
      case 'report':
        await reportCommand(restArgs);
        break;
      case 'update-rules':
        await updateRulesCommand(restArgs);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred.');
    }
    process.exit(1);
  }
};

main();
