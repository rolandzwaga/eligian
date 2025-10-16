/**
 * AST Transformer: Langium AST → Eligius IR
 *
 * This module transforms the parsed Langium AST into our internal
 * Intermediate Representation (IR) which is optimized for further
 * compilation stages (type checking, optimization, emission).
 *
 * Design principles (per DSL_DESIGN_DECISIONS.md):
 * - External API is immutable (Effect types)
 * - Internal mutation allowed for performance (building IR arrays)
 * - All transformations include source location mapping for error reporting
 * - Type-safe error handling with TransformError
 * - Support function-style operation calls with positional parameters
 * - Handle property chain references ($context.*, $operationdata.*, $globaldata.*)
 * - Flatten wrapper objects (properties, attributes) automatically
 */

import { Effect } from 'effect';
import type {
  TimeExpression as AstTimeExpression,
  EndableActionDefinition,
  Expression,
  ForStatement,
  IfStatement,
  OperationCall,
  OperationStatement,
  Program,
  RegularActionDefinition,
  Timeline,
  TimelineEvent,
  VariableDeclaration,
} from '../generated/ast.js';
import { getOperationSignature } from './operations/index.js';
import { mapParameters } from './operations/mapper.js';
import { trackOutputs, validateDependencies, validateOperation } from './operations/validator.js';
import type { SourceLocation } from './types/common.js';
import type {
  EligiusIR,
  EndableActionIR,
  EngineInfoIR,
  JsonValue,
  LabelIR,
  LanguageLabelIR,
  OperationConfigIR,
  TimeExpression,
  TimelineActionIR,
  TimelineConfigIR,
} from './types/eligius-ir.js';
import type { TransformError } from './types/errors.js';

/**
 * Main transformation function - orchestrates all transformations
 *
 * Transforms a complete Langium Program AST into EligiusIR aligned with IEngineConfiguration.
 */
export const transformAST = (program: Program): Effect.Effect<EligiusIR, TransformError> =>
  Effect.gen(function* (_) {
    // Find the timeline (validation ensures exactly one exists)
    const timelineNode = program.elements.find(el => el.$type === 'Timeline') as
      | Timeline
      | undefined;
    if (!timelineNode) {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidTimeline' as const,
          message: 'No timeline found in program',
          location: getSourceLocation(program),
        })
      );
    }

    // Extract program-level variable declarations (T182: Global variables)
    const variableDeclarations = program.elements.filter(
      el => el.$type === 'VariableDeclaration'
    ) as VariableDeclaration[];

    // Transform program-level variables to initActions (setData operations)
    const initActions: OperationConfigIR[] = [];
    if (variableDeclarations.length > 0) {
      const properties: Record<string, JsonValue> = {};
      for (const varDecl of variableDeclarations) {
        const value = yield* _(transformExpression(varDecl.value));
        properties[`globaldata.${varDecl.name}`] = value;
      }

      // Create single setData operation for all global variables
      initActions.push({
        id: crypto.randomUUID(),
        systemName: 'setData',
        operationData: { properties },
        sourceLocation: variableDeclarations[0]
          ? getSourceLocation(variableDeclarations[0])
          : {
              file: undefined,
              line: 1,
              column: 1,
              length: 0,
            },
      });
    }

    // Extract action definitions (both regular and endable)
    const actionDefinitions = program.elements.filter(
      el => el.$type === 'EndableActionDefinition' || el.$type === 'RegularActionDefinition'
    ) as (EndableActionDefinition | RegularActionDefinition)[];

    // Transform action definitions to Eligius EndableActionIR format
    const actions: EndableActionIR[] = [];
    for (const actionDef of actionDefinitions) {
      const action = yield* _(transformActionDefinition(actionDef));
      actions.push(action);
    }

    // Build TimelineConfigIR from timeline node
    const timelineConfig = yield* _(buildTimelineConfig(timelineNode));

    // Generate default configuration values
    const defaults = createDefaultConfiguration();

    // Build complete Eligius IR
    return {
      // Required configuration fields
      id: defaults.id,
      engine: defaults.engine,
      containerSelector: defaults.containerSelector,
      language: defaults.language,
      layoutTemplate: defaults.layoutTemplate,
      availableLanguages: defaults.availableLanguages,
      labels: defaults.labels,

      // Action layers
      initActions, // T182: Program-level variable declarations (const)
      actions, // User-defined action definitions
      eventActions: [], // DSL doesn't support event actions yet

      // Timeline configuration (plural - array of timelines)
      timelines: [timelineConfig],
      timelineFlow: undefined, // DSL doesn't support timeline flow yet

      // Provider settings
      timelineProviderSettings: undefined, // TODO: Extract from timeline if needed

      // Compiler metadata
      metadata: {
        dslVersion: '1.0.0',
        compilerVersion: '0.0.1',
        compiledAt: new Date().toISOString(),
        sourceFile: undefined,
      },
      sourceLocation: getSourceLocation(program),
    };
  });

/**
 * Create default configuration values for required Eligius fields
 *
 * Constitution VII: Uses crypto.randomUUID() for globally unique configuration ID.
 * UUIDs ensure no conflicts when merging configs or running concurrently.
 */
function createDefaultConfiguration() {
  return {
    // Constitution VII: UUID v4 for globally unique configuration ID
    id: crypto.randomUUID(),
    engine: {
      systemName: 'Eligius',
    } as EngineInfoIR,
    containerSelector: 'body',
    language: 'en-US' as const,
    layoutTemplate: 'default',
    availableLanguages: [{ code: 'en', label: 'English' }] as LabelIR[],
    labels: [] as LanguageLabelIR[],
  };
}

/**
 * Build TimelineConfigIR from timeline node
 *
 * This creates the full Eligius TimelineConfiguration structure.
 *
 * Constitution VII: Generates UUID for timeline ID to ensure global uniqueness
 * when configs are merged or multiple timelines exist.
 */
const buildTimelineConfig = (timeline: Timeline): Effect.Effect<TimelineConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    // Transform timeline events to TimelineActionIR
    const timelineActions: TimelineActionIR[] = [];
    for (const event of timeline.events) {
      const timelineAction = yield* _(transformTimelineEvent(event));
      timelineActions.push(timelineAction);
    }

    // Calculate total duration from events
    let maxDuration = 0;
    for (const action of timelineActions) {
      const endTime = typeof action.duration.end === 'number' ? action.duration.end : 0; // TimeExpressions need evaluation
      if (endTime > maxDuration) {
        maxDuration = endTime;
      }
    }

    return {
      // Constitution VII: UUID v4 for globally unique timeline ID
      id: crypto.randomUUID(),
      uri: timeline.source || undefined, // undefined for raf, actual path for video/audio
      type: timeline.provider,
      duration: maxDuration,
      loop: false, // TODO: Could add DSL support for loop
      selector: '', // TODO: Could add DSL support for selector
      timelineActions,
      sourceLocation: getSourceLocation(timeline),
    };
  });

/**
 * Transform TimelineEvent → TimelineActionIR
 *
 * Timeline events can be:
 * 1. Named action invocation: at 0s..5s { fadeIn() }
 * 2. Inline endable action: at 0s..5s [ ... ] [ ... ]
 *
 * Constitution VII: Generates UUID for action ID to prevent conflicts when multiple
 * actions exist or configs are merged.
 */
const transformTimelineEvent = (
  event: TimelineEvent
): Effect.Effect<TimelineActionIR, TransformError> =>
  Effect.gen(function* (_) {
    const timeRange = event.timeRange;
    if (!timeRange) {
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidEvent' as const,
          message: 'Timeline event missing time range',
          location: getSourceLocation(event),
        })
      );
    }

    // Transform start and end times to numbers
    const startExpr = yield* _(transformTimeExpression(timeRange.start));
    const endExpr = yield* _(transformTimeExpression(timeRange.end));
    const start = evaluateTimeExpression(startExpr);
    const end = evaluateTimeExpression(endExpr);

    // Transform the action (either named invocation or inline)
    const action = event.action;
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    if (action.$type === 'NamedActionInvocation') {
      // Named action reference: { showSlide1() } or { fadeIn(".title", 300) }
      // Per Eligius operation registry, action invocation requires two steps:
      // 1. requestAction: Takes systemName, outputs actionInstance to operation data
      // 2. startAction: Depends on actionInstance from previous operation
      const actionCall = action.actionCall;
      const actionName = actionCall?.action?.$refText || 'unknown';
      const actionRef = actionCall?.action?.ref;

      // T187: Transform action arguments to actionOperationData
      let actionOperationData: Record<string, JsonValue> | undefined;
      if (actionCall?.args && actionCall.args.length > 0 && actionRef) {
        // Map positional arguments to parameter names
        const parameters = actionRef.parameters || [];
        const args = actionCall.args;

        if (args.length !== parameters.length) {
          return yield* _(
            Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'ValidationError' as const,
              message: `Action '${actionName}' expects ${parameters.length} arguments but got ${args.length}`,
              location: getSourceLocation(action),
            })
          );
        }

        // Map each argument to its corresponding parameter name
        actionOperationData = {};
        for (let i = 0; i < parameters.length; i++) {
          const paramName = parameters[i].name;
          const argValue = yield* _(transformExpression(args[i]));
          actionOperationData[paramName] = argValue;
        }
      }

      // Step 1: Request the action instance
      startOperations.push({
        id: crypto.randomUUID(),
        systemName: 'requestAction',
        operationData: {
          systemName: actionName,
        },
        sourceLocation: getSourceLocation(action),
      });

      // Step 2: Start the action (uses actionInstance from requestAction)
      // T187: Pass actionOperationData if action has parameters
      startOperations.push({
        id: crypto.randomUUID(),
        systemName: 'startAction',
        operationData: actionOperationData ? { actionOperationData } : {},
        sourceLocation: getSourceLocation(action),
      });

      // End operations: Request action instance again and call endAction
      endOperations.push({
        id: crypto.randomUUID(),
        systemName: 'requestAction',
        operationData: {
          systemName: actionName,
        },
        sourceLocation: getSourceLocation(action),
      });

      // T187: Pass same actionOperationData to endAction
      endOperations.push({
        id: crypto.randomUUID(),
        systemName: 'endAction',
        operationData: actionOperationData ? { actionOperationData } : {},
        sourceLocation: getSourceLocation(action),
      });
    } else if (action.$type === 'InlineEndableAction') {
      // Inline endable action: [ ... ] [ ... ]
      for (const opStmt of action.startOperations) {
        const ops = yield* _(transformOperationStatement(opStmt));
        startOperations.push(...ops);
      }
      for (const opStmt of action.endOperations) {
        const ops = yield* _(transformOperationStatement(opStmt));
        endOperations.push(...ops);
      }
    }

    // T173: Validate dependencies in timeline event operations
    yield* _(
      validateOperationSequence(
        startOperations,
        `timeline event at ${start}s..${end}s start operations`
      )
    );
    if (endOperations.length > 0) {
      yield* _(
        validateOperationSequence(
          endOperations,
          `timeline event at ${start}s..${end}s end operations`
        )
      );
    }

    return {
      // Constitution VII: UUID v4 for globally unique action ID
      id: crypto.randomUUID(),
      name: `timeline-action-${start}-${end}`, // Generate name from time range
      duration: {
        start,
        end,
      },
      startOperations,
      endOperations,
      sourceLocation: getSourceLocation(event),
    };
  });

/**
 * Validate operation dependencies in a sequence (T173: Dependency Tracking)
 *
 * Checks that each operation's required dependencies are available from previous operations.
 * Tracks outputs as operations are processed to maintain dependency chain.
 */
const validateOperationSequence = (
  operations: OperationConfigIR[],
  contextName: string
): Effect.Effect<void, TransformError> =>
  Effect.gen(function* (_) {
    const availableOutputs = new Set<string>();

    for (const op of operations) {
      const signature = getOperationSignature(op.systemName);
      if (!signature) {
        continue; // Already validated in transformOperationCall
      }

      // Validate dependencies
      const depErrors = validateDependencies(signature, availableOutputs);
      if (depErrors.length > 0) {
        const firstError = depErrors[0];
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'ValidationError' as const,
            message: `In ${contextName}: ${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
            location: op.sourceLocation || {
              file: undefined,
              line: 1,
              column: 1,
              length: 0,
            },
          })
        );
      }

      // Track outputs for next operation
      trackOutputs(signature, availableOutputs);
    }

    return undefined;
  });

/**
 * Transform Action Definition → EndableActionIR
 *
 * Handles both:
 * - Regular actions: action foo [ ... ]
 * - Endable actions: endable action foo [ ... ] [ ... ]
 *
 * Constitution VII: Generates UUID for action ID
 * T173: Validates operation dependencies
 */
const transformActionDefinition = (
  actionDef: EndableActionDefinition | RegularActionDefinition
): Effect.Effect<EndableActionIR, TransformError> =>
  Effect.gen(function* (_) {
    const startOperations: OperationConfigIR[] = [];
    const endOperations: OperationConfigIR[] = [];

    if (actionDef.$type === 'EndableActionDefinition') {
      // Endable action: has start and end operations
      for (const opStmt of actionDef.startOperations) {
        const ops = yield* _(transformOperationStatement(opStmt));
        startOperations.push(...ops);
      }
      for (const opStmt of actionDef.endOperations) {
        const ops = yield* _(transformOperationStatement(opStmt));
        endOperations.push(...ops);
      }
    } else {
      // Regular action: only has operations (treated as start operations)
      for (const opStmt of actionDef.operations) {
        const ops = yield* _(transformOperationStatement(opStmt));
        startOperations.push(...ops);
      }
    }

    // T173: Validate dependencies in operation sequences
    yield* _(
      validateOperationSequence(startOperations, `action '${actionDef.name}' start operations`)
    );
    if (endOperations.length > 0) {
      yield* _(
        validateOperationSequence(endOperations, `action '${actionDef.name}' end operations`)
      );
    }

    return {
      // Constitution VII: UUID v4 for globally unique action ID
      id: crypto.randomUUID(),
      name: actionDef.name,
      startOperations,
      endOperations,
      sourceLocation: getSourceLocation(actionDef),
    };
  });

/**
 * Transform OperationCall → OperationConfigIR
 *
 * Handles function-style operation calls with positional parameters:
 *   selectElement("#title")
 *   animate({ opacity: 1 }, 500, "ease")
 *   setData({ "operationdata.name": $context.currentItem })
 *
 * Per DSL_DESIGN_DECISIONS.md Q3: Flattens wrapper objects automatically.
 * Constitution VII: Generates UUID for operation ID
 */
const transformOperationCall = (
  opCall: OperationCall
): Effect.Effect<OperationConfigIR, TransformError> =>
  Effect.gen(function* (_) {
    const operationName = opCall.operationName;
    const args = opCall.args || [];

    // T218: Validate operation before transforming
    const validationResult = validateOperation(operationName, args.length);
    if (!validationResult.success) {
      // Collect all validation errors and fail with first error
      const firstError = validationResult.errors[0];
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    // T223: Use parameter mapper to transform arguments to operationData
    const signature = getOperationSignature(operationName);
    if (!signature) {
      // This should never happen after validation, but handle defensively
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `Unknown operation: ${operationName}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    // Map positional arguments to named parameters using operation signature
    const mappingResult = mapParameters(signature, args);
    if (!mappingResult.success) {
      // Mapping failed - return first error
      const firstError = mappingResult.errors[0];
      return yield* _(
        Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'ValidationError' as const,
          message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
          location: getSourceLocation(opCall),
        })
      );
    }

    const operationData = mappingResult.operationData as Record<string, JsonValue>;

    return {
      // Constitution VII: UUID v4 for operation ID
      id: crypto.randomUUID(),
      systemName: operationName,
      operationData,
      sourceLocation: getSourceLocation(opCall),
    };
  });

/**
 * Transform OperationStatement → OperationConfigIR[]
 *
 * Handles all operation statement types:
 * - OperationCall: Direct operation invocation
 * - IfStatement: Syntactic sugar for when/otherwise/endWhen
 * - ForStatement: Syntactic sugar for forEach/endForEach
 *
 * Returns an array because control flow statements expand into multiple operations.
 *
 * Constitution VII: Generates UUIDs for all generated operations
 * T177, T180: Implements control flow transformations
 */
const transformOperationStatement = (
  stmt: OperationStatement
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    switch (stmt.$type) {
      case 'OperationCall': {
        // Single operation call → single operation
        const op = yield* _(transformOperationCall(stmt));
        return [op];
      }

      case 'IfStatement':
        // If/else → when/otherwise/endWhen sequence
        return yield* _(transformIfStatement(stmt));

      case 'ForStatement':
        // For loop → forEach/endForEach sequence
        return yield* _(transformForStatement(stmt));

      case 'VariableDeclaration':
        // Action-scoped variable → setVariable operation
        return yield* _(transformVariableDeclaration(stmt));

      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown operation statement type: ${(stmt as any).$type}`,
            location: getSourceLocation(stmt),
          })
        );
    }
  });

/**
 * Transform IfStatement → when/otherwise/endWhen operations (T177)
 *
 * Transforms:
 *   if (condition) {
 *     thenOps
 *   } else {
 *     elseOps
 *   }
 *
 * Into:
 *   when(condition)
 *   [thenOps...]
 *   otherwise()
 *   [elseOps...]
 *   endWhen()
 *
 * For if-without-else, the otherwise() operation is omitted.
 */
const transformIfStatement = (
  stmt: IfStatement
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    const operations: OperationConfigIR[] = [];

    // Transform condition expression
    const condition = yield* _(transformExpression(stmt.condition));

    // 1. when(condition)
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'when',
      operationData: {
        condition,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform then operations (recursively handle nested control flow)
    for (const thenOp of stmt.thenOps) {
      const ops = yield* _(transformOperationStatement(thenOp));
      operations.push(...ops);
    }

    // 3. otherwise() and else operations (if present)
    if (stmt.elseOps.length > 0) {
      operations.push({
        id: crypto.randomUUID(),
        systemName: 'otherwise',
        operationData: {},
        sourceLocation: getSourceLocation(stmt),
      });

      for (const elseOp of stmt.elseOps) {
        const ops = yield* _(transformOperationStatement(elseOp));
        operations.push(...ops);
      }
    }

    // 4. endWhen()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endWhen',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform ForStatement → forEach/endForEach operations (T180)
 *
 * Transforms:
 *   for (item in collection) {
 *     body
 *   }
 *
 * Into:
 *   forEach(collection, "item")
 *   [body operations...]
 *   endForEach()
 *
 * The item variable name is passed to forEach so Eligius can set it in the operation data context.
 */
const transformForStatement = (
  stmt: ForStatement
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    const operations: OperationConfigIR[] = [];

    // Transform collection expression
    const collection = yield* _(transformExpression(stmt.collection));

    // 1. forEach(collection, itemName)
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'forEach',
      operationData: {
        collection,
        itemName: stmt.itemName,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform loop body (recursively handle nested control flow)
    for (const bodyOp of stmt.body) {
      const ops = yield* _(transformOperationStatement(bodyOp));
      operations.push(...ops);
    }

    // 3. endForEach()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform VariableDeclaration → setVariable operation (T184)
 *
 * Transforms:
 *   const duration = 500
 *
 * Into:
 *   setVariable("duration", 500)
 *
 * This creates an action-scoped variable that can be referenced with @varName.
 */
const transformVariableDeclaration = (
  stmt: VariableDeclaration
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* (_) {
    // Transform the value expression
    const value = yield* _(transformExpression(stmt.value));

    // Create setVariable operation
    const operation: OperationConfigIR = {
      id: crypto.randomUUID(),
      systemName: 'setVariable',
      operationData: {
        name: stmt.name,
        value,
      },
      sourceLocation: getSourceLocation(stmt),
    };

    return [operation];
  });

/**
 * Transform Expression → JsonValue
 *
 * Handles all expression types:
 * - Literals: strings, numbers, booleans, null
 * - Object literals: { key: value, ... }
 * - Array literals: [value1, value2, ...]
 * - Property chain references: $context.currentItem
 * - Variable references: @varName
 * - Binary expressions: 10 + 5
 */
const transformExpression = (expr: Expression): Effect.Effect<JsonValue, TransformError> =>
  Effect.gen(function* (_) {
    switch (expr.$type) {
      case 'StringLiteral':
        return expr.value;

      case 'NumberLiteral':
        return expr.value;

      case 'BooleanLiteral':
        return expr.value;

      case 'NullLiteral':
        return null;

      case 'ObjectLiteral': {
        const obj: Record<string, JsonValue> = {};
        for (const prop of expr.properties) {
          const key = typeof prop.key === 'string' ? prop.key : prop.key;
          const value = yield* _(transformExpression(prop.value));
          obj[key] = value;
        }
        return obj;
      }

      case 'ArrayLiteral': {
        const arr: JsonValue[] = [];
        for (const element of expr.elements) {
          const value = yield* _(transformExpression(element));
          arr.push(value);
        }
        return arr;
      }

      case 'PropertyChainReference': {
        // Property chain reference: $context.currentItem
        // For now, serialize to string format that Eligius understands
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return `${scope}.${properties}`;
      }

      case 'VariableReference': {
        // Variable reference: @varName
        // Pass as-is to Eligius, which will resolve it to context.varName at runtime
        return `@${expr.name}`;
      }

      case 'BinaryExpression': {
        // Binary expression: 10 + 5
        // Evaluate at compile time if both sides are literals
        const left = yield* _(transformExpression(expr.left));
        const right = yield* _(transformExpression(expr.right));

        // If both are numbers, evaluate
        if (typeof left === 'number' && typeof right === 'number') {
          switch (expr.op) {
            case '+':
              return left + right;
            case '-':
              return left - right;
            case '*':
              return left * right;
            case '/':
              return left / right;
            case '%':
              return left % right;
            case '**':
              return left ** right;
            case '>':
              return left > right;
            case '<':
              return left < right;
            case '>=':
              return left >= right;
            case '<=':
              return left <= right;
            case '==':
              return left === right;
            case '!=':
              return left !== right;
          }
        }

        // Otherwise, serialize as expression string
        return `(${JSON.stringify(left)} ${expr.op} ${JSON.stringify(right)})`;
      }

      case 'UnaryExpression': {
        // Unary expression: !flag, -value
        const operand = yield* _(transformExpression(expr.operand));

        switch (expr.op) {
          case '!':
            return !operand;
          case '-':
            if (typeof operand === 'number') {
              return -operand;
            }
            return `(-${JSON.stringify(operand)})`;
          default:
            return yield* _(
              Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'InvalidExpression' as const,
                message: `Unknown unary operator: ${(expr as any).op}`,
                location: getSourceLocation(expr),
              })
            );
        }
      }

      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown expression type: ${(expr as any).$type}`,
            location: getSourceLocation(expr),
          })
        );
    }
  });

/**
 * Transform TimeExpression → TimeExpression IR
 */
export const transformTimeExpression = (
  expr: AstTimeExpression
): Effect.Effect<TimeExpression, TransformError> =>
  Effect.gen(function* (_) {
    switch (expr.$type) {
      case 'TimeLiteral':
        return {
          kind: 'literal' as const,
          value: expr.value,
        };
      case 'PropertyChainReference': {
        // Property reference in time expression
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return {
          kind: 'variable' as const,
          name: `${scope}.${properties}`,
        };
      }
      case 'BinaryTimeExpression': {
        const left = yield* _(transformTimeExpression(expr.left));
        const right = yield* _(transformTimeExpression(expr.right));
        return {
          kind: 'binary' as const,
          op: expr.op as '+' | '-' | '*' | '/',
          left,
          right,
        };
      }
      default:
        return yield* _(
          Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Unknown time expression type: ${(expr as any).$type}`,
            location: getSourceLocation(expr),
          })
        );
    }
  });

/**
 * Helper: Evaluate TimeExpression to a numeric value
 *
 * Performs constant folding for binary expressions (e.g., 10 + 5 → 15).
 * Variables are not supported yet and will throw an error.
 */
function evaluateTimeExpression(expr: TimeExpression): number {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'variable':
      // TODO: Variable support requires a symbol table/environment
      throw new Error(`Variables not yet supported in time expressions: ${expr.name}`);
    case 'binary': {
      const left = evaluateTimeExpression(expr.left);
      const right = evaluateTimeExpression(expr.right);
      switch (expr.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
      }
    }
  }
}

/**
 * Helper to extract source location from any AST node
 */
function getSourceLocation(node: any): SourceLocation {
  const cstNode = node.$cstNode;
  if (cstNode) {
    return {
      file: undefined,
      line: cstNode.range.start.line + 1, // Langium uses 0-based, we use 1-based
      column: cstNode.range.start.character + 1,
      length: cstNode.range.end.offset - cstNode.range.start.offset,
    };
  }

  // Fallback if CST node not available
  return {
    file: undefined,
    line: 1,
    column: 1,
    length: 0,
  };
}
