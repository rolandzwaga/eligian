/**
 * Event action completion branches for {@link EligianCompletionProvider}
 * (Feature 030: event action code completion).
 *
 * Handles the three event contexts that occur before the operation/variable
 * branches: inside an event-name string, after the `on event` keyword, and
 * inside an event topic string. Extracted verbatim from the provider's
 * `completionFor` (W3 decomposition).
 */

import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import type { CursorContext } from './context.js';
import { getEventNameCompletions, getEventTopicCompletions } from './events.js';
import type { CompletionBranchResult } from './handler-result.js';

/**
 * Handle event-name / event-keyword / event-topic completion contexts.
 *
 * @returns `done` when items were added and no super call is needed,
 * `finalize-noop` when the caller must finalize via `super.completionFor` with
 * a no-op acceptor, or `fallthrough` when no event context applied.
 */
export function handleEventCompletion(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor,
  cursorContext: CursorContext
): CompletionBranchResult {
  const document = context.document;

  // T044: Check if we're completing an event name in EventActionDefinition
  // FEATURE 030 - Event Action Code Completion
  //
  // Scenario 2: Inside event name string (CHECK THIS FIRST - more specific)
  // Trigger: on event "|<cursor>" or on event "cl|<cursor>"
  //
  // Use context detection instead of relying on next.property, since Langium
  // may not consistently set next.property='eventName' when cursor is inside
  // an empty string or after deleting text.
  if (cursorContext.isInEventNameString) {
    const eventNameCompletions = getEventNameCompletions(context);

    // Get the EventActionDefinition to replace the entire line
    const eventAction = cursorContext.eventAction;

    if (!eventAction?.$cstNode) {
      // Fallback: provide just event names without skeleton generation
      const stringStartOffset = context.tokenOffset + 1; // Skip opening quote
      const start = document.textDocument.positionAt(stringStartOffset);
      const end = context.position;
      const fallbackRange = { start, end };

      for (const item of eventNameCompletions) {
        const simpleItem: CompletionItem = {
          label: item.label,
          kind: item.kind,
          detail: 'Event name only (no skeleton)',
          documentation: item.documentation,
          sortText: item.sortText,
          textEdit: {
            range: fallbackRange,
            newText: item.label,
          },
        };
        acceptor(context, simpleItem);
      }
      return { status: 'done' };
    }

    // Calculate range INSIDE the string (for VS Code to show completions)
    const stringStartOffset = context.tokenOffset + 1; // Skip opening quote
    const stringStart = document.textDocument.positionAt(stringStartOffset);
    const stringEnd = context.position;
    const stringRange = { start: stringStart, end: stringEnd };

    // Calculate range for entire EventActionDefinition (to replace with skeleton)
    const actionStart = eventAction.$cstNode.offset;
    const actionEnd = eventAction.$cstNode.end;
    const actionStartPos = document.textDocument.positionAt(actionStart);
    const actionEndPos = document.textDocument.positionAt(actionEnd);

    // Add completions that replace entire EventActionDefinition with skeleton
    // Use stringRange for filtering but replace the entire action
    for (const item of eventNameCompletions) {
      const fullSkeleton = item.insertText || '';

      const completionItem: CompletionItem = {
        label: item.label,
        kind: item.kind,
        detail: item.detail,
        documentation: item.documentation,
        sortText: item.sortText,
        filterText: item.label, // Match against event name only
        insertTextFormat: item.insertTextFormat, // Snippet format
        // Use two separate edits: delete action, insert skeleton
        additionalTextEdits: [
          {
            // Delete the entire EventActionDefinition
            range: { start: actionStartPos, end: actionEndPos },
            newText: '',
          },
          {
            // Insert skeleton at action start (without snippet - additionalTextEdits don't support it)
            range: { start: actionStartPos, end: actionStartPos },
            newText: fullSkeleton.replace(/\$\d+/g, ''), // Strip snippet placeholders
          },
        ],
        textEdit: {
          // Delete string content - let additionalTextEdits handle everything
          range: stringRange,
          newText: '',
        },
      };
      acceptor(context, completionItem);
    }

    // Caller finalizes via super.completionFor with a no-op acceptor to trigger
    // Langium's completion finalization without adding any default completions.
    return { status: 'finalize-noop' };
  }

  // Scenario 1: After typing "on event" (without quotes)
  // Trigger: on event |<cursor>
  // Shows event names and inserts them enclosed in quotes: "event-name"
  if (cursorContext.isAfterEventKeyword) {
    const eventNameCompletions = getEventNameCompletions(context);

    // Strip "on event " prefix from skeleton since user already typed it
    for (const item of eventNameCompletions) {
      const fullSkeleton = item.insertText || '';
      // Remove "on event " prefix (9 characters)
      const skeletonWithoutPrefix = fullSkeleton.replace(/^on event /, '');

      const modifiedItem: CompletionItem = {
        ...item,
        insertText: skeletonWithoutPrefix,
        insertTextFormat: item.insertTextFormat, // Preserve snippet format for $0 placeholder
      };

      acceptor(context, modifiedItem);
    }

    // Caller finalizes via super.completionFor with a no-op acceptor.
    return { status: 'finalize-noop' };
  }

  // T044: Check if we're completing an event topic in EventActionDefinition
  // Trigger: topic "|<cursor>" or topic "na|<cursor>"
  if (next.type === 'EventActionDefinition' && next.property === 'eventTopic') {
    const topicCompletions = getEventTopicCompletions(context);
    for (const item of topicCompletions) {
      acceptor(context, item);
    }
    // Return early - we've provided all topic completions
    return { status: 'done' };
  }

  return { status: 'fallthrough' };
}
