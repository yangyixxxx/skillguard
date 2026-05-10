import type { Dependency, EnvRef } from '../adapter/interface.js';
import type { Finding, SecurityReport, RiskLevel } from './types.js';

export interface NetworkPermission {
  domain: string;
  protocol: string;
  purpose?: string;
}

export interface FilePermission {
  path: string;
  access: 'read' | 'write';
  purpose?: string;
}

export interface DependencyStatus {
  name: string;
  version?: string;
  status: 'whitelisted' | 'known' | 'unknown' | 'suspicious';
  source: string;
  warning?: string;
}

export interface MetadataCard {
  skillName: string;
  generatedAt: string;
  securityScore: number;
  securityLevel: RiskLevel;
  environmentVariables: Array<{
    key: string;
    required: boolean;
  }>;
  permissions: {
    allowedTools: string[];
    network: NetworkPermission[];
    fileWrite: FilePermission[];
    subprocess: boolean;
  };
  dependencies: DependencyStatus[];
  findings: Array<{
    severity: string;
    description: string;
  }>;
  review: {
    ruleEngine: string;
    llmReview?: string;
    dependencyAnalysis?: string;
  };
}

export interface MetadataCardInput {
  report: SecurityReport;
  skillName?: string;
}

export const buildMetadataCard = (input: MetadataCardInput): MetadataCard => {
  const { report, skillName } = input;

  const environmentVariables = report.envRefs.map((ref) => ({
    key: ref.name,
    required: true,
  }));

  // Extract network permissions from dependencies/findings
  const network: NetworkPermission[] = [];
  const fileWrite: FilePermission[] = [];
  let subprocess = false;

  for (const finding of report.findings) {
    if (finding.id === 'SUBPROCESS_SHELL' || finding.id === 'NODE_CHILD_EXEC') {
      subprocess = true;
    }
  }

  const dependencies: DependencyStatus[] = report.dependencies.map((dep) => ({
    name: dep.name,
    version: undefined,
    status: 'unknown' as const,
    source: dep.source,
  }));

  const findingSummaries = report.findings
    .filter((f) => f.severity && f.severity !== 'Low')
    .map((f) => ({
      severity: f.severity ?? 'Low',
      description: `${f.message}${f.file ? ` in ${f.file}` : ''}`,
    }));

  return {
    skillName: skillName ?? 'unknown',
    generatedAt: report.createdAt,
    securityScore: report.score,
    securityLevel: report.riskLevel,
    environmentVariables,
    permissions: {
      allowedTools: report.permissions.allowedTools,
      network,
      fileWrite,
      subprocess,
    },
    dependencies,
    findings: findingSummaries,
    review: {
      ruleEngine: `${report.blocked ? 'Blocked' : 'Passed'} (score ${report.score})`,
    },
  };
};
