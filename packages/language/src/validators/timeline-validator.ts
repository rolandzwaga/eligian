import { type AstNode, AstUtils, type ValidationAcceptor } from 'langium';
import { interactionLabelTimes } from '../compiler/transformers/navigate-operations.js';
import { propertyChainTimeMessage } from '../compiler/transformers/time-transformer.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import { parseSelector } from '../css/selector-parser.js';
import { reportNotInLayout, selectorNames } from '../css/selector-sources.js';
import {
  type EventTimeReference,
  isBinaryExpression,
  isBinaryTimeExpression,
  isInteractionStatement,
  isProgram,
  isSequenceBlock,
  isSequenceItem,
  isStaggerBlock,
  isTimedEvent,
  isTimeline,
  isTimeRange,
  isUnaryExpression,
  isVariableDeclaration,
  type LabeledEvent,
  type PropertyChainReference,
  type Timeline,
  type TimelineEvent,
  type TimeValue,
  type VariableReference,
} from '../generated/ast.js';
import { readLayoutHtml, scanLayoutElements } from '../html/layout-elements.js';
import {
  containsRelativeTime,
  extractTimeValue,
  parseTimeRange,
} from '../type-system-typir/utils/time-expression.js';
import {
  eventEdgeMessage,
  isEventEdge,
  isTimeConstant,
  labeledEvents,
  laterEventMessage,
  TIME_VALUE_PLACEMENT_MESSAGE,
  timeConstantMisuseMessage,
  timeConstantValue,
} from '../utils/time-constants.js';
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

    // Find the root Program node
    const program = this.getProgram(timeline);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) {
      return;
    }

    // Register CSS imports before validation
    this.ensureCSSImportsRegistered(program, documentUri);

    // Idea #18: classes and ids of the imported CSS and of the layout HTML
    const { classes: availableClasses, ids: availableIDs } = selectorNames(
      this.services,
      program,
      documentUri
    );

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

    // Optional (eligian.validation.selectorNotInLayout): in the CSS but not the layout
    reportNotInLayout(
      timeline.containerSelector,
      timeline,
      this.services,
      program,
      documentUri,
      accept,
      'containerSelector'
    );
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

  /**
   * Idea #10: a time with a unit (`7s`) is only a program-level const's value
   * (also inside arithmetic: `const outro = @beat * 2 + 500ms`).
   */
  checkTimeValuePlacement(node: TimeValue, accept: ValidationAcceptor): void {
    let current: AstNode | undefined = node.$container;
    while (isBinaryExpression(current) || isUnaryExpression(current)) {
      current = current.$container;
    }
    if (isVariableDeclaration(current) && isProgram(current.$container)) return;
    accept('error', TIME_VALUE_PLACEMENT_MESSAGE, { node, code: 'time_value_placement' });
  }

  /**
   * Idea #10: `@beat` in a time must be a time constant; a time constant may
   * only be used in times and in other constants' values.
   */
  checkTimeConstantReference(node: VariableReference, accept: ValidationAcceptor): void {
    const declaration = node.variable?.ref;
    if (isTimeSlot(node)) {
      if (isInteractionStatement(node.$container)) return; // checked by the navigate rules
      const value = timeConstantValue(node);
      if (value.error !== undefined) {
        accept('error', value.error, { node, code: 'invalid_time_constant' });
      }
      return;
    }
    if (!isVariableDeclaration(declaration) || !isTimeConstant(declaration)) return;
    let current: AstNode | undefined = node.$container;
    while (isBinaryExpression(current) || isUnaryExpression(current)) {
      current = current.$container;
    }
    if (isVariableDeclaration(current) && isProgram(current.$container)) return;
    accept('error', timeConstantMisuseMessage(declaration.name), {
      node,
      code: 'time_constant_misuse',
    });
  }

  /**
   * Idea #10: `intro.start` / `intro.end` name an event labeled earlier in the
   * same timeline (any label from the timeline header's `duration`).
   */
  checkEventTimeReference(node: EventTimeReference, accept: ValidationAcceptor): void {
    if (!isEventEdge(node.edge)) {
      accept('error', eventEdgeMessage(node), {
        node,
        property: 'edge',
        code: 'invalid_event_edge',
      });
      return;
    }
    const target = node.event?.ref;
    if (!target) return; // unresolved: reported by the linker
    const interaction = AstUtils.getContainerOfType(node, isInteractionStatement);
    if (interaction) {
      // Idea #19: a seek position uses the labels of its own timeline, a
      // navigate position those of the target timeline (the scope), in any
      // order: the position is not one of the timeline's own times
      if (!interactionLabelTimes(interaction).has(target)) {
        accept(
          'error',
          `The time of '${node.event?.$refText ?? '?'}' is not known at compile time`,
          { node, code: 'event_label_time_unknown' }
        );
      }
      return;
    }
    const timeline = AstUtils.getContainerOfType(node, isTimeline);
    if (!timeline) return;
    const referencing = timeline.events.find(event =>
      AstUtils.streamAst(event).some(child => child === node)
    );
    // Outside the events: the header's `duration`, evaluated after all events
    if (!referencing) return;
    if (!isBefore(target, referencing, node, timeline)) {
      accept('error', laterEventMessage(node.event?.$refText ?? '?'), {
        node,
        code: 'event_label_not_before',
      });
    }
  }

  /** Idea #10: event labels are unique within a timeline. */
  checkEventLabels(timeline: Timeline, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    // `at … as x` events and (idea #11) `… for 5s as x` sequence items
    const labeled = labeledEvents(timeline);
    for (const event of labeled) {
      if (!event.name) continue;
      if (seen.has(event.name)) {
        accept('error', `Duplicate event label '${event.name}' in this timeline`, {
          node: event,
          property: 'name',
          code: 'duplicate_event_label',
        });
      }
      seen.add(event.name);
    }
  }

  // Time-range validation (start < end, non-negative start, positive durations and
  // delays) lives in exactly one place: the Typir rules in
  // type-system-typir/validation/event-validation.ts, which are unit-aware and
  // understand relative and property-chain times. The former checkValidTimeRange /
  // checkNonNegativeTimes rules here compared raw literal values (ignoring units)
  // and duplicated those diagnostics, so they were removed.
}

/** True when `node` sits where the grammar expects a TimeExpression. */
/**
 * Whether the labeled `target` comes before the time `node` (inside the
 * timeline event `referencing`): an earlier event, or an earlier item of the
 * same sequence.
 */
function isBefore(
  target: LabeledEvent,
  referencing: TimelineEvent,
  node: AstNode,
  timeline: Timeline
): boolean {
  const targetEvent: TimelineEvent = isSequenceItem(target) ? target.$container : target;
  const at = timeline.events.indexOf(referencing);
  const targetAt = timeline.events.indexOf(targetEvent);
  if (at !== targetAt) return at > targetAt;
  if (!isSequenceBlock(referencing) || !isSequenceItem(target)) return false;
  const item = referencing.items.find(candidate =>
    AstUtils.streamAst(candidate).some(child => child === node)
  );
  return item !== undefined && referencing.items.indexOf(item) > referencing.items.indexOf(target);
}

function isTimeSlot(node: AstNode): boolean {
  const container = node.$container;
  const property = node.$containerProperty;
  if (isBinaryTimeExpression(container)) return true;
  if (isTimeRange(container)) {
    return property === 'start' || property === 'end' || property === 'duration';
  }
  if (isStaggerBlock(container)) {
    return property === 'delay' || property === 'duration' || property === 'anchor';
  }
  if (isSequenceItem(container)) return property === 'duration';
  if (isInteractionStatement(container)) return property === 'position';
  if (isTimeline(container)) return property === 'duration';
  return false;
}
