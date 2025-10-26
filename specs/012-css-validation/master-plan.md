# CSS Class/ID Validation - Master Plan

**Feature Number**: 012
**Created**: 2025-10-26
**Status**: Planning Complete - Ready for Implementation

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Requirements Summary](#requirements-summary)
3. [Design Decisions](#design-decisions)
4. [Spec Splitting Strategy](#spec-splitting-strategy)
5. [Spec 1: Validation Infrastructure](#spec-1-validation-infrastructure)
6. [Spec 2: IDE Features](#spec-2-ide-features)
7. [Interface Contract](#interface-contract)
8. [Technical Stack](#technical-stack)
9. [Testing Strategy](#testing-strategy)
10. [Future Enhancements](#future-enhancements)

---

## Feature Overview

### Problem Statement

Eligian developers can reference CSS classes and selectors in operation parameters (e.g., `selectElement(".button")`, `addClass("primary")`), but there's currently no validation that these classes actually exist in the imported CSS files. This leads to:

- ❌ Runtime errors when selectors don't match any elements
- ❌ Typos in class names going undetected
- ❌ No autocomplete for available CSS classes
- ❌ Manual checking of CSS files to find class names

### Solution

Build a **CSS validation system** that:

1. **Parses imported CSS files** to extract class names and IDs
2. **Validates parameters** marked with `ParameterType.className` or `ParameterType.selector`
3. **Provides real-time feedback** when CSS files change
4. **Offers IDE features** (completion, hover, quick fixes) for CSS references

### Success Criteria

- ✅ Unknown CSS class names trigger **errors** (not warnings)
- ✅ Validation updates **immediately** when CSS files change
- ✅ Full selector validation (e.g., `.button.primary` validates both classes exist)
- ✅ Autocomplete suggests available CSS classes
- ✅ Hover shows where CSS class is defined
- ✅ Invalid CSS files trigger errors before they can be used in code

---

## Requirements Summary

These requirements were established through discussion on 2025-10-26:

### Validation Behavior

| Requirement | Decision | Rationale |
|-------------|----------|-----------|
| **Unknown class severity** | Error (not warning) | Should prevent compilation - typos are bugs |
| **CSS change detection** | Immediate (hot-reload) | Real-time feedback is critical for good DX |
| **Validation scope** | Both `className` AND `selector` parameters | Selector validation is coming anyway, implement now |
| **Selector validation depth** | Full (validate all classes in selector) | `.button.primary` should check both classes exist |
| **Invalid CSS handling** | Show error | CSS must be valid before code can reference it |
| **CSS file resolution** | Relative to `.eligian` file (reuse existing logic) | Consistent with Feature 010/011 |
| **Performance** | Eager parsing + caching | Parse when CSS changes, cache results |
| **Multi-file support** | Per-document (validate against imported CSS only) | Each document has its own CSS context |

### IDE Features

| Feature | Priority | Description |
|---------|----------|-------------|
| **Completion** | High | Suggest CSS classes when typing `className`/`selector` params |
| **Hover** | High | Show where class is defined, preview CSS rules |
| **Code Actions** | Medium | Quick fix to create missing CSS class |
| **Signature Help** | Low | Show available classes for operation (defer) |

### Implementation Approach

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Typir integration?** | No - use Langium validator | CSS classes are runtime constraints, not static types |
| **Spec splitting?** | Yes - 2 focused specs | Better focus, clear checkpoints, easier to track |
| **Implementation style** | Full features (no MVP) | Not in production, can implement complete solution |
| **Watcher reuse** | Integrate with Feature 011 watcher | Don't watch same files twice |

---

## Design Decisions

### Why NOT Typir for CSS Validation?

**Question**: Should CSS class names be modeled as types in Typir?

**Answer**: **No** - CSS classes are **validation constraints**, not **static types**.

**Rationale**:
1. **Philosophical mismatch**: Typir is designed for static types known at parse time. CSS classes come from external files and change at runtime.
2. **Type vs. Constraint**: The *type* is `string`, but the *allowed values* depend on which CSS files are imported. This is validation, not typing.
3. **Precedent**: TypeScript treats CSS classes as `string`, validated by linters (stylelint). Rust uses validators, not type system.
4. **Lifecycle complexity**: Regenerating Typir types on CSS file changes is architecturally messy.

**Solution**: Use Langium validator (same pattern as operation existence checking).

---

### CSS Parser Library

**Options Considered**:
1. **Regex** - Fast, no dependencies, but fragile
2. **PostCSS** - Industry standard, robust, already a dependency (Feature 011)
3. **css-tree** - Lightweight, built for tooling

**Decision**: **PostCSS** with `postcss-selector-parser`

**Rationale**:
- Already a dependency from Feature 011 (CSS URL rewriting)
- Handles all CSS syntax correctly (comments, escaped chars, etc.)
- Provides source locations for hover/go-to-definition
- `postcss-selector-parser` handles complex selectors (`.a.b#c[attr]:hover`)

**Implementation**:
```typescript
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

function parseCSS(css: string): CSSMetadata {
  const root = postcss.parse(css);
  const classes = new Set<string>();
  const ids = new Set<string>();
  const classLocations = new Map<string, Location>();

  root.walkRules(rule => {
    const parsed = selectorParser().astSync(rule.selector);

    parsed.walkClasses(node => {
      classes.add(node.value);
      classLocations.set(node.value, {
        line: rule.source!.start!.line,
        column: rule.source!.start!.column,
      });
    });

    parsed.walkIds(node => {
      ids.add(node.value);
    });
  });

  return { classes, ids, classLocations };
}
```

---

### Selector Validation Strategy

**Challenge**: Validate complex selectors like `.parent > .child:hover[disabled]`

**Approach**: **Partial validation** (classes/IDs only)

**What we validate**:
- ✅ Class names (`.button`, `.primary`)
- ✅ ID names (`#header`)

**What we skip** (assume valid CSS):
- ⏭️ Pseudo-classes (`:hover`, `:nth-child(2)`)
- ⏭️ Pseudo-elements (`::before`, `::after`)
- ⏭️ Attribute selectors (`[disabled]`, `[data-foo="bar"]`)
- ⏭️ Combinators (`>`, `+`, `~`, ` `)

**Rationale**:
- Covers 80% of errors (typos in class/ID names)
- Simple implementation
- Can add full validation later if needed

**Example**:
```typescript
// Selector: ".button.primary > .icon:hover[disabled]"

// Validate:
validateClass("button")    // ✅ Check exists in CSS
validateClass("primary")   // ✅ Check exists in CSS
validateClass("icon")      // ✅ Check exists in CSS

// Ignore (assume valid):
":hover"                   // ⏭️ Standard pseudo-class
"[disabled]"               // ⏭️ Standard attribute
">"                        // ⏭️ Valid combinator
```

---

### Watcher Integration

**Requirement**: Reuse existing CSS watcher from Feature 011

**Current Architecture** (Feature 011):
```
CSSWatcherManager (extension)
  ├─ FileSystemWatcher (*.css)
  ├─ Debouncing (300ms per-file)
  └─ On change → css-reload message to webview
```

**New Architecture** (Feature 011 + 012):
```
CSSWatcherManager (extension)
  ├─ FileSystemWatcher (*.css)
  ├─ Debouncing (300ms per-file)
  └─ On change:
      ├─ css-reload message to webview (Feature 011)
      └─ css/updated notification to language server (Feature 012)
```

**Implementation**:
```typescript
// In css-watcher.ts
private async handleCSSFileChange(cssFile: string): Promise<void> {
  const content = await this.loadCSSFile(cssFile);

  // Feature 011: Hot-reload CSS in preview
  if (this.injector) {
    await this.injector.reloadCSS(cssFile, content);
  }

  // Feature 012: Notify language server to update registry
  if (this.languageClient) {
    await this.languageClient.sendNotification('css/updated', {
      filePath: cssFile,
      content,
    });
  }
}
```

**Benefits**:
- Single watcher for both features
- Single file read per change
- Consistent debouncing behavior

---

## Spec Splitting Strategy

### Why Two Specs?

**Problem**: Full feature is too large (~40-50 tasks) for focused implementation.

**Solution**: Split into two focused specs:

| Spec | Focus | Tasks | Time | Deliverable |
|------|-------|-------|------|-------------|
| **Spec 1** | Validation Infrastructure | 20-25 | 3-4 days | CSS parsing, registry, validation works |
| **Spec 2** | IDE Features | 15-20 | 2-3 days | Completion, hover, code actions work |

**Benefits**:
1. **Clear mental models**: Spec 1 = "Can system validate?", Spec 2 = "Can IDE help users?"
2. **Testable checkpoints**: After Spec 1, validation works (can test independently)
3. **Resumability**: Easier to resume "I'm on Spec 2, task 8" than "task 33 of 50"
4. **Dependency management**: Spec 2 cleanly depends on Spec 1's exports
5. **Implementation focus**: ~20 tasks each = sweet spot for context retention

**Dependency**:
- Spec 2 **depends on** Spec 1 completion
- Spec 1 must export stable APIs for Spec 2 to consume

---

## Spec 1: Validation Infrastructure

### Scope

Build the CSS analysis pipeline and validation system.

### User Stories

**US1**: As a developer, I want errors when using unknown CSS class names in `className` parameters, so I catch typos early

**Example**:
```eligian
styles "./styles.css"  // Contains: .button, .primary

action highlight(name: string) [
  addClass("primry")   // ❌ Error: Unknown CSS class "primry". Did you mean "primary"?
]
```

**US2**: As a developer, I want errors when using unknown CSS classes in `selector` parameters, so my selectors are always valid

**Example**:
```eligian
styles "./styles.css"  // Contains: .button, .primary

action setup [
  selectElement(".button.primry")  // ❌ Error: Unknown CSS class "primry" in selector
]
```

**US3**: As a developer, I want validation to update immediately when CSS files change, so I get real-time feedback

**Example**:
```eligian
// File: presentation.eligian
styles "./styles.css"
action test [
  addClass("new-class")  // ❌ Error: Unknown CSS class
]

// User edits styles.css, adds: .new-class { ... }
// ✅ Error disappears immediately (< 300ms)
```

**US4**: As a developer, I want errors when CSS files have syntax errors, so I fix my stylesheets before using them in code

**Example**:
```eligian
styles "./broken.css"  // Contains: .button { color: red  // Missing closing brace

// ❌ Error: CSS file "./broken.css" has syntax errors (line 2, column 30)
```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CSS File (on disk)                                          │
│ .button { color: red; }                                     │
│ .primary { font-weight: bold; }                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ File change detected
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ CSSWatcherManager (extension/css-watcher.ts)                │
│ - Watches *.css files (300ms debounce)                      │
│ - Sends 'css/updated' notification to language server       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ LSP notification
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ CSSParserService (language/css/css-parser.ts)               │
│ - parseCSS(content: string): CSSMetadata                    │
│ - Uses PostCSS + postcss-selector-parser                    │
│ - Extracts: classes, IDs, locations, rules                  │
│ - Handles syntax errors gracefully                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ CSSMetadata
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ CSSRegistryService (language/css/css-registry.ts)           │
│ - registerCSS(filePath, metadata)                           │
│ - getClassNames(document): Set<string>                      │
│ - getIDs(document): Set<string>                             │
│ - findClassDefinition(className): Location | undefined      │
│ - getImportedCSSFiles(document): string[]                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Query for validation
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ SelectorParser (language/css/selector-parser.ts)            │
│ - parseSelector(selector: string): ParsedSelector           │
│ - extractClasses(selector): string[]                        │
│ - extractIDs(selector): string[]                            │
│ - Uses postcss-selector-parser                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Parsed selector parts
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ EligianValidator (language/eligian-validator.ts)            │
│ - checkCSSClassName(param: Parameter)                       │
│   → Validates ParameterType.className                       │
│ - checkCSSSelector(param: Parameter)                        │
│   → Validates ParameterType.selector                        │
│ - Reports errors with suggestions                           │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### 1. CSSParserService

**Location**: `packages/language/src/css/css-parser.ts`

**Responsibilities**:
- Parse CSS content using PostCSS
- Extract class names, IDs, and their source locations
- Handle CSS syntax errors gracefully
- Return structured metadata for registry

**API**:
```typescript
export interface CSSMetadata {
  classes: Set<string>;                      // All class names
  ids: Set<string>;                          // All ID names
  classLocations: Map<string, Location>;     // Where each class is defined
  idLocations: Map<string, Location>;        // Where each ID is defined
  classRules: Map<string, string>;           // CSS rules for each class
  idRules: Map<string, string>;              // CSS rules for each ID
  parseErrors: ParseError[];                 // Syntax errors if any
}

export class CSSParserService {
  parseCSS(content: string, filePath: string): CSSMetadata;
}
```

**Error Handling**:
```typescript
// If CSS has syntax errors, return partial metadata + errors
{
  classes: new Set(),  // Empty - can't parse
  parseErrors: [{ line: 5, column: 10, message: "Unclosed string" }]
}
```

---

#### 2. CSSRegistryService

**Location**: `packages/language/src/css/css-registry.ts`

**Responsibilities**:
- Store CSS metadata per file
- Query available classes/IDs for a document (based on imports)
- Find definition locations for hover/go-to-definition
- Manage CSS file lifecycle (add/update/remove)

**API**:
```typescript
export class CSSRegistryService {
  // Register CSS file metadata (called by LSP notification handler)
  registerCSS(filePath: string, metadata: CSSMetadata): void;

  // Remove CSS file (when deleted)
  unregisterCSS(filePath: string): void;

  // Get all class names available to a document
  getClassNames(document: LangiumDocument): Set<string>;

  // Get all IDs available to a document
  getIDs(document: LangiumDocument): Set<string>;

  // Find where a class is defined (for hover/go-to-def)
  findClassDefinition(className: string): { file: string; location: Location } | undefined;

  // Find where an ID is defined
  findIDDefinition(id: string): { file: string; location: Location } | undefined;

  // Get CSS rules for a class (for hover preview)
  getClassRules(className: string): string | undefined;

  // Extract imported CSS files from document AST
  private getImportedCSSFiles(document: LangiumDocument): string[];

  // Check if CSS file has parse errors
  hasParseErrors(filePath: string): boolean;

  // Get parse errors for file
  getParseErrors(filePath: string): ParseError[];
}
```

**Service Registration**:
```typescript
// In eligian-module.ts
export type EligianAddedServices = {
  typir: TypirLangiumServices<EligianSpecifics>;
  css: {
    CSSRegistry: CSSRegistryService;
  };
};
```

---

#### 3. SelectorParser

**Location**: `packages/language/src/css/selector-parser.ts`

**Responsibilities**:
- Parse CSS selector strings
- Extract class names and IDs from selectors
- Handle complex selectors (combinators, pseudo-classes, etc.)
- Validate selector syntax

**API**:
```typescript
export interface ParsedSelector {
  classes: string[];           // [".button", ".primary"]
  ids: string[];               // ["#header"]
  valid: boolean;              // Is selector syntactically valid?
  error?: string;              // Parse error message if invalid
}

export class SelectorParser {
  parseSelector(selector: string): ParsedSelector;
}
```

**Examples**:
```typescript
parseSelector(".button")
// → { classes: ["button"], ids: [], valid: true }

parseSelector(".button.primary")
// → { classes: ["button", "primary"], ids: [], valid: true }

parseSelector(".parent > .child:hover")
// → { classes: ["parent", "child"], ids: [], valid: true }

parseSelector("#header.sticky")
// → { classes: ["sticky"], ids: ["header"], valid: true }

parseSelector(".invalid[")
// → { classes: [], ids: [], valid: false, error: "Unclosed attribute selector" }
```

---

#### 4. Eligian Validator Enhancements

**Location**: `packages/language/src/eligian-validator.ts`

**New Validation Methods**:

```typescript
export class EligianValidator {
  constructor(
    private services: EligianServices
  ) {}

  /**
   * Validate className parameters
   */
  checkCSSClassName(param: Parameter, accept: ValidationAcceptor): void {
    // 1. Check if parameter type is ParameterType.className
    const paramDef = this.getParameterDefinition(param);
    if (paramDef?.type !== ParameterType.className) return;

    // 2. Only validate string literals (can't validate variables)
    if (!isStringLiteral(param.value)) return;

    const className = param.value.value;

    // 3. Get available classes for this document
    const cssRegistry = this.services.css.CSSRegistry;
    const availableClasses = cssRegistry.getClassNames(param.$document!);

    // 4. Validate class exists
    if (!availableClasses.has(className)) {
      const suggestions = this.findSimilarClasses(className, availableClasses);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(', ')}?`
        : '';

      accept('error', `Unknown CSS class: "${className}".${suggestionText}`, {
        node: param.value,
        code: 'unknown-css-class',
        data: { className, suggestions },
      });
    }
  }

  /**
   * Validate selector parameters
   */
  checkCSSSelector(param: Parameter, accept: ValidationAcceptor): void {
    // 1. Check if parameter type is ParameterType.selector
    const paramDef = this.getParameterDefinition(param);
    if (paramDef?.type !== ParameterType.selector) return;

    // 2. Only validate string literals
    if (!isStringLiteral(param.value)) return;

    const selector = param.value.value;

    // 3. Parse selector
    const selectorParser = new SelectorParser();
    const parsed = selectorParser.parseSelector(selector);

    // 4. Check syntax validity
    if (!parsed.valid) {
      accept('error', `Invalid CSS selector syntax: ${parsed.error}`, {
        node: param.value,
        code: 'invalid-selector-syntax',
      });
      return;
    }

    // 5. Validate each class in selector
    const cssRegistry = this.services.css.CSSRegistry;
    const availableClasses = cssRegistry.getClassNames(param.$document!);

    for (const className of parsed.classes) {
      if (!availableClasses.has(className)) {
        accept('error', `Unknown CSS class in selector: "${className}"`, {
          node: param.value,
          code: 'unknown-css-class-in-selector',
          data: { className, selector },
        });
      }
    }

    // 6. Validate each ID in selector
    const availableIDs = cssRegistry.getIDs(param.$document!);

    for (const id of parsed.ids) {
      if (!availableIDs.has(id)) {
        accept('error', `Unknown CSS ID in selector: "${id}"`, {
          node: param.value,
          code: 'unknown-css-id-in-selector',
          data: { id, selector },
        });
      }
    }
  }

  /**
   * Validate CSS file imports
   */
  checkCSSFileValidity(cssImport: CSSImport, accept: ValidationAcceptor): void {
    const cssRegistry = this.services.css.CSSRegistry;
    const filePath = this.resolveCSSPath(cssImport.path, cssImport.$document!);

    if (cssRegistry.hasParseErrors(filePath)) {
      const errors = cssRegistry.getParseErrors(filePath);
      accept('error', `CSS file has syntax errors: ${errors[0].message}`, {
        node: cssImport,
        code: 'invalid-css-file',
        data: { filePath, errors },
      });
    }
  }

  /**
   * Find similar class names for suggestions (Levenshtein distance)
   */
  private findSimilarClasses(
    input: string,
    available: Set<string>,
    maxDistance = 2
  ): string[] {
    // Use Levenshtein distance to find similar names
    // Return up to 3 suggestions
  }
}
```

**Validation Registration**:
```typescript
// In eligian-validator.ts
registry.register(checksFor.Parameter, {
  checkCSSClassName: validator.checkCSSClassName,
  checkCSSSelector: validator.checkCSSSelector,
  // ... existing validators
});

registry.register(checksFor.CSSImport, {
  checkCSSFileValidity: validator.checkCSSFileValidity,
});
```

---

#### 5. Watcher Integration

**Location**: `packages/extension/src/extension/css-watcher.ts`

**Modification**: Add language server notification

```typescript
export class CSSWatcherManager {
  constructor(
    private webviewCSSInjector?: WebviewCSSInjector,
    private languageClient?: LanguageClient  // NEW: for Feature 012
  ) {}

  private async handleCSSFileChange(cssFile: string): Promise<void> {
    // Load CSS content
    const result = await loadCSSFile(cssFile, this.workspaceRoot);

    if (result._tag === 'success') {
      // Feature 011: Hot-reload CSS in preview
      if (this.webviewCSSInjector) {
        await this.webviewCSSInjector.reloadCSS(cssFile, result.content);
      }

      // Feature 012: Notify language server to update registry
      if (this.languageClient) {
        await this.languageClient.sendNotification('css/updated', {
          filePath: cssFile,
          content: result.content,
        });
      }
    } else {
      // Feature 011: Show error
      if (this.webviewCSSInjector) {
        await this.webviewCSSInjector.showCSSError(/* ... */);
      }

      // Feature 012: Notify language server of error
      if (this.languageClient) {
        await this.languageClient.sendNotification('css/error', {
          filePath: cssFile,
          error: result.error,
        });
      }
    }
  }
}
```

**LSP Notification Handler** (in language server):

**Location**: `packages/language/src/main.ts`

```typescript
// Register LSP notification handlers
connection.onNotification('css/updated', (params: { filePath: string; content: string }) => {
  const cssParser = services.css.CSSParser;
  const cssRegistry = services.css.CSSRegistry;

  // Parse CSS
  const metadata = cssParser.parseCSS(params.content, params.filePath);

  // Update registry
  cssRegistry.registerCSS(params.filePath, metadata);

  // Trigger re-validation of all documents that import this CSS
  const affectedDocuments = findDocumentsImportingCSS(params.filePath);
  for (const doc of affectedDocuments) {
    documentBuilder.update([doc.uri], []);
  }
});

connection.onNotification('css/error', (params: { filePath: string; error: string }) => {
  const cssRegistry = services.css.CSSRegistry;

  // Register error metadata
  cssRegistry.registerCSS(params.filePath, {
    classes: new Set(),
    ids: new Set(),
    parseErrors: [{ message: params.error }],
    // ... empty metadata
  });

  // Trigger re-validation
  const affectedDocuments = findDocumentsImportingCSS(params.filePath);
  for (const doc of affectedDocuments) {
    documentBuilder.update([doc.uri], []);
  }
});
```

---

### Success Criteria

**Must Have**:
- ✅ Unknown class names in `className` parameters trigger errors
- ✅ Unknown classes in `selector` parameters trigger errors (validates all classes in selector)
- ✅ CSS file changes trigger immediate re-validation (< 300ms)
- ✅ Invalid CSS files trigger errors
- ✅ Errors include suggestions for similar class names (Levenshtein distance)
- ✅ Per-document validation (only imported CSS files considered)

**Nice to Have**:
- ✅ Unknown IDs in selectors also validated
- ✅ Syntax errors in selectors reported (invalid selector syntax)

**Out of Scope** (Spec 2):
- ⏭️ Autocomplete for CSS classes
- ⏭️ Hover to show CSS definitions
- ⏭️ Quick fixes for unknown classes

---

### Tasks Overview

**Phase 1: Setup & Dependencies** (3 tasks)
- Add PostCSS and postcss-selector-parser dependencies
- Create CSS service structure in eligian-module
- Update package.json and install dependencies

**Phase 2: CSS Parser Service** (5 tasks)
- Implement CSSParserService with PostCSS integration
- Extract class names and locations
- Extract ID names and locations
- Handle CSS syntax errors gracefully
- Unit tests for CSS parsing (20+ test cases)

**Phase 3: CSS Registry Service** (4 tasks)
- Implement CSSRegistryService as Langium service
- Implement getClassNames/getIDs for document
- Implement findClassDefinition/findIDDefinition
- Unit tests for registry operations

**Phase 4: Selector Parser** (4 tasks)
- Implement SelectorParser with postcss-selector-parser
- Extract classes and IDs from complex selectors
- Validate selector syntax
- Unit tests for selector parsing (15+ test cases)

**Phase 5: Watcher Integration** (3 tasks)
- Add languageClient parameter to CSSWatcherManager
- Send css/updated notifications on file changes
- Register LSP notification handlers in language server

**Phase 6: Langium Validators** (4 tasks)
- Implement checkCSSClassName validator
- Implement checkCSSSelector validator
- Implement checkCSSFileValidity validator
- Implement findSimilarClasses helper (Levenshtein)

**Phase 7: Testing** (6 tasks)
- Integration tests: className validation
- Integration tests: selector validation (complex selectors)
- Integration tests: CSS hot-reload triggers re-validation
- Integration tests: invalid CSS files
- Integration tests: suggestions for typos
- Manual testing checklist (10+ scenarios)

**Phase 8: Documentation** (2 tasks)
- Update CLAUDE.md with CSS validation architecture
- Create examples demonstrating CSS validation

**Total**: ~25 tasks, 3-4 days estimated

---

## Spec 2: IDE Features

### Scope

Build rich IDE features using the CSS infrastructure from Spec 1.

### User Stories

**US1**: As a developer, I want autocomplete for CSS class names, so I can write code faster

**Example**:
```eligian
styles "./styles.css"  // Contains: .button, .primary, .secondary

action highlight(name: string) [
  addClass(|)   // ← Cursor here
  // Autocomplete shows:
  //   "button"     (CSS class)
  //   "primary"    (CSS class)
  //   "secondary"  (CSS class)
]
```

**US2**: As a developer, I want to see where CSS classes are defined on hover, so I can navigate my styles

**Example**:
```eligian
action highlight [
  addClass("button")
           ^^^^^^^^
           Hover: Defined in styles.css:15
                  .button {
                    color: blue;
                    padding: 8px;
                  }
]
```

**US3**: As a developer, I want quick fixes to create missing CSS classes, so I can add them without leaving my code

**Example**:
```eligian
action test [
  addClass("new-class")  // ❌ Error: Unknown CSS class "new-class"
           ^^^^^^^^^^
           💡 Quick Fix: Create ".new-class" in styles.css
]
```

**US4**: As a developer, I want autocomplete to work in selector parameters, so I can build complex selectors easily

**Example**:
```eligian
action setup [
  selectElement(".|")  // ← Cursor after dot
  // Autocomplete shows CSS classes (no dot prefix):
  //   button
  //   primary
  //   secondary
]
```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CSSRegistryService (from Spec 1)                            │
│ - getClassNames(document): Set<string>                      │
│ - findClassDefinition(className): Location                  │
│ - getClassRules(className): string                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Query for IDE features
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ CSSCompletionProvider (language/css/css-completion.ts)      │
│ - provideCSSClassCompletions(context)                       │
│ - provideSelectorCompletions(context)                       │
│ - Called by EligianCompletionProvider                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CSSHoverProvider (language/css/css-hover.ts)                │
│ - provideCSSClassHover(node)                                │
│ - Shows: file location, CSS rules preview                   │
│ - Called by EligianHoverProvider                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CSSCodeActionProvider (language/css/css-code-actions.ts)    │
│ - provideCreateClassAction(diagnostic)                      │
│ - provideGoToDefinitionAction(className)                    │
│ - Called by EligianCodeActionProvider (if created)          │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### 1. CSSCompletionProvider

**Location**: `packages/language/src/css/css-completion.ts`

**Responsibilities**:
- Provide CSS class completions for `className` parameters
- Provide CSS class completions while typing selectors
- Rank CSS classes higher than other completions

**API**:
```typescript
export class CSSCompletionProvider {
  constructor(private cssRegistry: CSSRegistryService) {}

  /**
   * Provide CSS class completions for className parameters
   */
  provideCSSClassCompletions(
    context: CompletionContext,
    document: LangiumDocument
  ): CompletionItem[] {
    const classes = this.cssRegistry.getClassNames(document);

    return Array.from(classes).map(className => ({
      label: className,
      kind: CompletionItemKind.EnumMember,
      detail: 'CSS class',
      documentation: this.cssRegistry.getClassRules(className),
      insertText: `"${className}"`,  // Include quotes
      sortText: `0_${className}`,    // Sort CSS classes first
    }));
  }

  /**
   * Provide CSS class completions while typing selectors
   */
  provideSelectorCompletions(
    context: CompletionContext,
    document: LangiumDocument,
    cursorOffset: number  // Offset in selector string
  ): CompletionItem[] {
    // Determine if cursor is after "." (class) or "#" (ID)
    const prefix = this.getPrefix(context, cursorOffset);

    if (prefix === '.') {
      // Complete class names (no dot in completion)
      const classes = this.cssRegistry.getClassNames(document);
      return Array.from(classes).map(className => ({
        label: className,
        kind: CompletionItemKind.EnumMember,
        detail: 'CSS class',
        insertText: className,  // No quotes, no dot
      }));
    }

    if (prefix === '#') {
      // Complete ID names (no hash in completion)
      const ids = this.cssRegistry.getIDs(document);
      return Array.from(ids).map(id => ({
        label: id,
        kind: CompletionItemKind.EnumMember,
        detail: 'CSS ID',
        insertText: id,  // No quotes, no hash
      }));
    }

    return [];
  }
}
```

**Integration** (in `eligian-completion-provider.ts`):
```typescript
protected override completionFor(context: CompletionContext): CompletionItem[] {
  const node = context.node;

  // Existing completions
  const items = super.completionFor(context);

  // Add CSS completions if in className context
  if (this.isInClassNameContext(context)) {
    const cssCompletions = this.cssCompletionProvider.provideCSSClassCompletions(
      context,
      context.document
    );
    items.push(...cssCompletions);
  }

  // Add CSS completions if in selector string
  if (this.isInSelectorString(context)) {
    const cssCompletions = this.cssCompletionProvider.provideSelectorCompletions(
      context,
      context.document,
      context.offset
    );
    items.push(...cssCompletions);
  }

  return items;
}
```

---

#### 2. CSSHoverProvider

**Location**: `packages/language/src/css/css-hover.ts`

**Responsibilities**:
- Show CSS class definition location on hover
- Show CSS rules preview on hover
- Show CSS ID definition on hover

**API**:
```typescript
export class CSSHoverProvider {
  constructor(private cssRegistry: CSSRegistryService) {}

  /**
   * Provide hover information for CSS class names
   */
  provideCSSClassHover(
    className: string,
    document: LangiumDocument
  ): Hover | undefined {
    // Find definition
    const definition = this.cssRegistry.findClassDefinition(className);
    if (!definition) return undefined;

    // Get CSS rules
    const rules = this.cssRegistry.getClassRules(className);

    // Format hover content
    const content = [
      `**CSS Class**: \`.${className}\``,
      '',
      `**Defined in**: ${path.basename(definition.file)}:${definition.location.line}`,
      '',
      '```css',
      rules || '/* No rules found */',
      '```',
    ].join('\n');

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content,
      },
    };
  }

  /**
   * Provide hover information for CSS IDs
   */
  provideCSSIDHover(
    id: string,
    document: LangiumDocument
  ): Hover | undefined {
    // Similar to provideCSSClassHover but for IDs
  }
}
```

**Integration** (in `eligian-hover-provider.ts`):
```typescript
getHoverContent(document: LangiumDocument, params: HoverParams): Hover | undefined {
  const node = this.findNodeAtPosition(document, params.position);

  // Existing hover content
  let hover = this.getExistingHover(node);

  // Add CSS hover if node is className parameter
  if (isStringLiteral(node) && this.isClassNameParameter(node)) {
    const className = node.value;
    const cssHover = this.cssHoverProvider.provideCSSClassHover(className, document);
    if (cssHover) {
      return cssHover;  // CSS hover takes precedence
    }
  }

  // Add CSS hover if node is inside selector
  if (isStringLiteral(node) && this.isSelectorParameter(node)) {
    const className = this.extractClassNameAtPosition(node, params.position);
    if (className) {
      const cssHover = this.cssHoverProvider.provideCSSClassHover(className, document);
      if (cssHover) {
        return cssHover;
      }
    }
  }

  return hover;
}
```

---

#### 3. CSSCodeActionProvider

**Location**: `packages/language/src/css/css-code-actions.ts`

**Responsibilities**:
- Quick fix: Create missing CSS class in appropriate file
- Code action: Go to CSS definition
- Code action: Show all usages of CSS class

**API**:
```typescript
export class CSSCodeActionProvider {
  constructor(private cssRegistry: CSSRegistryService) {}

  /**
   * Provide quick fix to create missing CSS class
   */
  provideCreateClassAction(
    diagnostic: Diagnostic,
    document: LangiumDocument
  ): CodeAction | undefined {
    if (diagnostic.code !== 'unknown-css-class') return undefined;

    const className = diagnostic.data.className;
    const cssFiles = this.cssRegistry.getImportedCSSFiles(document);

    if (cssFiles.length === 0) {
      return undefined;  // No CSS files to add class to
    }

    // Add to first CSS file (or show quick pick if multiple)
    const targetFile = cssFiles[0];

    return {
      title: `Create ".${className}" in ${path.basename(targetFile)}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [targetFile]: [{
            range: this.getEndOfFile(targetFile),
            newText: `\n\n.${className} {\n  /* TODO: Add styles */\n}\n`,
          }],
        },
      },
    };
  }

  /**
   * Provide code action to go to CSS definition
   */
  provideGoToDefinitionAction(
    className: string,
    document: LangiumDocument
  ): CodeAction | undefined {
    const definition = this.cssRegistry.findClassDefinition(className);
    if (!definition) return undefined;

    return {
      title: `Go to ".${className}" definition`,
      kind: CodeActionKind.Empty,
      command: {
        command: 'vscode.open',
        title: 'Open CSS file',
        arguments: [
          vscode.Uri.file(definition.file),
          { selection: this.rangeFromLocation(definition.location) },
        ],
      },
    };
  }
}
```

**Integration**: Either extend `EligianCodeActionProvider` or register as separate provider

---

### Success Criteria

**Must Have**:
- ✅ Autocomplete shows CSS classes for `className` parameters
- ✅ Autocomplete shows CSS classes when typing `.` in selectors
- ✅ Autocomplete shows CSS IDs when typing `#` in selectors
- ✅ Hover on class name shows definition location and CSS rules preview
- ✅ Quick fix creates missing CSS class in appropriate file

**Nice to Have**:
- ✅ Hover shows all files where class is defined (if duplicates)
- ✅ Code action to go to CSS definition
- ✅ CSS classes ranked higher than other completions

**Out of Scope**:
- ⏭️ Signature help (defer to future enhancement)
- ⏭️ Rename refactoring (defer to future enhancement)
- ⏭️ Find all references (defer to future enhancement)

---

### Tasks Overview

**Phase 1: Completion Provider** (5 tasks)
- Implement CSSCompletionProvider
- Integrate with EligianCompletionProvider for className
- Integrate for selector string completions
- Handle cursor position in selector strings
- Unit tests for completion scenarios

**Phase 2: Hover Provider** (4 tasks)
- Implement CSSHoverProvider
- Integrate with EligianHoverProvider for className
- Integrate for selector strings
- Unit tests for hover scenarios

**Phase 3: Code Actions** (5 tasks)
- Implement CSSCodeActionProvider
- Create class quick fix
- Go to definition action
- Register code action provider
- Unit tests for code actions

**Phase 4: Testing** (5 tasks)
- Integration tests: completion in className parameters
- Integration tests: completion in selectors
- Integration tests: hover shows CSS definitions
- Integration tests: quick fix creates CSS class
- Manual testing checklist (8+ scenarios)

**Phase 5: Documentation** (2 tasks)
- Update CLAUDE.md with IDE features
- Create examples demonstrating IDE features

**Total**: ~20 tasks, 2-3 days estimated

---

## Interface Contract

**What Spec 1 Must Export for Spec 2**:

### Service APIs

```typescript
// CSSRegistryService - must be stable and complete
export class CSSRegistryService {
  // Required for completion
  getClassNames(document: LangiumDocument): Set<string>;
  getIDs(document: LangiumDocument): Set<string>;

  // Required for hover
  findClassDefinition(className: string): { file: string; location: Location } | undefined;
  getClassRules(className: string): string | undefined;

  // Required for code actions
  getImportedCSSFiles(document: LangiumDocument): string[];
}
```

### Data Types

```typescript
// CSSMetadata - must include all fields needed for IDE features
export interface CSSMetadata {
  classes: Set<string>;
  ids: Set<string>;
  classLocations: Map<string, Location>;      // Required for hover
  idLocations: Map<string, Location>;
  classRules: Map<string, string>;            // Required for hover preview
  idRules: Map<string, string>;
  parseErrors: ParseError[];
}
```

### Location Format

```typescript
// Must be compatible with LSP Location type
export interface Location {
  line: number;    // 1-indexed
  column: number;  // 1-indexed
}
```

**Guarantee**: Spec 1 will NOT change these APIs after completion. Spec 2 can safely depend on them.

---

## Technical Stack

### Dependencies

**New Dependencies** (Spec 1):
```json
{
  "dependencies": {
    "postcss": "^8.4.32",
    "postcss-selector-parser": "^6.0.15"
  },
  "devDependencies": {
    "@types/postcss-selector-parser": "^6.0.0"
  }
}
```

**No New Dependencies** (Spec 2) - uses Spec 1 infrastructure

### LSP Protocol Extensions

**Custom LSP Notifications** (Spec 1):
- `css/updated` - CSS file changed, update registry
- `css/error` - CSS file has parse errors

**Standard LSP Features** (Spec 2):
- `textDocument/completion` - Already implemented, enhanced
- `textDocument/hover` - Already implemented, enhanced
- `textDocument/codeAction` - May need to implement if not exists

---

## Testing Strategy

### Unit Tests

**Spec 1**:
- CSSParserService: 20+ test cases (various CSS syntax, errors, edge cases)
- CSSRegistryService: 10+ test cases (registration, queries, document imports)
- SelectorParser: 15+ test cases (simple/complex selectors, syntax errors)
- Validators: 10+ test cases (className, selector, suggestions)

**Spec 2**:
- CSSCompletionProvider: 8+ test cases (className, selector, cursor positions)
- CSSHoverProvider: 6+ test cases (class hover, ID hover, missing definitions)
- CSSCodeActionProvider: 5+ test cases (create class, go to definition)

### Integration Tests

**Spec 1**:
- CSS hot-reload triggers re-validation
- Unknown className triggers error with suggestions
- Complex selectors validated correctly
- Invalid CSS files trigger errors

**Spec 2**:
- Completion shows CSS classes in correct contexts
- Hover shows CSS definition and rules
- Quick fix creates CSS class in file

### Manual Testing

**Spec 1 Checklist**:
1. Import CSS file with classes
2. Use unknown class in `addClass()` → error appears
3. Use unknown class in `selectElement()` → error appears
4. Edit CSS, add class → error disappears immediately
5. Use complex selector `.a.b#c` → validates all parts
6. Import invalid CSS file → error appears
7. Fix CSS syntax → error disappears, classes available
8. Typo in class name → suggestions shown
9. Multiple CSS files → all classes available
10. Remove CSS import → classes no longer validated

**Spec 2 Checklist**:
1. Type `addClass(|)` → CSS classes appear in autocomplete
2. Type `selectElement(".|)` → CSS classes appear (no quotes)
3. Type `selectElement("#|)` → CSS IDs appear
4. Hover over class name → shows definition location and CSS
5. Use unknown class → quick fix available
6. Apply quick fix → CSS class created in file
7. Go to definition → jumps to CSS file
8. CSS file updates → autocomplete updates immediately

---

## Future Enhancements

Features deferred to later specs:

### Phase 3 Enhancements (Future)

1. **Rename Refactoring**
   - Rename CSS class across all Eligian files and CSS files
   - Update all references atomically

2. **Find All References**
   - Show all usages of a CSS class across project
   - Works for both CSS and Eligian files

3. **CSS Variable Support**
   - Extract CSS variables (custom properties)
   - Validate usage of CSS variables in Eligian code

4. **Color Preview**
   - Show color preview in hover for classes with `color` or `background-color`
   - Inline color picker

5. **Pseudo-class Validation**
   - Validate pseudo-classes (`:hover`, `:focus`, etc.) against CSS spec
   - Suggest available pseudo-classes

6. **Attribute Selector Validation**
   - Validate attribute selectors (`[disabled]`, `[data-foo]`)
   - Check against HTML spec / custom attributes

7. **Selector Performance Hints**
   - Warn about inefficient selectors (universal selector, deep nesting)
   - Suggest optimizations

8. **CSS Modules Support**
   - If using CSS modules, extract scoped class names
   - Handle `:local()` and `:global()` selectors

9. **SCSS/LESS Support**
   - Parse SCSS/LESS files (with nested selectors)
   - Extract classes from preprocessor syntax

10. **CSS-in-JS Support**
    - Extract classes from styled-components or emotion
    - Validate against JS-defined styles

---

## Implementation Notes

### Levenshtein Distance for Suggestions

For finding similar class names (typo suggestions):

```typescript
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function findSimilarClasses(
  input: string,
  available: Set<string>,
  maxDistance = 2
): string[] {
  return Array.from(available)
    .map(className => ({
      className,
      distance: levenshteinDistance(input.toLowerCase(), className.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)  // Top 3 suggestions
    .map(({ className }) => className);
}
```

### PostCSS Error Handling

```typescript
try {
  const root = postcss.parse(cssContent);
  // ... extract classes
} catch (error) {
  // PostCSS parse error
  return {
    classes: new Set(),
    ids: new Set(),
    parseErrors: [{
      line: error.line || 0,
      column: error.column || 0,
      message: error.reason || error.message,
    }],
  };
}
```

### Selector Parsing with postcss-selector-parser

```typescript
import selectorParser from 'postcss-selector-parser';

function parseSelector(selector: string): ParsedSelector {
  const classes: string[] = [];
  const ids: string[] = [];

  try {
    const parsed = selectorParser().astSync(selector);

    parsed.walkClasses(node => {
      classes.push(node.value);
    });

    parsed.walkIds(node => {
      ids.push(node.value);
    });

    return { classes, ids, valid: true };
  } catch (error) {
    return {
      classes: [],
      ids: [],
      valid: false,
      error: error.message,
    };
  }
}
```

---

## Success Metrics

After full implementation (Spec 1 + Spec 2), measure:

### Developer Experience Metrics

1. **Error Detection**: % of CSS typos caught before running timeline
2. **Autocomplete Usage**: % of class names inserted via autocomplete vs typed manually
3. **Time to Write**: Time to write `addClass()` call with autocomplete vs without
4. **Error Resolution**: Time from error to fix (with vs without quick fix)

### Performance Metrics

1. **Parse Time**: CSS parsing time for typical files (< 100ms for 1000 lines)
2. **Validation Time**: Validation time per document (< 50ms)
3. **Completion Latency**: Time to show completions (< 100ms)
4. **Hover Latency**: Time to show hover info (< 50ms)

### Quality Metrics

1. **False Positives**: % of "unknown class" errors that are false positives (target: < 1%)
2. **False Negatives**: % of actual typos not caught (target: < 5%)
3. **Suggestion Accuracy**: % of times suggested class is correct (target: > 80%)

---

## Conclusion

This master plan provides a complete blueprint for implementing CSS class/ID validation across two focused specs:

- **Spec 1** (Validation Infrastructure): 3-4 days, ~25 tasks
- **Spec 2** (IDE Features): 2-3 days, ~20 tasks

**Total Estimated Effort**: 5-7 days for complete feature

**Key Benefits**:
- Catch CSS typos at compile time (errors, not warnings)
- Real-time validation on CSS file changes
- TypeScript-level IDE experience (autocomplete, hover, quick fixes)
- Full selector validation (complex selectors supported)

**Next Steps**:
1. Generate Spec 1 (this document serves as reference)
2. Implement Spec 1 completely
3. Test and verify validation works
4. Generate Spec 2 (using this document for requirements)
5. Implement Spec 2
6. Final integration testing

---

**Document Status**: ✅ Complete - Ready to generate Spec 1
