import type { AdapterBundleInput, PlatformAdapter } from './interface.js';

const MCP_INDICATORS = [
  '@modelcontextprotocol/sdk',
  'mcp',
  'fastmcp'
];

const hasMcpSignature = (input: AdapterBundleInput): boolean => {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  const packageJson = input.files.find((file) => file.path === 'package.json');
  if (packageJson) {
    try {
      const content = decoder.decode(packageJson.content);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const deps = {
        ...(typeof parsed.dependencies === 'object' && parsed.dependencies !== null ? parsed.dependencies : {}),
        ...(typeof parsed.devDependencies === 'object' && parsed.devDependencies !== null ? parsed.devDependencies : {})
      };
      if (MCP_INDICATORS.some((indicator) => indicator in deps)) {
        return true;
      }
    } catch {
      // not valid JSON, skip
    }
  }

  const pyproject = input.files.find((file) => file.path === 'pyproject.toml');
  if (pyproject) {
    try {
      const content = decoder.decode(pyproject.content);
      if (content.includes('mcp') || content.includes('fastmcp') || content.includes('modelcontextprotocol')) {
        return true;
      }
    } catch {
      // not valid UTF-8, skip
    }
  }

  return false;
};

export const detectAdapter = (
  input: AdapterBundleInput,
  adapters: PlatformAdapter[]
): PlatformAdapter => {
  const hasSkillManifest = input.files.some((file) => file.path === 'SKILL.md');
  const hasScriptsDir = input.files.some((file) => file.path.startsWith('scripts/'));

  // OpenClaw: SKILL.md + scripts/ directory
  if (hasSkillManifest && hasScriptsDir) {
    const openclawAdapter = adapters.find((adapter) => adapter.id === 'openclaw');
    if (openclawAdapter) {
      return openclawAdapter;
    }
  }

  // Newmax: SKILL.md without scripts/ directory
  if (hasSkillManifest) {
    const newmaxAdapter = adapters.find((adapter) => adapter.id === 'newmax');
    if (newmaxAdapter) {
      return newmaxAdapter;
    }
  }

  // MCP: package.json with MCP deps or pyproject.toml with MCP refs
  if (hasMcpSignature(input)) {
    const mcpAdapter = adapters.find((adapter) => adapter.id === 'mcp');
    if (mcpAdapter) {
      return mcpAdapter;
    }
  }

  // GPTs: openapi.json or openapi.yaml
  const hasOpenApiSpec = input.files.some(
    (file) =>
      file.path === 'openapi.json' ||
      file.path === 'openapi.yaml' ||
      file.path === 'openapi.yml'
  );
  if (hasOpenApiSpec) {
    const gptsAdapter = adapters.find((adapter) => adapter.id === 'gpts');
    if (gptsAdapter) {
      return gptsAdapter;
    }
  }

  if (adapters.length > 0) {
    return adapters[0];
  }

  throw new Error('No adapter available for uploaded bundle.');
};
