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
  type ForStatement,
  isActionDefinition,
  isEndableActionDefinition,
  isForStatement,
  isInlineEndableAction,
  isOperationCall,
  isSystemPropertyReference,
  isTimeline,
  isTimelineEvent,
  type OperationCall,
  type Timeline,
} from '../generated/ast.js';

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
    cstNode,
  };

  // If no AST node found, return empty context
  if (!astNode) {
    return context;
  }

  // Detect if inside an action (regular, endable, or inline)
  const action = AstUtils.getContainerOfType(astNode, isActionDefinition);
  const endableAction = AstUtils.getContainerOfType(astNode, isEndableActionDefinition);
  const inlineAction = AstUtils.getContainerOfType(astNode, isInlineEndableAction);

  if (action || endableAction || inlineAction) {
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
    context.insideOperationCall = operationCall.operationName;
    context.operationCall = operationCall;
  }

  // Detect if cursor is preceded by @@ or inside SystemPropertyReference
  context.isAfterVariablePrefix = detectVariablePrefix(document, offset, astNode);

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
