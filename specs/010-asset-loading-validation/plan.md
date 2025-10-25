# Implementation Plan: Asset Loading & Validation

**Feature**: 010-asset-loading-validation
**Status**: Planning
**Created**: 2025-10-25
**Updated**: 2025-10-25

---

## Technical Context

### Dependencies

**Required External Libraries** (Principle XIX - User Approved):
1. **HTML Parser**: `htmlparser2` + `domutils` + `domhandler` (MIT License)
   - Purpose: Parse and validate HTML syntax, DOM querying for CSS extraction
   - Rationale:
     - Lightweight (33.7 KB core, ~45 KB total with domutils)
     - Fastest performance (no wrapper overhead)
     - domutils provides jQuery-like querying without Cheerio overhead
     - Future-proof: enables CSS class/ID extraction (future feature)
   - Alternatives considered:
     - Cheerio (92 KB, wraps htmlparser2, slower)
     - parse5 (~50 KB, full HTML5 spec, heavier)
   - **Status**: ✅ APPROVED

2. **CSS Parser**: `css-tree` (MIT License)
   - Purpose: Parse and validate CSS syntax
   - Rationale: CSS spec compliant, focused syntax validation
   - Alternative considered: postcss (plugin ecosystem, more complex)
   - **Status**: ✅ APPROVED

**Built-in Node.js Modules** (No approval needed):
- `fs` - File I/O operations
- `path` - Path resolution and manipulation

### Integration Points

1. **Langium Validator** (`eligian-validator.ts`):
   - Add new `@check('Program')` method for asset validation
   - Integrate `AssetValidationService` via dependency injection
   - Report errors via `ValidationAcceptor`

2. **AST Transformer** (`ast-transformer.ts`):
   - Add `IAssetLoader` dependency
   - Implement `transformImports()` method
   - Generate `layoutTemplate`, `cssFiles`, and `importMap` in output

3. **Eligius Output** (`IEngineConfiguration`):
   - `layoutTemplate: string` - Direct HTML content (no prefix)
   - `cssFiles: string[]` - Relative CSS paths (as written in source)
   - Import map stored separately for runtime access

### Architecture Decisions

**Asset Loader Pattern**:
- Interface-based design (`IAssetLoader`) for testability
- `NodeAssetLoader` for production (real file system)
- `MockAssetLoader` for testing (in-memory fixtures)

**Validator Pattern** (Constitution Principle X):
- Pure validation functions (business logic)
- Thin Langium adapters (framework integration)
- Example: `validateAssetType()` (pure) → `checkAssetType()` (Langium wrapper)

**Error Collection Strategy**:
- Collect ALL errors, don't stop at first failure
- Provides complete feedback in one compilation pass
- Better developer experience

**Path Handling**:
- Resolve to absolute paths for validation (check file exists)
- Keep relative paths in output (as written in source)
- Resolution to absolute happens at runtime in preview

---

## Constitution Check

### Principle I: Simplicity, Documentation, and Maintainability
✅ **Compliant**
- Clear separation of concerns (Loader, Validator, Service)
- Well-documented interfaces with purpose comments
- Straightforward file I/O without over-engineering

### Principle II: Comprehensive Testing (NON-NEGOTIABLE)
✅ **Compliant** - TDD Workflow Required
- **Red**: Write tests first for each component
- **Green**: Implement minimal code to pass
- **Refactor**: Clean up while keeping tests green
- 80+ tests planned across 8 test suites
- Unit tests: Asset Loader, HTML Validator, CSS Validator, Validation Service
- Integration tests: Full compilation pipeline with real fixtures
- Coverage threshold: 80% (will be verified with `npm run test`)

### Principle III: No Gold-Plating
✅ **Compliant**
- Focused on requirements: file validation, HTML/CSS syntax
- Explicitly scoped out: media format validation, preprocessing, optimization
- No unnecessary features

### Principle VI: Functional Programming with Pragmatic Performance
✅ **Compliant**
- External immutability: All service methods return new data
- Internal mutation allowed: Building error arrays, loading file contents
- Pure validation functions: `validateAssetType()`, `inferAssetType()`

### Principle X: Validation Pattern (NON-NEGOTIABLE)
✅ **Compliant**
- Pure validator functions with business logic
- Thin Langium adapters calling pure functions
- Example pattern followed from existing validators

### Principle XI: Code Quality (NON-NEGOTIABLE)
✅ **Compliant** - Will Run After Each Task
```bash
# After each task completion:
npm run check     # Biome lint + format + auto-fix
npm run typecheck # TypeScript type checking
npm run test      # Verify no regressions
```

### Principle XVIII: Research & Documentation Standards (NON-NEGOTIABLE)
✅ **Compliant**
- Used context7 for researching HTML parsers (htmlparser2 vs parse5)
- Used context7 for researching CSS parsers (css-tree vs postcss)
- Verified against official documentation
- Documented research decisions in spec

### Principle XIX: Dependency Management (NON-NEGOTIABLE)
⚠️ **REQUIRES USER APPROVAL**
- New dependencies identified: `htmlparser2`, `css-tree`
- **ACTION REQUIRED**: User must approve before proceeding with installation
- Alternative: User may prefer different libraries (parse5, postcss)

### Principle XX: Debugging Attempt Limit (NON-NEGOTIABLE)
✅ **Compliant**
- Will track debugging attempts during implementation
- Will consult user after 5 failed attempts

### Principle XXI: Token Efficiency (NON-NEGOTIABLE)
✅ **Compliant**
- No test coverage reports in documentation
- Focus on implementation insights, not data dumps

---

## Phase 0: Research & Library Selection

### Research Tasks

#### R001: HTML Parser Selection
**Decision**: `htmlparser2` + `domutils` + `domhandler`

**Rationale**:
- **Smallest bundle**: 33.7 KB core + ~11 KB domutils = ~45 KB total (vs 92 KB for Cheerio)
- **Fastest performance**: Direct access, no wrapper overhead (Cheerio wraps htmlparser2)
- **Battle-tested**: Used by jsdom, cheerio, and many other tools
- **Future-proof**: domutils provides jQuery-like querying for CSS class/ID extraction
- **Position tracking**: Provides character indices for error reporting

**Alternatives Considered**:
- `Cheerio`: Familiar jQuery API but 2.7x larger, slower, no position info
- `parse5`: Full HTML5 spec compliance, heavier (~50 KB), slower
- Custom parser: Too complex, reinventing the wheel

**API Pattern for Validation**:
```typescript
import { Parser } from 'htmlparser2';

// Validation with error tracking
const errors: HtmlValidationError[] = [];
const tagStack: string[] = [];

const parser = new Parser({
  onopentag(name, attributes) {
    tagStack.push(name);
  },
  onclosetag(name, isImplied) {
    const expected = tagStack.pop();
    if (expected !== name) {
      errors.push({
        message: `Mismatched closing tag: expected </${expected}>, found </${name}>`,
        line: parser.startIndex, // Convert to line/col later
        column: 0,
        hint: 'Check tag nesting'
      });
    }
  },
  onend() {
    // Check for unclosed tags
    if (tagStack.length > 0) {
      errors.push({
        message: `Unclosed tags: ${tagStack.join(', ')}`,
        line: 0,
        column: 0,
        hint: 'Add closing tags'
      });
    }
  }
}, { lowerCaseTags: false, withStartIndices: true });

parser.write(htmlContent);
parser.end();
```

**API Pattern for CSS Class/ID Extraction** (Future Feature):
```typescript
import { parseDocument } from 'htmlparser2';
import { selectAll, getAttributeValue } from 'domutils';

// Build DOM tree
const dom = parseDocument(htmlContent);

// jQuery-like queries: $('[class]')
const classElements = selectAll('[class]', dom);
const classes = new Set<string>();
classElements.forEach(el => {
  const classAttr = getAttributeValue(el, 'class');
  if (classAttr) {
    classAttr.split(/\s+/).forEach(cls => classes.add(cls));
  }
});

// jQuery-like queries: $('[id]')
const idElements = selectAll('[id]', dom);
const ids = new Set<string>();
idElements.forEach(el => {
  const id = getAttributeValue(el, 'id');
  if (id) ids.add(id);
});

return { classes: Array.from(classes), ids: Array.from(ids) };
```

#### R002: CSS Parser Selection
**Decision**: `css-tree`

**Rationale**:
- CSS spec compliant (validates against actual CSS grammar)
- Excellent error reporting with source locations
- Focused on syntax validation (our exact need)
- Well-maintained, active development

**Alternatives Considered**:
- `postcss`: Powerful but complex, designed for transforms not validation
- `css`: Older, less maintained
- Custom parser: Too complex for CSS grammar

**API Pattern**:
```typescript
import * as csstree from 'css-tree';

try {
  const ast = csstree.parse(cssContent, {
    filename: 'style.css',
    positions: true,  // Get line/column info
    onParseError(error) {
      // Capture syntax errors
    }
  });
} catch (err) {
  // Handle parse errors
}
```

#### R003: Path Resolution Strategy
**Decision**: Node.js `path` module with source-relative resolution

**Rationale**:
- Built-in, no dependencies
- Cross-platform (handles Windows/Unix paths)
- Standard pattern: `path.resolve(path.dirname(sourcePath), importPath)`

**Pattern**:
```typescript
import path from 'node:path';

function resolvePath(sourcePath: string, importPath: string): string {
  const sourceDir = path.dirname(sourcePath);
  return path.resolve(sourceDir, importPath);
}
```

#### R004: Error Collection Pattern
**Decision**: Collect all errors, report together

**Rationale**:
- Better DX - developer sees all issues at once
- Matches Langium validation pattern
- Avoids frustrating "fix one, see next" cycle

**Pattern**:
```typescript
const errors: AssetError[] = [];

for (const import of imports) {
  // Validate import, collect errors
  if (hasError) {
    errors.push(error);
    continue; // Don't stop, collect more errors
  }
}

return errors; // Report all at once
```

---

## Phase 1: Data Model & Contracts

### Core Entities

#### 1. AssetLoader
```typescript
export interface IAssetLoader {
  /**
   * Load file contents from absolute path
   * @throws AssetLoadError if file doesn't exist or can't be read
   */
  loadFile(absolutePath: string): string;

  /**
   * Check if file exists at absolute path
   */
  fileExists(absolutePath: string): boolean;

  /**
   * Resolve relative import path to absolute path
   * @param sourcePath - Absolute path to source .eligian file
   * @param importPath - Relative path from import statement
   */
  resolvePath(sourcePath: string, importPath: string): string;
}
```

#### 2. HtmlValidator
```typescript
export interface IHtmlValidator {
  /**
   * Validate HTML syntax
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
```

#### 3. CssValidator
```typescript
export interface ICssValidator {
  /**
   * Validate CSS syntax
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
```

#### 4. AssetValidationService
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
  filePath: string;          // Relative path from source
  absolutePath: string;      // Resolved absolute path
  sourceLocation: SourceLocation;
  message: string;
  hint: string;
  details?: string;
}
```

### Data Flow

```
.eligian source file
        ↓
    [Parser] → AST with ImportStatements
        ↓
    [Validator] → AssetValidationService
        ↓
    ┌─────────────────────┐
    │ For each import:    │
    │ 1. Resolve path     │ → IAssetLoader.resolvePath()
    │ 2. Check exists     │ → IAssetLoader.fileExists()
    │ 3. Load content     │ → IAssetLoader.loadFile()
    │ 4. Validate syntax  │ → IHtmlValidator or ICssValidator
    └─────────────────────┘
        ↓
    AssetError[] → Langium Diagnostics
        ↓
    [Transformer] → Load valid assets
        ↓
    ┌───────────────────────────┐
    │ Output:                   │
    │ - layoutTemplate: string  │ (HTML content)
    │ - cssFiles: string[]      │ (relative paths)
    │ - importMap: Record       │ (all loaded assets)
    └───────────────────────────┘
        ↓
    Eligius JSON Configuration
```

---

## Implementation Strategy

### Phase 1: Asset Loader Foundation (T001-T010)
**Test-First Approach**: Write tests before implementation

1. **T001-T002**: Define interfaces (IAssetLoader, AssetLoadError)
2. **T003**: Write tests for `fileExists()` (TDD Red)
3. **T004**: Implement `NodeAssetLoader.fileExists()` (TDD Green)
4. **T005**: Write tests for `loadFile()` success cases (TDD Red)
5. **T006**: Implement `NodeAssetLoader.loadFile()` (TDD Green)
6. **T007**: Write tests for `loadFile()` error cases (TDD Red)
7. **T008**: Add error handling to `loadFile()` (TDD Green)
8. **T009**: Write tests for `resolvePath()` (TDD Red)
9. **T010**: Implement `NodeAssetLoader.resolvePath()` (TDD Green)
10. **Refactor**: Clean up, run Biome, verify coverage

### Phase 2: HTML Validation (T011-T020)
**Dependencies**: Phase 1 complete, `htmlparser2` approved and installed

1. **T011**: Write tests for valid HTML (TDD Red)
2. **T012**: Implement basic `HtmlValidator` (TDD Green)
3. **T013**: Write tests for unclosed tags (TDD Red)
4. **T014**: Add unclosed tag detection (TDD Green)
5. **T015**: Write tests for mismatched tags (TDD Red)
6. **T016**: Add mismatched tag detection (TDD Green)
7. **T017**: Write tests for invalid nesting (TDD Red)
8. **T018**: Add invalid nesting detection (TDD Green)
9. **T019**: Write tests for line/column extraction (TDD Red)
10. **T020**: Implement error location tracking (TDD Green)
11. **Refactor**: Clean up, run Biome, verify coverage

### Phase 3: CSS Validation (T021-T030)
**Dependencies**: Phase 1 complete, `css-tree` approved and installed

1. **T021**: Write tests for valid CSS (TDD Red)
2. **T022**: Implement basic `CssValidator` (TDD Green)
3. **T023**: Write tests for unbalanced braces (TDD Red)
4. **T024**: Add brace balance detection (TDD Green)
5. **T025**: Write tests for invalid selectors (TDD Red)
6. **T026**: Add selector validation (TDD Green)
7. **T027**: Write tests for invalid at-rules (TDD Red)
8. **T028**: Add at-rule validation (TDD Green)
9. **T029**: Write tests for line/column extraction (TDD Red)
10. **T030**: Implement error location tracking (TDD Green)
11. **Refactor**: Clean up, run Biome, verify coverage

### Phase 4: Asset Validation Service (T031-T045)
**Dependencies**: Phases 1-3 complete

1. **T031**: Write tests for single import validation (TDD Red)
2. **T032**: Implement basic service with path resolution (TDD Green)
3. **T033**: Write tests for file existence checking (TDD Red)
4. **T034**: Add existence check logic (TDD Green)
5. **T035**: Write tests for content loading (TDD Red)
6. **T036**: Add content loading logic (TDD Green)
7. **T037**: Write tests for HTML validation integration (TDD Red)
8. **T038**: Integrate HtmlValidator (TDD Green)
9. **T039**: Write tests for CSS validation integration (TDD Red)
10. **T040**: Integrate CssValidator (TDD Green)
11. **T041**: Write tests for error collection (TDD Red)
12. **T042**: Implement error collection (TDD Green)
13. **T043**: Write tests for multiple imports (TDD Red)
14. **T044**: Handle multiple imports (TDD Green)
15. **T045**: Write integration tests (TDD Red/Green)
16. **Refactor**: Clean up, run Biome, verify coverage

### Phase 5: Validator Integration (T046-T055)
**Dependencies**: Phase 4 complete

1. **T046**: Write validator integration tests (TDD Red)
2. **T047**: Add AssetValidationService to EligianValidator DI
3. **T048**: Implement `checkAssetValidation()` method
4. **T049**: Extract source file path from Langium document
5. **T050**: Call asset validation service
6. **T051**: Map errors to Langium diagnostics
7. **T052**: Register validation check (TDD Green)
8. **T053**: Write tests for error reporting (TDD Red)
9. **T054**: Implement error formatting (TDD Green)
10. **T055**: End-to-end validation tests
11. **Refactor**: Clean up, run Biome, verify coverage

### Phase 6: Transformer Integration (T056-T065)
**Dependencies**: Phase 5 complete

1. **T056**: Write transformer tests (TDD Red)
2. **T057**: Add IAssetLoader to transformer dependencies
3. **T058**: Implement `transformImports()` method
4. **T059**: Load HTML for default 'layout' import
5. **T060**: Embed HTML in layoutTemplate
6. **T061**: Collect CSS relative paths
7. **T062**: Add CSS paths to cssFiles array
8. **T063**: Build importMap (layout, styles, provider, named imports)
9. **T064**: Write tests for importMap structure (TDD Red)
10. **T065**: Complete importMap implementation (TDD Green)
11. **Refactor**: Clean up, run Biome, verify coverage

### Phase 7: Error Reporting Polish (T066-T075)
**Dependencies**: Phases 5-6 complete

1. **T066**: Design error message template
2. **T067**: Write error formatter tests (TDD Red)
3. **T068**: Implement error formatter (TDD Green)
4. **T069**: Include relative and absolute paths
5. **T070**: Include source location (file:line:column)
6. **T071**: Add helpful hints for each error type
7. **T072**: Format multiple errors clearly
8. **T073**: Update CLI error display
9. **T074**: Update VS Code extension diagnostics
10. **T075**: End-to-end error reporting tests
11. **Refactor**: Clean up, run Biome, verify coverage

### Phase 8: Documentation & Examples (T076-T080)
**Dependencies**: All phases complete

1. **T076**: Update LANGUAGE_SPEC.md with asset loading behavior
2. **T077**: Document error messages and examples
3. **T078**: Create example .eligian files with imports
4. **T079**: Create fixture asset files for examples
5. **T080**: Update README.md with asset validation features

---

## Quality Gates

### Pre-Implementation Checklist
- [ ] User has approved `htmlparser2` dependency
- [ ] User has approved `css-tree` dependency
- [ ] All research decisions documented
- [ ] Data model reviewed and approved

### Per-Phase Quality Gates
After each phase, verify:
- [ ] All tests written first (TDD Red)
- [ ] All tests passing (TDD Green)
- [ ] Code refactored and clean
- [ ] `npm run check` passes (0 errors, 0 warnings)
- [ ] `npm run typecheck` passes (no type errors)
- [ ] Coverage ≥ 80% for new code
- [ ] Documentation updated

### Pre-Commit Checklist
- [ ] All 635+ tests passing
- [ ] Biome check clean
- [ ] TypeScript check clean
- [ ] Coverage threshold met
- [ ] No debug code left behind
- [ ] LANGUAGE_SPEC.md updated
- [ ] Example files created

---

## Risk Mitigation

### Risk 1: HTML/CSS Parser Complexity
**Mitigation**: Start with basic syntax validation, don't try to validate semantics
**Fallback**: If parsers too complex, simplify validation rules

### Risk 2: Performance with Large Files
**Mitigation**: Profile with realistic file sizes, add file size limits if needed
**Fallback**: Make validation optional via compiler flag

### Risk 3: Cross-Platform Path Issues
**Mitigation**: Use Node.js `path` module exclusively (handles Windows/Unix)
**Fallback**: Add platform-specific tests to catch issues early

### Risk 4: Error Message Clarity
**Mitigation**: Test error messages with real users, iterate based on feedback
**Fallback**: Provide detailed error codes for documentation lookup

---

## Success Metrics

- ✅ 80+ new tests passing
- ✅ Overall test count: 715+ (from current 635)
- ✅ Coverage ≥ 80% for new asset validation code
- ✅ Zero type errors
- ✅ Zero Biome errors/warnings
- ✅ Compilation fails for missing files (validated)
- ✅ Compilation fails for invalid HTML/CSS (validated)
- ✅ HTML content in layoutTemplate (verified)
- ✅ CSS relative paths in cssFiles (verified)
- ✅ Import map populated correctly (verified)
- ✅ Clear error messages with helpful hints (user tested)

---

## Next Steps

1. ✅ **Dependencies Approved**:
   - ✅ `htmlparser2` + `domutils` + `domhandler` - **APPROVED**
   - ✅ `css-tree` - **APPROVED**

2. **Ready to proceed**: Generate tasks.md with detailed task breakdown

3. **Implementation**: Follow TDD workflow strictly
   - Red → Green → Refactor
   - No code without tests
   - Verify coverage after each phase

4. **Quality checks**: After each task
   - `npm run check`
   - `npm run typecheck`
   - `npm run test`

---

**Status**: ✅ Ready to generate tasks and begin implementation
