/**
 * SkillGuard SDK — simplified one-liner API for integrating security scanning.
 *
 * Usage:
 *   import { SkillGuard } from '@aspect/skill-guard';
 *
 *   const guard = new SkillGuard();
 *   const report = await guard.scanDirectory('./my-skill');
 *   if (report.blocked) console.error('Skill blocked:', report.reasons);
 */

import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { scanBundle } from './scanner.js';
import { detectAdapter } from './adapter/auto-detect.js';
import { analyzeStructure } from './analyzers/structure.js';
import { evaluateRules } from './engine/rule-engine.js';
import { loadRules } from './engine/rule-loader.js';
import { extractDependencies } from './analyzers/dependency.js';
import { extractEnvRefs } from './analyzers/env-extractor.js';
import { normalizeCode } from './analyzers/normalizer.js';
import { buildReport } from './report/builder.js';
import { buildMetadataCard } from './report/metadata-card.js';
import { toSarif } from './report/sarif.js';
import type { PlatformAdapter, ParsedBundle } from './adapter/interface.js';
import type { SecurityReport } from './report/types.js';
import type { MetadataCard } from './report/metadata-card.js';
import type { SarifReport } from './report/sarif.js';
import type { NormalizeResult } from './analyzers/normalizer.js';
import {
  DEFAULT_GATE1_SCORE_THRESHOLD,
  DEFAULT_GATE1_TIMEOUT_MS,
  DEFAULT_RULE_SCAN_TIMEOUT_MS,
} from './config/defaults.js';

export interface SkillGuardOptions {
  /** Path to rules directory. Defaults to built-in rules. */
  rulesDir?: string;
  /** Score threshold for blocking. Default: 30 */
  scoreThreshold?: number;
  /** Overall scan timeout in ms. Default: 5000 */
  timeoutMs?: number;
  /** Platform adapters. If not provided, auto-detect is used with built-in adapters. */
  adapters?: PlatformAdapter[];
}

export interface ScanResult {
  report: SecurityReport;
  metadataCard: MetadataCard;
  sarif: SarifReport;
}

export interface FileScanResult {
  score: number;
  riskLevel: string;
  hardTriggered: boolean;
  findings: SecurityReport['findings'];
}

const generateId = (): string => randomBytes(6).toString('hex');

async function readDirectory(dirPath: string): Promise<Array<{ path: string; content: Buffer }>> {
  const files: Array<{ path: string; content: Buffer }> = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        files.push({ path: relativePath, content: await readFile(fullPath) });
      }
    }
  };
  await walk(dirPath, '');
  return files;
}

export class SkillGuard {
  private rulesDir: string;
  private scoreThreshold: number;
  private timeoutMs: number;
  private adapters: PlatformAdapter[];

  constructor(options: SkillGuardOptions = {}) {
    // Default rules dir: look for rules/base relative to common project layouts
    this.rulesDir = options.rulesDir ?? resolve(process.cwd(), 'rules/base');
    this.scoreThreshold = options.scoreThreshold ?? DEFAULT_GATE1_SCORE_THRESHOLD;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GATE1_TIMEOUT_MS;
    this.adapters = options.adapters ?? [];
  }

  /**
   * Scan a skill directory. Returns report, metadata card, and SARIF output.
   *
   * ```ts
   * const guard = new SkillGuard({ rulesDir: './rules/base' });
   * const { report } = await guard.scanDirectory('./my-skill');
   * console.log(report.score, report.riskLevel);
   * ```
   */
  async scanDirectory(dirPath: string): Promise<ScanResult> {
    const absPath = resolve(dirPath);
    const pathStat = await stat(absPath);
    if (!pathStat.isDirectory()) {
      throw new Error(`Not a directory: ${absPath}`);
    }

    const rawFiles = await readDirectory(absPath);
    const input = { files: rawFiles.map(f => ({ path: f.path, content: f.content })) };

    // Load adapters dynamically if none provided
    const adapters = this.adapters.length > 0 ? this.adapters : await this.loadDefaultAdapters();

    const adapter = detectAdapter(input, adapters);
    const bundle = await adapter.parseBundle(input);

    const structure = analyzeStructure(bundle);
    if (structure.blocked) {
      // Return a blocked report with score 0
      const report: SecurityReport = {
        id: generateId(),
        blocked: true,
        score: 0,
        riskLevel: 'Critical',
        reasons: structure.findings.map(f => f.message),
        findings: structure.findings,
        dependencies: [],
        envRefs: [],
        permissions: { allowedTools: [] },
        createdAt: new Date().toISOString(),
      };
      return {
        report,
        metadataCard: buildMetadataCard({ report }),
        sarif: toSarif(report),
      };
    }

    const report = await scanBundle({
      bundle,
      adapter,
      options: {
        reportId: generateId(),
        rulesDir: this.rulesDir,
        scoreThreshold: this.scoreThreshold,
        gate1TimeoutMs: this.timeoutMs,
        now: new Date(),
      },
    });

    return {
      report,
      metadataCard: buildMetadataCard({ report }),
      sarif: toSarif(report),
    };
  }

  /**
   * Scan a single file's content against the rule engine.
   *
   * ```ts
   * const result = await guard.scanFile('import os; os.system("rm -rf /")', 'evil.py');
   * ```
   */
  async scanFile(content: string, filename: string): Promise<FileScanResult> {
    const bundle: ParsedBundle = {
      files: [{
        path: filename,
        content,
        rawContent: Buffer.from(content, 'utf-8'),
        type: 'code',
        language: this.detectLanguage(filename),
        isBinary: false,
      }],
    };

    const rulePaths = [
      resolve(this.rulesDir, 'hard-triggers.yaml'),
      resolve(this.rulesDir, 'common.yaml'),
    ];
    const rules = await loadRules(rulePaths);
    const result = evaluateRules(bundle, rules);

    return {
      score: result.score,
      riskLevel: result.riskLevel,
      hardTriggered: result.hardTriggered,
      findings: result.findings,
    };
  }

  /**
   * Deobfuscate code — decode base64, hex, char codes, string concatenation.
   */
  normalize(content: string): NormalizeResult {
    return normalizeCode(content);
  }

  /**
   * Check if a file content is safe (score >= threshold).
   * Convenience method that returns a simple boolean.
   */
  async isSafe(content: string, filename: string): Promise<boolean> {
    const result = await this.scanFile(content, filename);
    return !result.hardTriggered && result.score >= this.scoreThreshold;
  }

  private detectLanguage(filename: string): string {
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.ts')) return 'typescript';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.sh')) return 'shell';
    if (filename.endsWith('.md')) return 'markdown';
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'yaml';
    return 'unknown';
  }

  private async loadDefaultAdapters(): Promise<PlatformAdapter[]> {
    const loaded: PlatformAdapter[] = [];
    const tryLoad = async (pkg: string, name: string): Promise<void> => {
      try {
        // Dynamic import of optional peer adapter packages
        const mod = await (import(pkg) as Promise<Record<string, new () => PlatformAdapter>>);
        loaded.push(new mod[name]());
      } catch {
        // Adapter not installed — skip
      }
    };
    await tryLoad('@aspect/skill-guard-adapter-newmax', 'NewmaxAdapter');
    await tryLoad('@aspect/skill-guard-adapter-openclaw', 'OpenClawAdapter');
    await tryLoad('@aspect/skill-guard-adapter-mcp', 'McpAdapter');
    await tryLoad('@aspect/skill-guard-adapter-gpts', 'GptsAdapter');
    if (loaded.length === 0) {
      throw new Error('No platform adapters available. Install at least @aspect/skill-guard-adapter-newmax.');
    }
    return loaded;
  }
}
