# Technical Research: HTML Variables

**Feature**: HTML Variables
**Date**: 2025-10-27
**Purpose**: Document technical decisions, patterns, and best practices for implementing HTML file imports

---

## Research Questions

### 1. How should HTML imports integrate with Langium grammar?

**Decision**: Add `HTMLImport` grammar rule mirroring existing CSS import pattern

**Rationale**:
- Existing CSS imports use: `styles STRING`
- HTML imports should use: `import ID 'from' STRING`
- Consistency with JavaScript/TypeScript import syntax improves developer ergonomics
- Langium parser automatically handles string literals and identifiers

**Grammar Pattern**:
```langium
HTMLImport:
  'import' name=ID 'from' path=STRING;

Program:
  (htmlImports+=HTMLImport)*
  (layout=LayoutDeclaration)?
  (cssImports+=CSSImport)*
  // ... rest of program
```

**Alternatives Considered**:
- `html variableName './path.html'` - Rejected: less familiar, ambiguous with layout keyword
- `const variableName = html('./path.html')` - Rejected: breaks existing const syntax, requires new expression type

**Reference**: `packages/language/src/eligian.langium` (existing CSS import pattern)

---

### 2. How should HTML file reading be implemented with Effect-ts?

**Decision**: Create `HTMLLoaderService` using Effect-ts with typed error handling

**Rationale**:
- Effect-ts provides principled error handling for file I/O
- Errors (file not found, permission denied, read failure) must be typed and recoverable
- Async file reading fits Effect's async composition model
- Follows existing compiler pattern (FileSystemService in compiler package)

**API Design**:
```typescript
// packages/compiler/src/html-loader.ts
import { Effect, Context } from 'effect';

export class HTMLLoaderService extends Context.Tag("HTMLLoader")<
  HTMLLoaderService,
  {
    readonly loadHTML: (path: string) => Effect.Effect<string, HTMLLoadError>
    readonly validatePath: (path: string, projectRoot: string) => Effect.Effect<void, PathSecurityError>
  }
>() {}

export type HTMLLoadError =
  | { _tag: 'FileNotFound'; path: string }
  | { _tag: 'PermissionDenied'; path: string }
  | { _tag: 'ReadError'; path: string; cause: Error }

export type PathSecurityError =
  | { _tag: 'OutsideProjectDirectory'; path: string; projectRoot: string }
```

**Implementation Pattern**:
```typescript
const loadHTML = (path: string): Effect.Effect<string, HTMLLoadError> =>
  Effect.tryPromise({
    try: () => fs.promises.readFile(path, 'utf-8'),
    catch: (error) => {
      if (error.code === 'ENOENT') {
        return { _tag: 'FileNotFound', path };
      }
      if (error.code === 'EACCES') {
        return { _tag: 'PermissionDenied', path };
      }
      return { _tag: 'ReadError', path, cause: error };
    }
  });
```

**Alternatives Considered**:
- Sync fs.readFileSync - Rejected: blocks compilation, poor for large files
- Raw promises without Effect - Rejected: loses type safety, error handling inconsistent with compiler

**Reference**: Constitution Principle VI (Functional Programming with Effect-ts)

---

### 3. How should path resolution and security validation work?

**Decision**: Resolve relative paths from DSL file location, validate against project root using path.resolve and path.relative

**Rationale**:
- HTML imports use relative paths (`./file.html`, `../shared/header.html`)
- Security requirement: prevent escaping project directory (FR-013)
- Node.js `path.resolve` handles `..` traversal, `path.relative` detects escapes
- Project root is known at compilation time (CLI argument or VS Code workspace root)

**Path Resolution Algorithm**:
```typescript
// packages/compiler/src/path-resolver.ts
import path from 'node:path';

export function resolveHTMLPath(
  importPath: string,        // './snippet.html' from import statement
  sourceFilePath: string,     // '/project/src/timeline.eligian'
  projectRoot: string         // '/project'
): string {
  // 1. Resolve relative to source file
  const sourceDir = path.dirname(sourceFilePath);
  const absolutePath = path.resolve(sourceDir, importPath);

  // 2. Validate within project directory
  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new PathSecurityError(importPath, projectRoot);
  }

  return absolutePath;
}
```

**Security Validation**:
- `path.relative(projectRoot, absolutePath)` returns path from root to file
- If result starts with `..`, file is outside project directory
- If result is absolute path, file is on different drive (Windows)
- Both cases are security violations per FR-013

**Alternatives Considered**:
- Allow escaping with warning - Rejected: user explicitly chose Option A (restrict)
- Absolute paths only - Rejected: poor DX, breaks portability
- URL-based imports - Rejected: out of scope, security concerns

**Reference**: Spec User Story 3, Acceptance Scenario 2 (security validation)

---

### 4. How should HTML variables integrate with existing variable system?

**Decision**: Register HTML variables in compilation scope, treat as string constants

**Rationale**:
- Existing Eligian variables use `@variableName` syntax
- Variable scoping follows program-level (global) and action-level (local) rules
- HTML imports are program-level declarations → program-level variables
- Variables are immutable (HTML content loaded once at compile-time)
- String type aligns with existing Eligian type system

**Variable Registration**:
```typescript
// During AST transformation
for (const htmlImport of program.htmlImports) {
  const htmlContent = loadHTMLFile(htmlImport.path);

  // Register as program-level variable
  variables.set(htmlImport.name, {
    type: 'string',
    value: htmlContent,
    mutable: false,  // HTML variables are immutable
    scope: 'program'
  });
}
```

**Variable Referencing**:
```eligian
import header from './header.html'

timeline "Demo" at 0s {
  at 0s selectElement("#container") {
    setElementContent(@header)  // Resolved to HTML string at compile-time
  }
}
```

**Compilation Output**:
```json
{
  "operations": [
    {
      "systemName": "setElementContent",
      "operationData": {
        "content": "<div>Header content from file</div>"  // HTML embedded
      }
    }
  ]
}
```

**Alternatives Considered**:
- Runtime loading (Eligius loads HTML) - Rejected: breaks compile-time validation, adds runtime dependencies
- HTML variables as special type - Rejected: unnecessary complexity, string is sufficient

**Reference**: FR-003 (HTML variables referenceable with `@variableName`)

---

### 5. How should duplicate HTML variable names be detected?

**Decision**: Validate during parsing/validation phase, report error with existing variable location

**Rationale**:
- Duplicate variable names create ambiguity (which HTML file does `@foo` reference?)
- Langium validation phase is correct place for semantic checks
- Error should indicate both locations (first declaration and duplicate)
- Follows existing duplicate action name validation pattern

**Validation Logic**:
```typescript
// packages/language/src/eligian-validator.ts
checkHTMLImportDuplicates(program: Program, accept: ValidationAcceptor): void {
  const seen = new Map<string, HTMLImport>();

  for (const htmlImport of program.htmlImports) {
    const existing = seen.get(htmlImport.name);
    if (existing) {
      accept('error',
        `Variable '@${htmlImport.name}' is already defined (first defined at line ${existing.$cstNode?.range.start.line})`,
        { node: htmlImport, property: 'name', code: 'DUPLICATE_HTML_VARIABLE' }
      );
    } else {
      seen.set(htmlImport.name, htmlImport);
    }
  }
}
```

**Error Message Example**:
```
Variable '@header' is already defined (first defined at line 3)
```

**Alternatives Considered**:
- Allow duplicates (last wins) - Rejected: error-prone, unclear semantics
- Namespace HTML variables - Rejected: unnecessary complexity

**Reference**: FR-007 (detect duplicate variable names), User Story 3 Acceptance Scenario 4

---

### 6. How should layout vs import distinction be maintained?

**Decision**: Layout uses `layout STRING` (no variable name), imports use `import ID 'from' STRING` (with variable name)

**Rationale**:
- Layout keyword assigns HTML to `layoutTemplate` property (single use, not referenceable)
- Import creates a variable (reusable, referenceable with `@name`)
- Grammar-level distinction prevents confusion
- Validation error if attempting to reference layout as variable

**Grammar Distinction**:
```langium
LayoutDeclaration:
  'layout' path=STRING;  // No variable name

HTMLImport:
  'import' name=ID 'from' path=STRING;  // Has variable name
```

**Transformation Difference**:
```typescript
// Layout transformation
if (program.layout) {
  config.layoutTemplate = loadHTMLFile(program.layout.path);
}

// Import transformation
for (const htmlImport of program.htmlImports) {
  variables.set(htmlImport.name, loadHTMLFile(htmlImport.path));
}
```

**Validation**:
```typescript
// Error if attempting: setElementContent(@layout)
// (layout is not a variable, it's a configuration property)
checkVariableReference(ref: VariableReference, accept: ValidationAcceptor): void {
  if (ref.name === 'layout') {
    accept('error',
      "'layout' is a configuration property, not a variable. Use 'import' to create HTML variables.",
      { node: ref, code: 'INVALID_LAYOUT_REFERENCE' }
    );
  }
}
```

**Reference**: FR-004 (distinguish layout from imports), User Story 2

---

### 7. What testing strategy should be used?

**Decision**: Test-first development with unit tests for each module, integration tests for end-to-end compilation

**Rationale**:
- Constitution Principle II mandates test-first development (RED-GREEN-REFACTOR)
- Unit tests verify individual components in isolation (parser, file loader, path resolver)
- Integration tests verify full compilation pipeline with HTML imports
- Coverage target: 80% per Principle II

**Test Structure**:

**Unit Tests**:
```typescript
// packages/language/src/__tests__/parsing.spec.ts
describe('HTML Import Parsing', () => {
  test('parses single HTML import');
  test('parses multiple HTML imports');
  test('parses HTML import with relative path');
  test('parses HTML import with directory traversal');
});

// packages/compiler/src/__tests__/html-loader.spec.ts
describe('HTML Loader', () => {
  test('loads valid HTML file');
  test('returns FileNotFound for missing file');
  test('returns PermissionDenied for unreadable file');
  test('returns ReadError for corrupted file');
});

// packages/compiler/src/__tests__/path-resolver.spec.ts
describe('Path Resolver', () => {
  test('resolves relative path from source file');
  test('rejects path outside project directory');
  test('handles directory traversal correctly');
  test('normalizes path separators (Windows/Unix)');
});
```

**Integration Tests**:
```typescript
// packages/language/src/__tests__/html-imports.spec.ts
describe('HTML Imports Integration', () => {
  test('compiles HTML import and embeds content');
  test('validates missing HTML file at compile-time');
  test('validates duplicate variable names');
  test('prevents path escape outside project');
});
```

**Test Fixtures**:
```
packages/language/src/__tests__/__fixtures__/
├── valid/
│   ├── html-import-single.eligian
│   ├── html-import-multiple.eligian
│   └── snippets/
│       ├── header.html
│       └── footer.html
└── invalid/
    ├── html-import-missing-file.eligian
    ├── html-import-duplicate.eligian
    └── html-import-path-escape.eligian
```

**Alternatives Considered**:
- Tests after implementation - Rejected: violates Constitution Principle II
- Only integration tests - Rejected: insufficient coverage, hard to debug
- Only unit tests - Rejected: doesn't verify end-to-end behavior

**Reference**: Constitution Principle II (Comprehensive Testing, test-first workflow)

---

### 8. How should HTML content be embedded in Eligius configuration?

**Decision**: Embed HTML as string literals in operation parameters, escaping handled by JSON.stringify

**Rationale**:
- Eligius configuration is JSON format
- HTML variables compile to string values in operation parameters
- JSON.stringify automatically handles escaping quotes, newlines, special characters
- No special HTML escaping needed (JSON escaping is sufficient)

**Compilation Example**:

**Input DSL**:
```eligian
import snippet from './snippet.html'

timeline "Demo" at 0s {
  at 0s selectElement("#box") {
    setElementContent(@snippet)
  }
}
```

**HTML File (`snippet.html`)**:
```html
<div class="card">
  <h2>Title</h2>
  <p>Description with "quotes" and 'apostrophes'</p>
</div>
```

**Output JSON** (simplified):
```json
{
  "operations": [
    {
      "systemName": "setElementContent",
      "operationData": {
        "content": "<div class=\"card\">\n  <h2>Title</h2>\n  <p>Description with \"quotes\" and 'apostrophes'</p>\n</div>"
      }
    }
  ]
}
```

**Escaping Handling**:
- Newlines → `\n`
- Double quotes → `\"`
- Backslashes → `\\`
- All handled by `JSON.stringify()` automatically

**Alternatives Considered**:
- Base64 encoding - Rejected: unnecessarily obscures content, harder to debug
- Custom escaping - Rejected: reinvents wheel, JSON.stringify is battle-tested
- External file references - Rejected: breaks compile-time embedding, runtime dependency

**Reference**: FR-009 (preserve HTML exactly as written)

---

## Best Practices Summary

### Langium Grammar Integration
- Follow existing import pattern (CSS imports)
- Use familiar syntax (JavaScript-style imports)
- Clear separation from layout keyword

### Effect-ts Error Handling
- All file I/O through Effect services
- Typed error unions for all failure modes
- Composable error handling in pipeline

### Path Security
- Always resolve relative to source file
- Validate against project root
- Reject paths escaping project directory

### Variable System Integration
- Reuse existing `@variableName` syntax
- Program-level scope for HTML imports
- Immutable string variables

### Testing Strategy
- Test-first development (RED-GREEN-REFACTOR)
- Unit tests for each module
- Integration tests for end-to-end flows
- 80% coverage threshold

### JSON Embedding
- Use JSON.stringify for escaping
- No custom HTML escaping needed
- Preserve HTML content exactly

---

## Dependencies

**No new dependencies required**. Feature uses existing project dependencies:

- **Langium** - Grammar parsing (already in language package)
- **Effect-ts** - Error handling (already in compiler package)
- **Node.js fs** - File reading (already in compiler package)
- **Node.js path** - Path resolution (already in compiler package)
- **Vitest** - Testing (already in all packages)

**Rationale**: Constitution Principle XIX prohibits automatic dependency additions. All required functionality available in existing dependencies.

---

## Implementation Phases

### Phase 1: Grammar & Parsing (Test-First)
1. Write tests for HTML import parsing
2. Add `HTMLImport` grammar rule to eligian.langium
3. Verify tests pass

### Phase 2: File Loading & Path Resolution (Test-First)
1. Write tests for html-loader.ts (file reading, error handling)
2. Write tests for path-resolver.ts (path resolution, security)
3. Implement HTMLLoaderService with Effect-ts
4. Implement path resolution and validation
5. Verify tests pass

### Phase 3: Validation (Test-First)
1. Write tests for duplicate detection
2. Write tests for missing file validation
3. Write tests for path security validation
4. Implement validation logic in eligian-validator.ts
5. Verify tests pass

### Phase 4: Transformation (Test-First)
1. Write tests for HTML variable registration
2. Write tests for variable referencing in operations
3. Modify ast-transformer.ts to handle HTML imports
4. Verify tests pass

### Phase 5: Integration & Coverage
1. Write end-to-end integration tests
2. Run coverage analysis (`npm run test:coverage`)
3. Verify 80% threshold met
4. Add example file to examples/ directory

---

## Open Questions

**None** - All technical decisions documented above. Proceed to Phase 1 (data-model.md).
