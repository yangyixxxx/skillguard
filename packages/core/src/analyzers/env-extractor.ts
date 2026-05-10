import type { EnvRef, ParsedBundle } from '../adapter/interface.js';

const ENV_PATTERNS = [
  /process\.env\.([A-Z0-9_]+)/g,
  /os\.environ\[['"]([A-Z0-9_]+)['"]\]/g,
  /getenv\(['"]([A-Z0-9_]+)['"]\)/g
];

export const extractEnvRefs = (bundle: ParsedBundle): EnvRef[] => {
  const refs = new Map<string, EnvRef>();

  for (const file of bundle.files) {
    for (const pattern of ENV_PATTERNS) {
      const content = file.content;
      let match = pattern.exec(content);
      while (match) {
        const name = match[1];
        refs.set(`${file.path}:${name}`, { name, file: file.path });
        match = pattern.exec(content);
      }
      pattern.lastIndex = 0;
    }
  }

  return Array.from(refs.values());
};
