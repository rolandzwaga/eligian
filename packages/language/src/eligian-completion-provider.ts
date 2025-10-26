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
import { getOperationCompletions } from './completion/operations.js';
import { getVariableCompletions } from './completion/variables.js';
import {
  CompletionContextType,
  detectCompletionContext as detectCSSCompletionContext,
} from './css/context-detection.js';
import { CSSCompletionProvider } from './css/css-completion.js';
import type { EligianServices } from './eligian-module.js';

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
    // Search backwards for opening quote
    for (let i = offset - 1; i >= 0; i--) {
      const char = text[i];
      if (char === '\n' || char === '\r') break;
      if (char === '"' || char === "'") {
        // Found opening quote, now search forwards for closing quote
        const quoteChar = char;
        for (let j = offset; j < text.length; j++) {
          const c = text[j];
          if (c === '\n' || c === '\r') return false;
          if (c === quoteChar) return true; // Found matching closing quote
        }
        return false;
      }
    }
    return false;
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
    } catch (error) {
      // Graceful error handling - log warning but don't break completion
      console.warn('Error in Eligian completion provider:', error);
      // Fallback to default completion
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
}
