# Eligian Testing Guide

> **REQUIRED READING**: All developers writing tests for the Eligian project MUST read and follow this guide to avoid common pitfalls and maintain consistency across the test suite.

**Last Updated**: 2025-01-12
**Test Suite Size**: 1,483 tests across 106 test files
**Coverage**: 81.72%
**Framework**: Vitest + Langium Test Utilities

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Infrastructure Overview](#test-infrastructure-overview)
3. [Essential Patterns](#essential-patterns)
4. [Program Template Builders](#program-template-builders)
5. [CSS Registry Management](#css-registry-management)
6. [Common Mistakes and Solutions](#common-mistakes-and-solutions)
7. [Minimum Valid Program Requirements](#minimum-valid-program-requirements)
8. [Test File Organization](#test-file-organization)
9. [Best Practices](#best-practices)
10. [Advanced Patterns](#advanced-patterns)

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
    // Use program template builder instead of inline code
    const code = minimalProgram({
      actionName: 'myAction',
      actionBody: 'addClass("button")',
    });

    const { errors, warnings, diagnostics } = await ctx.parseAndValidate(code);

    // Filter by severity using enum (NOT magic numbers!)
    const errorsByCode = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.data?.code === 'specific_error_code'
    );

    expect(errorsByCode).toHaveLength(0);
  });
});
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

### Setup Pattern

**For read-only CSS** (most tests):
```typescript
beforeAll(() => {
  ctx = createTestContext();
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
});
```

**For CSS modifications** (hot-reload tests, per-test CSS):
```typescript
beforeEach(() => {
  setupCSSRegistry(ctx, 'file:///styles.css', {
    classes: ['button', 'primary'],
    ids: ['app', 'header']
  });
});
```

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

**Error**: `"Unknown CSS class: 'button'"`

**Bad Code**:
```typescript
const code = `
  timeline "test" in ".container" using raf {
    at 0s [ addClass("button") ] []
  }
`;
```

**Solution**: Include CSS import and setup CSS registry:
```typescript
beforeEach(() => {
  setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['button', 'container'] });
});

const code = minimalProgram({
  actionBody: 'addClass("button")',
  timelineBody: 'at 0s testAction()'
});
```

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

**Questions or Issues?** Consult this guide first. If issues persist, review existing test files for patterns or ask for help.
