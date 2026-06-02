/**
 * JSDoc Markdown Formatter
 *
 * Formats parsed JSDoc comments as markdown for display in hover tooltips.
 * Preserves markdown formatting from the original JSDoc (bold, italic, code, links).
 */

import { MarkdownBuilder } from '../utils/markdown-builder.js';
import type { JSDocComment } from './jsdoc-parser.js';

/**
 * Format a JSDoc comment as markdown for hover display
 *
 * @param jsdoc - Parsed JSDoc comment
 * @param actionName - Name of the action (for header)
 * @returns Formatted markdown string
 */
export function formatJSDocAsMarkdown(jsdoc: JSDocComment, actionName: string): string {
  // Action name header
  const builder = new MarkdownBuilder().heading(3, actionName).blank();

  // Description (if present)
  if (jsdoc.description && jsdoc.description.trim().length > 0) {
    builder.text(jsdoc.description).blank();
  }

  // Parameters section (if present)
  if (jsdoc.params.length > 0) {
    builder.text('**Parameters:**');

    // Format each param as `name` (`type`) - description (description omitted if absent)
    const items = jsdoc.params.map(param => {
      const type = param.type || 'unknown';
      const name = param.name;
      return param.description && param.description.trim().length > 0
        ? `\`${name}\` (\`${type}\`) - ${param.description}`
        : `\`${name}\` (\`${type}\`)`;
    });
    builder.list(items);
  }

  return builder.build();
}
