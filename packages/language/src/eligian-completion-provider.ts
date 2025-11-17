/**
 * Eligian Completion Provider
 *
 * This is the main completion provider for Eligian DSL. It orchestrates
 * all completion logic based on cursor context, delegating to specialized
 * completion modules for operations, actions, keywords, etc.
 */

import type { MaybePromise } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import { type CompletionAcceptor, DefaultCompletionProvider, type NextFeature } from 'langium/lsp';
import type { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { getActionCompletions } from './completion/actions.js';
import { detectContext } from './completion/context.js';
import { getEventNameCompletions, getEventTopicCompletions } from './completion/events.js';
import { getOperationCompletions } from './completion/operations.js';
import { getVariableCompletions } from './completion/variables.js';
import {
  CompletionContextType,
  detectCompletionContext as detectCSSCompletionContext,
} from './css/context-detection.js';
import { CSSCompletionProvider } from './css/css-completion.js';
import type { EligianServices } from './eligian-module.js';
import { isOffsetInStringLiteral } from './utils/string-utils.js';

/**
 * Eligian-specific completion provider
 *
 * Extends Langium's DefaultCompletionProvider and adds custom completion logic
 * based on Eligian DSL syntax and Eligius operation metadata.
 */
export class EligianCompletionProvider extends DefaultCompletionProvider {
  private readonly cssCompletionProvider: CSSCompletionProvider;
  private readonly services: EligianServices;

  constructor(services: EligianServices) {
    super(services);
    this.services = services;
    this.cssCompletionProvider = new CSSCompletionProvider();
  }

  /**
   * Check if cursor is inside a string literal
   */
  private isCursorInString(text: string, offset: number): boolean {
    return isOffsetInStringLiteral(text, offset);
  }

  /**
   * Main completion entry point
   *
   * This method is called by Langium when the user requests completions.
   * We detect the cursor context and can add custom completions before/after
   * calling the default provider.
   *
   * @param context - Langium completion context
   * @param next - Next parser element to complete
   * @param acceptor - Function to add completion items
   * @returns Completion items or void
   */
  protected override completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor
  ): MaybePromise<void> {
    try {
      // Get document and position from context
      const document = context.document;

      // NOTE: JSDoc completion is now handled in getCompletion() above

      // Use tokenOffset to detect context, as this points to the start of the token being completed
      // For @@loop<cursor>, tokenOffset points to 'l' in 'loop', which is inside SystemPropertyReference
      const tokenPosition = document.textDocument.positionAt(context.tokenOffset);
      const cursorContext = detectContext(document, tokenPosition);

      // Check if we're completing the 'name' property of SystemPropertyReference
      // This handles @@<cursor> and @@loop<cursor> cases
      if (cursorContext.isAfterVariablePrefix) {
        const variableCompletions = getVariableCompletions(context, cursorContext);
        for (const item of variableCompletions) {
          acceptor(context, item);
        }
        // Don't call default completions for SystemPropertyReference names
        return;
      }

      // If inside an action body, provide operation and action completions
      // BUT only if we're in a statement position, NOT inside an expression (like operation parameters)
      //
      // When cursor is inside an OperationCall node:
      // - If completing the operationName property (e.g., "se<cursor>"), show operations (statement position)
      // - If completing arguments/parameters (e.g., "selectElement(<cursor>)"), DON'T show operations (expression position)
      const isCompletingOperationName = next.property === 'operationName';
      const isInsideArguments = cursorContext.insideOperationCall && !isCompletingOperationName;

      // Get custom action completions once to reuse for both adding and filtering
      const actionCompletions = getActionCompletions(document);
      const actionNames = new Set(
        actionCompletions.map(a => a.insertText || a.label.replace('action: ', ''))
      );

      // Create a filtering acceptor FIRST, before we add any completions
      // This will wrap ALL completion additions (both ours and default provider's)
      const filteringAcceptor: CompletionAcceptor = (ctx, item) => {
        // Filter out break/continue keywords when not inside a loop
        if (!cursorContext.isInsideLoop) {
          if (item.label === 'break' || item.label === 'continue') {
            return; // Skip these keywords
          }
        }

        // Filter out action names from default completions
        // (We already added them with "action:" prefix above)
        if (item.label && actionNames.has(item.label)) {
          return; // Skip - we've already added this action with proper prefix
        }

        // Filter out operations and actions when inside operation arguments (expression position)
        if (isInsideArguments) {
          // CompletionItemKind.Function (3) = operations
          // CompletionItemKind.Method (2) = custom actions
          if (item.kind === 3 || item.kind === 2) {
            return; // Skip operations/actions in expression position
          }

          // Push literals (true, false, null) to the bottom when inside arguments
          // CompletionItemKind.Constant (14) or CompletionItemKind.Value (12)
          if (
            item.kind === 14 ||
            item.kind === 12 ||
            item.label === 'true' ||
            item.label === 'false' ||
            item.label === 'null'
          ) {
            // Modify sortText to put literals at the bottom
            item.sortText = `9_${item.label}`; // 9_ prefix puts them last
          }

          // Parameters from default provider (e.g., 'items' from action parameters)
          // CompletionItemKind.Reference (18) = parameters from default provider
          // Override their sortText to put them between variables and literals
          if (item.kind === 18 && item.detail === 'Parameter') {
            item.sortText = `2_${item.sortText || ''}`; // Parameters go between @@vars (0_,1_) and literals (9_)
          }
        }

        // Accept all other completions
        acceptor(ctx, item);
      };

      // Check if we're in a CSS completion context (className parameters or selectors)
      const cssContext = detectCSSCompletionContext(context);
      if (cssContext !== CompletionContextType.None) {
        const cssRegistry = this.services.css.CSSRegistry;
        const documentUri = document.uri.toString();

        const classes = cssRegistry.getClassesForDocument(documentUri);
        const ids = cssRegistry.getIDsForDocument(documentUri);

        if (cssContext === CompletionContextType.ClassName) {
          // Check if cursor is inside quotes or between parens
          const text = context.document.textDocument.getText();
          const offset = context.offset;
          const needsQuotes = !this.isCursorInString(text, offset);

          // ALWAYS add CSS completions when in className context, regardless of next.type
          // This ensures they're added for ALL Langium completion queries
          this.cssCompletionProvider.provideCSSClassCompletions(
            context,
            classes,
            acceptor,
            needsQuotes
          );

          // ALWAYS return early for className context - don't let super process anything
          // Calling super seems to clear/filter our completions
          return;
        } else if (cssContext === CompletionContextType.SelectorClass) {
          this.cssCompletionProvider.provideSelectorCompletions(
            context,
            classes,
            ids,
            'class',
            acceptor
          );
          // Call super with a no-op acceptor to finalize completion without adding more items
          const noOpAcceptor = () => {
            /* Don't add any more items */
          };
          return super.completionFor(context, next, noOpAcceptor);
        } else if (cssContext === CompletionContextType.SelectorID) {
          this.cssCompletionProvider.provideSelectorCompletions(
            context,
            classes,
            ids,
            'id',
            acceptor
          );
          // Call super with a no-op acceptor to finalize completion without adding more items
          const noOpAcceptor = () => {
            /* Don't add any more items */
          };
          return super.completionFor(context, next, noOpAcceptor);
        }
      }

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

        if (!eventAction || !eventAction.$cstNode) {
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
          return;
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

        // Call super with a NO-OP acceptor to trigger Langium's completion finalization
        // without adding any default completions
        const noOpAcceptor = () => {
          /* Block all default completions */
        };
        return super.completionFor(context, next, noOpAcceptor);
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

        // Call super with a NO-OP acceptor to trigger Langium's completion finalization
        const noOpAcceptor = () => {
          /* Block all default completions */
        };
        return super.completionFor(context, next, noOpAcceptor);
      }

      // T044: Check if we're completing an event topic in EventActionDefinition
      // Trigger: topic "|<cursor>" or topic "na|<cursor>"
      if (next.type === 'EventActionDefinition' && next.property === 'eventTopic') {
        const topicCompletions = getEventTopicCompletions(context);
        for (const item of topicCompletions) {
          acceptor(context, item);
        }
        // Return early - we've provided all topic completions
        return;
      }

      if (cursorContext.isInsideAction && !isInsideArguments) {
        // Add operation completions
        const operationCompletions = getOperationCompletions(context);
        for (const item of operationCompletions) {
          filteringAcceptor(context, item);
        }

        // Add custom action completions
        for (const item of actionCompletions) {
          filteringAcceptor(context, item);
        }
      }

      // Provide variable completions in two cases:
      // 1. After typing @@ (explicit variable reference)
      // 2. Inside operation arguments (proactive suggestions)
      const shouldShowVariables = cursorContext.isAfterVariablePrefix || isInsideArguments;

      if (shouldShowVariables && !cursorContext.isAfterVariablePrefix) {
        // When proactively suggesting in operation arguments (not after @@),
        // prepend @@ to the completion labels so users know it's a variable reference
        const variableCompletions = getVariableCompletions(context, cursorContext);
        for (const item of variableCompletions) {
          // Prepend @@ to make it clear this is a variable reference
          const labelWithPrefix = `@@${item.label}`;

          // Determine sort order: loop variable first, then system properties
          const isLoopVariable = item.detail?.includes('loop variable');
          const sortPrefix = isLoopVariable ? '0_' : '1_';

          acceptor(context, {
            ...item,
            label: labelWithPrefix,
            // Update filter text so typing "item" will match "@@item"
            filterText: item.label,
            // Insert the full @@item text
            insertText: labelWithPrefix,
            sortText: `${sortPrefix}${item.label}`, // Loop variable first (0_), then system properties (1_)
          });
        }
      } else if (cursorContext.isAfterVariablePrefix) {
        // After @@, just show the variable names (without @@ prefix)
        const variableCompletions = getVariableCompletions(context, cursorContext);
        for (const item of variableCompletions) {
          acceptor(context, item);
        }
      }

      // If inside timeline, provide timeline-specific completions
      if (cursorContext.isInsideTimeline && !cursorContext.isInsideEvent) {
        // TODO: Call timeline events completion module
        // completeTimelineEvents(context, acceptor, cursorContext);
      }

      // IMPORTANT: Don't call super if this is an OperationCall operationName completion
      // We've already added all operations and actions with proper prefixes above
      // Calling super would add duplicate action names from cross-reference completion
      if (next.type === 'OperationCall' && next.property === 'operationName') {
        // Don't call super - we've already provided all completions
        return;
      }

      // Fallback to default Langium completions (keywords, grammar-based)
      // Use filtering acceptor to prevent invalid keywords and duplicates
      return super.completionFor(context, next, filteringAcceptor);
    } catch (_error) {
      // Graceful error handling - fallback to default completion
      return super.completionFor(context, next, acceptor);
    }
  }

  /**
   * Create a completion item
   *
   * Helper method to create standardized completion items.
   *
   * @param label - The text to insert
   * @param kind - Completion item kind (Function, Variable, etc.)
   * @param detail - Short description shown in completion list
   * @param documentation - Full documentation shown in hover
   * @returns CompletionItem
   */
  protected createCompletionItem(
    label: string,
    kind: CompletionItemKind,
    detail?: string,
    documentation?: string
  ): CompletionItem {
    const item: CompletionItem = {
      label,
      kind,
    };

    if (detail) {
      item.detail = detail;
    }

    if (documentation) {
      item.documentation = documentation;
    }

    return item;
  }

  /**
   * Override fillCompletionItem to add debugging
   */
  protected override fillCompletionItem(
    context: CompletionContext,
    item: any
  ): CompletionItem | undefined {
    return super.fillCompletionItem(context, item);
  }
}
