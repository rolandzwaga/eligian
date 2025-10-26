/**
 * CSS Hover Provider
 *
 * Generates hover tooltips for CSS classes and IDs showing:
 * - File location where they are defined
 * - Preview of CSS rules in a code fence
 */

import type { Hover } from 'vscode-languageserver-protocol';
import { MarkupKind } from 'vscode-languageserver-protocol';
import type { CSSSourceLocation } from './css-parser.js';

/**
 * Information about a CSS class across all imported files
 */
export interface CSSClassInfo {
  /** Class name (without dot prefix) */
  name: string;
  /** Definitions across all CSS files */
  files: Array<{
    uri: string;
    line: number;
    rule: string;
  }>;
}

/**
 * Information about a CSS ID across all imported files
 */
export interface CSSIDInfo {
  /** ID name (without hash prefix) */
  name: string;
  /** Definitions across all CSS files */
  files: Array<{
    uri: string;
    line: number;
    rule: string;
  }>;
}

/**
 * CSS Hover Provider
 *
 * Pure, stateless provider that generates hover tooltips for CSS identifiers.
 * Takes CSS class/ID info and generates LSP Hover with markdown content.
 */
export class CSSHoverProvider {
  /**
   * Generate hover tooltip for a CSS class
   *
   * Returns Hover with markdown showing:
   * - **CSS Class**: `className`
   * - Defined in: `file:///path/to/file.css:lineNumber`
   * - ```css\n.className { ... }\n```
   *
   * If class is defined in multiple files, shows all definitions.
   *
   * @param classInfo - CSS class information from registry
   * @returns Hover with markdown content, or undefined if no definitions
   */
  provideCSSClassHover(classInfo: CSSClassInfo): Hover | undefined {
    if (classInfo.files.length === 0) {
      return undefined;
    }

    const markdown = this.buildCSSClassMarkdown(classInfo);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: markdown,
      },
    };
  }

  /**
   * Generate hover tooltip for a CSS ID
   *
   * Returns Hover with markdown showing:
   * - **CSS ID**: `idName`
   * - Defined in: `file:///path/to/file.css:lineNumber`
   * - ```css\n#idName { ... }\n```
   *
   * If ID is defined in multiple files, shows all definitions.
   *
   * @param idInfo - CSS ID information from registry
   * @returns Hover with markdown content, or undefined if no definitions
   */
  provideCSSIDHover(idInfo: CSSIDInfo): Hover | undefined {
    if (idInfo.files.length === 0) {
      return undefined;
    }

    const markdown = this.buildCSSIDMarkdown(idInfo);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: markdown,
      },
    };
  }

  /**
   * Build markdown content for CSS class hover
   *
   * @param classInfo - CSS class information
   * @returns Markdown string
   */
  private buildCSSClassMarkdown(classInfo: CSSClassInfo): string {
    const parts: string[] = [];

    // Header
    parts.push(`**CSS Class**: \`${classInfo.name}\`\n`);

    // For each definition
    for (const def of classInfo.files) {
      parts.push(`Defined in: \`${def.uri}:${def.line}\`\n`);
      parts.push('```css');
      parts.push(def.rule);
      parts.push('```\n');
    }

    return parts.join('\n');
  }

  /**
   * Build markdown content for CSS ID hover
   *
   * @param idInfo - CSS ID information
   * @returns Markdown string
   */
  private buildCSSIDMarkdown(idInfo: CSSIDInfo): string {
    const parts: string[] = [];

    // Header
    parts.push(`**CSS ID**: \`${idInfo.name}\`\n`);

    // For each definition
    for (const def of idInfo.files) {
      parts.push(`Defined in: \`${def.uri}:${def.line}\`\n`);
      parts.push('```css');
      parts.push(def.rule);
      parts.push('```\n');
    }

    return parts.join('\n');
  }
}

/**
 * Helper to build CSSClassInfo from registry data
 *
 * This helper combines data from multiple CSS files to create
 * a single CSSClassInfo object with all definitions.
 *
 * @param className - Class name to look up
 * @param cssFileUris - CSS file URIs imported by the document
 * @param getMetadata - Function to get metadata for a CSS file
 * @returns CSSClassInfo with all definitions, or undefined if not found
 */
export function buildCSSClassInfo(
  className: string,
  cssFileUris: string[],
  getMetadata: (uri: string) =>
    | {
        classLocations: Map<string, CSSSourceLocation>;
        classRules: Map<string, string>;
      }
    | undefined
): CSSClassInfo {
  const files: Array<{ uri: string; line: number; rule: string }> = [];

  for (const uri of cssFileUris) {
    const metadata = getMetadata(uri);
    if (!metadata) continue;

    const location = metadata.classLocations.get(className);
    const rule = metadata.classRules.get(className);

    if (location && rule) {
      files.push({
        uri,
        line: location.startLine,
        rule,
      });
    }
  }

  return {
    name: className,
    files,
  };
}

/**
 * Helper to build CSSIDInfo from registry data
 *
 * This helper combines data from multiple CSS files to create
 * a single CSSIDInfo object with all definitions.
 *
 * @param idName - ID name to look up
 * @param cssFileUris - CSS file URIs imported by the document
 * @param getMetadata - Function to get metadata for a CSS file
 * @returns CSSIDInfo with all definitions, or undefined if not found
 */
export function buildCSSIDInfo(
  idName: string,
  cssFileUris: string[],
  getMetadata: (uri: string) =>
    | {
        idLocations: Map<string, CSSSourceLocation>;
        idRules: Map<string, string>;
      }
    | undefined
): CSSIDInfo {
  const files: Array<{ uri: string; line: number; rule: string }> = [];

  for (const uri of cssFileUris) {
    const metadata = getMetadata(uri);
    if (!metadata) continue;

    const location = metadata.idLocations.get(idName);
    const rule = metadata.idRules.get(idName);

    if (location && rule) {
      files.push({
        uri,
        line: location.startLine,
        rule,
      });
    }
  }

  return {
    name: idName,
    files,
  };
}
