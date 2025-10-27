# Data Model: HTML Variables

**Feature**: HTML Variables
**Date**: 2025-10-27
**Purpose**: Define entities, relationships, and state for HTML import feature

---

## Entity Definitions

### 1. HTMLImport (AST Node)

Represents an HTML file import declaration in the Eligian DSL.

**Fields**:
- `name: string` - Variable name (identifier) used to reference the HTML content
- `path: string` - File path (relative to source file) of the HTML file to import
- `$cstNode: CstNode` - Concrete syntax tree node (Langium metadata for error reporting)

**Example**:
```eligian
import header from './snippets/header.html'
//     ^^^^^^       ^^^^^^^^^^^^^^^^^^^^^^^
//      name                path
```

**Validation Rules**:
- `name` must be unique across all HTML imports in the program (no duplicates)
- `name` must not conflict with reserved keywords or existing variables
- `path` must be a valid file path (non-empty string)
- `path` must use forward slashes (Langium normalizes)

**Relationships**:
- Belongs to: `Program` (program-level declaration)
- References: File system (HTML file at specified path)

**State Transitions**:
1. **Parsed** - AST node created by Langium parser
2. **Validated** - Path exists, no duplicates, security checks passed
3. **Loaded** - HTML content read from file system
4. **Registered** - Variable added to compilation scope
5. **Compiled** - HTML content embedded in output configuration

---

### 2. HTMLVariable (Compilation Scope)

Represents an HTML variable in the compilation scope after loading and validation.

**Fields**:
- `name: string` - Variable name (matches HTMLImport.name)
- `type: 'string'` - Type is always string (HTML content)
- `value: string` - HTML file content as string
- `mutable: false` - HTML variables are always immutable
- `scope: 'program'` - HTML imports are program-level (global)
- `sourceLocation: SourceLocation` - Location in source file (for error reporting)

**Example**:
```typescript
const headerVariable: HTMLVariable = {
  name: 'header',
  type: 'string',
  value: '<div class="header">...</div>',
  mutable: false,
  scope: 'program',
  sourceLocation: { line: 1, column: 8 }
};
```

**Validation Rules**:
- `name` must match HTMLImport.name
- `value` must be non-empty (empty HTML files could be valid, but warn)
- `value` must not exceed 1MB (performance constraint)
- `type` is always 'string' (no type conversion)

**Relationships**:
- Created from: `HTMLImport` (after file loading)
- Used by: `VariableReference` (when `@variableName` is encountered)
- Embedded in: Eligius configuration operations

**State Transitions**:
1. **Created** - Variable object instantiated after HTML loading
2. **Referenced** - Variable used in operation (e.g., `setElementContent(@header)`)
3. **Embedded** - Variable value compiled into operation parameter

---

### 3. HTMLLoadError (Error Type)

Represents errors that occur during HTML file loading.

**Variants**:

**FileNotFound**:
```typescript
{
  _tag: 'FileNotFound';
  path: string;          // Path that was not found
  sourceLocation: SourceLocation;  // Where import was declared
}
```

**PermissionDenied**:
```typescript
{
  _tag: 'PermissionDenied';
  path: string;          // Path that is unreadable
  sourceLocation: SourceLocation;
}
```

**ReadError**:
```typescript
{
  _tag: 'ReadError';
  path: string;          // Path that failed to read
  cause: Error;          // Underlying error
  sourceLocation: SourceLocation;
}
```

**Usage**:
```typescript
// Effect-ts error handling
const loadResult: Effect.Effect<string, HTMLLoadError> = loadHTML(path);
```

**Error Messages**:
- `FileNotFound`: `"HTML file not found: './snippet.html'"`
- `PermissionDenied`: `"Cannot read HTML file (permission denied): './snippet.html'"`
- `ReadError`: `"Failed to read HTML file: './snippet.html' (cause: [error details])"`

---

### 4. PathSecurityError (Error Type)

Represents security violations when HTML import paths escape project directory.

**Fields**:
```typescript
{
  _tag: 'PathSecurityError';
  path: string;          // The violating path
  resolvedPath: string;  // The absolute path after resolution
  projectRoot: string;   // The project root directory
  sourceLocation: SourceLocation;  // Where import was declared
}
```

**Example**:
```typescript
{
  _tag: 'PathSecurityError',
  path: '../../../etc/passwd',
  resolvedPath: '/etc/passwd',
  projectRoot: '/home/user/project',
  sourceLocation: { line: 5, column: 15 }
}
```

**Error Message**:
```
HTML imports must be within project directory
  Import path: '../../../etc/passwd'
  Resolves to: '/etc/passwd'
  Project root: '/home/user/project'
```

---

### 5. DuplicateHTMLVariableError (Validation Error)

Represents duplicate HTML import variable names.

**Fields**:
```typescript
{
  code: 'DUPLICATE_HTML_VARIABLE';
  variableName: string;       // The duplicate name
  firstLocation: SourceLocation;   // First declaration
  duplicateLocation: SourceLocation;  // Duplicate declaration
}
```

**Example**:
```typescript
{
  code: 'DUPLICATE_HTML_VARIABLE',
  variableName: 'header',
  firstLocation: { line: 3, column: 8 },
  duplicateLocation: { line: 12, column: 8 }
}
```

**Error Message**:
```
Variable '@header' is already defined (first defined at line 3)
```

---

## Entity Relationships

```
Program
  ├─ htmlImports: HTMLImport[]          // 0..* HTML imports
  │    └─ name: string
  │    └─ path: string
  │
  └─ variables: Map<string, HTMLVariable>  // Compilation scope
       ├─ [name]: HTMLVariable            // Program-level HTML variables
       └─ ...

HTMLImport (AST)
  ├─ PARSING → HTMLVariable (Scope)
  │   └─ File loading + validation
  │
  ├─ VALIDATION ERRORS:
  │   ├─ DuplicateHTMLVariableError (duplicate name)
  │   ├─ HTMLLoadError (file not found, permission, read failure)
  │   └─ PathSecurityError (path escapes project)
  │
  └─ COMPILATION → Eligius Operation Parameter
      └─ HTML content embedded as string

VariableReference (@variableName)
  ├─ RESOLUTION → HTMLVariable
  │   └─ Lookup in compilation scope
  │
  └─ COMPILATION → Operation Parameter Value
      └─ Variable value embedded in operation
```

---

## Data Flow

### 1. Parsing Phase

```
Source Code → Langium Parser → AST
  import header from './header.html'
    ↓
  HTMLImport {
    name: 'header',
    path: './header.html',
    $cstNode: ...
  }
```

**Output**: AST with HTMLImport nodes

---

### 2. Validation Phase

```
HTMLImport → Validator → Errors | ✓

Checks:
1. Duplicate name check
   - Query existing variables
   - If duplicate → DuplicateHTMLVariableError

2. Path resolution
   - Resolve relative to source file
   - Normalize path separators

3. Security validation
   - path.relative(projectRoot, resolvedPath)
   - If starts with '..' → PathSecurityError

4. File existence
   - fs.promises.access(path, fs.constants.R_OK)
   - If fails → HTMLLoadError (FileNotFound | PermissionDenied)
```

**Output**: Validation errors OR validated HTMLImports

---

### 3. Loading Phase

```
Validated HTMLImport → HTMLLoader → HTMLVariable

1. Read file content
   - fs.promises.readFile(path, 'utf-8')
   - Effect error handling

2. Validate size
   - If content.length > 1MB → Warning

3. Create HTMLVariable
   HTMLVariable {
     name: import.name,
     type: 'string',
     value: fileContent,
     mutable: false,
     scope: 'program',
     sourceLocation: import.$cstNode.range.start
   }

4. Register in scope
   - variables.set(name, htmlVariable)
```

**Output**: HTMLVariable registered in compilation scope

---

### 4. Compilation Phase

```
VariableReference (@header) → Variable Resolution → Embedded Value

1. Resolve variable
   - variables.get(reference.name)
   - If not found → UnknownVariableError

2. Extract value
   - htmlVariable.value (HTML string)

3. Embed in operation
   {
     "systemName": "setElementContent",
     "operationData": {
       "content": "<div>HTML content</div>"  // Value embedded
     }
   }
```

**Output**: Eligius configuration with embedded HTML strings

---

## State Transitions

### HTMLImport Lifecycle

```
[Declared] → [Parsed] → [Validated] → [Loaded] → [Registered] → [Compiled]
    ↓           ↓           ↓            ↓            ↓             ↓
  Source    AST Node   Path OK,     HTML read   Variable in   Value in
   Code               no dups                     scope         JSON
```

**Transition Details**:

1. **Declared → Parsed**:
   - Trigger: Langium parser processes source
   - Condition: Grammar matches `import ID 'from' STRING`
   - Result: HTMLImport AST node created

2. **Parsed → Validated**:
   - Trigger: Validation phase runs
   - Condition: No duplicates, path valid, file exists, security checks pass
   - Result: HTMLImport marked valid

3. **Validated → Loaded**:
   - Trigger: Compilation phase begins
   - Condition: File readable, content < 1MB
   - Result: HTML content loaded into memory

4. **Loaded → Registered**:
   - Trigger: Variable registration phase
   - Condition: Variable name available in scope
   - Result: HTMLVariable in compilation scope

5. **Registered → Compiled**:
   - Trigger: Variable reference encountered (`@header`)
   - Condition: Variable exists, operation accepts string parameter
   - Result: HTML value embedded in operation parameter

**Error Exit Points**:
- Parsed → ERROR: Duplicate name (validation)
- Parsed → ERROR: Path security violation (validation)
- Validated → ERROR: File not found (loading)
- Validated → ERROR: Permission denied (loading)
- Registered → ERROR: Unknown variable (compilation)

---

## Validation Rules Summary

### HTMLImport Validation

| Rule | Description | Error Code | Severity |
|------|-------------|------------|----------|
| Unique name | Variable name must be unique | `DUPLICATE_HTML_VARIABLE` | Error |
| Valid path | Path must be non-empty string | `INVALID_PATH` | Error |
| Path security | Path must not escape project | `PATH_SECURITY_VIOLATION` | Error |
| File exists | File must exist at path | `FILE_NOT_FOUND` | Error |
| File readable | File must be readable | `PERMISSION_DENIED` | Error |
| Size limit | File size < 1MB | `HTML_FILE_TOO_LARGE` | Warning |

### HTMLVariable Validation

| Rule | Description | Error Code | Severity |
|------|-------------|------------|----------|
| Name matches import | Variable name must match HTMLImport | `INTERNAL_ERROR` | Error |
| Non-empty content | HTML content should not be empty | `EMPTY_HTML_FILE` | Warning |
| String type | Type must be 'string' | `INTERNAL_ERROR` | Error |
| Immutable | HTML variables are always immutable | `INTERNAL_ERROR` | Error |

### VariableReference Validation

| Rule | Description | Error Code | Severity |
|------|-------------|------------|----------|
| Variable exists | Referenced variable must exist | `UNKNOWN_VARIABLE` | Error |
| Not 'layout' | Cannot reference 'layout' as variable | `INVALID_LAYOUT_REFERENCE` | Error |

---

## Performance Characteristics

### File Loading
- **Small files (<10KB)**: <10ms per file
- **Medium files (10-100KB)**: <50ms per file
- **Large files (100KB-1MB)**: <200ms per file
- **Max file size**: 1MB (warning threshold)

### Memory Usage
- **Per HTMLVariable**: ~2x file size (string storage + object overhead)
- **10 imports × 50KB each**: ~1MB memory
- **Typical project**: <5MB total HTML content

### Compilation Impact
- **Target**: <10% compilation time increase
- **Baseline**: ~100ms for typical Eligian file
- **With HTML imports**: ~110ms (10 files × 1ms overhead)

---

## Example Data Flow

**Input DSL** (`timeline.eligian`):
```eligian
import header from './header.html'
import footer from './footer.html'

layout "./app.html"

timeline "Demo" at 0s {
  at 0s selectElement("#container") {
    setElementContent(@header)
  }
  at 2s selectElement("#footer") {
    setElementContent(@footer)
  }
}
```

**AST** (after parsing):
```typescript
Program {
  htmlImports: [
    HTMLImport { name: 'header', path: './header.html' },
    HTMLImport { name: 'footer', path: './footer.html' }
  ],
  layout: LayoutDeclaration { path: './app.html' },
  timelines: [...]
}
```

**Compilation Scope** (after loading):
```typescript
variables: Map {
  'header' => HTMLVariable {
    name: 'header',
    type: 'string',
    value: '<div class="header">...</div>',
    mutable: false,
    scope: 'program'
  },
  'footer' => HTMLVariable {
    name: 'footer',
    type: 'string',
    value: '<footer>...</footer>',
    mutable: false,
    scope: 'program'
  }
}
```

**Output JSON** (simplified):
```json
{
  "layoutTemplate": "<html>...</html>",
  "timelines": [{
    "operations": [
      {
        "systemName": "setElementContent",
        "operationData": {
          "content": "<div class=\"header\">...</div>"
        }
      },
      {
        "systemName": "setElementContent",
        "operationData": {
          "content": "<footer>...</footer>"
        }
      }
    ]
  }]
}
```

---

## Next Steps

Data model complete. Proceed to:
1. **contracts/** - Define API contracts for HTMLLoader and PathResolver services
2. **quickstart.md** - Developer guide for implementing HTML imports
