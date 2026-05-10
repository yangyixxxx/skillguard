export type RuleSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export type RuleContext = 'exec' | 'mention' | 'any';

export interface RuleDefinition {
  id: string;
  name: string;
  pattern: string;
  severity: RuleSeverity;
  weight: number;
  hardTrigger: boolean;
  extensions?: string[];
  context?: RuleContext;
  /**
   * Optional. If the matched substring (capture group 1 if present, else full match) also matches
   * this regex, the finding is suppressed. Useful for filtering out env-var refs and placeholders.
   */
  excludeValuePattern?: string;
  /**
   * Optional. Minimum Shannon entropy (bits/char) of the matched substring. Below this the finding
   * is suppressed. Helps filter low-entropy placeholders like "xxxxxxxxxxxxxxxx".
   */
  minValueEntropy?: number;

  /**
   * Optional. Long-form explanation of why this rule fires and the underlying risk.
   * Plain text or markdown. Rendered to humans / consumed by AI agents.
   */
  description?: string;
  /** Optional. Concrete remediation guidance for developers. */
  remediation?: string;
  /** Optional. External references (CWE, OWASP, blog posts). */
  references?: string[];
}

export interface RuleMatch {
  ruleId: string;
  file: string;
  line: number;
  content: string;
  hardTrigger: boolean;
  severity: RuleSeverity;
}
