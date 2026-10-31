import type { AstNode } from 'langium';
import {
  type BottomType,
  type CustomKind,
  InferenceRuleNotApplicable,
  isType,
  type PrimitiveType,
  type TopType,
  type Type,
} from 'typir';
import type { LangiumTypeSystemDefinition, TypirLangiumServices } from 'typir-langium';
import type {
  ArrayLiteral,
  BinaryExpression,
  BooleanLiteral,
  EndableActionDefinition,
  Expression,
  NullLiteral,
  NumberLiteral,
  ObjectLiteral,
  OperationCall,
  Parameter,
  ParameterReference,
  PropertyChainReference,
  RegularActionDefinition,
  StringLiteral,
  SystemPropertyReference,
  TimeValue,
  UnaryExpression,
  VariableDeclaration,
  VariableReference,
} from '../generated/ast.js';
import {
  isEndableActionDefinition,
  isRegularActionDefinition,
  isStaggerBlock,
} from '../generated/ast.js';
import type { EligianSpecifics } from './eligian-specifics.js';
import { registerEventInference } from './inference/event-inference.js';
import { registerImportInference } from './inference/import-inference.js';
import { registerLanguagesInference } from './inference/languages-inference.js';
import { registerTimelineInference } from './inference/timeline-inference.js';
import { createImportTypeFactory, type ImportTypeProperties } from './types/import-type.js';
import {
  createLanguagesTypeFactory,
  type LanguagesTypeProperties,
} from './types/languages-type.js';
import {
  createEventTypeFactory,
  type TimelineEventTypeProperties,
} from './types/timeline-event-type.js';
import { createTimelineTypeFactory, type TimelineType } from './types/timeline-type.js';
import { findConstCycle } from './utils/const-cycles.js';
import { registerConstantValidation } from './validation/constant-validation.js';
import { registerControlFlowValidation } from './validation/control-flow-validation.js';
import { registerEventValidation } from './validation/event-validation.js';
import { registerImportValidation } from './validation/import-validation.js';
import { registerLanguagesValidation } from './validation/languages-validation.js';
import { registerTimelineValidation } from './validation/timeline-validation.js';

/**
 * Type system definition for the Eligian DSL.
 *
 * This class implements the Typir type system for Eligian, providing:
 * - Primitive types (string, number, boolean, object, array, unknown)
 * - Type inference rules for literals, type annotations, and operation calls
 * - Validation rules for type checking
 * - Integration with the Eligius operation registry
 *
 * The type system is implemented using Typir, which integrates with Langium's
 * document lifecycle and validation infrastructure.
 */
export class EligianTypeSystem implements LangiumTypeSystemDefinition<EligianSpecifics> {
  // Store Typir services reference for use in onNewAstNode()
  private _typirServices!: TypirLangiumServices<EligianSpecifics>;

  // Store primitive type references for use in action function type creation
  private stringType!: PrimitiveType;
  private numberType!: PrimitiveType;
  private booleanType!: PrimitiveType;
  private objectType!: PrimitiveType;
  private arrayType!: PrimitiveType;
  private unknownType!: TopType;
  /**
   * Type of values that are only known at runtime (`null`, `$globaldata.x`, `@@currentItem`,
   * expressions whose result type cannot be determined statically). Modelled as Typir's
   * Bottom type, which is a sub-type of (and therefore assignable to) every other type, so
   * such arguments never produce a type mismatch: the type system opts out for them.
   */
  private dynamicType!: BottomType;
  // Custom type factories
  private _importFactory!: CustomKind<ImportTypeProperties, EligianSpecifics>; // Initialized in onInitialize() for US1
  private _languagesFactory!: CustomKind<LanguagesTypeProperties, EligianSpecifics>; // Initialized in onInitialize() for Feature 037 US5
  private _eventFactory!: CustomKind<TimelineEventTypeProperties, EligianSpecifics>; // Initialized in onInitialize() for US3
  private _timelineFactory!: CustomKind<TimelineType, EligianSpecifics>; // Initialized in onInitialize() for US5

  /**
   * Public getters for factories and services (used by inference/validation modules)
   */
  get typirServices(): TypirLangiumServices<EligianSpecifics> {
    if (this._typirServices === undefined) {
      throw new Error(
        'EligianTypeSystem.typirServices accessed before onInitialize() ran — Typir services are not yet available.'
      );
    }
    return this._typirServices;
  }

  get importFactory(): CustomKind<ImportTypeProperties, EligianSpecifics> {
    return this._importFactory;
  }

  get languagesFactory(): CustomKind<LanguagesTypeProperties, EligianSpecifics> {
    return this._languagesFactory;
  }

  get eventFactory(): CustomKind<TimelineEventTypeProperties, EligianSpecifics> {
    return this._eventFactory;
  }

  get timelineFactory(): CustomKind<TimelineType, EligianSpecifics> {
    return this._timelineFactory;
  }

  /**
   * Initialize constant types (primitives, operation function types).
   *
   * This method is called once during Langium service initialization.
   * All types created here are shared across all documents and never invalidated.
   *
   * @param typir Typir services for type creation and registration
   */
  onInitialize(typir: TypirLangiumServices<EligianSpecifics>): void {
    // Store reference for later use
    this._typirServices = typir;
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Create Primitive Types (T013-T018)
    // ═══════════════════════════════════════════════════════════════════

    this.stringType = typir.factory.Primitives.create({ primitiveName: 'string' })
      .inferenceRule({
        languageKey: 'StringLiteral',
        matching: (node: AstNode): node is StringLiteral => node.$type === 'StringLiteral',
      })
      .finish();

    this.numberType = typir.factory.Primitives.create({ primitiveName: 'number' })
      .inferenceRule({
        languageKey: 'NumberLiteral',
        matching: (node: AstNode): node is NumberLiteral => node.$type === 'NumberLiteral',
      })
      // Idea #10: a time with a unit (`7s`) is a number of seconds. Misplaced
      // ones (outside a const value) get one clear error from the timeline
      // validator, not a type error on top.
      .inferenceRule({
        languageKey: 'TimeValue',
        matching: (node: AstNode): node is TimeValue => node.$type === 'TimeValue',
      })
      .finish();

    this.booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' })
      .inferenceRule({
        languageKey: 'BooleanLiteral',
        matching: (node: AstNode): node is BooleanLiteral => node.$type === 'BooleanLiteral',
      })
      .finish();

    this.objectType = typir.factory.Primitives.create({ primitiveName: 'object' })
      .inferenceRule({
        languageKey: 'ObjectLiteral',
        matching: (node: AstNode): node is ObjectLiteral => node.$type === 'ObjectLiteral',
      })
      .finish();

    this.arrayType = typir.factory.Primitives.create({ primitiveName: 'array' })
      .inferenceRule({
        languageKey: 'ArrayLiteral',
        matching: (node: AstNode): node is ArrayLiteral => node.$type === 'ArrayLiteral',
      })
      .finish();

    // Unknown type (top type - compatible with everything)
    this.unknownType = typir.factory.Top.create({}).finish();

    // Runtime-only values (bottom type - assignable to everything, see `dynamicType`)
    this.dynamicType = typir.factory.Bottom.create({}).finish();

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1.5: User Story 1 - Import Type Checking (T020)
    // ═══════════════════════════════════════════════════════════════════

    // Create ImportType factory
    this._importFactory = createImportTypeFactory(typir);

    // Register import inference rules (DefaultImport, NamedImport)
    registerImportInference(typir, this._importFactory);

    // Register import validation rules (duplicate detection, type mismatch warnings)
    registerImportValidation(typir);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1.6: Feature 037 User Story 5 - Languages Type Integration (T057)
    // ═══════════════════════════════════════════════════════════════════

    // Create LanguagesType factory
    this._languagesFactory = createLanguagesTypeFactory(typir);

    // Register languages inference rules (LanguagesBlock)
    registerLanguagesInference(typir, this._languagesFactory);

    // Register languages validation rules (duplicate codes, default marker rules)
    registerLanguagesValidation(typir);

    // Register constant validation rules (reserved keyword detection)
    registerConstantValidation(typir);

    // Create TimelineEventType factory (US3)
    this._eventFactory = createEventTypeFactory(typir);

    // Register timeline event inference rules (TimedEvent, SequenceBlock, StaggerBlock)
    registerEventInference(typir, this._eventFactory);

    // Register timeline event validation rules (time range checks, duration validation)
    registerEventValidation(typir);

    // Register control flow validation rules (if/for statement type checking) - US4
    registerControlFlowValidation(typir);

    // Create TimelineType factory (US5)
    this._timelineFactory = createTimelineTypeFactory(typir);

    // Register timeline inference rules (Timeline AST node)
    registerTimelineInference(this);

    // Register timeline validation rules (provider-source consistency, empty timeline).
    // Container selector syntax is validated by the Langium timeline validator's real parser.
    registerTimelineValidation(typir);

    // Built-in operations deliberately get NO Typir function types. Their arguments
    // (including optional parameters and multi-type parameters) are validated by the Langium
    // operation-call validator against OPERATION_REGISTRY. Per-operation function types with
    // `validateArgumentsOfFunctionCalls: false` never produced a diagnostic, yet Typir's call
    // validation still inferred every argument of every matching built-in call and scanned
    // all of them for every OperationCall (audit 2026-10-22, low finding #21).

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Register Global Inference Rules (Parameters, Variables)
    // ═══════════════════════════════════════════════════════════════════

    typir.Inference.addInferenceRulesForAstNodes({
      // Parameters: explicit annotation or inferred from usage
      Parameter: (param: Parameter) => {
        if (param.type) {
          // Map type annotation to Typir type
          return this.resolveTypirPrimitiveType(param.type) ?? this.unknownType;
        }
        // No annotation - let Typir infer from usage
        return InferenceRuleNotApplicable;
      },

      // Variable declarations: infer from initial value or unknown
      VariableDeclaration: (varDecl: VariableDeclaration) => {
        if (!varDecl.value) {
          return this.unknownType;
        }
        // A const whose value refers back to itself (`const a = @a`, `const a = @b` +
        // `const b = @a`) has no type. Delegating to its value would make Typir recurse into
        // this node while it is still pending, which throws instead of reporting a problem.
        // The cycle itself is reported by the constant validation.
        if (findConstCycle(varDecl)) {
          return InferenceRuleNotApplicable;
        }
        return varDecl.value; // Recursive inference
      },

      // Variable references: lookup variable declaration. An unresolved reference already has
      // a linking error; it has no type (not Top), so no follow-on type diagnostic is added.
      VariableReference: (varRef: VariableReference) =>
        varRef.variable?.ref ?? InferenceRuleNotApplicable,

      // Parameter references: lookup parameter declaration (unresolved: see VariableReference)
      ParameterReference: (paramRef: ParameterReference) =>
        paramRef.parameter?.ref ?? InferenceRuleNotApplicable,

      // Values only known at runtime: never a static type mismatch
      NullLiteral: (_node: NullLiteral) => this.dynamicType,
      PropertyChainReference: (_node: PropertyChainReference) => this.dynamicType,
      SystemPropertyReference: (_node: SystemPropertyReference) => this.dynamicType,

      // Unary: `-x` is numeric negation, `!x` is logical negation
      UnaryExpression: (node: UnaryExpression) =>
        node.op === '!' ? this.booleanType : this.numberType,

      // Binary: result type follows JavaScript semantics where it is statically known
      BinaryExpression: (node: BinaryExpression) => this.inferBinaryExpressionType(node),
    });

    // Note: Variables don't have type annotations in Eligian grammar. Timeline action call
    // arguments are type-checked by Typir via the action function types created in
    // onNewAstNode(); built-in operation arguments by the Langium operation-call validator.
  }

  /**
   * Infer the result type of a binary expression.
   *
   * - Comparison/equality operators always yield `boolean`.
   * - `-`, `*`, `/`, `%`, `**` always yield `number`.
   * - `+` yields `string` when either operand is a string (concatenation), `number` when both
   *   operands are numbers, and the dynamic type otherwise (e.g. `$globaldata.x + 1`).
   * - `&&` / `||` return one of their operands in JavaScript, so they yield `boolean` only
   *   when both operands are booleans, and the dynamic type otherwise
   *   (e.g. `$globaldata.name || "default"`).
   */
  private inferBinaryExpressionType(node: BinaryExpression): Type {
    switch (node.op) {
      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
        return this.booleanType;

      case '-':
      case '*':
      case '/':
      case '%':
      case '**':
        return this.numberType;

      case '+': {
        const left = this.inferExpressionType(node.left);
        const right = this.inferExpressionType(node.right);
        if (left === this.stringType || right === this.stringType) {
          return this.stringType;
        }
        if (left === this.numberType && right === this.numberType) {
          return this.numberType;
        }
        return this.dynamicType;
      }

      case '&&':
      case '||': {
        const left = this.inferExpressionType(node.left);
        const right = this.inferExpressionType(node.right);
        return left === this.booleanType && right === this.booleanType
          ? this.booleanType
          : this.dynamicType;
      }

      default:
        return this.dynamicType;
    }
  }

  /** Infer an operand's type, or `undefined` when Typir cannot infer it. */
  private inferExpressionType(expression: Expression): Type | undefined {
    const result = this.typirServices.Inference.inferType(expression);
    return isType(result) ? result : undefined;
  }

  /**
   * Map a parameter type annotation to its stored Typir primitive type.
   *
   * Single source of truth for the annotation→Typir-type mapping (D15). Covers the
   * grammar's TypeAnnotation values ('string' | 'number' | 'boolean' | 'object' | 'array').
   * Returns `undefined` for unmapped names so each call site can apply its own fallback.
   *
   * @param typeName Type annotation text
   * @returns The matching primitive type, or `undefined` if unmapped
   */
  private resolveTypirPrimitiveType(typeName: string): PrimitiveType | undefined {
    switch (typeName) {
      case 'string':
        return this.stringType;

      case 'number':
        return this.numberType;

      case 'boolean':
        return this.booleanType;

      case 'object':
        return this.objectType;

      case 'array':
        return this.arrayType;

      default:
        return undefined;
    }
  }

  /**
   * Handle new AST nodes (user-defined types).
   *
   * This method is called for each AST node when a document is processed.
   * Types created here are associated with the document and invalidated when it changes.
   *
   * User Story 4: Create function types for user-defined actions to enable
   * type checking of action calls (e.g., fadeIn(123, 1000) with typed parameters).
   *
   * @param languageNode AST node from the parsed document
   */
  onNewAstNode(languageNode: AstNode): void {
    // ═══════════════════════════════════════════════════════════════════
    // User Story 4 (T060): Create function types for user-defined actions
    // ═══════════════════════════════════════════════════════════════════

    // Handle regular actions: action myAction(param1: type1, param2) [...]
    if (isRegularActionDefinition(languageNode)) {
      this.createActionFunctionType(languageNode, languageNode.parameters);
    }

    // Handle endable actions: endable action myAction(param1: type1) [...] [...]
    if (isEndableActionDefinition(languageNode)) {
      this.createActionFunctionType(languageNode, languageNode.parameters);
    }
  }

  /**
   * Create a function type for a user-defined action.
   *
   * This enables Typir to type-check action calls just like operation calls.
   * For example:
   *   action fadeIn(selector: string, duration: number) [...]
   *   fadeIn(123, 1000)  // ERROR: 123 is not a string
   *
   * @param action The action definition (regular or endable)
   * @param parameters The action's parameters
   * @param typir Typir services
   */
  private createActionFunctionType(
    action: RegularActionDefinition | EndableActionDefinition,
    parameters: Parameter[]
  ): void {
    // Use stored primitive type references

    // Map action parameters to Typir function input parameters
    const inputParams = parameters.map(param => ({
      name: param.name,
      // Use explicit type annotation if present, otherwise unknown
      type: param.type
        ? (this.resolveTypirPrimitiveType(param.type) ?? this.unknownType)
        : this.unknownType,
    }));

    // Create function type for this action
    this.typirServices.factory.Functions.create({
      functionName: action.name,
      outputParameter: {
        name: '$return',
        type: this.unknownType, // Actions don't return values
      },
      inputParameters: inputParams,
    })
      .inferenceRuleForCalls({
        languageKey: 'OperationCall',
        matching: (call: OperationCall) => {
          // Only match calls that resolve to THIS action definition. Every loaded document
          // registers a function type per action, so matching by name would treat
          // same-named actions from other documents as overloads (a call passes if any of
          // them accepts it) and would never match an aliased import
          // (`import { show as display }`). The scope provider resolves local actions and
          // (aliased) imports to the defining ActionDefinition, and linking completes
          // before validation, so the resolved reference identifies the callee exactly.
          // An unresolved call (`ref` undefined) matches no action type.
          if (call.operationName.ref !== action) {
            return false;
          }

          // A `stagger … with action()` call auto-fills the action's first
          // parameter with the current item, so its arity (one fewer explicit
          // arg) is validated in the Langium parameter validator, which models
          // that. Skip Typir's strict arg-count/type check here.
          if (isStaggerBlock(call.$container) && call.$containerProperty === 'actionCall') {
            return false;
          }

          // Don't match calls inside action bodies (parameters as bare identifiers can't be typed)
          // Only match calls in timeline contexts
          let current: AstNode | undefined = call.$container;
          while (current) {
            // If we're inside an action definition body, don't match
            if (
              current.$type === 'RegularActionDefinition' ||
              current.$type === 'EndableActionDefinition' ||
              current.$type === 'InlineEndableAction' ||
              current.$type === 'TimelineLifecycle'
            ) {
              return false;
            }
            // If we're inside a timeline, we can match
            if (current.$type === 'Timeline' || current.$type === 'TimedEvent') {
              return true;
            }
            current = current.$container;
          }

          return false;
        },
        inputArguments: (call: OperationCall) => call.args,
        // Type-check action call arguments, but only report a mismatch when:
        // - the argument count matches. A wrong count is already reported (once, in Eligian
        //   wording) by the Langium ParameterValidator, so Typir's nested copy is suppressed.
        // - every argument has an inferred type. An argument Typir cannot infer is not
        //   evidence of a wrong type (unknown = opt-out), so it must never surface as a hard
        //   call error.
        validateArgumentsOfFunctionCalls: (call: OperationCall) =>
          call.args.length === parameters.length &&
          call.args.every(arg => isType(this.typirServices.Inference.inferType(arg))),
      })
      .finish();
  }
}
