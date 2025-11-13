/**
 * Eligian Hover Provider
 *
 * Provides rich hover information for:
 * - Operations (showing their descriptions from the operation registry)
 * - CSS classes and IDs (showing definitions and rules from imported CSS)
 * - Import statements (showing inferred Typir types)
 */

import { type AstNode, AstUtils, CstUtils, type LangiumDocument } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { getOperationSignature } from './compiler/operations/index.js';
import type { OperationSignature } from './compiler/operations/types.js';
import { buildCSSClassInfo, buildCSSIDInfo, CSSHoverProvider } from './css/css-hover.js';
import type { CSSRegistryService } from './css/css-registry.js';
import { detectHoverTarget } from './css/hover-detection.js';
import type { DefaultImport, NamedImport } from './generated/ast.js';
import {
  isActionDefinition,
  isDefaultImport,
  isEventActionDefinition,
  isNamedImport,
  isOperationCall,
} from './generated/ast.js';
import { extractJSDoc } from './jsdoc/jsdoc-extractor.js';
import { formatJSDocAsMarkdown } from './jsdoc/jsdoc-formatter.js';
import { createMarkdownHover } from './utils/hover-utils.js';
import { MarkdownBuilder } from './utils/markdown-builder.js';
import { getOperationCallName } from './utils/operation-call-utils.js';
import { getFileExtension } from './utils/path-utils.js';

export class EligianHoverProvider extends AstNodeHoverProvider {
  private cssHoverProvider = new CSSHoverProvider();
  private services: any;

  constructor(
    private cssRegistry: CSSRegistryService,
    services?: any
  ) {
    // AstNodeHoverProvider requires services parameter
    // If services provided (for testing), use them; otherwise create minimal mock
    super(services || ({ References: {} } as any));
    this.services = services || ({ References: {} } as any);
  }
  /**
   * Override the main hover method to handle:
   * 1. CSS classes and IDs (in operation arguments)
   * 2. Operation names
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

    // Early return if no AST node found
    if (!cstNode?.astNode) {
      return super.getHoverContent(document, params);
    }

    // 1. Check if we're hovering over a CSS class or ID
    const cssTarget = detectHoverTarget(cstNode.astNode, params);
    if (cssTarget) {
      // Get imported CSS files for this document
      const documentUri = document.uri.toString();
      const importsSet = this.cssRegistry.getDocumentImports(documentUri);
      const imports = Array.from(importsSet);

      if (imports.length > 0) {
        if (cssTarget.type === 'class') {
          const classInfo = buildCSSClassInfo(cssTarget.name, imports, uri =>
            this.cssRegistry.getMetadata(uri)
          );
          const hover = this.cssHoverProvider.provideCSSClassHover(classInfo);
          if (hover) return hover;
        } else if (cssTarget.type === 'id') {
          const idInfo = buildCSSIDInfo(cssTarget.name, imports, uri =>
            this.cssRegistry.getMetadata(uri)
          );
          const hover = this.cssHoverProvider.provideCSSIDHover(idInfo);
          if (hover) return hover;
        }
      }
    }

    // 2. Check if we're hovering over an import statement
    const defaultImport = AstUtils.getContainerOfType(cstNode.astNode, isDefaultImport);
    if (defaultImport) {
      const hover = this.buildImportHover(defaultImport);
      if (hover) return hover;
    }

    const namedImport = AstUtils.getContainerOfType(cstNode.astNode, isNamedImport);
    if (namedImport) {
      const hover = this.buildImportHover(namedImport);
      if (hover) return hover;
    }

    // 3. Check if we're hovering over an operation call (traverse up the AST tree)
    const operationCall = AstUtils.getContainerOfType(cstNode.astNode, isOperationCall);
    if (operationCall) {
      const opName = getOperationCallName(operationCall);

      if (opName) {
        // First, check if this is a built-in operation
        const signature = getOperationSignature(opName);
        if (signature) {
          const markdown = this.buildOperationHoverMarkdown(signature);
          return createMarkdownHover(markdown);
        }

        // Not a built-in operation, check if it's a custom action with JSDoc
        const actionRef = operationCall.operationName;
        if (actionRef?.ref && isActionDefinition(actionRef.ref)) {
          const actionDef = actionRef.ref;
          const commentProvider = this.services.documentation?.CommentProvider;

          if (commentProvider) {
            const jsdoc = extractJSDoc(actionDef, commentProvider);

            if (jsdoc) {
              // Format JSDoc as markdown for hover display
              const markdown = formatJSDocAsMarkdown(jsdoc, actionDef.name);
              return createMarkdownHover(markdown);
            }
          }

          // No JSDoc found, show basic action signature
          const params = actionDef.parameters
            .map(p => {
              const type = p.type ? `: ${p.type}` : '';
              return `${p.name}${type}`;
            })
            .join(', ');
          const markdown = `### ${actionDef.name}\n\n\`${actionDef.name}(${params})\``;
          return createMarkdownHover(markdown);
        }
      }
    }

    // T045: Check if we're hovering over an event action definition
    const eventAction = AstUtils.getContainerOfType(cstNode.astNode, isEventActionDefinition);
    if (eventAction) {
      const markdown = this.buildEventActionHoverMarkdown(eventAction);
      return createMarkdownHover(markdown);
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
    const builder = new MarkdownBuilder();

    // Operation name header
    builder.heading(3, signature.systemName).blank();

    // Description (if available)
    if (signature.description) {
      builder.text(signature.description).blank();
    }

    // Parameters
    if (signature.parameters.length > 0) {
      builder.text('**Parameters:**');
      for (const param of signature.parameters) {
        const required = param.required ? '*(required)*' : '*(optional)*';
        const typeDisplay = this.formatParameterType(param.type);
        const erased = param.erased ? ' ⚠️ *erased after use*' : '';

        builder.text(`- \`${param.name}\`: ${typeDisplay} ${required}${erased}`);

        if (param.description) {
          builder.text(`  - ${param.description}`);
        }
      }
      builder.blank();
    }

    // Dependencies (what this operation needs)
    if (signature.dependencies.length > 0) {
      builder.text('**Requires:**');
      const depItems = signature.dependencies.map(dep => `\`${dep.name}\` (\`${dep.type}\`)`);
      builder.list(depItems).blank();
    }

    // Outputs (what this operation provides)
    if (signature.outputs.length > 0) {
      builder.text('**Provides:**');
      const outputItems = signature.outputs.map(output => {
        const outputType = this.formatOutputType(output.type);
        const erased = output.erased ? ' ⚠️ *erased after use*' : '';
        return `\`${output.name}\` (${outputType})${erased}`;
      });
      builder.list(outputItems).blank();
    }

    return builder.build();
  }

  /**
   * Build markdown documentation for an event action definition (T045)
   *
   * Shows event action information including:
   * - Event name and optional topic
   * - Parameters with their indices for eventArgs mapping
   */
  private buildEventActionHoverMarkdown(
    eventAction: import('./generated/ast.js').EventActionDefinition
  ): string {
    const builder = new MarkdownBuilder();

    // Event Action header
    builder.heading(3, `Event Action: ${eventAction.name}`).blank();

    // Event information
    const topic = eventAction.eventTopic ? ` (topic: "${eventAction.eventTopic}")` : '';
    builder.text(`**Listens to:** \`"${eventAction.eventName}"\`${topic}`).blank();

    // Parameters section
    if (eventAction.parameters.length > 0) {
      builder.text('**Parameters:**');
      const paramItems = eventAction.parameters.map((param, i) => {
        const type = param.type ? ` (\`${param.type}\`)` : '';
        return `\`${param.name}\`${type} - index ${i} in \`eventArgs\``;
      });
      builder.list(paramItems).blank();
      builder.text('*Parameters are accessed as `eventArgs[index]` when the event fires.*');
    } else {
      builder.text('**Parameters:** *none*');
    }

    return builder.build();
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

  /**
   * Build hover content for import statements
   *
   * Note: We don't use Typir.inferType() here because hover is called outside
   * the validation cycle and the AST nodes may not have $document links yet.
   * Instead, we replicate the same logic as the Typir inference rules.
   */
  private buildImportHover(importNode: DefaultImport | NamedImport): Hover | undefined {
    // Get the file path from the import
    const path = importNode.path;

    // Get asset type from the import node
    let assetType: string;
    if (isDefaultImport(importNode)) {
      // Default imports: layout→html, styles→css, provider→media
      assetType =
        importNode.type === 'layout' ? 'html' : importNode.type === 'styles' ? 'css' : 'media';
    } else {
      // Named imports: use explicit type or infer from extension
      if (importNode.assetType) {
        assetType = importNode.assetType;
      } else {
        // Infer from file extension
        const ext = getFileExtension(path);
        if (ext === 'html' || ext === 'htm') {
          assetType = 'html';
        } else if (ext === 'css') {
          assetType = 'css';
        } else if (
          ext === 'mp4' ||
          ext === 'webm' ||
          ext === 'mp3' ||
          ext === 'wav' ||
          ext === 'ogg'
        ) {
          assetType = 'media';
        } else {
          assetType = 'unknown';
        }
      }
    }

    // Build type name
    const typeName = `Import<${assetType}>`;

    // Build markdown content
    const markdown = `### ${typeName}\n\nFile: \`${path}\``;

    return {
      contents: {
        kind: 'markdown',
        value: markdown,
      },
    };
  }
}
