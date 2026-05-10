import type { ParsedBundle } from '../adapter/interface.js';
import { normalizeAllowedTools, parseFrontmatter } from './frontmatter.js';

export const extractAllowedTools = (bundle: ParsedBundle): string[] => {
  const manifest = bundle.files.find((file) => file.path === 'SKILL.md');
  if (!manifest) {
    return normalizeAllowedTools(undefined);
  }

  const parsed = parseFrontmatter(manifest.content);
  return normalizeAllowedTools(parsed.data['allowed-tools']);
};
