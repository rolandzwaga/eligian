# Research Findings: Custom Action Reference Provider

**Date**: 2025-10-24
**Feature**: Custom Action Reference Provider for "Go to Definition" functionality

## Overview

This document consolidates research findings from Langium documentation (via context7) to inform implementation decisions for custom action reference resolution in the Eligian DSL.

## Research Question 1: Langium ScopeProvider API

**Question**: How to extend DefaultScopeProvider for custom reference resolution?

**Finding**: Langium provides two main approaches for custom scoping:

1. **Override `getScope()` method**:
   - Extends `DefaultScopeProvider` class
   - Override `getScope(context: ReferenceInfo): Scope` method
   - Check `context.container.$type` and `context.property` to identify reference type
   - Return appropriate Scope or call `super.getScope(context)` for default behavior
   - Return `EMPTY_SCOPE` when reference cannot be resolved

2. **Override `ScopeComputation` hooks** (For precomputed/indexed scoping):
   - Override `computeExports()` for globally available symbols
   - Override `computeLocalScopes()` for document-local scoping
   - Creates precomputed scopes used by DefaultScopeProvider
   - Runs once per document change, caches results for O(1) lookup

**Decision**: **Use BOTH approaches (ScopeComputation + ScopeProvider)** because:
- **Future-proof**: Library imports planned - may have 100+ actions in scope
- **Performance**: O(1) indexed lookup scales better than O(n) linear search
- **Architecture**: ScopeComputation handles indexing, ScopeProvider uses precomputed index
- **Maintainability**: When imports added, only ScopeComputation needs updating

**Revised Decision Rationale**:
- Initially considered approach #1 only (simpler for 5-20 actions)
- User plans to add library imports (multiple files with exported actions)
- With imports: 50+ actions per library × 3 libraries = 150+ actions in scope
- O(n) linear search becomes noticeable bottleneck at this scale
- ScopeComputation provides O(1) lookup, future-proof for library imports

**Example Pattern** (from Langium docs):
```typescript
export class HelloWorldScopeProvider extends DefaultScopeProvider {
    override getScope(context: ReferenceInfo): Scope {
        // Check the container type and property name
        if(isGreeting(context.container) && context.property === 'person') {
            // Get all persons from the document
            const model = AstUtils.getContainerOfType(context.container, isModel)!;
            const persons = model.persons;
            // Transform them into node descriptions
            const descriptions = persons.map(p =>
                this.astNodeDescriptionProvider.createDescription(p, p.name)
            );
            // Create the scope
            return new MapScope(descriptions);
        }
        return EMPTY_SCOPE;
    }
}
```

## Research Question 2: ReferenceInfo Context

**Question**: What information is available in ReferenceInfo when resolving OperationCall references?

**Finding**: `ReferenceInfo` interface provides:

```typescript
interface ReferenceInfo {
    reference: Reference        // The reference object to resolve
    container: AstNode         // Parent AST node (e.g., OperationCall)
    property: string           // Property name being resolved (e.g., "operationName")
    index?: number             // Array index if reference is in array
}
```

**Usage for our case**:
- `context.container` will be an `OperationCall` node (or parent containing it)
- `context.property` will be `"operationName"` (the field we're resolving)
- We can check `isOperationCall(context.container)` to identify our case
- Use `context.container.operationName` to get the name to resolve

**Decision**: Check if `context.container` is `OperationCall` and `context.property === 'operationName'` to identify action reference resolution cases.

**How to distinguish action calls from operation calls**:
1. Extract operation name from `context.container.operationName`
2. Search document for ActionDefinition with matching name
3. If found → it's an action call, return Scope with that ActionDefinition
4. If not found → it's either a built-in operation or invalid, return `EMPTY_SCOPE` (let validator handle it)

## Research Question 3: Scope Construction

**Question**: How to create Scope objects that point to ActionDefinition nodes?

**Finding**: Langium provides multiple Scope implementations:

1. **MapScope** (Best for small, static collections):
   ```typescript
   new MapScope(descriptions: AstNodeDescription[], parentScope?: Scope, options?)
   ```
   - Takes array of AstNodeDescription objects
   - Optional parent scope for hierarchical lookup
   - Options: `{ caseInsensitive: boolean }`

2. **StreamScope** (Best for large, lazy collections):
   ```typescript
   new StreamScope(elements: Stream<AstNodeDescription>, outerScope?: Scope, options?)
   ```
   - Takes stream of descriptions (lazy evaluation)
   - Used for global scopes with many symbols

3. **EMPTY_SCOPE** (No resolutions available):
   ```typescript
   return EMPTY_SCOPE;
   ```

**Creating AstNodeDescription**:
Use `AstNodeDescriptionProvider` service (available in `DefaultScopeProvider`):
```typescript
this.descriptions.createDescription(node: AstNode, name: string, document?: LangiumDocument)
```

**Decision**: **Use `MapScope`** because:
- Typical Eligian files have 5-20 action definitions (small collection)
- Action names are already indexed in memory (no lazy evaluation needed)
- Simple API, well-suited for single-document scoping
- Case-insensitive option available if needed (not needed for Eligian)

**Implementation Pattern** (Indexed Approach):
```typescript
// In ScopeComputation - runs once per document change:
export class EligianScopeComputation extends DefaultScopeComputation {
  override async computeLocalScopes(document: LangiumDocument): Promise<PrecomputedScopes> {
    const model = document.parseResult.value as EligianModel;
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    // Index all actions - O(1) lookup later
    for (const action of model.actions) {
      const description = this.descriptions.createDescription(action, action.name, document);
      scopes.add(model, description);
    }
    return scopes;
  }
}

// In ScopeProvider - uses precomputed index:
const precomputedScopes = this.scopeComputation.computeLocalScopes(document);
const descriptions = precomputedScopes.get(model);
return this.createScope(descriptions.filter(desc => desc.type === 'ActionDefinition'));
```

## Research Question 4: LSP Integration

**Question**: Does DefaultReferencesProvider automatically work once ScopeProvider returns proper scopes?

**Finding**: **YES!** Langium's linking and LSP integration is automatic:

**How it works**:
1. **Linker** (automatically triggered):
   - Retrieves all cross-references in document
   - For each reference, queries `ScopeProvider.getScope()`
   - Finds matching symbol description in returned Scope
   - Loads AST node for the description
   - Sets `reference.ref` property to resolved node

2. **DefaultReferencesProvider** (LSP integration):
   - Automatically provides "Go to Definition" when references are linked
   - Automatically provides "Find All References" by searching indexed references
   - No custom implementation needed!

**What we need to do**:
- Return proper Scope from `getScope()` with ActionDefinition descriptions
- Langium handles the rest (linking, LSP protocol, VS Code integration)

**Decision**: **No custom References provider needed**. The existing `DefaultReferencesProvider` will automatically provide:
- "Go to Definition" (Ctrl+Click, F12)
- "Find All References" (Shift+F12)
- "Peek Definition" (Alt+F12)

Once we return a Scope containing the ActionDefinition, Langium's Linker will resolve `operationCall.operationName.ref` to point to the ActionDefinition, and LSP features work automatically.

## Research Question 5: Testing Strategy

**Question**: How to test LSP navigation with Langium test utilities?

**Finding**: Langium provides `@langium/testing` utilities for reference testing:

**Test Approach**:
1. **Unit Tests** (ScopeProvider logic):
   - Use `parseHelper<Model>(services)` to parse DSL source
   - Access `document.parseResult.value` to get AST
   - Navigate to OperationCall nodes
   - Check `operationCall.operationName.ref` is correctly resolved
   - Assert `ref` points to expected ActionDefinition

2. **Integration Tests** (Full LSP flow):
   - Use `parseHelper` to create document with action definitions and calls
   - Assert that `reference.ref` is resolved (not `undefined`)
   - Assert `reference.ref` points to correct ActionDefinition node
   - Use `AstUtils` to verify source locations

**Example Pattern** (from Langium docs):
```typescript
import { createHelloWorldServices } from "./hello-world-module.js";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import { Model } from "./generated/ast.js";

// Arrange
const services = createHelloWorldServices(EmptyFileSystem);
const parse = parseHelper<Model>(services.HelloWorld);

// Act
const document = await parse(`
    person John
    Hello John!
`);

// Assert
const model = document.parseResult.value;
expect(model.greetings[0].person.ref).toBe(model.persons[0]);
```

**Decision**: Use `parseHelper` from `langium/test` for both unit and integration tests:
- **Unit tests** (`references.spec.ts`): Test ScopeProvider.getScope() directly with various ReferenceInfo contexts
- **Integration tests** (`lsp-navigation.spec.ts`): Test full reference resolution with realistic DSL examples

**Test Coverage**:
- Direct timeline calls: `at 0s..1s fadeIn()`
- Inline block calls: `at 0s..1s [ fadeIn() ] []`
- Sequence calls: `sequence { fadeIn() for 1s }`
- Stagger calls: `stagger 200ms items with fadeIn() for 1s`
- Non-existent actions: `unknownAction()` → ref should be undefined
- Multiple actions: Verify correct action is resolved when multiple exist

## Technical Decisions Summary

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Scoping Approach** | Use **both** ScopeComputation + ScopeProvider | Future library imports require O(1) indexed lookup (100+ actions) |
| **Indexing Strategy** | Override `computeLocalScopes()` in ScopeComputation | Precompute action index once per document change, cache for O(1) lookup |
| **Resolution Strategy** | ScopeProvider uses precomputed scopes | O(1) hash map lookup, scales to library imports |
| **Scope Type** | Use `createScope()` with filtered descriptions | Langium's standard scope creation from precomputed descriptions |
| **LSP Integration** | Use existing `DefaultReferencesProvider` | Automatic "Go to Definition" and "Find All References" support |
| **Testing Framework** | Vitest with `parseHelper` from `langium/test` | Standard Langium testing approach, supports reference assertions |

### Implementation Strategy

1. **Create EligianScopeComputation** (packages/language/src/eligian-scope-computation.ts):
   - Extend `DefaultScopeComputation`
   - Override `computeLocalScopes(document: LangiumDocument): Promise<PrecomputedScopes>`
   - Index all ActionDefinition nodes in document
   - Create AstNodeDescription for each action, add to MultiMap
   - Store in precomputed scopes (O(1) lookup)

2. **Update EligianScopeProvider** (packages/language/src/eligian-scope-provider.ts):
   - Override `getScope(context: ReferenceInfo): Scope`
   - Check if `context.container` is `OperationCall` and `context.property === 'operationName'`
   - Get precomputed scopes via `this.scopeComputation.computeLocalScopes(document)`
   - Filter descriptions for ActionDefinition types
   - Return Scope with indexed actions, else EMPTY_SCOPE

3. **Write Tests** (packages/language/src/__tests__/):
   - `scope-computation.spec.ts`: Unit tests for action indexing
   - `references.spec.ts`: Unit tests for ScopeProvider.getScope()
   - `lsp-navigation.spec.ts`: Integration tests for reference resolution

4. **Register Services** (packages/language/src/eligian-module.ts):
   - Register ScopeComputation: `(services) => new EligianScopeComputation(services)`
   - Verify ScopeProvider registration (already exists)
   - Both services work together automatically

### Performance Considerations

- **Action Indexing**: O(n) to build index once per document change (5-20 actions: ~microseconds, 100+ actions: ~milliseconds)
- **Action Lookup**: O(1) hash map lookup from precomputed scopes (constant time regardless of action count)
- **Scope Creation**: O(1) for filtering precomputed descriptions
- **Caching**: Automatic - Langium caches precomputed scopes, recomputes only on document change
- **Scalability**: O(1) lookup scales to library imports (100+ actions), unlike O(n) linear search
- **Benchmark**: Verify <1s resolution time for 100+ actions (per success criteria SC-001)

### Edge Cases to Handle

1. **Non-existent actions**: Return `EMPTY_SCOPE` → validator shows "Unknown operation" error
2. **Built-in operations**: Return `EMPTY_SCOPE` → no navigation (expected behavior)
3. **Action calls in action bodies**: ScopeProvider should handle recursively (same logic applies)
4. **Duplicate action names**: Validator prevents this, resolver returns first match
5. **Nested timeline contexts**: ReferenceInfo.container handles all contexts (inline blocks, sequences, staggers)

## References

- Langium Documentation: https://github.com/eclipse-langium/langium-website
- ScopeProvider Guide: https://langium.org/docs/learn/workflow/resolve_cross_references
- Testing Utilities: https://langium.org/docs/testing

## Next Steps

1. Proceed to Phase 1: Design Artifacts
   - Create `data-model.md` with entity relationships
   - Create `contracts/scope-provider-api.yaml` with API documentation
   - Create `quickstart.md` with testing instructions

2. Update Agent Context:
   - Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
   - Add Langium ScopeProvider patterns to CLAUDE.md context

3. Re-evaluate Constitution Check:
   - Verify design decisions comply with all constitution principles
   - Document any complexity justifications if needed
