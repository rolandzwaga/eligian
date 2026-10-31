/**
 * Parameter-name inlay hints for operation and action calls (audit feature idea #7).
 *
 *   broadcastEvent(eventArgs: ["#panel"], eventName: "tour-ping")
 *
 * Setting `eligian.inlayHints.parameterNames`:
 * - `literals` (default): before literal arguments (strings, numbers, booleans,
 *   null, arrays, objects), where the meaning is not visible from the argument
 * - `all`: before every argument, except a parameter reference that already
 *   has the parameter's name (`fadeIn(selector)` for `selector`)
 * - `none`: off
 *
 * Time hints (audit feature idea #4): the absolute times the compiler computes,
 * from time-resolver.ts, after sequence items, stagger blocks and computed `at`
 * ranges, plus the inferred timeline duration. Settings
 * `eligian.inlayHints.sequenceTimes`, `staggerTimes`, `computedTimes`, `timelineDuration`.
 */
import { type AstNode, AstUtils, type CommentProvider, GrammarUtils } from 'langium';
import { AbstractInlayHintProvider, type InlayHintAcceptor } from 'langium/lsp';
import { InlayHintKind } from 'vscode-languageserver';
import {
  type ResolvedTimes,
  resolveTimelineTimes,
} from '../compiler/transformers/time-resolver.js';
import type { TimeSpan } from '../compiler/transformers/time-schedule.js';
import type { EligianServices } from '../eligian-module.js';
import {
  type Expression,
  isOperationCall,
  isParameterReference,
  isSequenceBlock,
  isStaggerBlock,
  isTimedEvent,
  isTimeline,
  type Timeline,
} from '../generated/ast.js';
import { getCallSignature } from './call-signature.js';

export type ParameterNameHints = 'none' | 'literals' | 'all';

/** Settings `eligian.inlayHints.sequenceTimes` etc. (audit idea #4). */
export interface TimeHintSettings {
  /** `‹5s..15s›` after each sequence item */
  readonly sequenceTimes: boolean;
  /** `‹22s..23.9s ×3›` after a stagger block's header */
  readonly staggerTimes: boolean;
  /** The absolute range after `at` ranges that are relative, computed or use `for` */
  readonly computedTimes: boolean;
  /** The inferred duration on a timeline header without an explicit `duration` */
  readonly timelineDuration: boolean;
}

/** `5s`, `23.9s` */
const seconds = (n: number) => `${Math.round(n * 1e6) / 1e6}s`;
const range = (span: TimeSpan) => `‹${seconds(span.start)}..${seconds(span.end)}›`;

const MODES: readonly ParameterNameHints[] = ['none', 'literals', 'all'];

const LITERAL_TYPES = new Set([
  'StringLiteral',
  'NumberLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'ArrayLiteral',
  'ObjectLiteral',
]);

/** A literal, or a negated number literal (`-5`). */
function isLiteral(expr: Expression): boolean {
  if (LITERAL_TYPES.has(expr.$type)) return true;
  return (
    expr.$type === 'UnaryExpression' && expr.op === '-' && expr.operand?.$type === 'NumberLiteral'
  );
}

export class EligianInlayHintProvider extends AbstractInlayHintProvider {
  private readonly comments: CommentProvider;
  private mode: ParameterNameHints = 'literals';
  private timeHints: TimeHintSettings = {
    sequenceTimes: true,
    staggerTimes: true,
    computedTimes: true,
    timelineDuration: true,
  };
  /** Resolved times per timeline; AST nodes are new after every edit, so this never goes stale. */
  private readonly times = new WeakMap<Timeline, ResolvedTimes>();

  constructor(services: EligianServices) {
    super();
    this.comments = services.documentation.CommentProvider;

    // The configuration is only available once the client has initialized
    // (getConfiguration waits for that), so read it then and on every change.
    const configuration = services.shared.workspace.ConfigurationProvider;
    const ready = (configuration as { ready?: Promise<void> }).ready;
    ready
      ?.then(() => configuration.getConfiguration('eligian', 'inlayHints'))
      .then(settings => this.applySettings(settings))
      .catch(() => {});
    configuration.onConfigurationSectionUpdate(update => {
      if (update.section === 'eligian') {
        this.applySettings(update.configuration?.inlayHints);
      }
    });
  }

  /** Apply the `eligian.inlayHints` settings object. */
  applySettings(settings: unknown): void {
    const values = (settings ?? {}) as Record<string, unknown>;
    this.setParameterNameHints(values.parameterNames);
    this.setTimeHints({
      sequenceTimes: values.sequenceTimes !== false,
      staggerTimes: values.staggerTimes !== false,
      computedTimes: values.computedTimes !== false,
      timelineDuration: values.timelineDuration !== false,
    });
  }

  /** Turn the time hint kinds on or off (all on by default). */
  setTimeHints(settings: Partial<TimeHintSettings>): void {
    this.timeHints = { ...this.timeHints, ...settings };
  }

  /** Apply the `eligian.inlayHints.parameterNames` setting (unknown values keep the default). */
  setParameterNameHints(mode: unknown): void {
    this.mode = MODES.includes(mode as ParameterNameHints)
      ? (mode as ParameterNameHints)
      : 'literals';
  }

  override computeInlayHint(node: AstNode, acceptor: InlayHintAcceptor): void {
    if (isTimeline(node)) {
      this.computeTimeHints(node, acceptor);
      return;
    }
    if (this.mode === 'none' || !isOperationCall(node)) return;
    const signature = getCallSignature(node, this.comments);
    if (!signature) return;
    const textDocument = AstUtils.getDocument(node).textDocument;

    node.args.forEach((arg, index) => {
      const parameter = signature.parameters[index];
      const cst = arg.$cstNode;
      if (!parameter || !cst) return;
      // The controller name says what it is
      if (signature.kind === 'controller' && index === 0) return;
      if (this.mode === 'literals' && !isLiteral(arg)) return;
      if (isParameterReference(arg) && arg.parameter?.$refText === parameter.name) return;
      acceptor({
        position: textDocument.positionAt(cst.offset),
        label: `${parameter.name}:`,
        kind: InlayHintKind.Parameter,
        paddingRight: true,
      });
    });
  }

  /** Absolute times of sequence items, stagger blocks, computed `at` ranges and the timeline. */
  private computeTimeHints(timeline: Timeline, acceptor: InlayHintAcceptor): void {
    let times = this.times.get(timeline);
    if (!times) {
      times = resolveTimelineTimes(timeline);
      this.times.set(timeline, times);
    }
    const textDocument = AstUtils.getDocument(timeline).textDocument;
    const after = (node: AstNode | undefined, label: string) => {
      const cst = node?.$cstNode;
      if (!cst) return;
      acceptor({
        position: textDocument.positionAt(cst.end),
        label,
        kind: InlayHintKind.Type,
        paddingLeft: true,
      });
    };

    if (this.timeHints.timelineDuration && !timeline.duration && times.duration !== undefined) {
      const brace = timeline.$cstNode && GrammarUtils.findNodeForKeyword(timeline.$cstNode, '{');
      if (brace) {
        acceptor({
          position: textDocument.positionAt(brace.offset),
          label: `‹${seconds(times.duration)}›`,
          kind: InlayHintKind.Type,
          paddingRight: true,
          tooltip: 'Timeline duration: the end of its last event',
        });
      }
    }

    for (const event of timeline.events) {
      const spans = times.events.get(event);
      if (!spans || spans.length === 0) continue;
      if (isSequenceBlock(event)) {
        if (!this.timeHints.sequenceTimes) continue;
        for (const item of event.items) {
          const span = times.sequenceItems.get(item);
          // After the duration: `f() for 5s‹..›`, `for 7s‹..› [ ... ]` (inline items, idea #11)
          if (span) after(item.duration, range(span));
        }
      } else if (isStaggerBlock(event)) {
        if (!this.timeHints.staggerTimes) continue;
        const first = spans[0];
        const last = spans[spans.length - 1];
        after(event.duration, `‹${seconds(first.start)}..${seconds(last.end)} ×${spans.length}›`);
      } else if (isTimedEvent(event) && this.timeHints.computedTimes) {
        const timeRange = event.timeRange;
        // Plain `at 2s..5s` already shows its times
        const plain =
          timeRange?.start?.$type === 'TimeLiteral' &&
          timeRange.end?.$type === 'TimeLiteral' &&
          !timeRange.duration;
        if (!plain) after(timeRange, range(spans[0]));
      }
    }
  }
}
