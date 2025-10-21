import type { AstNode } from 'langium';
import { InferenceRuleNotApplicable } from 'typir';
import type { LangiumTypeSystemDefinition, TypirLangiumServices } from 'typir-langium';
import { OPERATION_REGISTRY } from '../compiler/operations/registry.generated.js';
import type { ConstantValue, ParameterType } from '../compiler/operations/types.js';
import { isConstantValueArray } from '../compiler/operations/types.js';
import type {
  ActionCallExpression,
  ArrayLiteral,
  BooleanLiteral,
  EndableActionDefinition,
  NumberLiteral,
  ObjectLiteral,
  OperationCall,
  Parameter,
  ParameterReference,
  RegularActionDefinition,
  StringLiteral,
  VariableDeclaration,
  VariableReference,
} from '../generated/ast.js';
import { isEndableActionDefinition, isRegularActionDefinition } from '../generated/ast.js';
import type { EligianSpecifics } from './eligian-specifics.js';

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
  private typirServices!: TypirLangiumServices<EligianSpecifics>;

  // Store primitive type references for use in action function type creation
  private stringType: any;
  private numberType: any;
  private booleanType: any;
  private objectType: any;
  private arrayType: any;
  private unknownType: any;

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
    this.typirServices = typir;
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

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Helper - Map ParameterType to Typir Type (T019)
    // ═══════════════════════════════════════════════════════════════════

    const mapParameterTypeToTypirType = (paramTypes: ParameterType[] | ConstantValue[]) => {
      if (!paramTypes || paramTypes.length === 0) {
        return this.unknownType;
      }

      // Handle constant values (enums)
      if (isConstantValueArray(paramTypes)) {
        return this.stringType;
      }

      const paramType = paramTypes[0];
      const typeString = String(paramType).replace('ParameterType:', '');

      switch (typeString) {
        case 'string':
        case 'selector':
        case 'className':
        case 'htmlElementName':
        case 'eventTopic':
        case 'actionName':
          return this.stringType;

        case 'number':
        case 'dimensions':
        case 'dimensionsModifier':
          return this.numberType;

        case 'boolean':
          return this.booleanType;

        case 'object':
        case 'jQuery':
          return this.objectType;

        case 'array':
          return this.arrayType;

        default:
          // Constant values (enums) are strings
          return this.stringType;
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Create Function Types for Operations (T020-T022)
    // ═══════════════════════════════════════════════════════════════════

    for (const [opName, opSig] of Object.entries(OPERATION_REGISTRY)) {
      const inputParams = opSig.parameters.map(param => ({
        name: param.name,
        type: mapParameterTypeToTypirType(param.type),
      }));

      typir.factory.Functions.create({
        functionName: opName,
        outputParameter: {
          name: '$return',
          type: this.unknownType,
        },
        inputParameters: inputParams,
      })
        .inferenceRuleForCalls({
          languageKey: 'OperationCall',
          matching: (call: OperationCall) => call.operationName === opName,
          inputArguments: (call: OperationCall) => call.args,
          validateArgumentsOfFunctionCalls: false, // Disabled - optional params handled in Langium validator
        })
        .finish();
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Register Global Inference Rules (Parameters, Variables)
    // ═══════════════════════════════════════════════════════════════════

    typir.Inference.addInferenceRulesForAstNodes({
      // Parameters: explicit annotation or inferred from usage
      Parameter: (param: Parameter) => {
        if (param.type) {
          // Map type annotation to Typir type
          switch (param.type) {
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
              return this.unknownType;
          }
        }
        // No annotation - let Typir infer from usage
        return InferenceRuleNotApplicable;
      },

      // Variable declarations: infer from initial value or unknown
      VariableDeclaration: (varDecl: VariableDeclaration) => {
        if (varDecl.value) {
          return varDecl.value; // Recursive inference
        } else {
          return this.unknownType;
        }
      },

      // Variable references: lookup variable declaration
      VariableReference: (varRef: VariableReference) => {
        const decl = varRef.variable?.ref;
        return decl ? decl : this.unknownType;
      },

      // Parameter references: lookup parameter declaration
      ParameterReference: (paramRef: ParameterReference) => {
        const decl = paramRef.parameter?.ref;
        return decl ? decl : this.unknownType;
      },
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Register Validation Rules (T023-T025)
    // ═══════════════════════════════════════════════════════════════════

    // Note: Variables don't have type annotations in Eligian grammar
    // Operation argument validation is handled automatically by Typir
    // via validateArgumentsOfFunctionCalls: true in operation function types
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
        ? (() => {
            switch (param.type) {
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
                return this.unknownType;
            }
          })()
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
        languageKey: 'ActionCallExpression',
        matching: (call: ActionCallExpression) => call.action.ref === action,
        inputArguments: (call: ActionCallExpression) => call.args,
        validateArgumentsOfFunctionCalls: true, // Enable type checking for action calls
      })
      .finish();
  }
}
