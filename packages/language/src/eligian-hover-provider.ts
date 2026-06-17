/**
 * Eligian Hover Provider
 *
 * Provides rich hover information for:
 * - Operations (showing their descriptions from the operation registry)
 * - CSS classes and IDs (showing definitions and rules from imported CSS)
 * - Import statements (showing inferred Typir types)
 *
 * The markdown/Hover builders live in `hover/hover-builders.ts`; this class
 * keeps the `getHoverContent` orchestration (AST detection + dispatch) and
 * passes the CSS/label registries to the registry-backed builders (W3
 * decomposition).
 */

import { type AstNode, AstUtils, CstUtils, type LangiumDocument } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { getOperationSignature } from './compiler/operations/index.js';
import { buildCSSClassInfo, buildCSSIDInfo, CSSHoverProvider } from './css/css-hover.js';
import type { CSSRegistryService } from './css/css-registry.js';
import { detectHoverTarget } from './css/hover-detection.js';
import type { EligianServices } from './eligian-module.js';
import {
  isActionDefinition,
  isDefaultImport,
  isEventActionDefinition,
  isLanguagesBlock,
  isNamedImport,
  isOperationCall,
} from './generated/ast.js';
import {
  buildControllerHover,
  buildEventActionHoverMarkdown,
  buildImportHover,
  buildLabelIDHover,
  buildLanguagesHover,
  buildOperationHoverMarkdown,
} from './hover/hover-builders.js';
import { extractJSDoc } from './jsdoc/jsdoc-extractor.js';
import { formatJSDocAsMarkdown } from './jsdoc/jsdoc-formatter.js';
import type { LabelRegistryService } from './type-system-typir/utils/label-registry.js';
import { createMarkdownHover } from './utils/hover-utils.js';
import { getOperationCallName } from './utils/operation-call-utils.js';

export class EligianHoverProvider extends AstNodeHoverProvider {
  private cssHoverProvider = new CSSHoverProvider();
  private services: EligianServices;

  constructor(
    private cssRegistry: CSSRegistryService,
    private labelRegistry: LabelRegistryService,
    services: EligianServices
  ) {
    // B26: services is required and concretely typed. Passing a `{ References: {} }`
    // mock previously left `documentation.CommentProvider` undefined, silently
    // disabling JSDoc hover whenever the provider was constructed without real
    // services. All call sites (module + tests) already pass real EligianServices.
    super(services);
    this.services = services;
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

    // 2. Check if we're hovering over a label ID in an operation parameter
    const labelHover = buildLabelIDHover(cstNode.astNode, document, this.labelRegistry);
    if (labelHover) {
      return labelHover;
    }

    // 2.5. Check if we're hovering over a languages block (Feature 037 US5)
    const languagesBlock = AstUtils.getContainerOfType(cstNode.astNode, isLanguagesBlock);
    if (languagesBlock) {
      const hover = buildLanguagesHover(languagesBlock);
      if (hover) return hover;
    }

    // 3. Check if we're hovering over an import statement
    const defaultImport = AstUtils.getContainerOfType(cstNode.astNode, isDefaultImport);
    if (defaultImport) {
      const hover = buildImportHover(defaultImport);
      if (hover) return hover;
    }

    const namedImport = AstUtils.getContainerOfType(cstNode.astNode, isNamedImport);
    if (namedImport) {
      const hover = buildImportHover(namedImport);
      if (hover) return hover;
    }

    // 3. Check if we're hovering over an operation call (traverse up the AST tree)
    const operationCall = AstUtils.getContainerOfType(cstNode.astNode, isOperationCall);
    if (operationCall) {
      const opName = getOperationCallName(operationCall);

      if (opName) {
        // Feature 035 US3: Check if this is an addController() call
        if (opName === 'addController') {
          const controllerHover = buildControllerHover(
            cstNode.astNode,
            document,
            this.labelRegistry
          );
          if (controllerHover) {
            return controllerHover;
          }
        }

        // First, check if this is a built-in operation
        const signature = getOperationSignature(opName);
        if (signature) {
          const markdown = buildOperationHoverMarkdown(signature);
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
      const markdown = buildEventActionHoverMarkdown(eventAction);
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
}
