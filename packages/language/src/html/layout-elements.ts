/**
 * The ids and classes used in a layout HTML file, and which of them an inline
 * `style` attribute makes vertically scrollable. Used to check scroll timeline
 * containers (Feature 049).
 */
import { readFileSync } from 'node:fs';
import { Parser } from 'htmlparser2';
import { URI } from 'langium';
import { declaresVerticalScroll } from '../css/css-parser.js';
import { isDefaultImport, type Program } from '../generated/ast.js';
import { resolveImportPathToUri } from '../utils/path-utils.js';

export interface LayoutElements {
  readonly ids: ReadonlySet<string>;
  readonly classes: ReadonlySet<string>;
  /** Ids / classes of elements whose inline style lets them scroll vertically. */
  readonly scrollableIds: ReadonlySet<string>;
  readonly scrollableClasses: ReadonlySet<string>;
}

export function scanLayoutElements(html: string): LayoutElements {
  const ids = new Set<string>();
  const classes = new Set<string>();
  const scrollableIds = new Set<string>();
  const scrollableClasses = new Set<string>();
  const parser = new Parser({
    onopentag(_name, attributes) {
      const id = attributes.id?.trim();
      const classList = (attributes.class ?? '').split(/\s+/).filter(Boolean);
      const scrolls = attributes.style ? declaresVerticalScroll(`{${attributes.style}}`) : false;
      if (id) {
        ids.add(id);
        if (scrolls) scrollableIds.add(id);
      }
      for (const name of classList) {
        classes.add(name);
        if (scrolls) scrollableClasses.add(name);
      }
    },
  });
  parser.write(html);
  parser.end();
  return { ids, classes, scrollableIds, scrollableClasses };
}

/**
 * The layout HTML of `program`: from `htmlContent` (the IDE's HTML registry,
 * when it has the file) or else read from disk. Undefined without a `layout`
 * import or when the file cannot be read.
 */
export function readLayoutHtml(program: Program, htmlContent?: string): string | undefined {
  if (htmlContent !== undefined) return htmlContent;
  const layout = program.statements.find(s => isDefaultImport(s) && s.type === 'layout');
  const documentUri = program.$document?.uri?.toString();
  if (!layout || !isDefaultImport(layout) || !documentUri) return undefined;
  try {
    return readFileSync(
      URI.parse(resolveImportPathToUri(documentUri, layout.path)).fsPath,
      'utf-8'
    );
  } catch {
    return undefined;
  }
}
