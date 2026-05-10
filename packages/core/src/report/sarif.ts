import type { SecurityReport, Finding } from './types.js';

interface SarifMessage {
  text: string;
}

interface SarifArtifactLocation {
  uri: string;
}

interface SarifRegion {
  startLine: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: SarifMessage;
  locations: SarifLocation[];
}

interface SarifRule {
  id: string;
  shortDescription: SarifMessage;
  defaultConfiguration: {
    level: 'error' | 'warning' | 'note' | 'none';
  };
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

export interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

const severityToLevel = (severity?: string): 'error' | 'warning' | 'note' | 'none' => {
  switch (severity) {
    case 'Critical':
      return 'error';
    case 'High':
      return 'error';
    case 'Medium':
      return 'warning';
    case 'Low':
      return 'note';
    default:
      return 'none';
  }
};

export const toSarif = (report: SecurityReport, version = '0.1.0'): SarifReport => {
  const ruleMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const finding of report.findings) {
    if (!ruleMap.has(finding.id)) {
      ruleMap.set(finding.id, {
        id: finding.id,
        shortDescription: { text: finding.message },
        defaultConfiguration: {
          level: severityToLevel(finding.severity),
        },
      });
    }

    results.push({
      ruleId: finding.id,
      level: severityToLevel(finding.severity),
      message: { text: finding.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: finding.file ?? 'unknown' },
            ...(finding.line ? { region: { startLine: finding.line } } : {}),
          },
        },
      ],
    });
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'skill-guard',
            version,
            informationUri: 'https://github.com/aspect-ai/skill-guard',
            rules: Array.from(ruleMap.values()),
          },
        },
        results,
      },
    ],
  };
};
