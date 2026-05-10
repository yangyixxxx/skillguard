import { parseDocument } from 'yaml';
import {
  ALLOWED_TOOLS_WHITELIST,
  DEFAULT_ALLOWED_TOOLS
} from '../config/defaults.js';

export interface FrontmatterParseResult {
  data: Record<string, unknown>;
  body: string;
  raw: string | null;
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

const FRONTMATTER_DELIMITER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const parseFrontmatter = (content: string): FrontmatterParseResult => {
  const match = content.match(FRONTMATTER_DELIMITER);
  if (!match) {
    return {
      data: {},
      body: content,
      raw: null
    };
  }

  const yamlSource = match[1];
  if (/!![a-zA-Z]/.test(yamlSource)) {
    throw new FrontmatterError('YAML type tag is not allowed.');
  }

  const doc = parseDocument(yamlSource, { uniqueKeys: true });

  if (doc.errors.length > 0) {
    throw new FrontmatterError('Invalid YAML frontmatter.');
  }

  const parsed = doc.toJSON();
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new FrontmatterError('Frontmatter must be a key/value object.');
  }

  for (const [key, value] of Object.entries(parsed)) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (serialized.length > 1000) {
      throw new FrontmatterError(`Frontmatter field '${key}' exceeds 1000 characters.`);
    }
  }

  return {
    data: parsed,
    body: content.slice(match[0].length),
    raw: yamlSource
  };
};

export const normalizeAllowedTools = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [...DEFAULT_ALLOWED_TOOLS];
  }

  const tools = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

  if (tools.length === 0) {
    return [...DEFAULT_ALLOWED_TOOLS];
  }

  return tools.map((tool) => String(tool));
};

export const validateAllowedTools = (tools: string[]): string[] => {
  const allowList = new Set(ALLOWED_TOOLS_WHITELIST);
  return tools.filter((tool) => !allowList.has(tool as (typeof ALLOWED_TOOLS_WHITELIST)[number]));
};
