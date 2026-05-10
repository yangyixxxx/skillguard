import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse } from 'yaml';
import type { RuleDefinition } from './rule-types.js';
import { SkillGuardError } from '../errors.js';

interface RawRulesFile {
  rules: Array<Partial<RuleDefinition>>;
}

const toRule = (entry: Partial<RuleDefinition>): RuleDefinition => {
  if (!entry.id || !entry.pattern) {
    throw new SkillGuardError('RULES_UNAVAILABLE', 'Rule definition is missing id or pattern.');
  }

  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    pattern: entry.pattern,
    severity: entry.severity ?? 'Low',
    weight: entry.weight ?? 0,
    hardTrigger: entry.hardTrigger ?? false,
    extensions: entry.extensions,
    context: entry.context ?? 'any',
    excludeValuePattern: entry.excludeValuePattern,
    minValueEntropy: entry.minValueEntropy,
    description: entry.description,
    remediation: entry.remediation,
    references: entry.references,
  };
};

const loadRulesFromFile = async (path: string): Promise<RuleDefinition[]> => {
  const content = await readFile(path, 'utf-8');
  const parsed = parse(content) as RawRulesFile;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new SkillGuardError('RULES_UNAVAILABLE', `Invalid rule file format: ${path}`);
  }
  return parsed.rules.map(toRule);
};

/**
 * Discover all .yaml / .yml rule files inside a directory (non-recursive).
 */
const discoverRuleFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await readdir(dirPath);
  return entries
    .filter((entry) => {
      const ext = extname(entry).toLowerCase();
      return ext === '.yaml' || ext === '.yml';
    })
    .sort()
    .map((entry) => join(dirPath, entry));
};

/**
 * Load rules from an array of file paths.
 */
export const loadRules = async (paths: string[]): Promise<RuleDefinition[]> => {
  try {
    const loaded = await Promise.all(paths.map(loadRulesFromFile));
    return loaded.flat();
  } catch (error) {
    if (error instanceof SkillGuardError) {
      throw error;
    }

    throw new SkillGuardError('RULES_UNAVAILABLE', 'Failed to load security rules.');
  }
};

/**
 * Load rules from a directory by globbing for all .yaml / .yml files.
 * Supports a `definitions/` directory pattern where rules are split across
 * multiple YAML files.
 */
export const loadRulesFromDirectory = async (dirPath: string): Promise<RuleDefinition[]> => {
  try {
    const info = await stat(dirPath);
    if (!info.isDirectory()) {
      throw new SkillGuardError('RULES_UNAVAILABLE', `Path is not a directory: ${dirPath}`);
    }

    const filePaths = await discoverRuleFiles(dirPath);
    if (filePaths.length === 0) {
      return [];
    }

    const loaded = await Promise.all(filePaths.map(loadRulesFromFile));
    return loaded.flat();
  } catch (error) {
    if (error instanceof SkillGuardError) {
      throw error;
    }

    throw new SkillGuardError('RULES_UNAVAILABLE', `Failed to load rules from directory: ${dirPath}`);
  }
};
