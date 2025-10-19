# Research: Typir-Based Type System for Eligian

**Date**: 2025-10-19
**Feature**: Robust Type System with Typir Integration
**Branch**: `003-type-system-the`

## Overview

This document consolidates research findings from investigating Typir/Typir-Langium integration patterns and analyzing the existing Eligian type system implementation. The research informs design decisions for replacing the custom type system with Typir while maintaining 100% backward compatibility.

## Decision Summary

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| **Use Typir-Langium binding** | Langium-optimized integration, automatic document lifecycle management, validation hooks | Typir core only (would require manual Langium integration) |
| **Implement `LangiumTypeSystemDefinition`** | Clean separation of constant types (primitives) vs user-dependent types (actions) | Single initialization point (would mix concerns) |
| **Fluent API for type creation** | Concise, readable type definitions with inline inference rules | Verbose standalone registration (harder to maintain) |
| **Unknown type as opt-out** | Preserves 100% backward compatibility for untyped code | Strict typing by default (would break existing code) |
| **Type environment cloning for control flow** | Accurately tracks types through if/else, for loops | Single flat environment (would miss type changes in branches) |
| **Operation registry integration** | Leverages existing metadata for expected parameter types | Hardcode type mappings (would duplicate information) |

---

## Typir Architecture Understanding

### Core Concepts

**Type Graph**: Each Typir instance (`TypirServices`) maintains a type graph:
- **Nodes**: Types (primitives, functions, classes, operators)
- **Edges**: Relationships (conversions, subtyping)

**Type Identifiers**: Types must have unique identifiers for deduplication and lookup
- **Name**: Short name shown in error messages (doesn't need to be unique)
- **Identifier**: Calculated unique ID for internal tracking

**Service Architecture**: Dependency injection pattern
- Services provide core functionality (Inference, Validation, Conversion, etc.)
- Default implementations can be customized via DI
- Language-specific customizations via `Specifics` type parameter

### Typir-Langium Integration Points

1. **Service Creation**: `createTypirLangiumServices(shared, reflection, typeSystemDef, options)`
2. **Initialization**: `initializeLangiumTypirServices(langiumServices, typirServices)`
3. **Document Lifecycle**: Hooks into `DocumentState.ComputedScopes` phase
4. **Validation**: Automatic registration with Langium's `ValidationRegistry`
5. **Caching**: Uses Langium's `DocumentCache` for inferred types

---

## Eligian Type System Migration Requirements

### Current Implementation Analysis

**Location**: `packages/language/src/type-system/`

**Components**:
- `types.ts`: Type definitions (EligianType, TypeConstraint, TypeError)
- `inference.ts`: Type inference (constraint collection, unification)
- `validator.ts`: Type compatibility checking
- `index.ts`: Public API exports

**Integration**: `eligian-validator.ts` calls type system at action definition level

### Backward Compatibility Constraints

1. **Six Primitive Types**: Must support `string`, `number`, `boolean`, `object`, `array`, `unknown`
2. **Unknown Type Behavior**: Must be compatible with ALL other types (no errors)
3. **Opt-in Type Checking**: Parameters/variables without annotations remain unchecked
4. **Gradual Typing**: Typed and untyped code must coexist in the same file
5. **Error Message Format**: Must preserve existing message templates and hints

### Type Inference Patterns to Preserve

1. **Literal Inference**: `StringLiteral` → `'string'`, `NumberLiteral` → `'number'`, etc.
2. **Constraint Collection**: Gather type requirements from operation calls
3. **Constraint Unification**: Combine constraints into single type or conflict error
4. **Environment Tracking**: Track variable types through sequences with cloning for branches
5. **Precedence**: Explicit annotations take precedence over inference

### Operation Registry Integration

**Current Pattern**:
```typescript
getOperationParameterTypes(opName: string): Map<string, EligianType>
```

- Queries `OPERATION_REGISTRY[opName].parameters`
- Maps rich `ParameterType` values to simple `EligianType` values
- Caches results for O(1) lookup performance

**Typir Integration Strategy**:
- Create function types for each operation in `onInitialize()`
- Use operation registry metadata to define parameter types
- Register inference rules for operation calls
- Validation automatically checks argument types against function signatures

---

## Typir Implementation Plan

### Phase 1: Infrastructure Setup

**Install Dependencies**:
```bash
pnpm add typir typir-langium --filter @eligian/language
```

**Create Type System Definition**:
```typescript
// packages/language/src/type-system-typir/eligian-type-system.ts
export class EligianTypeSystem implements LangiumTypeSystemDefinition<EligianSpecifics> {
    onInitialize(typir: TypirLangiumServices<EligianSpecifics>): void {
        // Define 6 primitive types with inference rules
        // Define operators based on operation registry
        // Register global inference rules
        // Register global validation rules
    }

    onNewAstNode(node: AstNode, typir: TypirLangiumServices<EligianSpecifics>): void {
        // Define action-specific function types (if needed)
        // Currently no user-defined types in Eligian DSL
    }
}
```

**Define Language Specifics**:
```typescript
// packages/language/src/type-system-typir/eligian-specifics.ts
export interface EligianSpecifics extends TypirLangiumSpecifics {
    AstTypes: EligianAstType; // Generated from Langium grammar
}
```

### Phase 2: Primitive Types Definition

In `onInitialize()`, create 6 primitive types:

```typescript
// String type
const stringType = typir.factory.Primitives.create({ primitiveName: 'string' })
    .inferenceRule({ filter: isStringLiteral })
    .inferenceRule({
        filter: isTypeAnnotation,
        matching: (node) => node.type === 'string'
    })
    .finish();

// Number type
const numberType = typir.factory.Primitives.create({ primitiveName: 'number' })
    .inferenceRule({ filter: isNumberLiteral })
    .inferenceRule({
        filter: isTypeAnnotation,
        matching: (node) => node.type === 'number'
    })
    .finish();

// Boolean type
const booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' })
    .inferenceRule({ filter: isBooleanLiteral })
    .inferenceRule({
        filter: isTypeAnnotation,
        matching: (node) => node.type === 'boolean'
    })
    .finish();

// Object type
const objectType = typir.factory.Primitives.create({ primitiveName: 'object' })
    .inferenceRule({ filter: isObjectLiteral })
    .inferenceRule({
        filter: isTypeAnnotation,
        matching: (node) => node.type === 'object'
    })
    .finish();

// Array type
const arrayType = typir.factory.Primitives.create({ primitiveName: 'array' })
    .inferenceRule({ filter: isArrayLiteral })
    .inferenceRule({
        filter: isTypeAnnotation,
        matching: (node) => node.type === 'array'
    })
    .finish();

// Unknown type (top type - compatible with everything)
const unknownType = typir.factory.Top.create({ typeName: 'unknown' })
    .finish();
```

### Phase 3: Operation Registry Integration

**Create Function Types for Operations**:

```typescript
// In onInitialize(), iterate over OPERATION_REGISTRY
for (const [opName, opSig] of Object.entries(OPERATION_REGISTRY)) {
    // Map ParameterType to Typir types
    const inputParams = opSig.parameters.map(param => ({
        name: param.name,
        type: mapParameterTypeToTypirType(param.type, typir)
    }));

    // Create function type for operation
    const functionType = typir.factory.Functions.create({
        functionName: opName,
        outputParameter: {
            name: NO_PARAMETER_NAME,
            type: unknownType  // Operations don't return typed values
        },
        inputParameters: inputParams,
    })
    // Inference rule for operation calls
    .inferenceRuleForCalls({
        filter: isOperationCall,
        matching: (call: OperationCall) => call.operationName === opName,
        inputArguments: (call: OperationCall) => call.args,
        validateArgumentsOfFunctionCalls: true,  // Automatic type checking!
    })
    .finish();
}
```

**Type Mapping Helper**:
```typescript
function mapParameterTypeToTypirType(
    paramType: ParameterType[] | ConstantValue[],
    typir: TypirServices
): Type {
    // Handle constant values (enums)
    if (isConstantValue(paramType[0])) {
        return stringType;  // Enums are strings
    }

    // Map ParameterType to EligianType
    const typeString = (paramType[0] as string).replace('ParameterType:', '');
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
            return unknownType;
    }
}
```

### Phase 4: Parameter Type Inference

**Inference Rules for Parameters**:

```typescript
typir.Inference.addInferenceRulesForAstNodes({
    // Action parameters: use explicit annotation or inferred type
    Parameter: (param: Parameter) => {
        if (param.typeAnnotation) {
            return param.typeAnnotation;  // Use explicit annotation
        }
        // Otherwise inference happens from usage (constraint collection)
        return InferenceRuleNotApplicable;
    },

    // Variable declarations: infer from type annotation or initial value
    VariableDeclaration: (varDecl: VariableDeclaration) => {
        if (varDecl.typeAnnotation) {
            return varDecl.typeAnnotation;
        } else if (varDecl.initialValue) {
            return varDecl.initialValue;  // Recursive inference
        } else {
            return unknownType;  // No type information
        }
    },

    // Variable references: lookup variable declaration
    VariableReference: (varRef: VariableReference) => {
        const decl = varRef.variable?.ref;
        if (decl) {
            return decl;  // Infer from declaration
        }
        return unknownType;
    },

    // Parameter references: lookup parameter declaration
    ParameterReference: (paramRef: ParameterReference) => {
        const decl = paramRef.parameter?.ref;
        if (decl) {
            return decl;  // Infer from declaration
        }
        return unknownType;
    },
});
```

### Phase 5: Validation Rules

**Register Validation Constraints**:

```typescript
typir.validation.Collector.addValidationRulesForAstNodes({
    // Validate variable initialization
    VariableDeclaration: (varDecl, accept, typir) => {
        if (varDecl.typeAnnotation && varDecl.initialValue) {
            typir.validation.Constraints.ensureNodeIsAssignable(
                varDecl.initialValue,
                varDecl.typeAnnotation,
                accept,
                (actual, expected) => ({
                    message: `Cannot initialize variable '${varDecl.name}' with type '${actual.name}'. Expected '${expected.name}'.`,
                    hint: `Expected type '${expected.name}', but got '${actual.name}'`,
                    languageProperty: 'initialValue',
                })
            );
        }
    },

    // Operation argument validation is handled automatically by
    // validateArgumentsOfFunctionCalls: true in operation inference rules
});
```

### Phase 6: Service Integration

**Add Typir to Langium Services**:

```typescript
// packages/language/src/eligian-module.ts
export type EligianAddedServices = {
    validation: {
        EligianValidator: EligianValidator,
    },
    typir: TypirLangiumServices<EligianSpecifics>,
}

export function createEligianModule(
    shared: LangiumSharedCoreServices
): Module<EligianServices, PartialLangiumServices & EligianAddedServices> {
    return {
        // ... existing services
        typir: () => createTypirLangiumServices(
            shared,
            reflection,  // Generated AST reflection
            new EligianTypeSystem(),
            { /* optional customizations */ }
        ),
    };
}

// In createEligianServices()
export function createEligianServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    Eligian: EligianServices
} {
    // ... create services

    // Initialize Typir services
    initializeLangiumTypirServices(Eligian, Eligian.typir);

    return { shared, Eligian };
}
```

### Phase 7: Validator Cleanup

**Remove Custom Type System Code**:
- Delete `packages/language/src/type-system/` directory
- Remove type checking logic from `eligian-validator.ts`:
  - Remove `checkTypeAnnotationsInAction()`
  - Remove `checkTypeAnnotationsInStartOps()`
  - Remove `checkTypeAnnotationsInEndOps()`
  - Remove `collectTypeAnnotations()`
  - Remove `validateTypeSequence()`
  - Remove all type-related helper methods

**Typir handles validation automatically** via registered validation rules.

---

## Testing Strategy

### Test Migration Plan

**Existing Tests**: 25 type system tests in `packages/language/src/__tests__/type-system.spec.ts`

**Migration Approach**:
1. Keep all existing test cases (input DSL + expected errors)
2. Update test assertions to verify Typir-generated errors match expected format
3. Add Typir-specific tests for new features (if any)

**Test Categories**:
- **Type annotation syntax** (10 tests): Parsing type annotations → Should pass unchanged
- **Type checking integration** (10 tests): Error detection and reporting → Verify Typir errors match format
- **Parameter type inference** (8 tests): Constraint collection and unification → Verify Typir inference matches current behavior
- **Backwards compatibility** (2 tests): Untyped code continues to work → Should pass unchanged

### Integration Testing

**VS Code Extension**:
- Manual testing: Open `.eligian` files, verify red squiggles appear
- Verify error messages in Problems panel match expected format
- Verify autocomplete filtering by type context

**CLI Compilation**:
- Run compiler on test fixtures
- Verify type errors are reported (if applicable)
- Verify untyped code compiles successfully

---

## Performance Considerations

### Caching Strategy

**Typir Built-in Caching**:
- Type inference results cached via `DocumentCache`
- Cache automatically invalidated when documents change
- No manual cache management required

**Operation Registry Caching**:
- Function types for operations created once in `onInitialize()`
- O(1) lookup for operation types during validation
- No runtime overhead after initialization

### Performance Targets

- Type checking overhead: **< 50ms** for typical files (100-200 lines)
- IDE responsiveness: Errors appear within **500ms** of typing
- File size support: Handle files with **50+ action definitions, 1000+ lines** without degradation

### Optimization Opportunities

1. **Use `languageKey` instead of `filter`**: More performant AST node matching
2. **Batch validation**: Typir validates entire documents, not individual nodes
3. **Incremental parsing**: Langium's document builder handles incremental updates

---

## Risk Mitigation

### Known Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking changes in error messages** | Users rely on error message format | Preserve message templates, add regression tests |
| **Performance regression** | Type checking too slow in large files | Profile with realistic fixtures, optimize inference rules |
| **Typir API changes** | Typir is actively developed, APIs may change | Pin Typir version, monitor releases, plan upgrade path |
| **Unknown type edge cases** | `unknown` type must be compatible with everything | Extensive testing of untyped code, verify Typir's top type behavior |
| **Test failures** | Existing tests may fail due to subtle behavior changes | Investigate each failure, adjust Typir configuration or tests |

### Rollback Plan

If Typir integration fails:
1. Keep custom type system code in `type-system-legacy/` directory during migration
2. Feature flag: `ENABLE_TYPIR_TYPE_SYSTEM` environment variable
3. Revert to custom type system if critical issues arise
4. Document Typir issues for future re-attempt

---

## Open Questions

None remaining - all clarifications resolved during research phase.

---

## References

- **Typir Documentation**: `f:/projects/typir/documentation/`
- **Typir Examples**: `f:/projects/typir/examples/lox`, `f:/projects/typir/examples/ox`
- **Current Type System**: `packages/language/src/type-system/`
- **Operation Registry**: `packages/language/src/compiler/operations/registry.generated.ts`
- **Feature Specification**: `specs/003-type-system-the/spec.md`
