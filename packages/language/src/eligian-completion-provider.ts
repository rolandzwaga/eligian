/**
 * Eligian Completion Provider
 *
 * This is the main completion provider for Eligian DSL. It orchestrates
 * all completion logic based on cursor context, delegating to specialized
 * completion modules for operations, actions, keywords, etc.
 *
 * The large self-contained context branches (CSS, HTML, event, and the
 * string-literal controller/label-ID handling) live in sibling
 * `completion/*-completion-handler.ts` modules and are invoked here; this class
 * keeps the orchestration and the `super.completionFor` finalization calls (W3
 * decomposition).
 */

import type { LangiumDocument, MaybePromise } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import { type CompletionAcceptor, DefaultCompletionProvider, type NextFeature } from 'langium/lsp';
import {
  type CancellationToken,
  type CompletionItem,
  CompletionItemKind,
  type CompletionList,
  type CompletionParams,
} from 'vscode-languageserver';
import { getActionCompletions } from './completion/actions.js';
import { detectContext } from './completion/context.js';
import { resolveStringLiteralCompletion } from './completion/controller-completion-handler.js';
import { handleCssCompletion } from './completion/css-completion-handler.js';
import { handleEventCompletion } from './completion/event-completion-handler.js';
import { handleHtmlCompletion } from './completion/html-completion-handler.js';
import { HTMLElementCompletionProvider } from './completion/html-elements.js';
import { getOperationCompletions } from './completion/operations.js';
import { getVariableCompletions } from './completion/variables.js';
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
  private readonly htmlCompletionProvider: HTMLElementCompletionProvider;
  private readonly services: EligianServices;

  constructor(services: EligianServices) {
    super(services);
    this.services = services;
    this.cssCompletionProvider = new CSSCompletionProvider();
    this.htmlCompletionProvider = new HTMLElementCompletionProvider();
  }

  /**
   * Override getCompletion to detect controller context BEFORE calling super
   *
   * This is necessary because Langium's default completionFor() does NOT
   * provide completions for string literal (terminal) positions. For controller
   * completions inside addController("..."), we must detect and handle them here.
   *
   * Feature 035 US3: Controller autocomplete
   */
  override async getCompletion(
    document: LangiumDocument,
    params: CompletionParams,
    cancelToken?: CancellationToken
  ): Promise<CompletionList | undefined> {
    // Controller name / label ID string-literal completions (Feature 035 US3)
    const stringLiteralCompletion = resolveStringLiteralCompletion(document, params, this.services);
    if (stringLiteralCompletion !== null) {
      return stringLiteralCompletion;
    }

    // Otherwise, fallback to default Langium completion
    return super.getCompletion(document, params, cancelToken);
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
          // Function = operations, Method = custom actions
          if (
            item.kind === CompletionItemKind.Function ||
            item.kind === CompletionItemKind.Method
          ) {
            return; // Skip operations/actions in expression position
          }

          // Push literals (true, false, null) to the bottom when inside arguments
          if (
            item.kind === CompletionItemKind.Constant ||
            item.kind === CompletionItemKind.Value ||
            item.label === 'true' ||
            item.label === 'false' ||
            item.label === 'null'
          ) {
            // Modify sortText to put literals at the bottom
            item.sortText = `9_${item.label}`; // 9_ prefix puts them last
          }

          // Parameters from default provider (e.g., 'items' from action parameters)
          // Reference = parameters from default provider; override their sortText
          // to put them between variables and literals
          if (item.kind === CompletionItemKind.Reference && item.detail === 'Parameter') {
            item.sortText = `2_${item.sortText || ''}`; // Parameters go between @@vars (0_,1_) and literals (9_)
          }
        }

        // Accept all other completions
        acceptor(ctx, item);
      };

      // No-op acceptor used to finalize default completion without adding items.
      const noOpAcceptor: CompletionAcceptor = () => {
        /* Don't add any more items */
      };

      // CSS completion context (className parameters or selectors)
      const cssResult = handleCssCompletion(
        context,
        acceptor,
        this.services,
        this.cssCompletionProvider
      );
      if (cssResult.status === 'done') {
        return;
      }
      if (cssResult.status === 'finalize-noop') {
        return super.completionFor(context, next, noOpAcceptor);
      }

      // NOTE: Feature 035 US3 controller completions are now handled in getCompletion() override
      // (Langium doesn't call completionFor() for string literal positions)

      // FEATURE 043: HTML Element Completion for createElement
      const htmlResult = handleHtmlCompletion(context, acceptor, this.htmlCompletionProvider);
      if (htmlResult.status === 'done') {
        return;
      }

      // FEATURE 030: Event action completion (event name / keyword / topic)
      const eventResult = handleEventCompletion(context, next, acceptor, cursorContext);
      if (eventResult.status === 'done') {
        return;
      }
      if (eventResult.status === 'finalize-noop') {
        return super.completionFor(context, next, noOpAcceptor);
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
