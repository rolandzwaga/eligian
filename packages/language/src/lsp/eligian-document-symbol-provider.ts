/**
 * Timeline-aware Outline, breadcrumbs and Go to Symbol (audit idea #20).
 *
 * Langium's default provider lists only named nodes, so the unnamed `at`,
 * sequence and stagger events were missing. Here each timeline lists its
 * lifecycle blocks and events, labelled with their resolved time ranges (the
 * shared resolver, as the inlay hints) and, as the detail, the calls they make:
 *
 *   ▾ timeline "Timeline Power Tools"      raf · 0s..42s
 *       on enter                           showView, narrate
 *       at 0s..7s as intro                 narrate, spotlight
 *     ▾ sequence 7s..22s ×3
 *         7s..12s                          revealCard
 *       stagger 22s..23.9s ×3              revealCard
 *
 * Next to the timelines: actions (with their parameters), event actions,
 * constants and named imports. A library lists its actions.
 */
import { type AstNode, AstUtils, type CstNode, GrammarUtils, type LangiumDocument } from 'langium';
import type { DocumentSymbolProvider } from 'langium/lsp';
import { type DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import {
  type ResolvedTimes,
  resolveTimelineTimes,
} from '../compiler/transformers/time-resolver.js';
import type { TimeSpan } from '../compiler/transformers/time-schedule.js';
import {
  type ActionDefinition,
  type EventActionDefinition,
  isActionDefinition,
  isEndableActionDefinition,
  isEventActionDefinition,
  isInlineEndableAction,
  isInteractionStatement,
  isLibrary,
  isNamedImport,
  isOperationCall,
  isProgram,
  isSequenceBlock,
  isStaggerBlock,
  isStringLiteral,
  isTimedEvent,
  isTimeline,
  isVariableDeclaration,
  type NamedImport,
  type SequenceBlock,
  type SequenceItem,
  type StaggerBlock,
  type TimedEvent,
  type Timeline,
  type TimelineLifecycle,
  type VariableDeclaration,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

/** The most call names an event's detail lists before `…`. */
const MAX_CALLS = 3;

const seconds = (n: number) => `${Math.round(n * 1e6) / 1e6}s`;
const span = (s: TimeSpan) => `${seconds(s.start)}..${seconds(s.end)}`;
/** From the start of the first span to the end of the last. */
const outer = (spans: readonly TimeSpan[]): TimeSpan => ({
  start: spans[0].start,
  end: spans[spans.length - 1].end,
});
/** The source text of a node, on one line. */
const text = (node: AstNode | undefined) => node?.$cstNode?.text.replace(/\s+/g, ' ').trim() ?? '';

export class EligianDocumentSymbolProvider implements DocumentSymbolProvider {
  getSymbols(document: LangiumDocument): DocumentSymbol[] {
    const root = document.parseResult.value;
    if (isLibrary(root)) {
      return root.actions.flatMap(action => this.action(action));
    }
    if (!isProgram(root)) return [];
    const symbols: DocumentSymbol[] = [];
    for (const statement of root.statements) {
      if (isTimeline(statement)) symbols.push(...this.timeline(statement));
      else if (isActionDefinition(statement)) symbols.push(...this.action(statement));
      else if (isEventActionDefinition(statement)) symbols.push(...this.eventAction(statement));
      else if (isVariableDeclaration(statement)) symbols.push(...this.constant(statement));
      else if (isNamedImport(statement)) symbols.push(...this.namedImport(statement));
    }
    return symbols;
  }

  private timeline(timeline: Timeline): DocumentSymbol[] {
    const times = resolveTimelineTimes(timeline);
    // A timeline without timed events (a hub waiting for a click) has no duration to show
    const duration = times.duration ? ` · 0s..${seconds(times.duration)}` : '';
    const children = [
      ...timeline.lifecycle.flatMap(block => this.lifecycle(block)),
      ...timeline.events.flatMap(event => this.event(event, times)),
    ];
    return symbol(timeline, `timeline "${timeline.name}"`, SymbolKind.Module, {
      detail: `${timeline.provider}${duration}`,
      selection: property(timeline, 'name'),
      children,
    });
  }

  private lifecycle(block: TimelineLifecycle): DocumentSymbol[] {
    return symbol(block, `on ${block.kind}`, SymbolKind.Event, {
      detail: eventSummary(block.operations),
      selection: property(block, 'kind'),
    });
  }

  private event(event: Timeline['events'][number], times: ResolvedTimes): DocumentSymbol[] {
    const spans = times.events.get(event);
    if (isTimedEvent(event)) return this.timedEvent(event, spans?.[0]);
    if (isSequenceBlock(event)) return this.sequence(event, times, spans);
    if (isStaggerBlock(event)) return this.stagger(event, spans);
    return [];
  }

  private timedEvent(event: TimedEvent, resolved: TimeSpan | undefined): DocumentSymbol[] {
    const range = resolved ? span(resolved) : text(event.timeRange);
    const label = event.name ? ` as ${event.name}` : '';
    const action = event.action;
    // An inline [start] [end] block: its start operations; else the call or control flow itself
    const body = isInlineEndableAction(action) ? action.startOperations : action ? [action] : [];
    return symbol(event, `at ${range}${label}`, SymbolKind.Event, {
      detail: eventSummary(body),
      selection: property(event, 'timeRange'),
    });
  }

  private sequence(
    block: SequenceBlock,
    times: ResolvedTimes,
    spans: readonly TimeSpan[] | undefined
  ): DocumentSymbol[] {
    const whole = spans && spans.length > 0 ? ` ${span(outer(spans))}` : '';
    return symbol(block, `sequence${whole} ×${block.items.length}`, SymbolKind.Event, {
      selection: keyword(block),
      children: block.items.flatMap(item => this.sequenceItem(item, times.sequenceItems.get(item))),
    });
  }

  private sequenceItem(item: SequenceItem, resolved: TimeSpan | undefined): DocumentSymbol[] {
    const range = resolved ? span(resolved) : `for ${text(item.duration)}`;
    const label = item.name ? ` as ${item.name}` : '';
    return symbol(item, `${range}${label}`, SymbolKind.Event, {
      detail: eventSummary(item.actionCall ? [item.actionCall] : item.startOps),
      selection: property(item, item.actionCall ? 'actionCall' : 'duration'),
    });
  }

  private stagger(block: StaggerBlock, spans: readonly TimeSpan[] | undefined): DocumentSymbol[] {
    const range =
      spans && spans.length > 0
        ? ` ${span(outer(spans))} ×${spans.length}`
        : ` ${text(block.items)}`;
    return symbol(block, `stagger${range}`, SymbolKind.Event, {
      detail: eventSummary(block.actionCall ? [block.actionCall] : block.startOps),
      selection: keyword(block),
    });
  }

  private action(action: ActionDefinition): DocumentSymbol[] {
    const parameters = action.parameters.map(p => p.name).join(', ');
    const prefix = isEndableActionDefinition(action) ? 'endable ' : '';
    return symbol(action, action.name, SymbolKind.Function, {
      detail: `${action.visibility === 'private' ? 'private ' : ''}${prefix}action(${parameters})`,
      selection: property(action, 'name'),
    });
  }

  private eventAction(action: EventActionDefinition): DocumentSymbol[] {
    const topic = action.eventTopic ? ` topic "${action.eventTopic}"` : '';
    return symbol(action, action.name, SymbolKind.Event, {
      detail: `on event "${action.eventName ?? ''}"${topic}`,
      selection: property(action, 'name'),
    });
  }

  private constant(declaration: VariableDeclaration): DocumentSymbol[] {
    return symbol(declaration, declaration.name, SymbolKind.Constant, {
      detail: text(declaration.value),
      selection: property(declaration, 'name'),
    });
  }

  private namedImport(declaration: NamedImport): DocumentSymbol[] {
    return symbol(declaration, declaration.name, SymbolKind.Variable, {
      detail: `import "${declaration.path}"${declaration.assetType ? ` as ${declaration.assetType}` : ''}`,
      selection: property(declaration, 'name'),
    });
  }
}

/**
 * What `statements` do: the names of the operations and actions they call
 * and of the interaction verbs (`navigate`, `toggle`, …), in order and
 * without repeats (also inside if / for / with bodies), at most
 * {@link MAX_CALLS}, then `…`; preceded by the first argument that reads as
 * text (`narrate("A timeline is…")`), which tells otherwise alike beats apart.
 */
export function eventSummary(statements: readonly AstNode[]): string {
  const names: string[] = [];
  let quote: string | undefined;
  for (const statement of statements) {
    for (const node of AstUtils.streamAst(statement)) {
      let name: string | undefined;
      if (isOperationCall(node)) {
        name = getOperationCallName(node);
        quote ??= prose(node.args[0]);
      } else if (isInteractionStatement(node) && node.verb !== 'run') {
        name = node.verb;
      }
      if (name && !names.includes(name)) names.push(name);
    }
  }
  const list =
    names.length > MAX_CALLS ? `${names.slice(0, MAX_CALLS).join(', ')}, …` : names.join(', ');
  // The quote first: it tells beats apart, and the Outline cuts long details off at the end
  return quote ? `"${quote}" · ${list}` : list;
}

/** The longest quote an event's detail shows. */
const MAX_QUOTE = 40;

/** A string literal argument that reads as text (has a space), shortened. */
function prose(argument: AstNode | undefined): string | undefined {
  if (!isStringLiteral(argument) || !/\s/.test(argument.value.trim())) return undefined;
  const value = argument.value.trim().replace(/\s+/g, ' ');
  return value.length > MAX_QUOTE ? `${value.slice(0, MAX_QUOTE - 1).trimEnd()}…` : value;
}

/** A symbol for `node`, or none when it has no source (a partial AST). */
function symbol(
  node: AstNode,
  name: string,
  kind: SymbolKind,
  options: { detail?: string; selection?: CstNode; children?: DocumentSymbol[] }
): DocumentSymbol[] {
  const cst = node.$cstNode;
  if (!cst) return [];
  return [
    {
      name: name || '?',
      kind,
      detail: options.detail || undefined,
      range: cst.range,
      selectionRange: (options.selection ?? cst).range,
      children: options.children && options.children.length > 0 ? options.children : undefined,
    },
  ];
}

/** The source of a node's property (its name, time range, …), if it has one. */
function property(node: AstNode, name: string): CstNode | undefined {
  const value = (node as unknown as Record<string, unknown>)[name];
  if (value && typeof value === 'object' && '$cstNode' in value) {
    return (value as AstNode).$cstNode;
  }
  const cst = node.$cstNode;
  if (!cst) return undefined;
  return GrammarUtils.findNodeForProperty(cst, name);
}

/** The first token of a node (its keyword: `sequence`, `stagger`). */
function keyword(node: AstNode): CstNode | undefined {
  const cst = node.$cstNode;
  return cst ? (cst as { content?: CstNode[] }).content?.[0] : undefined;
}
