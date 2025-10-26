# Data Model: CSS Class and Selector Validation

**Created**: 2025-10-26
**Feature**: Spec 1 - Validation Infrastructure
**Purpose**: Define all data structures for CSS validation system

---

## Overview

This document defines the core data structures used throughout the CSS validation system. These entities represent parsed CSS metadata, selector components, validation errors, and registry state.

---

## Core Entities

### 1. CSSMetadata

**Purpose**: Represents all parsed information from a single CSS file.

**Properties**:

```typescript
interface CSSMetadata {
  /**
   * All class names defined in the CSS file (e.g., "button", "primary")
   * - Extracted from selectors like `.button`, `.primary`, `.button.primary`
   * - De-duplicated (each class appears once)
   */
  classes: Set<string>;

  /**
   * All ID names defined in the CSS file (e.g., "header", "main")
   * - Extracted from selectors like `#header`, `#main`
   * - De-duplicated (each ID appears once)
   */
  ids: Set<string>;

  /**
   * Source location of each class definition
   * - Maps class name → first definition location in CSS file
   * - Used for "Go to Definition" (Spec 2) and error reporting
   */
  classLocations: Map<string, SourceLocation>;

  /**
   * Source location of each ID definition
   * - Maps ID name → first definition location in CSS file
   */
  idLocations: Map<string, SourceLocation>;

  /**
   * CSS rule text for each class
   * - Maps class name → full CSS rule (e.g., ".button { color: blue; }")
   * - Used for hover previews (Spec 2)
   * - If class appears in multiple rules, stores first occurrence
   */
  classRules: Map<string, string>;

  /**
   * CSS rule text for each ID
   * - Maps ID name → full CSS rule (e.g., "#header { width: 100%; }")
   */
  idRules: Map<string, string>;

  /**
   * Parse errors encountered in the CSS file
   * - Empty array if CSS is valid
   * - Non-empty if CSS has syntax errors
   */
  errors: CSSParseError[];
}
```

**Invariants**:
- `classes.size === classLocations.size === classRules.size` (all classes have locations and rules)
- `ids.size === idLocations.size === idRules.size` (all IDs have locations and rules)
- If `errors.length > 0`, other fields may be incomplete (partial parse)

**Example**:

```css
/* styles.css */
.button {
  color: blue;
  padding: 10px;
}

.button.primary {
  background: green;
}

#header {
  width: 100%;
}
```

```typescript
const metadata: CSSMetadata = {
  classes: new Set(['button', 'primary']),
  ids: new Set(['header']),
  classLocations: new Map([
    ['button', { filePath: 'styles.css', startLine: 1, startColumn: 1, endLine: 1, endColumn: 7 }],
    ['primary', { filePath: 'styles.css', startLine: 6, startColumn: 9, endLine: 6, endColumn: 16 }],
  ]),
  idLocations: new Map([
    ['header', { filePath: 'styles.css', startLine: 10, startColumn: 1, endLine: 10, endColumn: 7 }],
  ]),
  classRules: new Map([
    ['button', '.button {\n  color: blue;\n  padding: 10px;\n}'],
    ['primary', '.button.primary {\n  background: green;\n}'],
  ]),
  idRules: new Map([
    ['header', '#header {\n  width: 100%;\n}'],
  ]),
  errors: [],
};
```

---

### 2. SourceLocation

**Purpose**: Represents a location in a source file (CSS or Eligian).

**Properties**:

```typescript
interface SourceLocation {
  /**
   * Absolute file path or URI
   * - Example: "file:///f:/projects/eligius/eligian/styles/main.css"
   */
  filePath: string;

  /**
   * Starting line number (1-based)
   * - Line 1 = first line of file
   */
  startLine: number;

  /**
   * Starting column number (1-based)
   * - Column 1 = first character of line
   */
  startColumn: number;

  /**
   * Ending line number (1-based)
   */
  endLine: number;

  /**
   * Ending column number (1-based)
   */
  endColumn: number;
}
```

**Invariants**:
- `startLine >= 1`
- `startColumn >= 1`
- `endLine >= startLine`
- If `endLine === startLine`, then `endColumn >= startColumn`

**Example**:

```css
.button { color: blue; }
```

Location of `.button` selector:
```typescript
{
  filePath: 'styles.css',
  startLine: 1,
  startColumn: 1,   // Start of '.'
  endLine: 1,
  endColumn: 7      // End of 'button'
}
```

---

### 3. CSSParseError

**Purpose**: Represents a CSS syntax error encountered during parsing.

**Properties**:

```typescript
interface CSSParseError {
  /**
   * Human-readable error message
   * - Example: "Unclosed block"
   * - Example: "Unexpected '}' found"
   */
  message: string;

  /**
   * CSS file path where error occurred
   */
  filePath: string;

  /**
   * Line number where error occurred (1-based)
   */
  line: number;

  /**
   * Column number where error occurred (1-based)
   */
  column: number;

  /**
   * Optional: CSS source snippet showing the error context
   * - Formatted with line numbers and error indicator (^)
   * - Example:
   *   "> 3 | .button {"
   *   "    |         ^"
   */
  source?: string;
}
```

**Example**:

```css
/* Invalid CSS */
.button {
  color: blue
  /* Missing semicolon */
}
```

```typescript
const error: CSSParseError = {
  message: "Missed semicolon",
  filePath: "styles.css",
  line: 3,
  column: 14,
  source: "> 3 |   color: blue\n    |              ^",
};
```

---

### 4. ParsedSelector

**Purpose**: Represents a parsed CSS selector string with extracted classes and IDs.

**Properties**:

```typescript
interface ParsedSelector {
  /**
   * All class names found in the selector
   * - Array preserves order (left-to-right in selector)
   * - May contain duplicates if class appears multiple times
   * - Example: ".button.primary > .button" → ['button', 'primary', 'button']
   */
  classes: string[];

  /**
   * All ID names found in the selector
   * - Array preserves order
   * - May contain duplicates
   */
  ids: string[];

  /**
   * Whether the selector syntax is valid
   * - true: Selector parsed successfully
   * - false: Selector has syntax errors
   */
  valid: boolean;

  /**
   * Error message (if invalid)
   * - undefined if valid === true
   * - String error message if valid === false
   * - Example: "Unexpected '[' found"
   */
  error?: string;
}
```

**Invariants**:
- If `valid === true`, then `error === undefined`
- If `valid === false`, then `error !== undefined && classes.length === 0 && ids.length === 0`

**Examples**:

**Valid selector with classes**:
```typescript
parseSelector('.button.primary')
// Result:
{
  classes: ['button', 'primary'],
  ids: [],
  valid: true,
  error: undefined,
}
```

**Valid selector with classes and IDs**:
```typescript
parseSelector('#header.active > .menu.open')
// Result:
{
  classes: ['active', 'menu', 'open'],
  ids: ['header'],
  valid: true,
  error: undefined,
}
```

**Valid selector with pseudo-classes (ignored)**:
```typescript
parseSelector('.button:hover::before')
// Result:
{
  classes: ['button'],
  ids: [],
  valid: true,
  error: undefined,
}
```

**Invalid selector syntax**:
```typescript
parseSelector('.button[')
// Result:
{
  classes: [],
  ids: [],
  valid: false,
  error: "Unexpected '[' found",
}
```

**Empty selector**:
```typescript
parseSelector('')
// Result:
{
  classes: [],
  ids: [],
  valid: true,
  error: undefined,
}
```

---

### 5. ValidationError

**Purpose**: Represents a CSS validation error to be reported in the IDE.

**Properties**:

```typescript
interface ValidationError {
  /**
   * Error message to display
   * - Should include context and suggestions
   * - Example: "Unknown CSS class: 'primry'. Did you mean: primary?"
   */
  message: string;

  /**
   * Source location in Eligian file where error occurred
   */
  location: SourceLocation;

  /**
   * Error code for categorization
   * - Used for filtering, code actions, documentation links
   */
  code: ValidationErrorCode;

  /**
   * Suggested fixes (for "Did you mean?" feature)
   * - Empty array if no suggestions available
   * - Ordered by relevance (closest match first)
   */
  suggestions: string[];
}

enum ValidationErrorCode {
  /**
   * Referenced CSS class does not exist in imported CSS files
   * - Applies to ParameterType.className parameters
   */
  UNKNOWN_CSS_CLASS = 'unknown-css-class',

  /**
   * Referenced CSS ID does not exist in imported CSS files
   * - Applies to ParameterType.selector parameters with IDs
   */
  UNKNOWN_CSS_ID = 'unknown-css-id',

  /**
   * CSS selector syntax is invalid
   * - Applies to ParameterType.selector parameters
   * - Example: ".button[" (unclosed attribute selector)
   */
  INVALID_SELECTOR_SYNTAX = 'invalid-selector-syntax',

  /**
   * Imported CSS file has syntax errors
   * - CSS file cannot be parsed
   * - All classes from that file are unavailable
   */
  INVALID_CSS_FILE = 'invalid-css-file',
}
```

**Examples**:

**Unknown class with suggestions**:
```typescript
const error: ValidationError = {
  message: "Unknown CSS class: 'primry'. Did you mean: primary?",
  location: {
    filePath: 'presentation.eligian',
    startLine: 10,
    startColumn: 15,
    endLine: 10,
    endColumn: 21,
  },
  code: ValidationErrorCode.UNKNOWN_CSS_CLASS,
  suggestions: ['primary'],
};
```

**Unknown class without suggestions**:
```typescript
const error: ValidationError = {
  message: "Unknown CSS class: 'xyz'",
  location: {
    filePath: 'presentation.eligian',
    startLine: 12,
    startColumn: 20,
    endLine: 12,
    endColumn: 23,
  },
  code: ValidationErrorCode.UNKNOWN_CSS_CLASS,
  suggestions: [],
};
```

**Invalid selector syntax**:
```typescript
const error: ValidationError = {
  message: "Invalid CSS selector syntax: Unexpected '[' found",
  location: {
    filePath: 'presentation.eligian',
    startLine: 15,
    startColumn: 25,
    endLine: 15,
    endColumn: 35,
  },
  code: ValidationErrorCode.INVALID_SELECTOR_SYNTAX,
  suggestions: [],
};
```

**Invalid CSS file**:
```typescript
const error: ValidationError = {
  message: "CSS file 'styles.css' has syntax errors (line 5, column 10): Unclosed block",
  location: {
    filePath: 'presentation.eligian',
    startLine: 1,  // Location of CSS import statement
    startColumn: 1,
    endLine: 1,
    endColumn: 30,
  },
  code: ValidationErrorCode.INVALID_CSS_FILE,
  suggestions: [],
};
```

---

## Registry State

### CSSRegistryService Internal State

**Purpose**: Centralized registry for all CSS metadata across the workspace.

**State Structure**:

```typescript
class CSSRegistryService {
  /**
   * Map of CSS file URI → parsed metadata
   * - Updated when CSS files change
   * - Cleared when CSS files are deleted
   */
  private metadataByFile: Map<string, CSSMetadata>;

  /**
   * Map of Eligian document URI → imported CSS file URIs
   * - Updated when .eligian files are parsed
   * - Used to determine which CSS classes are available to each document
   */
  private importsByDocument: Map<string, Set<string>>;
}
```

**Example State**:

```typescript
// After parsing presentation.eligian and styles.css
metadataByFile = new Map([
  ['file:///f:/projects/app/styles.css', {
    classes: new Set(['button', 'primary']),
    ids: new Set(['header']),
    classLocations: new Map([...]),
    idLocations: new Map([...]),
    classRules: new Map([...]),
    idRules: new Map([...]),
    errors: [],
  }],
]);

importsByDocument = new Map([
  ['file:///f:/projects/app/presentation.eligian', new Set([
    'file:///f:/projects/app/styles.css',
  ])],
]);
```

**State Transitions**:

1. **CSS file created/updated**:
   - Parse CSS → `CSSMetadata`
   - Update `metadataByFile[cssFileUri] = metadata`
   - Trigger re-validation of all documents in `importsByDocument` that reference `cssFileUri`

2. **CSS file deleted**:
   - Remove `metadataByFile[cssFileUri]`
   - Trigger re-validation of all documents that imported it
   - Show "CSS file not found" errors in those documents

3. **Eligian document parsed**:
   - Extract CSS imports from AST
   - Update `importsByDocument[documentUri] = Set of CSS URIs`
   - Validate against current CSS metadata in `metadataByFile`

4. **Eligian document closed**:
   - Remove `importsByDocument[documentUri]` (optional - can keep for caching)

---

## LSP Notification Payloads

### CSS Updated Notification

**Type**: `eligian/cssUpdated`

**Payload**:

```typescript
interface CSSUpdatedParams {
  /**
   * URI of the CSS file that changed
   * - Example: "file:///f:/projects/app/styles.css"
   */
  cssFileUri: string;

  /**
   * URIs of all Eligian documents that import this CSS file
   * - Used to determine which documents need re-validation
   * - Empty array if no documents import this CSS file
   */
  documentUris: string[];
}
```

**Example**:

```typescript
{
  cssFileUri: 'file:///f:/projects/app/styles.css',
  documentUris: [
    'file:///f:/projects/app/presentation.eligian',
    'file:///f:/projects/app/timeline.eligian',
  ],
}
```

### CSS Error Notification

**Type**: `eligian/cssError`

**Payload**:

```typescript
interface CSSErrorParams {
  /**
   * URI of the CSS file with syntax errors
   */
  cssFileUri: string;

  /**
   * Parse errors encountered in the CSS file
   */
  errors: CSSParseError[];
}
```

**Example**:

```typescript
{
  cssFileUri: 'file:///f:/projects/app/styles.css',
  errors: [
    {
      message: "Unclosed block",
      filePath: "file:///f:/projects/app/styles.css",
      line: 5,
      column: 10,
      source: "> 5 | .button {\n    |          ^",
    },
  ],
}
```

---

## Type Relationships

```
CSSRegistryService
    ├─ metadataByFile: Map<string, CSSMetadata>
    │       └─ CSSMetadata
    │           ├─ classes: Set<string>
    │           ├─ ids: Set<string>
    │           ├─ classLocations: Map<string, SourceLocation>
    │           ├─ idLocations: Map<string, SourceLocation>
    │           ├─ classRules: Map<string, string>
    │           ├─ idRules: Map<string, string>
    │           └─ errors: CSSParseError[]
    │                   └─ CSSParseError
    │                       ├─ message: string
    │                       ├─ filePath: string
    │                       ├─ line: number
    │                       ├─ column: number
    │                       └─ source?: string
    └─ importsByDocument: Map<string, Set<string>>

ParsedSelector
    ├─ classes: string[]
    ├─ ids: string[]
    ├─ valid: boolean
    └─ error?: string

ValidationError
    ├─ message: string
    ├─ location: SourceLocation
    ├─ code: ValidationErrorCode
    └─ suggestions: string[]
```

---

## Data Flow

```
CSS File Change (Extension)
    ↓
CSSWatcherManager detects change
    ↓
Send LSP notification: eligian/cssUpdated
    ↓
Language Server receives notification
    ↓
Parse CSS → CSSMetadata
    ↓
Update CSSRegistryService.metadataByFile
    ↓
Trigger re-validation of importing documents
    ↓
EligianDocumentValidator runs
    ↓
Query CSSRegistryService for available classes
    ↓
Validate operation parameters
    ↓
Generate ValidationError (if unknown class)
    ↓
Report diagnostic to IDE
```

---

## Performance Considerations

### Memory

- **CSSMetadata**: ~1KB per 100 classes (Set + Map overhead)
- **ParsedSelector**: ~100 bytes per selector (small)
- **Registry State**: Scales linearly with number of CSS files and documents

**Example**:
- 10 CSS files × 100 classes each = ~10KB metadata
- 50 .eligian documents × 3 CSS imports each = ~5KB import tracking
- **Total**: ~15KB for typical project (negligible)

### Computation

- **CSS Parsing**: O(n) where n = CSS file size (PostCSS is fast, ~1ms per 1000 lines)
- **Selector Parsing**: O(m) where m = selector length (typically < 100 characters, ~0.1ms)
- **Levenshtein Distance**: O(a × b) where a, b = string lengths (< 1ms for typical class names)
- **Validation**: O(p) where p = number of operation parameters (< 10ms per document)

**Success Criteria**:
- SC-001: Validation < 50ms ✅ (plenty of headroom)
- SC-002: Hot-reload < 300ms ✅ (CSS parsing + validation < 100ms)

---

## Notes

- All URIs use `file://` scheme (VS Code standard)
- Line/column numbers are 1-based (LSP standard)
- Sets and Maps use string keys for O(1) lookup
- Metadata is immutable after parsing (create new objects on update)
- Registry state is mutable (internal implementation detail)

---

**Data Model Status**: ✅ Complete
**Ready for Contracts**: Yes
