import { resolve } from 'node:path';
import type { ParsedBundle, PlatformAdapter } from './adapter/interface.js';
import {
  DEFAULT_GATE1_SCORE_THRESHOLD,
  DEFAULT_GATE1_TIMEOUT_MS,
  DEFAULT_RULE_SCAN_TIMEOUT_MS
} from './config/defaults.js';
import { extractDependencies } from './analyzers/dependency.js';
import { extractEnvRefs } from './analyzers/env-extractor.js';
import { analyzeStructure } from './analyzers/structure.js';
import { loadRules } from './engine/rule-loader.js';
import { evaluateRules } from './engine/rule-engine.js';
import { buildReport } from './report/builder.js';
import type { SecurityReport } from './report/types.js';
import { SkillGuardError } from './errors.js';

export interface ScannerOptions {
  scoreThreshold?: number;
  gate1TimeoutMs?: number;
  ruleScanTimeoutMs?: number;
  rulesDir: string;
  reportId: string;
  now?: Date;
}

export interface ScannerInput {
  bundle: ParsedBundle;
  adapter: PlatformAdapter;
  options: ScannerOptions;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, code: 'GATE1_TIMEOUT'): Promise<T> => {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new SkillGuardError(code, `Operation timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolvePromise(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        rejectPromise(error);
      });
  });
};

const uniqueBy = <T, K>(values: T[], keyGetter: (value: T) => K): T[] => {
  const map = new Map<K, T>();
  for (const value of values) {
    map.set(keyGetter(value), value);
  }
  return Array.from(map.values());
};

export const scanBundle = async (input: ScannerInput): Promise<SecurityReport> => {
  const {
    bundle,
    adapter,
    options: {
      scoreThreshold = DEFAULT_GATE1_SCORE_THRESHOLD,
      gate1TimeoutMs = DEFAULT_GATE1_TIMEOUT_MS,
      ruleScanTimeoutMs = DEFAULT_RULE_SCAN_TIMEOUT_MS,
      rulesDir,
      reportId,
      now
    }
  } = input;

  const run = async (): Promise<SecurityReport> => {
    const layer0 = analyzeStructure(bundle);

    const rulePaths = [
      resolve(rulesDir, 'hard-triggers.yaml'),
      resolve(rulesDir, 'common.yaml')
    ];

    const rules = await withTimeout(loadRules(rulePaths), ruleScanTimeoutMs, 'GATE1_TIMEOUT').catch(
      (error: unknown) => {
        if (error instanceof SkillGuardError && error.code === 'GATE1_TIMEOUT') {
          throw new SkillGuardError('RULES_UNAVAILABLE', 'Security rules loading timed out.');
        }

        throw new SkillGuardError('RULES_UNAVAILABLE', 'Failed to load rules for Gate 1.');
      }
    );

    const ruleResult = evaluateRules(bundle, rules);

    const [adapterDependencies, adapterEnvRefs, metadata] = await Promise.all([
      adapter.extractDependencies(bundle),
      adapter.extractEnvRefs(bundle),
      adapter.extractMetadata(bundle)
    ]);

    const dependencies = uniqueBy(
      [...adapterDependencies, ...extractDependencies(bundle)],
      (dep) => `${dep.file}:${dep.source}:${dep.name}`
    );

    const envRefs = uniqueBy(
      [...adapterEnvRefs, ...extractEnvRefs(bundle)],
      (envRef) => `${envRef.file}:${envRef.name}`
    );

    return buildReport({
      reportId,
      createdAt: now,
      scoreThreshold,
      layer0Findings: layer0.findings,
      ruleResult,
      dependencies,
      envRefs,
      allowedTools: metadata.allowedTools ?? layer0.allowedTools
    });
  };

  try {
    return await withTimeout(run(), gate1TimeoutMs, 'GATE1_TIMEOUT');
  } catch (error) {
    if (error instanceof SkillGuardError) {
      throw error;
    }

    throw new SkillGuardError('RULES_UNAVAILABLE', 'Unexpected scanner failure.');
  }
};
