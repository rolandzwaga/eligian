import type { ValidationAcceptor, ValidationChecks } from 'langium';
import {
  hasOperation,
  OPERATION_REGISTRY,
  validateControlFlowPairing,
  validateDependencies,
  validateOperationExists,
  validateParameterCount,
  validateParameterTypes,
} from './compiler/index.js';
import type { EligianServices } from './eligian-module.js';
import type {
  BreakStatement,
  ContinueStatement,
  EligianAstType,
  EndableActionDefinition,
  InlineEndableAction,
  OperationCall,
  OperationStatement,
  Program,
  RegularActionDefinition,
  Timeline,
  TimelineEvent,
} from './generated/ast.js';
import { OperationDataTracker } from './operation-data-tracker.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: EligianServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.EligianValidator;
  const checks: ValidationChecks<EligianAstType> = {
    Program: validator.checkTimelineRequired,
    Timeline: [validator.checkValidProvider, validator.checkSourceRequired],
    TimelineEvent: [validator.checkValidTimeRange, validator.checkNonNegativeTimes],
    OperationCall: [
      validator.checkOperationExists,
      validator.checkParameterCount,
      validator.checkParameterTypes,
      // TODO T216: Re-enable checkDependencies once we implement proper dependency tracking across sequences
      // validator.checkDependencies
    ],
    BreakStatement: validator.checkBreakInsideLoop,
    ContinueStatement: validator.checkContinueInsideLoop,
    RegularActionDefinition: [
      validator.checkControlFlowPairing,
      validator.checkErasedPropertiesInAction, // T254-T255: Erased property validation
    ],
    EndableActionDefinition: [
      validator.checkControlFlowPairingInStartOps,
      validator.checkControlFlowPairingInEndOps,
      validator.checkErasedPropertiesInStartOps, // T254-T255: Erased property validation
      validator.checkErasedPropertiesInEndOps, // T254-T255: Erased property validation
    ],
    InlineEndableAction: [
      validator.checkControlFlowPairingInInlineStart,
      validator.checkControlFlowPairingInInlineEnd,
      validator.checkErasedPropertiesInInlineStart, // T254-T255: Erased property validation
      validator.checkErasedPropertiesInInlineEnd, // T254-T255: Erased property validation
    ],
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations for Eligian DSL.
 *
 * Validation rules enforce Eligius-specific semantic constraints:
 * - Timeline requirements (at least one timeline, valid provider, source requirements)
 * - Timeline event constraints (valid time ranges, non-negative times)
 */
export class EligianValidator {
  /**
   * Validate that every program has at least one timeline declaration.
   *
   * Eligius requires at least one timeline provider to drive events.
   * Multiple timelines are supported for complex scenarios (e.g., synchronized video+audio).
   */
  checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
    const timelines = program.elements.filter(el => el.$type === 'Timeline');

    if (timelines.length === 0) {
      accept(
        'error',
        'A timeline declaration is required. Add: timeline "<name>" using <provider> { ... }',
        {
          node: program,
          property: 'elements',
        }
      );
    }
    // Multiple timelines are now allowed (removed restriction)
  }

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

  /**
   * Validate that an operation exists in the Eligius registry.
   * Provides typo suggestions for similar operation names.
   *
   * This gives instant IDE feedback with red squiggles and helpful suggestions.
   */
  checkOperationExists(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = operation.operationName;

    // Use compiler validation logic
    const error = validateOperationExists(opName);

    if (error) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
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

    // Use compiler validation logic
    const error = validateParameterCount(signature, argumentCount);

    if (error) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: operation,
        property: 'args',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate parameter types match expected types from operation signature.
   * Performs compile-time type checking where possible.
   *
   * Property chains and expressions are validated at runtime, not compile-time.
   */
  checkParameterTypes(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = operation.operationName;

    // Only validate if operation exists (avoid duplicate errors)
    if (!hasOperation(opName)) {
      return;
    }

    const signature = OPERATION_REGISTRY[opName];

    // Use compiler validation logic
    const errors = validateParameterTypes(signature, operation.args);

    // Report each type error
    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: operation,
        property: 'args',
        index: error.parameterIndex,
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate dependencies for operation calls.
   *
   * Note: This is a simplified implementation that only checks if the operation
   * HAS dependencies (warns user they need to ensure dependencies are available).
   * Full dependency tracking across operation sequences would require analyzing
   * the entire action/event context, which is more complex and will be implemented
   * in a future enhancement.
   *
   * For now, we just inform users about required dependencies.
   */
  checkDependencies(operation: OperationCall, accept: ValidationAcceptor): void {
    const opName = operation.operationName;

    // Only validate if operation exists (avoid duplicate errors)
    if (!hasOperation(opName)) {
      return;
    }

    const signature = OPERATION_REGISTRY[opName];

    // If operation has no dependencies, no validation needed
    if (signature.dependencies.length === 0) {
      return;
    }

    // For now, we just validate against an empty set (no outputs available)
    // This will warn about ALL dependencies since we don't track outputs yet
    // TODO: Enhance this to track outputs across operation sequences in the same action/event
    const availableOutputs = new Set<string>();
    const errors = validateDependencies(signature, availableOutputs);

    // Report dependency warnings
    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      // Use 'warning' instead of 'error' for now since we can't track dependencies perfectly
      // Once we implement full dependency tracking, change this to 'error'
      accept('warning', message, {
        node: operation,
        property: 'operationName',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in regular action operations.
   * Checks that when/endWhen and forEach/endForEach are properly paired.
   */
  checkControlFlowPairing(action: RegularActionDefinition, accept: ValidationAcceptor): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = action.operations
      .filter(op => op.$type === 'OperationCall')
      .map(op => (op as any).operationName);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: action,
        property: 'operations',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in endable action start operations.
   */
  checkControlFlowPairingInStartOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = action.startOperations
      .filter(op => op.$type === 'OperationCall')
      .map(op => (op as any).operationName);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: action,
        property: 'startOperations',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in endable action end operations.
   */
  checkControlFlowPairingInEndOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = action.endOperations
      .filter(op => op.$type === 'OperationCall')
      .map(op => (op as any).operationName);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: action,
        property: 'endOperations',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in inline endable action start operations.
   */
  checkControlFlowPairingInInlineStart(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = action.startOperations
      .filter(op => op.$type === 'OperationCall')
      .map(op => (op as any).operationName);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: action,
        property: 'startOperations',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate control flow pairing in inline endable action end operations.
   */
  checkControlFlowPairingInInlineEnd(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    // Filter to only OperationCall (not IfStatement, ForStatement, VariableDeclaration)
    const operationNames = action.endOperations
      .filter(op => op.$type === 'OperationCall')
      .map(op => (op as any).operationName);
    const errors = validateControlFlowPairing(operationNames);

    for (const error of errors) {
      const message = error.hint ? `${error.message}. ${error.hint}` : error.message;

      accept('error', message, {
        node: action,
        property: 'endOperations',
        code: error.code.toLowerCase(),
      });
    }
  }

  /**
   * Validate erased properties in regular action operations.
   * Checks that operations don't access properties erased by previous operations.
   */
  checkErasedPropertiesInAction(action: RegularActionDefinition, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.operations, accept, action);
  }

  /**
   * Validate erased properties in endable action start operations.
   */
  checkErasedPropertiesInStartOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    this.validateOperationSequence(action.startOperations, accept, action);
  }

  /**
   * Validate erased properties in endable action end operations.
   */
  checkErasedPropertiesInEndOps(action: EndableActionDefinition, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.endOperations, accept, action);
  }

  /**
   * Validate erased properties in inline endable action start operations.
   */
  checkErasedPropertiesInInlineStart(
    action: InlineEndableAction,
    accept: ValidationAcceptor
  ): void {
    this.validateOperationSequence(action.startOperations, accept, action);
  }

  /**
   * Validate erased properties in inline endable action end operations.
   */
  checkErasedPropertiesInInlineEnd(action: InlineEndableAction, accept: ValidationAcceptor): void {
    this.validateOperationSequence(action.endOperations, accept, action);
  }

  /**
   * Helper: Validate a sequence of operation statements for erased property access.
   *
   * Walks through operation sequence and tracks operationData state using OperationDataTracker.
   * Reports errors when operations have missing dependencies (properties that were erased
   * or never created).
   *
   * @param operations - Sequence of operation statements to validate
   * @param accept - Validation acceptor for reporting errors
   * @param context - Parent action node for error reporting
   * @param tracker - Optional tracker to continue from (for nested scopes)
   */
  private validateOperationSequence(
    operations: Array<OperationStatement>,
    accept: ValidationAcceptor,
    context: RegularActionDefinition | EndableActionDefinition | InlineEndableAction,
    tracker?: OperationDataTracker
  ): void {
    // Create new tracker if not provided (top-level call)
    const currentTracker = tracker ?? new OperationDataTracker();

    // Walk through operations and track operationData state
    for (const statement of operations) {
      if (statement.$type === 'OperationCall') {
        const opName = statement.operationName;

        // Only validate if operation exists (avoid duplicate errors)
        if (!hasOperation(opName)) {
          continue;
        }

        // Check if this operation has missing dependencies
        const missingDependencies = currentTracker.processOperation(opName);

        // Report errors for missing dependencies
        for (const depName of missingDependencies) {
          const erasurePoint = currentTracker.findErasurePoint(depName);

          if (erasurePoint) {
            // Property was erased by a previous operation
            accept(
              'error',
              `Property '${depName}' is not available - it was erased by operation '${erasurePoint.operation}'`,
              {
                node: statement,
                property: 'operationName',
                code: 'erased-property-access',
              }
            );
          } else {
            // Property was never created (dependency not satisfied)
            accept(
              'error',
              `Property '${depName}' is not available - ensure it is created by a previous operation`,
              {
                node: statement,
                property: 'operationName',
                code: 'missing-dependency',
              }
            );
          }
        }
      } else if (statement.$type === 'IfStatement') {
        // Handle if/else branches (T255: Control flow support)
        // Validate both branches with current tracker state
        // Note: For a complete implementation, we would need to merge both branch states
        // and only keep properties available in BOTH branches
        this.validateOperationSequence(statement.thenOps, accept, context, currentTracker.clone());
        this.validateOperationSequence(statement.elseOps, accept, context, currentTracker.clone());
      } else if (statement.$type === 'ForStatement') {
        // Handle loop body (T255: Control flow support)
        // Validate loop body with current tracker state
        // Note: Full loop analysis would require fixed-point iteration
        // to determine which properties are stable across all iterations
        this.validateOperationSequence(statement.body, accept, context, currentTracker.clone());
      } else if (statement.$type === 'VariableDeclaration') {
      }
    }
  }

  /**
   * Validate that 'break' statement only appears inside a for loop.
   *
   * Break/continue syntactic sugar only works with forEach operations,
   * so they can only be used inside for loops.
   */
  checkBreakInsideLoop(stmt: BreakStatement, accept: ValidationAcceptor): void {
    if (!this.isInsideForLoop(stmt)) {
      accept('error', "'break' can only be used inside a loop", {
        node: stmt,
      });
    }
  }

  /**
   * Validate that 'continue' statement only appears inside a for loop.
   *
   * Break/continue syntactic sugar only works with forEach operations,
   * so they can only be used inside for loops.
   */
  checkContinueInsideLoop(stmt: ContinueStatement, accept: ValidationAcceptor): void {
    if (!this.isInsideForLoop(stmt)) {
      accept('error', "'continue' can only be used inside a loop", {
        node: stmt,
      });
    }
  }

  /**
   * Helper: Check if an AST node is inside a ForStatement.
   *
   * Walks up the AST container chain looking for a ForStatement.
   */
  private isInsideForLoop(node: BreakStatement | ContinueStatement): boolean {
    let current: any = node.$container;

    while (current) {
      if (current.$type === 'ForStatement') {
        return true;
      }
      current = current.$container;
    }

    return false;
  }
}
