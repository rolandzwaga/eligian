/**
 * Formatting rules for .eligian documents (audit feature idea #15), used by
 * EligianFormatter (Format Document in the editor) and by `eligian fmt`.
 *
 * The rules only change whitespace between tokens, so comments, JSDoc and the
 * AST are kept (the tests format every example and fixture and compare the
 * text without whitespace, and check that formatting twice changes nothing):
 *
 * - top-level statements one per line; existing blank lines are kept (at most
 *   one), and an action, event action, timeline or languages block gets one
 *   blank line before it
 * - blocks `[ … ]` and `{ … }` written over several lines: one statement per
 *   line, indented 2 spaces, closing bracket on its own line; blocks written on
 *   one line stay on one line with single spaces (`[ selectElement("#a") ]`)
 * - `] [` between the start and end block of endable actions and events
 * - one space around binary operators, `=`, and after keywords and commas; no
 *   space inside `( )`, before `,` `:` `(`, around `..` and `.`, after `@`,
 *   `@@`, `$`, unary operators and the `+` of a relative time, and between a
 *   number and its time unit (`5 s` → `5s`)
 * - arrays and objects written over several lines get one element per line
 */
import { type AstNode, AstUtils, type CstNode, CstUtils, GrammarAST, GrammarUtils } from 'langium';
import { Formatting, type FormattingRegion, type NodeFormatter } from 'langium/lsp';
import {
  isArrayLiteral,
  isBinaryExpression,
  isBinaryTimeExpression,
  isEndableActionDefinition,
  isEventActionDefinition,
  isLanguagesBlock,
  isLibrary,
  isObjectLiteral,
  isOperationCall,
  isProgram,
  isRegularActionDefinition,
  isRelativeTimeLiteral,
  isTimeLiteral,
  isTimeline,
  isTimeValue,
  isUnaryExpression,
} from '../generated/ast.js';

/** Keywords followed by one space wherever they appear (when something follows on the line). */
const SPACED_KEYWORDS = [
  'action',
  'as',
  'at',
  'const',
  'controller',
  'duration',
  'each',
  'else',
  'endable',
  'event',
  'extensions',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'key',
  'languages',
  'layout',
  'library',
  'locales',
  'navigate',
  'on',
  'operation',
  'pause',
  'play',
  'private',
  'provider',
  'run',
  'seek',
  'sequence',
  'stagger',
  'stop',
  'styles',
  'target',
  'then',
  'timeline',
  'toggle',
  'topic',
  'using',
  'with',
];

const BINARY_OPERATORS = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
];

/** Whether the CST of `nodes` (from the first start to the last end) spans more than one line. */
function spansLines(first: CstNode | undefined, last: CstNode | undefined): boolean {
  return (
    first !== undefined && last !== undefined && first.range.start.line !== last.range.end.line
  );
}

/**
 * Whether a keyword token is part of a name or a unit (a datatype rule such as
 * Identifier: a parameter called `duration`, `5s`), not the keyword itself.
 */
function inDatatypeRule(cst: CstNode): boolean {
  const rule = cst.grammarSource
    ? AstUtils.getContainerOfType(cst.grammarSource, GrammarAST.isParserRule)
    : undefined;
  return rule !== undefined && GrammarUtils.isDataTypeRule(rule);
}

/** Whether the token after `cst` starts on a later line (a list written over several lines). */
function lineBreakAfter(cst: CstNode): boolean {
  const next = CstUtils.getNextNode(cst, false);
  return next !== undefined && next.range.start.line > cst.range.end.line;
}

/** The keyword CST nodes of `node` itself (not of its children, not in names), in order. */
function ownKeywords(node: AstNode, keyword: string): CstNode[] {
  return node.$cstNode
    ? GrammarUtils.findNodesForKeyword(node.$cstNode, keyword).filter(cst => !inDatatypeRule(cst))
    : [];
}

/**
 * Next line, indented one level; an existing blank line before it is kept,
 * more are collapsed to one (Langium picks the first move that fits).
 */
const INDENT_KEEP_ONE_BLANK_LINE = Formatting.fit(Formatting.indent(), {
  options: {},
  moves: [{ tabs: 1, lines: 2 }],
});

const region = (formatter: NodeFormatter<AstNode>, nodes: CstNode[]): FormattingRegion =>
  formatter.cst(nodes);

/** Apply the formatting rules of `node` (called for every node of the document). */
export function formatNode(node: AstNode, formatter: NodeFormatter<AstNode>): void {
  if (isProgram(node) || isLibrary(node)) {
    formatTopLevel(node, formatter);
    return;
  }

  // Arrays and objects: commas and (when written over several lines) one element per line
  if (isArrayLiteral(node) || isObjectLiteral(node)) {
    formatCollection(node, formatter);
    return;
  }

  // `languages { * "en-US" "English"` aligns the other entries under the
  // default one's code (four spaces in): left as written
  if (isLanguagesBlock(node)) return;

  formatBlocks(node, formatter);
  formatTokens(node, formatter);
}

/** Top-level statements one per line; a blank line before block declarations. */
function formatTopLevel(node: AstNode, formatter: NodeFormatter<AstNode>): void {
  const statements = isProgram(node)
    ? node.statements
    : isLibrary(node)
      ? [...node.imports, ...node.actions]
      : [];
  if (isLibrary(node)) {
    formatter.keyword('library').append(Formatting.oneSpace());
  }
  statements.forEach((statement, index) => {
    const isFirst = index === 0 && !isLibrary(node);
    if (isFirst) {
      formatter.node(statement).prepend(Formatting.noIndent());
      return;
    }
    // A comment right above the declaration (JSDoc, a section banner) belongs
    // to it: the blank line goes above the comment, which stays as written
    const previous = statement.$cstNode
      ? CstUtils.getPreviousNode(statement.$cstNode, true)
      : undefined;
    const commented = previous?.hidden === true && /^\/[/*]/.test(previous.text);
    const block =
      !commented &&
      (isRegularActionDefinition(statement) ||
        isEndableActionDefinition(statement) ||
        isEventActionDefinition(statement) ||
        isTimeline(statement) ||
        isLanguagesBlock(statement));
    formatter
      .node(statement)
      .prepend(
        block
          ? Formatting.newLines(2, { allowLess: false })
          : Formatting.fit(Formatting.newLine(), Formatting.newLines(2))
      );
  });
}

/**
 * `[ … ]` and `{ … }` blocks of statements or events: multi-line blocks get
 * one entry per line, indented; one-line blocks single spaces.
 */
function formatBlocks(node: AstNode, formatter: NodeFormatter<AstNode>): void {
  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const opens = ownKeywords(node, open);
    const closes = ownKeywords(node, close);
    opens.forEach((openNode, index) => {
      const closeNode = closes[index];
      if (!closeNode) return;
      const openRegion = region(formatter, [openNode]);
      const closeRegion = region(formatter, [closeNode]);
      const inner = formatter.interior(openRegion, closeRegion);
      if (spansLines(openNode, closeNode)) {
        inner.prepend(INDENT_KEEP_ONE_BLANK_LINE);
        closeRegion.prepend(Formatting.newLine());
      } else {
        inner.prepend(Formatting.oneSpace());
        closeRegion.prepend(Formatting.oneSpace());
      }
      // `] [` between a start and an end block
      if (open === '[' && index > 0) {
        openRegion.prepend(Formatting.oneSpace());
      }
    });
    // A `{` / `[` that opens a block follows its header (on the same line) with one space
    for (const openNode of opens) {
      const previous = CstUtils.getPreviousNode(openNode, false);
      if (previous && previous.range.end.line === openNode.range.start.line) {
        region(formatter, [openNode]).prepend(Formatting.oneSpace());
      }
    }
  }
}

/** Spacing of keywords, punctuation and operators owned by `node`. */
function formatTokens(node: AstNode, formatter: NodeFormatter<AstNode>): void {
  for (const keyword of SPACED_KEYWORDS) {
    for (const cst of ownKeywords(node, keyword)) {
      region(formatter, [cst]).append(Formatting.oneSpace());
      // `"t"   in "#stage"` → `"t" in "#stage"`; a keyword starting a line keeps its line break
      const previous = CstUtils.getPreviousNode(cst, false);
      if (previous && previous.range.end.line === cst.range.start.line) {
        region(formatter, [cst]).prepend(Formatting.oneSpace());
      }
    }
  }
  for (const cst of ownKeywords(node, ',')) {
    region(formatter, [cst]).prepend(Formatting.noSpace());
    // A list written over several lines keeps its line breaks and indentation
    if (!lineBreakAfter(cst)) region(formatter, [cst]).append(Formatting.oneSpace());
  }
  for (const cst of ownKeywords(node, ':')) {
    region(formatter, [cst]).prepend(Formatting.noSpace()).append(Formatting.oneSpace());
  }
  for (const cst of ownKeywords(node, '=')) {
    region(formatter, [cst]).surround(Formatting.oneSpace());
  }
  for (const keyword of ['..', '.']) {
    for (const cst of ownKeywords(node, keyword)) {
      region(formatter, [cst]).surround(Formatting.noSpace());
    }
  }
  for (const keyword of ['@', '@@', '$']) {
    for (const cst of ownKeywords(node, keyword)) {
      region(formatter, [cst]).append(Formatting.noSpace());
    }
  }

  // Calls: `name(a, b)`; a call written over several lines keeps its layout
  if (isOperationCall(node) || node.$type.endsWith('ActionDefinition')) {
    const opens = ownKeywords(node, '(');
    const closes = ownKeywords(node, ')');
    if (opens[0] && closes[0] && !spansLines(opens[0], closes[0])) {
      region(formatter, [opens[0]]).prepend(Formatting.noSpace()).append(Formatting.noSpace());
      region(formatter, [closes[0]]).prepend(Formatting.noSpace());
    }
  } else {
    // `if (…)`, `for (…)`, parenthesised expressions
    for (const cst of ownKeywords(node, '(')) {
      region(formatter, [cst]).append(Formatting.noSpace());
    }
    for (const cst of ownKeywords(node, ')')) {
      region(formatter, [cst]).prepend(Formatting.noSpace());
    }
  }

  if (isBinaryExpression(node) || isBinaryTimeExpression(node)) {
    for (const operator of BINARY_OPERATORS) {
      for (const cst of ownKeywords(node, operator)) {
        region(formatter, [cst]).surround(Formatting.oneSpace());
      }
    }
  }
  if (isUnaryExpression(node)) {
    for (const operator of ['!', '-']) {
      for (const cst of ownKeywords(node, operator)) {
        region(formatter, [cst]).append(Formatting.noSpace());
      }
    }
  }
  if (isRelativeTimeLiteral(node)) {
    formatter.keyword('+').append(Formatting.noSpace());
  }
  // `5 s` → `5s`
  if ((isTimeLiteral(node) || isRelativeTimeLiteral(node) || isTimeValue(node)) && node.unit) {
    formatter.property('unit').prepend(Formatting.noSpace());
  }
}

/** Arrays and objects: `[a, b]` on one line; one element per line when written over several. */
function formatCollection(node: AstNode, formatter: NodeFormatter<AstNode>): void {
  const [open, close] = isArrayLiteral(node) ? ['[', ']'] : ['{', '}'];
  const openNode = ownKeywords(node, open)[0];
  const closeNode = ownKeywords(node, close)[0];
  for (const cst of ownKeywords(node, ',')) {
    region(formatter, [cst]).prepend(Formatting.noSpace());
  }
  for (const cst of ownKeywords(node, ':')) {
    region(formatter, [cst]).prepend(Formatting.noSpace()).append(Formatting.oneSpace());
  }
  const items = isArrayLiteral(node) ? node.elements : isObjectLiteral(node) ? node.properties : [];
  if (spansLines(openNode, closeNode) && items.length > 0) {
    formatter.nodes(...items).prepend(Formatting.indent());
    if (closeNode) region(formatter, [closeNode]).prepend(Formatting.newLine());
    return;
  }
  for (const cst of ownKeywords(node, ',')) {
    region(formatter, [cst]).append(Formatting.oneSpace());
  }
  if (openNode && closeNode && items.length > 0) {
    // Arrays hug their brackets (`["#a", "#b"]`), objects get spaces (`{ a: 1 }`)
    const spacing = isArrayLiteral(node) ? Formatting.noSpace() : Formatting.oneSpace();
    region(formatter, [openNode]).append(spacing);
    region(formatter, [closeNode]).prepend(spacing);
  }
}
