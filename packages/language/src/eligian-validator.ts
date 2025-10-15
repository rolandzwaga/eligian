import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    Program,
    Timeline,
    TimelineEvent,
    OperationCall,
    EligianAstType
} from './generated/ast.js';
import type { EligianServices } from './eligian-module.js';
import {
    hasOperation,
    suggestSimilarOperations,
    OPERATION_REGISTRY,
    type OperationParameter
} from '@eligian/compiler';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: EligianServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.EligianValidator;
    const checks: ValidationChecks<EligianAstType> = {
        Program: validator.checkTimelineRequired,
        Timeline: [
            validator.checkValidProvider,
            validator.checkSourceRequired
        ],
        TimelineEvent: [
            validator.checkValidTimeRange,
            validator.checkNonNegativeTimes
        ],
        OperationCall: [
            validator.checkOperationExists,
            validator.checkParameterCount
        ]
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations for Eligian DSL.
 *
 * Validation rules enforce Eligius-specific semantic constraints:
 * - Timeline requirements (exactly one timeline, valid provider, source requirements)
 * - Timeline event constraints (valid time ranges, non-negative times)
 */
export class EligianValidator {

    /**
     * Validate that every program has exactly one timeline declaration.
     *
     * Eligius requires a timeline provider to drive events.
     */
    checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
        const timelines = program.elements.filter(el => el.$type === 'Timeline');

        if (timelines.length === 0) {
            accept('error', 'A timeline declaration is required. Add: timeline "<name>" using <provider> { ... }', {
                node: program,
                property: 'elements'
            });
        } else if (timelines.length > 1) {
            // Multiple timelines - mark all but the first as errors
            for (let i = 1; i < timelines.length; i++) {
                accept('error', 'Only one timeline declaration is allowed per program', {
                    node: timelines[i]
                });
            }
        }
    }

    /**
     * Validate that the timeline provider is one of the supported types.
     *
     * Valid providers: video, audio, raf (RequestAnimationFrame), custom
     */
    checkValidProvider(timeline: Timeline, accept: ValidationAcceptor): void {
        const validProviders: string[] = ['video', 'audio', 'raf', 'custom'];

        if (!validProviders.includes(timeline.provider)) {
            accept('error', `Invalid timeline provider '${timeline.provider}'. Must be one of: ${validProviders.join(', ')}`, {
                node: timeline,
                property: 'provider'
            });
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
            accept('error', `Timeline provider '${timeline.provider}' requires a source file. Add: from "<file path>"`, {
                node: timeline,
                property: 'provider'
            });
        }
    }

    /**
     * Validate that timeline event start time is less than end time.
     *
     * Events must have a valid duration (start < end).
     */
    checkValidTimeRange(event: TimelineEvent, accept: ValidationAcceptor): void {
        const timeRange = event.timeRange;
        if (!timeRange) return;

        // Check if both start and end are time literals (we can validate at compile time)
        const start = timeRange.start;
        const end = timeRange.end;

        if (start.$type === 'TimeLiteral' && end.$type === 'TimeLiteral') {
            if (start.value > end.value) {
                accept('error', `Timeline event start time (${start.value}) must be less than or equal to end time (${end.value})`, {
                    node: timeRange,
                    property: 'start'
                });
            }
        }
    }

    /**
     * Validate that timeline event times are non-negative.
     *
     * Negative times don't make sense in a timeline context.
     */
    checkNonNegativeTimes(event: TimelineEvent, accept: ValidationAcceptor): void {
        const timeRange = event.timeRange;
        if (!timeRange) return;

        // Check start time
        if (timeRange.start.$type === 'TimeLiteral') {
            if (timeRange.start.value < 0) {
                accept('error', `Timeline event start time cannot be negative (got ${timeRange.start.value})`, {
                    node: timeRange,
                    property: 'start'
                });
            }
        }

        // Check end time
        if (timeRange.end.$type === 'TimeLiteral') {
            if (timeRange.end.value < 0) {
                accept('error', `Timeline event end time cannot be negative (got ${timeRange.end.value})`, {
                    node: timeRange,
                    property: 'end'
                });
            }
        }
    }

    /**
     * Validate that an operation exists in the Eligius registry.
     * Provides typo suggestions for similar operation names.
     *
     * This gives instant IDE feedback with red squiggles and helpful suggestions.
     */
    checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
        const opName = operation.operationName;

        if (!hasOperation(opName)) {
            // Operation doesn't exist - suggest similar operations
            const suggestions = suggestSimilarOperations(opName, 3);

            const message = suggestions.length > 0
                ? `Unknown operation '${opName}'. Did you mean: ${suggestions.join(', ')}?`
                : `Unknown operation '${opName}'. Check available operations in the registry.`;

            accept('error', message, {
                node: operation,
                property: 'operationName',
                code: 'unknown-operation'
            });
        }
    }

    /**
     * Validate that the correct number of parameters are provided.
     * Checks against required and optional parameters from the registry.
     */
    checkParameterCount(operation: OperationCall, accept: ValidationAcceptor): void {
        const opName = operation.operationName;

        // Only validate if operation exists (avoid duplicate errors)
        if (!hasOperation(opName)) {
            return;
        }

        const signature = OPERATION_REGISTRY[opName];
        const argumentCount = operation.args.length;
        const required = signature.parameters.filter((p: OperationParameter) => p.required).length;
        const total = signature.parameters.length;

        if (argumentCount < required || argumentCount > total) {
            // Sort parameters: required first, then optional
            const sortedParams = [
                ...signature.parameters.filter((p: OperationParameter) => p.required),
                ...signature.parameters.filter((p: OperationParameter) => !p.required),
            ];

            const paramNames = sortedParams.map((p: OperationParameter) =>
                p.required ? p.name : `[${p.name}]`
            ).join(', ');

            const expectedCount = required === total
                ? `${required}`
                : `${required}-${total}`;

            const message = `Operation '${opName}' expects ${expectedCount} parameter(s), but got ${argumentCount}. Expected: ${opName}(${paramNames})`;

            accept('error', message, {
                node: operation,
                property: 'args',
                code: 'parameter-count-mismatch'
            });
        }
    }
}
