import { extname } from 'node:path';
import type { ParsedBundle } from '../adapter/interface.js';
import type { Finding, FindingSnippet, RiskLevel } from '../report/types.js';
import type { RuleDefinition } from './rule-types.js';

/** Lines of context to include before and after the match line in the snippet. */
const SNIPPET_CONTEXT = 2;
/** Truncate any individual snippet line at this many characters. */
const SNIPPET_LINE_MAX = 200;

const buildSnippet = (lines: string[], matchedLineIndex: number): FindingSnippet => {
  const start = Math.max(0, matchedLineIndex - SNIPPET_CONTEXT);
  const end = Math.min(lines.length, matchedLineIndex + SNIPPET_CONTEXT + 1);
  const slice = lines.slice(start, end).map((l) => (l.length > SNIPPET_LINE_MAX ? l.slice(0, SNIPPET_LINE_MAX) + '…' : l));
  return {
    startLine: start + 1, // 1-based
    lines: slice,
    matchIndex: matchedLineIndex - start,
  };
};

export interface RuleEngineResult {
  findings: Finding[];
  score: number;
  riskLevel: RiskLevel;
  hardTriggered: boolean;
}

const isMentionContext = (path: string): boolean => path.endsWith('.md');

const acceptsExtension = (rule: RuleDefinition, filePath: string): boolean => {
  if (!rule.extensions || rule.extensions.length === 0) {
    return true;
  }

  const extension = extname(filePath);
  return rule.extensions.includes(extension);
};

const acceptsContext = (rule: RuleDefinition, filePath: string): boolean => {
  if (!rule.context || rule.context === 'any') {
    return true;
  }

  const mention = isMentionContext(filePath);
  return rule.context === 'mention' ? mention : !mention;
};

/** Shannon entropy in bits per character. Returns 0 for empty strings. */
const shannonEntropy = (s: string): number => {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const len = s.length;
  let h = 0;
  for (const c of freq.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
};

const computeRiskLevel = (score: number): RiskLevel => {
  if (score >= 90) {
    return 'Safe';
  }
  if (score >= 70) {
    return 'Low';
  }
  if (score >= 50) {
    return 'Medium';
  }
  if (score >= 30) {
    return 'High';
  }
  return 'Critical';
};

export const evaluateRules = (bundle: ParsedBundle, rules: RuleDefinition[]): RuleEngineResult => {
  const findings: Finding[] = [];
  const hitFiles = new Map<string, Set<string>>();
  let hardTriggered = false;

  for (const file of bundle.files) {
    if (file.isBinary) {
      continue;
    }

    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      for (const rule of rules) {
        if (!acceptsExtension(rule, file.path) || !acceptsContext(rule, file.path)) {
          continue;
        }

        const regex = new RegExp(rule.pattern, 'i');
        const match = regex.exec(line);
        if (!match) {
          continue;
        }

        // Apply value-level filters when present. Use capture group 1 if defined, else full match.
        const matchedValue = match[1] ?? match[0];
        if (rule.excludeValuePattern) {
          const excludeRe = new RegExp(rule.excludeValuePattern, 'i');
          if (excludeRe.test(matchedValue)) {
            continue;
          }
        }
        if (typeof rule.minValueEntropy === 'number') {
          if (shannonEntropy(matchedValue) < rule.minValueEntropy) {
            continue;
          }
        }

        findings.push({
          id: rule.id,
          message: rule.name,
          source: 'layer1',
          file: file.path,
          line: index + 1,
          hardTrigger: rule.hardTrigger,
          severity: rule.severity,
          ...(rule.description ? { description: rule.description } : {}),
          ...(rule.remediation ? { remediation: rule.remediation } : {}),
          ...(rule.references && rule.references.length > 0 ? { references: rule.references } : {}),
          snippet: buildSnippet(lines, index),
        });

        if (!hitFiles.has(rule.id)) {
          hitFiles.set(rule.id, new Set());
        }
        hitFiles.get(rule.id)!.add(file.path);

        if (rule.hardTrigger) {
          hardTriggered = true;
        }
      }
    }
  }

  const weightedDeductions = rules.reduce((sum, rule) => {
    if (rule.hardTrigger || rule.weight <= 0) {
      return sum;
    }

    const count = hitFiles.get(rule.id)?.size ?? 0;
    if (count === 0) {
      return sum;
    }

    const deduction = rule.weight * ((1 - 0.5 ** count) / (1 - 0.5));
    return sum + deduction;
  }, 0);

  const score = Math.max(0, Math.round(100 - weightedDeductions));

  return {
    findings,
    score,
    riskLevel: computeRiskLevel(score),
    hardTriggered
  };
};
