/**
 * `navigate` sugar expansion helpers (hub ↔ chapter timeline switching).
 *
 * A `NavigateStatement` (`on click "#sel" navigate "Target" at 5s`) expands to
 * two cooperating pieces:
 *
 *  1. Three call-site operations that attach a DOM click listener:
 *       selectElement(selector)
 *       getControllerInstance("DOMEventListenerController")
 *       addControllerToElement({ eventName: "click", actions: [<synthetic name>] })
 *
 *  2. One synthetic action per DISTINCT (target, position) that the listener
 *     invokes, which broadcasts the engine's timeline-switch request:
 *       broadcastEvent({ eventName: "request-timeline-uri", eventArgs: [target, position] })
 *
 * The synthetic action name must match between the call-site expansion
 * (operation-transformer) and the central action generator (ast-transformer),
 * which never share state — so it is derived purely from (target, position) via
 * {@link syntheticNavActionName}.
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type { TimeExpression as AstTimeExpression } from '../../generated/ast.js';
import type { SourceLocation } from '../types/common.js';
import type { EndableActionIR, OperationConfigIR } from '../types/eligius-ir.js';
import { getSourceLocation } from './source-location.js';
import { evaluateTimeExpression, transformTimeExpression } from './time-transformer.js';

/** Eligius eventbus event the engine listens on to switch timelines. */
const REQUEST_TIMELINE_URI = 'request-timeline-uri';

/** The controller used to attach a DOM click listener to an element. */
const DOM_EVENT_LISTENER_CONTROLLER = 'DOMEventListenerController';

/**
 * Deterministic synthetic action name for a navigate target + position.
 *
 * Pure function of its inputs so the call site and the central generator agree
 * without sharing state. Distinct positions produce distinct names so two
 * navigates to the same timeline at different positions don't collide.
 */
export function syntheticNavActionName(target: string, position: number): string {
  const slug =
    target
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'timeline';
  const posSuffix = position === 0 ? '' : `__${String(position).replace(/[^a-z0-9]+/gi, '_')}`;
  return `__nav__${slug}${posSuffix}`;
}

/**
 * Resolve the optional `at <time>` position of a navigate to a numeric
 * (seconds) value. Absent → 0. Must be a constant time expression.
 */
export const resolveNavPosition = (
  position: AstTimeExpression | undefined
): Effect.Effect<number, TransformError> =>
  Effect.gen(function* () {
    if (!position) {
      return 0;
    }
    const ir = yield* transformTimeExpression(position);
    return yield* Effect.try({
      try: () => evaluateTimeExpression(ir),
      catch: () =>
        ({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: 'navigate position must be a constant time expression',
          location: getSourceLocation(position),
        }) satisfies TransformError,
    });
  });

/** The three call-site operations a `navigate` expands to. */
export function buildNavigateOperations(
  selector: string,
  actionName: string,
  sourceLocation: SourceLocation
): OperationConfigIR[] {
  return [
    {
      id: crypto.randomUUID(),
      systemName: 'selectElement',
      operationData: { selector },
      sourceLocation,
    },
    {
      id: crypto.randomUUID(),
      systemName: 'getControllerInstance',
      operationData: { systemName: DOM_EVENT_LISTENER_CONTROLLER },
      sourceLocation,
    },
    {
      id: crypto.randomUUID(),
      systemName: 'addControllerToElement',
      operationData: { eventName: 'click', actions: [actionName] },
      sourceLocation,
    },
  ];
}

/** The synthetic broadcast action that performs the timeline switch. */
export function buildNavTargetAction(
  target: string,
  position: number,
  sourceLocation: SourceLocation
): EndableActionIR {
  return {
    id: crypto.randomUUID(),
    name: syntheticNavActionName(target, position),
    startOperations: [
      {
        id: crypto.randomUUID(),
        systemName: 'broadcastEvent',
        operationData: { eventName: REQUEST_TIMELINE_URI, eventArgs: [target, position] },
        sourceLocation,
      },
    ],
    endOperations: [],
    sourceLocation,
  };
}
