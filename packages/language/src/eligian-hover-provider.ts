/**
 * Eligian Hover Provider
 *
 * Provides rich hover information for operations, showing their descriptions
 * from the operation registry.
 */

import { type AstNode, CstUtils, type LangiumDocument } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { getOperationSignature } from './compiler/operations/index.js';
import type { OperationSignature } from './compiler/operations/types.js';
import { isOperationCall } from './generated/ast.js';

export class EligianHoverProvider extends AstNodeHoverProvider {
  /**
   * Override the main hover method to handle operation names.
   * This is called before getAstNodeHoverContent.
   */
  override async getHoverContent(
    document: LangiumDocument,
    params: HoverParams
  ): Promise<Hover | undefined> {
    const rootNode = document.parseResult?.value?.$cstNode;
    if (!rootNode) {
      return undefined;
    }

    const offset = document.textDocument.offsetAt(params.position);
    const cstNode = CstUtils.findLeafNodeAtOffset(rootNode, offset);

    // Check if we're hovering over an operation call
    if (cstNode?.astNode && isOperationCall(cstNode.astNode)) {
      const operationCall = cstNode.astNode;

      const signature = getOperationSignature(operationCall.operationName);
      if (signature) {
        const markdown = this.buildOperationHoverMarkdown(signature);
        return {
          contents: {
            kind: 'markdown',
            value: markdown,
          },
        };
      }
    }

    // Fall back to default behavior (e.g., for variables, comments)
    return super.getHoverContent(document, params);
  }
  /**
   * Override to provide hover content for AST nodes that Langium's
   * default mechanism finds (e.g., variables, action references).
   *
   * Operation calls are handled in getHoverContent() above.
   *
   * This method can be extended in the future to provide custom
   * hover content for other node types (e.g., action definitions,
   * variable declarations, etc.).
   */
  protected override getAstNodeHoverContent(_node: AstNode): string | undefined {
    // For now, delegate to the default behavior (multiline comments)
    // Future: Add custom hover content for other node types here
    return undefined;
  }

  /**
   * Build markdown documentation for an operation signature
   */
  private buildOperationHoverMarkdown(signature: OperationSignature): string {
    const lines: string[] = [];

    // Operation name header
    lines.push(`### ${signature.systemName}`);
    lines.push('');

    // Description (if available)
    if (signature.description) {
      lines.push(signature.description);
      lines.push('');
    }

    // Parameters
    if (signature.parameters.length > 0) {
      lines.push('**Parameters:**');
      for (const param of signature.parameters) {
        const required = param.required ? '*(required)*' : '*(optional)*';
        const typeDisplay = this.formatParameterType(param.type);

        lines.push(`- \`${param.name}\`: ${typeDisplay} ${required}`);

        if (param.description) {
          lines.push(`  - ${param.description}`);
        }
      }
      lines.push('');
    }

    // Dependencies (what this operation needs)
    if (signature.dependencies.length > 0) {
      lines.push('**Requires:**');
      for (const dep of signature.dependencies) {
        lines.push(`- \`${dep.name}\` (\`${dep.type}\`)`);
      }
      lines.push('');
    }

    // Outputs (what this operation provides)
    if (signature.outputs.length > 0) {
      lines.push('**Provides:**');
      for (const output of signature.outputs) {
        const outputType = this.formatOutputType(output.type);
        lines.push(`- \`${output.name}\` (${outputType})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format parameter type for display
   */
  private formatParameterType(type: string[] | Array<{ value: string }>): string {
    if (Array.isArray(type) && type.length > 0) {
      // Check if it's an array of constant values (enum-like)
      if (typeof type[0] === 'object' && 'value' in type[0]) {
        const constantValues = (type as Array<{ value: string }>).map(c => JSON.stringify(c.value));
        return constantValues.join(' | ');
      }

      // Array of parameter types (multi-type support)
      const types = type as string[];
      return types.map(t => `\`${t}\``).join(' | ');
    }

    return '`any`';
  }

  /**
   * Format output type for display (handles both single and array types)
   */
  private formatOutputType(type: string | string[]): string {
    if (Array.isArray(type)) {
      return type.map(t => `\`${t}\``).join(' | ');
    }
    return `\`${type}\``;
  }
}
