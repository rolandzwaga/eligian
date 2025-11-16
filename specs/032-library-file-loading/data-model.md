# Library File Loading Data Model

This document describes the key entities that comprise the library file loading system in the Eligian compiler. These entities work together to enable modular DSL programs with reusable custom actions across multiple library files.

## Overview

The library loading system manages:
- **Parsing**: Reading and parsing `.eligian` library files into AST
- **Resolution**: Converting relative import paths to absolute filesystem paths
- **Validation**: Ensuring imported libraries exist and are syntactically valid
- **Deduplication**: Tracking loaded libraries to avoid redundant loading
- **Cycle Detection**: Detecting and preventing circular library dependencies

## Entity: Library Document

### Purpose
Represents a parsed `.eligian` library file integrated into the Langium workspace. This is the primary entity for tracking library state throughout the compilation lifecycle.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `uri` | `string` (Langium URI) | Unique identifier for the library document in the Langium workspace. Format: `file:///absolute/path/to/library.eligian` |
| `parseResult` | `Library` (AST node) | The root Langium AST node for the parsed library file. Contains `ActionDefinition` nodes and metadata. |
| `state` | `"built" \| "not_built"` | Lifecycle state indicating whether cross-references have been resolved (built) or not yet built (pending). |
| `filePath` | `string` (absolute) | Absolute filesystem path to the library file. Used for relative path resolution of nested imports. |
| `lastModified` | `number` (timestamp) | Unix timestamp of last file modification, used for cache invalidation. |

### Relationships

**Referenced By**:
- Program documents via `LibraryImport` statements that specify the library path
- Compiler's `LibraryRegistry` for efficient lookup and caching

**References**:
- Other Library documents via its own `LibraryImport` statements (enables transitive imports)
- `ActionDefinition` AST nodes within its `parseResult`

### Lifecycle

1. **Creation**: During compilation, when Langium encounters a `LibraryImport` statement
2. **Parsing**: If not already cached, the file is read and parsed into AST via Langium's document builder
3. **Registration**: Added to Langium workspace and compiler's library registry
4. **Building**: Cross-references are resolved when `state` transitions to "built"
5. **Querying**: Scope provider and validator query the library document to resolve imported action names
6. **Cleanup**: Optionally cached or discarded after compilation phase completes

### Notes

- Library documents are **immutable after building** - reparsing creates a new document with a different URI
- Multiple programs can reference the same library document (shared AST)
- Caching must account for file modification time to detect stale libraries

---

## Entity: Library Import Path

### Purpose
Represents the relative file path specified in an import statement. This entity bridges the gap between the logical import syntax and the physical filesystem location.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Raw relative path from import statement (e.g., `"./animations.eligian"`, `"../shared/common.eligian"`). Includes file extension. |
| `sourceLocation` | `{ uri: string, line: number, column: number }` | Location of the import statement in the source program file. Used for error reporting if resolution fails. |
| `importingDocumentUri` | `string` (Langium URI) | URI of the program file containing this import statement. Used as the base for relative path resolution. |

### Validation Rules

| Rule | Condition | Error Message |
|------|-----------|---------------|
| **File Exists** | Resolved absolute path exists on filesystem | `Cannot resolve library: "./missing.eligian" (file not found)` |
| **Is Valid Library** | File parses as valid `.eligian` library without syntax errors | `Invalid library file: "./broken.eligian" (parse error at line 5)` |
| **No Circular Dependencies** | Import doesn't create circular dependency chain | `Circular dependency detected: program.eligian → lib-a.eligian → lib-b.eligian → lib-a.eligian` |
| **Correct File Type** | File extension is `.eligian` (no `.ts`, `.js`, etc.) | `Invalid import: "./styles.css" (expected .eligian file)` |

### Resolution Process

1. **Normalization**: Remove redundant `./` prefix (if present)
   - `"./animations.eligian"` → `"animations.eligian"`
   - `"../shared/common.eligian"` → `"../shared/common.eligian"` (unchanged)

2. **Resolution to Absolute Path**: Resolve relative to importing document's directory
   - If importing program is `/home/user/project/src/main.eligian`
   - And import path is `"../lib/animations.eligian"`
   - Then absolute path is `/home/user/project/lib/animations.eligian`

3. **Conversion to Langium URI**: Convert filesystem path to Langium workspace URI
   - `/home/user/project/lib/animations.eligian` → `file:///home/user/project/lib/animations.eligian`

4. **Lookup**: Query Langium workspace for document at that URI

### Notes

- Paths are **case-sensitive** on Unix-like systems, case-insensitive on Windows
- Symlinks should be resolved to canonical paths to detect circular dependencies correctly
- Import paths are **relative only** - absolute paths and Node-style module paths (e.g., `"@lib/animations"`) are not supported in Phase 1

---

## Entity: Loading State (Runtime)

### Purpose
Manages transient state during the library loading phase of compilation. This entity ensures efficient library loading, prevents redundant parsing, and detects circular dependencies.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `loadingStack` | `Set<string>` (Langium URIs) | Stack of libraries currently being loaded. Used for cycle detection. When loading `lib-a.eligian`, the stack contains `file:///path/to/lib-a.eligian`. |
| `loadedDocuments` | `Map<string, Document>` (URI → Document) | Cache of already-loaded library documents. Prevents redundant parsing of the same library. Key is Langium URI, value is parsed Library document. |
| `loadingErrors` | `Map<string, Error>` (URI → Error) | Mapping of libraries that failed to load with their error messages. Used for error reporting. |
| `startTime` | `number` (timestamp) | Unix timestamp when loading phase began. Used for debugging and performance measurement. |

### Purpose and Behavior

**Deduplication**: If a library is already in `loadedDocuments`, return the cached document instead of re-parsing.

```
Program A imports lib-a.eligian
Program B also imports lib-a.eligian
→ lib-a.eligian is parsed once, cached, and reused
```

**Cycle Detection**: Before loading a library, check if it's in `loadingStack`. If present, a cycle is detected.

```
Program imports lib-a.eligian
lib-a.eligian imports lib-b.eligian
lib-b.eligian imports lib-a.eligian
→ When loading lib-a.eligian the second time, it's already in loadingStack
→ Error: "Circular dependency detected"
```

**Load Ordering**: The stack naturally encodes the load order, enabling better error messages.

```
loadingStack: [file:///main.eligian, file:///lib-a.eligian, file:///lib-b.eligian]
→ Error: "Circular dependency: main → lib-a → lib-b → (attempting to load lib-a again)"
```

### Lifecycle

1. **Initialization**: Created when compilation begins (before library resolution)
   ```typescript
   const loadingState = {
     loadingStack: new Set(),
     loadedDocuments: new Map(),
     loadingErrors: new Map(),
     startTime: Date.now()
   }
   ```

2. **Usage**: During library loading phase, libraries are recursively loaded and tracked
   ```typescript
   // Starting to load a library
   loadingState.loadingStack.add(libraryUri)

   // Finished loading
   loadingState.loadedDocuments.set(libraryUri, document)
   loadingState.loadingStack.delete(libraryUri)
   ```

3. **Cleanup**: Discarded after all libraries are loaded and cross-references are resolved
   ```typescript
   // End of library loading phase
   loadingState = null
   // Now using LibraryRegistry for subsequent queries
   ```

### Notes

- This state is **ephemeral** - it only exists during the library loading phase
- After loading completes, queries use the permanent `LibraryRegistry` instead
- The `loadingStack` should be represented as an array or linked list in implementation for better error messages showing the full dependency chain
- All libraries must be in either `loadedDocuments` or `loadingErrors` by end of loading phase (no partial state)

---

## Entity: Library Import Statement (AST)

### Purpose
Represents the parsed `import` statement in the Eligian DSL grammar. This is the abstract syntax tree node that the parser creates from source code like `import { fadeIn, slideOut } from "./animations.eligian"`.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"LibraryImport"` | Discriminant for AST node type. Always `"LibraryImport"`. |
| `path` | `string` | Relative file path extracted from the import statement. Example: `"./animations.eligian"`. This is the raw string from source without normalization. |
| `actions` | `ActionImport[]` | Array of imported action specifiers. Each element specifies which actions to import from the library. |
| `sourceLocation` | `{ uri: string, startLine: number, startColumn: number, endLine: number, endColumn: number }` | Source location range of the import statement in the program file. Used for error reporting and navigation. |

### Sub-Entity: ActionImport

Each element in the `actions` array has this structure:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Name of the action being imported (e.g., `"fadeIn"`). Must match an `ActionDefinition` in the imported library. |
| `sourceLocation` | `{ uri: string, startLine: number, startColumn: number, endLine: number, endColumn: number }` | Source location of the specific action name in the import list. |

### Generated From Grammar

The Langium grammar defines:

```langium
LibraryImport:
  'import' '{' actions+=ActionImport (',' actions+=ActionImport)* '}' 'from' path=STRING
;

ActionImport:
  name=ID
;
```

From source code like:
```eligian
import { fadeIn, slideOut, fadeOut } from "./animations.eligian"
```

Langium generates:
```typescript
{
  type: "LibraryImport",
  path: "./animations.eligian",
  actions: [
    { name: "fadeIn", sourceLocation: { ... } },
    { name: "slideOut", sourceLocation: { ... } },
    { name: "fadeOut", sourceLocation: { ... } }
  ],
  sourceLocation: { uri: "file:///path/to/main.eligian", ... }
}
```

### Relationships

**Parent**: Contained within a `Program` AST node's `statements` array

**Children**:
- Multiple `ActionImport` nodes specifying which actions to import
- Reference to the imported `Library` document (resolved during building phase)

**References**:
- The `Library` document at the resolved path (cross-reference)
- `ActionDefinition` nodes within that library (for each action in `actions`)

### Validation Rules

| Rule | Condition | Error Message |
|-------|-----------|---------------|
| **No Duplicate Imports** | Same action not imported twice from same library | `Duplicate import: 'fadeIn' already imported from "./animations.eligian"` |
| **Action Exists** | Imported action name must be defined in the library | `Unknown action: 'fadeIn' not exported from "./animations.eligian"` |
| **Valid Library Path** | Path must resolve to valid library file | `Cannot resolve library: "./missing.eligian"` |

### Notes

- The `path` field contains the raw string from source, including quotes and escape sequences
- The compiler must normalize and resolve the path using `LibraryImportPath` logic
- Multiple actions can be imported from the same library in a single statement (not multiple imports of the same library)
- Import statements must appear at the top level of a program (in `statements` array)
- The order of import statements does not matter (libraries are resolved transitively)

---

## Data Model Relationships

```
Program
  ├─ statements[]
      ├─ LibraryImport (AST node)
      │   ├─ path: string
      │   ├─ actions[]: ActionImport
      │   │   └─ name: string
      │   └─ sourceLocation
      │
      └─ ... (ActionDefinition, Timeline, etc.)

LibraryImportPath (validation artifact)
  ├─ path: string (from LibraryImport)
  ├─ sourceLocation (from LibraryImport)
  ├─ importingDocumentUri: string
  ├─ resolvedAbsolutePath: string
  └─ resolvedUri: string (Langium URI)

Library Document (Langium workspace)
  ├─ uri: string
  ├─ parseResult: Library (AST)
  │   └─ statements[]
  │       ├─ LibraryImport
  │       └─ ActionDefinition
  ├─ state: "built" | "not_built"
  ├─ filePath: string
  └─ lastModified: number

Loading State (runtime, during compilation)
  ├─ loadingStack: Set<string>
  ├─ loadedDocuments: Map<string, Document>
  ├─ loadingErrors: Map<string, Error>
  └─ startTime: number
```

## Summary

| Entity | Scope | Lifetime | Purpose |
|--------|-------|----------|---------|
| **Library Document** | Workspace | Full compilation + caching | Parsed AST of library file, source of action definitions |
| **Library Import Path** | Per-statement | During resolution | Bridges import syntax to filesystem location, enables validation |
| **Loading State** | Global (compilation) | Library loading phase only | Efficient loading with cycle detection and deduplication |
| **Library Import Statement** | AST node | Full compilation | Grammar-generated AST representing the import syntax |

This data model provides a solid foundation for implementing modular library loading while maintaining type safety, error reporting, and performance.
