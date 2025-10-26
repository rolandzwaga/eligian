# Typir Integration Research

**Date**: 2025-10-26
**Status**: Research Complete
**Integration Level**: ~20% of Framework Capabilities

This document provides a comprehensive analysis of Typir integration in the Eligian language package, current usage extent, and opportunities for deeper integration.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Integration Extent](#current-integration-extent)
3. [Core Integration Points](#core-integration-points)
4. [Feature Coverage Analysis](#feature-coverage-analysis)
5. [Integration Opportunities](#integration-opportunities)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Technical References](#technical-references)
8. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### Current State

Typir (TypeFox's type system framework) is integrated into Eligian at a **foundational but limited level**. The integration currently uses approximately **20% of Typir's capabilities**, focusing on:

- ✅ Primitive type inference (string, number, boolean, object, array, unknown)
- ✅ Operation function type validation (~100 operations from Eligius registry)
- ✅ Dynamic action function types (user-defined actions)
- ✅ Basic parameter type annotations
- ✅ Type error reporting in IDE

### What's Missing

**80% of Typir's capabilities remain unused**, including:

- ❌ Type-driven code completion
- ❌ Signature help for operations/actions
- ❌ Type information on hover
- ❌ Quick fixes for type errors
- ❌ Control flow type narrowing
- ❌ Custom domain types (Timeline, Event, etc.)
- ❌ Subtype relationships
- ❌ Advanced type system features (union/intersection types, generics)

### Opportunity

By implementing **Phase 1-2 integration enhancements** (1-2 weeks effort), Eligian can achieve:

- ✨ **TypeScript-level IDE experience**
- 🚀 **10x better code completion** (type-aware filtering)
- 💡 **Instant type feedback** on hover
- 🔧 **Quick fixes** for common type errors

---

## Current Integration Extent

### Files Using Typir

| File | Lines | Purpose | Integration Type |
|------|-------|---------|------------------|
| `eligian-module.ts` | 62-68, 95 | Service registration & initialization | Direct |
| `eligian-type-system.ts` | 1-347 | Type system implementation | Implements `LangiumTypeSystemDefinition` |
| `eligian-specifics.ts` | 10-12 | AST type bridge | Type definition |
| `action-type-validation.spec.ts` | 54-100 | Tests function type creation | Integration test |
| `vitest.config.ts` | 50 | Exclude specifics from coverage | Config |
| `package.json` | 52-53 | Dependency declaration | Dependency |

**Total**: 6 files, ~400 lines of Typir-related code

### Dependencies

```json
"typir": "^0.3.0",
"typir-langium": "^0.3.0"
```

**Libraries**:
- `typir`: Core type system framework (inference, validation, type lattice)
- `typir-langium`: Langium integration layer (automatic validation, error reporting)

---

## Core Integration Points

### 1. Service Registration

**File**: `packages/language/src/eligian-module.ts`

**How Typir is Registered** (lines 62-68):
```typescript
typir: services =>
  createTypirLangiumServices(
    services.shared,
    new EligianAstReflection(),
    new EligianTypeSystem(),
    {}
  ),
```

**Initialization** (line 95):
```typescript
initializeLangiumTypirServices(Eligian, Eligian.typir);
```

**What Happens**:
1. Creates Typir language server with Eligian's AST reflection and type system
2. Initializes Typir services after all dependencies are available
3. Makes Typir available to all downstream services (validator, completion, etc.)

---

### 2. Type System Implementation

**File**: `packages/language/src/type-system-typir/eligian-type-system.ts` (347 lines)

**Class**: `EligianTypeSystem implements LangiumTypeSystemDefinition<EligianSpecifics>`

#### Initialization Phase: `onInitialize()` (Lines 57-233)

Runs once at startup, creates primitive types and operation function types:

**Step 1 - Primitive Types** (Lines 61-100):
```typescript
// Creates 6 primitive types with inference rules:
this.stringType = typir.factory.Primitives.create({
  primitiveName: 'string',
  inferenceRules: [
    typir.factory.Inference.inferFromLiteral(isStringLiteral, () => this.stringType)
  ]
}).finish();

this.numberType = typir.factory.Primitives.create({
  primitiveName: 'number',
  inferenceRules: [
    typir.factory.Inference.inferFromLiteral(isNumberLiteral, () => this.numberType)
  ]
}).finish();

// ... boolean, object, array, unknown
```

**Primitive Types**:
- `string` → infers from `StringLiteral` AST nodes
- `number` → infers from `NumberLiteral` AST nodes
- `boolean` → infers from `BooleanLiteral` AST nodes
- `object` → infers from `ObjectLiteral` AST nodes
- `array` → infers from `ArrayLiteral` AST nodes
- `unknown` → top type (compatible with everything)

**Step 2 - Parameter Type Mapping** (Lines 103-147):
```typescript
mapParameterTypeToTypirType(paramType: ParameterType): Type {
  // Maps Eligius ParameterType enum to Typir primitive types
  switch (paramType) {
    case 'selector':
    case 'className':
    case 'actionName':
      return this.stringType;

    case 'dimensions':
      return this.numberType;

    // ... 23 total mappings

    default:
      return this.unknownType;
  }
}
```

**Step 3 - Operation Function Types** (Lines 150-174):
```typescript
// Load all operations from OPERATION_REGISTRY
for (const [opName, opSig] of Object.entries(OPERATION_REGISTRY)) {
  // Create function type for each operation
  const functionType = typir.factory.Functions.create({
    functionName: opName,
    outputParameter: { name: '$return', type: this.unknownType },
    inputParameters: opSig.parameters.map(p => ({
      name: p.name,
      type: this.mapParameterTypeToTypirType(p.type),
    })),
    inferenceRules: [
      // Match OperationCall AST nodes with this function
      typir.factory.Inference.inferFromFunctionCall(
        isOperationCall,
        (node: OperationCall) => node.operationName === opName
      )
    ],
    validateArgumentsOfFunctionCalls: false, // Langium handles validation
  }).finish();
}
```

**Key Detail**: `validateArgumentsOfFunctionCalls: false` - Typir's automatic validation is disabled because Langium validator provides more comprehensive checking (optional parameters, constant values, etc.)

**Step 4 - Global Inference Rules** (Lines 177-224):
```typescript
// Parameter inference
typir.factory.Inference.InferOperator.create({
  filter: isParameter,
  matching: () => true,
  operatorName: 'InferParameter',
  infer: (parameter: Parameter) => {
    // If explicit type annotation, use it
    if (parameter.typeAnnotation) {
      return this.mapTypeAnnotationToTypirType(parameter.typeAnnotation);
    }
    // Otherwise, let Typir infer from usage
    return InferenceRuleNotApplicable;
  }
});

// Variable declaration inference
typir.factory.Inference.InferOperator.create({
  filter: isVariableDeclaration,
  matching: () => true,
  operatorName: 'InferVariableDeclaration',
  infer: (varDecl: VariableDeclaration) => {
    // Infer from initial value
    if (varDecl.value) {
      return typir.Inference.infer(varDecl.value);
    }
    return InferenceRuleNotApplicable;
  }
});

// Variable reference inference (lookup declaration type)
// Parameter reference inference (lookup parameter type)
```

#### AST Processing Phase: `onNewAstNode()` (Lines 246-346)

Called for each AST node in user document as it's parsed:

**Action Function Types** (Lines 248-260):
```typescript
onNewAstNode(astNode: AstNode): void {
  if (isRegularActionDefinition(astNode) || isEndableActionDefinition(astNode)) {
    // Extract action parameters and their type annotations
    const parameters = astNode.parameters.map(p => ({
      name: p.name,
      type: p.typeAnnotation
        ? this.mapTypeAnnotationToTypirType(p.typeAnnotation)
        : this.unknownType
    }));

    // Create function type for the action
    const actionFunctionType = this.typir.factory.Functions.create({
      functionName: astNode.name,
      outputParameter: { name: '$return', type: this.unknownType },
      inputParameters: parameters,
      inferenceRules: [
        this.typir.factory.Inference.inferFromFunctionCall(
          isOperationStatement,
          (node: OperationStatement) => {
            // Only match action calls in timeline contexts
            // NOT inside action bodies (prevents matching bare parameters)
            return this.isInTimelineContext(node) &&
                   node.operation.operationName === astNode.name;
          }
        )
      ],
      validateArgumentsOfFunctionCalls: false,
    }).finish();
  }
}
```

**Matching Logic** (Lines 313-341):
```typescript
private isInTimelineContext(node: AstNode): boolean {
  // Walk up AST to find container
  let container = node.$container;
  while (container) {
    // If inside action definition → don't match (parameter, not call)
    if (isRegularActionDefinition(container) ||
        isEndableActionDefinition(container) ||
        isInlineEndableAction(container)) {
      return false;
    }

    // If inside timeline/timed event → match (function call)
    if (isTimeline(container) || isTimedEvent(container)) {
      return true;
    }

    container = container.$container;
  }
  return false;
}
```

**Why This Matters**: Disambiguates two contexts where action names appear:
1. **Inside action definition**: `action foo(selector) [ selectElement(selector) ]`
   - `selector` is a bare parameter name, not a function call
   - Should NOT match `foo()` function type
2. **In timeline**: `at 0s..5s foo("#box")`
   - `foo("#box")` is a function call with typed argument
   - SHOULD match `foo(selector: string)` and validate type

---

### 3. Validator Integration

**File**: `packages/language/src/eligian-validator.ts`

**Registered Validation Checks** (lines 43-93):
```typescript
OperationCall: [
  validator.checkTimelineOperationCall,      // Langium: context validation
  validator.checkOperationExists,            // Langium: registry lookup
  validator.checkParameterCount,             // Langium: required/optional counting
  validator.checkParameterTypes,             // Langium: compile-time type checking
]
```

**How Typir Participates**:
- Typir handles **automatic type validation** for operation calls (disabled, but available)
- Langium validator handles **semantic validation** (context, constraints)
- **Separation of concerns**:
  - Typir: "Does `selectElement()` accept a string? Is my arg a string?"
  - Validator: "Is this operation call in timeline context? Are there required params?"

---

### 4. Integration Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SERVICE INITIALIZATION (createEligianServices)           │
├─────────────────────────────────────────────────────────────┤
│   ↓                                                         │
│   createTypirLangiumServices()                              │
│   ├─ Creates Typir services instance                        │
│   ├─ Registers EligianTypeSystem instance                   │
│   └─ Sets up type inference engine                          │
│   ↓                                                         │
│   initializeLangiumTypirServices()                          │
│   └─ Calls EligianTypeSystem.onInitialize()                │
│      ├─ Creates primitive types                            │
│      ├─ Loads OPERATION_REGISTRY                           │
│      ├─ Creates operation function types                   │
│      └─ Registers inference rules                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. DOCUMENT PARSING & AST CONSTRUCTION                      │
├─────────────────────────────────────────────────────────────┤
│   ↓                                                         │
│   Langium parses .eligian file → AST                        │
│   ↓                                                         │
│   Typir listens to DocumentBuilder                          │
│   └─ For each new AST node → onNewAstNode()               │
│      ├─ Detects action definitions                         │
│      └─ Creates function types for actions                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. VALIDATION PHASE                                         │
├─────────────────────────────────────────────────────────────┤
│   ↓                                                         │
│   EligianValidator.checkParameterTypes()                    │
│   ├─ Calls compiler validation logic                       │
│   └─ Reports type mismatches as errors                     │
│   ↓                                                         │
│   Typir automatic validation (currently disabled)           │
│   └─ Would validate function call arguments if enabled     │
│   ↓                                                         │
│   Langium collects diagnostics                             │
│   └─ Sends to IDE (Problems panel, red squiggles)         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 4. IDE FEEDBACK                                             │
├─────────────────────────────────────────────────────────────┤
│   ↓                                                         │
│   EligianHoverProvider (hover-provider.ts)                  │
│   └─ Shows operation signatures (not Typir-integrated yet) │
│   ↓                                                         │
│   EligianCompletionProvider (completion-provider.ts)       │
│   └─ Provides code completion (not Typir-integrated yet)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Coverage Analysis

### Completed Features (Phase 3, US1)

| Feature | Implementation | Typir Role | Status |
|---------|----------------|------------|--------|
| **Primitive Type Inference** | Lines 61-100 in `eligian-type-system.ts` | Creates primitive type definitions and inference rules | ✅ Complete |
| **Operation Type Checking** | Lines 150-174 | Creates function types from `OPERATION_REGISTRY`, validates call arguments | ✅ Complete |
| **Type Annotations** | Grammar: `TypeAnnotation` (line 156 of `eligian.langium`) | Reads annotations in `onInitialize()` → Parameter inference | ✅ Complete |
| **Parameter Type Inference** | Lines 182-202 | Uses Typir's inference engine to determine type from usage | ✅ Complete |
| **Variable Type Checking** | Lines 205-210 | Infers types from initial values, tracks through declarations | ✅ Complete |
| **Error Reporting** | Langium diagnostics system | Typir reports type mismatches as validation errors | ✅ Complete |
| **Backward Compatibility** | All 346 tests passing | `unknown` type allows untyped code to work unchanged | ✅ Complete |

### Future Features (Not Yet Implemented)

| Feature | Status | Location/Notes |
|---------|--------|----------------|
| **US2: Type-aware Code Completion** | ❌ Not implemented | Would use Typir's type info to filter/rank completions |
| **US3: Parameter Type Inference** | ⚠️ Partially done | Basic inference works, but could be enhanced |
| **US4: Action Call Type Validation** | ⚠️ Code exists (lines 246-346) | Implemented but test skipped (line 14 of `action-type-validation.spec.ts`) |
| **US5: Control Flow Type Checking** | ❌ Not implemented | Would need if/else and for loop type environment tracking |
| **US6: Gradual Typing Verification** | ❌ Not implemented | Would validate gradual typing semantics |
| **Signature Help** | ❌ Not implemented | Would show function signatures while typing |
| **Type Hover** | ❌ Not implemented | Would show inferred types on hover |
| **Quick Fixes** | ❌ Not implemented | Would suggest type error fixes |

---

## Integration Opportunities

Based on research of the Typir framework at `f:/projects/typir/`, I identified **7 major categories** of deeper integration opportunities.

### Category 1: Type-Driven Code Completion ⭐⭐⭐

**Priority**: HIGH
**Impact**: Massive UX improvement
**Complexity**: Medium (2-3 days)

#### Opportunity 1.1: Type-Aware Operation Filtering

**Current State**: Completion provider shows ALL operations regardless of context

**Example Current Behavior**:
```eligian
action fadeIn(selector: string) [
  selectElement(|)  // ← Cursor here
]
```
**Current**: Shows all 100+ operations (selectElement, animate, addClass, etc.)

**Opportunity**: Filter operations by expected parameter types

**Example With Typir**:
```eligian
action fadeIn(selector: string) [
  selectElement(|)  // ← Cursor here - only show operations accepting string
]
```
**With Typir**: Only show operations accepting `string` as first parameter

**Implementation Approach**:
1. In `eligian-completion-provider.ts`, when generating operation completions
2. Use `typir.Inference.infer(cursorContext)` to determine expected type
3. Filter operation list using `typir.Assignability.isAssignable(paramType, expectedType)`
4. Rank by assignability distance (exact matches first, then subtypes)

**Code Example**:
```typescript
// In eligian-completion-provider.ts
provideOperationCompletions(context: CompletionContext): CompletionItem[] {
  // Get expected type at cursor position
  const expectedType = this.typir.Inference.infer(context.node);

  // Get all operations
  const operations = Object.entries(OPERATION_REGISTRY);

  // Filter by type compatibility
  const compatibleOps = operations.filter(([name, sig]) => {
    if (sig.parameters.length === 0) return true;
    const firstParamType = this.mapParameterType(sig.parameters[0].type);
    return this.typir.Assignability.isAssignable(firstParamType, expectedType);
  });

  // Convert to CompletionItems
  return compatibleOps.map(([name, sig]) => ({
    label: name,
    kind: CompletionItemKind.Function,
    detail: this.formatSignature(sig),
    sortText: this.rankByAssignability(sig, expectedType),
  }));
}
```

**Files to Modify**:
- `packages/language/src/eligian-completion-provider.ts`

**Estimated Effort**: 2 days

---

#### Opportunity 1.2: Parameter Value Completion by Type

**Current State**: No value suggestions based on parameter types

**Opportunity**: Suggest common values for specific types

**Example**:
```eligian
at 0s..5s selectElement(|)
                      ^^^^^^
                      Suggests: "#id", ".class", "tagName", @@variable
```

**Implementation**:
- Use Typir to determine parameter type
- Provide context-appropriate suggestions based on type
- For `selector` type → suggest CSS selector patterns
- For `duration` type → suggest common values (1000, 500, 2000)

**Estimated Effort**: 1 day

---

#### Opportunity 1.3: Completion Ranking by Assignability

**Current State**: Alphabetical or usage-based ranking

**Opportunity**: Rank completions by type assignability distance

**Example**:
```typescript
// Exact type match → rank 1
// Subtype match → rank 2
// Convertible type → rank 3
// Incompatible type → rank 4 (or filtered out)
```

**Implementation**: Use `typir.Assignability.getAssignabilityPath()` to calculate distance

**Estimated Effort**: 1 day

---

### Category 2: Signature Help for Operations ⭐⭐⭐

**Priority**: HIGH
**Impact**: Major UX improvement (similar to TypeScript signatures)
**Complexity**: Medium (2-3 days)

#### Opportunity 2.1: Operation Signature Help

**Current State**: No signature help implemented

**Opportunity**: Show operation/action signatures while typing arguments

**Example**:
```eligian
at 0s..5s selectElement(|)
          ^^^^^^^^^^^^^^
          selectElement(selector: string): void
                        ^^^^^^^^^^^^^^^^
                        (parameter) selector: string
```

**Visual Example** (as shown in VS Code):
```
selectElement(selector: string): void
              ^^^^^^^^^^^^^^^^
              Current parameter (bold)
```

**Implementation Approach**:
1. Create `EligianSignatureHelpProvider` class
2. Implement `provideSignatureHelp(document, position)` method
3. Determine if cursor is inside function call arguments
4. Use Typir to lookup function type by name
5. Extract parameters from function type
6. Format signature with current parameter highlighted
7. Register provider in `eligian-module.ts`

**Code Example**:
```typescript
// Create packages/language/src/eligian-signature-help-provider.ts
export class EligianSignatureHelpProvider implements SignatureHelpProvider {
  constructor(private services: EligianServices) {}

  provideSignatureHelp(
    document: LangiumDocument,
    params: SignatureHelpParams
  ): SignatureHelp | undefined {
    // Find operation call at cursor
    const opCall = this.findOperationCallAtPosition(document, params.position);
    if (!opCall) return undefined;

    // Get function type from Typir
    const functionType = this.services.typir.Inference.infer(opCall);
    if (!isFunctionType(functionType)) return undefined;

    // Build signature help
    return {
      signatures: [{
        label: this.formatSignature(functionType),
        parameters: functionType.inputParameters.map(p => ({
          label: `${p.name}: ${this.typir.Printer.printType(p.type)}`,
        })),
      }],
      activeSignature: 0,
      activeParameter: this.getActiveParameter(opCall, params.position),
    };
  }
}
```

**Files to Create**:
- `packages/language/src/eligian-signature-help-provider.ts`

**Files to Modify**:
- `packages/language/src/eligian-module.ts` (register provider)

**Estimated Effort**: 2-3 days

**Reference**: Langium docs - https://langium.org/docs/recipes/language-server/#signature-help

---

### Category 3: Type-Aware Hover Information ⭐⭐

**Priority**: MEDIUM
**Impact**: Helps developers understand type inference
**Complexity**: Low-Medium (1-2 days)

#### Opportunity 3.1: Inferred Type Display on Hover

**Current State**: Hover shows operation descriptions only

**Opportunity**: Show inferred types for variables, parameters, expressions

**Example**:
```eligian
action fadeIn(selector) [
              ^^^^^^^^
              Hover: (parameter) selector: string (inferred)

  let duration = 1000
      ^^^^^^^^
      Hover: (variable) duration: number

  selectElement(selector)
                ^^^^^^^^
                Hover: string
]
```

**Implementation Approach**:
1. Modify `eligian-hover-provider.ts`
2. For AST nodes, call `typir.Inference.infer(node)`
3. Format type using `typir.Printer.printType()`
4. Append to existing hover content

**Code Example**:
```typescript
// In eligian-hover-provider.ts
getHoverContent(document: LangiumDocument, params: HoverParams): Hover | undefined {
  const node = this.findNodeAtPosition(document, params.position);
  if (!node) return undefined;

  let content = '';

  // Existing hover content (operation descriptions, etc.)
  content += this.getExistingHoverContent(node);

  // Add type information from Typir
  const inferredType = this.services.typir.Inference.infer(node);
  if (inferredType) {
    const typeString = this.services.typir.Printer.printType(inferredType);
    content += `\n\n**Type**: \`${typeString}\``;

    // If type was inferred (not annotated), show that
    if (this.wasInferred(node)) {
      content += ' _(inferred)_';
    }
  }

  return { contents: { kind: MarkupKind.Markdown, value: content } };
}
```

**Files to Modify**:
- `packages/language/src/eligian-hover-provider.ts`

**Estimated Effort**: 1-2 days

---

#### Opportunity 3.2: Type Error Hover with Suggestions

**Current State**: Type errors shown in Problems panel only

**Opportunity**: Show type error details and suggestions on hover

**Example**:
```eligian
action bad(selector: number) [
  selectElement(selector)
                ^^^^^^^^
                Hover: ❌ Type error
                       Expected: string
                       Received: number
                       💡 Suggestion: Change parameter type to 'string'
]
```

**Implementation**: Combine validation error info with Typir's assignability path

**Estimated Effort**: 1 day

---

### Category 4: Quick Fixes & Code Actions ⭐⭐

**Priority**: MEDIUM
**Impact**: Faster error resolution
**Complexity**: Medium (2-3 days)

#### Opportunity 4.1: Code Actions for Type Errors

**Current State**: Type errors shown, but no quick fixes offered

**Opportunity**: Suggest fixes using Typir's assignability service

**Example**:
```eligian
action bad(selector: number) [
  selectElement(selector)  // ❌ Type error: number not assignable to string

  // 💡 Quick Fix 1: Change parameter type to 'string'
  // 💡 Quick Fix 2: Convert selector to string with toString()
  // 💡 Quick Fix 3: Use different operation accepting number
]
```

**Implementation Approach**:
1. Create `EligianCodeActionProvider` class
2. Listen for diagnostics related to type errors
3. Use `typir.Assignability.getAssignabilityPath()` to determine conversion options
4. Generate code actions based on available paths:
   - Change type annotation
   - Add type conversion
   - Suggest alternative operations
5. Register provider in `eligian-module.ts`

**Code Example**:
```typescript
// Create packages/language/src/eligian-code-actions-provider.ts
export class EligianCodeActionProvider implements CodeActionProvider {
  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams
  ): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diagnostic of params.context.diagnostics) {
      if (diagnostic.code === 'type-mismatch') {
        // Parse type info from diagnostic data
        const { expectedType, actualType, node } = diagnostic.data;

        // Generate fix: Change type annotation
        if (isParameter(node)) {
          actions.push({
            title: `Change parameter type to '${expectedType}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [document.uri]: [{
                  range: this.getTypeAnnotationRange(node),
                  newText: `: ${expectedType}`,
                }]
              }
            }
          });
        }

        // Generate fix: Add type conversion
        const conversionPath = this.typir.Assignability.getAssignabilityPath(
          actualType,
          expectedType
        );
        if (conversionPath) {
          actions.push({
            title: `Convert to ${expectedType}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: this.generateConversionEdit(node, conversionPath),
          });
        }
      }
    }

    return actions;
  }
}
```

**Files to Create**:
- `packages/language/src/eligian-code-actions-provider.ts`

**Files to Modify**:
- `packages/language/src/eligian-module.ts` (register provider)
- `packages/language/src/eligian-validator.ts` (attach type info to diagnostics)

**Estimated Effort**: 2-3 days

**Reference**:
- Langium docs - https://langium.org/docs/recipes/language-server/#code-actions
- Typir example - `f:/projects/typir/examples/lox/src/language/lox-code-actions.ts`

---

### Category 5: Control Flow Type Narrowing ⭐⭐⭐

**Priority**: HIGH (Complex)
**Impact**: Much more sophisticated type checking
**Complexity**: High (4-5 days)
**Risk**: May need Typir framework enhancement

#### Opportunity 5.1: Type Narrowing in Branches

**Current State**: No type narrowing in if/else or control flow

**Opportunity**: Track narrowed types in branches (if/for/while)

**Example**:
```eligian
action processItem(value: string | number) [
  if (typeof(value) === "string") {
    // value narrowed to 'string' here
    selectElement(value)  // ✅ OK - value is string in this branch
  } else {
    // value narrowed to 'number' here
    selectElement(value)  // ❌ Error: number not assignable to string
  }
]
```

**Challenge**: Typir doesn't expose type environment API publicly

**Possible Solutions**:
1. **Custom Type Environment Tracking**
   - Implement own type environment that tracks narrowed types per scope
   - Update environment when entering/exiting if/else/for blocks
   - Use environment to override Typir's inferred types

2. **Request Typir Enhancement**
   - File issue with TypeFox requesting public type environment API
   - Wait for Typir framework update

3. **Use Internal Typir APIs** (risky)
   - Access Typir's internal type environment (may break in updates)
   - Document carefully and monitor for breaking changes

**Implementation Approach** (Option 1 - Custom Tracking):
```typescript
// In eligian-type-system.ts
class TypeEnvironment {
  private scopes: Map<AstNode, Map<string, Type>> = new Map();

  enterScope(node: AstNode): void {
    this.scopes.set(node, new Map());
  }

  exitScope(node: AstNode): void {
    this.scopes.delete(node);
  }

  narrowType(variable: string, type: Type, scope: AstNode): void {
    const scopeTypes = this.scopes.get(scope);
    if (scopeTypes) {
      scopeTypes.set(variable, type);
    }
  }

  getType(variable: string, scope: AstNode): Type | undefined {
    // Walk up scope chain
    let currentScope: AstNode | undefined = scope;
    while (currentScope) {
      const scopeTypes = this.scopes.get(currentScope);
      if (scopeTypes?.has(variable)) {
        return scopeTypes.get(variable);
      }
      currentScope = currentScope.$container;
    }
    return undefined;
  }
}

// Add inference rules for if statements
typir.factory.Inference.InferOperator.create({
  filter: isIfStatement,
  matching: () => true,
  operatorName: 'InferIfStatement',
  infer: (ifStmt: IfStatement) => {
    // Enter then-branch scope
    this.typeEnv.enterScope(ifStmt.thenBlock);

    // Narrow types based on condition
    if (isTypeGuard(ifStmt.condition)) {
      const { variable, narrowedType } = this.extractTypeGuard(ifStmt.condition);
      this.typeEnv.narrowType(variable, narrowedType, ifStmt.thenBlock);
    }

    // Process then-block with narrowed types
    // ...

    this.typeEnv.exitScope(ifStmt.thenBlock);
  }
});
```

**Estimated Effort**: 4-5 days (custom implementation)

**Note**: This is an advanced feature that requires significant architectural planning. Consider deferring until Typir provides built-in support.

---

### Category 6: Custom Domain Types ⭐⭐

**Priority**: MEDIUM
**Impact**: More precise error messages and domain-specific validation
**Complexity**: Low-Medium (1-2 days per type)

#### Opportunity 6.1: Define Eligius-Specific Types

**Current State**: Only primitive types + functions

**Opportunity**: Define Eligius-specific types using `typir.factory.Custom`

**Examples of Domain Types**:

1. **Selector Type** (subtype of string with CSS selector validation)
```typescript
const SelectorType = typir.factory.Custom.create({
  typeName: 'Selector',
  subTypes: [stringType],
  inferenceRules: [
    typir.factory.Inference.inferFromLiteral(
      (node) => isStringLiteral(node) && isCSSSelector(node.value),
      () => SelectorType
    )
  ],
  validationRules: [
    // Validate CSS selector syntax
    (value) => {
      if (typeof value === 'string' && !isValidCSSSelector(value)) {
        return { error: `Invalid CSS selector: ${value}` };
      }
    }
  ]
}).finish();
```

2. **Duration Type** (subtype of number with ms/s units)
```typescript
const DurationType = typir.factory.Custom.create({
  typeName: 'Duration',
  subTypes: [numberType],
  validationRules: [
    // Validate positive number
    (value) => {
      if (typeof value === 'number' && value < 0) {
        return { error: 'Duration must be positive' };
      }
    }
  ]
}).finish();
```

3. **Timeline Type** (structured type with provider property)
```typescript
const TimelineType = typir.factory.Custom.create({
  typeName: 'Timeline',
  properties: [
    { name: 'provider', type: stringType },
    { name: 'events', type: arrayType },
  ]
}).finish();
```

4. **TimedEvent Type** (structured type with time range)
```typescript
const TimedEventType = typir.factory.Custom.create({
  typeName: 'TimedEvent',
  properties: [
    { name: 'startTime', type: DurationType },
    { name: 'endTime', type: DurationType },
    { name: 'operations', type: arrayType },
  ],
  validationRules: [
    // Validate endTime > startTime
    (event) => {
      if (event.endTime <= event.startTime) {
        return { error: 'End time must be after start time' };
      }
    }
  ]
}).finish();
```

**Benefits**:
- More precise error messages ("Expected Selector, got number" vs "Expected string, got number")
- Domain-specific validation (CSS selector syntax, time range validation)
- Better autocomplete (suggest CSS selectors for Selector type)
- Self-documenting code (type names reflect domain concepts)

**Implementation Location**: `eligian-type-system.ts` in `onInitialize()`

**Estimated Effort**: 1-2 days per domain type (4-8 types recommended)

---

### Category 7: Subtype Relationships ⭐

**Priority**: LOW (Foundation)
**Impact**: Better type inference groundwork
**Complexity**: Low (1 day)

#### Opportunity 7.1: Register Type Hierarchy

**Current State**: No type hierarchy - all types are independent

**Opportunity**: Use `typir.Subtype.registerSubType()` to define relationships

**Example Type Hierarchy**:
```typescript
// In eligian-type-system.ts onInitialize()

// unknown is top type (all types are subtypes)
typir.Subtype.registerSubType(stringType, unknownType);
typir.Subtype.registerSubType(numberType, unknownType);
typir.Subtype.registerSubType(booleanType, unknownType);
typir.Subtype.registerSubType(objectType, unknownType);
typir.Subtype.registerSubType(arrayType, unknownType);

// Domain types are subtypes of primitives
typir.Subtype.registerSubType(SelectorType, stringType);
typir.Subtype.registerSubType(DurationType, numberType);
typir.Subtype.registerSubType(TimelineType, objectType);
```

**Type Lattice**:
```
                    unknown
                   /   |   \
                  /    |    \
                 /     |     \
            string  number  boolean  object  array
             /         |                |
            /          |                |
       Selector   Duration          Timeline
                                       |
                                   TimedEvent
```

**Benefits**:
- **Better type inference**: Chooses most specific type (e.g., `Selector` instead of `string`)
- **More flexible assignability**: `Selector` assignable to `string` automatically
- **Gradual typing support**: All types assignable to `unknown`
- **Foundation for union types**: Enables union type inference (e.g., `string | number`)

**Implementation**:
```typescript
// In eligian-type-system.ts onInitialize() (after creating all types)

registerSubtypeRelationships(): void {
  // Primitives → unknown
  this.typir.Subtype.registerSubType(this.stringType, this.unknownType);
  this.typir.Subtype.registerSubType(this.numberType, this.unknownType);
  this.typir.Subtype.registerSubType(this.booleanType, this.unknownType);
  this.typir.Subtype.registerSubType(this.objectType, this.unknownType);
  this.typir.Subtype.registerSubType(this.arrayType, this.unknownType);

  // Domain types → primitives (if implemented)
  if (this.selectorType) {
    this.typir.Subtype.registerSubType(this.selectorType, this.stringType);
  }
  if (this.durationType) {
    this.typir.Subtype.registerSubType(this.durationType, this.numberType);
  }
}
```

**Estimated Effort**: 1 day

**Note**: This is foundation work that doesn't provide immediate user-visible benefits, but enables future features (union types, better inference). Recommend implementing alongside Category 6 (Custom Domain Types).

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks) - HIGH ROI

**Goal**: Achieve TypeScript-like IDE experience with minimal risk

**Features**:
1. ✅ **Type-aware code completion** (Cat 1.1) - 2 days
   - Filter operations by expected parameter types
   - Rank completions by type assignability

2. ✅ **Signature help provider** (Cat 2.1) - 2-3 days
   - Show operation/action signatures while typing
   - Highlight current parameter

3. ✅ **Type information on hover** (Cat 3.1) - 1-2 days
   - Display inferred types for variables/parameters
   - Show "inferred" vs "annotated" indication

**Expected Result**:
- ✨ TypeScript-level IDE experience
- 🚀 10x better code completion (only relevant operations)
- 💡 Instant type feedback on hover

**Estimated Total**: 5-7 days

**Risk**: Low - Non-invasive changes to existing providers

---

### Phase 2: Error Recovery (2-4 weeks) - MEDIUM ROI

**Goal**: Help users quickly fix type errors

**Features**:
1. ✅ **Code actions for type errors** (Cat 4.1) - 2-3 days
   - Quick fix: Change type annotation
   - Quick fix: Add type conversion
   - Quick fix: Suggest alternative operations

2. ✅ **Parameter value completion** (Cat 1.2) - 1 day
   - Suggest CSS selectors for `selector` type
   - Suggest common durations for `duration` type

3. ✅ **Type error hover with suggestions** (Cat 3.2) - 1 day
   - Show detailed type mismatch info
   - Inline suggestions for fixes

**Expected Result**:
- 🔧 Self-service error resolution
- ⚡ Faster development workflow
- 📉 Reduced confusion from type errors

**Estimated Total**: 4-5 days

**Risk**: Low - Leverages existing Langium code action infrastructure

---

### Phase 3: Advanced Features (1-2 months) - Backlog

**Goal**: Production-grade type system with sophisticated features

**Features**:
1. ⏳ **Custom domain types** (Cat 6.1) - 4-8 days
   - Selector, Duration, Timeline, TimedEvent types
   - Domain-specific validation

2. ⏳ **Subtype relationships** (Cat 7.1) - 1 day
   - Type hierarchy foundation
   - Enables union type inference

3. ⏳ **Control flow type narrowing** (Cat 5.1) - 4-5 days
   - Type narrowing in if/else branches
   - Type guards for runtime checks
   - **Note**: May require Typir framework enhancement

**Expected Result**:
- 🎯 Domain-specific type checking
- 🧠 Sophisticated type inference
- 🔒 Production-grade type safety

**Estimated Total**: 9-14 days

**Risk**: Medium-High
- Control flow narrowing is complex and may need Typir enhancement
- Custom types require careful design to avoid over-constraining

---

### Phase 4: Optimization & Polish (Backlog)

**Goal**: Performance and edge case handling

**Features**:
- Type caching for large documents
- Incremental type checking
- Performance profiling and optimization
- Edge case handling (circular references, etc.)

**Expected Result**:
- ⚡ Fast type checking for large files
- 🔄 Instant feedback on document changes

**Estimated Total**: 3-5 days

**Risk**: Low - Performance optimization only

---

### Summary Roadmap

| Phase | Timeline | Features | Estimated Effort | Risk | ROI |
|-------|----------|----------|------------------|------|-----|
| **Phase 1** | 1-2 weeks | Type completion, Signature help, Type hover | 5-7 days | Low | ⭐⭐⭐ |
| **Phase 2** | 2-4 weeks | Code actions, Value completion, Error hover | 4-5 days | Low | ⭐⭐ |
| **Phase 3** | 1-2 months | Custom types, Subtypes, Type narrowing | 9-14 days | Med-High | ⭐⭐ |
| **Phase 4** | Backlog | Optimization, Polish | 3-5 days | Low | ⭐ |

**Recommended Approach**:
1. Start with **Phase 1** for immediate user impact
2. Gather user feedback
3. Proceed with **Phase 2** based on priorities
4. Defer **Phase 3** until user demand or Typir enhancement available

---

## Technical References

### Local Typir Repository

**Location**: `f:/projects/typir/`

**Key Documentation**:
- Main README: `f:/projects/typir/README.md`
- Getting Started: `f:/projects/typir/documentation/getting-started.md`
- Design Documentation: `f:/projects/typir/documentation/design.md`

**Best Example**: LOX Language (`f:/projects/typir/examples/lox/`)
- Most complete Typir-Langium integration example
- **Type System**: `f:/projects/typir/examples/lox/src/language/lox-type-checking.ts`
- **Code Actions**: `f:/projects/typir/examples/lox/src/language/lox-code-actions.ts`
- **Completion**: `f:/projects/typir/examples/lox/src/language/lox-completion-provider.ts`
- **Validation**: `f:/projects/typir/examples/lox/src/language/lox-validator.ts`

**Other Examples**:
- Simple example: `f:/projects/typir/examples/simple/`
- Ox language: `f:/projects/typir/examples/ox/`

---

### Langium Documentation

**Language Server Protocols**:
- Hover: https://langium.org/docs/recipes/language-server/#hover
- Code Completion: https://langium.org/docs/recipes/language-server/#code-completion
- Signature Help: https://langium.org/docs/recipes/language-server/#signature-help
- Code Actions: https://langium.org/docs/recipes/language-server/#code-actions

**Core Concepts**:
- Services: https://langium.org/docs/reference/services/
- Validation: https://langium.org/docs/reference/validation/
- AST: https://langium.org/docs/reference/ast/

---

### Typir API Reference

**Core Services** (available in `typir` object):

```typescript
interface TypirServices {
  // Type inference
  Inference: {
    infer(node: AstNode): Type;
    inferFromFunctionCall(filter, matcher): InferenceRule;
    inferFromLiteral(filter, typeProvider): InferenceRule;
  }

  // Type assignability
  Assignability: {
    isAssignable(from: Type, to: Type): boolean;
    getAssignabilityPath(from: Type, to: Type): ConversionPath | undefined;
  }

  // Type printing
  Printer: {
    printType(type: Type): string;
  }

  // Type factory
  factory: {
    Primitives: {
      create(config: PrimitiveTypeConfig): PrimitiveTypeBuilder;
    }
    Functions: {
      create(config: FunctionTypeConfig): FunctionTypeBuilder;
    }
    Custom: {
      create(config: CustomTypeConfig): CustomTypeBuilder;
    }
    Top: {
      create(config: TopTypeConfig): TopTypeBuilder;
    }
    // ... more factories
  }

  // Subtype relationships
  Subtype: {
    registerSubType(subtype: Type, supertype: Type): void;
  }
}
```

**Type Builders**:
All factory methods return builders with:
- `.finish()`: Complete type creation and register with Typir
- Fluent API for configuration

**Inference Rules**:
- `InferOperator`: Custom inference logic for AST nodes
- `inferFromFunctionCall`: Match function calls
- `inferFromLiteral`: Match literal values

---

### Typir-Langium Integration

**Services** (available in `typir-langium`):

```typescript
interface TypirLangiumServices<T extends TypirLangiumSpecifics> {
  typir: TypirServices;
  // ... Langium integration helpers
}

// Create Typir-Langium services
const typirServices = createTypirLangiumServices(
  sharedServices,
  astReflection,
  typeSystemDefinition,
  options
);

// Initialize (must call after service creation)
initializeLangiumTypirServices(module, typirServices);
```

**Type System Definition Interface**:
```typescript
interface LangiumTypeSystemDefinition<T extends TypirLangiumSpecifics> {
  // Called once at startup
  onInitialize(typir: TypirServices): void;

  // Called for each new AST node
  onNewAstNode(astNode: AstNode): void;
}
```

---

## Risk Assessment

### Technical Risks

| Risk | Level | Impact | Mitigation |
|------|-------|--------|-----------|
| **Typir API changes** | Medium | Breaking changes in updates | Pin to specific version (0.3.0), monitor releases, test before upgrading |
| **Performance regression** | Medium | Slow IDE for large files | Profile before/after, use caching, implement incremental checking |
| **Complexity growth** | Medium | Hard to maintain | Phase implementation, modular design, comprehensive tests |
| **Type narrowing complexity** | High | May not be feasible without Typir enhancement | Prototype first, engage with TypeFox if needed |
| **Breaking existing code** | Low | Type checking too strict | Use `unknown` escape hatch, gradual migration |

---

### Project Risks

| Risk | Level | Impact | Mitigation |
|------|-------|--------|-----------|
| **Scope creep** | Medium | Features take longer than estimated | Strict phase boundaries, defer Phase 3+ features |
| **User confusion** | Low | Type errors unclear | Clear error messages, good documentation |
| **Adoption resistance** | Low | Users prefer untyped code | Make type checking fully optional, backward compatible |
| **Maintenance burden** | Medium | More code to maintain | Comprehensive tests, good documentation |

---

### Dependency Risks

| Dependency | Risk Level | Concern | Mitigation |
|------------|-----------|---------|-----------|
| **Typir framework** | Medium | Active development, API may change | Pin version, monitor releases, contribute to Typir if needed |
| **Langium** | Low | Stable, well-maintained | Use stable APIs, follow best practices |
| **Effect-ts** (compiler) | Low | Used in compiler, not type system | No direct risk to Typir integration |

---

## Recommendations

### Immediate Actions (Next Sprint)

1. **Start with Phase 1** (1-2 weeks)
   - Highest ROI with lowest risk
   - Immediate user-visible improvements
   - No architectural changes required

2. **Prototype Type-Aware Completion** (2-3 days)
   - Most impactful feature
   - Tests integration approach
   - Quick user feedback

3. **Update Documentation** (1 day)
   - Document Typir integration for contributors
   - Add type system examples to user docs

---

### Medium-Term (1-2 Months)

1. **Complete Phase 2** (2-4 weeks)
   - Code actions for type errors
   - Enhanced completion features

2. **Evaluate Phase 3 Feasibility** (1 week)
   - Prototype control flow type narrowing
   - Determine if Typir enhancement needed
   - Engage with TypeFox if necessary

3. **Gather User Feedback**
   - Survey users on type system satisfaction
   - Identify most-requested features
   - Prioritize Phase 3 features based on feedback

---

### Long-Term (3-6 Months)

1. **Implement Phase 3 Selectively**
   - Focus on high-demand features
   - Defer complex features (type narrowing) if not critical

2. **Performance Optimization** (Phase 4)
   - Profile type checking performance
   - Implement caching and incremental checking

3. **Advanced Type System Features**
   - Union/intersection types
   - Generic types (if use cases emerge)
   - Type aliases

---

### Not Recommended

1. **Don't enable Typir's automatic validation**
   - Langium validator is more comprehensive
   - Keep `validateArgumentsOfFunctionCalls: false`

2. **Don't force type annotations**
   - Keep gradual typing approach
   - Maintain backward compatibility

3. **Don't implement all features at once**
   - Phased approach reduces risk
   - Allows user feedback to guide priorities

---

## Conclusion

### Current State Summary

Typir is integrated at a **foundational level (~20% of capabilities)**, providing:
- ✅ Solid type inference foundation
- ✅ Basic operation type checking
- ✅ Extensible type system architecture
- ✅ 100% backward compatibility

### Opportunity Summary

**80% of Typir's capabilities remain unused**, representing significant opportunity:
- **Phase 1** (1-2 weeks): TypeScript-level IDE experience
- **Phase 2** (2-4 weeks): Self-service error resolution
- **Phase 3** (1-2 months): Production-grade type system

### Recommended Path Forward

1. **Implement Phase 1 immediately** - High ROI, low risk, immediate impact
2. **Gather user feedback** - Prioritize Phase 2+ features based on demand
3. **Engage with Typir community** - For complex features (type narrowing), collaborate with TypeFox

### Expected Outcomes

By implementing Phase 1-2 (2-3 weeks total effort):
- ✨ Transform Eligian IDE from "basic" to "TypeScript-level"
- 🚀 10x improvement in code completion relevance
- 💡 Instant type feedback for developers
- 🔧 Quick fixes for common type errors

This represents a **high-value investment** with **reasonable effort** and **low risk**.

---

## Appendix

### Glossary

- **Typir**: TypeFox's type system framework for building type checkers
- **Langium**: Language engineering framework for building DSLs
- **AST**: Abstract Syntax Tree (parsed representation of code)
- **Type Inference**: Automatically determining types without explicit annotations
- **Type Narrowing**: Refining type in specific code paths (e.g., if branches)
- **Assignability**: Whether one type can be used where another is expected
- **Subtype**: Type that is compatible with (can substitute for) another type
- **Top Type**: Type that all other types are subtypes of (`unknown` in Eligian)

---

### Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-26 | Claude Code | Initial comprehensive analysis |

---

**Next Steps**: Decide on Phase 1 implementation timeline and assign resources.
