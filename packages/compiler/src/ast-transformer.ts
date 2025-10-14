/**
 * AST Transformer: Langium AST → Eligius IR
 *
 * This module transforms the parsed Langium AST into our internal
 * Intermediate Representation (IR) which is optimized for further
 * compilation stages (type checking, optimization, emission).
 *
 * Design principles:
 * - External API is immutable (Effect types)
 * - Internal mutation allowed for performance (building IR arrays)
 * - All transformations include source location mapping for error reporting
 * - Type-safe error handling with TransformError
 */

import { Effect } from 'effect';
import type {
    Program,
    Timeline,
    Event,
    Action,
    Selector,
    TimeExpression as AstTimeExpression,
    TimeRange,
    ShowAction,
    HideAction,
    AnimateAction,
    TriggerAction,
    ActionCall,
    RawOperation,
    ActionDefinition,
    Parameter
} from '../../language/src/generated/ast.js';
import type {
    EligiusIR,
    TimelineIR,
    TimelineConfigIR,
    TimelineActionIR,
    EventIR,
    ActionIR,
    TargetSelector,
    TimeExpression,
    ActionDefinitionIR,
    ParameterIR,
    OperationIR,
    OperationConfigIR,
    DurationIR,
    EndableActionIR,
    EngineInfoIR,
    LabelIR,
    LanguageLabelIR
} from './types/eligius-ir.js';
import type { TransformError } from './types/errors.js';
import type { SourceLocation } from './types/common.js';

/**
 * T055: Main transformation function - orchestrates all transformations
 *
 * Transforms a complete Langium Program AST into EligiusIR aligned with IEngineConfiguration.
 *
 * SA002: Updated to generate full Eligius configuration structure
 */
export const transformAST = (program: Program): Effect.Effect<EligiusIR, TransformError> =>
    Effect.gen(function* (_) {
        // Find the timeline (validation ensures exactly one exists)
        const timelineNode = program.elements.find(el => el.$type === 'Timeline') as Timeline | undefined;
        if (!timelineNode) {
            return yield* _(Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidTimeline' as const,
                message: 'No timeline found in program',
                location: getSourceLocation(program)
            }));
        }

        // Transform events (DSL events → TimelineActions)
        const eventNodes = program.elements.filter(el => el.$type === 'Event') as Event[];
        const timelineActions: TimelineActionIR[] = [];
        for (const eventNode of eventNodes) {
            const timelineAction = yield* _(transformEventToTimelineAction(eventNode));
            timelineActions.push(timelineAction);
        }

        // Build TimelineConfigIR from timeline node + events
        const timelineConfig = yield* _(buildTimelineConfig(timelineNode, timelineActions));

        // SA003: Generate default configuration values
        const defaults = createDefaultConfiguration();

        // Build complete Eligius IR
        return {
            // Required configuration fields (SA003)
            id: defaults.id,
            engine: defaults.engine,
            containerSelector: defaults.containerSelector,
            language: defaults.language,
            layoutTemplate: defaults.layoutTemplate,
            availableLanguages: defaults.availableLanguages,
            labels: defaults.labels,

            // Action layers
            initActions: [],         // DSL doesn't support init actions yet
            actions: [],             // DSL doesn't support global actions yet
            eventActions: [],        // DSL doesn't support event actions yet

            // Timeline configuration (plural - array of timelines)
            timelines: [timelineConfig],
            timelineFlow: undefined,  // DSL doesn't support timeline flow yet

            // Provider settings
            timelineProviderSettings: undefined,  // TODO: Extract from timeline if needed

            // Compiler metadata
            metadata: {
                dslVersion: '1.0.0',
                compilerVersion: '0.0.1',
                compiledAt: new Date().toISOString(),
                sourceFile: undefined
            },
            sourceLocation: getSourceLocation(program)
        };
    });

/**
 * SA003: Create default configuration values for required Eligius fields
 *
 * Constitution VII: Uses crypto.randomUUID() for globally unique configuration ID.
 * UUIDs ensure no conflicts when merging configs or running concurrently.
 */
function createDefaultConfiguration() {
    return {
        // Constitution VII: UUID v4 for globally unique configuration ID
        id: crypto.randomUUID(),
        engine: {
            systemName: 'Eligius'
        } as EngineInfoIR,
        containerSelector: 'body',
        language: 'en',
        layoutTemplate: 'default',
        availableLanguages: [
            { code: 'en', label: 'English' }
        ] as LabelIR[],
        labels: [] as LanguageLabelIR[]
    };
}

/**
 * SA002: Build TimelineConfigIR from timeline node and timeline actions
 *
 * This creates the full Eligius TimelineConfiguration structure.
 *
 * Constitution VII: Generates UUID for timeline ID to ensure global uniqueness
 * when configs are merged or multiple timelines exist.
 */
const buildTimelineConfig = (
    timeline: Timeline,
    timelineActions: TimelineActionIR[]
): Effect.Effect<TimelineConfigIR, TransformError> =>
    Effect.gen(function* (_) {
        // Calculate total duration from events
        let maxDuration = 0;
        for (const action of timelineActions) {
            const endTime = typeof action.duration.end === 'number'
                ? action.duration.end
                : 0; // TimeExpressions need evaluation (simplified for now)
            if (endTime > maxDuration) {
                maxDuration = endTime;
            }
        }

        return {
            // Constitution VII: UUID v4 for globally unique timeline ID
            id: crypto.randomUUID(),
            uri: timeline.source || '',  // Empty string for raf, actual path for video/audio
            type: timeline.provider,
            duration: maxDuration,
            loop: false,  // TODO: Could add DSL support for loop
            selector: 'body',  // TODO: Could add DSL support for selector
            timelineActions,
            sourceLocation: getSourceLocation(timeline)
        };
    });

/**
 * SA002: Transform DSL Event → TimelineActionIR
 *
 * DSL "events" are actually Eligius TimelineActions (time-bound actions on a timeline).
 * This is different from Eligius EventActions (which are triggered by custom events).
 *
 * Constitution VII: Generates UUID for action ID to prevent conflicts when multiple
 * actions exist or configs are merged.
 */
const transformEventToTimelineAction = (event: Event): Effect.Effect<TimelineActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const timeRange = event.timeRange;
        if (!timeRange) {
            return yield* _(Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidEvent' as const,
                message: `Event '${event.name}' missing time range`,
                location: getSourceLocation(event)
            }));
        }

        // Transform start and end times
        const start = yield* _(transformTimeExpression(timeRange.start));
        const end = yield* _(transformTimeExpression(timeRange.end));

        // Transform DSL actions → Eligius operations
        const startOperations: OperationConfigIR[] = [];
        for (const actionNode of event.actions) {
            const operations = yield* _(transformActionToOperations(actionNode));
            startOperations.push(...operations);
        }

        return {
            // Constitution VII: UUID v4 for globally unique action ID
            id: crypto.randomUUID(),
            name: event.name,
            duration: {
                start,
                end
            },
            startOperations,
            endOperations: [],  // DSL doesn't distinguish start/end operations yet
            sourceLocation: getSourceLocation(event)
        };
    });

/**
 * SA002: Transform DSL Action → Eligius OperationConfigIR[]
 *
 * Converts high-level DSL actions (show, hide, animate) into low-level Eligius operations.
 */
const transformActionToOperations = (action: Action): Effect.Effect<OperationConfigIR[], TransformError> =>
    Effect.gen(function* (_) {
        const operations: OperationConfigIR[] = [];

        switch (action.$type) {
            case 'ShowAction': {
                const showAction = action as ShowAction;
                const selector = showAction.target ? yield* _(transformSelector(showAction.target)) : undefined;

                const operationData: Record<string, any> = {};
                if (selector) operationData.selector = selectorToString(selector);
                if (showAction.animation) operationData.animation = showAction.animation;
                if (showAction.args?.args) {
                    operationData.animationArgs = showAction.args.args.map(arg => extractArgumentValue(arg));
                }

                operations.push({
                    id: crypto.randomUUID(),
                    systemName: 'showElement',  // Eligius operation name
                    operationData,
                    sourceLocation: getSourceLocation(action)
                });
                break;
            }

            case 'HideAction': {
                const hideAction = action as HideAction;
                const selector = hideAction.target ? yield* _(transformSelector(hideAction.target)) : undefined;

                const operationData: Record<string, any> = {};
                if (selector) operationData.selector = selectorToString(selector);
                if (hideAction.animation) operationData.animation = hideAction.animation;
                if (hideAction.args?.args) {
                    operationData.animationArgs = hideAction.args.args.map(arg => extractArgumentValue(arg));
                }

                operations.push({
                    id: crypto.randomUUID(),
                    systemName: 'hideElement',  // Eligius operation name
                    operationData,
                    sourceLocation: getSourceLocation(action)
                });
                break;
            }

            case 'AnimateAction': {
                const animateAction = action as AnimateAction;
                const selector = animateAction.target ? yield* _(transformSelector(animateAction.target)) : undefined;

                const operationData: Record<string, any> = {};
                if (selector) operationData.selector = selectorToString(selector);
                if (animateAction.animation) operationData.animation = animateAction.animation;
                if (animateAction.args?.args) {
                    operationData.animationArgs = animateAction.args.args.map(arg => extractArgumentValue(arg));
                }

                operations.push({
                    id: crypto.randomUUID(),
                    systemName: 'animateElement',  // Eligius operation name
                    operationData,
                    sourceLocation: getSourceLocation(action)
                });
                break;
            }

            case 'TriggerAction': {
                const triggerAction = action as TriggerAction;
                const selector = triggerAction.target ? yield* _(transformSelector(triggerAction.target)) : undefined;

                operations.push({
                    id: crypto.randomUUID(),
                    systemName: 'triggerAction',  // Eligius operation name
                    operationData: {
                        selector: selector ? selectorToString(selector) : undefined,
                        actionName: triggerAction.actionName
                    },
                    sourceLocation: getSourceLocation(action)
                });
                break;
            }

            default:
                return yield* _(Effect.fail({
                    _tag: 'TransformError' as const,
                    kind: 'InvalidAction' as const,
                    message: `Unknown action type: ${(action as any).$type}`,
                    location: getSourceLocation(action),
                    astNode: JSON.stringify(action)
                }));
        }

        return operations;
    });

/**
 * Helper: Convert TargetSelector to string (e.g., { kind: "id", value: "title" } → "#title")
 */
function selectorToString(selector: TargetSelector): string {
    switch (selector.kind) {
        case 'id':
            return `#${selector.value}`;
        case 'class':
            return `.${selector.value}`;
        case 'element':
            return selector.value;
        case 'query':
            return selector.value;
    }
}

/**
 * T050: Transform Timeline AST → TimelineIR
 * @deprecated Use buildTimelineConfig instead for new code
 */
export const transformTimeline = (timeline: Timeline): Effect.Effect<TimelineIR, TransformError> =>
    Effect.succeed({
        provider: timeline.provider,
        source: timeline.source,
        options: undefined, // TODO: Timeline options support
        sourceLocation: getSourceLocation(timeline)
    });

/**
 * T051: Transform Event AST → EventIR
 */
export const transformEvent = (event: Event): Effect.Effect<EventIR, TransformError> =>
    Effect.gen(function* (_) {
        const timeRange = event.timeRange;
        if (!timeRange) {
            return yield* _(Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidEvent' as const,
                message: `Event '${event.name}' missing time range`,
                location: getSourceLocation(event)
            }));
        }

        // Transform start and end times
        const start = yield* _(transformTimeExpression(timeRange.start));
        const end = yield* _(transformTimeExpression(timeRange.end));

        // Transform actions
        const actions: ActionIR[] = [];
        for (const actionNode of event.actions) {
            const action = yield* _(transformAction(actionNode));
            actions.push(action);
        }

        return {
            id: event.name,
            start,
            end,
            actions,
            conditions: undefined, // TODO: Conditional events support
            metadata: undefined,
            sourceLocation: getSourceLocation(event)
        };
    });

/**
 * T052: Transform Action AST → ActionIR
 */
export const transformAction = (action: Action): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        switch (action.$type) {
            case 'ShowAction':
                return yield* _(transformShowAction(action));
            case 'HideAction':
                return yield* _(transformHideAction(action));
            case 'AnimateAction':
                return yield* _(transformAnimateAction(action));
            case 'TriggerAction':
                return yield* _(transformTriggerAction(action));
            case 'ActionCall':
                return yield* _(transformActionCall(action));
            case 'RawOperation':
                return yield* _(transformRawOperation(action));
            default:
                return yield* _(Effect.fail({
                    _tag: 'TransformError' as const,
                    kind: 'InvalidAction' as const,
                    message: `Unknown action type: ${(action as any).$type}`,
                    location: getSourceLocation(action),
                    astNode: JSON.stringify(action)
                }));
        }
    });

/**
 * Helper: Transform ShowAction
 */
const transformShowAction = (action: ShowAction): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const target = action.target ? yield* _(transformSelector(action.target)) : undefined;

        // Extract animation properties if present
        const properties: Record<string, any> = {};
        if (action.animation) {
            properties.animation = action.animation;
            if (action.args?.args) {
                properties.animationArgs = action.args.args.map(arg => extractArgumentValue(arg));
            }
        }

        return {
            type: 'show' as const,
            target,
            properties: Object.keys(properties).length > 0 ? properties : undefined,
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform HideAction
 */
const transformHideAction = (action: HideAction): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const target = action.target ? yield* _(transformSelector(action.target)) : undefined;

        // Extract animation properties if present
        const properties: Record<string, any> = {};
        if (action.animation) {
            properties.animation = action.animation;
            if (action.args?.args) {
                properties.animationArgs = action.args.args.map(arg => extractArgumentValue(arg));
            }
        }

        return {
            type: 'hide' as const,
            target,
            properties: Object.keys(properties).length > 0 ? properties : undefined,
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform AnimateAction
 */
const transformAnimateAction = (action: AnimateAction): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const target = action.target ? yield* _(transformSelector(action.target)) : undefined;

        const properties: Record<string, any> = {
            animation: action.animation
        };

        if (action.args?.args) {
            properties.animationArgs = action.args.args.map(arg => extractArgumentValue(arg));
        }

        return {
            type: 'animate' as const,
            target,
            properties,
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform TriggerAction
 */
const transformTriggerAction = (action: TriggerAction): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const target = action.target ? yield* _(transformSelector(action.target)) : undefined;

        return {
            type: 'trigger' as const,
            target,
            properties: {
                actionName: action.actionName
            },
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform ActionCall (call to user-defined action)
 */
const transformActionCall = (action: ActionCall): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const actionName = action.action?.$refText || 'unknown';

        const properties: Record<string, any> = {
            call: actionName
        };

        if (action.args?.args) {
            properties.callArgs = action.args.args.map(arg => extractArgumentValue(arg));
        }

        return {
            type: 'custom' as const,
            target: undefined,
            properties,
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform RawOperation (escape hatch)
 */
const transformRawOperation = (action: RawOperation): Effect.Effect<ActionIR, TransformError> =>
    Effect.gen(function* (_) {
        const properties: Record<string, any> = {};

        if (action.properties) {
            for (const prop of action.properties) {
                properties[prop.key] = extractPropertyValue(prop.value);
            }
        }

        return {
            type: 'custom' as const,
            target: undefined,
            properties,
            sourceLocation: getSourceLocation(action)
        };
    });

/**
 * Helper: Transform ActionDefinition (reusable action)
 */
const transformActionDefinition = (actionDef: ActionDefinition): Effect.Effect<ActionDefinitionIR, TransformError> =>
    Effect.gen(function* (_) {
        const parameters: ParameterIR[] = actionDef.parameters.map(param => ({
            name: param.name,
            type: param.type,
            defaultValue: param.defaultValue ? extractArgumentValue(param.defaultValue) : undefined,
            sourceLocation: getSourceLocation(param)
        }));

        const operations: OperationIR[] = [];
        // TODO: Transform operations when we add support for action definitions

        return {
            name: actionDef.name,
            parameters,
            operations,
            sourceLocation: getSourceLocation(actionDef)
        };
    });

/**
 * T053: Transform Selector AST → TargetSelector
 */
export const transformSelector = (selector: Selector): Effect.Effect<TargetSelector, TransformError> =>
    Effect.gen(function* (_) {
        switch (selector.$type) {
            case 'IdSelector':
                return {
                    kind: 'id' as const,
                    value: selector.value
                };
            case 'ClassSelector':
                return {
                    kind: 'class' as const,
                    value: selector.value
                };
            case 'ElementSelector':
                return {
                    kind: 'element' as const,
                    value: selector.value
                };
            default:
                return yield* _(Effect.fail({
                    _tag: 'TransformError' as const,
                    kind: 'InvalidExpression' as const,
                    message: `Unknown selector type: ${(selector as any).$type}`,
                    location: getSourceLocation(selector)
                }));
        }
    });

/**
 * T054: Transform TimeExpression AST → TimeExpression IR
 */
export const transformTimeExpression = (expr: AstTimeExpression): Effect.Effect<TimeExpression, TransformError> =>
    Effect.gen(function* (_) {
        switch (expr.$type) {
            case 'NumberLiteral':
                return {
                    kind: 'literal' as const,
                    value: expr.value
                };
            case 'VariableReference':
                return {
                    kind: 'variable' as const,
                    name: expr.name
                };
            case 'BinaryExpression':
                const left = yield* _(transformTimeExpression(expr.left));
                const right = yield* _(transformTimeExpression(expr.right));
                return {
                    kind: 'binary' as const,
                    op: expr.op as '+' | '-' | '*' | '/',
                    left,
                    right
                };
            default:
                return yield* _(Effect.fail({
                    _tag: 'TransformError' as const,
                    kind: 'InvalidExpression' as const,
                    message: `Unknown time expression type: ${(expr as any).$type}`,
                    location: getSourceLocation(expr)
                }));
        }
    });

/**
 * Helper: Extract argument value from AST argument node
 */
function extractArgumentValue(arg: any): any {
    if (!arg) return null;

    switch (arg.$type) {
        case 'StringLiteral':
            return arg.value;
        case 'NumberLiteral':
            return arg.value;
        case 'BooleanLiteral':
            return arg.value === true || arg.value === 'true';
        case 'NullLiteral':
            return null;
        case 'IdSelector':
            return `#${arg.value}`;
        case 'ClassSelector':
            return `.${arg.value}`;
        default:
            // For complex time expressions, serialize them
            return serializeTimeExpression(arg);
    }
}

/**
 * Helper: Extract property value from AST property value node
 */
function extractPropertyValue(value: any): any {
    if (!value) return null;

    // Handle literals
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    // Handle AST nodes
    switch (value.$type) {
        case 'StringLiteral':
            return value.value;
        case 'NumberLiteral':
            return value.value;
        case 'BooleanLiteral':
            return value.value === true || value.value === 'true';
        case 'NullLiteral':
            return null;
        default:
            return String(value);
    }
}

/**
 * Helper: Serialize time expression to string
 */
function serializeTimeExpression(expr: any): string | number {
    if (!expr) return 0;

    switch (expr.$type) {
        case 'NumberLiteral':
            return expr.value;
        case 'VariableReference':
            return `$${expr.name}`;
        case 'BinaryExpression':
            return `(${serializeTimeExpression(expr.left)} ${expr.op} ${serializeTimeExpression(expr.right)})`;
        default:
            return 0;
    }
}

/**
 * T057: Helper to extract source location from any AST node
 */
function getSourceLocation(node: any): SourceLocation {
    const cstNode = node.$cstNode;
    if (cstNode) {
        return {
            file: undefined,
            line: cstNode.range.start.line + 1, // Langium uses 0-based, we use 1-based
            column: cstNode.range.start.character + 1,
            length: cstNode.range.end.offset - cstNode.range.start.offset
        };
    }

    // Fallback if CST node not available
    return {
        file: undefined,
        line: 1,
        column: 1,
        length: 0
    };
}
