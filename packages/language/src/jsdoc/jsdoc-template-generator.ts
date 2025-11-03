/**
 * JSDoc Template Generator
 *
 * Generates JSDoc comment templates for action definitions with proper formatting
 * and parameter type information.
 */

import type { ActionDefinition, Parameter } from '../generated/ast.js';

/**
 * Generate a JSDoc template for an action definition
 *
 * @param action The action definition to generate documentation for
 * @returns Formatted JSDoc template string
 *
 * Template format:
 * ```
 * &#47;**
 *  *
 *  * @param {type} name
 *  * @param {type} name2
 *  *&#47;
 * ```
 */
export function generateJSDocTemplate(action: ActionDefinition): string {
  const lines: string[] = [];

  // Opening
  lines.push('/**');

  // Blank description line (FR-011)
  lines.push(' * ');

  // Generate @param lines for each parameter
  if (action.parameters && action.parameters.length > 0) {
    for (const param of action.parameters) {
      const type = extractTypeFromParameter(param);
      lines.push(` * @param {${type}} ${param.name}`);
    }
  }

  // Closing
  lines.push(' */');

  return lines.join('\n');
}

/**
 * Generate JSDoc content (without delimiters) for insertion inside existing comment block
 *
 * @param action The action definition to generate documentation for
 * @returns JSDoc content lines (without delimiters)
 *
 * Used when the delimiters are already present and we just need to
 * fill in the content between them.
 */
export function generateJSDocContent(action: ActionDefinition): string {
  const lines: string[] = [];

  // Blank description line with placeholder (FR-011)
  // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a snippet template string literal, not a template literal
  lines.push('${1:Description}');

  // Generate @param lines for each parameter
  if (action.parameters && action.parameters.length > 0) {
    for (const param of action.parameters) {
      const type = extractTypeFromParameter(param);
      lines.push(`@param {${type}} ${param.name}`);
    }
  }

  // Join with newlines and add ' * ' prefix to each line
  return lines.map(line => ` * ${line}`).join('\n');
}

/**
 * Extract type string from parameter
 *
 * @param param Parameter AST node
 * @returns Type string (e.g., 'string', 'number', 'unknown')
 */
function extractTypeFromParameter(param: Parameter): string {
  // TypeAnnotation is a string union type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  if (param.type) {
    return param.type;
  }

  // Default to unknown if no type annotation
  return 'unknown';
}
