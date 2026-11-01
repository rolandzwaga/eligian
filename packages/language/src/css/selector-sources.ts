/**
 * The class names and ids a selector may use (audit feature idea #18): the
 * ones defined in the imported CSS and the ones present in the layout HTML,
 * where most ids live. Class-name arguments (`addClass("x")`) still need a CSS
 * class: only selectors are matched against the layout as well.
 */
import type { EligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';
import {
  type LayoutElements,
  readLayoutHtml,
  scanLayoutElements,
} from '../html/layout-elements.js';

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
