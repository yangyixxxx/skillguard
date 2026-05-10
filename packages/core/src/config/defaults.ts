export const DEFAULT_GATE1_SCORE_THRESHOLD = 30;
export const DEFAULT_GATE1_TIMEOUT_MS = 5000;
export const DEFAULT_RULE_SCAN_TIMEOUT_MS = 2000;
export const DEFAULT_MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_FILES = 200;
export const DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_SINGLE_FILE_BYTES = 1 * 1024 * 1024;
export const DEFAULT_MAX_REFERENCES_FILES = 100;
export const DEFAULT_MAX_REFERENCES_SINGLE_FILE_BYTES = 512 * 1024;

export const DEFAULT_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob'] as const;

export const ALLOWED_TOOLS_WHITELIST = [
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'Write',
  'Edit',
  'MultiEdit',
  'WebSearch',
  'WebFetch'
] as const;
