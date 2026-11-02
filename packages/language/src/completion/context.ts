/**
 * Context Detection for Eligian Code Completion
 *
 * This module provides utilities for detecting the cursor context within an Eligian document.
 * The context determines which completion items should be shown (operations, actions, keywords, etc.).
 */

import {
  type AstNode,
  AstUtils,
  type CstNode,
  CstUtils,
  GrammarUtils,
  isLeafCstNode,
  type LangiumDocument,
} from 'langium';
import type { Position } from 'vscode-languageserver-protocol';
import {
  type ActionDefinition,
  type EventActionDefinition,
  type ForStatement,
  isActionDefinition,
  isEndableActionDefinition,
  isEventActionDefinition,
  isForStatement,
  isInlineEndableAction,
  isOperationCall,
  isSequenceBlock,
  isSequenceItem,
  isStaggerBlock,
  isSystemPropertyReference,
  isTimeline,
  isTimelineEvent,
  isTimelineLifecycle,
  type OperationCall,
  type StaggerBlock,
  type Timeline,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

/**
 * Completion context information
 *
 * This interface captures all relevant context information needed to determine
 * which completions to show at a given cursor position.
 */
export interface CursorContext {
  /** True if cursor is inside any action body (regular, endable, or inline) */
  isInsideAction: boolean;

  /** True if cursor is inside a for loop body */
  isInsideLoop: boolean;

  /** True if cursor is inside a timeline block */
  isInsideTimeline: boolean;

  /** True if cursor is inside a timeline event */
  isInsideEvent: boolean;

  /** True if cursor is preceded by @@ (variable prefix) */
  isAfterVariablePrefix: boolean;

  /** If inside an operation call, contains the operation name */
  insideOperationCall?: string;

  /** The CST node at the cursor position */
  cstNode?: CstNode;

  /** The action definition containing the cursor (if any) */
  action?: ActionDefinition;

  /** The for loop containing the cursor (if any) */
  loop?: ForStatement;

  /** The timeline containing the cursor (if any) */
  timeline?: Timeline;

  /** The operation call containing the cursor (if any) */
  operationCall?: OperationCall;

  /** The event action definition containing the cursor (if any) */
  eventAction?: EventActionDefinition;

  /** True if cursor is in event name string of EventActionDefinition */
  isInEventNameString: boolean;

  /** True if cursor is after 'on event' keyword (before the string) */
  isAfterEventKeyword: boolean;

  /** True if cursor is in addController() first parameter (controller name) */
  isInControllerName: boolean;

  /** Controller name if cursor is in addController() and controller is known */
  controllerName?: string;

  /** Parameter index if cursor is in addController() parameters (0 = controller name, 1 = first param, etc.) */
  controllerParameterIndex?: number;
}

/**
 * Detect cursor context for code completion
 *
 * This function analyzes the AST at the given position to determine what completions
 * should be shown. It uses Langium's AstUtils and CstUtils to traverse the AST.
 *
 * @param document - The Langium document
 * @param position - The cursor position
 * @returns CompletionContext with flags indicating which completions to show
 */
export function detectContext(document: LangiumDocument, position: Position): CursorContext {
  // Convert position to offset
  const offset = document.textDocument.offsetAt(position);

  // Find the CST node at the cursor position
  const rootCstNode = document.parseResult.value.$cstNode;
  let cstNode = rootCstNode ? CstUtils.findLeafNodeAtOffset(rootCstNode, offset) : undefined;

  // If no leaf node found (e.g., cursor in whitespace), try to find declaration node
  if (!cstNode && rootCstNode) {
    cstNode = CstUtils.findDeclarationNodeAtOffset(rootCstNode, offset);
  }

  // If still no node found, try to find the node BEFORE the cursor
  // This handles the case where cursor is in whitespace (e.g., empty line in action block)
  if (!cstNode && rootCstNode) {
    cstNode = CstUtils.findLeafNodeBeforeOffset(rootCstNode, offset);
  }

  let astNode = cstNode?.astNode;

  // If still no AST node, use the root AST node as last resort
  // This will at least return valid (but empty) context
  if (!astNode) {
    astNode = document.parseResult.value;
  }

  // In whitespace after a complete timeline event the node before the cursor is
  // that event's closing token, but the cursor is in the timeline body, where
  // the next event goes (idea #13: event snippets there, no operations).
  const enclosingEvent = astNode
    ? AstUtils.getContainerOfType(astNode, isTimelineEvent)
    : undefined;
  if (
    enclosingEvent &&
    isTimeline(enclosingEvent.$container) &&
    isEventClosedBefore(enclosingEvent, offset)
  ) {
    astNode = enclosingEvent.$container;
  }

  // Initialize context with all flags false
  const context: CursorContext = {
    isInsideAction: false,
    isInsideLoop: false,
    isInsideTimeline: false,
    isInsideEvent: false,
    isAfterVariablePrefix: false,
    isInEventNameString: false,
    isAfterEventKeyword: false,
    isInControllerName: false,
    cstNode,
  };

  // If no AST node found, return empty context
  if (!astNode) {
    return context;
  }

  // Detect if inside an action (regular, endable, inline, or event action)
  const action = AstUtils.getContainerOfType(astNode, isActionDefinition);
  const endableAction = AstUtils.getContainerOfType(astNode, isEndableActionDefinition);
  const inlineAction = AstUtils.getContainerOfType(astNode, isInlineEndableAction);
  // `on enter [ ... ]` / `on leave [ ... ]` blocks are operation lists too (audit idea #6)
  const lifecycleBlock = AstUtils.getContainerOfType(astNode, isTimelineLifecycle);
  // Idea #11: a sequence's `each` / `then` blocks and inline item blocks
  const sequenceOps = inSequenceOperationBlock(astNode, offset);
  const eventAction = AstUtils.getContainerOfType(astNode, isEventActionDefinition);

  // Inline stagger operation blocks (`stagger ... for 1s [ ... ] [ ... ]`) are operation
  // lists like inline endable action blocks.
  const staggerBlock = AstUtils.getContainerOfType(astNode, isStaggerBlock);
  const inStaggerOps =
    staggerBlock !== undefined && isInStaggerOperationBlock(staggerBlock, offset);

  if (
    action ||
    endableAction ||
    inlineAction ||
    lifecycleBlock ||
    sequenceOps ||
    eventAction ||
    inStaggerOps
  ) {
    context.isInsideAction = true;
    // Only store the action if it's a named action (not inline)
    if (action || endableAction) {
      context.action = (action || endableAction) as ActionDefinition;
    }
  }

  // Detect if inside a for loop
  const loop = AstUtils.getContainerOfType(astNode, isForStatement);
  if (loop) {
    context.isInsideLoop = true;
    context.loop = loop;
  }

  // Detect if inside a timeline
  const timeline = AstUtils.getContainerOfType(astNode, isTimeline);
  if (timeline) {
    context.isInsideTimeline = true;
    context.timeline = timeline;
  }

  // Detect if inside a timeline event
  const timelineEvent = AstUtils.getContainerOfType(astNode, isTimelineEvent);
  if (timelineEvent) {
    context.isInsideEvent = true;
  }

  // Detect if inside an operation call
  const operationCall = AstUtils.getContainerOfType(astNode, isOperationCall);
  if (operationCall) {
    context.insideOperationCall = getOperationCallName(operationCall);
    context.operationCall = operationCall;
  }

  // Detect if cursor is preceded by @@ or inside SystemPropertyReference
  context.isAfterVariablePrefix = detectVariablePrefix(document, offset, astNode);

  // Detect event action context (already detected above, just store additional context)
  if (eventAction) {
    context.eventAction = eventAction;
    // Check if cursor is in the eventName string (between quotes after "on event")
    context.isInEventNameString = detectEventNameString(document, offset, cstNode, eventAction);

    // Check if cursor is after "on event" keyword (before the string)
    context.isAfterEventKeyword = detectAfterEventKeyword(document, offset, eventAction);
  }

  // Detect controller completion context (Feature 035 US3)
  if (operationCall) {
    const controllerContext = detectControllerContext(document, offset, cstNode, operationCall);
    context.isInControllerName = controllerContext.isInControllerName;
    context.controllerName = controllerContext.controllerName;
    context.controllerParameterIndex = controllerContext.parameterIndex;
  }

  return context;
}

/**
 * Detect if cursor is preceded by @@ (variable prefix) or inside SystemPropertyReference
 *
 * This function checks if:
 * 1. We're inside a SystemPropertyReference AST node (typing @@foo<cursor>)
 * 2. The two characters before the cursor are "@@" (just typed @@<cursor>)
 *
 * Used to trigger variable name completions.
 *
 * @param document - The Langium document
 * @param offset - The cursor offset
 * @param astNode - The AST node at the cursor position
 * @returns True if cursor is in a position to complete variables
 */
function detectVariablePrefix(document: LangiumDocument, offset: number, astNode: any): boolean {
  // Check if we're inside a SystemPropertyReference AST node
  const systemPropRef = AstUtils.getContainerOfType(astNode, isSystemPropertyReference);
  if (systemPropRef) {
    return true;
  }

  // Check if the text immediately before the cursor is "@@"
  const text = document.textDocument.getText();
  if (offset < 2) {
    return false;
  }

  const prefix = text.substring(offset - 2, offset);
  return prefix === '@@';
}

/**
 * Detect if cursor is in event name string of EventActionDefinition
 *
 * This function checks if the cursor is positioned in the string literal
 * that contains the event name (e.g., on event "|<cursor>" or on event "cl|<cursor>").
 *
 * Used to trigger event name completions.
 *
 * @param document - The Langium document
 * @param offset - The cursor offset
 * @param cstNode - The CST node at the cursor position
 * @param eventAction - The EventActionDefinition containing the cursor
 * @returns True if cursor is in a position to complete event names
 */
function detectEventNameString(
  _document: LangiumDocument,
  offset: number,
  cstNode: CstNode | undefined,
  eventAction: EventActionDefinition
): boolean {
  const actionCst = eventAction.$cstNode;
  if (!actionCst) {
    return false;
  }

  // Normal case: the eventName STRING was parsed. The cursor must be strictly
  // inside its quotes - body strings, topic strings and anything else never
  // qualify.
  const nameNode = GrammarUtils.findNodeForProperty(actionCst, 'eventName');
  if (nameNode) {
    return offset > nameNode.offset && offset < nameNode.end;
  }

  // Recovery case (empty / just-deleted / unterminated name): accept a string
  // leaf at the cursor that sits directly after the `event` keyword, i.e. before
  // any `topic` / `action` keyword.
  if (!cstNode || !/^["']/.test(cstNode.text)) {
    return false;
  }
  if (offset <= cstNode.offset || offset > cstNode.end) {
    return false;
  }
  const eventKeyword = GrammarUtils.findNodesForKeyword(actionCst, 'event')[0];
  if (!eventKeyword || eventKeyword.end > cstNode.offset) {
    return false;
  }
  const between = actionCst.root.fullText.substring(eventKeyword.end, cstNode.offset);
  return between.trim() === '';
}

/**
 * Detect if cursor is after "on event" keyword (before the string)
 *
 * This handles the case: `on event |` (cursor after "event" keyword, before string)
 */
function detectAfterEventKeyword(
  document: LangiumDocument,
  offset: number,
  eventAction: EventActionDefinition
): boolean {
  // NOTE: We intentionally do NOT early-return when eventAction.eventName is
  // already set. The cursor may be positioned right after "on event" to replace
  // an existing event name, in which case completions must still be offered. The
  // check below gates this case by inspecting the text between the `event`
  // keyword and the cursor.
  const text = document.textDocument.getText();

  const eventKeyword = eventAction.$cstNode
    ? GrammarUtils.findNodesForKeyword(eventAction.$cstNode, 'event')[0]
    : undefined;
  if (eventKeyword) {
    // Only whitespace may sit between the `event` keyword and the cursor; this
    // also excludes cursors in the action body.
    return offset >= eventKeyword.end && text.substring(eventKeyword.end, offset).trim() === '';
  }

  // No keyword node (heavily broken input): fall back to the line text
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const textBeforeCursor = text.substring(lineStart, offset).trim();
  return /\bon\s+event\s*$/.test(textBeforeCursor);
}

/**
 * Detect if cursor is in addController() call parameters
 *
 * This function determines:
 * 1. If we're inside an addController() operation call
 * 2. Which parameter index the cursor is at (0 = controller name, 1 = first param, etc.)
 * 3. What controller name is being used (if known)
 *
 * Used to trigger controller name and label ID completions.
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US3
 *
 * @param document - The Langium document
 * @param offset - The cursor offset
 * @param cstNode - The CST node at the cursor position
 * @param operationCall - The OperationCall containing the cursor
 * @returns Controller context information
 */
function detectControllerContext(
  document: LangiumDocument,
  offset: number,
  cstNode: CstNode | undefined,
  operationCall: OperationCall
): {
  isInControllerName: boolean;
  controllerName?: string;
  parameterIndex?: number;
} {
  // Check if this is an addController() call
  const operationName = getOperationCallName(operationCall);
  if (operationName !== 'addController') {
    return { isInControllerName: false };
  }

  // Get all arguments from the operation call
  const args = operationCall.args || [];

  // If no CST node, can't determine precise position
  if (!cstNode) {
    return { isInControllerName: false };
  }

  // Get text content to check cursor position
  const text = document.textDocument.getText();
  const callStart = operationCall.$cstNode?.offset || 0;
  const textInCall = text.substring(callStart, offset);

  // Check if cursor is in a STRING token (parameter value)
  const nodeText = cstNode.text;
  const isInString = nodeText.includes('"') || nodeText.includes("'");

  // Check if cursor is right after opening parenthesis (before any string literals)
  // e.g., "addController(|" where | is cursor
  const isAfterOpenParen = textInCall.trim().endsWith('(');

  if (!isInString && !isAfterOpenParen) {
    return { isInControllerName: false };
  }

  // Determine which parameter index by counting the COMPLETE quoted-string
  // arguments before the cursor. B33: counting raw quote characters and halving
  // (`match(/["']/g)`) miscounts when a string contains an embedded or escaped
  // quote — e.g. addController("O'Brien", | counts 4 quotes → index 2 instead of
  // 1. Matching whole string literals (with escape handling) instead means each
  // closed string is exactly one consumed parameter, and the in-progress string
  // (the unterminated trailing quote) is correctly not counted.
  const completedStrings = textInCall.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) || [];
  const parameterIndex = completedStrings.length;

  // First parameter (index 0) is controller name
  const isInControllerName = parameterIndex === 0;

  // Try to extract controller name from first argument (if it's a StringLiteral)
  let controllerName: string | undefined;
  if (args.length > 0 && args[0].$type === 'StringLiteral') {
    controllerName = (args[0] as any).value;
  }

  return {
    isInControllerName,
    controllerName,
    parameterIndex,
  };
}

/**
 * True when `offset` lies inside the start or end operation block of an inline stagger block:
 * the `with action()` form has no blocks, and in the block form the offset must be past the
 * first `[` that belongs to the stagger block itself (an items array literal has its own CST).
 */
/**
 * True when `offset` lies after a complete timeline event: there is text between
 * the event and the cursor, and the event's last token closes the event itself
 * (the `]` of its inline block, the `)` of its action call, the `}` of its
 * sequence, for or if). An unclosed block (`at 0s..1s [ selectElement("#a") `)
 * ends with a token of an inner node, so the cursor is still inside it.
 */
function isEventClosedBefore(event: AstNode, offset: number): boolean {
  const cst = event.$cstNode;
  if (!cst || offset <= cst.end) return false;
  let last: CstNode | undefined;
  for (const node of CstUtils.streamCst(cst)) {
    if (isLeafCstNode(node) && !node.hidden) last = node;
  }
  if (!last || !['}', ']', ')'].includes(last.text)) return false;
  const owner = last.astNode;
  return owner === event || owner.$container === event;
}

function isInStaggerOperationBlock(stagger: StaggerBlock, offset: number): boolean {
  if (stagger.actionCall !== undefined || !stagger.$cstNode) return false;
  return CstUtils.streamCst(stagger.$cstNode).some(
    node => node.text === '[' && node.astNode === stagger && node.offset < offset
  );
}

/**
 * Idea #11: whether the cursor at `offset` is in an operation list of a
 * sequence: an inline item's `[..]` blocks, or the block's `each [..]` /
 * `then [..]` (before its `{`). Offset-based, like the stagger blocks above,
 * so an empty `[ | ]` block counts too.
 */
function inSequenceOperationBlock(node: AstNode, offset: number): boolean {
  const opensBefore = (owner: AstNode) =>
    owner.$cstNode !== undefined &&
    CstUtils.streamCst(owner.$cstNode).some(
      cst => cst.text === '[' && cst.astNode === owner && cst.offset < offset
    );
  const item = AstUtils.getContainerOfType(node, isSequenceItem);
  if (item) return item.actionCall === undefined && opensBefore(item);
  const block = AstUtils.getContainerOfType(node, isSequenceBlock);
  if (!block?.$cstNode) return false;
  const brace = CstUtils.streamCst(block.$cstNode).find(
    cst => cst.text === '{' && cst.astNode === block
  );
  return opensBefore(block) && (brace === undefined || offset <= brace.offset);
}
