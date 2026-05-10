#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await build({
  entryPoints: [resolve(root, 'packages/cli/src/bin/skill-guard.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(root, 'dist/skill-guard.mjs'),
  legalComments: 'none',
  packages: 'bundle',
  banner: {
    js: "import { createRequire as __cR } from 'module'; const require = __cR(import.meta.url);",
  },
});

console.log('built dist/skill-guard.mjs');
