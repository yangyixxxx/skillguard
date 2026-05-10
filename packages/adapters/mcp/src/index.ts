import {
  extractDependencies,
  extractEnvRefs,
  type AdapterBundleInput,
  type Dependency,
  type EnvRef,
  type ExtensionMetadata,
  type ParsedBundle,
  type ParsedFile,
  type ParsedFileType,
  type PlatformAdapter
} from '@aspect/skill-guard';

const BINARY_SAMPLE_SIZE = 4096;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const MCP_INDICATORS = [
  '@modelcontextprotocol/sdk',
  'mcp',
  'fastmcp'
];

const detectBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SAMPLE_SIZE));
  return sample.includes(0);
};

const detectFileType = (path: string): ParsedFileType => {
  if (path === 'package.json' || path === 'pyproject.toml') {
    return 'manifest';
  }
  if (path.startsWith('src/')) {
    return 'code';
  }
  if (path.endsWith('.md')) {
    return 'doc';
  }
  if (path.endsWith('.yaml') || path.endsWith('.yml') || path.endsWith('.json')) {
    return 'config';
  }
  return 'code';
};

const detectLanguage = (path: string): string | undefined => {
  if (path.endsWith('.md')) {
    return 'markdown';
  }
  if (path.endsWith('.py')) {
    return 'python';
  }
  if (path.endsWith('.ts')) {
    return 'typescript';
  }
  if (path.endsWith('.js')) {
    return 'javascript';
  }
  if (path.endsWith('.sh')) {
    return 'shell';
  }
  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    return 'yaml';
  }
  if (path.endsWith('.toml')) {
    return 'toml';
  }
  return undefined;
};

const parseSimpleJson = (content: string): Record<string, unknown> => {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const isMcpPackageJson = (content: string): boolean => {
  const parsed = parseSimpleJson(content);
  const deps = {
    ...(typeof parsed.dependencies === 'object' && parsed.dependencies !== null ? parsed.dependencies : {}),
    ...(typeof parsed.devDependencies === 'object' && parsed.devDependencies !== null ? parsed.devDependencies : {})
  };

  return MCP_INDICATORS.some((indicator) => indicator in deps);
};

const isMcpPyproject = (content: string): boolean => {
  return content.includes('mcp') || content.includes('fastmcp') || content.includes('modelcontextprotocol');
};

export class McpAdapter implements PlatformAdapter {
  readonly id = 'mcp';

  async parseBundle(input: AdapterBundleInput | Buffer): Promise<ParsedBundle> {
    if (Buffer.isBuffer(input)) {
      throw new Error('McpAdapter expects already-unpacked files for Gate 1 MVP.');
    }

    const files: ParsedFile[] = input.files.map((file) => {
      const normalizedPath = file.path.replace(/\\+/g, '/').replace(/^\.\//, '');

      const isBinary = detectBinary(file.content);
      let content = '';
      if (!isBinary) {
        try {
          content = utf8Decoder.decode(file.content);
        } catch {
          throw new Error(`File ${normalizedPath} is not valid UTF-8.`);
        }
      }

      return {
        path: normalizedPath,
        content,
        rawContent: file.content,
        type: detectFileType(normalizedPath),
        language: detectLanguage(normalizedPath),
        isBinary,
        isSymlink: file.isSymlink
      };
    });

    const hasManifest = files.some(
      (file) => file.path === 'package.json' || file.path === 'pyproject.toml'
    );
    if (!hasManifest) {
      throw new Error('MCP bundle must contain package.json or pyproject.toml.');
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return { files };
  }

  async extractMetadata(bundle: ParsedBundle): Promise<ExtensionMetadata> {
    const packageJson = bundle.files.find((file) => file.path === 'package.json');
    if (packageJson) {
      const parsed = parseSimpleJson(packageJson.content);
      const toolDeclarations = this.extractToolDeclarations(bundle);

      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        description: typeof parsed.description === 'string' ? parsed.description : undefined,
        allowedTools: toolDeclarations.length > 0 ? toolDeclarations : undefined
      };
    }

    const pyproject = bundle.files.find((file) => file.path === 'pyproject.toml');
    if (pyproject) {
      const nameMatch = pyproject.content.match(/^name\s*=\s*"([^"]+)"/m);
      const descriptionMatch = pyproject.content.match(/^description\s*=\s*"([^"]+)"/m);
      const toolDeclarations = this.extractToolDeclarations(bundle);

      return {
        name: nameMatch ? nameMatch[1] : undefined,
        description: descriptionMatch ? descriptionMatch[1] : undefined,
        allowedTools: toolDeclarations.length > 0 ? toolDeclarations : undefined
      };
    }

    return {};
  }

  async extractDependencies(bundle: ParsedBundle): Promise<Dependency[]> {
    const codeDeps = extractDependencies(bundle);

    const packageJson = bundle.files.find((file) => file.path === 'package.json');
    if (packageJson) {
      const parsed = parseSimpleJson(packageJson.content);
      const deps = typeof parsed.dependencies === 'object' && parsed.dependencies !== null
        ? parsed.dependencies as Record<string, string>
        : {};

      for (const name of Object.keys(deps)) {
        codeDeps.push({ name, source: 'package-json', file: 'package.json' });
      }
    }

    const pyproject = bundle.files.find((file) => file.path === 'pyproject.toml');
    if (pyproject) {
      const depsMatch = pyproject.content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsMatch) {
        const depLines = depsMatch[1].match(/"([^"]+)"/g);
        if (depLines) {
          for (const dep of depLines) {
            const depName = dep.replace(/"/g, '').split(/[><=!~;]/)[0].trim();
            if (depName) {
              codeDeps.push({ name: depName, source: 'pyproject-toml', file: 'pyproject.toml' });
            }
          }
        }
      }
    }

    return codeDeps;
  }

  async extractEnvRefs(bundle: ParsedBundle): Promise<EnvRef[]> {
    return extractEnvRefs(bundle);
  }

  private extractToolDeclarations(bundle: ParsedBundle): string[] {
    const tools: string[] = [];

    for (const file of bundle.files) {
      if (file.isBinary || file.type !== 'code') {
        continue;
      }

      const toolMatches = file.content.matchAll(/\.tool\(\s*["']([^"']+)["']/g);
      for (const match of toolMatches) {
        tools.push(match[1]);
      }

      const decoratorMatches = file.content.matchAll(/@(?:mcp\.)?tool[(\s]*(?:name\s*=\s*)?["']([^"']+)["']/g);
      for (const match of decoratorMatches) {
        tools.push(match[1]);
      }
    }

    return [...new Set(tools)];
  }

  static canHandleInput(input: AdapterBundleInput): boolean {
    const packageJson = input.files.find((file) => file.path === 'package.json');
    if (packageJson) {
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(packageJson.content);
        return isMcpPackageJson(content);
      } catch {
        return false;
      }
    }

    const pyproject = input.files.find((file) => file.path === 'pyproject.toml');
    if (pyproject) {
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(pyproject.content);
        return isMcpPyproject(content);
      } catch {
        return false;
      }
    }

    return false;
  }
}

export const createMcpAdapter = (): PlatformAdapter => {
  return new McpAdapter();
};
