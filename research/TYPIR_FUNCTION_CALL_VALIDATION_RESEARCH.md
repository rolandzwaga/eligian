# Typir-Langium Function Call Validation Research

## Executive Summary

This document provides a comprehensive analysis of how Typir-Langium handles function call validation based on examination of the OX and LOX examples from the TypeFox/typir repository. The key findings address the specific questions about function type creation, validation triggering in LSP, inference rules vs validation rules, registration requirements, and common pitfalls.

---

## 1. How Function Types Are Created and Registered

### In `onNewAstNode()` Lifecycle Hook

Function types are created **dynamically** when `FunctionDeclaration` AST nodes are encountered during Langium's document build process. The type system is notified via the `onNewAstNode()` callback.

### OX Example (Simpler)

```typescript
onNewAstNode(languageNode: AstNode, typir: TypirLangiumServices<OxSpecifics>): void {
    if (isFunctionDeclaration(languageNode)) {
        const functionName = languageNode.name;

        // Create function type with Typir factory
        typir.factory.Functions.create({
            functionName,
            // Type inference maps language types to Typir types automatically
            outputParameter: { name: NO_PARAMETER_NAME, type: languageNode.returnType },
            inputParameters: languageNode.parameters.map(p => ({
                name: p.name,
                type: p.type
            })),
            associatedLanguageNode: languageNode,
        })
        // Inference rule for function declaration itself
        .inferenceRuleForDeclaration({
            languageKey: FunctionDeclaration.$type,
            matching: (node: FunctionDeclaration) => node === languageNode
        })
        // Inference rule for function CALLS
        .inferenceRuleForCalls({
            languageKey: MemberCall.$type,
            matching: (call: MemberCall) =>
                isFunctionDeclaration(call.element.ref) &&
                call.explicitOperationCall &&
                call.element.ref.name === functionName,
            inputArguments: (call: MemberCall) => call.arguments,
            validateArgumentsOfFunctionCalls: true, // KEY: Enables validation
        })
        .finish();
    }
}
```

### LOX Example (More Complex - Handles Both Functions and Methods)

```typescript
onNewAstNode(node: AstNode, typir: TypirLangiumServices<LoxSpecifics>): void {
    if (isFunctionDeclaration(node)) {
        this.createFunctionDetails(node, typir);
    }
    // ... class handling ...
}

protected createFunctionDetails(
    node: FunctionDeclaration | MethodMember,
    typir: TypirLangiumServices<LoxSpecifics>
): TypeInitializer<FunctionType, LoxSpecifics> {
    const config = typir.factory.Functions
        .create({
            functionName: node.name,
            outputParameter: { name: NO_PARAMETER_NAME, type: node.returnType },
            inputParameters: node.parameters.map(p => ({
                name: p.name,
                type: p.type
            })),
            associatedLanguageNode: node,
        })
        .inferenceRuleForDeclaration({
            languageKey: node.$type,
            matching: (languageNode) => languageNode === node,
        });

    // Different inference rules for functions vs methods
    if (isFunctionDeclaration(node)) {
        config.inferenceRuleForCalls({
            languageKey: MemberCall.$type,
            matching: (languageNode: MemberCall) =>
                isFunctionDeclaration(languageNode.element?.ref) &&
                languageNode.explicitOperationCall &&
                languageNode.element!.ref === node,
            inputArguments: (languageNode: MemberCall) => languageNode.arguments,
            validateArgumentsOfFunctionCalls: true,
        });
    } else if (isMethodMember(node)) {
        config.inferenceRuleForCalls({
            languageKey: MemberCall.$type,
            matching: (languageNode: MemberCall) =>
                isMethodMember(languageNode.element?.ref) &&
                languageNode.explicitOperationCall &&
                languageNode.element!.ref === node,
            inputArguments: (languageNode: MemberCall) => languageNode.arguments,
            validateArgumentsOfFunctionCalls: true,
        });
    }

    return config.finish();
}
```

### Key Insights

1. **Type inference is automatic**: When you pass `languageNode.returnType` or `p.type`, Typir internally infers the corresponding Typir type using registered inference rules.

2. **Two separate inference rules**:
   - `inferenceRuleForDeclaration`: Matches the function declaration itself
   - `inferenceRuleForCalls`: Matches function call sites

3. **`associatedLanguageNode`**: Links the Typir type back to the AST node for error reporting and scope resolution.

4. **`finish()`**: Must be called to complete type creation and register all rules.

---

## 2. How Function Call Validation is Triggered in LSP

### Automatic Integration with Langium's Validation Phase

**Critical Finding**: Typir-Langium **automatically hooks into Langium's AST traversal during the validation phase**. You do NOT need to manually trigger validation.

### The Initialization Sequence

From `ox-module.ts` and `lox-module.ts`:

```typescript
export function createOxServices(context: DefaultSharedModuleContext) {
    const shared = inject(
        createDefaultSharedModule(context),
        OxGeneratedSharedModule
    );

    const Ox = inject(
        createDefaultModule({ shared }),
        OxGeneratedModule,
        createOxModule(shared),
    );

    shared.ServiceRegistry.register(Ox);
    registerValidationChecks(Ox); // Langium validation registration

    // KEY: This initializes Typir's integration with Langium's lifecycle
    initializeLangiumTypirServices(Ox, Ox.typir);

    return { shared, Ox };
}
```

### What `initializeLangiumTypirServices()` Does

This function (from typir-langium) sets up:

1. **Document lifecycle listeners**: Typir listens to Langium's document changes
2. **AST traversal hooks**: Calls `onNewAstNode()` for each AST node during build
3. **Validation integration**: Registers Typir's validation rules with Langium's validation system
4. **Type cleanup**: Removes user-defined types when documents are deleted/updated

### Validation Flow

```
1. User edits document in VS Code
   ↓
2. Langium parses document → AST
   ↓
3. Typir-Langium's document listener triggered
   ↓
4. onNewAstNode() called for each AST node
   ↓
5. Function types created/updated with inference rules
   ↓
6. Langium's validation phase begins
   ↓
7. Typir-Langium traverses AST automatically
   ↓
8. For each node, checks registered inference/validation rules
   ↓
9. For MemberCall nodes:
   - Inference rule matches function call
   - If validateArgumentsOfFunctionCalls: true
   - Validates arguments against parameters
   ↓
10. Diagnostics sent to VS Code Problems panel
```

### No Manual Validation Needed

Unlike testing (where you call `typir.Inference.inferType()`), in the LSP:
- **Validation happens automatically** during Langium's validation phase
- **No explicit `validate()` call required**
- **Diagnostics appear in real-time** as users type

---

## 3. `inferenceRuleForCalls` vs Validation Rules

### They Serve Different Purposes

| Aspect | `inferenceRuleForCalls` | Validation Rules |
|--------|------------------------|------------------|
| **Purpose** | Infer the type of a function call expression | Check semantic constraints |
| **When Applied** | During type inference phase | During validation phase |
| **Returns** | A Typir type (FunctionType's return type) | Validation errors/warnings |
| **Scope** | Specific to function/operator types | General AST node checks |
| **Argument Validation** | Optional via `validateArgumentsOfFunctionCalls: true` | Always custom |

### `inferenceRuleForCalls` with Validation Enabled

```typescript
.inferenceRuleForCalls({
    languageKey: MemberCall.$type,
    matching: (call: MemberCall) => /* matches this function */,
    inputArguments: (call: MemberCall) => call.arguments,

    // When TRUE: Automatically validates that arguments are assignable to parameters
    validateArgumentsOfFunctionCalls: true,
})
```

**What `validateArgumentsOfFunctionCalls: true` does:**
1. Infers the type of each argument expression
2. Compares it to the corresponding parameter type
3. Uses Typir's assignability rules (with subtyping, conversions)
4. Generates validation errors for type mismatches
5. **This is built-in validation** - no custom code needed!

### Explicit Validation Rules

Used for **additional semantic checks** beyond argument types:

```typescript
typir.validation.Collector.addValidationRulesForAstNodes({
    ReturnStatement: (node, accept, typir) => {
        const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
        if (functionDeclaration && functionDeclaration.returnType.primitive !== 'void' && node.value) {
            // Custom validation: return value must match function's return type
            typir.validation.Constraints.ensureNodeIsAssignable(
                node.value,
                functionDeclaration.returnType,
                accept,
                () => ({
                    message: `Return value type mismatch`,
                    languageProperty: 'value'
                })
            );
        }
    },

    VariableDeclaration: (node, accept, typir) => {
        // Custom validation: can't declare void variables
        typir.validation.Constraints.ensureNodeHasNotType(
            node,
            typeVoid,
            accept,
            () => ({
                message: "Variables can't be declared with the type 'void'.",
                languageProperty: 'type'
            })
        );
    },
});
```

### When to Use Each

**Use `inferenceRuleForCalls` + `validateArgumentsOfFunctionCalls: true`:**
- Function/method call argument validation
- Operator operand validation
- Standard type compatibility checks
- When you want **automatic validation** based on signatures

**Use explicit validation rules:**
- Return statement validation
- Variable declaration constraints
- Conditional expression requirements (e.g., "must be boolean")
- Custom semantic rules specific to your language
- When you need **custom error messages** or special logic

### They Work Together

```typescript
// In onNewAstNode:
typir.factory.Functions.create(...)
    .inferenceRuleForCalls({
        validateArgumentsOfFunctionCalls: true, // Validates argument types
    })
    .finish();

// In onInitialize:
typir.validation.Collector.addValidationRulesForAstNodes({
    ReturnStatement: validateReturnStatement, // Additional validation
    IfStatement: validateCondition,           // Additional validation
});
```

---

## 4. Special Configuration Beyond `onNewAstNode()`

### Required Setup Steps

#### Step 1: Define Typir Service Type

```typescript
export type MyDSLAddedServices = {
    validation: {
        MyDSLValidator: MyDSLValidator
    },
    typir: TypirLangiumServices<MyDSLSpecifics>, // Add Typir services
}

export type MyDSLServices = LangiumServices & MyDSLAddedServices
```

#### Step 2: Create Typir Services in Module

```typescript
export function createMyDSLModule(shared: LangiumSharedCoreServices): Module<...> {
    return {
        validation: {
            MyDSLValidator: () => new MyDSLValidator()
        },
        // Create Typir-Langium services
        typir: () => createTypirLangiumServices(
            shared,
            reflection,              // From generated ast.ts
            new MyDSLTypeSystem(),   // Your type system implementation
            { /* customize Typir services here */ }
        ),
    };
}
```

#### Step 3: Initialize Typir Services After Service Creation

```typescript
export function createMyDSLServices(context: DefaultSharedModuleContext) {
    const shared = inject(
        createDefaultSharedModule(context),
        MyDSLGeneratedSharedModule
    );

    const MyDSL = inject(
        createDefaultModule({ shared }),
        MyDSLGeneratedModule,
        createMyDSLModule(shared),
    );

    shared.ServiceRegistry.register(MyDSL);
    registerValidationChecks(MyDSL);

    // CRITICAL: Initialize Typir after all services created
    initializeLangiumTypirServices(MyDSL, MyDSL.typir);

    return { shared, MyDSL };
}
```

### Order Dependencies (Important!)

From OX comments:

```typescript
/** Hints regarding the order of Typir configurations for OX:
 * - In general, Typir aims to not depend on the order of configurations.
 *   (Beyond some obvious things, e.g. created Type instances can be used only
 *    afterwards and not before their creation.)
 * - But at the moment, this objective is not reached in general!
 * - As an example, since the function definition above uses type inference for
 *   their parameter types, it is necessary that the primitive types and their
 *   corresponding inference rules are defined earlier!
 * - In the future, the user of Typir will not need to do a topological sorting
 *   of type definitions anymore, since the type definition process will be split
 *   and parts will be delayed.
 */
```

**Practical Rule**: In `onInitialize()`, define types in dependency order:
1. Primitive types (boolean, number, string, void)
2. Primitive inference rules
3. Operators (which reference primitives)
4. Additional inference rules for expressions
5. Validation rules

Functions/classes in `onNewAstNode()` can use any types defined in `onInitialize()`.

### Accessing Typir Services

Once registered, any Langium service can access Typir:

```typescript
export class MyDSLValidator {
    checkSomething(node: AstNode, accept: ValidationAcceptor): void {
        // Access Typir through Langium services
        const typir = this.services.typir;

        // Use Typir's type inference
        const inferredType = typir.Inference.inferType(node);

        // Use Typir's validation constraints
        typir.validation.Constraints.ensureNodeIsAssignable(
            sourceNode,
            targetType,
            accept,
            () => ({ message: "Type mismatch" })
        );
    }
}
```

---

## 5. Common Pitfalls: When Validation Works in Tests but Not in VS Code

### Pitfall #1: Forgetting `initializeLangiumTypirServices()`

**Symptom**: Tests pass (because you call type inference manually), but VS Code shows no validation errors.

**Cause**: Typir isn't hooked into Langium's validation lifecycle.

**Fix**:
```typescript
export function createMyDSLServices(context: DefaultSharedModuleContext) {
    // ... service creation ...

    // DON'T FORGET THIS!
    initializeLangiumTypirServices(MyDSL, MyDSL.typir);

    return { shared, MyDSL };
}
```

### Pitfall #2: Not Setting `validateArgumentsOfFunctionCalls: true`

**Symptom**: Function calls are type-checked in tests, but not in VS Code.

**Cause**: The inference rule infers the return type but doesn't validate arguments.

**Fix**:
```typescript
.inferenceRuleForCalls({
    languageKey: MemberCall.$type,
    matching: (call) => /* ... */,
    inputArguments: (call) => call.arguments,

    // ADD THIS:
    validateArgumentsOfFunctionCalls: true,
})
```

### Pitfall #3: Wrong Matching Logic in `inferenceRuleForCalls`

**Symptom**: Some function calls are validated, others aren't.

**Cause**: The `matching` function doesn't correctly identify all call sites.

**Example Issue**:
```typescript
// BAD: Only matches by name (fails with scoping issues)
matching: (call: MemberCall) =>
    call.element.ref?.name === functionName

// GOOD: Matches by identity (works with scoping)
matching: (call: MemberCall) =>
    isFunctionDeclaration(call.element.ref) &&
    call.element.ref === node  // Identity check, not name check
```

### Pitfall #4: Missing `inputArguments` Function

**Symptom**: Validation errors show "wrong number of arguments" but don't check types.

**Cause**: Typir can't find the actual argument expressions to type-check.

**Fix**:
```typescript
.inferenceRuleForCalls({
    // ... other config ...

    // MUST provide this:
    inputArguments: (call: MemberCall) => call.arguments,

    validateArgumentsOfFunctionCalls: true,
})
```

### Pitfall #5: Type Inference Rules Not Registered for Primitives

**Symptom**: Function argument validation always fails, even for correct types.

**Cause**: Primitive types (number, string, etc.) don't have inference rules, so argument expressions have unknown types.

**Fix** (in `onInitialize`):
```typescript
const typeNumber = typir.factory.Primitives.create({ primitiveName: 'number' })
    // MUST have inference rules for literals:
    .inferenceRule({ languageKey: NumberLiteral.$type })
    // AND for type references:
    .inferenceRule({
        languageKey: TypeReference.$type,
        matching: (node: TypeReference) => node.primitive === 'number'
    })
    .finish();
```

### Pitfall #6: Order Dependency Issues

**Symptom**: Some type checks work, others fail with "unknown type" errors.

**Cause**: Function parameter types are inferred before primitive types are defined.

**Fix**: Always define primitives in `onInitialize()`, functions in `onNewAstNode()`:
```typescript
onInitialize(typir) {
    // 1. Primitives first
    const typeNumber = typir.factory.Primitives.create(...)
        .inferenceRule(...)
        .finish();

    // 2. Then operators/validations that use them
}

onNewAstNode(node, typir) {
    // 3. Functions can safely reference primitives defined above
    if (isFunctionDeclaration(node)) {
        typir.factory.Functions.create({
            inputParameters: node.parameters.map(p => ({
                type: p.type  // Will correctly infer to typeNumber
            }))
        })...
    }
}
```

### Pitfall #7: Unresolved Cross-References

**Symptom**: Function calls show no type errors, even when types are wrong.

**Cause**: If `call.element.ref` is undefined (unresolved reference), the matching function returns false early.

**Fix**: Check for undefined and handle gracefully:
```typescript
matching: (call: MemberCall) => {
    const ref = call.element?.ref;
    if (!ref) return false; // Unresolved reference

    return isFunctionDeclaration(ref) &&
           ref === node &&
           call.explicitOperationCall;
}
```

LOX does this explicitly:
```typescript
MemberCall: (languageNode) => {
    const ref = languageNode.element?.ref;
    if (ref === undefined) {
        // Unresolved cross-reference: syntactic issues must be fixed
        // before type checking can be applied
        return InferenceRuleNotApplicable;
    }
    // ... handle resolved cases ...
}
```

---

## 6. Complete Working Example: Minimal Function Validation

Here's a complete minimal example that will work in both tests and VS Code:

### Grammar (my-dsl.langium)

```langium
FunctionDeclaration:
    'fun' name=ID '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
    ':' returnType=TypeReference
    body=Block;

Parameter:
    name=ID ':' type=TypeReference;

TypeReference:
    primitive=('number' | 'string' | 'boolean');

MemberCall:
    element=[FunctionDeclaration:ID]
    (explicitOperationCall?='(' (arguments+=Expression (',' arguments+=Expression)*)? ')')?;
```

### Type System (my-dsl-type-checking.ts)

```typescript
import { AstNode } from 'langium';
import { NO_PARAMETER_NAME, InferenceRuleNotApplicable } from 'typir';
import { LangiumTypeSystemDefinition, TypirLangiumServices, TypirLangiumSpecifics } from 'typir-langium';
import {
    FunctionDeclaration,
    MemberCall,
    NumberLiteral,
    TypeReference,
    MyDSLAstType,
    isFunctionDeclaration,
    isNumberLiteral
} from './generated/ast.js';

export interface MyDSLSpecifics extends TypirLangiumSpecifics {
    AstTypes: MyDSLAstType;
}

export class MyDSLTypeSystem implements LangiumTypeSystemDefinition<MyDSLSpecifics> {

    onInitialize(typir: TypirLangiumServices<MyDSLSpecifics>): void {
        // 1. Define primitive types with inference rules
        const typeNumber = typir.factory.Primitives.create({ primitiveName: 'number' })
            .inferenceRule({ languageKey: NumberLiteral.$type })
            .inferenceRule({
                languageKey: TypeReference.$type,
                matching: (node: TypeReference) => node.primitive === 'number'
            })
            .finish();

        // 2. Add inference rule for expressions
        typir.Inference.addInferenceRulesForAstNodes({
            MemberCall: (languageNode) => {
                const ref = languageNode.element?.ref;
                if (!ref) return InferenceRuleNotApplicable;
                if (isFunctionDeclaration(ref)) {
                    return InferenceRuleNotApplicable; // Handled by inferenceRuleForCalls
                }
                // ... handle other cases ...
            },
        });
    }

    onNewAstNode(languageNode: AstNode, typir: TypirLangiumServices<MyDSLSpecifics>): void {
        if (isFunctionDeclaration(languageNode)) {
            typir.factory.Functions.create({
                functionName: languageNode.name,
                outputParameter: {
                    name: NO_PARAMETER_NAME,
                    type: languageNode.returnType
                },
                inputParameters: languageNode.parameters.map(p => ({
                    name: p.name,
                    type: p.type
                })),
                associatedLanguageNode: languageNode,
            })
            .inferenceRuleForDeclaration({
                languageKey: FunctionDeclaration.$type,
                matching: (node: FunctionDeclaration) => node === languageNode
            })
            .inferenceRuleForCalls({
                languageKey: MemberCall.$type,
                matching: (call: MemberCall) =>
                    isFunctionDeclaration(call.element?.ref) &&
                    call.element.ref === languageNode &&
                    call.explicitOperationCall === true,
                inputArguments: (call: MemberCall) => call.arguments,
                validateArgumentsOfFunctionCalls: true, // KEY!
            })
            .finish();
        }
    }
}
```

### Module (my-dsl-module.ts)

```typescript
import { LangiumSharedCoreServices, Module, inject } from 'langium';
import {
    DefaultSharedModuleContext,
    LangiumServices,
    LangiumSharedServices,
    PartialLangiumServices,
    createDefaultModule,
    createDefaultSharedModule
} from 'langium/lsp';
import {
    TypirLangiumServices,
    createTypirLangiumServices,
    initializeLangiumTypirServices
} from 'typir-langium';
import { reflection } from './generated/ast.js';
import { MyDSLGeneratedModule, MyDSLGeneratedSharedModule } from './generated/module.js';
import { MyDSLSpecifics, MyDSLTypeSystem } from './my-dsl-type-checking.js';
import { MyDSLValidator, registerValidationChecks } from './my-dsl-validator.js';

export type MyDSLAddedServices = {
    validation: {
        MyDSLValidator: MyDSLValidator
    },
    typir: TypirLangiumServices<MyDSLSpecifics>,
}

export type MyDSLServices = LangiumServices & MyDSLAddedServices

export function createMyDSLModule(shared: LangiumSharedCoreServices): Module<MyDSLServices, PartialLangiumServices & MyDSLAddedServices> {
    return {
        validation: {
            MyDSLValidator: () => new MyDSLValidator()
        },
        typir: () => createTypirLangiumServices(shared, reflection, new MyDSLTypeSystem()),
    };
}

export function createMyDSLServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    MyDSL: MyDSLServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        MyDSLGeneratedSharedModule
    );
    const MyDSL = inject(
        createDefaultModule({ shared }),
        MyDSLGeneratedModule,
        createMyDSLModule(shared),
    );
    shared.ServiceRegistry.register(MyDSL);
    registerValidationChecks(MyDSL);

    // CRITICAL: Initialize Typir-Langium integration
    initializeLangiumTypirServices(MyDSL, MyDSL.typir);

    return { shared, MyDSL };
}
```

---

## 7. Testing vs LSP: Key Differences

### In Tests

```typescript
import { createMyDSLServices } from './my-dsl-module.js';
import { parseHelper } from 'langium/test';

test('function call validation', async () => {
    const services = createMyDSLServices(EmptyFileSystem).MyDSL;
    const parse = parseHelper<Program>(services);

    const result = await parse(`
        fun add(x: number, y: number): number { ... }
        add("hello", 42)  // Should error
    `);

    // Manual type inference in tests
    const call = /* find the MemberCall node */;
    const inferredType = services.typir.Inference.inferType(call);

    // Manual validation check
    const validationResult = await services.validation.DocumentValidator
        .validateDocument(result.document);

    expect(validationResult).toContainError('type mismatch');
});
```

**Test characteristics:**
- Explicit calls to `inferType()` and `validateDocument()`
- You control when validation happens
- Uses `EmptyFileSystem` or test fixtures
- Synchronous or async as needed

### In VS Code LSP

```typescript
// No test code needed - happens automatically!

// 1. User types: add("hello", 42)
// 2. Langium parses document
// 3. onNewAstNode() creates function type (if not already created)
// 4. Langium's validation phase runs
// 5. Typir's inference rule matches the call
// 6. validateArgumentsOfFunctionCalls: true triggers validation
// 7. Error appears in Problems panel: "Argument of type 'string' is not assignable to parameter of type 'number'"
```

**LSP characteristics:**
- Fully automatic - no manual calls
- Triggered by document changes
- Real-time feedback as user types
- Integrated with VS Code's diagnostic system

### The Bridge: `initializeLangiumTypirServices()`

This function sets up the automatic behavior:

```typescript
// Pseudo-code of what it does internally:
function initializeLangiumTypirServices(services, typir) {
    // 1. Hook into document lifecycle
    services.shared.workspace.DocumentBuilder.onBuildPhase(
        DocumentState.Validated,
        (documents) => {
            for (const doc of documents) {
                // 2. Traverse AST, call onNewAstNode for each node
                AstUtils.streamAllContents(doc.parseResult.value).forEach(node => {
                    typeSystem.onNewAstNode(node, typir);
                });

                // 3. Register Typir's validation rules with Langium
                for (const [nodeType, validator] of typir.validation.Collector.rules) {
                    services.validation.ValidationRegistry.register(
                        nodeType,
                        validator
                    );
                }
            }
        }
    );
}
```

---

## 8. Summary: Checklist for Function Call Validation

### Setup Checklist

- [ ] Define `TypirLangiumServices<MyDSLSpecifics>` in service types
- [ ] Create Typir services with `createTypirLangiumServices()` in module
- [ ] Call `initializeLangiumTypirServices()` after service creation
- [ ] Implement `LangiumTypeSystemDefinition<MyDSLSpecifics>`
- [ ] Define primitive types with inference rules in `onInitialize()`
- [ ] Create function types in `onNewAstNode()` when `isFunctionDeclaration(node)`

### Function Type Creation Checklist

- [ ] Use `typir.factory.Functions.create()` with:
  - [ ] `functionName`
  - [ ] `outputParameter` (return type)
  - [ ] `inputParameters` (parameter types)
  - [ ] `associatedLanguageNode`
- [ ] Add `inferenceRuleForDeclaration()` to match function declaration
- [ ] Add `inferenceRuleForCalls()` with:
  - [ ] `languageKey: MemberCall.$type` (or equivalent call node)
  - [ ] `matching: (call) => ...` (identity check, not just name)
  - [ ] `inputArguments: (call) => call.arguments`
  - [ ] `validateArgumentsOfFunctionCalls: true`
- [ ] Call `finish()` to complete type creation

### Validation Checklist

- [ ] Primitive types have inference rules for literals and type references
- [ ] Order: primitives → operators → functions
- [ ] Handle unresolved references (`ref === undefined`)
- [ ] Use identity checks (`ref === node`) not name checks
- [ ] Additional semantic validation via `addValidationRulesForAstNodes()`

### Debugging Checklist

If validation works in tests but not VS Code:
- [ ] Verify `initializeLangiumTypirServices()` is called
- [ ] Check `validateArgumentsOfFunctionCalls: true` is set
- [ ] Ensure `inputArguments` function returns correct expression nodes
- [ ] Verify `matching` function uses identity checks
- [ ] Confirm primitive types have inference rules
- [ ] Check order: primitives defined before functions
- [ ] Test with unresolved references (typos in function names)

---

## 9. References

### Source Files Analyzed

- `examples/ox/src/language/ox-type-checking.ts`
- `examples/ox/src/language/ox-module.ts`
- `examples/ox/src/language/ox.langium`
- `examples/lox/src/language/lox-type-checking.ts`
- `examples/lox/src/language/lox-module.ts`
- `packages/typir-langium/README.md`

### Key Typir-Langium APIs

- `LangiumTypeSystemDefinition<Specifics>` - Interface to implement
- `TypirLangiumServices<Specifics>` - Service type for type-checking
- `createTypirLangiumServices()` - Factory for Typir services
- `initializeLangiumTypirServices()` - Integration with Langium lifecycle
- `typir.factory.Functions.create()` - Create function types
- `inferenceRuleForDeclaration()` - Match function declarations
- `inferenceRuleForCalls()` - Match function calls + validate arguments
- `typir.validation.Collector.addValidationRulesForAstNodes()` - Custom validations

### Key Concepts

- **Type inference is automatic** when passing AST nodes as types
- **Validation is automatic** in LSP once `initializeLangiumTypirServices()` is called
- **`validateArgumentsOfFunctionCalls: true`** enables built-in argument validation
- **Order matters** for type definitions (primitives before functions)
- **Identity checks** (`node === ref`) are more reliable than name checks
- **`onInitialize()`** for constants, **`onNewAstNode()`** for user-defined types
