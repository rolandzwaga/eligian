import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type AtRule, type CssSyntaxError, type Root, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

/**
 * CSS source location with start/end line/column information
 *
 * NOTE: This is distinct from the unified SourceLocation type which only has
 * a single line/column. This type is needed for CSS rule locations.
 */
export interface CSSSourceLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * CSS parse error (old format)
 *
 * @deprecated This interface format is deprecated.
 * For new code, use CssParseError from @eligian/language/errors instead.
 * This interface is maintained for backwards compatibility with CSS registry.
 */
export interface CSSParseError {
  message: string;
  filePath: string;
  line: number;
  column: number;
  source?: string;
}

export interface CSSParseResult {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, CSSSourceLocation>;
  idLocations: Map<string, CSSSourceLocation>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  errors: CSSParseError[];
  /**
   * Absolute paths of the stylesheets pulled in through `@import` (transitively,
   * excluding the file itself). Lets callers watch/re-validate on changes to them.
   */
  importedFiles?: string[];
}

/**
 * Options for {@link parseCSS}.
 */
export interface ParseCSSOptions {
  /**
   * Follow `@import` rules and merge the classes/IDs of the imported stylesheets
   * (default `true`). Imports are resolved relative to `filePath`.
   */
  followImports?: boolean;
  /**
   * File reader used to load imported stylesheets (default: `fs.readFileSync` as UTF-8).
   * Should throw when the file cannot be read; unreadable imports are skipped.
   */
  readFile?: (absolutePath: string) => string;
}

/**
 * Construct an empty {@link CSSParseResult} (no classes/IDs/locations/rules).
 *
 * Single source of truth for the "empty CSS metadata" object literal that was
 * previously hand-rolled at every CSS-registry-clear site (deleted/errored CSS
 * files, error-only notifications, and the compiler's missing-file fallback).
 *
 * @param errors - Optional parse/IO errors to attach (defaults to `[]`)
 */
export function createEmptyCSSMetadata(errors: CSSParseError[] = []): CSSParseResult {
  return {
    classes: new Set(),
    ids: new Set(),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors,
  };
}

/**
 * Parse CSS content and extract classes, IDs, locations, and rules.
 *
 * Uses PostCSS to parse CSS files and postcss-selector-parser to extract
 * individual class names and ID names from selectors.
 *
 * @param cssContent - CSS file content as string
 * @param filePath - Absolute file path or URI (for error reporting)
 * @returns Parsed CSS metadata including classes, IDs, locations, rules, and errors
 *
 * @example
 * const result = parseCSS('.button { color: blue; }', 'styles.css');
 * // result.classes = Set { 'button' }
 * // result.classLocations.get('button') = { filePath: 'styles.css', startLine: 1, ... }
 */
export function parseCSS(
  cssContent: string,
  filePath: string,
  options: ParseCSSOptions = {}
): CSSParseResult {
  const visited = new Set<string>();
  const selfKey = normalizeKey(filePath);
  if (selfKey) visited.add(selfKey);
  return parseCSSInternal(cssContent, filePath, options, visited, new Set<string>());
}

function parseCSSInternal(
  cssContent: string,
  filePath: string,
  options: ParseCSSOptions,
  visited: Set<string>,
  importedFiles: Set<string>
): CSSParseResult {
  const classes = new Set<string>();
  const ids = new Set<string>();
  const classLocations = new Map<string, CSSSourceLocation>();
  const idLocations = new Map<string, CSSSourceLocation>();
  const classRules = new Map<string, string>();
  const idRules = new Map<string, string>();
  const errors: CSSParseError[] = [];

  try {
    // Parse CSS using PostCSS
    const root: Root = postcss.parse(cssContent, { from: filePath });

    // Walk through all CSS rules
    root.walkRules((rule: Rule) => {
      // Get source location for this rule
      const ruleLocation: CSSSourceLocation = {
        filePath,
        startLine: rule.source?.start?.line ?? 0,
        startColumn: rule.source?.start?.column ?? 0,
        endLine: rule.source?.end?.line ?? 0,
        endColumn: rule.source?.end?.column ?? 0,
      };

      // Get full rule text (selector + declarations)
      const ruleText = rule.toString();

      // Parse selector to extract individual classes and IDs
      try {
        const processor = selectorParser(selectors => {
          selectors.walkClasses(classNode => {
            const className = classNode.value;

            // Add to classes set
            classes.add(className);

            // Store location of first occurrence only
            if (!classLocations.has(className)) {
              classLocations.set(className, ruleLocation);
            }

            // Store rule of first occurrence only
            if (!classRules.has(className)) {
              classRules.set(className, ruleText);
            }
          });

          selectors.walkIds(idNode => {
            const idName = idNode.value;

            // Add to IDs set
            ids.add(idName);

            // Store location of first occurrence only
            if (!idLocations.has(idName)) {
              idLocations.set(idName, ruleLocation);
            }

            // Store rule of first occurrence only
            if (!idRules.has(idName)) {
              idRules.set(idName, ruleText);
            }
          });
        });

        processor.processSync(rule.selector);
      } catch (selectorError) {
        // Selector parsing error - log but continue with other rules
        // These errors are typically caused by invalid CSS selectors
        // We'll still parse what we can from the rest of the CSS
        const errorMessage =
          selectorError instanceof Error ? selectorError.message : 'Invalid selector syntax';

        errors.push({
          message: `Selector parsing error: ${errorMessage}`,
          filePath,
          line: ruleLocation.startLine,
          column: ruleLocation.startColumn,
        });
      }
    });

    // Follow @import rules: merge classes/IDs of imported stylesheets (local rules win
    // for locations/rule text; each file is parsed at most once, which also breaks cycles)
    if (options.followImports !== false) {
      const baseDir = path.dirname(toFsPath(filePath));
      const readFile = options.readFile ?? ((p: string) => readFileSync(p, 'utf-8'));

      root.walkAtRules('import', (atRule: AtRule) => {
        const target = extractImportTarget(atRule.params);
        if (!target) return;

        const importedPath = path.resolve(baseDir, target);
        const key = normalizeKey(importedPath);
        if (!key || visited.has(key)) return;
        visited.add(key);

        let importedContent: string;
        try {
          importedContent = readFile(importedPath);
        } catch {
          // Unreadable import (missing file, ...): nothing to merge
          return;
        }

        importedFiles.add(importedPath);
        const imported = parseCSSInternal(
          importedContent,
          importedPath,
          options,
          visited,
          importedFiles
        );

        for (const name of imported.classes) {
          classes.add(name);
          if (!classLocations.has(name)) {
            const loc = imported.classLocations.get(name);
            if (loc) classLocations.set(name, loc);
          }
          if (!classRules.has(name)) {
            const rule = imported.classRules.get(name);
            if (rule !== undefined) classRules.set(name, rule);
          }
        }
        for (const name of imported.ids) {
          ids.add(name);
          if (!idLocations.has(name)) {
            const loc = imported.idLocations.get(name);
            if (loc) idLocations.set(name, loc);
          }
          if (!idRules.has(name)) {
            const rule = imported.idRules.get(name);
            if (rule !== undefined) idRules.set(name, rule);
          }
        }
        for (const err of imported.errors) {
          errors.push({
            ...err,
            message: `In imported stylesheet '${target}': ${err.message}`,
          });
        }
      });
    }
  } catch (error) {
    // CSS syntax error - capture details
    if (isCssSyntaxError(error)) {
      errors.push({
        message: error.reason || error.message,
        filePath: error.file ?? filePath,
        line: error.line ?? 0,
        column: error.column ?? 0,
        source: error.showSourceCode ? error.showSourceCode() : undefined,
      });
    } else {
      // Unexpected error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        message: errorMessage,
        filePath,
        line: 0,
        column: 0,
      });
    }
  }

  return {
    classes,
    ids,
    classLocations,
    idLocations,
    classRules,
    idRules,
    errors,
    ...(importedFiles.size > 0 ? { importedFiles: [...importedFiles] } : {}),
  };
}

/**
 * Extract the stylesheet target from `@import` params.
 *
 * Handles `"x.css"`, `'x.css'`, `url(x.css)`, `url("x.css")` (optionally followed by
 * layer()/supports()/media conditions). Remote (`http:`, `//`, `data:`) targets are
 * ignored. Query strings and fragments are stripped.
 */
export function extractImportTarget(params: string): string | undefined {
  const match = /^\s*(?:url\(\s*(['"]?)([^'")]*?)\1\s*\)|(['"])(.*?)\3)/i.exec(params);
  const raw = (match?.[2] ?? match?.[4])?.trim();
  if (!raw) return undefined;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return undefined;
  const cleaned = raw.replace(/[?#].*$/, '');
  return cleaned || undefined;
}

function toFsPath(filePath: string): string {
  return filePath.startsWith('file:') ? fileURLToPath(filePath) : filePath;
}

function normalizeKey(filePath: string): string | undefined {
  try {
    const resolved = path.resolve(toFsPath(filePath));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch {
    return undefined;
  }
}

/**
 * Type guard to check if error is a PostCSS CssSyntaxError
 */
function isCssSyntaxError(error: unknown): error is CssSyntaxError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'CssSyntaxError'
  );
}
