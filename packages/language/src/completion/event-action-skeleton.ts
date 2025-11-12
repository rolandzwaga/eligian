/**
 * Event Action Skeleton Generation (Feature 030)
 *
 * Generates complete event action skeletons with camelCase naming and typed parameters.
 * Converts hyphenated event names to camelCase (e.g., "language-change" → "handleLanguageChange").
 */

import type { CompletionItem } from 'vscode-languageserver';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import type {
  EventArgMetadata,
  TimelineEventMetadata,
} from './metadata/timeline-events.generated.js';

/**
 * Convert hyphenated event name to camelCase
 *
 * Examples:
 * - "language-change" → "languageChange"
 * - "before-request-video-url" → "beforeRequestVideoUrl"
 * - "timeline-play" → "timelinePlay"
 *
 * @param eventName - Hyphenated event name
 * @returns camelCase version of the event name
 */
export function eventNameToCamelCase(eventName: string): string {
  const parts = eventName.split('-');
  return parts
    .map((part, index) =>
      index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Generate action name from event name with "handle" prefix
 *
 * Examples:
 * - "language-change" → "handleLanguageChange"
 * - "before-request-video-url" → "handleBeforeRequestVideoUrl"
 * - "timeline-play" → "handleTimelinePlay"
 *
 * @param eventName - Hyphenated event name
 * @returns Action name with "handle" prefix and camelCase
 */
export function generateActionName(eventName: string): string {
  const camelCaseName = eventNameToCamelCase(eventName);
  return `handle${camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1)}`;
}

/**
 * Generate parameter list from event metadata
 *
 * Examples:
 * - [] → ""
 * - [{name: "language", type: "string"}] → "language: string"
 * - [{name: "index", type: "number"}, {name: "position", type: "number"}] → "index: number, position: number"
 *
 * @param args - Event argument metadata (optional)
 * @returns Parameter list string with type annotations
 */
export function generateParameters(args: EventArgMetadata[] | undefined): string {
  if (!args || args.length === 0) return '';

  return args.map(arg => `${arg.name}: ${arg.type}`).join(', ');
}

/**
 * Create skeleton template with LSP snippet format
 *
 * Generates complete event action definition with:
 * - Event name in string literal
 * - Action name with camelCase naming
 * - Parameter list with type annotations
 * - Empty action body with cursor positioned inside ($0 placeholder)
 *
 * Example output:
 * ```eligian
 * on event "language-change" action handleLanguageChange(language: string) [
 *   $0
 * ]
 * ```
 *
 * @param eventName - Hyphenated event name
 * @param actionName - Generated action name (camelCase with "handle" prefix)
 * @param params - Parameter list string
 * @returns LSP snippet string with $0 placeholder for cursor positioning
 */
export function createSkeletonTemplate(
  eventName: string,
  actionName: string,
  params: string
): string {
  const paramList = params ? `(${params})` : '()';
  return `on event "${eventName}" action ${actionName}${paramList} [\n\t$0\n]`;
}

/**
 * Create completion item for event action skeleton
 *
 * Converts event metadata to a CompletionItem with:
 * - Label: Event name (what user sees in completion list)
 * - Detail: Generated action name (shows preview of what will be generated)
 * - Documentation: Event description and category
 * - Insert text: Complete skeleton with LSP snippet format
 * - Insert text format: Snippet (enables $0 cursor positioning)
 *
 * @param eventMetadata - Event metadata from timeline-events.generated.ts
 * @returns CompletionItem with skeleton generation
 */
export function createSkeletonCompletionItem(eventMetadata: TimelineEventMetadata): CompletionItem {
  const actionName = generateActionName(eventMetadata.name);
  const params = generateParameters(eventMetadata.args);
  const skeleton = createSkeletonTemplate(eventMetadata.name, actionName, params);

  const documentation = eventMetadata.category
    ? `${eventMetadata.description}\n\nCategory: ${eventMetadata.category}`
    : eventMetadata.description;

  return {
    label: eventMetadata.name,
    kind: CompletionItemKind.Event,
    detail: `Generate action: ${actionName}`,
    documentation,
    insertText: skeleton,
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: `0_${eventMetadata.name}`, // Prioritize in completion list
  };
}
