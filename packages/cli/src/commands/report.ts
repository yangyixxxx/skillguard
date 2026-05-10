import { resolve, dirname } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid';
import {
  scanBundle,
  detectAdapter,
  analyzeStructure,
  type PlatformAdapter,
  type ParsedBundle,
} from '@aspect/skill-guard';
import { NewmaxAdapter } from '@aspect/skill-guard-adapter-newmax';

const findRulesDir = (): string => {
  let here: string = import.meta.dirname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(here, 'rules/base/common.yaml'))) return resolve(here, 'rules/base');
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  return resolve(import.meta.dirname, '../../../../rules/base');
};

const DEFAULT_RULES_DIR = findRulesDir();

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

export const reportCommand = async (args: string[]): Promise<void> => {
  if (args.length === 0) {
    throw new Error('Please provide a path. Usage: skill-guard report <path>');
  }

  const targetPath = resolve(args[0]);
  const targetStat = await stat(targetPath);
  if (!targetStat.isDirectory()) {
    throw new Error(`Expected a directory path, got: ${targetPath}`);
  }

  const rawFiles = await readSkillDirectory(targetPath);
  const adapters: PlatformAdapter[] = [new NewmaxAdapter()];
  const input = {
    files: rawFiles.map((f) => ({ path: f.path, content: f.content })),
  };

  let adapter: PlatformAdapter;
  try {
    adapter = detectAdapter(input, adapters);
  } catch {
    throw new Error('Unable to detect skill format.');
  }

  let bundle: ParsedBundle;
  try {
    bundle = await adapter.parseBundle(input);
  } catch {
    throw new Error('Failed to parse skill bundle.');
  }

  const report = await scanBundle({
    bundle,
    adapter,
    options: {
      reportId: nanoid(12),
      rulesDir: DEFAULT_RULES_DIR,
      scoreThreshold: 30,
      now: new Date(),
    },
  });

  // Build and display metadata card
  const card = {
    skillName: bundle.manifest?.name ?? 'unknown',
    securityScore: report.score,
    securityLevel: report.riskLevel,
    environmentVariables: report.envRefs.map((r) => ({ key: r.name, required: true })),
    permissions: { allowedTools: report.permissions.allowedTools },
    dependencies: report.dependencies.map((d) => ({
      name: d.name,
      source: d.source,
      status: 'unknown',
    })),
  };

  console.log(JSON.stringify(card, null, 2));
};
