# Eligian Testing Guide

> **REQUIRED READING**: All developers writing tests for the Eligian project MUST read and follow this guide to avoid common pitfalls and maintain consistency across the test suite.

**Last Updated**: 2025-01-23 (Added comprehensive CSS import requirements)
**Test Suite Size**: 1,495 tests across 110 test files
**Coverage**: 81.72%
**Framework**: Vitest + Langium Test Utilities + vitest-mcp

## ⚠️ Most Common Test Failure: Missing cssImport: true

**90% of CSS-related test failures** are caused by using `cssImport: false` when the code references CSS classes or IDs.

**Quick Fix Checklist**:
- ✅ Called `setupCSSRegistry()` in `beforeEach()`?
- ✅ Used `cssImport: true` in `minimalProgram()`?
- ✅ CSS file URI matches in both places (`'file:///styles.css'`)?

If all three are yes, CSS validation will work. If any is missing, you'll get "Unknown CSS class/ID" errors.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Running Tests](#running-tests)
3. [Test Infrastructure Overview](#test-infrastructure-overview)
4. [Essential Patterns](#essential-patterns)
5. [Program Template Builders](#program-template-builders)
6. [CSS Registry Management](#css-registry-management)
7. [Common Mistakes and Solutions](#common-mistakes-and-solutions)
8. [Minimum Valid Program Requirements](#minimum-valid-program-requirements)
9. [Test File Organization](#test-file-organization)
10. [Best Practices](#best-practices)
11. [Advanced Patterns](#advanced-patterns)
12. [Testing Multiple Packages](#testing-multiple-packages)

---

## Quick Start

### Basic Test Template

Copy this template for 90% of new tests:

```typescript
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  CSS_FIXTURES,
  DiagnosticSeverity,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Feature Name (Feature ###, User Story #)', () => {
  let ctx: TestContext;

  // Expensive setup - runs ONCE per suite
  beforeAll(() => {
    ctx = createTestContext();
  });

  // Per-test state isolation - runs BEFORE EACH test
  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('should validate something specific (T###)', async () => {
    // CRITICAL: Use cssImport: true when code uses CSS classes/IDs
    const code = minimalProgram({
      cssImport: true,  // ⚠️ REQUIRED for CSS validation to work!
      actionName: 'myAction',
      actionBody: 'addClass("button")',
      containerSelector: '#container',
    });

    const { errors, warnings, diagnostics } = await ctx.parseAndValidate(code);

    // Filter by severity using enum (NOT magic numbers!)
    const errorsByCode = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'specific_error_code'
    );

    expect(errorsByCode).toHaveLength(0);
  });
});

// ⚠️ COMMON MISTAKE: Using cssImport: false causes "Unknown CSS class/ID" errors
// Even though setupCSSRegistry() is called, CSS validation needs the "styles" import!
```

### Why cssImport: true is Required

When your test uses CSS classes or IDs (in selectors, addClass, etc.), you MUST include `cssImport: true`:

```typescript
// ❌ WRONG: Will fail with "Unknown CSS class: 'button'"
const code = minimalProgram({
  cssImport: false,  // Missing "styles" import!
  actionBody: 'addClass("button")',
});

// ✅ CORRECT: Includes "styles './styles.css'" in generated code
const code = minimalProgram({
  cssImport: true,   // Adds CSS import to code
  actionBody: 'addClass("button")',
});
```

**Why**: CSS validation requires:
1. `setupCSSRegistry()` - Defines available CSS classes/IDs
2. `styles` import in code - Links document to CSS file
3. Both must match the same file URI (`'file:///styles.css'`)

```

### Event Action Test Template

For event validation tests:

```typescript
import { eventActionProgram } from './test-helpers.js';

test('should validate event action', async () => {
  const code = eventActionProgram('dom-mutation', 'HandleMutation', [
    { name: 'payload', type: 'string' },
  ]);

  const { errors } = await ctx.parseAndValidate(code);
  expect(errors).toHaveLength(0);
});
```

---

## Running Tests

### Using vitest-mcp (Required per Constitution Principle XXIII)

The project uses vitest-mcp tools for running tests instead of npm/pnpm scripts. This provides structured output and better integration with the development workflow.

**Constitution Principle XXIII**: All test quality gates MUST use vitest-mcp tools instead of `pnpm test` commands.

**Setup**:
```typescript
import { mcp__vitest__set_project_root, mcp__vitest__run_tests } from 'vitest-mcp';

// Set project root (required once)
await mcp__vitest__set_project_root({ path: 'F:\\projects\\eligius\\eligian' });
```

**Run specific test file**:
```typescript
await mcp__vitest__run_tests({
  target: './packages/cli/src/__tests__/cli.spec.ts',
  format: 'summary'  // or 'detailed' for failure details
});
```

**Run all tests in a package**:
```typescript
await mcp__vitest__run_tests({
  target: 'packages/language',
  format: 'detailed'
});
```

**Common Commands**:

| Command | Purpose |
|---------|---------|
| `mcp__vitest__run_tests({ target: './path/to/test.spec.ts' })` | Run specific test file |
| `mcp__vitest__run_tests({ target: 'packages/cli' })` | Run all tests in package |
| `mcp__vitest__list_tests({ path: 'packages/extension' })` | List test files in package |
| `mcp__vitest__analyze_coverage({ target: 'packages/language' })` | Check code coverage |

### Package-Specific Test Environments

Some packages require specific test environments. Always run tests from the package directory when vitest.config.ts defines custom settings.

**Extension Package** (requires jsdom for DOM tests):
```bash
cd packages/extension
npx vitest run  # Picks up vitest.config.ts with jsdom environment
```

**CLI Package** (Node environment):
```bash
cd packages/cli
npx vitest run
```

**Language Package** (default environment):
```bash
cd packages/language
npx vitest run
```

### Common Test Issues and Solutions

#### Issue 1: Missing `await` on Async Functions

**Symptom**: Test expects object/array but receives `Promise{...}`

**Error**:
```
AssertionError: expected Promise{…} to have property 'length'
```

**Cause**: Async function not awaited

**Fix**:
```typescript
// ❌ WRONG: Missing await
const labels = findBlockLabels(document);
expect(labels).toHaveLength(1);

// ✅ CORRECT: Await async function
const labels = await findBlockLabels(document);
expect(labels).toHaveLength(1);
```

**Real Example**: Fixed in [block-label-detector.spec.ts](packages/extension/src/extension/decorations/__tests__/block-label-detector.spec.ts) - 10 tests failed because `findBlockLabels()` returns `Promise<BlockLabel[]>` but wasn't being awaited.

#### Issue 2: Missing vscode Module Mock

**Symptom**: `Failed to resolve import "vscode"`

**Cause**: VS Code extension tests try to import the `vscode` module which isn't available in test environment

**Fix**: Create a mock and configure vitest.config.ts alias:

```typescript
// src/extension/__tests__/__mocks__/vscode.ts
export class Uri {
  scheme: string;
  path: string;

  constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
  }

  static parse(uri: string): Uri {
    const match = uri.match(/^([^:]+):\/\/([^/]+)(.*)$/);
    if (match) {
      const [, scheme, , path] = match;
      return new Uri(scheme, path || '/');
    }
    return new Uri('file', '/');
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }
}
```

```typescript
// vitest.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      vscode: fileURLToPath(
        new URL('./src/extension/__tests__/__mocks__/vscode.ts', import.meta.url)
      ),
    },
  },
});
```

**Real Example**: Fixed in [webview-uri-converter.spec.ts](packages/extension/src/extension/__tests__/webview-uri-converter.spec.ts) - 2 tests failed until vscode mock was created with proper URI parsing.

#### Issue 3: Outdated Test Fixtures

**Symptom**: Parse errors in test fixtures, tests fail with "Expecting token of type..."

**Cause**: DSL syntax evolved but test fixture files weren't updated

**Common Fixes**:

1. **Timeline syntax** - Must include `in` clause:
   ```eligian
   # ❌ OLD: Missing 'in' keyword
   timeline "test" using raf { ... }

   # ✅ NEW: Includes container selector
   timeline "test" in "#app" using raf { ... }
   ```

2. **Event syntax** - Direct operation calls, not curly braces:
   ```eligian
   # ❌ OLD: Curly braces around operation
   at 0s..5s { showElement() }

   # ✅ NEW: Direct operation call
   at 0s..5s showElement()
   ```

3. **CSS imports** - Required for CSS validation:
   ```eligian
   # ✅ NEW: Add CSS import at top
   styles "./test.css"

   endable action test [ ... ] [ ... ]
   ```

4. **selectElement in end blocks** - Must select before other operations:
   ```eligian
   endable action fadeIn [
     selectElement("#element")
     addClass("visible")
   ] [
     # ✅ Must select element in end block too
     selectElement("#element")
     removeClass("visible")
   ]
   ```

**Real Example**: Fixed in [CLI test fixtures](packages/cli/src/__tests__/__fixtures/) - All 3 fixture files needed updates for current syntax, plus creation of [test.css](packages/cli/src/__tests__/__fixtures__/test.css) for CSS validation.

#### Issue 4: Double Execution Bug

**Symptom**: CLI outputs results twice, JSON parse fails with "Unexpected non-whitespace"

**Cause**: `main()` called twice - once from module import, once from bin script

**Fix**: Remove auto-execution from module:

```typescript
// ❌ WRONG: Auto-executes on import
export default function main(): void {
  // ... implementation
}

main();  // DON'T DO THIS

// ✅ CORRECT: Export only, let bin script call it
export default function main(): void {
  // ... implementation
}
// No auto-execution
```

**Real Example**: Fixed in [main.ts](packages/cli/src/main.ts) - Removed line 247 `main();` which caused stdout to contain two JSON outputs concatenated together.

#### Issue 5: jsdom Environment Not Loading

**Symptom**: `document is not defined` in tests

**Cause**: Tests run from monorepo root don't pick up package-specific vitest.config.ts

**Solution**: Run tests from package directory:

```bash
# ❌ From root - may not pick up package config
cd /path/to/monorepo
npx vitest run packages/extension/media/__tests__/dom-reconciliation.spec.ts

# ✅ From package - picks up vitest.config.ts
cd packages/extension
npx vitest run media/__tests__/dom-reconciliation.spec.ts
```

**Real Example**: Fixed by running extension tests from `packages/extension` directory - all 11 DOM reconciliation tests passed once jsdom environment loaded correctly.

---

## Test Infrastructure Overview

### Core Test Helpers (`test-helpers.ts`)

Location: `packages/language/src/__tests__/test-helpers.ts`

**Key Exports**:

| Function | Purpose | Use In |
|----------|---------|--------|
| `createTestContext()` | Initialize test environment | `beforeAll()` |
| `setupCSSRegistry()` | Configure CSS classes/IDs | `beforeEach()` |
| `minimalProgram()` | Build valid program template | Test code |
| `eventActionProgram()` | Build event action program | Event tests |
| `endableActionProgram()` | Build endable action program | Timeline tests |
| `CSS_FIXTURES` | Pre-defined CSS test data | `setupCSSRegistry()` |
| `DiagnosticSeverity` | Enum for error severity | Filtering diagnostics |

### TestContext API (Unified Parse Interface)

The `TestContext` object returned by `createTestContext()` provides a unified interface that wraps Langium's `parseHelper` internally:

**Available Methods**:

```typescript
interface TestContext {
  services: ReturnType<typeof createEligianServices>;  // Access to all services
  parse: (code: string) => Promise<LangiumDocument<Program>>;  // Raw parsing (wraps parseHelper)
  parseAndValidate: (code: string) => Promise<ValidationResult>;  // Parse + validate convenience
}
```

**When to Use Which**:

- **Use `ctx.parseAndValidate(code)`** (recommended): For 90% of tests that need validation results
- **Use `ctx.parse(code)`**: When you need raw document access or custom validation flow
- **Use `ctx.services`**: When you need direct access to services (Typir, CSS registry, validators)

**Migration from Direct `parseHelper` Usage**:

```typescript
// ❌ OLD PATTERN - Direct parseHelper usage
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const parse = parseHelper<Program>(services);

test('example', async () => {
  const document = await parse(`...`);
  await services.shared.workspace.DocumentBuilder.build([document]);
  // ...
});

// ✅ NEW PATTERN - Using createTestContext()
import { createTestContext, type TestContext } from './test-helpers.js';

let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});

test('example', async () => {
  // Option 1: Use parseAndValidate (recommended)
  const { errors, warnings, document } = await ctx.parseAndValidate(`...`);

  // Option 2: Use parse directly if you need raw document
  const document = await ctx.parse(`...`);
  await ctx.services.shared.workspace.DocumentBuilder.build([document]);

  // Option 3: Access services directly for specialized operations
  const typirServices = ctx.services.Eligian.typir;
});
```

**Benefits of Consolidation**:
- **Single Source of Truth**: All tests use the same initialization pattern
- **Less Boilerplate**: No need to manually create services and parseHelper
- **Better Performance**: `beforeAll()` caches expensive service initialization
- **Consistent API**: All tests access services, parse, and validation the same way

### CSS Fixtures

Pre-defined constants for common CSS test scenarios:

```typescript
CSS_FIXTURES = {
  common: {
    classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible'],
    ids: ['app', 'test', 'container']
  },
  timeline: {
    classes: ['test-container', 'container', 'presentation-container'],
    ids: ['app', 'test']
  }
}
```

---

## Essential Patterns

### Pattern 1: Lifecycle Hooks (REQUIRED)

**Rule**: Expensive setup in `beforeAll()`, per-test state isolation in `beforeEach()`

```typescript
describe('My Tests', () => {
  let ctx: TestContext;

  // ✅ CORRECT: Context creation once per suite
  beforeAll(() => {
    ctx = createTestContext();
  });

  // ✅ CORRECT: CSS registry reset per test
  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  // ❌ WRONG: Creating context per test (slow)
  beforeEach(() => {
    ctx = createTestContext(); // DON'T DO THIS
  });
});
```

**Why This Matters**:
- `createTestContext()` initializes Langium services (~50ms overhead)
- CSS registry state persists across tests if not reset
- Test isolation prevents cross-test contamination

### Pattern 2: Parse and Validate

**Always use `parseAndValidate()` helper**, not raw parsing:

```typescript
// ✅ CORRECT: Use helper
const { errors, warnings, diagnostics, document, program } =
  await ctx.parseAndValidate(code);

// ❌ WRONG: Manual parsing
const document = await ctx.parse(code);
await ctx.services.shared.workspace.DocumentBuilder.build([document], {
  validation: true,
});
```

### Pattern 3: Filtering Diagnostics

**Use enums and error codes**, not magic numbers or string matching:

```typescript
// ✅ CORRECT: Enum + error code
const errors = diagnostics.filter(
  d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'unknown_css_class'
);

// ❌ WRONG: Magic number
const errors = diagnostics.filter(d => d.severity === 1); // What is 1?

// ❌ WRONG: String matching (brittle)
const errors = diagnostics.filter(d => d.message.includes('class'));
```

**Severity Levels**:
```typescript
DiagnosticSeverity.Error       // 1 - Blocks compilation
DiagnosticSeverity.Warning     // 2 - Potential issue
DiagnosticSeverity.Information // 3 - FYI
DiagnosticSeverity.Hint        // 4 - Suggestion
```

---

## Program Template Builders

### Why Use Templates?

**Problem**: 880+ occurrences of repeated boilerplate across 20+ test files.
**Solution**: Use template builders to eliminate duplication and prevent errors.

### `minimalProgram()` - Most Common Use Case

Generates a complete valid Eligian program with sensible defaults.

**Default Output**:
```eligian
styles "./styles.css"

action testAction() [
  selectElement("#element")
]

timeline "test" in ".container" using raf {
  at 0s testAction()
}
```

**Usage Examples**:

```typescript
// Basic - use all defaults
const code = minimalProgram();

// Custom action with parameters
const code = minimalProgram({
  actionName: 'fadeIn',
  actionParams: [
    { name: 'selector', type: 'string' },
    { name: 'duration', type: 'number' }
  ],
  actionBody: `
    selectElement(selector)
    animate({opacity: 1}, duration)
  `
});

// Video timeline
const code = minimalProgram({
  provider: 'video',
  providerSource: 'demo.mp4',
  timelineBody: 'at 0s..5s testAction()'
});

// No CSS import (operations don't need CSS)
const code = minimalProgram({
  cssImport: false,
  actionBody: 'log("test")'
});

// Custom timeline container
const code = minimalProgram({
  containerSelector: '#app',
  timelineName: 'presentation'
});
```

**Available Options**:
```typescript
interface ProgramOptions {
  cssImport?: boolean;           // Include CSS import (default: true)
  cssPath?: string;              // CSS file path (default: "./styles.css")
  actionName?: string;           // Action name (default: "testAction")
  actionParams?: Array<{         // Action parameters (default: [])
    name: string;
    type?: string;
  }>;
  actionBody?: string;           // Action operations (default: selectElement)
  timelineName?: string;         // Timeline name (default: "test")
  containerSelector?: string;    // Container selector (default: ".container")
  provider?: 'raf' | 'video' | 'audio' | 'custom';  // (default: "raf")
  providerSource?: string;       // Source for video/audio (default: "test.mp4")
  timelineBody?: string;         // Timeline events (default: calls action)
}
```

### `eventActionProgram()` - Event Validation Tests

For testing event actions (appears 10+ times in event validation tests).

**Default Output**:
```eligian
styles "./test.css"

action init() [ selectElement("#app") ]

on event "dom-mutation" action HandleMutation() [
  selectElement("#app")
]

timeline "test" in "#app" using raf {
  at 0s..1s init()
}
```

**Usage**:
```typescript
// Basic event action
const code = eventActionProgram('dom-mutation', 'HandleMutation');

// With parameters
const code = eventActionProgram(
  'data-sync',
  'HandleSync',
  [
    { name: 'status', type: 'string' },
    { name: 'count', type: 'number' }
  ]
);

// Custom body
const code = eventActionProgram(
  'click',
  'HandleClick',
  [{ name: 'target', type: 'string' }],
  'log(target)\nselectElement(target)'
);
```

### `endableActionProgram()` - Timeline Event Tests

For testing endable actions (start/end blocks).

**Default Output**:
```eligian
styles "./styles.css"

endable action showTitle [
  selectElement("#title")
  addClass("visible")
] [
  removeClass("visible")
]

timeline "test" in ".container" using raf {
  at 0s..5s showTitle()
}
```

**Usage**:
```typescript
const code = endableActionProgram(
  'fadeInOut',
  'animate({opacity: 1}, 500)',
  'animate({opacity: 0}, 500)',
  '2s..10s' // Custom time range
);
```

---

## CSS Registry Management

### Why CSS Registry Matters

Many operations (`addClass`, `removeClass`, `selectElement`) reference CSS classes/IDs. The test system validates these references against a **CSS Registry** that must be populated before tests run.

**CRITICAL**: CSS validation requires **THREE things working together**:
1. `setupCSSRegistry()` - Populates CSS file metadata (classes/IDs available)
2. `styles` import statement - Must be in the generated code
3. `parseAndValidate()` - Automatically registers document → CSS file association

### Complete Setup Pattern (REQUIRED)

**Standard pattern for most tests**:
```typescript
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestContext, CSS_FIXTURES, minimalProgram, setupCSSRegistry } from './test-helpers.js';

describe('My Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // STEP 1: Setup CSS registry with available classes/IDs
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('should validate CSS class usage', async () => {
    // STEP 2: Generate code WITH cssImport: true (CRITICAL!)
    const code = minimalProgram({
      cssImport: true,           // ✅ MUST be true to include "styles" import
      cssPath: './styles.css',   // ✅ Matches setupCSSRegistry URI
      actionBody: 'addClass("button")',
      containerSelector: '#container',  // Uses ID from CSS_FIXTURES.common
    });

    // STEP 3: parseAndValidate automatically registers document CSS imports
    const { errors } = await ctx.parseAndValidate(code);

    expect(errors).toHaveLength(0);
  });
});
```

### ⚠️ Common Mistake: cssImport: false

**This WILL FAIL with "Unknown CSS class/ID" errors**:
```typescript
// ❌ WRONG: cssImport: false means no "styles" import in generated code
const code = minimalProgram({
  cssImport: false,  // ❌ CSS validation will fail!
  actionBody: 'addClass("button")',
  containerSelector: '#container',
});

// Error: Unknown CSS class: 'button'
// Error: Unknown CSS ID in selector: 'container'
```

**Why it fails**:
- `setupCSSRegistry()` populates CSS metadata
- BUT the generated code has NO `styles` import statement
- So the validator doesn't know which CSS files to check against
- Result: All CSS classes/IDs appear "unknown"

**Solution**: Always use `cssImport: true`:
```typescript
// ✅ CORRECT: cssImport: true includes "styles" import
const code = minimalProgram({
  cssImport: true,   // ✅ Generates: styles "./styles.css"
  cssPath: './styles.css',
  actionBody: 'addClass("button")',
  containerSelector: '#container',
});
```

### When to Use beforeAll vs beforeEach

**Use `beforeEach()`** (recommended default):
```typescript
beforeEach(() => {
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
});
```
- Ensures clean CSS registry state for each test
- Prevents cross-test contamination
- Required if tests modify CSS (add/remove classes)
- Matches pattern used by 90% of existing tests

**Use `beforeAll()`** (only if CSS is truly read-only):
```typescript
beforeAll(() => {
  ctx = createTestContext();
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
});
```
- Use ONLY if CSS is never modified during tests
- Slight performance improvement (avoids repeated setup)
- **Risk**: CSS state persists across tests if any test modifies it

### Pre-Defined Fixtures

Use `CSS_FIXTURES` constants instead of manual setup:

```typescript
import { CSS_FIXTURES } from './test-helpers.js';

// Common UI classes
setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
// classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible']
// ids: ['app', 'test', 'container']

// Timeline-specific classes
setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.timeline);
// classes: ['test-container', 'container', 'presentation-container']
// ids: ['app', 'test']
```

### Custom CSS Setup

For unique CSS requirements:

```typescript
setupCSSRegistry(ctx, 'file:///styles.css', {
  classes: ['custom-class-1', 'custom-class-2'],
  ids: ['unique-id']
});
```

### State Isolation (CRITICAL)

CSS registry state **persists** across tests unless reset.

**Example of the Problem**:
```typescript
beforeAll(() => {
  ctx = createTestContext();
});

test('first test', async () => {
  setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['button'] });
  // Test runs with 'button' class
});

test('second test', async () => {
  setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['primary'] });
  // ❌ BUG: Test has BOTH 'button' AND 'primary' classes!
  // CSS registry was not reset between tests
});
```

**Solution**: Always use `beforeEach()` if tests modify CSS:
```typescript
beforeEach(() => {
  // Resets CSS registry before each test
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
});
```

---

## Common Mistakes and Solutions

### Mistake 1: Missing Timeline Declaration

**Error**: `"A program must contain at least one timeline declaration"`

**Bad Code**:
```typescript
const code = `
  action test() [ selectElement("#element") ]
`;
```

**Solution**: Use `minimalProgram()` which includes timeline:
```typescript
const code = minimalProgram({ actionName: 'test' });
```

### Mistake 2: Invalid Type Annotations

**Error**: `Expecting: 'string' | 'number' | 'boolean' | 'object' | 'array'`

**Bad Code**:
```typescript
action test(name: String) [ ... ]  // Wrong - capitalized
action test(x: any) [ ... ]        // Wrong - 'any' not in grammar
```

**Solution**: Use lowercase, valid types:
```typescript
action test(name: string) [ ... ]
// Valid types: string, number, boolean, object, array
```

### Mistake 3: Missing CSS Import for Class Operations

**Error**: `"Unknown CSS class: 'button'"` or `"Unknown CSS ID in selector: 'container'"`

**Bad Code #1** (No CSS registry setup):
```typescript
const code = `
  timeline "test" in ".container" using raf {
    at 0s [ addClass("button") ] []
  }
`;
```

**Bad Code #2** (CSS registry setup but cssImport: false):
```typescript
beforeEach(() => {
  setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['button'], ids: ['container'] });
});

const code = minimalProgram({
  cssImport: false,  // ❌ WRONG: Missing "styles" import in generated code!
  actionBody: 'addClass("button")',
  containerSelector: '#container',
});
```

**Solution**: Setup CSS registry AND use cssImport: true:
```typescript
beforeEach(() => {
  // STEP 1: Setup CSS registry
  setupCSSRegistry(ctx, 'file:///styles.css', {
    classes: ['button'],
    ids: ['container']
  });
});

test('example', async () => {
  // STEP 2: Use cssImport: true to include "styles" import
  const code = minimalProgram({
    cssImport: true,  // ✅ REQUIRED!
    cssPath: './styles.css',
    actionBody: 'addClass("button")',
    containerSelector: '#container',
  });

  const { errors } = await ctx.parseAndValidate(code);
  expect(errors).toHaveLength(0);
});
```

**Why both are required**:
- `setupCSSRegistry()` populates CSS metadata (what classes/IDs exist)
- `cssImport: true` adds `styles "./styles.css"` to generated code
- `parseAndValidate()` links the document to the CSS file
- Without BOTH, validation can't find CSS classes/IDs

### Mistake 4: Missing Provider Source for Video/Audio

**Error**: `"Video/audio provider requires 'from' clause"`

**Bad Code**:
```typescript
timeline "test" in ".c" using video {}  // Missing source
```

**Solution**:
```typescript
const code = minimalProgram({
  provider: 'video',
  providerSource: 'demo.mp4'
});
```

### Mistake 5: Magic Numbers for Severity

**Bad Code**:
```typescript
const errors = diagnostics.filter(d => d.severity === 1);  // What is 1?
```

**Solution**:
```typescript
const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
```

### Mistake 6: Creating Context in `beforeEach()`

**Performance Problem**: Creates new Langium services for every test (~50ms each)

**Bad Code**:
```typescript
beforeEach(() => {
  ctx = createTestContext();  // SLOW - runs per test
});
```

**Solution**:
```typescript
beforeAll(() => {
  ctx = createTestContext();  // FAST - runs once per suite
});
```

---

## Minimum Valid Program Requirements

Every Eligian program must have:

1. **At least one timeline declaration**
   ```eligian
   timeline "name" in "selector" using provider { ... }
   ```

2. **Timeline provider** (one of):
   - `raf` - requestAnimationFrame (no source needed)
   - `video from "file.mp4"` - video element
   - `audio from "file.mp3"` - audio element
   - `custom` - custom provider

3. **Container selector** that exists in CSS registry:
   ```eligian
   timeline "t" in ".container" using raf {}
   ```

4. **CSS import** if using CSS operations (`addClass`, etc.):
   ```eligian
   styles "./styles.css"
   ```

5. **Action definitions** before use in timeline:
   ```eligian
   action test() [ ... ]  // Define first

   timeline "t" in ".c" using raf {
     at 0s test()  // Use second
   }
   ```

**Template that satisfies all requirements**:
```typescript
const code = minimalProgram();
```

---

## Test File Organization

### Standard Structure

```
packages/language/src/__tests__/
├── test-helpers.ts           # Core helpers (REQUIRED import)
├── parsing.spec.ts           # Grammar/syntax tests
├── validation.spec.ts        # Semantic validation tests
├── event-validation/         # Feature-specific tests
│   ├── event-name-validation.spec.ts
│   ├── argument-count-validation.spec.ts
│   └── argument-type-validation.spec.ts
├── css-classname-validation/ # CSS feature tests
│   ├── valid-classname.spec.ts
│   └── unknown-classname.spec.ts
└── __fixtures__/             # Test data
    ├── valid/
    ├── invalid/
    └── css/
```

### Naming Conventions

- Test files: `*.spec.ts`
- Describe blocks: `'Feature Name (Feature ###, User Story #)'`
- Test names: `'should do something specific (T###)'`
- Fixture files: `*.eligian`, `*.css`, `*.html`

---

## Best Practices

### 1. Always Use Test Context Helpers

```typescript
// ✅ GOOD
const { errors } = await ctx.parseAndValidate(code);

// ❌ BAD
const document = await services.shared.workspace.DocumentBuilder.build(...);
```

### 2. Use Program Template Builders

```typescript
// ✅ GOOD: Clear, concise, maintainable
const code = minimalProgram({ actionName: 'fadeIn' });

// ❌ BAD: Verbose, error-prone, repeated 600+ times
const code = `
  styles "./styles.css"
  action fadeIn() [ selectElement("#element") ]
  timeline "test" in ".container" using raf {
    at 0s fadeIn()
  }
`;
```

### 3. Filter by Error Code, Not Message

```typescript
// ✅ GOOD: Stable, semantic
const errors = diagnostics.filter(d => d.data?.code === 'unknown_css_class');

// ❌ BAD: Brittle, breaks on message changes
const errors = diagnostics.filter(d => d.message.includes('class'));
```

### 4. Document Why Tests Exist

```typescript
describe('Event Name Validation (Feature 029, US1)', () => {
  // T034: Validate event name exists in TIMELINE_EVENTS
  test('should reject unknown event name (T034)', async () => {
    // ...
  });
});
```

### 5. Isolate Test State

```typescript
beforeEach(() => {
  // Reset CSS registry for each test
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
});
```

### 6. Keep Tests Focused

One assertion per test when possible:

```typescript
// ✅ GOOD: Single concern
test('should validate event name exists', async () => {
  const code = eventActionProgram('unknown-event', 'Test');
  const { errors } = await ctx.parseAndValidate(code);
  expect(errors.some(e => e.data?.code === 'unknown_event_name')).toBe(true);
});

// ❌ BAD: Multiple concerns (split into separate tests)
test('should validate everything', async () => {
  // Tests event name, argument count, types, etc.
});
```

---

## Advanced Patterns

### Multi-File/Import Tests

Use `createTestContextWithMockFS()` for cross-document references:

```typescript
import { createTestContextWithMockFS, createLibraryDocument } from './test-helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = createTestContextWithMockFS(); // Enable file system

  // Create library document at specific URI
  await createLibraryDocument(
    ctx,
    `library animations
     action fadeIn(selector: string, duration: number) [
       selectElement(selector)
       animate({opacity: 1}, duration)
     ]`,
    'file:///test/animations.eligian'  // Library file location
  );
});

test('imports from library', async () => {
  const code = `
    import { fadeIn } from "./animations.eligian"
    styles "./styles.css"

    timeline "test" in ".container" using raf {
      at 0s..2s fadeIn("#box", 1000)
    }
  `;

  // ⚠️ CRITICAL: parseAndValidate() does NOT support documentUri parameter!
  // You must use ctx.parse() directly with { documentUri } option
  const document = await ctx.parse(code, { documentUri: 'file:///test/main.eligian' });

  // Manually build and validate
  await ctx.services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });

  // Extract errors
  const errors = document.diagnostics?.filter(
    d => d.severity === DiagnosticSeverity.Error
  ) ?? [];

  expect(errors).toHaveLength(0);
});
```

**Key Points for Library Import Tests**:

1. **Library Location**: The library file URI (e.g., `'file:///test/animations.eligian'`) determines where the library "exists" in the mock file system

2. **Document URI Required**: When testing imports, you **CANNOT** use `ctx.parseAndValidate()` because it doesn't accept a `documentUri` parameter:
   - `parseAndValidate(code: string, cssFileUri?: string)` - second param is CSS file URI, not document URI!
   - You MUST use `ctx.parse(code, { documentUri })` directly
   - Then manually call `DocumentBuilder.build()` with `validation: true`
   - Then extract errors from `document.diagnostics`

3. **Correct Pattern for Library Import Tests**:
   ```typescript
   // Parse with documentUri
   const document = await ctx.parse(code, {
     documentUri: 'file:///test/main.eligian'
   });

   // Build and validate
   await ctx.services.shared.workspace.DocumentBuilder.build([document], {
     validation: true,
   });

   // Extract errors manually
   const errors = document.diagnostics?.filter(
     d => d.severity === DiagnosticSeverity.Error
   ) ?? [];
   ```

4. **Path Resolution**: Import paths are resolved relative to the document's directory:
   ```typescript
   // Library at: file:///test/lib/utils.eligian
   // Main file at: file:///test/main.eligian

   import { helper } from "./lib/utils.eligian"  // ✅ Resolves correctly
   ```

5. **CSS Registry**: Don't forget to setup CSS registry in `beforeEach()` if your test uses CSS classes
   - Use the resolved CSS file path that matches what the validator will see
   - If document is at `file:///test/main.eligian` and code has `styles "./styles.css"`,
     the CSS registry should be set up for `file:///test/styles.css`

**Common Mistakes**:
```typescript
// ❌ WRONG: parseAndValidate doesn't accept documentUri!
const { errors } = await ctx.parseAndValidate(code, {
  documentUri: 'file:///test/main.eligian'  // This doesn't work!
});

// ❌ WRONG: Missing documentUri entirely
const document = await ctx.parse(code);  // Library imports won't resolve!

// ✅ CORRECT: Use ctx.parse() with documentUri, then build manually
const document = await ctx.parse(code, { documentUri: 'file:///test/main.eligian' });
await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
const errors = document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
```

### Custom Diagnostic Assertions

```typescript
function expectError(diagnostics: Diagnostic[], code: string, messagePattern?: string) {
  const error = diagnostics.find(d =>
    d.severity === DiagnosticSeverity.Error &&
    d.data?.code === code &&
    (!messagePattern || d.message.includes(messagePattern))
  );
  expect(error).toBeDefined();
  return error;
}

// Usage
const error = expectError(diagnostics, 'unknown_css_class', 'button');
expect(error.message).toContain('Did you mean');
```

### Performance Testing

```typescript
test('validates 50+ event actions in <300ms (SC-002)', async () => {
  const events = Array.from({ length: 50 }, (_, i) =>
    `on event "data-sync" action Handle${i}() [ selectElement("#app") ]`
  ).join('\n');

  const code = `
    styles "./test.css"
    ${events}
    ${minimalProgram({ actionName: 'init' })}
  `;

  const start = performance.now();
  await ctx.parseAndValidate(code);
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(300);
});
```

---

## Summary Checklist

Before writing new tests, ensure:

- [ ] Imported `test-helpers.ts` functions
- [ ] Used `createTestContext()` in `beforeAll()`
- [ ] Used `setupCSSRegistry()` in `beforeEach()` if needed
- [ ] Used program template builders (`minimalProgram`, etc.)
- [ ] Filtered diagnostics with `DiagnosticSeverity` enum
- [ ] Filtered by error code (`d.data?.code`) when possible
- [ ] Documented test purpose (feature #, user story #, task #)
- [ ] Verified CSS registry state isolation
- [ ] Ran `pnpm run test` to verify all tests pass
- [ ] Ran `pnpm run check` to verify code quality

---

## Additional Resources

- **Test Helpers Source**: [`packages/language/src/__tests__/test-helpers.ts`](packages/language/src/__tests__/test-helpers.ts)
- **Example Test Files**:
  - [`parsing.spec.ts`](packages/language/src/__tests__/parsing.spec.ts) - Grammar tests
  - [`validation.spec.ts`](packages/language/src/__tests__/validation.spec.ts) - Semantic validation
  - [`event-validation/event-name-validation.spec.ts`](packages/language/src/__tests__/event-validation/event-name-validation.spec.ts) - Event validation
- **Fixtures**: [`packages/language/src/__tests__/__fixtures__/`](packages/language/src/__tests__/__fixtures__/)
- **Vitest Documentation**: https://vitest.dev/
- **Langium Testing**: https://langium.org/docs/recipes/testing/

---

## Testing Multiple Packages

### Monorepo Testing Strategy

The Eligian project is a monorepo with multiple packages, each with their own test suites:

| Package | Tests | Purpose | Special Requirements |
|---------|-------|---------|---------------------|
| `language` | 1,383 | Grammar, validators, type system | None |
| `cli` | 12 | Command-line compiler | Node environment |
| `extension` | 91 | VS Code extension | jsdom + vscode mock |
| `compiler` | 9 | AST transformation (Effect-based) | None |

### Running All Tests

**From Package Directory** (recommended for package-specific tests):
```bash
cd packages/extension
npx vitest run  # Uses package's vitest.config.ts
```

**Using vitest-mcp** (recommended for automation):
```typescript
// Run all packages sequentially
const packages = ['language', 'cli', 'extension', 'compiler'];

for (const pkg of packages) {
  const result = await mcp__vitest__run_tests({
    target: `packages/${pkg}`,
    format: 'summary'
  });

  if (!result.success) {
    console.error(`${pkg} tests failed`);
    // Handle failure
  }
}
```

### Package-Specific Considerations

**Language Package**:
- Largest test suite (1,383 tests)
- Uses Langium test utilities extensively
- Requires CSS registry setup for many tests
- Test helpers in `src/__tests__/test-helpers.ts`

**CLI Package**:
- Tests use `execSync()` to run compiled CLI
- Requires test fixtures with current DSL syntax
- Tests verify stdout/stderr output
- Tests check exit codes (0=success, 1=compile error, 3=IO error)

**Extension Package**:
- Requires jsdom environment for DOM tests
- Requires vscode module mock
- Mix of unit tests (pure functions) and integration tests (VS Code API)
- Run from package directory to ensure correct vitest.config.ts loads

**Compiler Package**:
- Effect-ts based pipeline tests
- Snapshot testing for JSON output
- Tests each pipeline stage independently

### Common Multi-Package Issues

#### Shared Dependencies

All packages depend on `@eligian/language` for types and validators. When making changes to the language package:

1. **Rebuild language package**:
   ```bash
   cd packages/language
   pnpm run build
   ```

2. **Test dependent packages**:
   ```bash
   cd packages/cli
   npx vitest run

   cd packages/extension
   npx vitest run
   ```

#### Test Fixture Synchronization

When DSL syntax changes, update fixtures in ALL packages:

- `packages/cli/src/__tests__/__fixtures__/*.eligian`
- `packages/language/src/__tests__/__fixtures__/**/*.eligian`
- `packages/extension/src/__tests__/__fixtures__/*.eligian`
- `examples/*.eligian` (documentation examples)

#### Configuration Consistency

Ensure vitest.config.ts settings are appropriate for each package:

```typescript
// language - default config
export default defineConfig({
  test: { globals: true }
});

// extension - jsdom + vscode mock
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom'
  },
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./src/extension/__tests__/__mocks__/vscode.ts', import.meta.url))
    }
  }
});

// cli - node environment (default)
export default defineConfig({
  test: { globals: true }
});
```

### Continuous Integration

For CI/CD, run all tests with summary output:

```bash
# From root
pnpm -r test  # Runs test script in all packages

# Or with vitest-mcp
for pkg in language cli extension compiler; do
  npx vitest run "packages/$pkg" --reporter=json
done
```

### Coverage Across Packages

**Individual package coverage**:
```bash
cd packages/language
npx vitest run --coverage
```

**Aggregate coverage** (from root):
```bash
pnpm run test:coverage  # Uses tools/pruned-coverage.ts
```

**Coverage targets**:
- Language package: >80% (currently 81.72%)
- CLI package: >70%
- Extension package: >60% (integration tests harder to cover)
- Compiler package: >85% (pure logic, easier to test)

---

**Questions or Issues?** Consult this guide first. If issues persist, review existing test files for patterns or ask for help.
