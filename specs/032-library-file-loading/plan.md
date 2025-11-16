# Implementation Plan: Library File Loading in Compiler Pipeline

**Branch**: `032-library-file-loading` | **Date**: 2025-11-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/032-library-file-loading/spec.md`

## Summary

Enable the CLI compiler to load imported `.eligian` library files into the Langium workspace, resolving "Could not resolve reference" errors. The implementation adds library file loading to the compiler pipeline using Effect-based error handling, builds on existing Feature 023 grammar/scope/validation, and requires no new dependencies. The approach uses Langiums built-in document management services with synchronous file I/O, achieving <2s compilation for typical projects (1 program + 5 libraries).

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js ESM  
**Primary Dependencies**: Langium (document management), Effect-TS (error handling), vscode-uri (path resolution)  
**Storage**: File system (Node.js fs module for reading .eligian library files)  
**Testing**: Vitest with integration tests using real .eligian fixtures  
**Target Platform**: Node.js CLI (packages/cli), cross-platform (Windows/Unix)  
**Project Type**: Monorepo (pnpm workspace) - modifications in packages/language/src/compiler/  
**Performance Goals**: <2 seconds compilation for 1 program + 5 libraries (FR target)  
**Constraints**: Synchronous file I/O acceptable (small files <10KB typical), no caching required for MVP  
**Scale/Scope**: Supports up to 10 nested library dependencies (SC-004), typical usage 1-5 libraries per program


## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach uses existing Langium document management patterns from VS Code extension. No new abstractions. Clear documentation in research.md.
- [x] **Comprehensive Testing**: Test-first development planned. Unit tests for each function (file loading, parsing, cycle detection, linking). Integration tests for each user story. 80% coverage target verified post-implementation.
- [x] **No Gold-Plating**: Solves documented need (CLI compiler fails with library imports). No caching (out of scope). No package resolution (out of scope). Minimal implementation for US1-US3.
- [x] **Code Review**: Changes localized to pipeline.ts (~100 lines). Clear diff for review. Test coverage demonstrates correctness.
- [x] **UX Consistency**: Error messages follow existing compiler error format. Effect-based errors consistent with pipeline.
- [x] **Functional Programming**: External immutability maintained (Effect pipeline). Internal mutation acceptable for loading stack (cycle detection). Effect.sync wraps file I/O.
- [x] **Technical Overview Consultation** (Principle XXVI): Consulted specs/TECHNICAL_OVERVIEW.md during planning. Pipeline architecture section (5.2) guided insertion point after CSS loading. Will update technical overview after implementation if library loading pattern differs from documented approach.

*All checks pass. No constitutional violations. Complexity justified by requirement.*


## Project Structure

### Documentation (this feature)

```
specs/032-library-file-loading/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (in progress)
├── research.md          # Phase 0 research (complete)
├── data-model.md        # Phase 1 (to be generated)
├── quickstart.md        # Phase 1 (to be generated)
├── contracts/           # Phase 1 (N/A - no API contracts for internal compiler feature)
└── tasks.md             # Phase 2 (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── language/
│   └── src/
│       ├── compiler/
│       │   ├── pipeline.ts                    # MODIFY: Add library loading (lines ~340-400)
│       │   ├── error-reporter.ts              # MODIFY: Add library error formatting
│       │   └── __tests__/
│       │       ├── library-loading.spec.ts    # NEW: Unit tests for library loading functions
│       │       └── pipeline-with-libraries.spec.ts  # NEW: Integration tests for US1-US3
│       ├── generated/
│       │   └── ast.ts                         # READ: LibraryImport type definitions
│       └── eligian-scope-provider.ts          # READ: Understanding getImportedActions()
│
├── cli/
│   ├── out/
│   │   └── index.js                           # TEST TARGET: CLI compiler
│   └── src/
│       └── index.ts                           # NO CHANGES: CLI entry point unchanged
│
└── shared-utils/                              # NO CHANGES: No shared utilities needed

examples/
└── libraries/
    └── animations.eligian                     # TEST FIXTURE: Existing library for integration tests

test-import.eligian                            # TEST FIXTURE: Reproduces "Could not resolve reference" error
```

**Key modification**: `packages/language/src/compiler/pipeline.ts:340-400` (~60 new lines)


## Implementation Phases

### Phase 1: Core Library Loading (User Story 1 - Priority P1)

**Goal**: Enable CLI compilation of programs with library imports

**Components**:

1. **Library Import Extraction** (FR-001)
   - Extract `LibraryImport` AST nodes from program
   - Get import paths from `import { action } from "path"` statements
   - Filter unique library paths (handle duplicate imports)

2. **Path Resolution** (FR-002)
   - Resolve relative paths to absolute file paths
   - Handle `./` prefix normalization
   - Use `path.resolve()` for cross-platform compatibility
   - Convert file paths to Langium URIs using `vscode-uri`

3. **File Loading** (FR-003)
   - Read library file content with `fs.readFileSync()`
   - Wrap in `Effect.sync()` for error handling
   - Handle ENOENT errors as FileNotFound

4. **Document Parsing** (FR-004)
   - Use `LangiumDocumentFactory.fromString()` to create document
   - Set document URI from resolved file path
   - Validate document is Library type (not Program)

5. **Workspace Integration** (FR-005)
   - Add library document to `services.shared.workspace.LangiumDocuments`
   - Use `addDocument()` method to register document

6. **Document Linking** (FR-006, FR-007)
   - Build each library document individually: `DocumentBuilder.build([libraryDoc], { validation: false })`
   - After all libraries loaded, re-build main document: `DocumentBuilder.build([mainDoc], { validation: false })`
   - Linking resolves cross-references between documents

**Acceptance Criteria**:
- `test-import.eligian` compiles successfully
- Output JSON contains `fadeIn` action's operations
- No "Could not resolve reference" errors
- Compilation completes in <2 seconds

**Files Modified**:
- `packages/language/src/compiler/pipeline.ts` (~60 new lines after line 340)

**Files Added**:
- `packages/language/src/compiler/__tests__/library-loading.spec.ts` (unit tests)
- `packages/language/src/compiler/__tests__/pipeline-with-libraries.spec.ts` (integration test US1)

### Phase 2: Error Handling (User Story 2 - Priority P2)

**Goal**: Provide clear error messages for library loading failures

**Error Types** (from research.md):

1. **FileNotFound** (FR-008)
   - Trigger: Library file doesn't exist at resolved path
   - Message format: `Library file not found: '{path}' (imported at {location})`
   - Includes import statement source location

2. **ParseError** (FR-009)
   - Trigger: Library file has syntax errors
   - Message format: `Library file has parse errors: '{path}' (line {X}, column {Y}): {error}`
   - Includes library file location and Langium parse error details

3. **InvalidLibrary**
   - Trigger: File parses but is Program, not Library
   - Message format: `Expected library file but got program: '{path}'`

**Error Propagation**:
- Library loading returns `Effect<LangiumDocument[], LibraryLoadError>`
- Pipeline catches errors and delegates to `error-reporter.ts`
- Error reporter formats library errors consistent with existing errors

**Acceptance Criteria**:
- Missing library file shows clear error with file path
- Syntax error in library shows error with line/column
- Error messages are actionable (user knows what to fix)

**Files Modified**:
- `packages/language/src/compiler/pipeline.ts` (error handling in library loading)
- `packages/language/src/compiler/error-reporter.ts` (format library errors)

**Files Added**:
- `packages/language/src/compiler/__tests__/library-loading-errors.spec.ts` (unit tests for error cases)
- Integration test fixtures: `missing-library.eligian`, `broken-library.eligian`

### Phase 3: Nested Dependencies (User Story 3 - Priority P3)

**Goal**: Support library-to-library imports with cycle detection

**Algorithm** (from research.md Q3):

```
loadingStack: Set<string> = new Set()
loadedDocuments: Map<string, LangiumDocument> = new Map()

function loadLibraryRecursive(path: string, importLocation: Location):
  // Check for circular dependency
  if (loadingStack.has(path)):
    chain = Array.from(loadingStack) + [path]
    return Effect.fail({ _tag: "CircularDependency", chain, location: importLocation })
  
  // Check if already loaded (avoid redundant work)
  if (loadedDocuments.has(path)):
    return Effect.succeed(loadedDocuments.get(path))
  
  // Load this library
  loadingStack.add(path)
  content = readFile(path)
  doc = parseLibrary(content)
  
  // Recursively load nested libraries
  for import in doc.imports:
    nestedDoc = loadLibraryRecursive(import.path, import.location)
  
  // Build this library's document (after dependencies loaded)
  DocumentBuilder.build([doc], { validation: false })
  
  loadingStack.delete(path)
  loadedDocuments.set(path, doc)
  return Effect.succeed(doc)
```

**Key Behaviors**:
- Depth-first loading ensures dependencies built before dependents
- Cycle detection prevents infinite loops
- Each library loaded once (cached in loadedDocuments map)

**Acceptance Criteria**:
- Library A imports B imports C → all actions available
- Circular import A→B→A → error with dependency chain
- Nested dependencies up to 10 levels deep work correctly
- Performance <2 seconds for nested chains

**Files Modified**:
- `packages/language/src/compiler/pipeline.ts` (recursive loading logic)

**Files Added**:
- Integration test fixtures: `library-chain/` directory with A.eligian, B.eligian, C.eligian
- Integration test fixtures: `library-cycle/` directory with cycle-a.eligian, cycle-b.eligian
- `packages/language/src/compiler/__tests__/nested-libraries.spec.ts` (integration test US3)


## Testing Strategy

### Test-First Development (Constitution Principle II)

**MANDATORY workflow**:
1. **RED**: Write failing test describing behavior
2. **GREEN**: Write minimum code to pass test
3. **REFACTOR**: Improve code while keeping tests green
4. **NEVER**: Write implementation before test exists

### Unit Tests

**File**: `packages/language/src/compiler/__tests__/library-loading.spec.ts`

**Test cases** (Phase 1 - Core Loading):
1. `extractLibraryImports()` - Extracts LibraryImport nodes from Program AST
   - Test: No imports returns empty array
   - Test: Single import returns one path
   - Test: Multiple imports returns all paths
   - Test: Duplicate imports deduplicated

2. `resolveLibraryPath()` - Resolves relative path to absolute file path
   - Test: Resolves `./lib.eligian` relative to document directory
   - Test: Resolves `../lib.eligian` to parent directory
   - Test: Windows backslashes normalized to forward slashes
   - Test: Already absolute paths returned unchanged

3. `loadLibraryFile()` - Reads library file content
   - Test: Successful read returns file content
   - Test: File not found returns Effect.fail with FileNotFound error
   - Test: Permission denied returns Effect.fail with appropriate error

4. `parseLibraryDocument()` - Parses library content into Langium document
   - Test: Valid library syntax returns Library document
   - Test: Syntax error returns Effect.fail with ParseError
   - Test: Program file (not Library) returns InvalidLibrary error

5. `linkLibraryDocuments()` - Links library documents with main document
   - Test: Single library links successfully
   - Test: Multiple libraries link independently
   - Test: Main document re-linked after libraries

**Test cases** (Phase 2 - Error Handling):
6. Error formatting - Library errors formatted for display
   - Test: FileNotFound includes file path and import location
   - Test: ParseError includes line/column from library file
   - Test: CircularDependency includes full dependency chain

**Test cases** (Phase 3 - Nested Dependencies):
7. `detectCircularDependency()` - Cycle detection algorithm
   - Test: A→B detected as no cycle (linear)
   - Test: A→B→A detected as cycle
   - Test: A→B→C→A detected as cycle
   - Test: Loading stack cleared after successful load

8. `loadLibraryRecursive()` - Recursive nested library loading
   - Test: A imports B → both loaded
   - Test: A imports B, B imports C → all loaded in correct order
   - Test: Circular import detected and fails
   - Test: Already loaded library not loaded twice

**Coverage target**: 100% for library loading functions (strict enforcement)

### Integration Tests

**File**: `packages/language/src/compiler/__tests__/pipeline-with-libraries.spec.ts` (US1)

**Test cases** (User Story 1):
1. `CLI compilation with single library import`
   - Fixture: test-import.eligian + examples/libraries/animations.eligian
   - Expected: Compilation succeeds, JSON contains fadeIn operations
   - Validates: No "Could not resolve reference" errors

2. `CLI compilation with multiple library imports`
   - Fixture: Program importing animations.eligian + transitions.eligian
   - Expected: All actions from both libraries available
   - Validates: Multiple libraries loaded correctly

3. `CLI compilation with aliased import`
   - Fixture: `import { fadeIn as appear } from "./lib.eligian"`
   - Expected: Alias name resolves correctly in action calls
   - Validates: Scope provider alias handling works with loaded libraries

**File**: `packages/language/src/compiler/__tests__/library-loading-errors.spec.ts` (US2)

**Test cases** (User Story 2):
4. `Missing library file error`
   - Fixture: Program importing non-existent `./missing.eligian`
   - Expected: Error message "Library file not found: './missing.eligian'"
   - Validates: FR-008 file not found error handling

5. `Library syntax error`
   - Fixture: broken-library.eligian with syntax error at line 5
   - Expected: Error message with library path, line 5, column X
   - Validates: FR-009 parse error reporting

6. `Invalid library type`
   - Fixture: Program file incorrectly used as library
   - Expected: Error "Expected library file but got program"
   - Validates: Library type validation

**File**: `packages/language/src/compiler/__tests__/nested-libraries.spec.ts` (US3)

**Test cases** (User Story 3):
7. `Nested library dependencies (3 levels)`
   - Fixtures: library-chain/a.eligian → b.eligian → c.eligian
   - Expected: All actions from A, B, C available in main program
   - Validates: FR-010 nested dependency loading

8. `Circular dependency detection (A→B→A)`
   - Fixtures: library-cycle/a.eligian → b.eligian → a.eligian
   - Expected: Error "Circular dependency detected: a.eligian → b.eligian → a.eligian"
   - Validates: Cycle detection algorithm

9. `Deep nesting (10 levels)`
   - Fixtures: Chain of 10 libraries importing each other
   - Expected: All libraries load, compilation completes in <2 seconds
   - Validates: SC-004 performance requirement

**Test isolation** (Constitution Principle II):
- Each integration test in separate file (test environment pollution prevention)
- Unit tests CAN share files (isolated functions, no shared state)

### Coverage Verification (Constitution Principle II)

**MANDATORY after implementation**:
1. Run `pnpm run test:coverage` when feature complete
2. Analyze coverage report for library loading code
3. Verify 80%+ coverage for all business logic
4. If coverage below 80%:
   - **STOP IMMEDIATELY**
   - Document missing coverage with justification
   - Present to user and **WAIT for approval**
   - Only proceed after user grants exception

**No exceptions for**:
- Library loading functions (extractLibraryImports, resolveLibraryPath, loadLibraryFile, parseLibraryDocument)
- Error handling (FileNotFound, ParseError, CircularDependency formatters)
- Cycle detection algorithm (detectCircularDependency, loadLibraryRecursive)

### Performance Testing

**Benchmark**: Compilation time for typical project (1 program + 5 libraries)

**Success criteria**:
- SC-002: <2 seconds compilation time
- SC-004: 10-level nested dependencies without stack overflow

**Measurement**:
- Use `console.time()` / `console.timeEnd()` around library loading
- Run on both Windows and Unix CI environments
- Document results in quickstart.md


## Technical Implementation Details

### Code Insertion Point

**File**: `packages/language/src/compiler/pipeline.ts`
**Location**: After CSS file loading (line ~340), before validation

**Existing code pattern** (CSS loading for reference):
```typescript
// Load CSS files (existing code ~line 320-340)
if (program.cssFiles) {
  for (const cssFile of program.cssFiles) {
    const cssPath = path.resolve(documentDir, cssFile.path);
    const cssContent = readFileSync(cssPath, 'utf-8');
    // ... CSS processing
  }
}

// INSERT LIBRARY LOADING HERE (~line 340-400)

// Validate program (existing code ~line 400)
const validationResult = await validateProgram(document, services);
```

### Library Loading Implementation (Phase 1)

**Pseudocode**:
```typescript
// Extract library imports from program AST
const libraryImports = program.statements
  .filter(isLibraryImport)
  .map(imp => imp.path);

// Deduplicate import paths
const uniquePaths = Array.from(new Set(libraryImports));

// Load each library
for (const importPath of uniquePaths) {
  // Resolve relative path
  const normalizedPath = importPath.startsWith('./') 
    ? importPath.substring(2) 
    : importPath;
  const resolvedPath = path.resolve(documentDir, normalizedPath);
  const libraryUri = URI.file(resolvedPath);

  // Load file content
  const libraryContent = Effect.sync(() => 
    readFileSync(resolvedPath, 'utf-8')
  ).pipe(
    Effect.mapError(err => ({
      _tag: 'FileNotFound' as const,
      path: importPath,
      resolvedPath,
      error: err.message,
      importLocation: /* extract from AST */
    }))
  );

  // Parse into Langium document
  const libraryDoc = services.shared.workspace.LangiumDocumentFactory
    .fromString(libraryContent, libraryUri);

  // Validate it's a Library (not Program)
  if (!isLibrary(libraryDoc.parseResult.value)) {
    return Effect.fail({
      _tag: 'InvalidLibrary' as const,
      path: importPath,
      resolvedPath
    });
  }

  // Add to workspace
  services.shared.workspace.LangiumDocuments.addDocument(libraryDoc);

  // Build library document (link internal cross-references)
  await services.shared.workspace.DocumentBuilder.build([libraryDoc], {
    validation: false
  });
}

// Re-link main document (link library action references)
await services.shared.workspace.DocumentBuilder.build([document], {
  validation: false
});
```

**Key details**:
- Use `Effect.sync()` to wrap file I/O exceptions
- `isLibrary()` type guard from generated AST types
- `validation: false` during build to avoid premature validation
- Main document re-linked AFTER all libraries loaded

### Error Handling Implementation (Phase 2)

**Error type definitions**:
```typescript
type LibraryLoadError =
  | { 
      _tag: 'FileNotFound'; 
      path: string; 
      resolvedPath: string;
      error: string;
      importLocation: SourceLocation;
    }
  | { 
      _tag: 'ParseError'; 
      path: string; 
      libraryLocation: SourceLocation;
      error: string;
    }
  | {
      _tag: 'InvalidLibrary';
      path: string;
      resolvedPath: string;
    }
  | {
      _tag: 'CircularDependency';
      chain: string[];
      importLocation: SourceLocation;
    };
```

**Error formatting** (in error-reporter.ts):
```typescript
function formatLibraryError(error: LibraryLoadError): string {
  switch (error._tag) {
    case 'FileNotFound':
      return `Library file not found: '${error.path}' (imported at ${formatLocation(error.importLocation)})
Resolved to: ${error.resolvedPath}
Error: ${error.error}`;
    
    case 'ParseError':
      return `Library file has parse errors: '${error.path}' (${formatLocation(error.libraryLocation)})
${error.error}`;
    
    case 'InvalidLibrary':
      return `Expected library file but got program: '${error.path}'
Libraries must use 'library' keyword, not 'timeline' or 'action' at top level.`;
    
    case 'CircularDependency':
      const chain = error.chain.join(' → ');
      return `Circular dependency detected: ${chain}
Libraries cannot import each other in a cycle.`;
  }
}
```

### Nested Dependency Implementation (Phase 3)

**Recursive loading with cycle detection**:
```typescript
const loadingStack = new Set<string>();
const loadedDocuments = new Map<string, LangiumDocument>();

function loadLibraryRecursive(
  importPath: string,
  importLocation: SourceLocation,
  documentDir: string
): Effect.Effect<LangiumDocument, LibraryLoadError> {
  const resolvedPath = path.resolve(documentDir, importPath);
  
  // Check for circular dependency
  if (loadingStack.has(resolvedPath)) {
    const chain = Array.from(loadingStack).concat(resolvedPath);
    return Effect.fail({
      _tag: 'CircularDependency',
      chain,
      importLocation
    });
  }
  
  // Check if already loaded (avoid redundant work)
  if (loadedDocuments.has(resolvedPath)) {
    return Effect.succeed(loadedDocuments.get(resolvedPath)!);
  }
  
  // Mark as loading
  loadingStack.add(resolvedPath);
  
  return Effect.gen(function*(_) {
    // Load and parse this library
    const content = yield* _(loadLibraryFile(resolvedPath));
    const doc = yield* _(parseLibraryDocument(content, resolvedPath));
    
    // Recursively load nested libraries
    const library = doc.parseResult.value;
    if (isLibrary(library) && library.imports) {
      const nestedImports = library.imports.filter(isLibraryImport);
      const nestedLibraryDir = path.dirname(resolvedPath);
      
      for (const nestedImport of nestedImports) {
        yield* _(loadLibraryRecursive(
          nestedImport.path,
          nestedImport.$cstNode!.range,
          nestedLibraryDir
        ));
      }
    }
    
    // Build this library's document (after dependencies loaded)
    yield* _(Effect.promise(() => 
      services.shared.workspace.DocumentBuilder.build([doc], {
        validation: false
      })
    ));
    
    // Mark as loaded and remove from loading stack
    loadedDocuments.set(resolvedPath, doc);
    loadingStack.delete(resolvedPath);
    
    return doc;
  });
}
```

**Key details**:
- `loadingStack` tracks currently loading libraries (cycle detection)
- `loadedDocuments` caches loaded libraries (avoid redundant loads)
- Depth-first loading ensures dependencies built before dependents
- Stack cleared after successful load (allows reusing library in different branches)

### Integration with Scope Provider

**No changes required** - Scope provider's `getImportedActions()` already queries workspace:

```typescript
// From eligian-scope-provider.ts:153-154
const documents = this.eligianServices.shared.workspace.LangiumDocuments;
const libraryDoc = documents.getDocument(resolvedUri);
```

**Once library documents are added to workspace via**:
```typescript
services.shared.workspace.LangiumDocuments.addDocument(libraryDoc);
```

**Then scope provider's existing code works automatically** ✅

### Platform Compatibility

**Cross-platform path handling**:
- Use `path.resolve()` for relative path resolution (handles both `/` and `\`)
- Use `path.dirname()` for directory extraction
- Use `URI.file()` from `vscode-uri` for URI conversion (normalizes separators)
- Test on both Windows and Unix CI environments

**File encoding**:
- Always use `'utf-8'` encoding for file reads
- Langium expects UTF-8 encoded source files
- Consistent with existing CLI compiler behavior


## Data Model

**See**: `data-model.md` (generated in Phase 1)

**Key entities**:

1. **Library Document** (Langium Document)
   - URI: File path as Langium URI (`file:///path/to/library.eligian`)
   - Content: Parsed AST (Library node)
   - State: Built (cross-references linked)
   - Relationships: Referenced by main Program document via LibraryImport nodes

2. **Library Import Path** (AST node)
   - Source: LibraryImport.path property
   - Type: Relative file path string (e.g., `"./lib.eligian"`)
   - Resolution: Resolved to absolute path, then Langium URI
   - Validation: Must point to valid .eligian library file

3. **Loading State** (runtime tracking)
   - Loading Stack: Set<string> of currently loading library paths (cycle detection)
   - Loaded Documents: Map<string, LangiumDocument> of completed loads (caching)
   - Lifecycle: Created at pipeline start, discarded after compilation

## Dependencies

### External Dependencies (all already installed ✅)

- **langium** (^4.2.0): Document factory, builder, workspace services
- **vscode-uri** (^3.0.8): URI handling for cross-platform file paths
- **effect** (^3.15.2): Error handling and Effect pipeline composition
- **node:fs** (built-in): File system operations (readFileSync)
- **node:path** (built-in): Path resolution and normalization

**No new dependencies required** ✅

### Internal Dependencies

- **Feature 023** (library-files-with): Grammar, scope provider, validator
  - Grammar: `import { action } from "path"` syntax
  - Scope provider: `getImportedActions()`, `getScopeForActionImport()`
  - Validator: Private action filtering, duplicate import checks

- **Compiler Pipeline** (packages/language/src/compiler/pipeline.ts):
  - Effect-based error handling
  - CSS loading pattern (reference implementation)
  - Document building infrastructure

- **Generated AST** (packages/language/src/generated/ast.ts):
  - `LibraryImport` type definition
  - `isLibrary()`, `isLibraryImport()` type guards
  - AST node structure

**All prerequisites met** ✅

## Risks and Mitigations

### Risk 1: Scope provider may have undiscovered bugs

**Likelihood**: Low (tested in VS Code extension)  
**Impact**: High (breaks all library imports)  
**Mitigation**:
- Review scope provider code during implementation
- Add integration test verifying library actions are accessible
- If bugs found, fix separately from this feature (maintain single responsibility)

### Risk 2: Windows/Unix path separator differences

**Likelihood**: Low (using `path` module)  
**Impact**: Medium (CLI fails on one platform)  
**Mitigation**:
- Use `path.resolve()` and `path.normalize()` consistently
- Use `URI.file()` for Langium URIs (normalizes separators)
- Test on both Windows and Unix CI environments
- Integration tests use platform-agnostic path separators

### Risk 3: Very large library files cause performance issues

**Likelihood**: Very low (libraries typically <10KB)  
**Impact**: Low (edge case outside success criteria)  
**Mitigation**:
- Document recommended library size limit (<100KB) in quickstart.md
- If issue arises in production, can optimize parsing or add streaming
- Not a blocker for User Story 1 (meets <2s performance requirement)

### Risk 4: Langium workspace has document limit

**Likelihood**: Very low (workspace handles hundreds of documents in VS Code)  
**Impact**: Medium (limits nested dependency depth)  
**Mitigation**:
- Success criteria only requires 10-level nesting (well within limits)
- If limit hit, document as constraint in quickstart.md
- Typical usage is 1-5 libraries per program (far below any limits)

## Success Criteria Verification

### SC-001: CLI compiler successfully compiles programs with library imports

**Verification**:
- Integration test: `pipeline-with-libraries.spec.ts` - test case 1
- Fixture: `test-import.eligian` + `examples/libraries/animations.eligian`
- Expected: Compilation succeeds, no "Could not resolve reference" errors
- Actual: Run `node packages/cli/out/index.js test-import.eligian`

### SC-002: Compilation completes in <2 seconds (1 program + 5 libraries)

**Verification**:
- Performance test: `quickstart.md` includes timing measurements
- Fixture: Create test program importing 5 libraries
- Expected: Total compilation time <2 seconds
- Actual: Measure with `console.time()` / `console.timeEnd()`

### SC-003: Error messages include file path and location

**Verification**:
- Integration test: `library-loading-errors.spec.ts` - test cases 4-6
- Fixture: Programs with missing libraries, syntax errors
- Expected: Error messages include file path and import location
- Actual: Assert error message format matches specification

### SC-004: Nested dependencies (10 levels) work without stack overflow

**Verification**:
- Integration test: `nested-libraries.spec.ts` - test case 9
- Fixture: Chain of 10 libraries importing each other
- Expected: All libraries load, no stack overflow, <2 seconds
- Actual: Run CLI compiler on deep nesting fixture

## Code Quality Requirements (Constitution Principle XI)

**Biome Integration**:
- Run `pnpm run check` after each code change
- Fix all linting errors and warnings
- Ensure 0 errors before committing
- Run `pnpm run test` to verify no breakage

**Workflow**:
1. Write tests (RED phase)
2. Implement minimum code (GREEN phase)
3. Run `pnpm run check` (fix formatting/linting)
4. Run `pnpm run test` (verify tests pass)
5. Refactor (REFACTOR phase)
6. Run `pnpm run check` again
7. Commit (tests + implementation together)

## Completion Checklist

**Phase 0: Research** ✅
- [x] research.md created with all technical decisions
- [x] All "NEEDS CLARIFICATION" items resolved
- [x] Performance analysis completed
- [x] Test strategy defined

**Phase 1: Design & Documentation** (this phase)
- [ ] data-model.md generated (entity definitions)
- [ ] quickstart.md generated (usage guide with examples)
- [ ] contracts/ created (N/A for internal compiler feature)
- [ ] Agent context updated (run update-agent-context.ps1)
- [ ] Constitution Check re-verified post-design

**Phase 2: Implementation** (NOT part of /speckit.plan)
- [ ] See tasks.md (generated by /speckit.tasks command)

**Phase 3: Validation** (NOT part of /speckit.plan)
- [ ] All tests passing (unit + integration)
- [ ] 80%+ test coverage achieved
- [ ] Biome checks passing (0 errors, 0 warnings)
- [ ] Performance criteria met (SC-002, SC-004)
- [ ] Success criteria verified (SC-001 through SC-004)
- [ ] Technical overview updated if needed (Constitution Principle XXVI)

## Next Steps

After this plan is complete:
1. Generate `data-model.md` (Phase 1 continuation)
2. Generate `quickstart.md` (Phase 1 continuation)
3. Run `/speckit.tasks` to generate task breakdown
4. Begin implementation following test-first development workflow

