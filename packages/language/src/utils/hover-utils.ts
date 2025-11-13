/**
 * Hover Utilities
 *
 * This module provides utilities for creating LSP Hover objects,
 * eliminating duplicated hover construction patterns.
 */

import type { Hover } from 'vscode-languageserver-protocol';
import { MarkupKind } from 'vscode-languageserver-protocol';

/**
 * Creates a Hover object with markdown content.
 *
 * This utility consolidates the repeated pattern of:
 * ```typescript
 * return {
 *   contents: {
 *     kind: 'markdown',
 *     value: markdown,
 *   },
 * };
 * ```
 *
 * @param markdown - Markdown string to display in the hover tooltip
 * @returns Hover object with markdown content
 *
 * @example
 * ```typescript
 * // Before:
 * return {
 *   contents: {
 *     kind: 'markdown',
 *     value: markdown,
 *   },
 * };
 *
 * // After:
 * return createMarkdownHover(markdown);
 * ```
 *
 * @example
 * ```typescript
 * // With formatted content:
 * const markdown = `### functionName\n\nDescription here`;
 * return createMarkdownHover(markdown);
 * ```
 */
export function createMarkdownHover(markdown: string): Hover {
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown,
    },
  };
}
