/**
 * Refactoring for `at <start>..<end>`: rewrite it as `at <start> for <length>`
 * (Feature 048), so the length is stated instead of computed by hand.
 */
import { AstUtils, CstUtils, type LangiumDocument } from 'langium';
import type { CodeAction, Range } from 'vscode-languageserver-protocol';
import { CodeActionKind } from 'vscode-languageserver-protocol';
import { isTimeRange, type TimeExpression, type TimeRange } from '../generated/ast.js';
import { parseTimeRange } from '../type-system-typir/utils/time-expression.js';

/** The unit of a plain time literal, or undefined for anything else. */
function literalUnit(expr: TimeExpression | undefined): string | undefined {
  if (expr?.$type === 'TimeLiteral' || expr?.$type === 'RelativeTimeLiteral') {
    return expr.unit ?? 's';
  }
  return undefined;
}

const UNIT_SECONDS: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600 };

/** Round away floating-point noise (0.30000000000000004 → 0.3). */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * The `for` length of a `start..end` range, written in the unit both ends
 * use (`2m..5m` → `3m`), or in seconds. Undefined when the length is not
 * statically known or not positive.
 */
export function durationText(timeRange: TimeRange): string | undefined {
  if (!timeRange.end || timeRange.duration) return undefined;
  const { duration } = parseTimeRange(timeRange);
  if (duration === undefined || duration <= 0) return undefined;
  const startUnit = literalUnit(timeRange.start);
  const unit = startUnit && startUnit === literalUnit(timeRange.end) ? startUnit : 's';
  return `${tidy(duration / UNIT_SECONDS[unit])}${unit}`;
}

/** "Convert to '<start> for <length>'" for the `start..end` range at `range`. */
export function createTimeRangeActions(document: LangiumDocument, range: Range): CodeAction[] {
  const root = document.parseResult.value.$cstNode;
  if (!root) return [];
  const offset = document.textDocument.offsetAt(range.start);
  const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
  const timeRange = leaf && AstUtils.getContainerOfType(leaf.astNode, isTimeRange);
  if (!timeRange?.end?.$cstNode || !timeRange.start.$cstNode) return [];

  const length = durationText(timeRange);
  if (!length) return [];

  const startText = timeRange.start.$cstNode.text;
  const edit = {
    range: {
      start: document.textDocument.positionAt(timeRange.start.$cstNode.end),
      end: document.textDocument.positionAt(timeRange.end.$cstNode.end),
    },
    newText: ` for ${length}`,
  };
  return [
    {
      title: `Convert to '${startText} for ${length}'`,
      kind: CodeActionKind.RefactorRewrite,
      edit: { changes: { [document.uri.toString()]: [edit] } },
    },
  ];
}
