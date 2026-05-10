import type { SecurityReport } from '@aspect/skill-guard';
import { toSarif } from '@aspect/skill-guard';

export const formatSarif = (report: SecurityReport): string => {
  const sarif = toSarif(report);
  return JSON.stringify(sarif, null, 2);
};
