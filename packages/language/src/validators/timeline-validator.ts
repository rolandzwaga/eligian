import type { ValidationAcceptor } from 'langium';
import { findSimilarClasses } from '../css/levenshtein.js';
import { parseSelector } from '../css/selector-parser.js';
import type { Timeline, TimelineEvent } from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validations for timelines and timeline events.
 */
export class TimelineValidator extends BaseValidator {
  /**
   * Validate that the timeline provider is one of the supported types.
   *
   * Valid providers: video, audio, raf (RequestAnimationFrame), custom
   */
  checkValidProvider(timeline: Timeline, accept: ValidationAcceptor): void {
    const validProviders: string[] = ['video', 'audio', 'raf', 'custom'];

    if (!validProviders.includes(timeline.provider)) {
      accept(
        'error',
        `Invalid timeline provider '${timeline.provider}'. Must be one of: ${validProviders.join(', ')}`,
        {
          node: timeline,
          property: 'provider',
        }
      );
    }
  }

  /**
   * Validate that video/audio providers have a source specified.
   *
   * Video and audio timelines require a source file path.
   */
  checkSourceRequired(timeline: Timeline, accept: ValidationAcceptor): void {
    const requiresSource = timeline.provider === 'video' || timeline.provider === 'audio';

    if (requiresSource && !timeline.source) {
      accept(
        'error',
        `Timeline provider '${timeline.provider}' requires a source file. Add: from "<file path>"`,
        {
          node: timeline,
          property: 'provider',
        }
      );
    }
  }

  /**
   * Validate timeline container selector against imported CSS (Feature 013)
   *
   * Timeline containers must be defined in imported CSS files.
   * Validates that all classes and IDs in the selector exist.
   */
  checkTimelineContainerSelector(timeline: Timeline, accept: ValidationAcceptor): void {
    if (!this.services) {
      return;
    }

    const cssRegistry = this.services.css.CSSRegistry;

    // Find the root Program node
    const program = this.getProgram(timeline);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) {
      return;
    }

    // Register CSS imports before validation
    this.ensureCSSImportsRegistered(program, documentUri);

    // Get available CSS classes and IDs
    const availableClasses = cssRegistry.getClassesForDocument(documentUri);
    const availableIDs = cssRegistry.getIDsForDocument(documentUri);

    // Note: If no CSS files are imported (empty sets), we still validate.
    // With no CSS imported, ALL classes/IDs are invalid since there's no external CSS in Eligian.

    // Parse timeline container selector
    const { classes, ids, valid, error } = parseSelector(timeline.containerSelector);

    // Check syntax
    if (!valid) {
      accept('error', `Invalid CSS selector syntax: ${error}`, {
        node: timeline,
        property: 'containerSelector',
        data: { code: 'invalid_css_selector_syntax' },
      });
      return;
    }

    // Validate classes exist
    for (const className of classes) {
      if (!availableClasses.has(className)) {
        const suggestions = findSimilarClasses(className, availableClasses);
        const suggestionText =
          suggestions.length > 0
            ? ` (Did you mean: ${suggestions.map(s => `.${s}`).join(', ')}?)`
            : '';
        accept(
          'error',
          `Unknown CSS class in timeline container selector: '${className}'${suggestionText}`,
          {
            node: timeline,
            property: 'containerSelector',
            data: { code: 'unknown_css_class_in_selector', suggestions },
          }
        );
      }
    }

    // Validate IDs exist
    for (const id of ids) {
      if (!availableIDs.has(id)) {
        accept('error', `Unknown CSS ID in timeline container selector: '${id}'`, {
          node: timeline,
          property: 'containerSelector',
          data: { code: 'unknown_css_id_in_selector' },
        });
      }
    }
  }

  /**
   * Validate that timeline event start time is less than end time.
   *
   * Events must have a valid duration (start < end).
   * Note: Only applies to TimedEvent, not SequenceBlock.
   */
  checkValidTimeRange(event: TimelineEvent, accept: ValidationAcceptor): void {
    // SequenceBlock and StaggerBlock don't have timeRange, only TimedEvent does
    if (event.$type === 'SequenceBlock' || event.$type === 'StaggerBlock') return;

    const timeRange = event.timeRange;
    if (!timeRange) return;

    // Check if both start and end are time literals (we can validate at compile time)
    const start = timeRange.start;
    const end = timeRange.end;

    // Defensive: ensure start and end exist before checking $type
    if (!start || !end) return;

    if (start.$type === 'TimeLiteral' && end.$type === 'TimeLiteral') {
      if (start.value > end.value) {
        accept(
          'error',
          `Timeline event start time (${start.value}) must be less than or equal to end time (${end.value})`,
          {
            node: timeRange,
            property: 'start',
          }
        );
      }
    }
  }

  /**
   * Validate that timeline event times are non-negative.
   *
   * Negative times don't make sense in a timeline context.
   * Note: Only applies to TimedEvent, not SequenceBlock.
   */
  checkNonNegativeTimes(event: TimelineEvent, accept: ValidationAcceptor): void {
    // SequenceBlock and StaggerBlock don't have timeRange, only TimedEvent does
    if (event.$type === 'SequenceBlock' || event.$type === 'StaggerBlock') return;

    const timeRange = event.timeRange;
    if (!timeRange) return;

    // Check start time
    if (timeRange.start && timeRange.start.$type === 'TimeLiteral') {
      if (timeRange.start.value < 0) {
        accept(
          'error',
          `Timeline event start time cannot be negative (got ${timeRange.start.value})`,
          {
            node: timeRange,
            property: 'start',
          }
        );
      }
    }

    // Check end time
    if (timeRange.end && timeRange.end.$type === 'TimeLiteral') {
      if (timeRange.end.value < 0) {
        accept('error', `Timeline event end time cannot be negative (got ${timeRange.end.value})`, {
          node: timeRange,
          property: 'end',
        });
      }
    }
  }
}
