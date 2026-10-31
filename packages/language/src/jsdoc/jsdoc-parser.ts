/**
 * JSDoc Parser - Langium-based JSDoc Comment Parsing
 *
 * Uses Langium's built-in JSDoc parser to extract structured documentation.
 * This provides proper parsing with source locations instead of regex hacks.
 */

import {
  type JSDocTag,
  type JSDocComment as LangiumJSDocComment,
  parseJSDoc as langiumParseJSDoc,
} from 'langium';

/**
 * JSDoc Comment Structure (simplified from Langium's JSDocComment)
 */
export interface JSDocComment {
  /** Main description text (paragraphs before first @tag) */
  description: string;
  /** Array of @param tag definitions */
  params: JSDocParam[];
}

/**
 * JSDoc @param Tag (extracted from Langium's JSDocTag)
 */
interface JSDocParam {
  /** Parameter type (optional, from {type}) */
  type?: string;
  /** Parameter name (required) */
  name: string;
  /** Parameter description (optional, text after name) */
  description?: string;
  /** True when declared with the optional syntax `[name]` / `[name=default]` */
  optional?: boolean;
}

/**
 * Parse a JSDoc comment string into structured data
 *
 * @param commentText Raw JSDoc comment including delimiters
 * @returns Parsed JSDoc structure, or null if not a valid JSDoc comment
 *
 * Uses Langium's built-in parseJSDoc function which properly handles:
 * - Description extraction (paragraphs before first @tag)
 * - @param tag parsing with inline {type} syntax
 * - Whitespace and line break preservation
 * - Source location tracking
 */
export function parseJSDoc(commentText: string): JSDocComment | null {
  // Check if this is a JSDoc comment (starts with /** not /*)
  if (!commentText.trim().startsWith('/**')) {
    return null;
  }

  try {
    // Use Langium's built-in JSDoc parser
    const langiumJSDoc: LangiumJSDocComment = langiumParseJSDoc(commentText);

    // Extract description from paragraphs before tags
    const description = extractDescription(langiumJSDoc);

    // Extract @param tags
    const params = extractParams(langiumJSDoc);

    return {
      description,
      params,
    };
  } catch (error) {
    // Graceful degradation: log warning and return null
    console.warn('[JSDoc Parser] Failed to parse comment:', error);
    return null;
  }
}

/**
 * Extract description text from Langium JSDoc elements
 *
 * Description is all paragraphs before the first tag
 */
function extractDescription(jsdoc: LangiumJSDocComment): string {
  const descriptionParts: string[] = [];

  for (const element of jsdoc.elements) {
    // Stop at first tag
    if ('name' in element) {
      break;
    }

    // Accumulate paragraph text
    descriptionParts.push(element.toString());
  }

  return descriptionParts.join('\n').trim();
}

/**
 * Extract @param tags from Langium JSDoc
 *
 * Parses @param tags in the format:
 * - @param {type} name description
 * - @param name description (no type)
 * - @param name (no description)
 */
function extractParams(jsdoc: LangiumJSDocComment): JSDocParam[] {
  const params: JSDocParam[] = [];
  const paramTags = jsdoc.getTags('param');

  for (const tag of paramTags) {
    const param = parseParamTag(tag);
    if (param) {
      params.push(param);
    }
  }

  return params;
}

/**
 * Parse a single @param tag into structured data
 *
 * Format: @param {type} name description
 *         @param name description (no type)
 *         @param name (no description)
 */
function parseParamTag(tag: JSDocTag): JSDocParam | null {
  const contentText = tag.content.toString().trim();

  if (contentText.length === 0) {
    return null;
  }

  let rest = contentText;
  let type: string | undefined;

  // Optional brace-balanced type, e.g. {string}, {{a: string}} or {Array<{x: number}>}
  if (rest.startsWith('{')) {
    const end = findClosingBrace(rest);
    if (end === -1) {
      return null; // Unterminated type
    }
    type = rest.slice(1, end).trim() || undefined;
    rest = rest.slice(end + 1).trimStart();
  }

  // Name: `name`, or `[name]` / `[name=default]` for optional parameters
  const nameMatch = rest.match(/^(?:\[\s*(\w+)\s*(?:=[^\]]*)?\]|(\w+))/);
  if (!nameMatch) {
    return null; // Name is required
  }
  const optional = nameMatch[1] !== undefined;
  const name = nameMatch[1] ?? nameMatch[2];
  rest = rest.slice(nameMatch[0].length);

  // Description: everything after the name (including continuation lines), with a leading
  // '- ' separator stripped and whitespace/newlines collapsed to single spaces.
  const description = rest
    .replace(/^\s*-\s+/, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const param: JSDocParam = {
    type,
    name,
    description: description.length > 0 ? description : undefined,
  };
  if (optional) {
    param.optional = true;
  }
  return param;
}

/** Index of the '}' matching the '{' at index 0, or -1 if unbalanced. */
function findClosingBrace(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
