import type { AstNode } from 'langium';
import type { ImportStatement, Program } from '../generated/ast.js';
import { inferAssetType } from '../utils/asset-type-inference.js';
import { isDefaultImport, isNamedImport } from '../utils/ast-helpers.js';
import { stripImportQuotes } from '../utils/path-utils.js';
import { getImports } from '../utils/program-helpers.js';

/**
 * Whether an import statement brings in a CSS stylesheet.
 *
 * - `styles "./x.css"` default imports, and
 * - named imports (`import theme from "./x.css"`) whose asset type is `css`, either via an
 *   explicit `as css` or inferred from the file extension (same rule the asset loader
 *   uses to decide what lands in `config.cssFiles`).
 */
export function isCssImport(imp: AstNode | undefined): boolean {
  if (isDefaultImport(imp)) return imp.type === 'styles';
  if (isNamedImport(imp)) {
    const type =
      imp.assetType ?? inferAssetType(imp.path ? stripImportQuotes(imp.path) : undefined);
    return type === 'css';
  }
  return false;
}

/**
 * Single source of truth for "which imports of this program are CSS files".
 *
 * Returns the import nodes (default `styles` imports plus CSS named imports) that have a
 * path, in document order, so registry parsing and the runtime `cssFiles` stay in sync.
 */
export function getCssImports(program: Program): ImportStatement[] {
  return getImports(program).filter(
    imp => isCssImport(imp) && 'path' in imp && typeof imp.path === 'string' && imp.path !== ''
  );
}

/**
 * Raw (possibly quoted) paths of every CSS import of the program, in document order.
 */
export function getCssImportPaths(program: Program): string[] {
  return getCssImports(program).map(imp => (imp as { path: string }).path);
}
