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

  // Record the classes/IDs of one rule selector (first occurrence wins for location/rule text)
  const recordSelector = (selector: string, ruleLocation: CSSSourceLocation, ruleText: string) => {
    const processor = selectorParser(selectors => {
      selectors.walkClasses(classNode => {
        const className = classNode.value;
        classes.add(className);
        if (!classLocations.has(className)) classLocations.set(className, ruleLocation);
        if (!classRules.has(className)) classRules.set(className, ruleText);
      });

      selectors.walkIds(idNode => {
        const idName = idNode.value;
        ids.add(idName);
        if (!idLocations.has(idName)) idLocations.set(idName, ruleLocation);
        if (!idRules.has(idName)) idRules.set(idName, ruleText);
      });
    });

    processor.processSync(selector);
  };

  // Follow one @import rule: merge classes/IDs of the imported stylesheet (local rules win
  // for locations/rule text; each file is parsed at most once, which also breaks cycles)
  const followImport = (params: string) => {
    const baseDir = path.dirname(toFsPath(filePath));
    const readFile = options.readFile ?? ((p: string) => readFileSync(p, 'utf-8'));
    const target = extractImportTarget(params);
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
  };

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

      // Parse selector to extract individual classes and IDs
      try {
        recordSelector(rule.selector, ruleLocation, rule.toString());
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

    if (options.followImports !== false) {
      root.walkAtRules('import', (atRule: AtRule) => followImport(atRule.params));
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

      // Keep the classes/IDs of every rule that is still readable (and follow the readable
      // @imports), so one mid-edit syntax error does not flag every class use in the importing
      // .eligian files as unknown. Local rules are recorded first so they win over imports.
      const recovered = scanRulesLeniently(cssContent);
      for (const rule of recovered.rules) {
        try {
          recordSelector(rule.selector, { filePath, ...rule.location }, rule.text);
        } catch {
          // Unparseable selector: skip it
        }
      }
      if (options.followImports !== false) {
        for (const params of recovered.imports) followImport(params);
      }
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

interface LenientRule {
  selector: string;
  text: string;
  location: Omit<CSSSourceLocation, 'filePath'>;
}

/**
 * Tolerant fallback scanner used when PostCSS rejects a stylesheet.
 *
 * Walks the source (skipping comments, strings and escapes) and treats the text before each
 * `{` as a rule prelude. At-rule preludes (`@media ...`) are skipped, but the scan continues
 * inside their blocks so nested rules are still found. This recovers the selectors that
 * precede and follow a syntax error.
 */
function scanRulesLeniently(css: string): { rules: LenientRule[]; imports: string[] } {
  const rules: LenientRule[] = [];
  const imports: string[] = [];
  const lineStarts = [0];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '\n') lineStarts.push(i + 1);
  }
  const position = (offset: number) => {
    let line = 0;
    for (let lo = 0, hi = lineStarts.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= offset) {
        line = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { line: line + 1, column: offset - lineStarts[line] + 1 };
  };

  let segmentStart = 0;
  let parenDepth = 0;
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < css.length && css[i] !== ch && css[i] !== '\n') {
        i += css[i] === '\\' ? 2 : 1;
      }
      i++;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (parenDepth === 0 && (ch === ';' || ch === '}')) {
      if (ch === ';') {
        const statement = stripComments(css.slice(segmentStart, i)).trim();
        if (/^@import\s/i.test(statement)) imports.push(statement.replace(/^@import\s+/i, ''));
      }
      segmentStart = i + 1;
    } else if (parenDepth === 0 && ch === '{') {
      const raw = css.slice(segmentStart, i);
      const selector = raw.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ').trim();
      if (selector && !selector.startsWith('@')) {
        const leading = raw.length - raw.trimStart().length;
        const start = position(segmentStart + leading);
        const close = css.indexOf('}', i);
        const blockEnd = close === -1 ? css.length : close + 1;
        const end = position(Math.max(blockEnd - 1, i));
        rules.push({
          selector,
          text: css.slice(segmentStart + leading, blockEnd).trim(),
          location: {
            startLine: start.line,
            startColumn: start.column,
            endLine: end.line,
            endColumn: end.column,
          },
        });
      }
      segmentStart = i + 1;
    }
    i++;
  }

  return { rules, imports };
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
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
