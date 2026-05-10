import type { Dependency, ParsedBundle } from '../adapter/interface.js';

const push = (set: Map<string, Dependency>, dep: Dependency): void => {
  set.set(`${dep.file}:${dep.source}:${dep.name}`, dep);
};

export const extractDependencies = (bundle: ParsedBundle): Dependency[] => {
  const result = new Map<string, Dependency>();

  for (const file of bundle.files) {
    const lines = file.content.split(/\r?\n/);

    for (const line of lines) {
      const pythonImport = line.match(/^\s*import\s+([a-zA-Z0-9_\.]+)/);
      if (pythonImport) {
        push(result, { name: pythonImport[1], source: 'python-import', file: file.path });
      }

      const pythonFrom = line.match(/^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+/);
      if (pythonFrom) {
        push(result, { name: pythonFrom[1], source: 'python-import', file: file.path });
      }

      const nodeRequire = line.match(/require\(['"]([^'"]+)['"]\)/);
      if (nodeRequire) {
        push(result, { name: nodeRequire[1], source: 'node-require', file: file.path });
      }

      const nodeImport = line.match(/import\s+.+\s+from\s+['"]([^'"]+)['"]/);
      if (nodeImport) {
        push(result, { name: nodeImport[1], source: 'node-import', file: file.path });
      }

      const pipInstall = line.match(/pip\s+install\s+([a-zA-Z0-9_\-\.]+)/);
      if (pipInstall) {
        push(result, { name: pipInstall[1], source: 'pip-install', file: file.path });
      }

      const aptInstall = line.match(/apt(?:-get)?\s+install\s+([a-zA-Z0-9_\-\.]+)/);
      if (aptInstall) {
        push(result, { name: aptInstall[1], source: 'apt-install', file: file.path });
      }

      const brewInstall = line.match(/brew\s+install\s+([a-zA-Z0-9_\-\.]+)/);
      if (brewInstall) {
        push(result, { name: brewInstall[1], source: 'brew-install', file: file.path });
      }
    }
  }

  return Array.from(result.values());
};
