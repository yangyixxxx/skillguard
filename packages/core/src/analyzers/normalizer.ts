/**
 * Code normalizer — preprocesses code to defeat obfuscation before rule engine analysis.
 *
 * Handles:
 * - Base64 encoded strings → decoded
 * - Hex encoded strings → decoded
 * - Character code concatenation → resolved string
 * - String concatenation → joined
 * - Dynamic imports → explicit imports
 */

const BASE64_PATTERN = /(?:base64\.b64decode|atob|Buffer\.from)\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/g;
const HEX_PATTERN = /\\x([0-9a-fA-F]{2})/g;
const CHR_CONCAT_PATTERN = /(?:chr|String\.fromCharCode)\s*\(\s*(\d+)\s*\)\s*\+?\s*/g;
const STRING_CONCAT_PATTERN = /['"]([^'"]*)['"]\s*\+\s*['"]([^'"]*)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /__import__\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const decodeBase64 = (encoded: string): string => {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return encoded;
  }
};

const decodeHex = (content: string): string => {
  return content.replace(HEX_PATTERN, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
};

const resolveChrConcat = (content: string): string => {
  let result = content;
  // Replace chr(N) + chr(N) + ... patterns with resolved string
  const chrSequencePattern = /(?:(?:chr|String\.fromCharCode)\s*\(\s*(\d+)\s*\)\s*\+?\s*)+/g;
  result = result.replace(chrSequencePattern, (match) => {
    const codes: number[] = [];
    const codePattern = /(?:chr|String\.fromCharCode)\s*\(\s*(\d+)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = codePattern.exec(match)) !== null) {
      codes.push(parseInt(m[1], 10));
    }
    if (codes.length > 0) {
      const decoded = String.fromCharCode(...codes);
      return `"${decoded}" /* normalized from char codes */`;
    }
    return match;
  });
  return result;
};

const resolveStringConcat = (content: string): string => {
  let result = content;
  let prev = '';
  // Iteratively resolve adjacent string concatenations
  while (result !== prev) {
    prev = result;
    result = result.replace(STRING_CONCAT_PATTERN, (_, a, b) => `'${a}${b}'`);
  }
  return result;
};

const resolveBase64 = (content: string): string => {
  return content.replace(BASE64_PATTERN, (match, encoded) => {
    const decoded = decodeBase64(encoded);
    return `"${decoded}" /* normalized from base64 */`;
  });
};

const resolveDynamicImports = (content: string): string => {
  return content.replace(DYNAMIC_IMPORT_PATTERN, (_, module) => {
    return `import ${module} /* normalized from __import__ */`;
  });
};

export interface NormalizeResult {
  content: string;
  transformations: string[];
}

export const normalizeCode = (content: string): NormalizeResult => {
  const transformations: string[] = [];
  let result = content;

  const afterHex = decodeHex(result);
  if (afterHex !== result) {
    transformations.push('hex_decode');
    result = afterHex;
  }

  const afterChr = resolveChrConcat(result);
  if (afterChr !== result) {
    transformations.push('chr_resolve');
    result = afterChr;
  }

  const afterConcat = resolveStringConcat(result);
  if (afterConcat !== result) {
    transformations.push('string_concat');
    result = afterConcat;
  }

  const afterBase64 = resolveBase64(result);
  if (afterBase64 !== result) {
    transformations.push('base64_decode');
    result = afterBase64;
  }

  const afterImports = resolveDynamicImports(result);
  if (afterImports !== result) {
    transformations.push('dynamic_import');
    result = afterImports;
  }

  return { content: result, transformations };
};
