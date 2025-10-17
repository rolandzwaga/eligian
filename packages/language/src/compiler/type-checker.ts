/**
 * Type Checker: Validates Eligius-specific type constraints
 *
 * This module performs type checking on the transformed IR to ensure:
 * - Time expressions evaluate to numbers
 * - Durations are numeric
 * - String literals are used correctly (sources, selectors)
 *
 * Unlike semantic validation (which runs on AST), type checking runs on IR
 * after transformation and ensures Eligius runtime requirements are met.
 */

import { Effect } from 'effect';
import type {
  DurationIR,
  EligiusIR,
  EndableActionIR,
  EventActionIR,
  OperationConfigIR,
  TimeExpression,
  TimelineActionIR,
  TimelineConfigIR,
} from './types/eligius-ir.js';
import type { TypeError } from './types/errors.js';

/**
 * SA005b: Main type-checking function (Updated for new IR structure)
 *
 * Validates the entire IR and returns a typed version (currently just the same IR)
 * or fails with TypeError if constraints are violated.
 */
export const typeCheck = (ir: EligiusIR): Effect.Effect<EligiusIR, TypeError> =>
  Effect.gen(function* (_) {
    // Validate required configuration fields
    yield* _(checkConfigurationTypes(ir));

    // Validate timelines array
    for (const timeline of ir.timelines) {
      yield* _(checkTimelineConfigTypes(timeline));
    }

    // Validate action layers
    // initActions are operations (OperationConfigIR), not full actions
    for (const operation of ir.initActions) {
      yield* _(checkOperationTypes(operation));
    }

    for (const action of ir.actions) {
      yield* _(checkEndableActionTypes(action));
    }

    for (const action of ir.eventActions) {
      yield* _(checkEventActionTypes(action));
    }

    // If all checks pass, return the IR unchanged
    return ir;
  });

/**
 * SA005b: Check required IEngineConfiguration fields
 */
const checkConfigurationTypes = (ir: EligiusIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check required string fields
    if (typeof ir.id !== 'string' || ir.id.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Configuration id must be a non-empty string',
          location: ir.sourceLocation,
          expected: 'string',
          actual: typeof ir.id,
        })
      );
    }

    if (typeof ir.containerSelector !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'containerSelector must be a string',
          location: ir.sourceLocation,
          expected: 'string',
          actual: typeof ir.containerSelector,
        })
      );
    }

    if (typeof ir.language !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'language must be a string',
          location: ir.sourceLocation,
          expected: 'string',
          actual: typeof ir.language,
        })
      );
    }
  });

/**
 * SA005b: Check TimelineConfig type constraints
 */
const checkTimelineConfigTypes = (timeline: TimelineConfigIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check that uri is a string (if present)
    if (timeline.uri !== undefined && typeof timeline.uri !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Timeline uri must be a string',
          location: timeline.sourceLocation,
          expected: 'string',
          actual: typeof timeline.uri,
          hint: 'Provide a string path to the media file',
        })
      );
    }

    // Validate type is a known timeline type
    // T271: Updated to include 'animation' and 'mediaplayer' (Eligius schema types)
    const validTypes = ['animation', 'mediaplayer', 'video', 'audio', 'raf', 'custom'];
    if (!validTypes.includes(timeline.type)) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: `Invalid timeline type: ${timeline.type}`,
          location: timeline.sourceLocation,
          expected: validTypes.join(' | '),
          actual: timeline.type,
          hint: 'Use one of: animation, mediaplayer, video, audio, raf, custom',
        })
      );
    }

    // Check timeline actions
    for (const action of timeline.timelineActions) {
      yield* _(checkTimelineActionTypes(action));
    }
  });

/**
 * SA005b: Check TimelineAction type constraints
 */
const checkTimelineActionTypes = (action: TimelineActionIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check duration
    yield* _(checkDurationTypes(action.duration, action.sourceLocation));

    // Check operations
    for (const op of action.startOperations) {
      yield* _(checkOperationTypes(op));
    }

    for (const op of action.endOperations) {
      yield* _(checkOperationTypes(op));
    }
  });

/**
 * SA005b: Check EndableAction type constraints
 */
const checkEndableActionTypes = (action: EndableActionIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check operations
    for (const op of action.startOperations) {
      yield* _(checkOperationTypes(op));
    }

    for (const op of action.endOperations) {
      yield* _(checkOperationTypes(op));
    }
  });

/**
 * SA005b: Check EventAction type constraints
 */
const checkEventActionTypes = (action: EventActionIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check eventName is a string
    if (typeof action.eventName !== 'string' || action.eventName.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'EventAction eventName must be a non-empty string',
          location: action.sourceLocation,
          expected: 'string',
          actual: typeof action.eventName,
        })
      );
    }

    // Check operations
    for (const op of action.startOperations) {
      yield* _(checkOperationTypes(op));
    }
  });

/**
 * SA005b: Check Duration type constraints
 */
const checkDurationTypes = (duration: DurationIR, location: any): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check that start and end are numbers (TimeExpressions should be evaluated by now)
    if (typeof duration.start !== 'number') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Duration start must be a number',
          location,
          expected: 'number',
          actual: typeof duration.start,
          hint: 'Time expressions should be evaluated before type checking',
        })
      );
    }

    if (typeof duration.end !== 'number') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Duration end must be a number',
          location,
          expected: 'number',
          actual: typeof duration.end,
        })
      );
    }

    // Validate that end >= start
    if (duration.end < duration.start) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Duration end must be >= start',
          location,
          expected: `end >= ${duration.start}`,
          actual: String(duration.end),
          hint: 'Ensure event end time is after start time',
        })
      );
    }
  });

/**
 * SA005b: Check Operation type constraints
 */
const checkOperationTypes = (operation: OperationConfigIR): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // Check systemName is a string
    if (typeof operation.systemName !== 'string' || operation.systemName.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Operation systemName must be a non-empty string',
          location: operation.sourceLocation,
          expected: 'string',
          actual: typeof operation.systemName,
        })
      );
    }

    // Validate operationData contains valid JSON values (if present)
    if (operation.operationData) {
      // Basic validation - ensure it's an object
      if (typeof operation.operationData !== 'object' || operation.operationData === null) {
        return yield* _(
          Effect.fail({
            _tag: 'TypeError' as const,
            message: 'Operation operationData must be an object',
            location: operation.sourceLocation,
            expected: 'object',
            actual: typeof operation.operationData,
          })
        );
      }
    }
  });

/**
 * T060: Check that a time expression evaluates to a number
 */
const checkTimeType = (
  expr: number | TimeExpression,
  context: string,
  location: any
): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    // If it's already a number, it's valid
    if (typeof expr === 'number') {
      return;
    }

    // Check TimeExpression structure
    if (typeof expr !== 'object' || !expr.kind) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: `${context} must evaluate to a number`,
          location,
          expected: 'number | TimeExpression',
          actual: typeof expr,
          hint: 'Use a numeric literal or time expression',
        })
      );
    }

    // Validate based on expression kind
    switch (expr.kind) {
      case 'literal':
        if (typeof expr.value !== 'number') {
          return yield* _(
            Effect.fail({
              _tag: 'TypeError' as const,
              message: `${context}: Literal value must be a number`,
              location,
              expected: 'number',
              actual: typeof expr.value,
            })
          );
        }
        break;

      case 'variable':
        // Variables are assumed to be numeric at runtime
        // TODO: Add variable type tracking if we support variable declarations
        break;

      case 'binary': {
        // Recursively check operands
        yield* _(checkTimeType(expr.left, `${context} (left operand)`, location));
        yield* _(checkTimeType(expr.right, `${context} (right operand)`, location));

        // Validate operator
        const validOps = ['+', '-', '*', '/'];
        if (!validOps.includes(expr.op)) {
          return yield* _(
            Effect.fail({
              _tag: 'TypeError' as const,
              message: `${context}: Invalid binary operator '${expr.op}'`,
              location,
              expected: validOps.join(' | '),
              actual: expr.op,
            })
          );
        }
        break;
      }

      default:
        return yield* _(
          Effect.fail({
            _tag: 'TypeError' as const,
            message: `${context}: Unknown time expression kind`,
            location,
            expected: 'literal | variable | binary',
            actual: (expr as any).kind,
          })
        );
    }
  });

// NOTE: The following functions (_checkActionTypes and checkActionProperties) are currently unused.
// They were designed for an older ActionIR structure that included .target and .properties fields.
// The current IR structure uses OperationConfigIR which is validated by checkOperationTypes() above.
// These functions are commented out to avoid type errors but retained for reference.

/*
 * Helper: Check action type constraints (OBSOLETE - kept for reference)
 */
// const _checkActionTypes = (action: ActionIR): Effect.Effect<void, TypeError> =>
//   Effect.gen(function* (_) {
//     // T062: Check that target selector is valid (if present)
//     if (action.target) {
//       const validKinds = ['id', 'class', 'element', 'query'];
//       if (!validKinds.includes(action.target.kind)) {
//         return yield* _(
//           Effect.fail({
//             _tag: 'TypeError' as const,
//             message: `Invalid target selector kind: ${action.target.kind}`,
//             location: action.sourceLocation,
//             expected: validKinds.join(' | '),
//             actual: action.target.kind,
//             hint: 'Use #id, .class, or element selectors',
//           })
//         );
//       }
//
//       if (typeof action.target.value !== 'string') {
//         return yield* _(
//           Effect.fail({
//             _tag: 'TypeError' as const,
//             message: 'Target selector value must be a string',
//             location: action.sourceLocation,
//             expected: 'string',
//             actual: typeof action.target.value,
//           })
//         );
//       }
//     }
//
//     // T061: Check numeric durations in properties
//     if (action.properties) {
//       yield* _(checkActionProperties(action));
//     }
//   });

/*
 * T061: Check numeric duration constraints in action properties (OBSOLETE - kept for reference)
 */
// const checkActionProperties = (action: ActionIR): Effect.Effect<void, TypeError> =>
//   Effect.gen(function* (_) {
//     if (!action.properties) return;
//
//     // Check duration property if present
//     if ('duration' in action.properties) {
//       const duration = action.properties.duration;
//       if (typeof duration !== 'number' && typeof duration !== 'undefined') {
//         return yield* _(
//           Effect.fail({
//             _tag: 'TypeError' as const,
//             message: 'Action duration must be a number',
//             location: action.sourceLocation,
//             expected: 'number',
//             actual: typeof duration,
//             hint: 'Specify duration in milliseconds (e.g., 500)',
//           })
//         );
//       }
//
//       // Validate duration is positive
//       if (typeof duration === 'number' && duration < 0) {
//         return yield* _(
//           Effect.fail({
//             _tag: 'TypeError' as const,
//             message: 'Action duration must be non-negative',
//             location: action.sourceLocation,
//             expected: 'number >= 0',
//             actual: String(duration),
//             hint: 'Use a positive duration value',
//           })
//         );
//       }
//     }
//
//     // Check animation arguments if present (should be numeric for durations)
//     if ('animationArgs' in action.properties && Array.isArray(action.properties.animationArgs)) {
//       const args = action.properties.animationArgs;
//
//       // First argument is typically duration
//       if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0) {
//         return yield* _(
//           Effect.fail({
//             _tag: 'TypeError' as const,
//             message: 'Animation duration (first argument) must be non-negative',
//             location: action.sourceLocation,
//             expected: 'number >= 0',
//             actual: String(args[0]),
//           })
//         );
//       }
//     }
//   });

/**
 * T062: Validate string literals
 *
 * Ensures that strings are used in appropriate contexts.
 * This is mostly handled by the grammar, but we do additional validation here.
 */
export const checkStringLiteral = (
  value: any,
  context: string,
  location: any
): Effect.Effect<void, TypeError> =>
  Effect.gen(function* (_) {
    if (typeof value !== 'string') {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: `${context} must be a string`,
          location,
          expected: 'string',
          actual: typeof value,
        })
      );
    }

    // Additional validation for specific contexts
    if (context.includes('selector') && value.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'TypeError' as const,
          message: 'Selector value cannot be empty',
          location,
          expected: 'non-empty string',
          actual: '""',
        })
      );
    }
  });
