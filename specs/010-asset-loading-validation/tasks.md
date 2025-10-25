# Tasks: Asset Loading & Validation

**Feature**: 010-asset-loading-validation
**Status**: Ready for Implementation
**Created**: 2025-10-25
**Dependencies Approved**: ✅ htmlparser2 + domutils + domhandler, ✅ css-tree

---

## Task Summary

| Phase | User Story | Task Count | Parallelizable | Dependencies |
|-------|------------|------------|----------------|--------------|
| 0 | Setup | 8 | 5 | None |
| 1 | US5: Path Resolution | 10 | 3 | Phase 0 |
| 2 | US1: File Existence | 8 | 4 | Phase 1 |
| 3 | US2: HTML Validation | 12 | 6 | Phase 1 |
| 4 | US3: CSS Validation | 12 | 6 | Phase 1 |
| 5 | US4: Media Files | 6 | 3 | Phase 1 |
| 6 | Integration | 15 | 7 | Phases 1-5 |
| 7 | US6: Error Reporting | 10 | 4 | Phase 6 |
| 8 | Polish | 5 | 2 | Phase 7 |
| **Total** | **All Stories** | **86** | **40** | - |

**Test Strategy**: TDD (Red-Green-Refactor) - All tests written before implementation

---

## Phase 0: Setup & Dependencies

**Goal**: Install dependencies and set up project structure

**Tasks**:

### T001: [Setup] Install HTML parser dependencies
```bash
npm install htmlparser2@^9.1.0 domutils@^3.1.0 domhandler@^5.0.3
```
- Verify installation in package.json
- Run `npm run build` to ensure no conflicts

### T002: [Setup] Install CSS parser dependency
```bash
npm install css-tree@^2.3.1
```
- Verify installation in package.json
- Run `npm run build` to ensure no conflicts

### T003: [Setup][P] Create asset loader directory structure
```bash
mkdir -p packages/language/src/asset-loading
mkdir -p packages/language/src/asset-loading/__tests__
mkdir -p packages/language/src/asset-loading/__fixtures__
```

### T004: [Setup][P] Create validators directory structure
```bash
mkdir -p packages/language/src/validators/assets
mkdir -p packages/language/src/validators/assets/__tests__
```

### T005: [Setup][P] Create types file for asset validation
**File**: `packages/language/src/asset-loading/types.ts`
```typescript
export interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';
  filePath: string;          // Relative path from source
  absolutePath: string;      // Resolved absolute path
  sourceLocation: SourceLocation;
  message: string;
  hint: string;
  details?: string;
}

export interface HtmlValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface CssValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
```

### T006: [Setup][P] Create test fixtures directory
```bash
mkdir -p packages/language/src/asset-loading/__fixtures__/assets
```

### T007: [Setup][P] Create valid HTML fixture
**File**: `packages/language/src/asset-loading/__fixtures__/assets/valid.html`
```html
<!DOCTYPE html>
<html>
<head>
    <title>Test</title>
</head>
<body>
    <div class="container">
        <h1 id="title">Hello World</h1>
        <img src="logo.png" alt="Logo" />
    </div>
</body>
</html>
```

### T008: [Setup][P] Create valid CSS fixture
**File**: `packages/language/src/asset-loading/__fixtures__/assets/valid.css`
```css
.container {
    max-width: 1200px;
    margin: 0 auto;
}

#title {
    font-size: 24px;
    color: #333;
}

@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
}
```

**Checkpoint**: All dependencies installed, directory structure ready, fixtures created

---

## Phase 1: US5 - Path Resolution (Foundation)

**User Story**: US5 - Path Resolution Strategy
**Goal**: Implement path resolution for import statements
**Priority**: P1 (Foundation - Required by all other stories)
**Independent Test Criteria**: Can resolve relative paths to absolute paths correctly

**Tasks**:

### T009: [US5][TDD-Red] Write tests for IAssetLoader interface
**File**: `packages/language/src/asset-loading/__tests__/asset-loader.spec.ts`
- Test: `fileExists()` returns true for existing file
- Test: `fileExists()` returns false for missing file
- Test: `loadFile()` returns content for existing file
- Test: `loadFile()` throws AssetLoadError for missing file
- Test: `resolvePath()` resolves same-directory path `"./file.html"`
- Test: `resolvePath()` resolves parent directory path `"../file.html"`
- Test: `resolvePath()` resolves nested directory path `"./dir/file.html"`

### T010: [US5] Define IAssetLoader interface
**File**: `packages/language/src/asset-loading/asset-loader.ts`
```typescript
export interface IAssetLoader {
  loadFile(absolutePath: string): string;
  fileExists(absolutePath: string): boolean;
  resolvePath(sourcePath: string, importPath: string): string;
}

export class AssetLoadError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AssetLoadError';
  }
}
```

### T011: [US5][TDD-Green] Implement NodeAssetLoader.fileExists()
**File**: `packages/language/src/asset-loading/asset-loader.ts`
```typescript
import { existsSync } from 'node:fs';

export class NodeAssetLoader implements IAssetLoader {
  fileExists(absolutePath: string): boolean {
    return existsSync(absolutePath);
  }
}
```
- Run tests - should pass `fileExists()` tests

### T012: [US5][TDD-Green] Implement NodeAssetLoader.loadFile()
**File**: `packages/language/src/asset-loading/asset-loader.ts`
```typescript
import { readFileSync } from 'node:fs';

loadFile(absolutePath: string): string {
  try {
    return readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    throw new AssetLoadError(
      `Failed to load file: ${absolutePath}`,
      absolutePath,
      err as Error
    );
  }
}
```
- Run tests - should pass `loadFile()` tests

### T013: [US5][TDD-Green] Implement NodeAssetLoader.resolvePath()
**File**: `packages/language/src/asset-loading/asset-loader.ts`
```typescript
import { dirname, resolve } from 'node:path';

resolvePath(sourcePath: string, importPath: string): string {
  const sourceDir = dirname(sourcePath);
  return resolve(sourceDir, importPath);
}
```
- Run tests - should pass all `resolvePath()` tests

### T014: [US5][P] Create MockAssetLoader for testing
**File**: `packages/language/src/asset-loading/__tests__/mock-asset-loader.ts`
```typescript
export class MockAssetLoader implements IAssetLoader {
  constructor(private files: Map<string, string> = new Map()) {}

  addFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  fileExists(absolutePath: string): boolean {
    return this.files.has(absolutePath);
  }

  loadFile(absolutePath: string): string {
    const content = this.files.get(absolutePath);
    if (!content) {
      throw new AssetLoadError('File not found', absolutePath);
    }
    return content;
  }

  resolvePath(sourcePath: string, importPath: string): string {
    return resolve(dirname(sourcePath), importPath);
  }
}
```

### T015: [US5] Run Biome check
```bash
npm run check
```

### T016: [US5] Run TypeScript check
```bash
npm run typecheck
```

### T017: [US5] Verify test coverage for Phase 1
```bash
npm run test -- asset-loader.spec.ts
```
- Verify coverage ≥ 80% for asset-loader.ts

### T018: [US5] Create index file for asset-loading module
**File**: `packages/language/src/asset-loading/index.ts`
```typescript
export * from './asset-loader.js';
export * from './types.js';
```

**Checkpoint**: ✅ US5 Complete - Path resolution working, fully tested

---

## Phase 2: US1 - File Existence Validation

**User Story**: US1 - File Existence Validation
**Goal**: Validate that imported files exist before compilation proceeds
**Priority**: P1 (High - Foundational check)
**Dependencies**: US5 (Path Resolution)
**Independent Test Criteria**: Compilation fails with clear error when imported file is missing

**Tasks**:

### T019: [US1][TDD-Red] Write tests for file existence validation
**File**: `packages/language/src/asset-loading/__tests__/file-existence.spec.ts`
- Test: Missing file returns AssetError with type 'missing-file'
- Test: Existing file returns no error
- Test: Error includes relative path
- Test: Error includes resolved absolute path
- Test: Error includes helpful hint

### T020: [US1] Create file existence validator function
**File**: `packages/language/src/asset-loading/file-existence-validator.ts`
```typescript
export function validateFileExists(
  importPath: string,
  absolutePath: string,
  loader: IAssetLoader,
  sourceLocation: SourceLocation
): AssetError | null {
  if (!loader.fileExists(absolutePath)) {
    return {
      type: 'missing-file',
      filePath: importPath,
      absolutePath,
      sourceLocation,
      message: `Cannot find file '${importPath}'`,
      hint: 'Check file name spelling and path'
    };
  }
  return null;
}
```

### T021: [US1][TDD-Green] Pass file existence tests
- Run tests - should pass all file existence validation tests

### T022: [US1][P] Create invalid HTML fixture (unclosed tag)
**File**: `packages/language/src/asset-loading/__fixtures__/assets/invalid-unclosed-tag.html`
```html
<div>
    <span>Hello
    <!-- Missing </span> and </div> -->
```

### T023: [US1][P] Create invalid HTML fixture (mismatched tag)
**File**: `packages/language/src/asset-loading/__fixtures__/assets/invalid-mismatched-tag.html`
```html
<div>
    <span>Hello</div></span>
```

### T024: [US1][P] Create invalid CSS fixture (missing brace)
**File**: `packages/language/src/asset-loading/__fixtures__/assets/invalid-missing-brace.css`
```css
.container {
    margin: 0 auto;
/* Missing } */
```

### T025: [US1] Run Biome check
```bash
npm run check
```

### T026: [US1] Verify test coverage
```bash
npm run test -- file-existence.spec.ts
```

**Checkpoint**: ✅ US1 Complete - File existence validation working

---

## Phase 3: US2 - HTML Validation

**User Story**: US2 - HTML Content Loading & Validation
**Goal**: Load and validate HTML syntax at compile time
**Priority**: P1 (High - Core validation)
**Dependencies**: US5 (Path Resolution)
**Independent Test Criteria**: Compilation fails for malformed HTML with specific error locations

**Tasks**:

### T027: [US2][TDD-Red] Write tests for HTML validator
**File**: `packages/language/src/validators/assets/__tests__/html-validator.spec.ts`
- Test: Valid HTML returns empty error array
- Test: Unclosed tag detected with error
- Test: Mismatched closing tag detected
- Test: Self-closing tags allowed (`<img />`, `<br />`)
- Test: Nested tags validated correctly
- Test: Error includes line number
- Test: Error includes helpful hint

### T028: [US2] Define IHtmlValidator interface
**File**: `packages/language/src/validators/assets/html-validator.ts`
```typescript
import { Parser } from 'htmlparser2';
import type { HtmlValidationError } from '../../asset-loading/types.js';

export interface IHtmlValidator {
  validate(html: string, filePath: string): HtmlValidationError[];
}
```

### T029: [US2][TDD-Green] Implement HtmlValidator class (unclosed tags)
**File**: `packages/language/src/validators/assets/html-validator.ts`
```typescript
export class HtmlValidator implements IHtmlValidator {
  validate(html: string, filePath: string): HtmlValidationError[] {
    const errors: HtmlValidationError[] = [];
    const tagStack: Array<{ name: string; startIndex: number }> = [];

    const parser = new Parser({
      onopentag(name, attributes) {
        tagStack.push({ name, startIndex: parser.startIndex });
      },
      onclosetag(name, isImplied) {
        // Check for unclosed tags
        if (tagStack.length === 0) {
          // Unexpected closing tag
          return;
        }
        const opened = tagStack.pop();
        if (opened!.name !== name) {
          // Mismatched tag (handle in next task)
        }
      },
      onend() {
        // Check for tags that were never closed
        if (tagStack.length > 0) {
          const unclosed = tagStack.map(t => `<${t.name}>`).join(', ');
          errors.push({
            message: `Unclosed tags: ${unclosed}`,
            line: convertIndexToLine(html, tagStack[0].startIndex),
            column: 0,
            hint: 'Add closing tags for all opened tags'
          });
        }
      }
    }, {
      lowerCaseTags: false,
      withStartIndices: true
    });

    parser.write(html);
    parser.end();

    return errors;
  }
}
```

### T030: [US2][TDD-Green] Add mismatched tag detection
**File**: `packages/language/src/validators/assets/html-validator.ts`
```typescript
onclosetag(name, isImplied) {
  if (tagStack.length === 0) {
    errors.push({
      message: `Unexpected closing tag </${name}>`,
      line: convertIndexToLine(html, parser.startIndex),
      column: 0,
      hint: 'Remove this closing tag or add matching opening tag'
    });
    return;
  }

  const opened = tagStack.pop()!;
  if (opened.name !== name) {
    errors.push({
      message: `Mismatched closing tag: expected </${opened.name}>, found </${name}>`,
      line: convertIndexToLine(html, parser.startIndex),
      column: 0,
      hint: 'Check tag nesting - closing tags must match opening tags'
    });
    tagStack.push(opened); // Put it back for further checking
  }
}
```

### T031: [US2][P] Implement index-to-line conversion utility
**File**: `packages/language/src/validators/assets/html-validator.ts`
```typescript
function convertIndexToLine(content: string, index: number): number {
  const upToIndex = content.substring(0, index);
  return upToIndex.split('\n').length;
}
```

### T032: [US2][TDD-Red] Write tests for valid HTML structures
**File**: `packages/language/src/validators/assets/__tests__/html-validator.spec.ts`
- Test: Deeply nested HTML validates
- Test: Multiple root elements validate
- Test: Empty HTML validates
- Test: HTML with attributes validates
- Test: HTML with comments validates

### T033: [US2][TDD-Green] Ensure all valid HTML tests pass
- Run tests - verify all valid HTML cases pass

### T034: [US2][TDD-Red] Write tests for invalid HTML structures
**File**: `packages/language/src/validators/assets/__tests__/html-validator.spec.ts`
- Test: Multiple unclosed tags all reported
- Test: Nested mismatched tags detected
- Test: Line numbers accurate for errors

### T035: [US2][TDD-Green] Ensure all invalid HTML tests pass
- Run tests - verify all invalid HTML cases caught

### T036: [US2][P] Run Biome check
```bash
npm run check
```

### T037: [US2][P] Run TypeScript check
```bash
npm run typecheck
```

### T038: [US2] Verify test coverage for HTML validator
```bash
npm run test -- html-validator.spec.ts
```
- Verify coverage ≥ 80%

**Checkpoint**: ✅ US2 Complete - HTML validation working with detailed error reporting

---

## Phase 4: US3 - CSS Validation

**User Story**: US3 - CSS Content Loading & Validation
**Goal**: Load and validate CSS syntax at compile time
**Priority**: P1 (High - Core validation)
**Dependencies**: US5 (Path Resolution)
**Independent Test Criteria**: Compilation fails for malformed CSS with specific error locations

**Tasks**:

### T039: [US3][TDD-Red] Write tests for CSS validator
**File**: `packages/language/src/validators/assets/__tests__/css-validator.spec.ts`
- Test: Valid CSS returns empty error array
- Test: Unbalanced braces detected
- Test: Invalid selector syntax detected
- Test: Invalid at-rule detected
- Test: Error includes line number
- Test: Error includes helpful hint

### T040: [US3] Define ICssValidator interface
**File**: `packages/language/src/validators/assets/css-validator.ts`
```typescript
import * as csstree from 'css-tree';
import type { CssValidationError } from '../../asset-loading/types.js';

export interface ICssValidator {
  validate(css: string, filePath: string): CssValidationError[];
}
```

### T041: [US3][TDD-Green] Implement CssValidator class
**File**: `packages/language/src/validators/assets/css-validator.ts`
```typescript
export class CssValidator implements ICssValidator {
  validate(css: string, filePath: string): CssValidationError[] {
    const errors: CssValidationError[] = [];

    try {
      csstree.parse(css, {
        filename: filePath,
        positions: true,
        onParseError(error) {
          const loc = error.location;
          errors.push({
            message: error.message,
            line: loc?.start.line || 0,
            column: loc?.start.column || 0,
            hint: getCssErrorHint(error.message)
          });
        }
      });
    } catch (err: any) {
      // Catch any errors css-tree throws
      errors.push({
        message: err.message || 'CSS parsing failed',
        line: err.line || 0,
        column: err.column || 0,
        hint: 'Check CSS syntax'
      });
    }

    return errors;
  }
}
```

### T042: [US3][P] Implement CSS error hint generator
**File**: `packages/language/src/validators/assets/css-validator.ts`
```typescript
function getCssErrorHint(errorMessage: string): string {
  if (errorMessage.includes('Unexpected')) {
    return 'Check for missing semicolons or braces';
  }
  if (errorMessage.includes('brace') || errorMessage.includes('}')) {
    return 'Ensure all braces are balanced - each { needs a matching }';
  }
  if (errorMessage.includes('selector')) {
    return 'Check selector syntax - classes start with ., IDs with #';
  }
  if (errorMessage.includes('@')) {
    return 'Check at-rule syntax (@media, @import, etc.)';
  }
  return 'Review CSS syntax rules';
}
```

### T043: [US3][TDD-Red] Write tests for valid CSS structures
**File**: `packages/language/src/validators/assets/__tests__/css-validator.spec.ts`
- Test: Complex selectors validate (`.class > .child`, `div[attr="value"]`)
- Test: Media queries validate
- Test: Keyframes validate
- Test: CSS variables validate (`--custom-property`)
- Test: Multiple rules validate

### T044: [US3][TDD-Green] Ensure all valid CSS tests pass
- Run tests - verify all valid CSS cases pass

### T045: [US3][TDD-Red] Write tests for invalid CSS structures
**File**: `packages/language/src/validators/assets/__tests__/css-validator.spec.ts`
- Test: Missing closing brace detected
- Test: Invalid property syntax detected
- Test: Malformed media query detected
- Test: Line numbers accurate for errors

### T046: [US3][TDD-Green] Ensure all invalid CSS tests pass
- Run tests - verify all invalid CSS cases caught

### T047: [US3][P] Run Biome check
```bash
npm run check
```

### T048: [US3][P] Run TypeScript check
```bash
npm run typecheck
```

### T049: [US3] Verify test coverage for CSS validator
```bash
npm run test -- css-validator.spec.ts
```
- Verify coverage ≥ 80%

### T050: [US3] Create index file for asset validators
**File**: `packages/language/src/validators/assets/index.ts`
```typescript
export * from './html-validator.js';
export * from './css-validator.js';
```

**Checkpoint**: ✅ US3 Complete - CSS validation working with detailed error reporting

---

## Phase 5: US4 - Media File Validation

**User Story**: US4 - Media File Existence Check
**Goal**: Verify media files exist (no format validation)
**Priority**: P2 (Medium - Simple existence check)
**Dependencies**: US5 (Path Resolution)
**Independent Test Criteria**: Compilation fails for missing media files

**Tasks**:

### T051: [US4][TDD-Red] Write tests for media file validation
**File**: `packages/language/src/asset-loading/__tests__/media-validator.spec.ts`
- Test: Existing media file passes validation
- Test: Missing media file returns error
- Test: Any file extension accepted (no format validation)
- Test: Error message includes file path

### T052: [US4] Create media file validator function
**File**: `packages/language/src/asset-loading/media-validator.ts`
```typescript
export function validateMediaFile(
  importPath: string,
  absolutePath: string,
  loader: IAssetLoader,
  sourceLocation: SourceLocation
): AssetError | null {
  // Only check existence, no format validation
  if (!loader.fileExists(absolutePath)) {
    return {
      type: 'missing-file',
      filePath: importPath,
      absolutePath,
      sourceLocation,
      message: `Cannot find media file '${importPath}'`,
      hint: 'Check file name and path - media files can be any format'
    };
  }
  return null;
}
```

### T053: [US4][TDD-Green] Pass media validation tests
- Run tests - all media validation tests should pass

### T054: [US4][P] Run Biome check
```bash
npm run check
```

### T055: [US4][P] Run TypeScript check
```bash
npm run typecheck
```

### T056: [US4] Verify test coverage
```bash
npm run test -- media-validator.spec.ts
```

**Checkpoint**: ✅ US4 Complete - Media file existence checking working

---

## Phase 6: Integration - Asset Validation Service

**Goal**: Integrate all validators into unified service and connect to Langium
**Dependencies**: US1, US2, US3, US4, US5
**Independent Test Criteria**: Full end-to-end validation through Langium pipeline

**Tasks**:

### T057: [Integration][TDD-Red] Write tests for AssetValidationService
**File**: `packages/language/src/asset-loading/__tests__/asset-validation-service.spec.ts`
- Test: Single import validated successfully
- Test: Missing file error collected
- Test: Invalid HTML error collected
- Test: Invalid CSS error collected
- Test: Multiple errors collected together
- Test: Mixed valid/invalid imports handled
- Test: Service uses correct validators based on asset type

### T058: [Integration] Define IAssetValidationService interface
**File**: `packages/language/src/asset-loading/asset-validation-service.ts`
```typescript
export interface IAssetValidationService {
  validateAssets(program: Program, sourcePath: string): AssetError[];
}
```

### T059: [Integration] Implement AssetValidationService class
**File**: `packages/language/src/asset-loading/asset-validation-service.ts`
```typescript
import { getImports } from '../utils/program-helpers.js';
import { inferAssetType } from '../utils/asset-type-inference.js';
import { isDefaultImport } from '../utils/ast-helpers.js';

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
      const importPath = importStmt.path;
      const absolutePath = this.loader.resolvePath(sourcePath, importPath);

      // 2. Check existence
      if (!this.loader.fileExists(absolutePath)) {
        errors.push({
          type: 'missing-file',
          filePath: importPath,
          absolutePath,
          sourceLocation: extractSourceLocation(importStmt),
          message: `Cannot find file '${importPath}'`,
          hint: 'Check file name spelling and path'
        });
        continue; // Skip further validation if file doesn't exist
      }

      // 3. Load contents
      let contents: string;
      try {
        contents = this.loader.loadFile(absolutePath);
      } catch (err) {
        errors.push({
          type: 'load-error',
          filePath: importPath,
          absolutePath,
          sourceLocation: extractSourceLocation(importStmt),
          message: `Failed to load file '${importPath}'`,
          hint: 'Check file permissions',
          details: err instanceof Error ? err.message : String(err)
        });
        continue;
      }

      // 4. Validate based on asset type
      const assetType = inferAssetType(importStmt);

      if (assetType === 'html') {
        const htmlErrors = this.htmlValidator.validate(contents, absolutePath);
        errors.push(...htmlErrors.map(e => this.toAssetError(e, importStmt, importPath, absolutePath, 'invalid-html')));
      } else if (assetType === 'css') {
        const cssErrors = this.cssValidator.validate(contents, absolutePath);
        errors.push(...cssErrors.map(e => this.toAssetError(e, importStmt, importPath, absolutePath, 'invalid-css')));
      }
      // 'media' type: no content validation, existence check only (already done)
    }

    return errors;
  }

  private toAssetError(
    validationError: HtmlValidationError | CssValidationError,
    importStmt: ImportStatement,
    filePath: string,
    absolutePath: string,
    errorType: 'invalid-html' | 'invalid-css'
  ): AssetError {
    return {
      type: errorType,
      filePath,
      absolutePath,
      sourceLocation: extractSourceLocation(importStmt),
      message: `${errorType === 'invalid-html' ? 'Invalid HTML' : 'Invalid CSS'} in '${filePath}': ${validationError.message}`,
      hint: validationError.hint,
      details: `At ${absolutePath}:${validationError.line}:${validationError.column}`
    };
  }
}
```

### T060: [Integration][P] Implement source location extractor
**File**: `packages/language/src/asset-loading/asset-validation-service.ts`
```typescript
function extractSourceLocation(importStmt: ImportStatement): SourceLocation {
  const cstNode = importStmt.$cstNode;
  if (!cstNode) {
    return { file: 'unknown', line: 0, column: 0 };
  }
  return {
    file: AstUtils.getDocument(importStmt).uri.fsPath,
    line: cstNode.range.start.line + 1,
    column: cstNode.range.start.character + 1
  };
}
```

### T061: [Integration][TDD-Green] Pass all service integration tests
- Run tests - all AssetValidationService tests should pass

### T062: [Integration] Update asset-loading index
**File**: `packages/language/src/asset-loading/index.ts`
```typescript
export * from './asset-loader.js';
export * from './asset-validation-service.js';
export * from './file-existence-validator.js';
export * from './media-validator.js';
export * from './types.js';
```

### T063: [Integration][TDD-Red] Write tests for Langium validator integration
**File**: `packages/language/src/__tests__/asset-validation-integration.spec.ts`
- Test: Valid imports pass validation
- Test: Missing file triggers Langium error
- Test: Invalid HTML triggers Langium error
- Test: Invalid CSS triggers Langium error
- Test: Multiple errors all reported
- Test: Error locations mapped correctly to Langium diagnostics

### T064: [Integration] Add AssetValidationService to EligianValidator
**File**: `packages/language/src/eligian-validator.ts`

Add to constructor:
```typescript
constructor(
  services: EligianServices,
  private assetValidationService: IAssetValidationService
) {
  super(services);
}
```

### T065: [Integration] Implement checkAssetValidation method
**File**: `packages/language/src/eligian-validator.ts`
```typescript
@check('Program')
checkAssetValidation(program: Program, accept: ValidationAcceptor): void {
  // Get source file path from document
  const document = AstUtils.getDocument(program);
  const sourcePath = URI.parse(document.uri).fsPath;

  // Validate all assets
  const errors = this.assetValidationService.validateAssets(program, sourcePath);

  // Report errors via Langium
  for (const error of errors) {
    const importStmt = this.findImportByPath(program, error.filePath);
    if (importStmt) {
      accept('error', error.message, {
        node: importStmt,
        property: 'path',
        code: error.type,
      });
    }
  }
}

private findImportByPath(program: Program, path: string): ImportStatement | undefined {
  const imports = getImports(program);
  return imports.find(imp => imp.path === path);
}
```

### T066: [Integration] Wire up AssetValidationService in module
**File**: `packages/language/src/eligian-module.ts`

Add service creation:
```typescript
export function createEligianServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Eligian: EligianServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    EligianGeneratedSharedModule
  );

  const Eligian = inject(
    createDefaultModule({ shared }),
    EligianGeneratedModule,
    EligianValidationModule,
    {
      // Add asset validation services
      validation: {
        AssetLoader: () => new NodeAssetLoader(),
        HtmlValidator: () => new HtmlValidator(),
        CssValidator: () => new CssValidator(),
        AssetValidationService: (services) => new AssetValidationService(
          services.validation.AssetLoader(),
          services.validation.HtmlValidator(),
          services.validation.CssValidator()
        )
      }
    }
  );

  shared.ServiceRegistry.register(Eligian);
  return { shared, Eligian };
}
```

### T067: [Integration][TDD-Green] Pass all Langium integration tests
- Run tests - all integration tests should pass

### T068: [Integration][P] Run Biome check
```bash
npm run check
```

### T069: [Integration][P] Run TypeScript check
```bash
npm run typecheck
```

### T070: [Integration] Run full test suite
```bash
npm run test
```
- Verify all 635+ existing tests still pass
- Verify new asset validation tests pass

### T071: [Integration] Verify coverage for asset validation
```bash
npm run test -- --coverage
```
- Check coverage ≥ 80% for all new asset validation code

**Checkpoint**: ✅ Integration Complete - Asset validation fully integrated into Langium pipeline

---

## Phase 7: US6 - Error Reporting & Transformer Integration

**User Story**: US6 - Error Reporting
**Goal**: Provide clear, actionable error messages and embed assets in output
**Priority**: P2 (Medium - Enhances UX)
**Dependencies**: Phase 6 (Integration)
**Independent Test Criteria**: Error messages are clear and include all required information; assets embedded correctly

**Tasks**:

### T072: [US6][TDD-Red] Write tests for error formatter
**File**: `packages/language/src/asset-loading/__tests__/error-formatter.spec.ts`
- Test: Format missing file error with all fields
- Test: Format invalid HTML error with details
- Test: Format invalid CSS error with details
- Test: Format multiple errors together
- Test: Error includes relative and absolute paths
- Test: Error includes source location
- Test: Error includes helpful hint

### T073: [US6] Implement error formatter
**File**: `packages/language/src/asset-loading/error-formatter.ts`
```typescript
export function formatAssetError(error: AssetError): string {
  return `Asset Error: ${getErrorTypeName(error.type)}
  File: ${error.filePath}
  Resolved Path: ${error.absolutePath}
  Source: ${error.sourceLocation.file}:${error.sourceLocation.line}:${error.sourceLocation.column}
  Reason: ${error.message}
  Hint: ${error.hint}${error.details ? `\n  Details: ${error.details}` : ''}`;
}

export function formatMultipleErrors(errors: AssetError[]): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return formatAssetError(errors[0]);

  let output = `Asset Errors Found (${errors.length}):\n\n`;
  errors.forEach((error, index) => {
    output += `${index + 1}. ${formatAssetError(error)}\n\n`;
  });
  return output;
}

function getErrorTypeName(type: AssetError['type']): string {
  switch (type) {
    case 'missing-file': return 'Missing File';
    case 'invalid-html': return 'Invalid HTML';
    case 'invalid-css': return 'Invalid CSS';
    case 'load-error': return 'Load Error';
  }
}
```

### T074: [US6][TDD-Green] Pass error formatter tests
- Run tests - all formatting tests should pass

### T075: [US6][TDD-Red] Write tests for transformer import handling
**File**: `packages/language/src/compiler/__tests__/transformer-assets.spec.ts`
- Test: HTML content embedded in layoutTemplate (no prefix)
- Test: CSS relative paths added to cssFiles array
- Test: Import map includes all imports
- Test: Import map uses keywords for default imports (layout, styles, provider)
- Test: Import map uses declared names for named imports
- Test: HTML content loaded correctly
- Test: CSS content loaded correctly (for import map)

### T076: [US6] Add IAssetLoader to transformer dependencies
**File**: `packages/language/src/compiler/ast-transformer.ts`

Add to constructor:
```typescript
constructor(
  private assetLoader: IAssetLoader,
  private sourcePath: string
) {}
```

### T077: [US6] Implement transformImports method
**File**: `packages/language/src/compiler/ast-transformer.ts`
```typescript
private transformImports(program: Program): {
  layoutTemplate?: string;
  cssFiles: string[];
  importMap: Record<string, string>;
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
        // Assign HTML content directly (no prefix)
        layoutTemplate = content;
        importMap.layout = content;
      } else if (keyword === 'styles') {
        // Add relative CSS path (not absolute)
        cssFiles.push(importStmt.path);
        importMap.styles = content;
      } else if (keyword === 'provider') {
        // Store provider path (relative)
        importMap.provider = importStmt.path;
      }
    } else {
      // Named imports: import name from './path'
      const importName = importStmt.name;
      importMap[importName] = content;
    }
  }

  return { layoutTemplate, cssFiles, importMap };
}
```

### T078: [US6] Integrate transformImports into main transform
**File**: `packages/language/src/compiler/ast-transformer.ts`

Update `transform()` method:
```typescript
transform(program: Program): IEngineConfiguration {
  const { layoutTemplate, cssFiles, importMap } = this.transformImports(program);

  return {
    id: generateId(),
    engine: { systemName: 'eligius' },
    containerSelector: this.extractContainerSelector(program),
    cssFiles,
    language: 'en-US',
    layoutTemplate: layoutTemplate || '<div></div>',
    availableLanguages: [{ languageCode: 'en-US', label: 'English' }],
    initActions: [],
    actions: this.transformActions(program),
    timelines: this.transformTimelines(program),
    labels: []
  };
}
```

### T079: [US6][TDD-Green] Pass transformer integration tests
- Run tests - all transformer tests should pass

### T080: [US6][P] Run Biome check
```bash
npm run check
```

### T081: [US6][P] Run TypeScript check
```bash
npm run typecheck
```

**Checkpoint**: ✅ US6 Complete - Error reporting polished, assets embedded in output

---

## Phase 8: Polish & Documentation

**Goal**: Final polish, documentation updates, and example files
**Dependencies**: All phases complete
**Independent Test Criteria**: Documentation accurate, examples work, all tests pass

**Tasks**:

### T082: [Polish] Update LANGUAGE_SPEC.md with asset loading
**File**: `LANGUAGE_SPEC.md`
- Document import statement behavior with asset loading
- Document validation rules (HTML, CSS)
- Document error messages and troubleshooting
- Add examples showing compilation errors

### T083: [Polish] Create comprehensive example file
**File**: `examples/asset-loading-demo.eligian`
```eligian
// Example showing asset loading and validation

layout './layout.html'
styles './styles.css'

import header from './components/header.html'
import footer from './components/footer.html'
import logo from './assets/logo.png'

action showPage [
  selectElement("#app")
  setElementContent(header)
]

timeline "demo" in "#app" using raf {
  at 0s..2s showPage()
}
```

### T084: [Polish][P] Create example HTML files
**File**: `examples/assets/layout.html`
**File**: `examples/assets/components/header.html`
**File**: `examples/assets/components/footer.html`
- Valid HTML structures for testing

### T085: [Polish][P] Create example CSS file
**File**: `examples/assets/styles.css`
- Valid CSS for testing

### T086: [Polish] Run full test suite
```bash
npm run test
```
- Verify all tests pass (target: 715+ tests)
- Verify coverage ≥ 80%

**Checkpoint**: ✅ Feature 010 Complete - All user stories implemented, tested, documented

---

## Dependency Graph

```
Phase 0 (Setup)
  ↓
Phase 1 (US5: Path Resolution) ← Foundation for all
  ↓
  ├─→ Phase 2 (US1: File Existence)
  ├─→ Phase 3 (US2: HTML Validation)
  ├─→ Phase 4 (US3: CSS Validation)
  └─→ Phase 5 (US4: Media Files)
        ↓
      Phase 6 (Integration)
        ↓
      Phase 7 (US6: Error Reporting)
        ↓
      Phase 8 (Polish)
```

**Parallelizable Phases**: 2, 3, 4, 5 can run in parallel after Phase 1 completes

---

## Parallel Execution Examples

### Example 1: Phase 1 (Path Resolution)
```bash
# Can run in parallel (different files):
- T014: Create MockAssetLoader [P]
- T015: Run Biome check [P]
- T016: Run TypeScript check [P]

# Must run sequentially (same file):
- T010: Define IAssetLoader interface
- T011: Implement fileExists()
- T012: Implement loadFile()
- T013: Implement resolvePath()
```

### Example 2: Validation Phases (After Phase 1)
```bash
# These entire phases can run in parallel:
git checkout -b feat/html-validation
# Work on Phase 3 (US2)

git checkout -b feat/css-validation
# Work on Phase 4 (US3)

git checkout -b feat/file-existence
# Work on Phase 2 (US1)

git checkout -b feat/media-validation
# Work on Phase 5 (US4)
```

---

## Implementation Strategy

**Approach**: User Story Increments (Independent, Testable)

1. **Phase 0**: Setup foundation (1 hour)
2. **Phase 1 (US5)**: Path resolution - foundational for all (3 hours)
3. **Phases 2-5 (US1-4)**: Can be implemented in parallel by different devs (8 hours total, 2-3 hours per story)
4. **Phase 6**: Integration (4 hours)
5. **Phase 7 (US6)**: Error reporting polish (3 hours)
6. **Phase 8**: Documentation (2 hours)

**Total Estimated Time**: 21 hours for sequential, 15 hours with parallelization

**MVP Scope** (Minimal Viable Product):
- Phase 0: Setup
- Phase 1: US5 (Path Resolution)
- Phase 2: US1 (File Existence)
- Phase 6: Integration (basic)
- Phase 7: US6 (Error Reporting - basic)

**MVP Delivers**: File existence validation with clear errors - addresses most critical need

---

## Quality Metrics

**Test Coverage Goals**:
- Target: 80% minimum for all new code
- Current baseline: 635 tests passing
- Expected final: 715+ tests passing (80+ new tests)

**Code Quality**:
- Zero Biome errors/warnings
- Zero TypeScript type errors
- All constitution principles satisfied

**Performance**:
- Asset validation should add < 100ms to compilation time
- Memory usage should stay reasonable (< 100MB for typical projects)

---

**Status**: ✅ Ready for Implementation
**Next Action**: Begin Phase 0 (Setup & Dependencies)
