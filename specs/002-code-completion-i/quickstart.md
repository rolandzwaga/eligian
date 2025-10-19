# Quickstart: Developing Code Completion for Eligian DSL

**Audience**: Developers implementing or extending the code completion feature
**Last Updated**: 2025-10-19

## Table of Contents

1. [Overview](#overview)
2. [Development Setup](#development-setup)
3. [Architecture Overview](#architecture-overview)
4. [Adding New Completion Types](#adding-new-completion-types)
5. [Testing Completion Providers](#testing-completion-providers)
6. [Debugging in VS Code](#debugging-in-vs-code)
7. [Regenerating Metadata](#regenerating-metadata)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Eligian code completion feature provides intelligent autocompletion for:
- **Operations**: Eligius operation names with descriptions and parameters
- **Actions**: Custom actions defined in the current document
- **Keywords**: DSL keywords (`action`, `event`, `if`, `else`, `for`, `break`, `continue`)
- **Events**: Timeline event names from Eligius
- **Variables**: Variable references (`@@currentItem`, `@@loopIndex`, etc.)
- **Parameters**: Parameter names for operations/actions

**Key Design Principles**:
- **Modular**: Each completion type is a separate module
- **Context-aware**: Completions adapt to cursor context (inside loop, inside action, etc.)
- **Metadata-driven**: Operations and events loaded from generated registries
- **Testable**: Pure functions, easy to unit test

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- VS Code (for testing extension)
- Eligius library checked out at `../eligius/` (sibling directory)

### Clone and Install

```bash
# Clone repository
git clone https://github.com/rolandzwaga/eligian.git
cd eligian

# Install dependencies
pnpm install

# Generate Langium grammar artifacts
pnpm langium:generate

# Build all packages
pnpm build
```

### Project Structure

```
packages/
├── language/              # Langium language server
│   ├── src/
│   │   ├── eligian-completion-provider.ts   # Main completion provider
│   │   ├── completion/                      # Completion modules
│   │   │   ├── operations.ts
│   │   │   ├── actions.ts
│   │   │   ├── keywords.ts
│   │   │   ├── events.ts
│   │   │   ├── variables.ts
│   │   │   ├── parameters.ts
│   │   │   ├── context.ts
│   │   │   └── registry.ts
│   │   └── __tests__/
│   │       └── completion.spec.ts
│   └── package.json
│
├── extension/             # VS Code extension
│   ├── src/
│   │   └── metadata/                        # Generated metadata
│   │       ├── operations.generated.ts
│   │       └── timeline-events.generated.ts
│   └── package.json
│
└── cli/                   # CLI compiler
    └── src/
        └── commands/
            └── generate-registry.ts         # Metadata generator
```

---

## Architecture Overview

### Completion Flow

```
User types in VS Code
  ↓
VS Code LSP sends completion request
  ↓
EligianCompletionProvider.getCompletion()
  ↓
detectContext() → CompletionContext
  ↓
Dispatch to completion modules:
  - getOperationCompletions()
  - getActionCompletions()
  - getKeywordCompletions()
  - getEventCompletions()
  - getVariableCompletions()
  - getParameterCompletions()
  ↓
Each module returns CompletionItem[]
  ↓
Merge all items and return to VS Code
```

### Context Detection

The `detectContext()` function determines what completions to show:

```typescript
// In completion/context.ts
export function detectContext(
  document: LangiumDocument,
  position: Position
): CompletionContext {
  const offset = document.textDocument.offsetAt(position);
  const cstNode = CstUtils.findLeafNodeAtOffset(
    document.parseResult.value.$cstNode,
    offset
  );
  const cursorNode = cstNode?.astNode;

  return {
    cursorNode,
    isInsideLoop: !!AstUtils.getContainerOfType(cursorNode, isForEachLoop),
    isInsideAction: !!AstUtils.getContainerOfType(cursorNode, isActionDefinition),
    isInsideEvent: !!AstUtils.getContainerOfType(cursorNode, isEventDefinition),
    isAfterVariablePrefix: detectVariablePrefix(document, offset),
    insideOperationCall: detectOperationCall(cursorNode),
    document,
    position
  };
}
```

---

## Adding New Completion Types

### Example: Adding Property Chain Completions

Let's say you want to add completions for `$operationdata.` property chains.

#### Step 1: Create Module

Create `packages/language/src/completion/property-chains.ts`:

```typescript
import type { CompletionItem } from 'vscode-languageserver';
import { CompletionItemKind } from 'vscode-languageserver';
import type { CompletionContext } from './context.js';
import { AstUtils } from 'langium';
import { isActionDefinition } from '../generated/ast.js';

export function getPropertyChainCompletions(
  context: CompletionContext
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Only complete inside actions
  const action = AstUtils.getContainerOfType(
    context.cursorNode,
    isActionDefinition
  );

  if (!action) {
    return items;
  }

  // Add action parameter completions
  for (const param of action.parameters || []) {
    items.push({
      label: `$operationdata.${param.name}`,
      kind: CompletionItemKind.Property,
      sortText: `prop_${param.name}`,
      detail: 'Action parameter',
      documentation: {
        kind: 'markdown',
        value: `Access action parameter \`${param.name}\``
      },
      insertText: `$operationdata.${param.name}`
    });
  }

  return items;
}
```

#### Step 2: Integrate with Main Provider

Update `packages/language/src/eligian-completion-provider.ts`:

```typescript
import { getPropertyChainCompletions } from './completion/property-chains.js';

protected override async completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): Promise<void> {
  const eligianContext = detectContext(context.document, context.position);

  // Add property chain completions
  if (eligianContext.isInsideAction) {
    for (const item of getPropertyChainCompletions(eligianContext)) {
      acceptor(context, item);
    }
  }

  // ... other completions
}
```

#### Step 3: Write Tests

Add tests in `packages/language/src/__tests__/completion.spec.ts`:

```typescript
describe('Property Chain Completions', () => {
  test('completes $operationdata properties from action parameters', async () => {
    const doc = await parse(`
      action test(selector: string, duration: number) [
        $operationdata.<cursor>
      ]
    `);

    const completion = await completionProvider?.getCompletion(doc, {
      position: { line: 1, character: 22 }
    });

    expect(completion?.items).toContainEqual(
      expect.objectContaining({
        label: '$operationdata.selector',
        kind: CompletionItemKind.Property
      })
    );
  });
});
```

#### Step 4: Run Tests

```bash
cd packages/language
pnpm test
```

---

## Testing Completion Providers

### Unit Testing

Each completion module should have unit tests in `packages/language/src/__tests__/completion.spec.ts`.

**Test Structure**:
```typescript
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';
import { EmptyFileSystem } from 'langium';
import { CompletionItemKind } from 'vscode-languageserver';

describe('Code Completion', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper(services);
  const completionProvider = services.lsp.CompletionProvider;

  test('completes operation names', async () => {
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
});
```

**Running Tests**:
```bash
# Run all language tests
cd packages/language
pnpm test

# Run specific test file
pnpm test completion.spec.ts

# Watch mode (re-run on file changes)
pnpm test --watch
```

### Integration Testing in VS Code

1. **Open Extension Development Host**:
   ```bash
   # In VS Code, press F5
   # Or run: code --extensionDevelopmentPath=. --inspect-extensions=9229
   ```

2. **Create Test File**:
   Create `test.eligian` in the extension host window:
   ```eligian
   action test [
     // Type here to trigger completions
     sel
   ]
   ```

3. **Trigger Completions**:
   - Type characters to see filtering
   - Press `Ctrl+Space` to manually trigger completions
   - Check completion item details and documentation

4. **Debug Completion Provider**:
   - Set breakpoints in `eligian-completion-provider.ts`
   - Type in `test.eligian` to hit breakpoints
   - Inspect `CompletionContext` and returned items

---

## Debugging in VS Code

### Enable Debug Logging

Add logging to completion provider:

```typescript
protected override async completionFor(
  context: CompletionContext,
  next: NextFeature,
  acceptor: CompletionAcceptor
): Promise<void> {
  console.log('[Completion] Context:', {
    isInsideAction: context.isInsideAction,
    isInsideLoop: context.isInsideLoop,
    cursorNode: context.node?.$type
  });

  // ... rest of completion logic
}
```

### View Debug Output

1. In Extension Development Host, open **Output** panel
2. Select **Eligian Language Server** from dropdown
3. See debug logs from completion provider

### Set Breakpoints

1. Open `packages/language/src/eligian-completion-provider.ts`
2. Set breakpoint in `completionFor()` method
3. Press F5 to start debugging
4. Type in `.eligian` file to hit breakpoint
5. Inspect variables in Debug pane

---

## Regenerating Metadata

The operation registry and timeline events metadata are generated from Eligius sources at build time.

### Automatic Regeneration

Run the generation script:

```bash
# PowerShell script (Windows)
pwsh .specify/scripts/powershell/generate-metadata.ps1

# Or use CLI command (cross-platform)
cd packages/cli
pnpm generate:registry
```

### Manual Regeneration

If you need to regenerate after Eligius updates:

1. Pull latest Eligius changes:
   ```bash
   cd ../eligius
   git pull origin main
   cd ../eligian
   ```

2. Run metadata generator:
   ```bash
   pnpm generate:registry
   ```

3. Verify generated files:
   ```bash
   cat packages/extension/src/metadata/operations.generated.ts
   cat packages/extension/src/metadata/timeline-events.generated.ts
   ```

4. Rebuild extension:
   ```bash
   pnpm build
   ```

### Generator Implementation

The generator lives in `packages/cli/src/commands/generate-registry.ts`:

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

export function generateOperationRegistry(
  eligiusPath: string,
  outputPath: string
): void {
  const metadataPath = join(eligiusPath, 'src/operation/metadata');
  const metadataFiles = /* scan directory */;

  const operations: OperationMetadata[] = [];

  for (const file of metadataFiles) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf-8'),
      ts.ScriptTarget.Latest
    );

    // Parse TypeScript AST to extract metadata
    const metadata = extractMetadata(sourceFile);
    operations.push(metadata);
  }

  // Generate TypeScript module
  const code = generateModule(operations);
  writeFileSync(outputPath, code, 'utf-8');
}
```

---

## Common Tasks

### Add New Operation to Registry

1. Eligius adds new operation in `../eligius/src/operation/my-new-operation.ts`
2. Eligius adds metadata in `../eligius/src/operation/metadata/my-new-operation.ts`
3. Regenerate Eligian registry:
   ```bash
   pnpm generate:registry
   ```
4. Verify operation appears in completions

### Filter Out Operation from Completions

If an operation is now handled by a DSL keyword:

Edit `packages/extension/src/metadata/operations.generated.ts`:

```typescript
export const FILTERED_OPERATIONS = new Set([
  'breakForEach',
  'continueForEach',
  'ifCondition',
  'elseCondition',
  'forEach',
  'myNewKeyword'  // Add your operation here
]);
```

### Customize Completion Sorting

Use `sortText` to control order:

```typescript
{
  label: 'selectElement',
  sortText: '1_selectElement'  // "1_" prefix → sort first
}

{
  label: 'customAction',
  sortText: '2_customAction'  // "2_" prefix → sort after operations
}

{
  label: 'break',
  sortText: '0_break'  // "0_" prefix → sort before everything
}
```

VS Code sorts lexicographically by `sortText` (or `label` if no `sortText`).

### Add Rich Documentation

Use markdown for better readability:

```typescript
{
  label: 'selectElement',
  documentation: {
    kind: 'markdown',
    value: `
### selectElement

Select a DOM element by CSS selector.

**Parameters:**
- \`selector\`: string (required) - CSS selector
- \`useSelectedElementAsRoot\`: boolean (optional, default: false)

**Provides:**
- \`selectedElement\`: DOMElement

**Example:**
\`\`\`eligian
selectElement({selector: ".my-class"})
\`\`\`
    `.trim()
  }
}
```

---

## Troubleshooting

### Completions Not Appearing

**Symptom**: No completions shown when typing in `.eligian` file.

**Possible Causes**:
1. **Extension not loaded**: Check Output panel for "Eligian Language Server" logs
2. **Syntax error**: Fix syntax errors (they block completion)
3. **Wrong context**: Completions are context-aware (e.g., operations only in actions)

**Debug Steps**:
1. Add logging to `completionFor()`:
   ```typescript
   console.log('[Completion] Request at', context.position);
   ```
2. Check if `completionFor()` is called (view Output panel)
3. Check `CompletionContext` values (are flags correct?)
4. Verify completion items are being returned

### Wrong Completions Shown

**Symptom**: Completions appear in wrong context (e.g., `break` outside loops).

**Possible Causes**:
1. **Context detection bug**: `detectContext()` returns incorrect flags
2. **Context filter not implemented**: Completion module ignores context

**Debug Steps**:
1. Add logging to `detectContext()`:
   ```typescript
   console.log('[Context]', {
     isInsideLoop,
     isInsideAction,
     cursorNode: cursorNode?.$type
   });
   ```
2. Verify AST traversal finds correct container:
   ```typescript
   const loop = AstUtils.getContainerOfType(cursorNode, isForEachLoop);
   console.log('[Context] Loop container:', loop);
   ```
3. Fix context detection or add filtering in completion module

### Metadata Generation Fails

**Symptom**: `pnpm generate:registry` throws errors.

**Possible Causes**:
1. **Eligius path incorrect**: Script can't find `../eligius/`
2. **TypeScript parse error**: Eligius metadata file has invalid syntax
3. **Missing JSDoc**: Generator expects JSDoc comments

**Debug Steps**:
1. Verify Eligius path:
   ```bash
   ls ../eligius/src/operation/metadata/
   ```
2. Run generator with verbose logging:
   ```bash
   pnpm generate:registry --verbose
   ```
3. Check TypeScript compiler errors in Eligius sources
4. Fall back to regex parsing if AST parsing fails

### Performance Issues

**Symptom**: Completions take >100ms, UI lags.

**Possible Causes**:
1. **No caching**: Recomputing registries on every keystroke
2. **Too many completions**: Returning 100+ items without filtering
3. **Slow AST traversal**: `getContainerOfType()` inefficient

**Debug Steps**:
1. Add timing logs:
   ```typescript
   const start = performance.now();
   const items = getOperationCompletions(context);
   console.log('[Perf] Operations:', performance.now() - start, 'ms');
   ```
2. Profile with VS Code Performance:
   - Command Palette → "Developer: Startup Performance"
   - Look for "Eligian" extension overhead
3. Optimize:
   - Cache operation registry (singleton pattern)
   - Cache action list per document (WeakMap)
   - Limit completion items to top 50 matches

---

## Additional Resources

### Documentation

- **Feature Spec**: `specs/002-code-completion-i/spec.md`
- **Implementation Plan**: `specs/002-code-completion-i/plan.md`
- **Research**: `specs/002-code-completion-i/research.md`
- **Data Model**: `specs/002-code-completion-i/data-model.md`
- **Contracts**: `specs/002-code-completion-i/contracts/completion-provider.ts`

### Langium Documentation

- **Completion Provider**: https://langium.org/docs/reference/configuration-services/#completion-provider
- **AST Utilities**: https://langium.org/docs/reference/document-builder/#ast-utilities
- **Testing**: https://langium.org/docs/recipes/test-helper/

### VS Code LSP

- **CompletionItem**: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionItem
- **CompletionItemKind**: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionItemKind

---

## Summary

This quickstart guide covers:
- ✅ Development setup
- ✅ Architecture overview
- ✅ Adding new completion types
- ✅ Testing completion providers
- ✅ Debugging in VS Code
- ✅ Regenerating metadata
- ✅ Common tasks and troubleshooting

**Next Steps**:
1. Run `/speckit.tasks` to generate implementation task breakdown
2. Begin implementation with metadata generation
3. Implement completion providers module by module
4. Write tests alongside implementation
5. Test in VS Code extension

For questions or issues, refer to:
- Feature spec: `specs/002-code-completion-i/spec.md`
- Implementation plan: `specs/002-code-completion-i/plan.md`
- Constitution: `.specify/memory/constitution.md`
