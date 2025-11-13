# Quickstart: Utility Modules Usage Guide

**Feature**: Code Duplication Refactoring (031)
**Purpose**: Guide developers on using the 7 new shared utility modules that consolidate duplicated code patterns

## Overview

This feature introduces 7 new utility modules that consolidate 12 duplication patterns across the Eligian codebase:

**Note**: Some refactorings consolidate code within existing files (like CSS hover builders in `css/css-hover.ts`) while others extract to new utility modules. See individual module documentation for details.

| Module | Purpose | Primary Use Cases |
|--------|---------|-------------------|
| `utils/string-utils.ts` | String literal detection | Completion providers, CSS context detection |
| `utils/error-builder.ts` | Error construction | Validators (import, asset, CSS) |
| `utils/hover-utils.ts` | LSP Hover creation | All hover providers (CSS, actions, operations) |
| `utils/markdown-builder.ts` | Markdown generation | Hover content, documentation |
| `utils/css-file-utils.ts` | CSS file operations | CSS code actions, CSS registry |
| `utils/collection-utils.ts` | Collection conversions | Registry queries, array operations |
| `completion/completion-item-factory.ts` | CompletionItem creation | All completion providers |

---

## Module 1: String Literal Detection (`utils/string-utils.ts`)

### API

```typescript
/**
 * Determines if a given document offset falls within a string literal.
 * @param rootNode - CST root node to search
 * @param offset - Document offset to check
 * @returns true if offset is inside a string literal, false otherwise
 */
export function isOffsetInStringLiteral(rootNode: CstNode, offset: number): boolean
```

### Usage Example

**Before** (duplicated in `eligian-completion-provider.ts` and `css/context-detection.ts`):
```typescript
function isCursorInString(context: CompletionContext): boolean {
  const { node, offset } = context;
  const rootCstNode = node.$cstNode;
  if (!rootCstNode) return false;

  // 15 lines of CST traversal logic...
  return false;
}
```

**After**:
```typescript
import { isOffsetInStringLiteral } from '../utils/string-utils.js';

function isCursorInString(context: CompletionContext): boolean {
  const { node, offset } = context;
  const rootCstNode = node.$cstNode;
  if (!rootCstNode) return false;

  return isOffsetInStringLiteral(rootCstNode, offset);
}
```

### When to Use

- Detecting if cursor is inside a string literal (for completion filtering)
- Validating string literal context before providing CSS suggestions
- Any CST traversal needing to identify string token boundaries

---

## Module 2: Error Construction (`utils/error-builder.ts`)

### API

```typescript
/**
 * Constructs a validation error object with code, message, and hint.
 * @param errorDefinition - Error definition from ERROR_MESSAGES constant
 * @param args - Arguments to pass to error message generator
 * @returns Validation error object ready for ValidationAcceptor
 */
export function createValidationError<T extends (...args: any[]) => { message: string; hint: string }>(
  errorDefinition: T,
  ...args: Parameters<T>
): ReturnType<T> & { code: string }
```

### Usage Example

**Before** (duplicated across 5+ validators):
```typescript
// In asset-type-validator.ts
const { message, hint } = ERROR_MESSAGES.unknown_asset_type(assetType, allowedTypes);
return {
  code: 'unknown_asset_type',
  message,
  hint
};

// In import-path-validator.ts
const { message, hint } = ERROR_MESSAGES.import_path_not_found(importPath);
return {
  code: 'import_path_not_found',
  message,
  hint
};
```

**After**:
```typescript
import { createValidationError } from '../utils/error-builder.js';

// In asset-type-validator.ts
return createValidationError(ERROR_MESSAGES.unknown_asset_type, assetType, allowedTypes);

// In import-path-validator.ts
return createValidationError(ERROR_MESSAGES.import_path_not_found, importPath);
```

### When to Use

- Constructing validation errors in any validator
- Ensuring consistent error structure (code, message, hint)
- Reducing boilerplate in error reporting

### Migration Checklist

For each validator using manual error construction:
1. Import `createValidationError` from `utils/error-builder.js`
2. Replace 3-line error construction with single function call
3. Pass error definition function and arguments directly
4. Verify tests pass with identical error messages

---

## Module 3: Hover Object Creation (`utils/hover-utils.ts`)

### API

```typescript
/**
 * Creates an LSP Hover object with markdown content.
 * @param markdown - Markdown-formatted hover content
 * @returns Hover object conforming to LSP protocol
 */
export function createMarkdownHover(markdown: string): Hover
```

### Usage Example

**Before** (duplicated 6+ times across hover providers):
```typescript
// In css/css-hover.ts
return {
  contents: {
    kind: 'markdown',
    value: markdown
  } as MarkupContent
};

// In eligian-hover-provider.ts (4 instances)
return {
  contents: {
    kind: 'markdown',
    value: actionMarkdown
  }
};
```

**After**:
```typescript
import { createMarkdownHover } from '../utils/hover-utils.js';

// In css/css-hover.ts
return createMarkdownHover(markdown);

// In eligian-hover-provider.ts
return createMarkdownHover(actionMarkdown);
```

### When to Use

- Creating hover responses in any hover provider
- Ensuring consistent LSP Hover object structure
- Reducing boilerplate in hover implementations

---

## Module 4: Markdown Generation (`utils/markdown-builder.ts`)

### API

```typescript
/**
 * Fluent builder for constructing markdown content.
 */
export class MarkdownBuilder {
  heading(level: number, text: string): this
  text(content: string): this
  blank(): this
  list(items: string[]): this
  codeBlock(code: string, language?: string): this
  build(): string
}
```

### Usage Example

**Before** (array-based building in CSS hover):
```typescript
const lines = [`### CSS Class: \`.${name}\``, '', '**Found in:**'];
for (const [file, locations] of files) {
  lines.push(`- ${file} (${locations.length} occurrence${locations.length !== 1 ? 's' : ''})`);
}
return lines.join('\n');
```

**After**:
```typescript
import { MarkdownBuilder } from '../utils/markdown-builder.js';

const builder = new MarkdownBuilder()
  .heading(3, `CSS Class: \`.${name}\``)
  .blank()
  .text('**Found in:**');

const items = [];
for (const [file, locations] of files) {
  items.push(`${file} (${locations.length} occurrence${locations.length !== 1 ? 's' : ''})`);
}

return builder.list(items).build();
```

### When to Use

- Building hover content with consistent structure
- Generating markdown documentation programmatically
- Ensuring proper markdown formatting (headings, lists, code blocks)

### Builder Methods

| Method | Description | Example |
|--------|-------------|---------|
| `heading(level, text)` | Add heading (# to ######) | `.heading(3, 'Title')` → `### Title` |
| `text(content)` | Add text line | `.text('Hello')` → `Hello` |
| `blank()` | Add blank line | `.blank()` → `` (empty line) |
| `list(items)` | Add bullet list | `.list(['a', 'b'])` → `- a\n- b` |
| `codeBlock(code, lang)` | Add code fence | `.codeBlock('x', 'ts')` → ` ```ts\nx\n``` ` |
| `build()` | Generate markdown | Returns joined string |

---

## Module 5: CSS File Operations (`utils/css-file-utils.ts`)

### API

```typescript
/**
 * Reads a CSS file with error handling and fallback.
 * @param filePath - Absolute path to CSS file
 * @returns File contents or empty string on error
 */
export async function readCSSFileWithErrorHandling(filePath: string): Promise<string>
```

### Usage Example

**Before** (duplicated in CSS code actions):
```typescript
try {
  const content = await fs.readFile(cssFilePath, 'utf-8');
  return content;
} catch (error) {
  console.warn(`Failed to read CSS file: ${cssFilePath}`, error);
  return '';
}
```

**After**:
```typescript
import { readCSSFileWithErrorHandling } from '../utils/css-file-utils.js';

const content = await readCSSFileWithErrorHandling(cssFilePath);
```

### When to Use

- Reading CSS files with graceful error handling
- Ensuring consistent error logging for file operations
- Avoiding try-catch boilerplate in CSS-related code

---

## Module 6: Collection Utilities (`utils/collection-utils.ts`)

### API

```typescript
/**
 * Converts a Set to an Array.
 * @param set - Set to convert
 * @returns Array of set elements
 */
export function setToArray<T>(set: Set<T>): T[]
```

### Usage Example

**Before** (duplicated in hover provider and code actions):
```typescript
const cssImports = Array.from(registry.getDocumentImports(documentUri));
```

**After**:
```typescript
import { setToArray } from '../utils/collection-utils.js';

const cssImports = setToArray(registry.getDocumentImports(documentUri));
```

### When to Use

- Converting registry query results (Set) to arrays
- Any Set → Array conversion for iteration or mapping
- Ensuring type-safe collection conversions

---

## Module 7: Completion Item Factory (`completion/completion-item-factory.ts`)

### API

```typescript
/**
 * Creates a CompletionItem with consistent structure.
 * @param label - Completion label
 * @param kind - CompletionItemKind (Function, Class, etc.)
 * @param documentation - Optional markdown documentation
 * @param insertText - Optional text to insert (defaults to label)
 * @returns CompletionItem conforming to LSP protocol
 */
export function createCompletionItem(
  label: string,
  kind: CompletionItemKind,
  documentation?: string,
  insertText?: string
): CompletionItem
```

### Usage Example

**Before** (duplicated across completion providers):
```typescript
return {
  label: actionName,
  kind: CompletionItemKind.Function,
  documentation: {
    kind: 'markdown',
    value: actionDocs
  },
  insertText: actionName
};
```

**After**:
```typescript
import { createCompletionItem } from '../completion/completion-item-factory.js';
import { CompletionItemKind } from 'vscode-languageserver-protocol';

return createCompletionItem(
  actionName,
  CompletionItemKind.Function,
  actionDocs
);
```

### When to Use

- Creating completion items in any completion provider
- Ensuring consistent CompletionItem structure
- Reducing boilerplate in completion implementations

---

## Testing Utilities

Each utility module has comprehensive unit tests. When adding new utilities or modifying existing ones, follow these patterns:

### Test Structure

```typescript
// packages/language/src/utils/__tests__/string-utils.spec.ts

import { describe, test, expect } from 'vitest';
import { isOffsetInStringLiteral } from '../string-utils.js';

describe('String Utilities', () => {
  describe('isOffsetInStringLiteral', () => {
    test('should detect offset inside string literal', () => {
      // Test setup
      // Assertions
    });

    test('should detect offset outside string literal', () => {
      // Test setup
      // Assertions
    });

    test('should handle edge cases (empty strings, boundaries)', () => {
      // Test setup
      // Assertions
    });
  });
});
```

### Coverage Requirements

- All utility functions must have unit tests
- Coverage must remain ≥81.72% after refactoring
- Edge cases must be tested (null, undefined, empty inputs)

---

## Migration Checklist

When migrating existing code to use new utilities:

### For Each Duplication Instance:

1. **Identify**: Locate duplicated pattern in duplication analysis report
2. **Read Utility**: Review utility API documentation above
3. **Import**: Add import for utility function/class
4. **Replace**: Replace inline logic with utility call
5. **Verify**: Run tests to ensure identical behavior
6. **Clean Up**: Remove old inline implementation
7. **Document**: Update any module-level comments referencing old pattern

### Verification Steps:

After each migration:
```bash
# 1. Run tests (must pass without modification)
pnpm run test

# 2. Check coverage (must remain ≥81.72%)
pnpm run test:coverage

# 3. Verify code quality
pnpm run check

# 4. Verify TypeScript compilation
pnpm run typecheck
```

### Common Migration Patterns

| Old Pattern | New Utility | Import |
|-------------|-------------|---------|
| `isCursorInString()` | `isOffsetInStringLiteral()` | `utils/string-utils.js` |
| `{ code, message, hint }` construction | `createValidationError()` | `utils/error-builder.js` |
| `{ contents: { kind: 'markdown', value } }` | `createMarkdownHover()` | `utils/hover-utils.js` |
| `lines.push(...); lines.join('\n')` | `MarkdownBuilder` | `utils/markdown-builder.js` |
| `Array.from(set)` | `setToArray()` | `utils/collection-utils.js` |

---

## Performance Notes

All utilities are designed for negligible performance impact:

- **String literal detection**: O(n) CST traversal (same as inline version)
- **Error construction**: O(1) object creation
- **Hover creation**: O(1) object wrapping
- **Markdown building**: O(n) string concatenation (same as array.join)
- **CSS file reading**: I/O-bound (error handling is constant overhead)
- **Collection conversion**: O(n) iteration (same as Array.from)
- **Completion item creation**: O(1) object creation

**Benchmark results** (expected after implementation):
- Build time: <5% increase (within acceptable range)
- Runtime performance: No measurable difference

---

## Common Questions

### Q: Why extract utilities for simple patterns like `Array.from(set)`?

**A**: Even simple patterns benefit from:
- Single source of truth (one place to optimize or fix bugs)
- Consistent naming (setToArray is more descriptive than Array.from)
- Type safety (generic function enforces correct types)
- Searchability (easier to find all Set conversions)

### Q: Can I add new utilities to these modules?

**A**: Yes, but follow these guidelines:
1. Ensure utility is reusable (used in 2+ places)
2. Add comprehensive unit tests
3. Document with JSDoc
4. Follow existing naming conventions
5. Verify Biome and TypeScript checks pass

### Q: What if I find more duplication?

**A**: Follow the refactoring process:
1. Document duplication (file paths, line numbers)
2. Extract to appropriate utility module (or create new one)
3. Add tests for utility
4. Update consumers
5. Verify all tests pass
6. Update this quickstart guide

### Q: How do I test utilities in isolation?

**A**: See test structure above. Key principles:
- Test utility function directly (no integration setup)
- Test all branches and edge cases
- Mock dependencies if needed (e.g., file system for CSS utils)
- Verify error handling and boundary conditions

---

## Related Documentation

- **Duplication Analysis**: See `DUPLICATION_ANALYSIS.md` at repo root for full duplication report
- **Implementation Plan**: See `plan.md` in this directory for technical architecture
- **Feature Specification**: See `spec.md` in this directory for requirements and success criteria
- **Test Helpers**: See `packages/language/src/__tests__/test-helpers.ts` for existing test utilities

---

## Support

If you encounter issues or have questions about using these utilities:
1. Check this quickstart guide first
2. Review utility module source code and JSDoc comments
3. Consult duplication analysis report for context
4. Ask in team chat with specific code examples

**Last Updated**: 2025-01-13 (Feature 031 - Phase 1)
