/**
 * JSDoc Markdown Formatter
 *
 * Formats parsed JSDoc comments as markdown for display in hover tooltips.
 * Preserves markdown formatting from the original JSDoc (bold, italic, code, links).
 */

import type { JSDocComment } from './jsdoc-parser.js';

/**
 * Format a JSDoc comment as markdown for hover display
 *
 * @param jsdoc - Parsed JSDoc comment
 * @param actionName - Name of the action (for header)
 * @returns Formatted markdown string
 */
export function formatJSDocAsMarkdown(jsdoc: JSDocComment, actionName: string): string {
  const lines: string[] = [];

  // Action name header
  lines.push(`### ${actionName}`);
  lines.push('');

  // Description (if present)
  if (jsdoc.description && jsdoc.description.trim().length > 0) {
    lines.push(jsdoc.description);
    lines.push('');
  }

  // Parameters section (if present)
  if (jsdoc.params.length > 0) {
    lines.push('**Parameters:**');

    for (const param of jsdoc.params) {
      const type = param.type || 'unknown';
      const name = param.name;

      // Format: - `name` (`type`) - description
      // If no description, omit the dash
      if (param.description && param.description.trim().length > 0) {
        lines.push(`- \`${name}\` (\`${type}\`) - ${param.description}`);
      } else {
        lines.push(`- \`${name}\` (\`${type}\`)`);
      }
    }
  }

  return lines.join('\n');
}
