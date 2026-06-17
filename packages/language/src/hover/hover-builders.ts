/**
 * Hover content builders for {@link EligianHoverProvider}.
 *
 * Pure(ish) markdown/Hover builders extracted verbatim from the provider (W3
 * decomposition). The provider's `getHoverContent` orchestrates AST detection
 * and calls these; the registry-backed builders (controller / label ID) take
 * their registry as an argument instead of reading provider fields.
 */

import { type AstNode, AstUtils, CstUtils, type LangiumDocument } from 'langium';
import type { Hover } from 'vscode-languageserver';
import { getOperationSignature } from '../compiler/operations/index.js';
import type { OperationSignature } from '../compiler/operations/types.js';
import { getController } from '../completion/metadata/controllers.generated.js';
import type {
  DefaultImport,
  EventActionDefinition,
  LanguagesBlock,
  NamedImport,
} from '../generated/ast.js';
import { isDefaultImport, isOperationCall } from '../generated/ast.js';
import type { LabelRegistryService } from '../type-system-typir/utils/label-registry.js';
import { createMarkdownHover } from '../utils/hover-utils.js';
import { MarkdownBuilder } from '../utils/markdown-builder.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { getFileExtension } from '../utils/path-utils.js';

/**
 * Build markdown documentation for an operation signature
 */
export function buildOperationHoverMarkdown(signature: OperationSignature): string {
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
      const typeDisplay = formatParameterType(param.type);
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
      const outputType = formatOutputType(output.type);
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
export function buildEventActionHoverMarkdown(eventAction: EventActionDefinition): string {
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
export function formatParameterType(type: string[] | Array<{ value: string }>): string {
  if (Array.isArray(type) && type.length > 0) {
    // Check if it's an array of constant values (enum-like)
    if (typeof type[0] === 'object' && 'value' in type[0]) {
      const constantValues = (type as Array<{ value: string }>).map(c => JSON.stringify(c.value));
      return constantValues.join(' | ');
    }

    // Array of parameter types (multi-type support)
    const types = type as string[];
    return types.map(t => `\`${translateParameterType(t)}\``).join(' | ');
  }

  return '`any`';
}

/**
 * Translate internal ParameterType:* types to user-friendly display names
 */
export function translateParameterType(type: string): string {
  // Handle ParameterType:* schema types
  if (type.startsWith('ParameterType:')) {
    const innerType = type.substring('ParameterType:'.length);
    // Map semantic types to their base types for display
    switch (innerType) {
      case 'className':
      case 'selector':
      case 'labelId':
      case 'actionName':
      case 'eventTopic':
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      case 'array':
        return 'array';
      case 'function':
        return 'function';
      case 'Date':
        return 'Date';
      default:
        // For any unknown types, show as-is without ParameterType: prefix
        return innerType;
    }
  }
  return type;
}

/**
 * Format output type for display (handles both single and array types)
 */
export function formatOutputType(type: string | string[]): string {
  if (Array.isArray(type)) {
    return type.map(t => `\`${t}\``).join(' | ');
  }
  return `\`${type}\``;
}

/**
 * Build hover content for addController() calls
 *
 * Shows controller documentation when hovering over:
 * - Controller name (first parameter)
 * - Label ID (second parameter for LabelController)
 *
 * Feature: 035-specialized-controller-syntax
 * User Story: US3
 */
export function buildControllerHover(
  node: AstNode,
  document: LangiumDocument,
  labelRegistry: LabelRegistryService
): Hover | undefined {
  // Check if we're hovering over a string literal in addController() args
  if (node.$type !== 'StringLiteral') {
    return undefined;
  }

  const stringLiteral = node as any;
  const stringValue = stringLiteral.value;

  // Try to find the OperationCall parent
  const operationCall = AstUtils.getContainerOfType(node, isOperationCall);
  if (!operationCall) {
    return undefined;
  }

  const args = operationCall.args || [];

  // Determine which parameter this is (0 = controller name, 1 = first param, etc.)
  const paramIndex = args.indexOf(stringLiteral);
  if (paramIndex === -1) {
    return undefined;
  }

  if (paramIndex === 0) {
    // Hovering over controller name - show controller documentation
    const controller = getController(stringValue);
    if (!controller) {
      return undefined;
    }

    const builder = new MarkdownBuilder();

    // Controller name header
    builder.heading(3, controller.name).blank();

    // Description
    if (controller.description) {
      builder.text(controller.description).blank();
    }

    // Parameters
    if (controller.parameters.length > 0) {
      builder.text('**Parameters:**');
      const paramItems = controller.parameters.map(param => {
        const required = param.required ? '' : '?';
        const rawType = typeof param.type === 'string' ? param.type : 'object';
        const type = translateParameterType(rawType);
        return `\`${param.name}${required}\` (\`${type}\`)${param.description ? ` - ${param.description}` : ''}`;
      });
      builder.list(paramItems).blank();
    } else {
      builder.text('**Parameters:** *none*').blank();
    }

    return createMarkdownHover(builder.build());
  } else if (paramIndex === 1) {
    // Hovering over second parameter - check if this is LabelController
    const controllerName = args[0]?.$type === 'StringLiteral' ? (args[0] as any).value : undefined;

    if (controllerName === 'LabelController') {
      // Show translation key metadata
      const documentUri = document.uri.toString();
      const metadata = labelRegistry.findLabelMetadata(documentUri, stringValue);

      if (!metadata) {
        return undefined;
      }

      const builder = new MarkdownBuilder();

      // Translation key header
      builder.heading(3, `Translation Key: ${stringValue}`).blank();

      // Metadata
      builder.text(`**Translations:** ${metadata.translationCount}`);
      if (metadata.languageCodes && metadata.languageCodes.length > 0) {
        builder.text(`**Languages:** ${metadata.languageCodes.join(', ')}`);
      }

      return createMarkdownHover(builder.build());
    }
  }

  return undefined;
}

/**
 * Build hover content for import statements
 *
 * Note: We don't use Typir.inferType() here because hover is called outside
 * the validation cycle and the AST nodes may not have $document links yet.
 * Instead, we replicate the same logic as the Typir inference rules.
 */
export function buildImportHover(importNode: DefaultImport | NamedImport): Hover | undefined {
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

/**
 * Build hover content for label ID parameters
 *
 * Displays label metadata: translation count and language codes.
 */
export function buildLabelIDHover(
  node: AstNode,
  document: LangiumDocument,
  labelRegistry: LabelRegistryService
): Hover | undefined {
  // Traverse up AST to find OperationCall
  const operationCall = AstUtils.getContainerOfType(node, isOperationCall);
  if (!operationCall) {
    return undefined;
  }

  const opName = getOperationCallName(operationCall);
  if (!opName) {
    return undefined;
  }

  const signature = getOperationSignature(opName);
  if (!signature) {
    return undefined;
  }

  // Find label ID parameter indices
  const labelIDParamIndices: number[] = [];
  for (let i = 0; i < signature.parameters.length; i++) {
    const param = signature.parameters[i];
    if (
      Array.isArray(param.type) &&
      param.type.some(t => typeof t === 'string' && t === 'ParameterType:labelId')
    ) {
      labelIDParamIndices.push(i);
    }
  }

  if (labelIDParamIndices.length === 0) {
    return undefined;
  }

  // Check if we're hovering over a string literal in a label ID parameter
  const args = operationCall.args || [];
  for (const paramIndex of labelIDParamIndices) {
    const arg = args[paramIndex];
    if (!arg) continue;

    // Check if this is the node we're hovering over
    if (arg.$cstNode && CstUtils.findLeafNodeAtOffset(arg.$cstNode, 0) === node.$cstNode) {
      // Hovering over this argument
      if (arg.$type !== 'StringLiteral') continue;

      const labelId = (arg as any).value;
      if (typeof labelId !== 'string') continue;

      // Get document URI
      const documentUri = document.uri.toString();

      // Query label metadata
      const metadata = labelRegistry.findLabelMetadata(documentUri, labelId);
      if (!metadata) {
        return undefined; // No metadata found (validation will show error)
      }

      // Format hover markdown
      const builder = new MarkdownBuilder();
      builder
        .heading(3, `TranslationKey<${metadata.id}>`)
        .blank()
        .text(`**Translations:** ${metadata.translationCount}`)
        .text(`**Languages:** ${metadata.languageCodes.join(', ')}`);

      return createMarkdownHover(builder.build());
    }
  }

  return undefined;
}

/**
 * Build hover information for LanguagesBlock (Feature 037 US5)
 *
 * Shows type information with singular/plural handling:
 * - Single language: "Languages: 1 language, default: en-US"
 * - Multiple languages: "Languages: 3 languages, default: nl-NL"
 *
 * @param block - LanguagesBlock AST node
 * @returns Hover with formatted markdown
 */
export function buildLanguagesHover(block: LanguagesBlock): Hover | undefined {
  // Extract language count and default language
  const languageCount = block.entries.length;

  // Find default language (marked with * or first entry)
  const defaultEntry = block.entries.find(entry => entry.isDefault === true) || block.entries[0];
  const defaultLanguage = defaultEntry?.code || 'en-US';

  // Format with singular/plural
  const languageWord = languageCount === 1 ? 'language' : 'languages';
  const typeName = `Languages: ${languageCount} ${languageWord}, default: ${defaultLanguage}`;

  // Build markdown with type information
  const builder = new MarkdownBuilder();
  builder
    .heading(3, 'LanguagesType')
    .blank()
    .text(typeName)
    .blank()
    .text('**Available languages:**');

  // List all languages with default marker
  for (const entry of block.entries) {
    const marker = entry.isDefault ? '* ' : '  ';
    builder.text(`${marker}\`${entry.code}\` - ${entry.label}`);
  }

  return createMarkdownHover(builder.build());
}
