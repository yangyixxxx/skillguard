import {
  DEFAULT_MAX_REFERENCES_FILES,
  DEFAULT_MAX_REFERENCES_SINGLE_FILE_BYTES,
  DEFAULT_MAX_SINGLE_FILE_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_MAX_TOTAL_FILES
} from '../config/defaults.js';
import type { ParsedBundle } from '../adapter/interface.js';
import type { Finding } from '../report/types.js';
import {
  FrontmatterError,
  normalizeAllowedTools,
  parseFrontmatter,
  validateAllowedTools
} from './frontmatter.js';

export interface StructureAnalysisOptions {
  maxTotalFiles?: number;
  maxTotalBytes?: number;
  maxSingleFileBytes?: number;
  maxReferencesFiles?: number;
  maxReferencesSingleFileBytes?: number;
}

export interface StructureAnalysisResult {
  blocked: boolean;
  findings: Finding[];
  allowedTools: string[];
}

const toFinding = (id: string, message: string, file?: string): Finding => ({
  id,
  message,
  source: 'layer0',
  file,
  severity: 'Critical'
});

const isBinaryBuffer = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
};

export const analyzeStructure = (
  bundle: ParsedBundle,
  options: StructureAnalysisOptions = {}
): StructureAnalysisResult => {
  const findings: Finding[] = [];
  const maxTotalFiles = options.maxTotalFiles ?? DEFAULT_MAX_TOTAL_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxSingleFileBytes = options.maxSingleFileBytes ?? DEFAULT_MAX_SINGLE_FILE_BYTES;
  const maxReferencesFiles = options.maxReferencesFiles ?? DEFAULT_MAX_REFERENCES_FILES;
  const maxReferencesSingleFileBytes =
    options.maxReferencesSingleFileBytes ?? DEFAULT_MAX_REFERENCES_SINGLE_FILE_BYTES;

  if (bundle.files.length > maxTotalFiles) {
    findings.push(toFinding('TOO_MANY_FILES', `Bundle has too many files: ${bundle.files.length}.`));
  }

  let totalBytes = 0;
  const referencesFiles = bundle.files.filter((file) => file.path.startsWith('references/'));
  if (referencesFiles.length > maxReferencesFiles) {
    findings.push(
      toFinding('TOO_MANY_REFERENCE_FILES', `references directory exceeds ${maxReferencesFiles} files.`)
    );
  }

  for (const file of bundle.files) {
    const size = file.rawContent.byteLength;
    totalBytes += size;

    if (file.isSymlink) {
      findings.push(toFinding('SYMLINK_NOT_ALLOWED', 'Symlink entries are not allowed.', file.path));
    }

    if (size > maxSingleFileBytes) {
      findings.push(toFinding('FILE_TOO_LARGE', `File exceeds ${maxSingleFileBytes} bytes.`, file.path));
    }

    if (file.path.startsWith('references/')) {
      if (!file.path.endsWith('.md')) {
        findings.push(toFinding('INVALID_REFERENCES_EXT', 'references files must be markdown.', file.path));
      }
      if (size > maxReferencesSingleFileBytes) {
        findings.push(
          toFinding(
            'REFERENCES_FILE_TOO_LARGE',
            `references file exceeds ${maxReferencesSingleFileBytes} bytes.`,
            file.path
          )
        );
      }
    }

    if (file.isBinary || isBinaryBuffer(file.rawContent)) {
      findings.push(toFinding('BINARY_FILE_NOT_ALLOWED', 'Binary files are not allowed in Gate 1.', file.path));
    }
  }

  if (totalBytes > maxTotalBytes) {
    findings.push(toFinding('TOTAL_SIZE_EXCEEDED', `Bundle exceeds ${maxTotalBytes} bytes.`));
  }

  let allowedTools: string[] = [];
  const manifest = bundle.files.find((file) => file.path === 'SKILL.md');
  if (!manifest) {
    findings.push(toFinding('MISSING_SKILL_MD', 'SKILL.md is required.'));
  } else {
    try {
      const frontmatter = parseFrontmatter(manifest.content);
      allowedTools = normalizeAllowedTools(frontmatter.data['allowed-tools']);
      const invalidTools = validateAllowedTools(allowedTools);
      if (invalidTools.length > 0) {
        findings.push(
          toFinding(
            'INVALID_ALLOWED_TOOLS',
            `allowed-tools contains unsupported entries: ${invalidTools.join(', ')}.`,
            'SKILL.md'
          )
        );
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        findings.push(toFinding('INVALID_FRONTMATTER', error.message, 'SKILL.md'));
      } else {
        throw error;
      }
    }
  }

  if (allowedTools.length === 0) {
    allowedTools = normalizeAllowedTools(undefined);
  }

  return {
    blocked: findings.length > 0,
    findings,
    allowedTools
  };
};
