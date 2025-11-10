/**
 * Event Name Completions (Feature 028 - T044)
 *
 * Provides autocomplete suggestions for Eligius event names when typing `on event "`.
 * Suggests common built-in Eligius events that can be handled by event actions.
 */

import type { CompletionContext } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import { CompletionItemKind } from 'vscode-languageserver';

/**
 * Common Eligius event names that can be handled by event actions
 *
 * These are the standard events emitted by the Eligius timeline engine.
 * Event actions can listen for these events and execute operations in response.
 */
const ELIGIUS_EVENT_NAMES: Array<{ name: string; description: string }> = [
  {
    name: 'timeline-play',
    description: 'Fired when timeline starts playing',
  },
  {
    name: 'timeline-pause',
    description: 'Fired when timeline is paused',
  },
  {
    name: 'timeline-complete',
    description: 'Fired when timeline completes playback',
  },
  {
    name: 'timeline-stop',
    description: 'Fired when timeline is stopped',
  },
  {
    name: 'timeline-seek',
    description: 'Fired when timeline position changes',
  },
  {
    name: 'language-change',
    description: 'Fired when application language changes',
  },
  {
    name: 'user-login',
    description: 'Fired when user logs in',
  },
  {
    name: 'user-logout',
    description: 'Fired when user logs out',
  },
  {
    name: 'data-sync',
    description: 'Fired when data synchronization completes',
  },
  {
    name: 'click',
    description: 'Custom click event (emitted by application)',
  },
  {
    name: 'hover',
    description: 'Custom hover event (emitted by application)',
  },
  {
    name: 'submit',
    description: 'Custom submit event (emitted by application)',
  },
];

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
 * Get event name completions for "on event" context
 *
 * Returns completion items for common Eligius event names with documentation.
 * These completions appear when the user types `on event "`.
 *
 * @param context - Langium completion context
 * @returns Array of completion items for event names
 */
export function getEventNameCompletions(_context: CompletionContext): CompletionItem[] {
  return ELIGIUS_EVENT_NAMES.map(event => ({
    label: event.name,
    kind: CompletionItemKind.Event,
    detail: 'Eligius event',
    documentation: event.description,
    insertText: event.name,
    sortText: `0_${event.name}`, // Sort by name, with 0_ prefix to prioritize
  }));
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
