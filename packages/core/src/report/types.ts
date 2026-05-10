import type { Dependency, EnvRef } from '../adapter/interface.js';

export type RiskLevel = 'Safe' | 'Low' | 'Medium' | 'High' | 'Critical';

export type FindingSource = 'layer0' | 'layer1';

/** A short snippet of source around the matched line, for human review. */
export interface FindingSnippet {
  /** 1-based line number of the first line included in `lines`. */
  startLine: number;
  /** Source lines, in order. */
  lines: string[];
  /** Index within `lines` (0-based) that corresponds to the actual match line. */
  matchIndex: number;
}

export interface Finding {
  id: string;
  message: string;
  source: FindingSource;
  file?: string;
  line?: number;
  hardTrigger?: boolean;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
  /** Long-form explanation of the risk. Same for every finding of the same rule. */
  description?: string;
  /** Concrete fix guidance. Same for every finding of the same rule. */
  remediation?: string;
  /** External references (CWE, OWASP, etc.). */
  references?: string[];
  /** Code excerpt around the match line. Only present for layer1 findings. */
  snippet?: FindingSnippet;
}

export interface SecurityReport {
  id: string;
  blocked: boolean;
  score: number;
  riskLevel: RiskLevel;
  reasons: string[];
  findings: Finding[];
  dependencies: Dependency[];
  envRefs: EnvRef[];
  permissions: {
    allowedTools: string[];
  };
  createdAt: string;
}
