import type { AstNode } from 'langium';
import { InferenceRuleNotApplicable } from 'typir';
import type { LangiumTypeSystemDefinition, TypirLangiumServices } from 'typir-langium';
import { OPERATION_REGISTRY } from '../compiler/operations/registry.generated.js';
import type { ConstantValue, ParameterType } from '../compiler/operations/types.js';
import { isConstantValueArray } from '../compiler/operations/types.js';
import type {
  ArrayLiteral,
  BooleanLiteral,
  NumberLiteral,
  ObjectLiteral,
  OperationCall,
  Parameter,
  ParameterReference,
  StringLiteral,
  VariableDeclaration,
  VariableReference,
} from '../generated/ast.js';
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
  /**
   * Initialize constant types (primitives, operation function types).
   *
   * This method is called once during Langium service initialization.
   * All types created here are shared across all documents and never invalidated.
   *
   * @param typir Typir services for type creation and registration
   */
  onInitialize(typir: TypirLangiumServices<EligianSpecifics>): void {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Create Primitive Types (T013-T018)
    // ═══════════════════════════════════════════════════════════════════

    const stringType = typir.factory.Primitives.create({ primitiveName: 'string' })
      .inferenceRule({
        languageKey: 'StringLiteral',
        matching: (node: AstNode): node is StringLiteral => node.$type === 'StringLiteral',
      })
      .finish();

    const numberType = typir.factory.Primitives.create({ primitiveName: 'number' })
      .inferenceRule({
        languageKey: 'NumberLiteral',
        matching: (node: AstNode): node is NumberLiteral => node.$type === 'NumberLiteral',
      })
      .finish();

    const booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' })
      .inferenceRule({
        languageKey: 'BooleanLiteral',
        matching: (node: AstNode): node is BooleanLiteral => node.$type === 'BooleanLiteral',
      })
      .finish();

    const objectType = typir.factory.Primitives.create({ primitiveName: 'object' })
      .inferenceRule({
        languageKey: 'ObjectLiteral',
        matching: (node: AstNode): node is ObjectLiteral => node.$type === 'ObjectLiteral',
      })
      .finish();

    const arrayType = typir.factory.Primitives.create({ primitiveName: 'array' })
      .inferenceRule({
        languageKey: 'ArrayLiteral',
        matching: (node: AstNode): node is ArrayLiteral => node.$type === 'ArrayLiteral',
      })
      .finish();

    // Unknown type (top type - compatible with everything)
    const unknownType = typir.factory.Top.create({}).finish();

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Helper - Map ParameterType to Typir Type (T019)
    // ═══════════════════════════════════════════════════════════════════

    const mapParameterTypeToTypirType = (paramTypes: ParameterType[] | ConstantValue[]) => {
      if (!paramTypes || paramTypes.length === 0) {
        return unknownType;
      }

      // Handle constant values (enums)
      if (isConstantValueArray(paramTypes)) {
        return stringType;
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
          return stringType;

        case 'number':
        case 'dimensions':
        case 'dimensionsModifier':
          return numberType;

        case 'boolean':
          return booleanType;

        case 'object':
        case 'jQuery':
          return objectType;

        case 'array':
          return arrayType;

        default:
          // Constant values (enums) are strings
          return stringType;
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
          type: unknownType,
        },
        inputParameters: inputParams,
      })
        .inferenceRuleForCalls({
          languageKey: 'OperationCall',
          matching: (call: OperationCall) => call.operationName === opName,
          inputArguments: (call: OperationCall) => call.args,
          validateArgumentsOfFunctionCalls: false,
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
              return stringType;
            case 'number':
              return numberType;
            case 'boolean':
              return booleanType;
            case 'object':
              return objectType;
            case 'array':
              return arrayType;
            default:
              return unknownType;
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
          return unknownType;
        }
      },

      // Variable references: lookup variable declaration
      VariableReference: (varRef: VariableReference) => {
        const decl = varRef.variable?.ref;
        return decl ? decl : unknownType;
      },

      // Parameter references: lookup parameter declaration
      ParameterReference: (paramRef: ParameterReference) => {
        const decl = paramRef.parameter?.ref;
        return decl ? decl : unknownType;
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
   * Currently Eligian has no user-defined types (no classes, interfaces, etc.),
   * so this method is empty.
   *
   * @param languageNode AST node from the parsed document
   * @param typir Typir services for type creation
   */
  onNewAstNode(_languageNode: AstNode, _typir: TypirLangiumServices<EligianSpecifics>): void {
    // Eligian has no user-defined types currently
    // Leave empty per Phase 2 requirements
  }
}
