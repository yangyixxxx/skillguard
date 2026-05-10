import {
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
  if (path === 'openapi.json' || path === 'openapi.yaml' || path === 'openapi.yml') {
    return 'manifest';
  }
  if (path === 'config.json') {
    return 'config';
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
  if (path.endsWith('.json')) {
    return 'json';
  }
  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    return 'yaml';
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

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

export class GptsAdapter implements PlatformAdapter {
  readonly id = 'gpts';

  async parseBundle(input: AdapterBundleInput | Buffer): Promise<ParsedBundle> {
    if (Buffer.isBuffer(input)) {
      throw new Error('GptsAdapter expects already-unpacked files for Gate 1 MVP.');
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

    const hasOpenApiSpec = files.some(
      (file) =>
        file.path === 'openapi.json' ||
        file.path === 'openapi.yaml' ||
        file.path === 'openapi.yml'
    );
    if (!hasOpenApiSpec) {
      throw new Error('GPTs bundle must contain openapi.json or openapi.yaml.');
    }

    files.sort((left, right) => left.path.localeCompare(right.path));

    return { files };
  }

  async extractMetadata(bundle: ParsedBundle): Promise<ExtensionMetadata> {
    const specFile = bundle.files.find(
      (file) =>
        file.path === 'openapi.json' ||
        file.path === 'openapi.yaml' ||
        file.path === 'openapi.yml'
    );
    if (!specFile) {
      return {};
    }

    let name: string | undefined;
    let description: string | undefined;

    if (specFile.path === 'openapi.json') {
      const parsed = parseSimpleJson(specFile.content);
      const info = typeof parsed.info === 'object' && parsed.info !== null
        ? parsed.info as Record<string, unknown>
        : {};
      name = typeof info.title === 'string' ? info.title : undefined;
      description = typeof info.description === 'string' ? info.description : undefined;
    } else {
      const titleMatch = specFile.content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
      const descMatch = specFile.content.match(/^\s*description:\s*["']?(.+?)["']?\s*$/m);
      name = titleMatch ? titleMatch[1] : undefined;
      description = descMatch ? descMatch[1] : undefined;
    }

    return {
      name,
      description,
      allowedTools: ['WebFetch']
    };
  }

  async extractDependencies(bundle: ParsedBundle): Promise<Dependency[]> {
    const deps: Dependency[] = [];

    const specFile = bundle.files.find(
      (file) =>
        file.path === 'openapi.json' ||
        file.path === 'openapi.yaml' ||
        file.path === 'openapi.yml'
    );
    if (!specFile) {
      return deps;
    }

    if (specFile.path === 'openapi.json') {
      const parsed = parseSimpleJson(specFile.content);
      const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
      for (const server of servers) {
        if (typeof server === 'object' && server !== null && typeof server.url === 'string') {
          deps.push({ name: server.url, source: 'openapi-server', file: specFile.path });
        }
      }
    } else {
      const serverMatches = specFile.content.matchAll(/^\s*-?\s*url:\s*["']?(.+?)["']?\s*$/gm);
      for (const match of serverMatches) {
        deps.push({ name: match[1], source: 'openapi-server', file: specFile.path });
      }
    }

    return deps;
  }

  async extractEnvRefs(bundle: ParsedBundle): Promise<EnvRef[]> {
    const baseRefs = extractEnvRefs(bundle);

    const schemaRefs = new Map<string, EnvRef>();
    for (const file of bundle.files) {
      if (file.isBinary) {
        continue;
      }

      let match = ENV_VAR_PATTERN.exec(file.content);
      while (match) {
        const name = match[1];
        schemaRefs.set(`${file.path}:${name}`, { name, file: file.path });
        match = ENV_VAR_PATTERN.exec(file.content);
      }
      ENV_VAR_PATTERN.lastIndex = 0;
    }

    const allRefs = new Map<string, EnvRef>();
    for (const ref of baseRefs) {
      allRefs.set(`${ref.file}:${ref.name}`, ref);
    }
    for (const [key, ref] of schemaRefs) {
      allRefs.set(key, ref);
    }

    return Array.from(allRefs.values());
  }
}

export const createGptsAdapter = (): PlatformAdapter => {
  return new GptsAdapter();
};
