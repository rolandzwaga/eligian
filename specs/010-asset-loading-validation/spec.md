# Feature 010: Asset Loading & Validation

**Status**: Infrastructure Complete - Integration Pending
**Created**: 2025-10-25
**Updated**: 2025-10-25
**Dependencies**: Feature 009 (Asset Import Syntax)

**Implementation Status**:
- ✅ Phase 0-6: Asset validation infrastructure (109 tests passing)
- ❌ **NOT INTEGRATED**: Validators are not called during compilation
- ❌ **DOES NOT WORK**: File existence/validation errors are not reported to users
- ⏸️ **BLOCKED**: Requires CLI/LSP integration to actually function

---

## Overview

Extend the asset import system to load, validate, and embed asset contents at compile time. This provides immediate feedback on missing or malformed assets and enables the compiler to generate self-contained Eligius configurations.

## Problem Statement

Currently (Feature 009), the Eligian compiler validates import syntax but:
- ❌ Does **not** check if imported files exist
- ❌ Does **not** load file contents
- ❌ Does **not** validate HTML/CSS correctness
- ❌ Cannot resolve relative paths to absolute paths

This means errors are discovered at **runtime** instead of **compile time**.

## Goals

1. **File Existence Validation**: Verify imported files exist before compilation succeeds
2. **Content Loading**: Load file contents into memory during compilation
3. **Path Resolution**: Convert relative import paths to absolute paths based on source file location
4. **Content Validation**: Validate HTML and CSS syntax (media format validation is out of scope)
5. **Clear Error Reporting**: Provide actionable error messages with file paths and line numbers

## Non-Goals

- ❌ Media file format validation (images, audio, video) - accept any file as media
- ❌ CSS preprocessing (SCSS, Less) - only validate plain CSS
- ❌ HTML template preprocessing (JSX, Vue, etc.) - only validate plain HTML
- ❌ File watching / hot reload - one-time validation at compile time
- ❌ Minification or optimization of assets

---

## User Stories

### US1: File Existence Validation

**As a** developer
**I want** the compiler to check if imported files exist
**So that** I catch missing file errors at compile time instead of runtime

**Acceptance Criteria**:
- Compiler resolves relative import paths based on source `.eligian` file location
- If an imported file doesn't exist, compilation fails with clear error
- Error message includes: import statement location, expected file path, suggestions for typos

**Example**:

```eligian
// Source: /projects/myapp/src/main.eligian
import layout from "./layout.html"  // Resolves to /projects/myapp/src/layout.html

// ❌ If file doesn't exist:
// Error: Cannot find file './layout.html'
//   Expected path: /projects/myapp/src/layout.html
//   At: main.eligian:2:20
//   Hint: Check file name spelling and path
```

### US2: HTML Content Loading & Validation

**As a** developer
**I want** HTML files to be loaded and validated at compile time
**So that** I catch HTML syntax errors before deploying

**Acceptance Criteria**:
- Compiler loads HTML file contents into memory
- Validates HTML syntax (well-formed tags, proper nesting, closed tags)
- Compilation fails if HTML is malformed
- Valid HTML content is embedded in the output configuration

**HTML Validation Rules**:
- ✅ All opening tags have matching closing tags
- ✅ Tags are properly nested (no `<div><span></div></span>`)
- ✅ Attribute syntax is valid (`attr="value"` or `attr='value'`)
- ✅ No unclosed tags (e.g., `<div>` without `</div>`)
- ✅ Self-closing tags are allowed (`<img />`, `<br />`)

**Out of Scope** (won't validate):
- HTML5 semantic correctness (e.g., `<div>` inside `<span>`)
- Accessibility (ARIA attributes, alt text)
- Script/style content within HTML

**Example**:

```eligian
import layout from "./layout.html"

// If layout.html contains:
// <div><span></div></span>
//
// ❌ Error: Invalid HTML in './layout.html'
//   Mismatched closing tag: expected </span>, found </div>
//   At: layout.html:1:15
//   Hint: Check tag nesting
```

### US3: CSS Content Loading & Validation

**As a** developer
**I want** CSS files to be loaded and validated at compile time
**So that** I catch CSS syntax errors before deploying

**Acceptance Criteria**:
- Compiler loads CSS file contents into memory
- Validates CSS syntax (selectors, properties, values)
- Compilation fails if CSS is malformed
- Valid CSS file paths are added to `cssFiles` array in output

**CSS Validation Rules**:
- ✅ Selectors are well-formed (`.class`, `#id`, `element`, etc.)
- ✅ Property-value pairs are valid (`property: value;`)
- ✅ Braces are balanced (`{ }`)
- ✅ Semicolons separate declarations
- ✅ At-rules are syntactically valid (`@media`, `@import`, etc.)

**Out of Scope** (won't validate):
- CSS property name correctness (`colr` vs `color`)
- CSS value validity (`color: notacolor`)
- Browser compatibility
- CSS preprocessor syntax (SCSS, Less)

**Example**:

```eligian
import styles from "./styles.css"

// If styles.css contains:
// .button { color: blue
//
// ❌ Error: Invalid CSS in './styles.css'
//   Missing closing brace
//   At: styles.css:1:23
//   Hint: Add '}' to close selector
```

### US4: Media File Existence Check

**As a** developer
**I want** media files to be checked for existence
**So that** I catch missing asset errors at compile time

**Acceptance Criteria**:
- Compiler checks if media files exist
- No format validation (accept any file)
- Compilation fails if media file doesn't exist
- Error message includes expected file path

**Example**:

```eligian
import logo from "./logo.png"

// ❌ If file doesn't exist:
// Error: Cannot find file './logo.png'
//   Expected path: /projects/myapp/src/logo.png
//   At: main.eligian:1:18
```

### US5: Path Resolution Strategy

**As a** developer
**I want** import paths resolved relative to the source file
**So that** I can organize my project structure naturally

**Acceptance Criteria**:
- Relative paths are resolved from the `.eligian` source file directory
- Same-directory imports: `"./file.html"` → `{sourceDir}/file.html`
- Parent directory imports: `"../file.html"` → `{sourceDir}/../file.html`
- Nested directory imports: `"./nested/file.html"` → `{sourceDir}/nested/file.html`
- Absolute paths are produced for all resolved files

**Example**:

```
Project structure:
/projects/myapp/
  src/
    main.eligian
    layout.html
    components/
      header.html
  assets/
    logo.png
```

```eligian
// In /projects/myapp/src/main.eligian:

import layout from "./layout.html"                // → /projects/myapp/src/layout.html
import header from "./components/header.html"     // → /projects/myapp/src/components/header.html
import logo from "../assets/logo.png"             // → /projects/myapp/assets/logo.png
```

### US6: Error Reporting

**As a** developer
**I want** clear, actionable error messages
**So that** I can quickly fix asset-related issues

**Acceptance Criteria**:
- Error messages include:
  - File path (relative and absolute)
  - Source location (file, line, column)
  - Error type (missing file, invalid HTML, invalid CSS)
  - Helpful hint for resolution
- Multiple errors are collected and reported together
- Errors don't stop after first failure (collect all issues)

**Error Message Format**:

```
Asset Error: {error-type}
  File: {relative-path}
  Resolved Path: {absolute-path}
  Source: {source-file}:{line}:{column}
  Reason: {detailed-reason}
  Hint: {suggestion}
```

**Example Output**:

```
Asset Errors Found (2):

1. Missing File
   File: ./layout.html
   Resolved Path: /projects/myapp/src/layout.html
   Source: main.eligian:1:20
   Reason: File does not exist
   Hint: Check file name spelling and path

2. Invalid HTML
   File: ./components/header.html
   Resolved Path: /projects/myapp/src/components/header.html
   Source: main.eligian:2:22
   Reason: Unclosed tag <div> at header.html:5:10
   Hint: Add closing </div> tag
```

---

## Technical Design

### Architecture Overview

```
Compilation Pipeline (Enhanced):

1. Parse DSL → AST                     [Existing]
2. Validate AST                        [Existing]
   ├─ Import syntax validation         [Feature 009]
   └─ ✨ Asset loading & validation    [NEW - Feature 010]
      ├─ Resolve import paths
      ├─ Check file existence
      ├─ Load file contents
      ├─ Validate HTML/CSS syntax
      └─ Collect errors
3. Transform AST → IR                  [Existing]
   └─ ✨ Embed asset contents          [NEW]
4. Optimize IR                         [Existing]
5. Emit JSON                           [Existing]
```

### Component Design

#### 1. Asset Loader Service (`asset-loader.ts`)

**Purpose**: Load file contents from disk

```typescript
export interface IAssetLoader {
  /**
   * Load file contents from absolute path
   * @returns File contents as string
   * @throws AssetLoadError if file doesn't exist or can't be read
   */
  loadFile(absolutePath: string): string;

  /**
   * Check if file exists
   */
  fileExists(absolutePath: string): boolean;

  /**
   * Resolve relative path to absolute path based on source file location
   */
  resolvePath(sourcePath: string, importPath: string): string;
}

export class NodeAssetLoader implements IAssetLoader {
  loadFile(absolutePath: string): string {
    // Use Node.js fs.readFileSync
  }

  fileExists(absolutePath: string): boolean {
    // Use Node.js fs.existsSync
  }

  resolvePath(sourcePath: string, importPath: string): string {
    // Use path.resolve, path.dirname
  }
}
```

#### 2. HTML Validator (`html-validator.ts`)

**Purpose**: Validate HTML syntax

```typescript
export interface IHtmlValidator {
  /**
   * Validate HTML content
   * @returns Array of validation errors (empty if valid)
   */
  validate(html: string, filePath: string): HtmlValidationError[];
}

export interface HtmlValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export class HtmlValidator implements IHtmlValidator {
  validate(html: string, filePath: string): HtmlValidationError[] {
    // Use htmlparser2 or parse5 for parsing
    // Check for:
    // - Unclosed tags
    // - Mismatched closing tags
    // - Invalid nesting
  }
}
```

#### 3. CSS Validator (`css-validator.ts`)

**Purpose**: Validate CSS syntax

```typescript
export interface ICssValidator {
  /**
   * Validate CSS content
   * @returns Array of validation errors (empty if valid)
   */
  validate(css: string, filePath: string): CssValidationError[];
}

export interface CssValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export class CssValidator implements ICssValidator {
  validate(css: string, filePath: string): CssValidationError[] {
    // Use css-tree or postcss for parsing
    // Check for:
    // - Unbalanced braces
    // - Missing semicolons
    // - Invalid selectors
    // - Invalid at-rules
  }
}
```

#### 4. Asset Validation Service (`asset-validation-service.ts`)

**Purpose**: Orchestrate asset loading and validation

```typescript
export interface IAssetValidationService {
  /**
   * Validate all imports in a program
   * @returns Array of asset errors (empty if all valid)
   */
  validateAssets(
    program: Program,
    sourcePath: string
  ): AssetError[];
}

export interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';
  filePath: string;
  absolutePath: string;
  sourceLocation: SourceLocation;
  message: string;
  hint: string;
  details?: string; // Additional context (e.g., parse error details)
}

export class AssetValidationService implements IAssetValidationService {
  constructor(
    private loader: IAssetLoader,
    private htmlValidator: IHtmlValidator,
    private cssValidator: ICssValidator
  ) {}

  validateAssets(program: Program, sourcePath: string): AssetError[] {
    const errors: AssetError[] = [];
    const imports = getImports(program);

    for (const importStmt of imports) {
      // 1. Resolve path
      const absolutePath = this.loader.resolvePath(sourcePath, importStmt.path);

      // 2. Check existence
      if (!this.loader.fileExists(absolutePath)) {
        errors.push(createMissingFileError(importStmt, absolutePath));
        continue; // Skip validation if file doesn't exist
      }

      // 3. Load contents
      let contents: string;
      try {
        contents = this.loader.loadFile(absolutePath);
      } catch (err) {
        errors.push(createLoadError(importStmt, absolutePath, err));
        continue;
      }

      // 4. Validate based on type
      const assetType = inferAssetType(importStmt);

      if (assetType === 'html') {
        const htmlErrors = this.htmlValidator.validate(contents, absolutePath);
        errors.push(...htmlErrors.map(e => createHtmlError(importStmt, absolutePath, e)));
      } else if (assetType === 'css') {
        const cssErrors = this.cssValidator.validate(contents, absolutePath);
        errors.push(...cssErrors.map(e => createCssError(importStmt, absolutePath, e)));
      }
      // 'media' type: no validation, existence check only
    }

    return errors;
  }
}
```

#### 5. Integration with Validator (`eligian-validator.ts`)

Add new validation check:

```typescript
@check('Program')
checkAssetValidation(program: Program, accept: ValidationAcceptor): void {
  // Get source file path from document
  const document = AstUtils.getDocument(program);
  const sourcePath = URI.parse(document.uri).fsPath;

  // Validate assets
  const errors = this.assetValidationService.validateAssets(program, sourcePath);

  // Report errors via Langium's ValidationAcceptor
  for (const error of errors) {
    const importStmt = findImportByPath(program, error.filePath);
    if (importStmt) {
      accept('error', error.message, {
        node: importStmt,
        property: 'path',
        code: error.type,
      });
    }
  }
}
```

#### 6. Transformer Integration (`ast-transformer.ts`)

Embed loaded assets into output:

```typescript
private transformImports(program: Program): {
  layoutTemplate?: string;
  cssFiles: string[];
  importMap: Record<string, string>; // Maps import names to loaded content
} {
  const imports = getImports(program);
  let layoutTemplate: string | undefined;
  const cssFiles: string[] = [];
  const importMap: Record<string, string> = {};

  for (const importStmt of imports) {
    const assetType = inferAssetType(importStmt);
    const absolutePath = this.assetLoader.resolvePath(this.sourcePath, importStmt.path);
    const content = this.assetLoader.loadFile(absolutePath);

    if (isDefaultImport(importStmt)) {
      // Default imports with keywords: layout, styles, provider
      const keyword = importStmt.keyword; // 'layout' | 'styles' | 'provider'

      if (keyword === 'layout') {
        // Assign HTML content directly to layoutTemplate (no prefix)
        layoutTemplate = content;
        // Also add to import map with name 'layout'
        importMap.layout = content;
      } else if (keyword === 'styles') {
        // Add RELATIVE CSS file path to cssFiles array (keep as-is from source)
        // Resolution to absolute paths happens at runtime in preview
        cssFiles.push(importStmt.path);
        // Add loaded content to import map with name 'styles'
        importMap.styles = content;
      } else if (keyword === 'provider') {
        // Store provider file path (relative)
        importMap.provider = importStmt.path;
      }
    } else {
      // Named imports: import name from './path.html'
      // Store in import map using the import name
      const importName = importStmt.name;
      importMap[importName] = content;
    }
  }

  return { layoutTemplate, cssFiles, importMap };
}
```

---

## Dependencies

### External Libraries

1. **HTML Parser**: `parse5` or `htmlparser2`
   - Purpose: Parse and validate HTML syntax
   - License: MIT
   - Rationale: Standard, battle-tested HTML parser

2. **CSS Parser**: `css-tree` or `postcss`
   - Purpose: Parse and validate CSS syntax
   - License: MIT
   - Rationale: Robust CSS parsing with good error reporting

3. **Path Resolution**: Node.js `path` module (built-in)
   - Purpose: Resolve relative paths to absolute paths
   - Already available in Node.js runtime

4. **File I/O**: Node.js `fs` module (built-in)
   - Purpose: Read file contents, check file existence
   - Already available in Node.js runtime

---

## Testing Strategy

### Unit Tests

1. **Asset Loader Tests** (`asset-loader.spec.ts`):
   - Test file existence checks
   - Test file loading (success and failure)
   - Test path resolution (same dir, parent dir, nested dir)
   - Test error handling (permission denied, file not found)

2. **HTML Validator Tests** (`html-validator.spec.ts`):
   - Valid HTML (various structures)
   - Unclosed tags
   - Mismatched closing tags
   - Invalid nesting
   - Malformed attributes
   - Self-closing tags

3. **CSS Validator Tests** (`css-validator.spec.ts`):
   - Valid CSS (various selectors and rules)
   - Unbalanced braces
   - Missing semicolons
   - Invalid selectors
   - Invalid at-rules

4. **Asset Validation Service Tests** (`asset-validation-service.spec.ts`):
   - Single import (success)
   - Multiple imports (all valid)
   - Missing file error
   - Invalid HTML error
   - Invalid CSS error
   - Multiple errors collected

### Integration Tests

5. **End-to-End Validation** (`integration/asset-validation.spec.ts`):
   - Compile DSL with valid imports → success
   - Compile DSL with missing file → error
   - Compile DSL with invalid HTML → error
   - Compile DSL with invalid CSS → error
   - Verify error messages include all required details

6. **Transformer Integration** (`transformer-assets.spec.ts`):
   - Verify HTML content embedded in layoutTemplate (direct string, no prefix)
   - Verify CSS file paths added to cssFiles array (kept as relative paths)
   - Verify import map contains all imports with correct keys
   - Verify default imports use keywords: 'layout', 'styles', 'provider'
   - Verify named imports use their declared names as keys

### Test Fixtures

Create fixture files in `__fixtures__/assets/`:
- `valid.html` - Valid HTML file
- `invalid-unclosed-tag.html` - HTML with unclosed tag
- `invalid-mismatched-tag.html` - HTML with mismatched closing tag
- `valid.css` - Valid CSS file
- `invalid-missing-brace.css` - CSS with missing closing brace
- `valid.png` - Valid image file (for media tests)

---

## Implementation Phases

### Phase 1: Asset Loader Foundation (T001-T010)
- T001: Create `IAssetLoader` interface
- T002: Implement `NodeAssetLoader.fileExists()`
- T003: Implement `NodeAssetLoader.loadFile()`
- T004: Implement `NodeAssetLoader.resolvePath()`
- T005: Write unit tests for `NodeAssetLoader`
- T006: Create mock loader for testing (`MockAssetLoader`)
- T007: Add error types (`AssetLoadError`)
- T008: Test path resolution (same dir, parent, nested)
- T009: Test file existence checks
- T010: Test file loading (success and errors)

### Phase 2: HTML Validation (T011-T020)
- T011: Research HTML parser libraries (parse5 vs htmlparser2)
- T012: Add chosen HTML parser dependency
- T013: Create `IHtmlValidator` interface
- T014: Implement `HtmlValidator` class
- T015: Parse HTML and detect unclosed tags
- T016: Detect mismatched closing tags
- T017: Detect invalid nesting
- T018: Extract line/column info from parse errors
- T019: Write unit tests (valid HTML cases)
- T020: Write unit tests (invalid HTML cases)

### Phase 3: CSS Validation (T021-T030)
- T021: Research CSS parser libraries (css-tree vs postcss)
- T022: Add chosen CSS parser dependency
- T023: Create `ICssValidator` interface
- T024: Implement `CssValidator` class
- T025: Parse CSS and detect unbalanced braces
- T026: Detect missing semicolons
- T027: Detect invalid selectors
- T028: Extract line/column info from parse errors
- T029: Write unit tests (valid CSS cases)
- T030: Write unit tests (invalid CSS cases)

### Phase 4: Asset Validation Service (T031-T045)
- T031: Create `IAssetValidationService` interface
- T032: Define `AssetError` type
- T033: Implement `AssetValidationService` constructor (DI)
- T034: Implement path resolution for imports
- T035: Implement file existence checking
- T036: Implement file loading with error handling
- T037: Implement HTML validation integration
- T038: Implement CSS validation integration
- T039: Implement media file existence check
- T040: Collect multiple errors (don't stop at first)
- T041: Create error helper functions (createMissingFileError, etc.)
- T042: Write unit tests (single import)
- T043: Write unit tests (multiple imports)
- T044: Write unit tests (error cases)
- T045: Write unit tests (error collection)

### Phase 5: Validator Integration (T046-T055)
- T046: Inject `AssetValidationService` into `EligianValidator`
- T047: Add `checkAssetValidation()` method to validator
- T048: Extract source file path from Langium document
- T049: Call asset validation service
- T050: Map `AssetError` to Langium diagnostics
- T051: Report errors via `ValidationAcceptor`
- T052: Register `checkAssetValidation` for `Program` nodes
- T053: Write integration tests (valid assets)
- T054: Write integration tests (invalid assets)
- T055: Test error message formatting

### Phase 6: Transformer Integration (T056-T065)
- T056: Add `IAssetLoader` to transformer dependencies
- T057: Pass source file path to transformer
- T058: Implement `transformImports()` method
- T059: Load HTML content for default imports
- T060: Embed HTML content in `layoutTemplate` field
- T061: Collect CSS file absolute paths
- T062: Add CSS paths to `cssFiles` array
- T063: Handle media file references (if needed)
- T064: Write transformer tests (HTML embedding)
- T065: Write transformer tests (CSS paths)

### Phase 7: Error Reporting Polish (T066-T075)
- T066: Design error message format (template)
- T067: Implement error formatter utility
- T068: Include relative and absolute paths
- T069: Include source location (file:line:column)
- T070: Add helpful hints for each error type
- T071: Format multiple errors clearly
- T072: Add ANSI colors for terminal output (optional)
- T073: Write tests for error formatter
- T074: Update CLI to display formatted errors
- T075: Update VS Code extension diagnostics

### Phase 8: Documentation & Examples (T076-T080)
- T076: Update `LANGUAGE_SPEC.md` with asset loading behavior
- T077: Document error messages in spec
- T078: Create example `.eligian` files with imports
- T079: Create fixture asset files for examples
- T080: Update `README.md` with asset validation features

---

## Success Criteria

- ✅ Compilation fails if imported file doesn't exist
- ✅ Compilation fails if HTML is invalid (unclosed/mismatched tags)
- ✅ Compilation fails if CSS is invalid (syntax errors)
- ✅ Error messages include file path, location, and helpful hints
- ✅ HTML content is embedded in output `layoutTemplate` as direct string
- ✅ CSS file **relative** paths are included in output `cssFiles` array (not absolute)
- ✅ Import map contains all loaded assets (layout, styles, provider, and named imports)
- ✅ All tests pass (unit + integration)
- ✅ Zero breaking changes to existing DSL syntax
- ✅ Documentation updated

---

## Open Questions

1. **HTML Parser Choice**: parse5 (full HTML5 spec) vs htmlparser2 (faster, simpler)?
   - **Recommendation**: htmlparser2 for speed, validate basic well-formedness only

2. **CSS Parser Choice**: css-tree (CSS spec compliant) vs postcss (plugin ecosystem)?
   - **Recommendation**: css-tree for focused syntax validation

3. **Import Map Structure**: All imports stored in unified map
   - Default imports: `{ layout: htmlContent, styles: cssContent, provider: filePath }`
   - Named imports: `{ tooltip: htmlContent, modal: htmlContent, ... }`
   - Access directly by import name (no prefix needed)
   - May be used in `setElementContent` operations or stored in `$globaldata`
   - Question: Should import map be embedded in output JSON or stored separately?

4. **Caching**: Should we cache loaded file contents?
   - For watch mode (future): yes
   - For single compilation: probably not needed (overhead minimal)

5. **Parallel Loading**: Should we load files in parallel?
   - Probably not worth the complexity for initial implementation
   - Sequential loading is simpler and errors are easier to track

---

## Future Enhancements (Out of Scope)

- **Image Optimization**: Compress/resize images at compile time
- **CSS Preprocessing**: Support SCSS, Less, PostCSS transforms
- **HTML Templating**: Support template engines (Handlebars, EJS)
- **Asset Bundling**: Bundle multiple CSS files into one
- **Source Maps**: Generate source maps for loaded assets
- **Watch Mode**: Re-validate assets on file changes
- **Asset Fingerprinting**: Add content hashes to asset filenames for cache busting
