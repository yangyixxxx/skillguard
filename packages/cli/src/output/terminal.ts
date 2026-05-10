import type { SecurityReport } from '@aspect/skill-guard';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const scoreColor = (score: number): string => {
  if (score >= 90) return GREEN;
  if (score >= 70) return BLUE;
  if (score >= 50) return YELLOW;
  return RED;
};

const severityIcon = (severity: string): string => {
  switch (severity) {
    case 'Critical': return `${RED}■${RESET}`;
    case 'High': return `${RED}■${RESET}`;
    case 'Medium': return `${YELLOW}■${RESET}`;
    case 'Low': return `${BLUE}■${RESET}`;
    default: return `${DIM}■${RESET}`;
  }
};

const line = (width: number): string => '─'.repeat(width);

export const formatTerminal = (report: SecurityReport): string => {
  const width = 55;
  const lines: string[] = [];

  lines.push(`┌${line(width)}┐`);
  lines.push(`│  ${BOLD}skill-guard${RESET} v0.1.0${' '.repeat(width - 22)}│`);
  lines.push(`├${line(width)}┤`);

  const color = scoreColor(report.score);
  lines.push(`│  Score: ${color}${BOLD}${report.score}/100${RESET}  Level: ${color}${report.riskLevel}${RESET}${' '.repeat(Math.max(0, width - 30 - report.riskLevel.length - String(report.score).length))}│`);
  lines.push(`│  Status: ${report.blocked ? `${RED}BLOCKED${RESET}` : `${GREEN}PASSED${RESET}`}${' '.repeat(width - (report.blocked ? 18 : 17))}│`);

  // Findings summary
  const hardTriggers = report.findings.filter((f) => f.hardTrigger).length;
  const critical = report.findings.filter((f) => f.severity === 'Critical' && !f.hardTrigger).length;
  const high = report.findings.filter((f) => f.severity === 'High').length;
  const medium = report.findings.filter((f) => f.severity === 'Medium').length;
  const low = report.findings.filter((f) => f.severity === 'Low').length;

  lines.push(`│${' '.repeat(width)}│`);
  lines.push(`│  ${RED}Hard Triggers: ${hardTriggers}${RESET}${' '.repeat(Math.max(0, width - 20 - String(hardTriggers).length))}│`);
  lines.push(`│  ${RED}Critical: ${critical}${RESET}  ${RED}High: ${high}${RESET}  ${YELLOW}Medium: ${medium}${RESET}  ${BLUE}Low: ${low}${RESET}${' '.repeat(Math.max(0, width - 48 - String(critical).length - String(high).length - String(medium).length - String(low).length))}│`);

  // Detailed findings
  if (report.findings.length > 0) {
    lines.push(`├${line(width)}┤`);
    lines.push(`│  ${BOLD}Findings:${RESET}${' '.repeat(width - 11)}│`);
    for (const finding of report.findings.slice(0, 10)) {
      const icon = severityIcon(finding.severity ?? 'Low');
      const loc = finding.file ? `${DIM}${finding.file}${finding.line ? `:${finding.line}` : ''}${RESET}` : '';
      lines.push(`│  ${icon} ${finding.message} ${loc}│`);
    }
    if (report.findings.length > 10) {
      lines.push(`│  ${DIM}... and ${report.findings.length - 10} more${RESET}${' '.repeat(Math.max(0, width - 18 - String(report.findings.length - 10).length))}│`);
    }
  }

  // Environment variables
  if (report.envRefs.length > 0) {
    lines.push(`├${line(width)}┤`);
    lines.push(`│  ${BOLD}Environment Variables:${RESET}${' '.repeat(width - 23)}│`);
    for (const env of report.envRefs) {
      lines.push(`│    ${CYAN}${env.name}${RESET}${' '.repeat(Math.max(0, width - env.name.length - 6))}│`);
    }
  }

  // Permissions
  lines.push(`├${line(width)}┤`);
  lines.push(`│  ${BOLD}Permissions:${RESET}${' '.repeat(width - 14)}│`);
  const tools = report.permissions.allowedTools.join(', ');
  lines.push(`│    Tools: ${tools}${' '.repeat(Math.max(0, width - tools.length - 13))}│`);

  // Dependencies
  if (report.dependencies.length > 0) {
    lines.push(`├${line(width)}┤`);
    lines.push(`│  ${BOLD}Dependencies:${RESET}${' '.repeat(width - 15)}│`);
    for (const dep of report.dependencies) {
      lines.push(`│    ${dep.name} ${DIM}(${dep.source})${RESET}${' '.repeat(Math.max(0, width - dep.name.length - dep.source.length - 8))}│`);
    }
  }

  lines.push(`└${line(width)}┘`);

  return lines.join('\n');
};
