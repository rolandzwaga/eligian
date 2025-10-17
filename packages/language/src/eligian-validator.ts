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
  EligianAstType,
  EndableActionDefinition,
  Expression,
  InlineEndableAction,
  OperationCall,
  OperationStatement,
  Program,
  RegularActionDefinition,
  Timeline,
  TimelineEvent,
  VariableDeclaration,
} from './generated/ast.js';
import { isParameterReference, isVariableReference } from './generated/ast.js';
import { OperationDataTracker } from './operation-data-tracker.js';
import type { EligianType } from './type-system/index.js';
import {
  getOperationParameterTypes,
  inferLiteralType,
  inferParameterTypes,
  TypeEnvironment,
  validateTypeCompatibility,
} from './type-system/index.js';

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
    RegularActionDefinition: [
      validator.checkControlFlowPairing,
      validator.checkErasedPropertiesInAction, // T254-T255: Erased property validation
      validator.checkTypeAnnotationsInAction, // Phase 18 T304: Type checking
    ],
    EndableActionDefinition: [
      validator.checkControlFlowPairingInStartOps,
      validator.checkControlFlowPairingInEndOps,
      validator.checkErasedPropertiesInStartOps, // T254-T255: Erased property validation
      validator.checkErasedPropertiesInEndOps, // T254-T255: Erased property validation
      validator.checkTypeAnnotationsInStartOps, // Phase 18 T304: Type checking
      validator.checkTypeAnnotationsInEndOps, // Phase 18 T304: Type checking
    ],
    InlineEndableAction: [
      validator.checkControlFlowPairingInInlineStart,
      validator.checkControlFlowPairingInInlineEnd,
      validator.checkErasedPropertiesInInlineStart, // T254-T255: Erased property validation
      validator.checkErasedPropertiesInInlineEnd, // T254-T255: Erased property validation
      validator.checkTypeAnnotationsInInlineStart, // Phase 18 T304: Type checking
      validator.checkTypeAnnotationsInInlineEnd, // Phase 18 T304: Type checking
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
   * Collect type annotations from action parameters (Phase 18 - T294 + T311).
   *
   * Extracts type annotations from parameter declarations and attempts to infer
   * types for parameters without annotations (US3). Returns a map of parameter
   * name -> EligianType.
   *
   * **Type Inference (T311)**:
   * - Parameters with explicit annotations use the annotated type
   * - Parameters without annotations are inferred from their usage in operations
   * - If inference fails (conflicts or no usage), parameter remains 'unknown'
   *
   * @param action - Regular or endable action definition
   * @returns Map of parameter names to their types (annotated or inferred)
   */
  collectTypeAnnotations(
    action: RegularActionDefinition | EndableActionDefinition
  ): Map<string, string> {
    const typeMap = new Map<string, string>();

    // Step 1: Extract explicit type annotations from parameters
    for (const param of action.parameters) {
      if (param.type) {
        // Type annotation exists - use it
        typeMap.set(param.name, param.type);
      }
    }

    // Step 2: Infer types for parameters without annotations (T311 - US3)
    const result = inferParameterTypes(action);

    // Check if inference succeeded (returns Map) or failed (returns TypeError[])
    if (result instanceof Map) {
      // Inference succeeded - merge inferred types with explicit annotations
      for (const [paramName, inferredType] of result.entries()) {
        // Only add inferred types for parameters without explicit annotations
        if (!typeMap.has(paramName)) {
          typeMap.set(paramName, inferredType);
        }
      }
    }
    // If inference failed (errors), we just skip inference for those parameters
    // They will remain unknown and won't be type-checked

    return typeMap;
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
   * Phase 18 T304: Type checking for regular action operations.
   * Validates type annotations for parameters and variables.
   */
  checkTypeAnnotationsInAction(action: RegularActionDefinition, accept: ValidationAcceptor): void {
    // Collect parameter type annotations
    const paramTypes = this.collectTypeAnnotations(action);

    // Validate operations with type checking
    this.validateTypeSequence(action.operations, accept, action, paramTypes);
  }

  /**
   * Phase 18 T304: Type checking for endable action start operations.
   */
  checkTypeAnnotationsInStartOps(
    action: EndableActionDefinition,
    accept: ValidationAcceptor
  ): void {
    const paramTypes = this.collectTypeAnnotations(action);
    this.validateTypeSequence(action.startOperations, accept, action, paramTypes);
  }

  /**
   * Phase 18 T304: Type checking for endable action end operations.
   */
  checkTypeAnnotationsInEndOps(action: EndableActionDefinition, accept: ValidationAcceptor): void {
    const paramTypes = this.collectTypeAnnotations(action);
    this.validateTypeSequence(action.endOperations, accept, action, paramTypes);
  }

  /**
   * Phase 18 T304: Type checking for inline endable action start operations.
   */
  checkTypeAnnotationsInInlineStart(action: InlineEndableAction, accept: ValidationAcceptor): void {
    const paramTypes = new Map<string, string>(); // Inline actions don't have parameters
    this.validateTypeSequence(action.startOperations, accept, action, paramTypes);
  }

  /**
   * Phase 18 T304: Type checking for inline endable action end operations.
   */
  checkTypeAnnotationsInInlineEnd(action: InlineEndableAction, accept: ValidationAcceptor): void {
    const paramTypes = new Map<string, string>(); // Inline actions don't have parameters
    this.validateTypeSequence(action.endOperations, accept, action, paramTypes);
  }

  /**
   * Phase 18 T304: Helper to validate a sequence of operations with type checking.
   *
   * Walks through operations and tracks variable types using TypeEnvironment.
   * This is parallel to validateOperationSequence() which tracks erased properties.
   *
   * @param operations - Sequence of operation statements to validate
   * @param accept - Validation acceptor for reporting errors
   * @param context - Parent action node for error reporting
   * @param paramTypes - Map of parameter names to their annotated types
   * @param env - Optional type environment to continue from (for nested scopes)
   */
  private validateTypeSequence(
    operations: Array<OperationStatement>,
    accept: ValidationAcceptor,
    context: RegularActionDefinition | EndableActionDefinition | InlineEndableAction,
    paramTypes: Map<string, string>,
    env?: TypeEnvironment
  ): void {
    // Create new environment if not provided (top-level call)
    const currentEnv = env ?? new TypeEnvironment();

    // Walk through operations and track variable types
    for (const statement of operations) {
      if (statement.$type === 'VariableDeclaration') {
        // T301: Track variable type
        this.checkVariableDeclarationType(statement, currentEnv, accept);
      } else if (statement.$type === 'IfStatement') {
        // Handle if/else branches with cloned environment
        this.validateTypeSequence(
          statement.thenOps,
          accept,
          context,
          paramTypes,
          currentEnv.clone()
        );
        this.validateTypeSequence(
          statement.elseOps,
          accept,
          context,
          paramTypes,
          currentEnv.clone()
        );
      } else if (statement.$type === 'ForStatement') {
        // Handle loop body with cloned environment
        this.validateTypeSequence(statement.body, accept, context, paramTypes, currentEnv.clone());
      } else if (statement.$type === 'OperationCall') {
        // T300: Type check operation call arguments
        this.checkOperationCallTypes(statement, currentEnv, paramTypes, accept);
      }
    }
  }

  /**
   * Type checking for operation call arguments (Phase 18 - T300).
   *
   * Validates that arguments passed to operations match the expected types
   * from the operation registry. Checks parameter references and variable references.
   *
   * @param call - Operation call to validate
   * @param env - Type environment for looking up variable types
   * @param paramTypes - Map of parameter names to their annotated types
   * @param accept - Validation acceptor for reporting errors
   */
  private checkOperationCallTypes(
    call: OperationCall,
    env: TypeEnvironment,
    paramTypes: Map<string, string>,
    accept: ValidationAcceptor
  ): void {
    const opName = call.operationName;

    // Only validate if operation exists (avoid duplicate errors)
    if (!hasOperation(opName)) {
      return;
    }

    // Get expected parameter types from operation registry
    const expectedTypes = getOperationParameterTypes(opName);
    if (expectedTypes.size === 0) {
      return; // No type information available for this operation
    }

    // Check each argument against expected type
    const signature = OPERATION_REGISTRY[opName];
    for (let i = 0; i < call.args.length && i < signature.parameters.length; i++) {
      const arg = call.args[i];
      const param = signature.parameters[i];
      const expectedType = expectedTypes.get(param.name);

      if (!expectedType) {
        continue; // No type info for this parameter
      }

      // Infer the actual type of the argument
      let actualType: EligianType;

      if (isParameterReference(arg)) {
        // It's a parameter reference - check annotation
        const paramName = arg.parameter.ref?.name ?? '';
        const annotatedType = paramTypes.get(paramName);
        if (!annotatedType) {
          continue; // No type annotation - skip checking
        }
        actualType = annotatedType as EligianType;
      } else if (isVariableReference(arg)) {
        // It's a variable reference - check environment
        const varName = arg.variable.ref?.name ?? '';
        const varType = env.getVariableType(varName);
        if (!varType) {
          continue; // Variable not in environment - skip checking
        }
        actualType = varType;
      } else {
        // It's a literal - infer type
        actualType = inferLiteralType(arg as Expression);
        if (actualType === 'unknown') {
          continue; // Can't infer type - skip checking
        }
      }

      // Check type compatibility
      const error = validateTypeCompatibility(actualType, expectedType, {
        line: 0,
        column: 0,
        length: 0,
      });

      if (error) {
        accept(
          'error',
          `Argument ${i + 1} for '${opName}': ${error.message}${error.hint ? `. ${error.hint}` : ''}`,
          {
            node: call,
            property: 'args',
            index: i,
            code: 'type-mismatch',
          }
        );
      }
    }
  }

  /**
   * Type checking for variable declarations (Phase 18 - T301).
   *
   * Infers the type of the variable from its initialization expression
   * and adds it to the type environment for subsequent references.
   *
   * @param decl - Variable declaration to check
   * @param env - Type environment for tracking variable types
   * @param accept - Validation acceptor for reporting errors
   */
  checkVariableDeclarationType(
    decl: VariableDeclaration,
    env: TypeEnvironment,
    _accept: ValidationAcceptor
  ): void {
    // Infer type from the initialization expression
    const inferredType = inferLiteralType(decl.value as Expression);

    // Add to type environment
    env.addVariable(decl.name, inferredType);

    // Note: We don't report errors here - just track the type
    // Type mismatches will be caught when the variable is used
  }

  /**
   * Type checking for variable references (Phase 18 - T302).
   *
   * Validates that a variable reference (@varName) has a compatible type
   * with the expected type for its usage context.
   *
   * @param expr - Expression that may be a variable reference
   * @param expectedType - Expected type for this expression
   * @param env - Type environment for looking up variable types
   * @param accept - Validation acceptor for reporting errors
   * @param node - AST node for error reporting
   * @param property - Property name for error reporting
   */
  checkVariableReferenceType(
    expr: Expression,
    expectedType: EligianType,
    env: TypeEnvironment,
    accept: ValidationAcceptor,
    node: any,
    property: string
  ): void {
    if (!isVariableReference(expr)) return;

    // Look up variable type in environment
    const actualType = env.getVariableType(expr.variable.ref?.name ?? '');

    if (!actualType) {
      // Variable not found in type environment - skip type checking
      // (the cross-reference validator will catch undefined variables)
      return;
    }

    // Check type compatibility
    const error = validateTypeCompatibility(actualType, expectedType, {
      line: 0,
      column: 0,
      length: 0,
    });

    if (error) {
      accept('error', error.message + (error.hint ? `. ${error.hint}` : ''), {
        node,
        property,
        code: 'type-mismatch',
      });
    }
  }

  /**
   * Type checking for parameter references (Phase 18 - T303).
   *
   * Validates that a parameter reference (bare identifier) has a compatible type
   * with the expected type for its usage context.
   *
   * @param expr - Expression that may be a parameter reference
   * @param expectedType - Expected type for this expression
   * @param paramTypes - Map of parameter name → annotated type
   * @param accept - Validation acceptor for reporting errors
   * @param node - AST node for error reporting
   * @param property - Property name for error reporting
   */
  checkParameterReferenceType(
    expr: Expression,
    expectedType: EligianType,
    paramTypes: Map<string, EligianType>,
    accept: ValidationAcceptor,
    node: any,
    property: string
  ): void {
    if (!isParameterReference(expr)) return;

    // Look up parameter type from annotations
    const actualType = paramTypes.get(expr.parameter.ref?.name ?? '');

    if (!actualType) {
      // Parameter has no type annotation - skip type checking
      // (type inference will handle this in US3)
      return;
    }

    // Check type compatibility
    const error = validateTypeCompatibility(actualType, expectedType, {
      line: 0,
      column: 0,
      length: 0,
    });

    if (error) {
      accept('error', error.message + (error.hint ? `. ${error.hint}` : ''), {
        node,
        property,
        code: 'type-mismatch',
      });
    }
  }
}
