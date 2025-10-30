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
export interface JSDocParam {
  /** Parameter type (optional, from {type}) */
  type?: string;
  /** Parameter name (required) */
  name: string;
  /** Parameter description (optional, text after name) */
  description?: string;
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

  // Pattern: [{type}] name [description]
  // Type is optional (in curly braces), name is required, description is optional
  const match = contentText.match(/^(?:\{([^}]+)\}\s+)?(\w+)(?:\s+(.+))?/);

  if (!match) {
    return null;
  }

  const [, type, name, description] = match;

  if (!name) {
    return null; // Name is required
  }

  return {
    type: type ? type.trim() : undefined,
    name: name.trim(),
    description: description ? description.trim() : undefined,
  };
}
