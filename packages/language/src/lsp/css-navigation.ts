/**
 * Navigation between .eligian, CSS and the layout HTML (audit idea #22).
 *
 * The classes and ids a program uses are the string literals in className and
 * selector positions: operation and action arguments (by their roles, #18), a
 * `with` selector, `on <event> "<sel>"`, `at … target "<sel>"` and a
 * timeline's container. A selector's `.class` / `#id` parts come from
 * parseSelectorIdentifiers, with their offsets.
 *
 * - Go to Definition on one of them: its CSS rule (imported stylesheets) and
 *   its element(s) in the layout HTML.
 * - The reverse (`eligian/cssReferences`, used by the extension's "Find
 *   Eligian References" in CSS and HTML files and by the CSS CodeLens): every
 *   use in the .eligian documents that import that stylesheet or layout.
 */
import { Parser } from 'htmlparser2';
import { AstUtils, type CstNode, GrammarUtils, type LangiumDocument, URI } from 'langium';
import type { Location, LocationLink, Range } from 'vscode-languageserver-types';
import { argumentRole, type ParameterRole } from '../css/parameter-roles.js';
import { parseSelectorIdentifiers } from '../css/selector-parser.js';
import type { EligianServices } from '../eligian-module.js';
import {
  isDefaultImport,
  isInteractionStatement,
  isOperationCall,
  isProgram,
  isStringLiteral,
  isTimedEvent,
  isTimeline,
  isWithStatement,
  type Program,
} from '../generated/ast.js';
import { readLayoutHtml } from '../html/layout-elements.js';
import { resolveImportPathToUri } from '../utils/path-utils.js';

/** LSP request: the uses of a class or id of a CSS / HTML file in the .eligian documents. */
export const CSS_REFERENCES_REQUEST = 'eligian/cssReferences';

export interface CssReferencesParams {
  /** The CSS or HTML file */
  readonly uri: string;
  readonly kind: 'class' | 'id';
  readonly name: string;
}

/** LSP request: per class / id of a CSS file, its rule and its uses (for a CodeLens). */
export const CSS_REFERENCE_LENSES_REQUEST = 'eligian/cssReferenceLenses';

export interface CssReferenceLens {
  readonly kind: 'class' | 'id';
  readonly name: string;
  /** The (first) rule that defines it */
  readonly range: Range;
  readonly references: readonly Location[];
}

/** A class or id used in a .eligian string, with its range (prefix included for selectors). */
export interface CssUse {
  readonly kind: 'class' | 'id';
  readonly name: string;
  readonly range: Range;
}

/** Every class and id the program of `document` uses in className / selector positions. */
export function cssUses(document: LangiumDocument): CssUse[] {
  const root = document.parseResult.value;
  const text = document.textDocument;
  const uses: CssUse[] = [];
  const add = (token: CstNode | undefined, role: ParameterRole | undefined) => {
    if (!token || !role) return;
    // Offsets inside the quotes of the string token
    const inner = token.text.slice(1, -1);
    const base = token.offset + 1;
    if (role === 'className') {
      const name = inner.trim();
      if (!name || /\s/.test(name)) return;
      const start = base + inner.indexOf(name);
      uses.push({
        kind: 'class',
        name,
        range: { start: text.positionAt(start), end: text.positionAt(start + name.length) },
      });
      return;
    }
    for (const identifier of parseSelectorIdentifiers(inner)) {
      uses.push({
        kind: identifier.type,
        name: identifier.name,
        range: {
          start: text.positionAt(base + identifier.start),
          end: text.positionAt(base + identifier.end),
        },
      });
    }
  };
  for (const node of AstUtils.streamAst(root)) {
    if (isOperationCall(node)) {
      node.args.forEach((arg, index) => {
        if (isStringLiteral(arg)) add(arg.$cstNode, argumentRole(node, index));
      });
    } else if (isWithStatement(node) && isStringLiteral(node.selector)) {
      add(node.selector.$cstNode, 'selector');
    } else if (isInteractionStatement(node) && node.selector !== undefined) {
      add(property(node.$cstNode, 'selector'), 'selector');
    } else if (isTimedEvent(node) && node.target !== undefined) {
      add(property(node.$cstNode, 'target'), 'selector');
    } else if (isTimeline(node)) {
      add(property(node.$cstNode, 'containerSelector'), 'selector');
    }
  }
  return uses;
}

const property = (cst: CstNode | undefined, name: string) =>
  cst ? GrammarUtils.findNodeForProperty(cst, name) : undefined;

const contains = (range: Range, line: number, character: number) =>
  (range.start.line < line || (range.start.line === line && range.start.character <= character)) &&
  (range.end.line > line || (range.end.line === line && range.end.character >= character));

/** The class or id used at `position` of `document`. */
export function cssUseAt(
  document: LangiumDocument,
  position: { line: number; character: number }
): CssUse | undefined {
  return cssUses(document).find(use => contains(use.range, position.line, position.character));
}

/**
 * Go to Definition for the class or id at `position`: its CSS rule and its
 * elements in the layout HTML.
 */
export function cssDefinitions(
  services: EligianServices,
  document: LangiumDocument,
  position: { line: number; character: number }
): LocationLink[] | undefined {
  const use = cssUseAt(document, position);
  if (!use) return undefined;
  const documentUri = document.uri.toString();
  const links: LocationLink[] = [];
  const registry = services.css.CSSRegistry;
  const rule =
    use.kind === 'class'
      ? registry.findClassLocation(documentUri, use.name)
      : registry.findIDLocation(documentUri, use.name);
  if (rule) {
    const range = cssRange(rule);
    links.push({
      originSelectionRange: use.range,
      targetUri: fileUri(rule.filePath),
      targetRange: range,
      targetSelectionRange: { start: range.start, end: range.start },
    });
  }
  const root = document.parseResult.value;
  const layout = isProgram(root) ? layoutOf(services, root, documentUri) : undefined;
  for (const range of layout ? layoutElementRanges(layout.html, use) : []) {
    links.push({
      originSelectionRange: use.range,
      targetUri: layout!.uri,
      targetRange: range,
      targetSelectionRange: range,
    });
  }
  return links.length > 0 ? links : undefined;
}

/** The uses of a class / id of the CSS or HTML file `params.uri` in the workspace's programs. */
export function cssReferences(services: EligianServices, params: CssReferencesParams): Location[] {
  const target = normalize(params.uri);
  const locations: Location[] = [];
  for (const document of services.shared.workspace.LangiumDocuments.all) {
    if (!importsFile(services, document, target)) continue;
    for (const use of cssUses(document)) {
      if (use.kind === params.kind && use.name === params.name) {
        locations.push({ uri: document.uri.toString(), range: use.range });
      }
    }
  }
  return locations;
}

/** Per class and id of the CSS file `uri` (its first rule): its uses, for a CodeLens. */
export function cssReferenceLenses(services: EligianServices, uri: string): CssReferenceLens[] {
  const metadata = services.css.CSSRegistry.findMetadata(uri);
  if (!metadata) return [];
  const target = normalize(uri);
  const uses = new Map<string, Location[]>();
  for (const document of services.shared.workspace.LangiumDocuments.all) {
    if (!importsFile(services, document, target)) continue;
    for (const use of cssUses(document)) {
      const key = `${use.kind}:${use.name}`;
      const list = uses.get(key) ?? [];
      list.push({ uri: document.uri.toString(), range: use.range });
      uses.set(key, list);
    }
  }
  const lenses: CssReferenceLens[] = [];
  const own = (filePath: string) => normalize(fileUri(filePath)) === target;
  for (const [kind, locations] of [
    ['class', metadata.classLocations],
    ['id', metadata.idLocations],
  ] as const) {
    for (const [name, location] of locations) {
      // Rules of @imported files are listed in their own file
      if (!own(location.filePath)) continue;
      lenses.push({
        kind,
        name,
        range: cssRange(location),
        references: uses.get(`${kind}:${name}`) ?? [],
      });
    }
  }
  return lenses;
}

/** Whether `document` imports the stylesheet or layout `target` (a normalized URI). */
function importsFile(
  services: EligianServices,
  document: LangiumDocument,
  target: string
): boolean {
  const documentUri = document.uri.toString();
  for (const css of services.css.CSSRegistry.getDocumentImports(documentUri)) {
    if (normalize(css) === target) return true;
    // A stylesheet the imported one @imports
    const metadata = services.css.CSSRegistry.findMetadata(css);
    if (metadata?.importedFileUris?.some(imported => normalize(imported) === target)) return true;
  }
  const root = document.parseResult.value;
  const layout = isProgram(root) ? layoutUri(root, documentUri) : undefined;
  return layout !== undefined && normalize(layout) === target;
}

function layoutUri(program: Program, documentUri: string): string | undefined {
  const layout = program.statements.find(s => isDefaultImport(s) && s.type === 'layout');
  return layout && isDefaultImport(layout) && layout.path
    ? resolveImportPathToUri(documentUri, layout.path)
    : undefined;
}

function layoutOf(
  services: EligianServices,
  program: Program,
  documentUri: string
): { uri: string; html: string } | undefined {
  const uri = layoutUri(program, documentUri);
  if (!uri) return undefined;
  const html = readLayoutHtml(
    program,
    services.html.HTMLRegistry.getHTMLForDocument(documentUri)?.content
  );
  return html === undefined ? undefined : { uri, html };
}

/** The ranges of the opening tags in `html` with this id or class. */
export function layoutElementRanges(html: string, use: Pick<CssUse, 'kind' | 'name'>): Range[] {
  const offsets: [number, number][] = [];
  const parser = new Parser({
    onopentag(_name, attributes) {
      const matches =
        use.kind === 'id'
          ? attributes.id?.trim() === use.name
          : (attributes.class ?? '').split(/\s+/).includes(use.name);
      if (matches) offsets.push([parser.startIndex, parser.endIndex + 1]);
    },
  });
  parser.write(html);
  parser.end();
  const lineStarts = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === '\n') lineStarts.push(i + 1);
  const position = (offset: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line++;
    return { line, character: offset - lineStarts[line] };
  };
  return offsets.map(([start, end]) => ({ start: position(start), end: position(end) }));
}

/** A CSS rule location (1-based lines and columns) as an LSP range. */
function cssRange(location: {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}): Range {
  return {
    start: {
      line: Math.max(0, location.startLine - 1),
      character: Math.max(0, location.startColumn - 1),
    },
    end: { line: Math.max(0, location.endLine - 1), character: Math.max(0, location.endColumn) },
  };
}

/** A file path or URI as a URI string. */
function fileUri(pathOrUri: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUri) ? pathOrUri : URI.file(pathOrUri).toString();
}

/** URIs compare case-insensitively on Windows (drive letters, encoded colons). */
function normalize(uri: string): string {
  return decodeURIComponent(fileUri(uri)).toLowerCase();
}
