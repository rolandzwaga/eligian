import type { ValidationAcceptor } from 'langium';
import { propertyChainTimeMessage } from '../compiler/transformers/time-transformer.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import { parseSelector } from '../css/selector-parser.js';
import {
  isBinaryTimeExpression,
  isNavigateStatement,
  isSequenceItem,
  isStaggerBlock,
  isTimedEvent,
  isTimeline,
  isTimeRange,
  type PropertyChainReference,
  type Timeline,
} from '../generated/ast.js';
import { readLayoutHtml, scanLayoutElements } from '../html/layout-elements.js';
import {
  containsRelativeTime,
  extractTimeValue,
  parseTimeRange,
} from '../type-system-typir/utils/time-expression.js';
import {
  RELATIVE_DURATION_MESSAGE,
  SCROLL_DURATION_REQUIRED_MESSAGE,
} from '../utils/time-units.js';
import { duplicateLifecycleMessage, lifecycleBlocks } from '../utils/timeline-lifecycle.js';
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
    const validProviders: string[] = ['video', 'audio', 'raf', 'scroll', 'custom'];

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
   * Header options (Feature 049): `using scroll "<selector>"`, `loop`, `duration <time>`.
   *
   * - A scroll timeline needs a duration (its scroll range maps onto it), the
   *   compiler rejects it otherwise.
   * - Only scroll timelines take a scroll selector.
   * - The duration must be a positive, non-relative time.
   * - Events that end after an explicit duration are never reached: a warning.
   */
  /** Audit idea #6: at most one `on enter` and one `on leave` block per timeline. */
  checkTimelineLifecycle(timeline: Timeline, accept: ValidationAcceptor): void {
    for (const block of lifecycleBlocks(timeline).duplicates) {
      accept('error', duplicateLifecycleMessage(block.kind), {
        node: block,
        property: 'kind',
        code: 'duplicate_lifecycle_block',
      });
    }
  }

  checkTimelineOptions(timeline: Timeline, accept: ValidationAcceptor): void {
    if (timeline.provider === 'scroll' && !timeline.duration) {
      accept('error', SCROLL_DURATION_REQUIRED_MESSAGE, { node: timeline, property: 'provider' });
    }
    if (timeline.scrollSelector !== undefined && timeline.provider !== 'scroll') {
      accept(
        'error',
        `Only scroll timelines take a scroll container selector ('using scroll "<selector>"'); remove it from this '${timeline.provider}' timeline`,
        { node: timeline, property: 'scrollSelector' }
      );
    }

    if (!timeline.duration) return;
    if (containsRelativeTime(timeline.duration)) {
      accept('error', RELATIVE_DURATION_MESSAGE, { node: timeline, property: 'duration' });
      return;
    }
    const duration = extractTimeValue(timeline.duration);
    if (duration === undefined) return; // property chains are reported by checkPropertyChainInTime
    if (duration <= 0) {
      accept('error', `Timeline duration must be greater than 0 (got ${duration}s)`, {
        node: timeline,
        property: 'duration',
      });
      return;
    }

    for (const event of timeline.events) {
      if (!isTimedEvent(event)) continue;
      const { end } = parseTimeRange(event.timeRange);
      if (end !== undefined && end > duration) {
        accept(
          'warning',
          `This event ends at ${end}s, after the timeline's duration (${duration}s), so its end is never reached`,
          { node: event, property: 'timeRange' }
        );
      }
    }
  }

  /**
   * Scroll timeline container (Feature 049). The element a scroll timeline
   * follows must exist and be scrollable.
   *
   * - An explicit scroll selector must name ids/classes that the layout HTML or
   *   the imported CSS defines (error). The default, the container selector, is
   *   already checked by {@link checkTimelineContainerSelector}.
   * - Some CSS rule or inline style for it should set `overflow-y` (or
   *   `overflow`) to auto or scroll. This is a heuristic (styles can also come
   *   from runtime operations), so it is a warning. Whether the content is
   *   actually taller than the element is only known at runtime; the preview
   *   checks that.
   */
  checkScrollContainer(timeline: Timeline, accept: ValidationAcceptor): void {
    if (timeline.provider !== 'scroll' || !this.services) return;
    const program = this.getProgram(timeline);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return;

    const explicit = timeline.scrollSelector !== undefined;
    const selector = timeline.scrollSelector ?? timeline.containerSelector;
    if (selector === undefined || selector.trim() === '') {
      if (explicit) {
        accept('error', 'Invalid CSS selector syntax: the scroll container selector is empty', {
          node: timeline,
          property: 'scrollSelector',
          data: { code: 'invalid_css_selector_syntax' },
        });
      }
      return;
    }
    const { classes, ids, valid, error } = parseSelector(selector);
    if (!valid) {
      if (explicit) {
        accept('error', `Invalid CSS selector syntax: ${error}`, {
          node: timeline,
          property: 'scrollSelector',
          data: { code: 'invalid_css_selector_syntax' },
        });
      }
      return;
    }

    this.ensureCSSImportsRegistered(program, documentUri);
    const cssRegistry = this.services.css.CSSRegistry;
    const html = readLayoutHtml(
      program,
      this.services.html.HTMLRegistry.getHTMLForDocument(documentUri)?.content
    );
    const layout = html !== undefined ? scanLayoutElements(html) : undefined;
    const property = explicit ? 'scrollSelector' : 'containerSelector';

    if (explicit) {
      const cssClasses = cssRegistry.getClassesForDocument(documentUri);
      const cssIds = cssRegistry.getIDsForDocument(documentUri);
      const unknown = [
        ...ids.filter(id => !cssIds.has(id) && !layout?.ids.has(id)).map(id => `#${id}`),
        ...classes
          .filter(name => !cssClasses.has(name) && !layout?.classes.has(name))
          .map(name => `.${name}`),
      ];
      for (const token of unknown) {
        accept(
          'error',
          `Unknown scroll container '${token}': it is not in the layout HTML or the imported CSS`,
          { node: timeline, property, data: { code: 'unknown_scroll_container' } }
        );
      }
      if (unknown.length > 0) return;
    }

    // Element selectors (e.g. "main") cannot be matched to rules here
    if (ids.length === 0 && classes.length === 0) return;
    const scrollable = cssRegistry.getScrollableForDocument(documentUri);
    const scrolls =
      ids.some(id => scrollable.ids.has(id) || layout?.scrollableIds.has(id)) ||
      classes.some(name => scrollable.classes.has(name) || layout?.scrollableClasses.has(name));
    if (!scrolls) {
      accept(
        'warning',
        `The scroll container '${selector}' may not scroll: no CSS rule or inline style for it sets overflow-y (or overflow) to auto or scroll, and the timeline only moves when it scrolls`,
        { node: timeline, property, data: { code: 'scroll_container_not_scrollable' } }
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

    // Guard against incomplete parses: `containerSelector` is mandatory in the
    // grammar, but Langium error-recovery yields partial Timeline nodes with an
    // undefined selector mid-edit. Skip here (the missing token is already a
    // syntax error) rather than emitting a spurious "invalid selector" diagnostic.
    if (timeline.containerSelector === undefined) {
      return;
    }

    // parseSelector accepts "" and "   " (no selectors, nothing invalid), but an empty
    // container selector matches nothing at runtime.
    if (timeline.containerSelector.trim() === '') {
      accept('error', 'Invalid CSS selector syntax: the timeline container selector is empty', {
        node: timeline,
        property: 'containerSelector',
        data: { code: 'invalid_css_selector_syntax' },
      });
      return;
    }

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
   * Report a property chain (`$scope.x`) used as a time: in a time range, a stagger delay or
   * duration, a sequence item duration or a navigate position (directly or inside time
   * arithmetic). The grammar accepts it, but Eligius needs numeric times at configuration time,
   * so the compiler rejects it (time-transformer.ts) with the same message.
   */
  checkPropertyChainInTime(node: PropertyChainReference, accept: ValidationAcceptor): void {
    if (!isTimeSlot(node)) return;
    accept('error', propertyChainTimeMessage(node), {
      node,
      data: { code: 'property_chain_in_time_expression' },
    });
  }

  // Time-range validation (start < end, non-negative start, positive durations and
  // delays) lives in exactly one place: the Typir rules in
  // type-system-typir/validation/event-validation.ts, which are unit-aware and
  // understand relative and property-chain times. The former checkValidTimeRange /
  // checkNonNegativeTimes rules here compared raw literal values (ignoring units)
  // and duplicated those diagnostics, so they were removed.
}

/** True when `node` sits where the grammar expects a TimeExpression. */
function isTimeSlot(node: PropertyChainReference): boolean {
  const container = node.$container;
  const property = node.$containerProperty;
  if (isBinaryTimeExpression(container)) return true;
  if (isTimeRange(container)) {
    return property === 'start' || property === 'end' || property === 'duration';
  }
  if (isStaggerBlock(container)) return property === 'delay' || property === 'duration';
  if (isSequenceItem(container)) return property === 'duration';
  if (isNavigateStatement(container)) return property === 'position';
  if (isTimeline(container)) return property === 'duration';
  return false;
}
