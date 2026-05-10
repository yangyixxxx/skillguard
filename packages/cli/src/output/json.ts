import type { SecurityReport } from '@aspect/skill-guard';

export const formatJson = (report: SecurityReport): string => {
  return JSON.stringify(report, null, 2);
};
