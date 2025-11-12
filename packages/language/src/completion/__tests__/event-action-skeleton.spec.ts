/**
 * Unit Tests: Event Action Skeleton Generation (Feature 030 - T002)
 *
 * Tests camelCase conversion, action name generation, parameter formatting,
 * and skeleton template creation.
 */

import { describe, expect, test } from 'vitest';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import {
  createSkeletonCompletionItem,
  createSkeletonTemplate,
  eventNameToCamelCase,
  generateActionName,
  generateParameters,
} from '../event-action-skeleton.js';
import type { TimelineEventMetadata } from '../metadata/timeline-events.generated.js';

describe('eventNameToCamelCase', () => {
  test('converts single-word event name to lowercase', () => {
    expect(eventNameToCamelCase('play')).toBe('play');
  });

  test('converts two-word event name to camelCase', () => {
    expect(eventNameToCamelCase('language-change')).toBe('languageChange');
  });

  test('converts multi-word event name to camelCase', () => {
    expect(eventNameToCamelCase('before-request-video-url')).toBe('beforeRequestVideoUrl');
  });

  test('handles already lowercase names', () => {
    expect(eventNameToCamelCase('timeline-play')).toBe('timelinePlay');
  });

  test('handles names with multiple consecutive hyphens', () => {
    expect(eventNameToCamelCase('user--login')).toBe('userLogin');
  });
});

describe('generateActionName', () => {
  test('adds "handle" prefix to single-word event', () => {
    expect(generateActionName('play')).toBe('handlePlay');
  });

  test('adds "handle" prefix to two-word event with camelCase', () => {
    expect(generateActionName('language-change')).toBe('handleLanguageChange');
  });

  test('adds "handle" prefix to multi-word event with camelCase', () => {
    expect(generateActionName('before-request-video-url')).toBe('handleBeforeRequestVideoUrl');
  });

  test('capitalizes first letter after "handle"', () => {
    const actionName = generateActionName('timeline-play');
    expect(actionName).toBe('handleTimelinePlay');
    expect(actionName.charAt(0)).toBe('h');
    expect(actionName.charAt(6)).toBe('T'); // First letter of "Timeline"
  });
});

describe('generateParameters', () => {
  test('returns empty string for undefined args', () => {
    expect(generateParameters(undefined)).toBe('');
  });

  test('returns empty string for empty args array', () => {
    expect(generateParameters([])).toBe('');
  });

  test('formats single parameter with type', () => {
    const args = [{ name: 'language', type: 'string' }];
    expect(generateParameters(args)).toBe('language: string');
  });

  test('formats multiple parameters with types', () => {
    const args = [
      { name: 'index', type: 'number' },
      { name: 'position', type: 'number' },
    ];
    expect(generateParameters(args)).toBe('index: number, position: number');
  });

  test('handles complex type names', () => {
    const args = [{ name: 'language', type: 'TLanguageCode' }];
    expect(generateParameters(args)).toBe('language: TLanguageCode');
  });

  test('formats three parameters correctly', () => {
    const args = [
      { name: 'index', type: 'number' },
      { name: 'requestedVideoPosition', type: 'number' },
      { name: 'isHistoryRequest', type: 'boolean' },
    ];
    expect(generateParameters(args)).toBe(
      'index: number, requestedVideoPosition: number, isHistoryRequest: boolean'
    );
  });
});

describe('createSkeletonTemplate', () => {
  test('creates skeleton with no parameters', () => {
    const skeleton = createSkeletonTemplate('timeline-play', 'handleTimelinePlay', '');
    expect(skeleton).toBe('on event "timeline-play" action handleTimelinePlay() [\n\t$0\n]');
  });

  test('creates skeleton with single parameter', () => {
    const skeleton = createSkeletonTemplate(
      'language-change',
      'handleLanguageChange',
      'language: string'
    );
    expect(skeleton).toBe(
      'on event "language-change" action handleLanguageChange(language: string) [\n\t$0\n]'
    );
  });

  test('creates skeleton with multiple parameters', () => {
    const skeleton = createSkeletonTemplate(
      'before-request-video-url',
      'handleBeforeRequestVideoUrl',
      'index: number, requestedVideoPosition: number, isHistoryRequest: boolean'
    );
    expect(skeleton).toBe(
      'on event "before-request-video-url" action handleBeforeRequestVideoUrl(index: number, requestedVideoPosition: number, isHistoryRequest: boolean) [\n\t$0\n]'
    );
  });

  test('includes $0 cursor placeholder inside action body', () => {
    const skeleton = createSkeletonTemplate('timeline-play', 'handleTimelinePlay', '');
    expect(skeleton).toContain('[\n\t$0\n]');
  });

  test('uses tab character for indentation', () => {
    const skeleton = createSkeletonTemplate('timeline-play', 'handleTimelinePlay', '');
    expect(skeleton).toContain('\t$0');
  });
});

describe('createSkeletonCompletionItem', () => {
  test('creates completion item with event name label', () => {
    const metadata: TimelineEventMetadata = {
      name: 'language-change',
      description: 'Event: language-change',
      category: 'Language Manager',
      args: [{ name: 'language', type: 'TLanguageCode' }],
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.label).toBe('language-change');
  });

  test('includes generated action name in detail', () => {
    const metadata: TimelineEventMetadata = {
      name: 'language-change',
      description: 'Event: language-change',
      args: [{ name: 'language', type: 'TLanguageCode' }],
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.detail).toBe('Generate action: handleLanguageChange');
  });

  test('includes description in documentation', () => {
    const metadata: TimelineEventMetadata = {
      name: 'timeline-play',
      description: 'Fired when timeline starts playing',
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.documentation).toContain('Fired when timeline starts playing');
  });

  test('includes category in documentation when present', () => {
    const metadata: TimelineEventMetadata = {
      name: 'language-change',
      description: 'Event: language-change',
      category: 'Language Manager',
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.documentation).toContain('Category: Language Manager');
  });

  test('sets kind to Event', () => {
    const metadata: TimelineEventMetadata = {
      name: 'timeline-play',
      description: 'Fired when timeline starts playing',
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.kind).toBe(CompletionItemKind.Event);
  });

  test('sets insertTextFormat to Snippet', () => {
    const metadata: TimelineEventMetadata = {
      name: 'timeline-play',
      description: 'Fired when timeline starts playing',
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.insertTextFormat).toBe(InsertTextFormat.Snippet);
  });

  test('generates complete skeleton in insertText', () => {
    const metadata: TimelineEventMetadata = {
      name: 'language-change',
      description: 'Event: language-change',
      args: [{ name: 'language', type: 'TLanguageCode' }],
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.insertText).toBe(
      'on event "language-change" action handleLanguageChange(language: TLanguageCode) [\n\t$0\n]'
    );
  });

  test('handles event with no parameters', () => {
    const metadata: TimelineEventMetadata = {
      name: 'timeline-play',
      description: 'Fired when timeline starts playing',
      args: [],
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.insertText).toBe('on event "timeline-play" action handleTimelinePlay() [\n\t$0\n]');
  });

  test('handles event with multiple parameters', () => {
    const metadata: TimelineEventMetadata = {
      name: 'before-request-video-url',
      description: 'Event: before-request-video-url',
      category: 'Navigation',
      args: [
        { name: 'index', type: 'number' },
        { name: 'requestedVideoPosition', type: 'number' },
        { name: 'isHistoryRequest', type: 'boolean' },
      ],
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.insertText).toBe(
      'on event "before-request-video-url" action handleBeforeRequestVideoUrl(index: number, requestedVideoPosition: number, isHistoryRequest: boolean) [\n\t$0\n]'
    );
  });

  test('prioritizes event in sort order', () => {
    const metadata: TimelineEventMetadata = {
      name: 'timeline-play',
      description: 'Fired when timeline starts playing',
    };

    const item = createSkeletonCompletionItem(metadata);
    expect(item.sortText).toBe('0_timeline-play');
  });
});
