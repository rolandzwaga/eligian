/**
 * Context Detection for Eligian Code Completion
 *
 * This module provides utilities for detecting the cursor context within an Eligian document.
 * The context determines which completion items should be shown (operations, actions, keywords, etc.).
 */

import { AstUtils, type CstNode, CstUtils, type LangiumDocument } from 'langium';
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
  isSystemPropertyReference,
  isTimeline,
  isTimelineEvent,
  type OperationCall,
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
  const eventAction = AstUtils.getContainerOfType(astNode, isEventActionDefinition);

  if (action || endableAction || inlineAction || eventAction) {
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
  document: LangiumDocument,
  offset: number,
  cstNode: CstNode | undefined,
  _eventAction: EventActionDefinition
): boolean {
  // If no CST node, can't determine position
  if (!cstNode) {
    return false;
  }

  // Get the text content of the current CST node
  const nodeText = cstNode.text;

  // Check if we're in a STRING token
  // The CST node should contain quotes
  if (!nodeText.includes('"') && !nodeText.includes("'")) {
    return false;
  }

  // Check if the CST node's range contains the cursor offset
  const nodeStart = cstNode.offset;
  const nodeEnd = cstNode.offset + cstNode.length;

  if (offset < nodeStart || offset > nodeEnd) {
    return false;
  }

  // Simple approach: Check if we're in a STRING token that comes BEFORE the "topic" keyword
  // or BEFORE the "action" keyword (whichever comes first).
  // This is the eventName string.
  const text = document.textDocument.getText();
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const lineText = text.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);

  // Find positions of keywords relative to cursor
  const cursorPosInLine = offset - lineStart;
  const topicPos = lineText.indexOf('topic');
  const actionPos = lineText.indexOf('action');

  // If cursor is before "topic" or "action", and we're in a STRING, we're in eventName
  const beforeTopic = topicPos === -1 || cursorPosInLine < topicPos;
  const beforeAction = actionPos === -1 || cursorPosInLine < actionPos;

  return beforeTopic && beforeAction;
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
  // If eventName is already set, we're not waiting for it
  if (eventAction.eventName) {
    return false;
  }

  // Check the text before cursor to see if it ends with "on event"
  const text = document.textDocument.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const textBeforeCursor = text.substring(lineStart, offset).trim();

  // Check if text ends with "on event" (possibly with whitespace)
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

  // Determine which parameter index by counting strings before cursor
  // Count string literals before cursor (each string = one parameter)
  const stringMatches = textInCall.match(/["']/g) || [];
  const parameterIndex = Math.floor(stringMatches.length / 2); // Each param has 2 quotes

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
