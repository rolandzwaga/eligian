# Research: Code Completion Technology Decisions

**Feature**: Code Completion for Eligian DSL
**Date**: 2025-10-19
**Status**: Complete

## Overview

This document captures all technology decisions, patterns, and best practices for implementing code completion in the Eligian DSL VS Code extension. All research tasks from the implementation plan have been completed.

## 1. Langium Completion Provider Infrastructure

### Decision: Extend DefaultCompletionProvider

**What was chosen**: Extend Langium's `DefaultCompletionProvider` class and override `completionFor()` method for custom logic.

**Rationale**:
- Langium's `DefaultCompletionProvider` provides complete LSP integration out of the box
- Allows selective override of specific completion behaviors while inheriting defaults
- Follows existing Eligian patterns (similar to `EligianHoverProvider`, `EligianScopeProvider`)
- Provides access to `CompletionContext` with AST node, position, and grammar features
- No need to implement low-level LSP protocol handling

**Alternatives considered**:
- **Implement CompletionProvider from scratch**: Rejected because would require reimplementing LSP protocol handling, keyword completions, and cross-reference completions
- **Use only grammar-based completions**: Rejected because cannot provide operation metadata, descriptions, or context-aware filtering
- **Build separate completion server**: Rejected due to unnecessary complexity and integration overhead

**Implementation**:
```typescript
export class EligianCompletionProvider extends DefaultCompletionProvider {
  constructor(services: EligianServices) {
    super(services);
  }

  protected override async completionFor(
    context: CompletionContext,
    next: NextFeature,
    acceptor: CompletionAcceptor
  ): Promise<void> {
    // Custom logic for Eligian-specific completions
    // Fall back to super.completionFor() for default behavior
  }
}
```

**Registration**:
```typescript
// In eligian-module.ts
lsp: {
  CompletionProvider: services => new EligianCompletionProvider(services)
}
```

---

## 2. VS Code Completion UI Integration

### Decision: Use CompletionItemKind for Grouping

**What was chosen**: Use `CompletionItemKind` enum for visual grouping and icons in VS Code completion list.

**Rationale**:
- VS Code automatically groups items by `CompletionItemKind` in the completion list
- Provides standard icons that users recognize (function icon, variable icon, etc.)
- No custom UI required - leverages built-in VS Code behavior
- `sortText` provides fine-grained ordering within groups

**Mapping**:
- **Operations** → `CompletionItemKind.Function` (3) - function icon
- **Custom Actions** → `CompletionItemKind.Class` (7) - class icon (distinguishes from operations)
- **Keywords** → `CompletionItemKind.Keyword` (14) - keyword icon
- **Timeline Events** → `CompletionItemKind.Event` (23) - event icon
- **Variable References** → `CompletionItemKind.Variable` (6) - variable icon
- **Parameters** → `CompletionItemKind.Property` (10) - property icon

**Alternatives considered**:
- **Custom prefixes (🔧, 📦)**: Rejected because less discoverable, clutters label, not standard
- **Single kind with custom sorting**: Rejected because loses visual grouping benefit
- **Separate completion lists**: Rejected because VS Code doesn't support multiple completion providers for same context

**Example**:
```typescript
acceptor(context, {
  label: 'selectElement',
  kind: CompletionItemKind.Function,
  sortText: '1_selectElement',  // "1_" prefix ensures operations sort first
  detail: 'Eligius operation',
  documentation: {
    kind: 'markdown',
    value: '### selectElement\n\nSelects a DOM element...'
  }
});
```

### Decision: Markdown Documentation

**What was chosen**: Use markdown format for `documentation` field with structured sections.

**Rationale**:
- Markdown is rendered with proper formatting in VS Code
- Supports code blocks, lists, headings, and emphasis
- Consistent with Eligian hover provider (reuse formatting logic)
- Better readability than plain text

**Format**:
```typescript
documentation: {
  kind: 'markdown',
  value: `
### operationName

Description of what the operation does.

**Parameters:**
- \`paramName\`: type (required) - description
- \`optionalParam\`: type (optional, default: value) - description

**Provides:**
- \`outputProperty\`: type - description

**Example:**
\`\`\`eligian
operationName({paramName: "value"})
\`\`\`
  `.trim()
}
```

**Alternatives considered**:
- **Plain text**: Rejected because less readable, no formatting
- **HTML**: Rejected because not supported by LSP protocol

---

## 3. Metadata Generation Strategy

### Decision: Build-Time Generation from Eligius TypeScript Sources

**What was chosen**: Parse Eligius operation metadata TypeScript files at build time, generate TypeScript registry module.

**Rationale**:
- **Offline operation**: Extension works without network access
- **Type safety**: Generated TypeScript module is type-checked
- **Fast loading**: No runtime parsing overhead
- **Single source of truth**: Eligius metadata files are authoritative
- **Build-time errors**: Catch metadata issues before runtime

**Alternatives considered**:
- **Runtime loading**: Rejected because requires bundling Eligius sources, slow startup, no offline support
- **Manual JSON file**: Rejected because error-prone, gets out of sync with Eligius updates
- **Hardcoded in extension**: Rejected because not maintainable, hard to update

**Implementation**:
1. **Build script** (PowerShell): `.specify/scripts/powershell/generate-metadata.ps1`
   - Parses `../eligius/src/operation/metadata/*.ts` files
   - Extracts JSDoc comments, parameter metadata, dependencies, outputs
   - Generates `packages/extension/src/metadata/operations.generated.ts`

2. **Timeline events extraction**:
   - Parses `../eligius/src/timeline-event-names.ts`
   - Extracts JSDoc comments and event names
   - Generates `packages/extension/src/metadata/timeline-events.generated.ts`

3. **CLI command** (optional): `npm run generate:registry`
   - Node.js TypeScript-based generator (cleaner than PowerShell)
   - Uses TypeScript Compiler API for accurate parsing
   - Falls back to regex if AST parsing fails

**Generated File Format**:
```typescript
// operations.generated.ts
export interface OperationMetadata {
  name: string;
  description: string;
  parameters: ParameterMetadata[];
  dependencies: string[];
  outputs: string[];
}

export interface ParameterMetadata {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export const OPERATIONS: OperationMetadata[] = [
  {
    name: 'selectElement',
    description: 'This operation selects one or more elements...',
    parameters: [
      {
        name: 'selector',
        type: 'ParameterType:selector',
        required: true,
        description: 'CSS selector string'
      },
      // ...
    ],
    dependencies: [],
    outputs: ['selectedElement']
  },
  // ... all operations
];

// Filtered operations (handled by DSL keywords)
export const FILTERED_OPERATIONS = new Set([
  'breakForEach',
  'continueForEach',
  'ifCondition',
  'elseCondition',
  'forEach'
]);
```

---

## 4. Context Detection Patterns

### Decision: AST Traversal with AstUtils.getContainerOfType

**What was chosen**: Use Langium's `AstUtils.getContainerOfType()` to walk up AST and determine cursor context.

**Rationale**:
- **Robust**: Langium utility handles edge cases (null nodes, document boundaries)
- **Type-safe**: Uses generated `isXXX()` type guards
- **Simple**: One function call to find parent container
- **Performant**: Langium caches AST traversal results

**Context Detection Logic**:
```typescript
import { AstUtils } from 'langium';
import { isActionDefinition, isForEachLoop, isTimeline } from './generated/ast.js';

// Detect if cursor is inside an action block
const action = AstUtils.getContainerOfType(context.node, isActionDefinition);
if (action) {
  // Provide operation and custom action completions
}

// Detect if cursor is inside a for loop
const loop = AstUtils.getContainerOfType(context.node, isForEachLoop);
if (loop) {
  // Allow 'break' and 'continue' keywords
}

// Detect if cursor is inside a timeline
const timeline = AstUtils.getContainerOfType(context.node, isTimeline);
if (timeline) {
  // Provide event name completions
}
```

**Alternatives considered**:
- **Custom visitor pattern**: Rejected because more code, Langium already provides utilities
- **Regex on text**: Rejected because unreliable, doesn't handle comments/strings
- **Langium scoping**: Rejected because scoping is for references, not context detection

### Decision: CstUtils.findLeafNodeAtOffset for Cursor Node

**What was chosen**: Use `CstUtils.findLeafNodeAtOffset()` to find precise AST node at cursor position.

**Rationale**:
- **Accurate**: Finds exact leaf node under cursor (more precise than `context.node`)
- **Handles whitespace**: Works even when cursor is between tokens
- **CST → AST mapping**: `cstNode.astNode` gives corresponding AST node

**Usage**:
```typescript
import { CstUtils } from 'langium';

const offset = document.textDocument.offsetAt(params.position);
const cstNode = CstUtils.findLeafNodeAtOffset(
  document.parseResult.value.$cstNode,
  offset
);

if (cstNode?.astNode) {
  // Check AST node type for context-specific completions
  if (isOperationCall(cstNode.astNode)) {
    // Provide parameter completions
  }
}
```

**Alternatives considered**:
- **Use CompletionContext.node directly**: Sometimes undefined or points to parent node
- **Manual offset calculation**: Error-prone, reinvents the wheel

---

## 5. Completion Module Organization

### Decision: Separate Modules for Each Completion Type

**What was chosen**: Create separate modules under `packages/language/src/completion/` for each completion type.

**Rationale**:
- **Single Responsibility**: Each module handles one completion type
- **Testability**: Easy to unit test in isolation
- **Maintainability**: Changes to one completion type don't affect others
- **Reusability**: Modules can be reused in different contexts

**Module Structure**:
```
packages/language/src/completion/
├── operations.ts       # getOperationCompletions(context, acceptor)
├── actions.ts          # getActionCompletions(document, context, acceptor)
├── keywords.ts         # getKeywordCompletions(context, acceptor)
├── events.ts           # getEventCompletions(context, acceptor)
├── variables.ts        # getVariableCompletions(context, acceptor)
├── parameters.ts       # getParameterCompletions(context, operationName, acceptor)
├── context.ts          # detectContext(document, position): CompletionContext
└── registry.ts         # loadOperationRegistry(), getOperation(name), etc.
```

**Main Provider Orchestration**:
```typescript
// eligian-completion-provider.ts
protected override async completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): Promise<void> {
  const eligianContext = detectContext(context.document, context.position);

  // Delegate to specific modules based on context
  if (eligianContext.isInsideAction) {
    getOperationCompletions(eligianContext, acceptor);
    getActionCompletions(context.document, eligianContext, acceptor);
    getKeywordCompletions(eligianContext, acceptor);
  }

  if (eligianContext.isInsideEvent) {
    getEventCompletions(eligianContext, acceptor);
  }

  if (eligianContext.isAfterVariablePrefix) {
    getVariableCompletions(eligianContext, acceptor);
  }

  // Fall back to default completions
  return super.completionFor(context, next, acceptor);
}
```

**Alternatives considered**:
- **Single large file**: Rejected because hard to navigate, test, maintain
- **Class-based providers**: Rejected because functional approach is simpler, less boilerplate
- **Plugin architecture**: Rejected because overkill for 6 completion types

---

## 6. Testing Strategy

### Decision: Langium Test Utilities + Vitest

**What was chosen**: Use Langium's `parseHelper` and `expectCompletion` test utilities with Vitest test runner.

**Rationale**:
- **Langium integration**: Test utilities designed for Langium language servers
- **Fixture-based**: Write DSL code samples with cursor markers
- **Fast**: Vitest is fast, supports watch mode
- **Existing setup**: Eligian already uses Vitest for language package tests

**Test Structure**:
```typescript
// packages/language/src/__tests__/completion.spec.ts
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';
import { EmptyFileSystem } from 'langium';
import { CompletionItemKind } from 'vscode-languageserver';

describe('Code Completion', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper(services);
  const completionProvider = services.lsp.CompletionProvider;

  describe('Operation Completions', () => {
    test('completes operation names in action block', async () => {
      const doc = await parse(`
        action test [
          sel<cursor>
        ]
      `);

      const completion = await completionProvider?.getCompletion(doc, {
        position: { line: 1, character: 11 }
      });

      expect(completion?.items).toContainEqual(
        expect.objectContaining({
          label: 'selectElement',
          kind: CompletionItemKind.Function
        })
      );
    });

    test('filters out keyword-handled operations', async () => {
      const doc = await parse(`
        action test [
          <cursor>
        ]
      `);

      const completion = await completionProvider?.getCompletion(doc, {
        position: { line: 1, character: 8 }
      });

      const labels = completion?.items.map(item => item.label) || [];
      expect(labels).not.toContain('breakForEach');
      expect(labels).not.toContain('continueForEach');
      expect(labels).not.toContain('ifCondition');
    });
  });

  describe('Keyword Completions', () => {
    test('suggests break/continue only inside loops', async () => {
      const doc = await parse(`
        action test [
          for (item in items) {
            <cursor>
          }
        ]
      `);

      const completion = await completionProvider?.getCompletion(doc, {
        position: { line: 2, character: 12 }
      });

      const labels = completion?.items.map(item => item.label) || [];
      expect(labels).toContain('break');
      expect(labels).toContain('continue');
    });

    test('does not suggest break/continue outside loops', async () => {
      const doc = await parse(`
        action test [
          <cursor>
        ]
      `);

      const completion = await completionProvider?.getCompletion(doc, {
        position: { line: 1, character: 8 }
      });

      const labels = completion?.items.map(item => item.label) || [];
      expect(labels).not.toContain('break');
      expect(labels).not.toContain('continue');
    });
  });

  // ... more test suites for actions, events, variables, parameters
});
```

**Alternatives considered**:
- **Manual LSP client testing**: Rejected because complex setup, not Langium-specific
- **Jest**: Rejected because Vitest is faster and already configured
- **Integration tests only**: Rejected because want fast unit tests for each module

---

## 7. Performance Optimizations

### Decision: Lazy Loading + Caching

**What was chosen**:
- Load operation registry once at startup (singleton pattern)
- Cache custom action list per document (invalidate on document change)
- Debounce completion computation (100ms)

**Rationale**:
- **Fast response**: Completion appears within 100ms (SC-002 requirement)
- **No re-parsing**: Operation registry loaded once, not per completion request
- **Document-level caching**: Action list only recomputed when document changes
- **Debouncing**: Prevents rapid-fire completion requests from blocking UI

**Implementation**:
```typescript
// registry.ts
let operationRegistryCache: OperationMetadata[] | null = null;

export function loadOperationRegistry(): OperationMetadata[] {
  if (!operationRegistryCache) {
    operationRegistryCache = OPERATIONS.filter(
      op => !FILTERED_OPERATIONS.has(op.name)
    );
  }
  return operationRegistryCache;
}

// actions.ts
const actionCacheByDocument = new WeakMap<LangiumDocument, ActionDefinition[]>();

export function getAllActionsInDocument(document: LangiumDocument): ActionDefinition[] {
  if (!actionCacheByDocument.has(document)) {
    const actions = AstUtils.streamAllContents(document.parseResult.value)
      .filter(isActionDefinition)
      .toArray();
    actionCacheByDocument.set(document, actions);
  }
  return actionCacheByDocument.get(document)!;
}
```

**Alternatives considered**:
- **No caching**: Rejected because would reparse documents on every keystroke
- **Global cache**: Rejected because breaks with multiple documents
- **Persistent cache to disk**: Rejected because overkill, memory cache is fast enough

---

## Summary of Key Decisions

| Decision Area | Choice | Rationale |
|---------------|--------|-----------|
| **Provider Base** | Extend `DefaultCompletionProvider` | LSP integration, inheritance, consistency |
| **Grouping** | Use `CompletionItemKind` enum | Native VS Code support, visual icons, standard UX |
| **Documentation** | Markdown format | Rich formatting, readability, consistency with hover |
| **Metadata** | Build-time generation from TS | Offline, type-safe, fast, single source of truth |
| **Context Detection** | `AstUtils.getContainerOfType` | Robust, type-safe, simple, performant |
| **Module Organization** | Separate files per type | SRP, testability, maintainability, reusability |
| **Testing** | Langium utilities + Vitest | Integration with Langium, fast, fixture-based |
| **Performance** | Lazy loading + caching | Fast response, no re-parsing, SC-002 compliance |

---

## Next Steps

1. Proceed to Phase 1: Create `data-model.md` with detailed entity structures
2. Generate TypeScript interface contracts in `contracts/completion-provider.ts`
3. Write `quickstart.md` with developer guide for adding/testing completions
4. Update agent context with Langium patterns and metadata generation workflow
5. Begin implementation following Phase 2 task breakdown
