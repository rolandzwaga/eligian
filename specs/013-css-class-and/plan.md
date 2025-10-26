# Implementation Plan: CSS Class and Selector Validation

**Branch**: `013-css-class-and` | **Date**: 2025-10-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-css-class-and/spec.md`
**Master Plan**: [../012-css-validation/master-plan.md](../012-css-validation/master-plan.md)

**Note**: This plan covers **Spec 1: Validation Infrastructure** only. IDE features (autocomplete, hover, code actions) will be implemented in a separate Spec 2 after this foundation is complete.

## Summary

Build a CSS validation system that parses imported CSS files to extract class names and IDs, then validates operation parameters marked with `ParameterType.className` or `ParameterType.selector` against the extracted list. Provides real-time validation with hot-reload when CSS files change, catching typos and missing classes at compile time before running timelines.

**Technical Approach**:
- Use PostCSS + postcss-selector-parser (existing dependencies from Feature 011) for robust CSS parsing
- Create CSSRegistryService as Langium service to track parsed CSS metadata per document
- Extend existing CSSWatcherManager from Feature 011 to send LSP notifications when CSS changes
- Implement validation in Langium validator following compiler-first pattern
- Provide Levenshtein distance-based suggestions for typos (max edit distance of 2)

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 19+ (ESM, NodeNext module resolution)
**Primary Dependencies**:
- Langium 3.x (language server framework)
- PostCSS 8.4+ (CSS parsing - existing from Feature 011)
- postcss-selector-parser 6.0+ (selector parsing - NEW DEPENDENCY)
- Vitest 1.x (testing framework)
- Biome 2.2.6+ (linting/formatting)

**Storage**: In-memory registry (CSSMetadata by file path), no persistent storage
**Testing**: Vitest with 80% coverage threshold (unit + integration tests)
**Target Platform**: VS Code extension (Node.js runtime) + standalone CLI compiler
**Project Type**: Monorepo (language package for validation, extension package for watcher integration)
**Performance Goals**:
- CSS parsing < 100ms for 1000-line files
- Validation < 50ms per document
- Hot-reload re-validation < 300ms (matching existing debounce)

**Constraints**:
- Must reuse existing CSS watcher infrastructure from Feature 011 (no duplicate watchers)
- Must resolve CSS paths relative to `.eligian` file (consistent with Feature 010/011)
- Must validate only string literals (variables/expressions out of scope)
- Must track per-document CSS context (each `.eligian` file has own imported CSS list)

**Scale/Scope**:
- Support up to 10 CSS files per document
- Support up to 1000 classes/IDs per CSS file
- Support complex selectors (`.a.b#c`, `.parent > .child`, `.button:hover`)
- Validate across multiple `.eligian` files concurrently

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation (I)**: Approach is straightforward - parse CSS, store in registry, validate references. Well-documented in master plan. No unnecessary abstraction.

- [x] **Comprehensive Testing (II)**: Unit tests planned for CSS parser (20+ cases), registry (10+ cases), selector parser (15+ cases), validators (10+ cases). Integration tests for hot-reload, multi-file scenarios. TDD workflow: write tests first.

- [x] **No Gold-Plating (III)**: Solves documented pain point (unknown CSS classes cause runtime failures). Defers IDE features to Spec 2. No speculative features.

- [x] **Code Review (IV)**: PR process required with constitution compliance verification

- [x] **UX Consistency (V)**: Validation uses same pattern as operation validation (compiler-first with Langium adapter). Error messages consistent with existing validators.

- [x] **Functional Programming (VI)**: CSSParser and SelectorParser are pure functions. CSSRegistry is immutable externally (internal mutation allowed for performance). No Effect-ts needed (validation is synchronous).

- [x] **UUID-Based Identifiers (VII)**: N/A - no IDs generated for CSS metadata

- [x] **Debug Cleanup (VIII)**: Workspace hygiene maintained

- [x] **ESM Import Extensions (IX)**: All imports use `.js` extensions

- [x] **Validation Pattern (X)**: NOT applicable - validation is in Langium layer, not compiler package (CSS validation doesn't compile to Eligius config, it just validates references)

- [x] **Code Quality: Biome (XI)**: `npm run check && npm run typecheck` after each task

- [x] **Eligius Understanding (XII)**: N/A - feature doesn't interact with Eligius runtime, only validates CSS references

- [x] **Domain Expert Consultation (XIII)**: N/A - CSS parsing/validation is standard web tech, no Eligius-specific concerns

- [x] **Question-First (XIV)**: Will stop and ask if uncertain about PostCSS API or selector parsing edge cases

- [x] **Operation Metadata (XV)**: Will consult OPERATION_REGISTRY to identify which operations have `className` and `selector` parameter types

- [x] **Concise Communication (XVI)**: Brief, technical communication only

- [x] **Language Spec Maintenance (XVII)**: N/A - no language syntax changes (validation only)

- [x] **Research Standards (XVIII)**: Will use context7 for PostCSS and postcss-selector-parser API documentation

- [x] **Dependency Management (XIX)**: **NEW DEPENDENCY REQUIRED**: postcss-selector-parser (for robust selector parsing). User approval needed before installation.

- [x] **Debugging Limit (XX)**: Maximum 5 attempts before user consultation

- [x] **Token Efficiency (XXI)**: No redundant documentation (no coverage reports in markdown)

- [x] **Accessibility (XXII)**: Error messages are clear and actionable (screen reader friendly)

**Gate Status**: ✅ PASSED with 1 dependency approval requirement

## Project Structure

### Documentation (this feature)

```
specs/013-css-class-and/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (in progress)
├── research.md          # Phase 0: PostCSS/selector-parser API research
├── data-model.md        # Phase 1: CSSMetadata, ParsedSelector, ValidationError entities
├── quickstart.md        # Phase 1: CSS validation usage guide
├── contracts/           # Phase 1: CSSRegistryService API contract
│   └── css-registry-service.ts  # Service interface definition
└── tasks.md             # Phase 2: Generated by /speckit.tasks (not created yet)
```

### Source Code (repository root)

```
packages/
├── language/                           # Langium language server package
│   ├── src/
│   │   ├── css/                        # NEW: CSS validation infrastructure
│   │   │   ├── css-parser.ts           # PostCSS-based CSS parsing
│   │   │   ├── css-registry.ts         # CSSRegistryService (Langium service)
│   │   │   ├── selector-parser.ts      # postcss-selector-parser wrapper
│   │   │   ├── levenshtein.ts          # Typo suggestion algorithm
│   │   │   └── __tests__/
│   │   │       ├── css-parser.spec.ts          # 20+ parser tests
│   │   │       ├── css-registry.spec.ts        # 10+ registry tests
│   │   │       ├── selector-parser.spec.ts     # 15+ selector tests
│   │   │       └── levenshtein.spec.ts         # 5+ suggestion tests
│   │   ├── eligian-validator.ts        # MODIFIED: Add CSS validation methods
│   │   ├── eligian-module.ts           # MODIFIED: Register CSSRegistryService
│   │   ├── main.ts                     # MODIFIED: Add LSP notification handlers
│   │   └── __tests__/
│   │       └── validation.spec.ts      # MODIFIED: Add CSS validation integration tests
│   └── package.json                    # MODIFIED: Add postcss-selector-parser dependency
│
└── extension/                          # VS Code extension package
    ├── src/
    │   └── extension/
    │       └── css-watcher.ts          # MODIFIED: Add LSP notifications for CSS changes
    └── package.json                    # No changes (postcss already a dependency)
```

**Structure Decision**: Monorepo structure maintained. CSS validation logic lives in `language` package (follows validation pattern X - Langium-first for this feature). Extension package modified to integrate watcher with language server. No new packages created.

## Complexity Tracking

*No constitutional violations requiring justification.*

---

## Phase 0: Research & Decision Documentation

**Goal**: Resolve all technical unknowns and document decisions.

### Research Tasks

**R1: PostCSS API for CSS Parsing**
- **Query**: "How to use PostCSS to parse CSS and extract class selectors with source locations?"
- **Source**: context7 MCP server - postcss documentation
- **Decision Needed**:
  - How to extract class names from parsed AST
  - How to handle syntax errors gracefully
  - How to get line/column locations for each class
- **Output**: Document PostCSS walkRules/walkDecls API and error handling in research.md

**R2: postcss-selector-parser API** ⚠️ NEW DEPENDENCY
- **Query**: "How to use postcss-selector-parser to parse complex CSS selectors and extract class/ID names?"
- **Source**: context7 MCP server - postcss-selector-parser documentation
- **Decision Needed**:
  - How to parse selectors with combinators (`.parent > .child`)
  - How to extract classes while ignoring pseudo-classes (`:hover`)
  - How to handle invalid selector syntax
- **Output**: Document selector parsing patterns and error handling in research.md
- **Dependency Approval**: User must approve adding postcss-selector-parser before proceeding

**R3: Langium Service Registration**
- **Query**: "How to register a custom service in Langium's dependency injection system?"
- **Source**: Existing code in `eligian-module.ts`, context7 for Langium docs if needed
- **Decision Needed**:
  - Where to register CSSRegistryService in module structure
  - How to inject service into validators
  - Service lifecycle (singleton vs. per-document)
- **Output**: Document service registration pattern in research.md

**R4: LSP Custom Notifications**
- **Query**: "How to send custom LSP notifications from VS Code extension to language server?"
- **Source**: Existing Feature 011 code, LSP specification
- **Decision Needed**:
  - Notification payload structure for css/updated and css/error
  - How to trigger re-validation when notification received
  - How to find affected documents that import the changed CSS
- **Output**: Document LSP notification flow in research.md

**R5: Levenshtein Distance Algorithm**
- **Query**: "Standard Levenshtein distance implementation for typo suggestions?"
- **Source**: Common algorithm (well-known), verify against existing implementations
- **Decision Needed**:
  - Classic algorithm or optimized variant (space/time tradeoffs)
  - Maximum distance threshold (recommend 2 based on research)
  - Case-sensitivity handling for CSS class names
- **Output**: Document algorithm choice and thresholds in research.md

### Dependencies to Approve

**NEW DEPENDENCY**: `postcss-selector-parser@^6.0.15`
- **Purpose**: Robust parsing of complex CSS selectors (handles combinators, pseudo-classes, attributes)
- **Alternatives Considered**:
  - Regex: Too fragile for complex selectors like `.a.b#c:hover > .d[attr]`
  - Manual parsing: High complexity, error-prone, poor edge case handling
  - CSS.parse (browser API): Not available in Node.js
- **Justification**: PostCSS ecosystem standard, well-maintained, handles all CSS selector syntax correctly
- **Size**: ~50KB, no additional transitive dependencies
- **License**: MIT (compatible)

**User Approval Required**: Stop and ask user to approve postcss-selector-parser dependency before proceeding with implementation.

### Integration Points

**IP1: CSS Watcher → Language Server**
- **Challenge**: How to notify language server when CSS file changes
- **Solution**: Send custom LSP notifications (`css/updated`, `css/error`) from watcher
- **Research**: Document notification format and handler registration in research.md

**IP2: CSSRegistryService → Validator**
- **Challenge**: How validator accesses CSS metadata for document
- **Solution**: Inject CSSRegistryService via Langium DI, query by document
- **Research**: Document service injection pattern in research.md

**IP3: Parameter Type Detection**
- **Challenge**: How to identify which parameters need CSS validation
- **Solution**: Consult OPERATION_REGISTRY to find parameters with `ParameterType.className` and `ParameterType.selector`
- **Research**: Document registry query pattern in research.md

### Output Artifact: `research.md`

Contents:
1. **PostCSS CSS Parsing**: API patterns, error handling, location extraction
2. **Selector Parsing**: postcss-selector-parser API, complex selector handling
3. **Langium Service Registration**: DI patterns, service lifecycle
4. **LSP Notifications**: Custom notification format, handler registration
5. **Levenshtein Algorithm**: Implementation, thresholds, case handling
6. **Dependency Approval**: postcss-selector-parser justification and user approval

---

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete, postcss-selector-parser dependency approved

### Data Model: `data-model.md`

**Entity 1: CSSMetadata**
```typescript
interface CSSMetadata {
  filePath: string;
  classes: Set<string>;                      // All class names found
  ids: Set<string>;                          // All ID names found
  classLocations: Map<string, Location>;     // Class name → file location
  idLocations: Map<string, Location>;        // ID name → file location
  classRules: Map<string, string>;           // Class name → CSS rule text
  idRules: Map<string, string>;              // ID name → CSS rule text
  parseErrors: ParseError[];                 // Syntax errors if any
  lastParsed: number;                        // Timestamp for cache invalidation
}

interface Location {
  line: number;    // 1-indexed
  column: number;  // 1-indexed
}

interface ParseError {
  line: number;
  column: number;
  message: string;
}
```

**Validation Rules**:
- filePath must be absolute path
- classes and ids must not contain dot/hash prefixes (stored without prefix)
- Locations must have positive line/column numbers
- lastParsed must be Unix timestamp

**State Transitions**:
1. **Initial**: Empty metadata (no parsing yet)
2. **Parsed**: CSS successfully parsed, metadata populated
3. **Error**: CSS has syntax errors, parseErrors populated
4. **Stale**: CSS file changed, needs re-parsing (detected by timestamp)

---

**Entity 2: CSSRegistry**
```typescript
class CSSRegistryService {
  private metadataByFile: Map<string, CSSMetadata>;
  private documentImports: Map<string, Set<string>>;  // Document URI → CSS file paths

  // Lifecycle
  registerCSS(filePath: string, metadata: CSSMetadata): void;
  unregisterCSS(filePath: string): void;

  // Queries
  getClassNames(document: LangiumDocument): Set<string>;
  getIDs(document: LangiumDocument): Set<string>;
  findClassDefinition(className: string): { file: string; location: Location } | undefined;
  getClassRules(className: string): string | undefined;

  // Validation helpers
  hasParseErrors(filePath: string): boolean;
  getParseErrors(filePath: string): ParseError[];

  // Internal
  private extractImportedCSSFiles(document: LangiumDocument): string[];
  private resolveCSSPath(importPath: string, documentUri: string): string;
}
```

**Relationships**:
- Each CSSMetadata is keyed by CSS file absolute path
- Each LangiumDocument has a set of imported CSS file paths
- Registry aggregates classes/IDs across all imported files for queries

---

**Entity 3: ParsedSelector**
```typescript
interface ParsedSelector {
  classes: string[];       // [".button", ".primary"]
  ids: string[];           // ["#header"]
  valid: boolean;          // Is selector syntactically valid?
  error?: string;          // Parse error message if invalid
}
```

**Validation Rules**:
- If valid = true, error must be undefined
- If valid = false, error must be present
- classes and ids must not overlap (same name can't be both)

---

**Entity 4: ValidationError**
```typescript
interface CSSValidationError {
  code: 'unknown-css-class' | 'unknown-css-id' | 'invalid-selector-syntax' | 'invalid-css-file';
  message: string;              // User-facing error message
  node: AstNode;                // AST node where error occurred
  suggestions?: string[];       // Suggested fixes (Levenshtein)
  context?: {
    className?: string;
    selector?: string;
    filePath?: string;
    parseError?: ParseError;
  };
}
```

**Validation Rules**:
- code must match one of the predefined error codes
- message must be actionable (explain what's wrong and how to fix)
- suggestions present only for typo errors (Levenshtein distance ≤ 2)

---

### API Contracts: `/contracts/css-registry-service.ts`

```typescript
/**
 * CSSRegistryService - Langium service for CSS metadata management
 *
 * This service is registered in eligian-module.ts and injected into validators
 * to provide CSS class/ID metadata for validation.
 */

import type { LangiumDocument } from 'langium';

export interface CSSMetadata {
  filePath: string;
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, Location>;
  idLocations: Map<string, Location>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;
  parseErrors: ParseError[];
  lastParsed: number;
}

export interface Location {
  line: number;
  column: number;
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
}

/**
 * CSSRegistryService interface
 *
 * Manages CSS metadata lifecycle and provides query interface for validators.
 */
export interface CSSRegistryService {
  /**
   * Register CSS file metadata (called by LSP notification handler)
   *
   * @param filePath - Absolute path to CSS file
   * @param metadata - Parsed CSS metadata
   */
  registerCSS(filePath: string, metadata: CSSMetadata): void;

  /**
   * Remove CSS file metadata (when file deleted)
   *
   * @param filePath - Absolute path to CSS file
   */
  unregisterCSS(filePath: string): void;

  /**
   * Get all class names available to a document
   *
   * Aggregates classes from all CSS files imported by the document.
   *
   * @param document - Langium document being validated
   * @returns Set of all class names (without dot prefix)
   */
  getClassNames(document: LangiumDocument): Set<string>;

  /**
   * Get all ID names available to a document
   *
   * Aggregates IDs from all CSS files imported by the document.
   *
   * @param document - Langium document being validated
   * @returns Set of all ID names (without hash prefix)
   */
  getIDs(document: LangiumDocument): Set<string>;

  /**
   * Find where a class is defined
   *
   * Used for future hover/go-to-definition features.
   *
   * @param className - Class name (without dot prefix)
   * @returns File path and location, or undefined if not found
   */
  findClassDefinition(className: string): { file: string; location: Location } | undefined;

  /**
   * Get CSS rules for a class
   *
   * Used for future hover preview features.
   *
   * @param className - Class name (without dot prefix)
   * @returns CSS rule text, or undefined if not found
   */
  getClassRules(className: string): string | undefined;

  /**
   * Check if CSS file has parse errors
   *
   * @param filePath - Absolute path to CSS file
   * @returns True if file has syntax errors
   */
  hasParseErrors(filePath: string): boolean;

  /**
   * Get parse errors for CSS file
   *
   * @param filePath - Absolute path to CSS file
   * @returns Array of parse errors (empty if no errors)
   */
  getParseErrors(filePath: string): ParseError[];
}

/**
 * LSP Notification Payloads
 *
 * Messages sent from VS Code extension to language server.
 */

export interface CSSUpdatedNotification {
  filePath: string;   // Absolute path to CSS file
  content: string;    // CSS file content
}

export interface CSSErrorNotification {
  filePath: string;   // Absolute path to CSS file
  error: string;      // Error message (file not found, permission denied, etc.)
}

/**
 * Validation Error Types
 */

export type CSSValidationErrorCode =
  | 'unknown-css-class'
  | 'unknown-css-id'
  | 'invalid-selector-syntax'
  | 'invalid-css-file';

export interface CSSValidationError {
  code: CSSValidationErrorCode;
  message: string;
  node: unknown;  // AstNode (actual type from Langium)
  suggestions?: string[];
  context?: {
    className?: string;
    selector?: string;
    filePath?: string;
    parseError?: ParseError;
  };
}
```

---

### Quickstart Guide: `quickstart.md`

```markdown
# CSS Validation Quickstart

This guide demonstrates how the CSS validation system works.

## Basic Usage

### 1. Import CSS File

```eligian
// Import CSS file with classes
styles "./styles.css"

layout "./layout.html"

timeline raf {
  at 0s..5s selectElement(".button") for 1s
}
```

### 2. Validation Errors

If `styles.css` doesn't contain `.button` class:

```
ERROR: Unknown CSS class: "button". Did you mean: "btn"?
  at selectElement(".button")
           ^^^^^^^^
```

### 3. Hot-Reload

When you add `.button` to `styles.css` and save:
- Error disappears within 300ms
- No need to restart language server
- Validation updates automatically

## Advanced Scenarios

### Complex Selectors

```eligian
// Validates all classes in selector
selectElement(".container > .card.active")
// Checks:
// - .container exists
// - .card exists
// - .active exists
```

### Multiple CSS Files

```eligian
styles "./base.css"       // Contains: .container, .card
styles "./theme.css"      // Contains: .primary, .secondary

// Classes from both files are available
at 0s..5s selectElement(".container.primary")  // ✅ Valid
```

### Typo Suggestions

```eligian
addClass("primry")  // ❌ Error: Unknown CSS class: "primry". Did you mean: "primary"?
```

## Error Codes

| Code | Description | Example |
|------|-------------|---------|
| `unknown-css-class` | Class name not found in imported CSS | `addClass("missing")` |
| `unknown-css-id` | ID name not found in imported CSS | `selectElement("#header")` when `#header` doesn't exist |
| `invalid-selector-syntax` | Malformed CSS selector | `selectElement(".button[")` (unclosed attribute) |
| `invalid-css-file` | CSS file has syntax errors | `styles "./broken.css"` where CSS is malformed |

## Integration with Existing Features

- **Feature 010**: CSS import syntax (`styles` statement)
- **Feature 011**: CSS file watcher (hot-reload reuses same infrastructure)

## Performance Characteristics

- CSS parsing: < 100ms for 1000-line files
- Validation: < 50ms per document
- Hot-reload: < 300ms from CSS save to updated validation

## Limitations (Spec 1)

- No autocomplete (deferred to Spec 2)
- No hover information (deferred to Spec 2)
- No quick fixes (deferred to Spec 2)
- Validates only string literals (not variables or expressions)
- Validates only classes and IDs (not pseudo-classes or attributes)
```

---

### Agent Context Update

Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude` to add:

```markdown
## CSS Validation (Feature 013)

**CSS Parsing**:
- Uses PostCSS + postcss-selector-parser (new dependency)
- Extracts class names, IDs, locations, and rules
- Handles syntax errors gracefully

**CSSRegistryService** (Langium service):
- Tracks CSS metadata per file
- Provides query interface (getClassNames, getIDs)
- Aggregates metadata across imported files per document

**Validation Pattern**:
- Langium-first (not compiler-first for this feature)
- Validators call CSSRegistryService directly
- Error messages include Levenshtein suggestions

**Hot-Reload**:
- Reuses CSSWatcherManager from Feature 011
- Sends LSP notifications (css/updated, css/error)
- Triggers re-validation of affected documents

**Testing**:
- 20+ CSS parser tests (edge cases, syntax errors)
- 10+ registry tests (queries, multi-file scenarios)
- 15+ selector parser tests (complex selectors)
- Integration tests for hot-reload and multi-document validation
```

---

## Summary

**Phase 0 Status**: Ready to proceed with research tasks (R1-R5)
**Phase 1 Status**: Design artifacts created (data-model.md, contracts/, quickstart.md)
**Dependency Approval Required**: postcss-selector-parser before implementation

**Next Command**: `/speckit.tasks` to generate task breakdown after Phase 0-1 artifacts are reviewed and dependency is approved.
