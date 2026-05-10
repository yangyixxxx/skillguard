import { resolve, dirname } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { nanoid } from 'nanoid';
import {
  scanBundle,
  detectAdapter,
  analyzeStructure,
  type PlatformAdapter,
  type ParsedBundle,
} from '@aspect/skill-guard';
import { NewmaxAdapter } from '@aspect/skill-guard-adapter-newmax';
import { formatTerminal } from '../output/terminal.js';
import { formatJson } from '../output/json.js';
import { formatSarif } from '../output/sarif.js';

/**
 * Walk upward from this file's location until we find a directory with
 * rules/base/common.yaml. Works for all layouts:
 *   - dev:        packages/cli/src/commands/      → ../../../../rules/base
 *   - tsc dist:   packages/cli/dist/commands/     → ../../../../rules/base
 *   - bundled:    <repo>/dist/skillguard.mjs      → ../rules/base
 *   - npm global: $prefix/lib/node_modules/skillguard/dist/skillguard.mjs → ../rules/base
 */
const findRulesDir = (): string => {
  let here: string = import.meta.dirname;
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(here, 'rules/base/common.yaml');
    if (existsSync(candidate)) return resolve(here, 'rules/base');
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  // Fallback to the dev-layout path; will fail with a clear error if missing.
  return resolve(import.meta.dirname, '../../../../rules/base');
};

const DEFAULT_RULES_DIR = findRulesDir();

interface ScanOptions {
  mode: 'quick' | 'standard' | 'deep';
  format: 'terminal' | 'json' | 'sarif';
  adapter: string;
  rulesDir: string;
  threshold: number;
}

const parseOptions = (args: string[]): { path: string; options: ScanOptions } => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      mode: { type: 'string', default: 'standard' },
      format: { type: 'string', default: 'terminal' },
      adapter: { type: 'string', default: 'auto' },
      'rules-dir': { type: 'string' },
      threshold: { type: 'string', default: '30' },
    },
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    throw new Error('Please provide a path to scan. Usage: skill-guard scan <path>');
  }

  return {
    path: resolve(positionals[0]),
    options: {
      mode: (values.mode as ScanOptions['mode']) ?? 'standard',
      format: (values.format as ScanOptions['format']) ?? 'terminal',
      adapter: (values.adapter as string) ?? 'auto',
      rulesDir: values['rules-dir'] ? resolve(values['rules-dir'] as string) : DEFAULT_RULES_DIR,
      threshold: parseInt(values.threshold as string, 10) || 30,
    },
  };
};

const readSkillDirectory = async (dirPath: string): Promise<Array<{ path: string; content: Buffer }>> => {
  const files: Array<{ path: string; content: Buffer }> = [];

  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        files.push({ path: relativePath, content });
      }
    }
  };

  await walk(dirPath, '');
  return files;
};

export const scanCommand = async (args: string[]): Promise<void> => {
  const { path: targetPath, options } = parseOptions(args);

  const targetStat = await stat(targetPath);
  if (!targetStat.isDirectory()) {
    throw new Error(`Expected a directory path, got: ${targetPath}`);
  }

  const rawFiles = await readSkillDirectory(targetPath);

  const adapters: PlatformAdapter[] = [new NewmaxAdapter()];
  const input = {
    files: rawFiles.map((f) => ({
      path: f.path,
      content: f.content,
    })),
  };

  let adapter: PlatformAdapter;
  try {
    adapter = detectAdapter(input, adapters);
  } catch {
    throw new Error('Unable to detect skill format. Make sure the directory contains a valid SKILL.md.');
  }

  let bundle: ParsedBundle;
  try {
    bundle = await adapter.parseBundle(input);
  } catch {
    throw new Error('Failed to parse skill bundle. Check the directory structure.');
  }

  const structure = analyzeStructure(bundle);
  if (structure.blocked) {
    const reason = structure.findings[0]?.message ?? 'Invalid bundle structure.';
    throw new Error(`Structure check failed: ${reason}`);
  }

  const report = await scanBundle({
    bundle,
    adapter,
    options: {
      reportId: nanoid(12),
      rulesDir: options.rulesDir,
      scoreThreshold: options.threshold,
      now: new Date(),
    },
  });

  switch (options.format) {
    case 'json':
      console.log(formatJson(report));
      break;
    case 'sarif':
      console.log(formatSarif(report));
      break;
    case 'terminal':
    default:
      console.log(formatTerminal(report));
      break;
  }

  if (report.blocked) {
    process.exit(1);
  }
};
