/**
 * Event Name Completions (Feature 028 - T044, Feature 030)
 *
 * Provides autocomplete suggestions for Eligius event names when typing `on event "`.
 * Generates complete event action skeletons with camelCase naming and typed parameters.
 */

import type { CompletionContext } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import { CompletionItemKind } from 'vscode-languageserver';
import { createSkeletonCompletionItem } from './event-action-skeleton.js';
import { TIMELINE_EVENTS } from './metadata/timeline-events.generated.js';

/**
 * Common event topic names for namespacing events
 *
 * These are suggested topic names for organizing event actions.
 * Topics allow multiple handlers for the same event in different contexts.
 */
const COMMON_EVENT_TOPICS: Array<{ name: string; description: string }> = [
  {
    name: 'navigation',
    description: 'Navigation-related events',
  },
  {
    name: 'form',
    description: 'Form submission and validation events',
  },
  {
    name: 'user',
    description: 'User interaction events',
  },
  {
    name: 'data',
    description: 'Data loading and synchronization events',
  },
  {
    name: 'ui',
    description: 'UI state change events',
  },
  {
    name: 'animation',
    description: 'Animation-related events',
  },
];

/**
 * Get event name completions for "on event" context (Feature 030)
 *
 * Returns completion items that generate complete event action skeletons.
 * Uses actual Eligius event metadata (43 events) from timeline-events.generated.ts.
 * Each completion item inserts a complete action definition with:
 * - Event name in string literal
 * - camelCase action name with "handle" prefix
 * - Typed parameters from event metadata
 * - Empty action body with cursor positioned inside
 *
 * Examples:
 * - "language-change" → on event "language-change" action handleLanguageChange(language: TLanguageCode) [ ... ]
 * - "timeline-play" → on event "timeline-play" action handleTimelinePlay() [ ... ]
 *
 * @param context - Langium completion context
 * @returns Array of completion items with skeleton generation
 */
export function getEventNameCompletions(_context: CompletionContext): CompletionItem[] {
  return TIMELINE_EVENTS.map(event => createSkeletonCompletionItem(event));
}

/**
 * Get event topic completions for "topic" context
 *
 * Returns completion items for common event topic names with documentation.
 * These completions appear when the user types `topic "`.
 *
 * @param context - Langium completion context
 * @returns Array of completion items for topic names
 */
export function getEventTopicCompletions(_context: CompletionContext): CompletionItem[] {
  return COMMON_EVENT_TOPICS.map(topic => ({
    label: topic.name,
    kind: CompletionItemKind.EnumMember,
    detail: 'Event topic',
    documentation: topic.description,
    insertText: topic.name,
    sortText: `0_${topic.name}`, // Sort by name, with 0_ prefix to prioritize
  }));
}
