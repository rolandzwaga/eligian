import type { ValidationAcceptor } from 'langium';
import { propertyChainTimeMessage } from '../compiler/transformers/time-transformer.js';
import { findSimilarClasses } from '../css/levenshtein.js';
import { parseSelector } from '../css/selector-parser.js';
import {
  isBinaryTimeExpression,
  isNavigateStatement,
  isSequenceItem,
  isStaggerBlock,
  isTimeRange,
  type PropertyChainReference,
  type Timeline,
} from '../generated/ast.js';
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
  return false;
}
