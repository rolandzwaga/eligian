import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    Program,
    Timeline,
    Event,
    ShowAction,
    HideAction,
    AnimateAction,
    EligianAstType
} from './generated/ast.js';
import type { EligianServices } from './eligian-module.js';

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
        Event: [
            validator.checkUniqueEventIds,
            validator.checkValidTimeRange,
            validator.checkNonNegativeTimes
        ],
        ShowAction: validator.checkTargetRequired,
        HideAction: validator.checkTargetRequired,
        AnimateAction: validator.checkTargetRequired
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations for Eligius DSL.
 *
 * Validation rules enforce Eligius-specific semantic constraints:
 * - Timeline requirements (exactly one timeline, valid provider, source requirements)
 * - Event constraints (unique IDs, valid time ranges, non-negative times)
 * - Action requirements (targets required for certain actions)
 */
export class EligianValidator {

    /**
     * T036: Validate that every program has exactly one timeline declaration.
     *
     * Eligius requires a timeline provider to drive events.
     */
    checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
        const timelines = program.elements.filter(el => el.$type === 'Timeline');

        if (timelines.length === 0) {
            accept('error', 'A timeline declaration is required. Add: timeline <provider> from "<source>"', {
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
     * T042: Validate that the timeline provider is one of the supported types.
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
     * T043: Validate that video/audio providers have a source specified.
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
     * T037: Validate that event IDs are unique within a program.
     *
     * Duplicate event IDs would cause runtime conflicts in Eligius.
     */
    checkUniqueEventIds(event: Event, accept: ValidationAcceptor): void {
        const program = this.getContainingProgram(event);
        if (!program) return;

        const events = program.elements.filter(el => el.$type === 'Event') as Event[];
        const duplicates = events.filter(e => e.name === event.name);

        if (duplicates.length > 1) {
            // Only mark this as error if it's not the first occurrence
            const firstOccurrence = duplicates[0];
            if (event !== firstOccurrence) {
                accept('error', `Duplicate event ID '${event.name}'. Event IDs must be unique within a program`, {
                    node: event,
                    property: 'name'
                });
            }
        }
    }

    /**
     * T038: Validate that event start time is less than end time.
     *
     * Events must have a valid duration (start < end).
     */
    checkValidTimeRange(event: Event, accept: ValidationAcceptor): void {
        const timeRange = event.timeRange;
        if (!timeRange) return;

        // Check if both start and end are number literals (we can validate at compile time)
        const start = timeRange.start;
        const end = timeRange.end;

        if (start.$type === 'NumberLiteral' && end.$type === 'NumberLiteral') {
            if (start.value >= end.value) {
                accept('error', `Event start time (${start.value}) must be less than end time (${end.value})`, {
                    node: timeRange,
                    property: 'start'
                });
            }
        }
    }

    /**
     * T039: Validate that event times are non-negative.
     *
     * Negative times don't make sense in a timeline context.
     */
    checkNonNegativeTimes(event: Event, accept: ValidationAcceptor): void {
        const timeRange = event.timeRange;
        if (!timeRange) return;

        // Check start time
        if (timeRange.start.$type === 'NumberLiteral') {
            if (timeRange.start.value < 0) {
                accept('error', `Event start time cannot be negative (got ${timeRange.start.value})`, {
                    node: timeRange,
                    property: 'start'
                });
            }
        }

        // Check end time
        if (timeRange.end.$type === 'NumberLiteral') {
            if (timeRange.end.value < 0) {
                accept('error', `Event end time cannot be negative (got ${timeRange.end.value})`, {
                    node: timeRange,
                    property: 'end'
                });
            }
        }
    }

    /**
     * T041: Validate that show/hide/animate actions have a target specified.
     *
     * These actions require a target element to operate on.
     */
    checkTargetRequired(action: ShowAction | HideAction | AnimateAction, accept: ValidationAcceptor): void {
        if (!action.target) {
            const actionType = action.$type;
            accept('error', `${actionType} action requires a target. Add a selector: #id, .class, or element`, {
                node: action
            });
        }
    }

    /**
     * Helper: Get the containing Program node for an event.
     * Used for cross-event validations like unique ID checking.
     */
    private getContainingProgram(event: Event): Program | undefined {
        let node: any = event.$container;
        while (node) {
            if (node.$type === 'Program') {
                return node as Program;
            }
            node = node.$container;
        }
        return undefined;
    }
}
