# Quick Start: Typir Type System Integration

**Feature**: Robust Type System with Typir Integration
**Branch**: `003-type-system-the`
**Last Updated**: 2025-10-19

## Overview

This guide walks through the essential steps for implementing the Typir-based type system in Eligian. Follow this guide to understand the high-level implementation flow before diving into detailed tasks.

---

## Prerequisites

Before starting implementation:

- ✅ Read [spec.md](./spec.md) - Understand user stories and requirements
- ✅ Read [research.md](./research.md) - Understand Typir architecture and migration strategy
- ✅ Read [data-model.md](./data-model.md) - Understand type graph structure

---

## Implementation Phases

### Phase 1: Setup and Dependencies (1-2 hours)

**Goal**: Install Typir libraries and create basic infrastructure.

**Steps**:

1. **Install packages**:
   ```bash
   pnpm add typir typir-langium --filter @eligian/language
   ```

2. **Create directory structure**:
   ```bash
   mkdir -p src/type-system-typir
   ```

3. **Create files**:
   - `src/type-system-typir/eligian-specifics.ts` - Type definitions for Langium integration
   - `src/type-system-typir/eligian-type-system.ts` - Type system definition
   - `src/type-system-typir/index.ts` - Public exports

**Verification**:
- `pnpm run build` succeeds
- No TypeScript errors

---

### Phase 2: Define Language Specifics (30 min)

**Goal**: Configure Typir to understand Eligian's AST structure.

**File**: `src/type-system-typir/eligian-specifics.ts`

```typescript
import type { TypirLangiumSpecifics } from 'typir-langium';
import type { EligianAstType } from '../language/generated/ast.js';

export interface EligianSpecifics extends TypirLangiumSpecifics {
  AstTypes: EligianAstType;
}
```

**Verification**:
- File compiles without errors
- `EligianAstType` is correctly imported from generated AST

---

### Phase 3: Create Type System Definition (3-4 hours)

**Goal**: Implement `LangiumTypeSystemDefinition` with primitive types.

**File**: `src/type-system-typir/eligian-type-system.ts`

```typescript
import type { LangiumTypeSystemDefinition, TypirLangiumServices } from 'typir-langium';
import type { AstNode } from 'langium';
import type { EligianSpecifics } from './eligian-specifics.js';

export class EligianTypeSystem implements LangiumTypeSystemDefinition<EligianSpecifics> {

  onInitialize(typir: TypirLangiumServices<EligianSpecifics>): void {
    // Step 1: Create 6 primitive types
    const stringType = typir.factory.Primitives.create({ primitiveName: 'string' })
      .inferenceRule({ /* TODO: implement */ })
      .finish();

    const numberType = typir.factory.Primitives.create({ primitiveName: 'number' })
      .inferenceRule({ /* TODO: implement */ })
      .finish();

    // TODO: boolean, object, array, unknown

    // Step 2: Create function types for operations
    // TODO: Iterate over OPERATION_REGISTRY

    // Step 3: Register global inference rules
    // TODO: Parameter inference, variable inference

    // Step 4: Register global validation rules
    // TODO: Variable declaration validation
  }

  onNewAstNode(languageNode: AstNode, typir: TypirLangiumServices<EligianSpecifics>): void {
    // Eligian has no user-defined types currently
    // Leave empty for now
  }
}
```

**Verification**:
- Type system compiles without errors
- `onInitialize()` creates all 6 primitive types
- Type names match current type system (`'string'`, `'number'`, `'boolean'`, `'object'`, `'array'`, `'unknown'`)

---

### Phase 4: Integrate with Langium Services (1-2 hours)

**Goal**: Add Typir to Eligian's service container.

**File**: `src/eligian-module.ts`

**Steps**:

1. **Add Typir service type**:
   ```typescript
   import type { TypirLangiumServices } from 'typir-langium';
   import type { EligianSpecifics } from './type-system-typir/eligian-specifics.js';

   export type EligianAddedServices = {
     validation: {
       EligianValidator: EligianValidator,
     },
     typir: TypirLangiumServices<EligianSpecifics>,
   }
   ```

2. **Create Typir service in module**:
   ```typescript
   import { createTypirLangiumServices } from 'typir-langium';
   import { EligianTypeSystem } from './type-system-typir/eligian-type-system.js';

   export function createEligianModule(shared: LangiumSharedCoreServices): Module<...> {
     return {
       // ... existing services
       typir: () => createTypirLangiumServices(
         shared,
         reflection,  // From generated Langium module
         new EligianTypeSystem(),
         {} // Optional customizations
       ),
     };
   }
   ```

3. **Initialize Typir services**:
   ```typescript
   import { initializeLangiumTypirServices } from 'typir-langium';

   export function createEligianServices(context: DefaultSharedModuleContext): {...} {
     // ... create services

     // Initialize Typir AFTER service creation
     initializeLangiumTypirServices(Eligian, Eligian.typir);

     return { shared, Eligian };
   }
   ```

**Verification**:
- `pnpm run build` succeeds
- Language server starts without errors
- Open any `.eligian` file in VS Code - no crashes

---

### Phase 5: Implement Primitive Type Inference (2-3 hours)

**Goal**: Infer types from literal expressions and type annotations.

**File**: `src/type-system-typir/eligian-type-system.ts` (in `onInitialize()`)

**Key Patterns**:

1. **Literal Inference**:
   ```typescript
   const stringType = typir.factory.Primitives.create({ primitiveName: 'string' })
     .inferenceRule({
       filter: (node): node is StringLiteral => node.$type === 'StringLiteral'
     })
     .finish();
   ```

2. **Type Annotation Inference**:
   ```typescript
   typir.Inference.addInferenceRulesForAstNodes({
     TypeAnnotation: (node: TypeAnnotation) => {
       switch (node.type) {
         case 'string': return stringType;
         case 'number': return numberType;
         case 'boolean': return booleanType;
         case 'object': return objectType;
         case 'array': return arrayType;
         case 'unknown': return unknownType;
         default: return unknownType;
       }
     }
   });
   ```

**Verification**:
- Write test: `.eligian` file with type annotations
- Verify types are inferred correctly (check via debugger or logging)

---

### Phase 6: Integrate Operation Registry (4-5 hours)

**Goal**: Create function types for all Eligius operations.

**File**: `src/type-system-typir/eligian-type-system.ts` (in `onInitialize()`)

**Steps**:

1. **Import operation registry**:
   ```typescript
   import { OPERATION_REGISTRY } from '../compiler/operations/registry.generated.js';
   ```

2. **Map ParameterType to Typir types**:
   ```typescript
   function mapParameterTypeToTypirType(
     paramType: ParameterType[] | ConstantValue[],
     primitives: { string, number, boolean, object, array, unknown }
   ): Type {
     // See research.md for full mapping logic
   }
   ```

3. **Create function types**:
   ```typescript
   for (const [opName, opSig] of Object.entries(OPERATION_REGISTRY)) {
     const inputParams = opSig.parameters.map(param => ({
       name: param.name,
       type: mapParameterTypeToTypirType(param.type, primitives)
     }));

     typir.factory.Functions.create({
       functionName: opName,
       outputParameter: { name: '', type: unknownType },
       inputParameters: inputParams,
     })
     .inferenceRuleForCalls({
       filter: (node): node is OperationCall => node.$type === 'OperationCall',
       matching: (call) => call.operationName === opName,
       inputArguments: (call) => call.args,
       validateArgumentsOfFunctionCalls: true,  // AUTO TYPE CHECKING!
     })
     .finish();
   }
   ```

**Verification**:
- ~100+ function types created (one per operation)
- Type checking errors appear for operation calls with wrong argument types

---

### Phase 7: Implement Parameter Inference (3-4 hours)

**Goal**: Infer parameter types from usage patterns.

**File**: `src/type-system-typir/eligian-type-system.ts` (in `onInitialize()`)

**Inference Rules**:

```typescript
typir.Inference.addInferenceRulesForAstNodes({
  // Parameters: explicit annotation or inferred from usage
  Parameter: (param: Parameter) => {
    if (param.typeAnnotation) {
      return param.typeAnnotation;  // Use explicit type
    }
    // Otherwise Typir infers from usage via operation function signatures
    return InferenceRuleNotApplicable;
  },

  // Variable declarations
  VariableDeclaration: (varDecl: VariableDeclaration) => {
    if (varDecl.typeAnnotation) {
      return varDecl.typeAnnotation;
    } else if (varDecl.initialValue) {
      return varDecl.initialValue;  // Recursive inference
    } else {
      return unknownType;
    }
  },

  // Variable references
  VariableReference: (varRef: VariableReference) => {
    const decl = varRef.variable?.ref;
    return decl ? decl : unknownType;
  },

  // Parameter references
  ParameterReference: (paramRef: ParameterReference) => {
    const decl = paramRef.parameter?.ref;
    return decl ? decl : unknownType;
  },
});
```

**Verification**:
- Test: Action with unannotated parameter passed to operation
- Verify parameter type is inferred correctly
- Verify type errors appear for incompatible usage

---

### Phase 8: Implement Validation Rules (2-3 hours)

**Goal**: Add custom validation for variable declarations.

**File**: `src/type-system-typir/eligian-type-system.ts` (in `onInitialize()`)

```typescript
typir.validation.Collector.addValidationRulesForAstNodes({
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
});
```

**Verification**:
- Test: Variable with type annotation and incompatible initial value
- Verify validation error appears
- Verify error message matches expected format

---

### Phase 9: Remove Custom Type System (1-2 hours)

**Goal**: Delete old type checking code from validator.

**Files to Modify**:
- `src/eligian-validator.ts` - Remove type checking methods
- `src/type-system/` - Delete entire directory

**Steps**:

1. **Remove validator methods**:
   - `checkTypeAnnotationsInAction()`
   - `checkTypeAnnotationsInStartOps()`
   - `checkTypeAnnotationsInEndOps()`
   - `collectTypeAnnotations()`
   - `validateTypeSequence()`
   - All type-related helper methods

2. **Remove validation checks registration**:
   - Remove type checking from `ValidationChecks<EligianAstType>`

3. **Delete type system directory**:
   ```bash
   rm -rf src/type-system/
   ```

**Verification**:
- `pnpm run build` succeeds
- All tests pass (type checking now handled by Typir)

---

### Phase 10: Test Migration (3-4 hours)

**Goal**: Ensure all 25 type system tests pass with Typir.

**File**: `src/__tests__/type-system.spec.ts`

**Steps**:

1. **Run existing tests**:
   ```bash
   pnpm run test -- type-system.spec.ts
   ```

2. **Fix failing tests**:
   - Verify error messages match expected format
   - Adjust test assertions if needed
   - Add Typir-specific tests if needed

3. **Run full test suite**:
   ```bash
   pnpm run test
   ```

**Verification**:
- All 298 tests pass
- No regressions in existing functionality

---

### Phase 11: VS Code Extension Testing (2-3 hours)

**Goal**: Verify type checking works in the IDE.

**Manual Testing Checklist**:

- [ ] Open `.eligian` file with type errors → Red squiggles appear
- [ ] Hover over error → Error message displayed
- [ ] Problems panel shows type errors with correct locations
- [ ] Type errors appear within 500ms of typing
- [ ] Autocomplete filters suggestions by type context
- [ ] Untyped code (no annotations) works without errors
- [ ] Mixed typed/untyped code works correctly

**Performance Testing**:
- [ ] Large file (500+ lines) - No lag in IDE
- [ ] Multiple files open - Type checking works for all
- [ ] Document update - Type errors refresh correctly

---

## Common Issues and Solutions

### Issue: "Typir services not initialized"

**Symptom**: Error on extension startup

**Solution**: Ensure `initializeLangiumTypirServices()` is called AFTER creating services:
```typescript
const Eligian = inject(...);
initializeLangiumTypirServices(Eligian, Eligian.typir);  // AFTER inject()
```

### Issue: "Type not found for AST node"

**Symptom**: Inference returns `InferenceProblem[]`

**Solution**: Check inference rules are registered correctly:
- Verify `filter` or `languageKey` matches the AST node type
- Ensure `matching` function returns `true` for the node
- Debug: Add logging to inference rules to see which rules are evaluated

### Issue: "Validation errors not appearing in IDE"

**Symptom**: Type errors not shown in Problems panel

**Solution**: Verify validation is registered:
- Check `initializeLangiumTypirServices()` was called
- Verify validation rules are registered in `onInitialize()`
- Check Langium's `ValidationRegistry` includes Typir validation

### Issue: "Unknown type allows everything"

**Symptom**: Expected type error doesn't appear

**Solution**: This is intentional! `unknown` type is compatible with ALL types for backward compatibility. Verify the parameter/variable has a non-unknown type annotation or inferred type.

### Issue: "Performance degradation in large files"

**Symptom**: IDE lags when editing large files

**Solution**:
- Use `languageKey` instead of `filter` in inference rules (more performant)
- Profile type checking - identify slow inference rules
- Check for infinite recursion in inference (use cache inspection)

---

## Next Steps After Implementation

1. **Update documentation**:
   - Document Typir integration in `CLAUDE.md`
   - Update type system README (if keeping for reference)
   - Add Typir examples to `examples/` directory

2. **Create migration guide**:
   - Guide users on updating existing code (if needed)
   - Explain new type error messages

3. **Monitor performance**:
   - Collect metrics on type checking overhead
   - Optimize slow inference rules if needed

4. **Plan future enhancements**:
   - Union types (`string | number`)
   - Generic types (`Array<T>`)
   - Structural typing

---

## Reference Links

- **Feature Specification**: [spec.md](./spec.md)
- **Research Findings**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Typir Documentation**: `f:/projects/typir/documentation/`
- **Typir Examples**: `f:/projects/typir/examples/lox`, `f:/projects/typir/examples/ox`
- **Constitution**: `.specify/memory/constitution.md`

---

## Estimated Timeline

| Phase | Estimated Time | Cumulative |
|-------|----------------|------------|
| 1. Setup and Dependencies | 1-2 hours | 1-2 hours |
| 2. Language Specifics | 30 min | 2-3 hours |
| 3. Type System Definition | 3-4 hours | 5-7 hours |
| 4. Langium Integration | 1-2 hours | 6-9 hours |
| 5. Primitive Inference | 2-3 hours | 8-12 hours |
| 6. Operation Registry | 4-5 hours | 12-17 hours |
| 7. Parameter Inference | 3-4 hours | 15-21 hours |
| 8. Validation Rules | 2-3 hours | 17-24 hours |
| 9. Cleanup | 1-2 hours | 18-26 hours |
| 10. Test Migration | 3-4 hours | 21-30 hours |
| 11. IDE Testing | 2-3 hours | 23-33 hours |

**Total Estimated Time**: 23-33 hours (3-4 working days)

---

## Success Criteria

✅ All 298 existing tests pass
✅ Type errors appear in IDE within 500ms
✅ Autocomplete filters suggestions by type
✅ 100% backward compatibility (untyped code works)
✅ Error messages match existing format
✅ No performance degradation in typical files
✅ Type system handles 1000+ line files without lag
