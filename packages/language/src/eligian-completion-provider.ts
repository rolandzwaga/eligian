/**
 * Eligian Completion Provider
 *
 * This is the main completion provider for Eligian DSL. It orchestrates
 * all completion logic based on cursor context, delegating to specialized
 * completion modules for operations, actions, keywords, etc.
 */

import type { LangiumDocument, MaybePromise } from 'langium';
import type { CompletionContext } from 'langium/lsp';
import { type CompletionAcceptor, DefaultCompletionProvider, type NextFeature } from 'langium/lsp';
import type { CompletionItem, CompletionItemKind, CompletionParams } from 'vscode-languageserver';
import { CompletionList, InsertTextFormat } from 'vscode-languageserver';
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
import { generateJSDocTemplate } from './jsdoc/jsdoc-template-generator.js';
import { findActionBelow } from './utils/ast-navigation.js';

/**
 * Eligian-specific completion provider
 *
 * Extends Langium's DefaultCompletionProvider and adds custom completion logic
 * based on Eligian DSL syntax and Eligius operation metadata.
 */
export class EligianCompletionProvider extends DefaultCompletionProvider {
  private readonly cssCompletionProvider: CSSCompletionProvider;
  private readonly services: EligianServices;

  /**
   * Completion options for Eligian
   *
   * Registers '*' as a trigger character to enable JSDoc auto-completion.
   * When the user types '/**', the second '*' triggers completion and
   * auto-generates the JSDoc template.
   */
  override readonly completionOptions = {
    triggerCharacters: ['*'],
  };

  constructor(services: EligianServices) {
    super(services);
    this.services = services;
    this.cssCompletionProvider = new CSSCompletionProvider();
  }

  /**
   * Override getCompletion to intercept JSDoc template requests
   *
   * This is the top-level completion handler that receives the full CompletionParams,
   * including the triggerCharacter. We check if completion was triggered by '*' and
   * the cursor is positioned after '/**', then generate the JSDoc template.
   */
  override async getCompletion(
    document: LangiumDocument,
    params: CompletionParams
  ): Promise<CompletionList | undefined> {
    // Check if this is a JSDoc template trigger: typing * after /**
    if (params.context?.triggerCharacter === '*') {
      const text = document.textDocument.getText();
      const offset = document.textDocument.offsetAt(params.position);

      // Get the line text up to cursor
      const position = params.position;
      const lineStart = document.textDocument.offsetAt({ line: position.line, character: 0 });
      const lineTextUpToCursor = text.substring(lineStart, offset);

      // Check if line ends with /** (we just typed the second *)
      const trimmed = lineTextUpToCursor.trimEnd();

      if (trimmed.endsWith('/**')) {
        // Find the action definition on the line below
        const actionBelow = findActionBelow(document, position);

        if (actionBelow) {
          // Generate JSDoc template
          const template = generateJSDocTemplate(actionBelow);

          // Split template into lines and build snippet
          const lines = template.split('\n');
          const snippetLines: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            if (i === 0) {
              // Skip first line (already typed /**)
            } else if (i === 1) {
              // Second line - add placeholder for description
              snippetLines.push(' * ${1:description}');
            } else {
              // Param lines and closing */ - keep as-is
              snippetLines.push(lines[i]);
            }
          }

          const snippetText = snippetLines.join('\n');

          // Insert the template starting at current cursor position
          // The /** is already typed, so we just add newline + template content
          const insertText = `\n${snippetText}`;

          // Create completion item that inserts at current position
          const completionItem: CompletionItem = {
            label: '/** JSDoc comment */',
            kind: 15, // CompletionItemKind.Snippet
            insertText: insertText,
            insertTextFormat: InsertTextFormat.Snippet,
            detail: `Generate JSDoc for ${actionBelow.name}`,
            documentation: {
              kind: 'markdown',
              value: `Generates JSDoc documentation template for action \`${actionBelow.name}\``,
            },
            sortText: '!0', // ! prefix ensures it sorts first
            filterText: '/**', // Match against what user typed
            preselect: true, // Auto-select this item (VS Code will highlight it first)
            // Empty commitCharacters means it won't auto-commit, but being preselected helps
          };

          // Return ONLY this completion as a complete list
          // Return with isIncomplete: false and only one item - this should show only our item
          return CompletionList.create([completionItem], false);
        }
      }
    }

    // Not a JSDoc trigger, delegate to default implementation
    return super.getCompletion(document, params);
  }

  /**
   * Check if cursor is immediately after /** on a line
   *
   * This method is used as a fallback when context.triggerCharacter is not available
   * (e.g., in testing or if LSP doesn't support trigger characters).
   *
   * @param context - Completion context
   * @returns True if the cursor is right after /** on the current line
   */
  private isCursorAfterJSDocStart(context: CompletionContext): boolean {
    const document = context.document;
    const text = document.textDocument.getText();
    const position = document.textDocument.positionAt(context.offset);

    // Get the current line text up to cursor
    const lineStart = document.textDocument.offsetAt({ line: position.line, character: 0 });
    const lineTextUpToCursor = text.substring(lineStart, context.offset);

    // Check if line ends with /**<cursor> or /** *<cursor> (after typing *)
    const trimmed = lineTextUpToCursor.trimEnd();
    return trimmed.endsWith('/**') || trimmed.endsWith('/** *');
  }

  /**
   * Try to generate a JSDoc template for an action below the cursor
   *
   * This method is triggered when the user types `*` after `/**`. It:
   * 1. Checks if the line ends with `/**`
   * 2. Finds the action definition on the next line
   * 3. Generates a JSDoc template with parameter types
   * 4. Adds it as a snippet completion
   *
   * @param context - Completion context
   * @param acceptor - Completion acceptor
   * @returns True if JSDoc template was generated, false otherwise
   */
  private tryGenerateJSDocTemplate(
    context: CompletionContext,
    acceptor: CompletionAcceptor
  ): boolean {
    const document = context.document;
    const text = document.textDocument.getText();
    const position = document.textDocument.positionAt(context.offset);

    // Get the current line text
    const lineStart = document.textDocument.offsetAt({ line: position.line, character: 0 });
    const lineEnd = document.textDocument.offsetAt({
      line: position.line + 1,
      character: 0,
    });
    const lineText = text.substring(lineStart, lineEnd);

    // Check if the line ends with /** (ignoring whitespace)
    // Note: Remove | cursor marker if present (from test fixtures)
    const trimmedLine = lineText.trimEnd().replace('|', '');
    if (!trimmedLine.endsWith('/**')) {
      return false;
    }

    // Find the action definition on the line below
    const actionBelow = findActionBelow(document, position);
    if (!actionBelow) {
      return false; // No action found below
    }

    // Generate JSDoc template
    const template = generateJSDocTemplate(actionBelow);

    // Split template into lines and add proper indentation
    const lines = template.split('\n');

    // Build snippet with placeholders:
    // Line 0: /** (already typed)
    // Line 1: * ${1:description}
    // Lines 2+: * @param ... (keep as-is)
    // Last line: */
    const snippetLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i === 0) {
      } else if (i === 1) {
        // Second line - add placeholder for description
        snippetLines.push(' * ${1:description}');
      } else {
        // Param lines and closing */ - keep as-is
        snippetLines.push(line);
      }
    }

    // Join lines with newline
    const snippetText = snippetLines.join('\n');

    // Create completion item
    const completionItem: CompletionItem = {
      label: 'Generate JSDoc',
      kind: 22, // CompletionItemKind.Snippet
      insertText: snippetText,
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'JSDoc comment template',
      documentation: `Generate JSDoc template for action '${actionBelow.name}'`,
      sortText: '0_jsdoc', // Sort to top
    };

    acceptor(context, completionItem);
    return true;
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

      // Check for JSDoc template completion (triggered by * after /**)
      // Manually detect from document text (triggerCharacter is not available in Langium)
      if (this.isCursorAfterJSDocStart(context)) {
        const jsdocCompletion = this.tryGenerateJSDocTemplate(context, acceptor);
        if (jsdocCompletion) {
          return; // JSDoc template generated, don't show other completions
        }
      }

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
