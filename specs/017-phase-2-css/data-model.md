# Data Model: Phase 2 - CSS Consolidation

**Date**: 2025-01-27
**Feature**: 017-phase-2-css

## Overview

This document describes the data entities and their relationships for the CSS consolidation feature. The CSS service provides parsing, loading, and URL rewriting capabilities shared between language server and VS Code extension.

---

## Entity Diagram

```
┌────────────────────────────────────────────────────────────────┐
│ CSSService (Module)                                            │
├────────────────────────────────────────────────────────────────┤
│ + parseCSS(content, filePath): CSSParseResult                  │
│ + loadCSS(filePath, converter): Promise<LoadedCSS>             │
│ + rewriteUrls(css, cssFilePath, converter): string             │
└────────────────────────────────────────────────────────────────┘
                    │
                    │ uses
                    ▼
┌────────────────────────────────────────────────────────────────┐
│ WebviewUriConverter (Interface)                                │
├────────────────────────────────────────────────────────────────┤
│ + convertToWebviewUri(fileUri: Uri): Uri                       │
└────────────────────────────────────────────────────────────────┘
                    ▲
                    │ implements
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────────────────┐   ┌───────────────────┐
│ VSCodeWebview     │   │ MockWebview       │
│ UriConverter      │   │ Converter         │
│ (Extension)       │   │ (Tests)           │
└───────────────────┘   └───────────────────┘


┌────────────────────────────────────────────────────────────────┐
│ CSSParseResult (Output)                                        │
├────────────────────────────────────────────────────────────────┤
│ + classes: Set<string>                                         │
│ + ids: Set<string>                                             │
│ + classLocations: Map<string, CSSSourceLocation>               │
│ + idLocations: Map<string, CSSSourceLocation>                  │
│ + classRules: Map<string, string>                              │
│ + idRules: Map<string, string>                                 │
│ + errors: CSSParseError[]                                      │
└────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────┐
│ LoadedCSS (Output)                                             │
├────────────────────────────────────────────────────────────────┤
│ + content: string                                              │
│ + id: string                                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Core Entities

### 1. CSSService (Module)

**Purpose**: Unified CSS operations module that provides parsing, loading, and URL rewriting.

**Location**: `packages/language/src/css/css-service.ts`

**Methods**:

#### `parseCSS(content: string, filePath: string): CSSParseResult`
- **Purpose**: Parse CSS content and extract classes, IDs, locations, and rules
- **Input**: CSS file content as string, file path for error reporting
- **Output**: CSSParseResult with metadata
- **Implementation**: Delegates to existing css-parser.ts
- **Usage**: Language server validation, IDE features

#### `loadCSS(filePath: string, converter: WebviewUriConverter): Promise<LoadedCSS>`
- **Purpose**: Load CSS file and rewrite URLs for webview compatibility
- **Input**: Absolute file path, webview URI converter
- **Output**: Promise resolving to LoadedCSS (content + ID)
- **Implementation**: Uses shared-utils loadFileAsync() + rewriteUrls()
- **Usage**: Extension webview CSS injection

#### `rewriteUrls(css: string, cssFilePath: string, converter: WebviewUriConverter): string`
- **Purpose**: Rewrite CSS url() paths to webview URIs
- **Input**: CSS content, CSS file path, URI converter
- **Output**: CSS with rewritten url() paths
- **Implementation**: Regex-based replacement (migrated from extension)
- **Usage**: CSS hot-reload, webview injection

**Relationships**:
- Uses: WebviewUriConverter (injected dependency)
- Uses: css-parser.ts (delegation)
- Uses: shared-utils loadFileAsync() (file I/O)
- Consumed by: Extension (webview-css-injector.ts, css-loader.ts)

---

### 2. WebviewUriConverter (Interface)

**Purpose**: Abstract interface for converting file system URIs to webview-compatible URIs.

**Location**: `packages/language/src/css/css-service.ts`

**Type**: Interface (platform-agnostic)

**Fields/Methods**:

#### `convertToWebviewUri(fileUri: Uri): Uri`
- **Purpose**: Convert local file URI to webview URI
- **Input**: File system URI (`file://` scheme)
- **Output**: Webview-compatible URI (`vscode-webview://` or similar)
- **Contract**: Must preserve path and return valid URI

**Implementations**:
1. **VSCodeWebviewUriConverter** (extension package)
   - Wraps VS Code webview.asWebviewUri()
   - Production implementation
2. **MockWebviewConverter** (language package tests)
   - Returns mock webview URIs
   - Test implementation

**Rationale**: Decouples language package from VS Code API, enables testing without platform dependency.

---

### 3. Uri (Interface)

**Purpose**: Platform-agnostic URI representation.

**Location**: `packages/language/src/css/css-service.ts`

**Type**: Interface

**Fields**:
- `scheme: string` - URI scheme (e.g., 'file', 'vscode-webview')
- `path: string` - Absolute file path or resource path
- `toString(): string` - String representation of URI

**Usage**: Input/output type for WebviewUriConverter

**Rationale**: Avoids VS Code type dependency in language package.

---

### 4. CSSParseResult (Output)

**Purpose**: Metadata extracted from parsed CSS file.

**Location**: `packages/language/src/css/css-parser.ts` (existing)

**Type**: Interface

**Fields**:
- `classes: Set<string>` - CSS class names (e.g., 'button', 'header')
- `ids: Set<string>` - CSS ID names (e.g., 'main', 'nav')
- `classLocations: Map<string, CSSSourceLocation>` - Source locations of class definitions
- `idLocations: Map<string, CSSSourceLocation>` - Source locations of ID definitions
- `classRules: Map<string, string>` - Full CSS rules for each class
- `idRules: Map<string, string>` - Full CSS rules for each ID
- `errors: CSSParseError[]` - PostCSS syntax errors

**Usage**:
- Language server: CSS class/ID validation
- IDE: Code completion, hover info, goto definition
- Extension: Error reporting

**Data Flow**:
```
CSS File → parseCSS() → CSSParseResult → CSSRegistryService → Validation
```

---

### 5. LoadedCSS (Output)

**Purpose**: CSS file loaded and processed for webview injection.

**Location**: `packages/language/src/css/css-service.ts`

**Type**: Interface

**Fields**:
- `content: string` - CSS content with rewritten url() paths
- `id: string` - Stable unique identifier (SHA-256 hash of file path)

**Usage**: Extension webview CSS injection

**Data Flow**:
```
CSS File Path → loadCSS() → LoadedCSS → Webview Message → <style> tag
```

---

### 6. CSSSourceLocation (Metadata)

**Purpose**: Source code location for CSS definitions.

**Location**: `packages/language/src/css/css-parser.ts` (existing)

**Type**: Interface

**Fields**:
- `filePath: string` - Absolute path to CSS file
- `startLine: number` - Starting line number (1-indexed)
- `startColumn: number` - Starting column number (1-indexed)
- `endLine: number` - Ending line number (1-indexed)
- `endColumn: number` - Ending column number (1-indexed)

**Usage**: IDE features (goto definition, error reporting)

---

### 7. CSSParseError (Error Type)

**Purpose**: PostCSS syntax error information.

**Location**: `packages/language/src/css/css-parser.ts` (existing)

**Type**: Interface

**Fields**:
- `message: string` - Error description
- `filePath: string` - Absolute path to CSS file
- `line: number` - Line number of error (1-indexed)
- `column: number` - Column number of error (1-indexed)
- `source?: string` - Source code snippet (optional)

**Usage**: Validation error reporting, IDE diagnostics

**Error Handling Flow**:
```
Invalid CSS → PostCSS Parser → CSSParseError → ValidationAcceptor → IDE Problems Panel
```

---

### 8. FileOperationError (Error Types)

**Purpose**: Typed errors for file I/O operations.

**Location**: `packages/shared-utils/src/errors.ts` (source of truth)

**Type**: Discriminated union

**Variants**:
- `FileNotFoundError` - File does not exist (`_tag: 'FileNotFoundError'`)
- `PermissionError` - Insufficient permissions (`_tag: 'PermissionError'`)
- `ReadError` - Failed to read file (`_tag: 'ReadError'`)
- `SecurityError` - Path traversal detected (`_tag: 'SecurityError'`)

**Re-exported from**: `@eligian/language/index.ts` (convenience)

**Usage**: Error handling in loadCSS()

**Error Handling Flow**:
```
CSS File → loadFileAsync() → Result<content, FileOperationError>
                           → If error: typed error handling
                           → If success: rewriteUrls()
```

---

## Data Flows

### Flow 1: CSS Parsing (Language Server)

```
1. User edits CSS import in .eligian file
   ↓
2. Language server detects CSS import
   ↓
3. parseCSS(content, filePath)
   ↓
4. CSSParseResult → CSSRegistryService
   ↓
5. Validator checks class/ID references
   ↓
6. IDE shows diagnostics (if errors)
```

### Flow 2: CSS Loading (Extension)

```
1. User opens preview
   ↓
2. Compiler extracts CSS file paths
   ↓
3. loadCSS(filePath, converter)
   ├─→ loadFileAsync(filePath) [shared-utils]
   │   └─→ Result<content, FileOperationError>
   ├─→ rewriteUrls(content, filePath, converter)
   │   └─→ Regex replacement of url() paths
   └─→ generateCSSId(filePath)
       └─→ SHA-256 hash
   ↓
4. LoadedCSS { content, id }
   ↓
5. WebviewCSSInjector sends message
   ↓
6. Webview creates <style> tag
```

### Flow 3: CSS Hot-Reload (Extension)

```
1. User edits CSS file, saves
   ↓
2. FileSystemWatcher detects change
   ↓
3. 300ms debounce timer
   ↓
4. loadCSS(filePath, converter) [same as Flow 2]
   ↓
5. LoadedCSS { content, id }
   ↓
6. WebviewCSSInjector sends css-reload message
   ↓
7. Webview updates <style> tag content
   ↓
8. Timeline continues playing (no restart)
```

---

## Validation Rules

### CSSService
- `parseCSS()` - Must handle malformed CSS gracefully (return errors, don't throw)
- `loadCSS()` - Must return typed errors (FileOperationError) on failure
- `rewriteUrls()` - Must skip absolute URLs (http://, https://, data:)

### WebviewUriConverter
- `convertToWebviewUri()` - Must preserve path integrity (no data loss)
- Implementation must be pure (same input → same output)

### LoadedCSS
- `content` - Must be valid CSS (may have rewritten URLs)
- `id` - Must be stable (same file path → same ID)

### CSSParseResult
- `errors` - Must include line/column for all PostCSS errors
- `classes` / `ids` - Must be unique (no duplicates)

---

## State Management

**Stateless Design**: All CSS service functions are pure (no internal state).

**State Ownership**:
- **CSSRegistryService** (language package) - Owns CSS metadata state
- **WebviewCSSInjector** (extension) - Owns loaded CSS state (Map<id, filePath>)
- **CSSWatcherManager** (extension) - Owns file watching state

**No Shared Mutable State**: Each package maintains its own state, communicates via function calls.

---

## Performance Characteristics

### parseCSS()
- **Time**: ~10-50ms for typical CSS file (5-50KB)
- **Memory**: Proportional to CSS size (AST + metadata)
- **Bottleneck**: PostCSS parser (unavoidable)

### loadCSS()
- **Time**: <500ms total (file I/O + rewriting)
  - loadFileAsync: ~1-10ms (file system read)
  - rewriteUrls: <1ms (regex replacement)
  - generateCSSId: <1ms (SHA-256 hash)
- **Memory**: 2x CSS file size (input + output strings)

### rewriteUrls()
- **Time**: <1ms for typical CSS file (regex is fast)
- **Memory**: 1x CSS file size (output string)
- **Scalability**: Linear with CSS size (O(n))

---

## Extension Points

### Custom URI Converters
Implementations of `WebviewUriConverter` can provide custom URI conversion logic:
- **VSCodeWebviewUriConverter** - Production (VS Code webview)
- **MockWebviewConverter** - Testing (predictable mock URIs)
- **Future**: BrowserWebviewConverter, ElectronWebviewConverter, etc.

### Error Handling
`loadCSS()` returns Result type, allowing callers to handle errors differently:
- Extension: Show VS Code notification
- CLI: Print error to console
- Tests: Assert on specific error types

---

## Migration Notes

**From**: Extension's `css-loader.ts` (179 lines, duplicates shared-utils)
**To**: Language package `css-service.ts` (~150 lines, reuses shared-utils)

**Breaking Changes**: None (backwards compatible)

**Deprecated**: `packages/extension/src/extension/css-loader.ts` (will be deleted)

**New Dependency**: Extension uses `VSCodeWebviewUriConverter` adapter (~20 lines)

---

**Data Model Status**: ✅ Complete - All entities, relationships, and flows documented.
