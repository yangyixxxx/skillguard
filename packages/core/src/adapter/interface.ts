export type ParsedFileType = 'code' | 'config' | 'doc' | 'manifest';

export interface BundleInputFile {
  path: string;
  content: Buffer;
  isSymlink?: boolean;
}

export interface AdapterBundleInput {
  files: BundleInputFile[];
}

export interface ParsedFile {
  path: string;
  content: string;
  rawContent: Buffer;
  type: ParsedFileType;
  language?: string;
  isBinary?: boolean;
  isSymlink?: boolean;
}

export interface ParsedBundle {
  files: ParsedFile[];
  manifest?: Record<string, unknown>;
}

export interface ExtensionMetadata {
  name?: string;
  description?: string;
  allowedTools?: string[];
}

export interface Dependency {
  name: string;
  source: string;
  file: string;
}

export interface EnvRef {
  name: string;
  file: string;
}

export interface PlatformAdapter {
  id: string;
  parseBundle(input: AdapterBundleInput | Buffer): Promise<ParsedBundle>;
  extractMetadata(bundle: ParsedBundle): Promise<ExtensionMetadata>;
  extractDependencies(bundle: ParsedBundle): Promise<Dependency[]>;
  extractEnvRefs(bundle: ParsedBundle): Promise<EnvRef[]>;
}
