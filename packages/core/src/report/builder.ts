import type { Dependency, EnvRef } from '../adapter/interface.js';
import type { SecurityReport, Finding } from './types.js';
import type { RuleEngineResult } from '../engine/rule-engine.js';

export interface BuildReportInput {
  reportId: string;
  createdAt?: Date;
  scoreThreshold: number;
  layer0Findings: Finding[];
  ruleResult: RuleEngineResult;
  dependencies: Dependency[];
  envRefs: EnvRef[];
  allowedTools: string[];
}

const uniqueReasons = (reasons: string[]): string[] => Array.from(new Set(reasons));

export const buildReport = (input: BuildReportInput): SecurityReport => {
  const reasons: string[] = [];

  if (input.layer0Findings.length > 0) {
    reasons.push('Layer 0 structural checks failed.');
  }

  if (input.ruleResult.hardTriggered) {
    reasons.push('Hard trigger rule matched.');
  }

  if (input.ruleResult.score < input.scoreThreshold) {
    reasons.push(`Score below threshold (${input.ruleResult.score} < ${input.scoreThreshold}).`);
  }

  const blocked = reasons.length > 0;

  return {
    id: input.reportId,
    blocked,
    score: input.ruleResult.score,
    riskLevel: input.ruleResult.riskLevel,
    reasons: uniqueReasons(reasons),
    findings: [...input.layer0Findings, ...input.ruleResult.findings],
    dependencies: input.dependencies,
    envRefs: input.envRefs,
    permissions: {
      allowedTools: input.allowedTools
    },
    createdAt: (input.createdAt ?? new Date()).toISOString()
  };
};
