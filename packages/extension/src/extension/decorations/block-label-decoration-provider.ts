/**
 * Block Label Decoration Provider
 *
 * Applies superscript "start" and "end" labels before '[' brackets in:
 * - Endable actions: endable action name() [start] [end]
 * - Timeline events: at 0s..4s [start] [end]
 */

import * as vscode from 'vscode';
import { type BlockLabel, findBlockLabels } from './block-label-detector.js';

/**
 * Manages decorations for block labels in Eligian files
 */
export class BlockLabelDecorationProvider {
  private startLabelDecorationType: vscode.TextEditorDecorationType;
  private endLabelDecorationType: vscode.TextEditorDecorationType;
  private updateTimeout: NodeJS.Timeout | undefined;
  private readonly debounceMs = 300;

  constructor() {
    // Create decoration type for "start" label
    // Note: VS Code decorations don't support font-size CSS
    // Using Unicode superscript characters for smaller text
    // Color uses the bracket punctuation theme color
    this.startLabelDecorationType = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: 'ˢᵗᵃʳᵗ',
        color: new vscode.ThemeColor('editorBracketHighlight.foreground1'),
        margin: '0 0.1em 0 0',
      },
    });

    // Create decoration type for "end" label
    this.endLabelDecorationType = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: 'ᵉⁿᵈ',
        color: new vscode.ThemeColor('editorBracketHighlight.foreground1'),
        margin: '0 0.1em 0 0',
      },
    });
  }

  /**
   * Update decorations for the given editor
   * @param editor - VS Code text editor
   */
  public updateDecorations(editor: vscode.TextEditor): void {
    // Debounce updates to avoid excessive recomputation
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.applyDecorations(editor);
    }, this.debounceMs);
  }

  /**
   * Apply decorations to the editor
   * @param editor - VS Code text editor
   */
  private async applyDecorations(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;

    // Only process Eligian files
    if (document.languageId !== 'eligian') {
      return;
    }

    try {
      // Convert VS Code document to TextDocument protocol
      const textDocument = {
        uri: document.uri.toString(),
        languageId: document.languageId,
        version: document.version,
        getText: () => document.getText(),
        positionAt: (offset: number) => document.positionAt(offset),
        offsetAt: (position: vscode.Position) => document.offsetAt(position),
        lineCount: document.lineCount,
      };

      // Find all block labels in the document
      const labels = await findBlockLabels(textDocument);

      // Separate decorations for start and end labels
      const startDecorations: vscode.DecorationOptions[] = [];
      const endDecorations: vscode.DecorationOptions[] = [];

      for (const label of labels) {
        // Create hover message based on label type
        const hoverMessage = this.createHoverMessage(label);

        // Start bracket decoration
        startDecorations.push({
          range: new vscode.Range(
            label.startBracketPosition.line,
            label.startBracketPosition.character,
            label.startBracketPosition.line,
            label.startBracketPosition.character
          ),
          hoverMessage,
        });

        // End bracket decoration
        endDecorations.push({
          range: new vscode.Range(
            label.endBracketPosition.line,
            label.endBracketPosition.character,
            label.endBracketPosition.line,
            label.endBracketPosition.character
          ),
          hoverMessage,
        });
      }

      // Apply decorations
      editor.setDecorations(this.startLabelDecorationType, startDecorations);
      editor.setDecorations(this.endLabelDecorationType, endDecorations);
    } catch (error) {
      // Silently ignore errors during decoration
      // (e.g., document parsing errors shouldn't break the editor)
      console.error(
        '[BlockLabelDecorationProvider] Error applying block label decorations:',
        error
      );
    }
  }

  /**
   * Create hover message for a block label
   * @param label - Block label information
   * @returns Markdown hover message
   */
  private createHoverMessage(label: BlockLabel): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;

    if (label.type === 'action') {
      markdown.appendMarkdown('**Start operations** executed when:\n');
      markdown.appendMarkdown('- Endable action begins\n\n');
      markdown.appendMarkdown('**End operations** executed when:\n');
      markdown.appendMarkdown('- Endable action ends');
    } else {
      // Timeline event
      markdown.appendMarkdown('**Start operations** executed when:\n');
      markdown.appendMarkdown('- Timeline reaches this point\n\n');
      markdown.appendMarkdown('**End operations** executed when:\n');
      markdown.appendMarkdown('- Timeline exits this time range');
    }

    return markdown;
  }

  /**
   * Clear all decorations
   */
  public clearDecorations(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined;
    }
  }

  /**
   * Dispose of decoration types
   */
  public dispose(): void {
    this.clearDecorations();
    this.startLabelDecorationType.dispose();
    this.endLabelDecorationType.dispose();
  }
}
