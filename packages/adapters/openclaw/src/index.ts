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

const detectBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SAMPLE_SIZE));
  return sample.includes(0);
};

const detectFileType = (path: string): ParsedFileType => {
  if (path === 'SKILL.md') {
    return 'manifest';
  }
  if (path.startsWith('scripts/')) {
    return 'code';
  }
  if (path.startsWith('docs/') || path.endsWith('.md')) {
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
  return undefined;
};

const parseSimpleFrontmatter = (content: string): Record<string, unknown> => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length < 2) {
      continue;
    }

    const key = parts.shift()!.trim();
    const value = parts.join(':').trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    result[key] = value;
  }

  return result;
};

export class OpenClawAdapter implements PlatformAdapter {
  readonly id = 'openclaw';

  async parseBundle(input: AdapterBundleInput | Buffer): Promise<ParsedBundle> {
    if (Buffer.isBuffer(input)) {
      throw new Error('OpenClawAdapter expects already-unpacked files for Gate 1 MVP.');
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

    if (!files.some((file) => file.path === 'SKILL.md')) {
      throw new Error('OpenClaw bundle must contain SKILL.md.');
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return { files };
  }

  async extractMetadata(bundle: ParsedBundle): Promise<ExtensionMetadata> {
    const manifest = bundle.files.find((file) => file.path === 'SKILL.md');
    if (!manifest) {
      return {};
    }

    const frontmatter = parseSimpleFrontmatter(manifest.content);
    const allowedToolsRaw = frontmatter['allowed-tools'];
    const allowedTools = Array.isArray(allowedToolsRaw)
      ? allowedToolsRaw.map((item) => String(item))
      : undefined;

    return {
      name: typeof frontmatter.name === 'string' ? frontmatter.name : undefined,
      description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
      allowedTools
    };
  }

  async extractDependencies(bundle: ParsedBundle): Promise<Dependency[]> {
    return extractDependencies(bundle);
  }

  async extractEnvRefs(bundle: ParsedBundle): Promise<EnvRef[]> {
    return extractEnvRefs(bundle);
  }
}

export const createOpenClawAdapter = (): PlatformAdapter => {
  return new OpenClawAdapter();
};
