/**
 * The class names and ids a selector may use (audit feature idea #18): the
 * ones defined in the imported CSS and the ones present in the layout HTML,
 * where most ids live. Class-name arguments (`addClass("x")`) still need a CSS
 * class: only selectors are matched against the layout as well.
 */
import type { AstNode, ValidationAcceptor } from 'langium';
import type { EligianServices } from '../eligian-module.js';
import { isDefaultImport, type Program } from '../generated/ast.js';
import {
  type LayoutElements,
  readLayoutHtml,
  scanLayoutElements,
} from '../html/layout-elements.js';
import { parseSelector } from './selector-parser.js';

export interface SelectorNames {
  readonly classes: Set<string>;
  readonly ids: Set<string>;
}

/** Scans by layout text (validation asks for the same layout many times per document). */
const scans = new Map<string, LayoutElements>();
const MAX_SCANS = 8;

function scan(html: string): LayoutElements {
  let elements = scans.get(html);
  if (!elements) {
    elements = scanLayoutElements(html);
    if (scans.size >= MAX_SCANS) scans.delete(scans.keys().next().value as string);
    scans.set(html, elements);
  }
  return elements;
}

/** The layout's elements for `program`, or undefined without a (readable) layout import. */
export function layoutElementsOf(
  services: EligianServices,
  program: Program,
  documentUri: string
): LayoutElements | undefined {
  const html = readLayoutHtml(
    program,
    services.html.HTMLRegistry.getHTMLForDocument(documentUri)?.content
  );
  return html === undefined ? undefined : scan(html);
}

/** CSS classes and ids of the document, plus those of its layout HTML. */
export function selectorNames(
  services: EligianServices,
  program: Program,
  documentUri: string
): SelectorNames {
  const cssRegistry = services.css.CSSRegistry;
  const classes = new Set(cssRegistry.getClassesForDocument(documentUri));
  const ids = new Set(cssRegistry.getIDsForDocument(documentUri));
  const layout = layoutElementsOf(services, program, documentUri);
  for (const name of layout?.classes ?? []) classes.add(name);
  for (const id of layout?.ids ?? []) ids.add(id);
  return { classes, ids };
}

/**
 * `eligian.validation.selectorNotInLayout` (off by default): warn about a
 * selector id (and, with `all`, class) that the CSS defines but the imported
 * layout HTML does not contain, so it only matches an element an operation
 * creates at runtime. Names in neither are already errors; without a layout
 * import there is nothing to compare with.
 */
export function reportNotInLayout(
  selector: string,
  node: AstNode,
  services: EligianServices,
  program: Program,
  documentUri: string,
  accept: ValidationAcceptor,
  property?: string
): void {
  const mode = services.validation.Settings.selectorNotInLayout;
  if (mode === 'off') return;
  const layout = layoutElementsOf(services, program, documentUri);
  if (!layout) return;
  const { classes, ids, valid } = parseSelector(selector);
  if (!valid) return;
  const cssRegistry = services.css.CSSRegistry;
  const layoutFile = layoutFileName(program);
  const report = (name: string) =>
    accept(
      'warning',
      `'${name}' is not in the layout (${layoutFile}): the selector only matches an element that an operation creates at runtime`,
      { node, ...(property ? { property: property as never } : {}), code: 'selector_not_in_layout' }
    );
  for (const id of ids) {
    if (!layout.ids.has(id) && cssRegistry.getIDsForDocument(documentUri).has(id)) report(`#${id}`);
  }
  if (mode !== 'all') return;
  for (const name of classes) {
    if (!layout.classes.has(name) && cssRegistry.getClassesForDocument(documentUri).has(name)) {
      report(`.${name}`);
    }
  }
}

/** `layout.html` (the file name of the layout import), for messages. */
function layoutFileName(program: Program): string {
  const layout = program.statements.find(s => isDefaultImport(s) && s.type === 'layout');
  return layout && isDefaultImport(layout)
    ? (layout.path.split(/[/]/).pop() ?? layout.path)
    : 'layout';
}
