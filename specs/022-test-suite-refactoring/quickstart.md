# Quickstart: Test Helpers Usage Guide

**Feature**: Test Suite Refactoring (022)
**Purpose**: Quick reference for using shared test utilities in Eligian test files
**Target Audience**: Developers writing or refactoring Eligian tests

---

## TL;DR

```typescript
import { createTestContext, setupCSSRegistry, CSS_FIXTURES } from './test-helpers.js';

describe('My Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('example', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {}
    `);
    expect(errors).toHaveLength(0);
  });
});
```

---

## Installation

**No installation needed** - test helpers are co-located in the `__tests__/` directory:

```typescript
import { createTestContext, setupCSSRegistry, CSS_FIXTURES } from './test-helpers.js';
```

---

## Core API

### `createTestContext()`

Creates test context with services, parse helper, and parseAndValidate helper.

**Returns**: `TestContext` object containing:
- `services` - Eligian language services instance
- `parse` - Langium parse helper
- `parseAndValidate` - Combined parse + validate helper

**Example**:
```typescript
let ctx: TestContext;

beforeAll(() => {
  ctx = createTestContext();
});

test('example', async () => {
  const { errors } = await ctx.parseAndValidate(`
    action test [ selectElement("#box") ]
  `);
  expect(errors).toHaveLength(0);
});
```

---

### `parseAndValidate(code, cssFileUri?)`

Parse Eligian code and trigger validation.

**Parameters**:
- `code: string` - Eligian DSL source code
- `cssFileUri?: string` - Optional CSS file URI (default: `'file:///styles.css'`)

**Returns**: `Promise<ValidationResult>` containing:
- `document` - Langium document
- `program` - Parsed AST root
- `diagnostics` - All diagnostics
- `errors` - Error-level diagnostics (severity 1)
- `warnings` - Warning-level diagnostics (severity 2)

**Example**:
```typescript
const { errors, warnings, program } = await ctx.parseAndValidate(`
  timeline "Test" in ".container" using raf {}
`);

expect(errors).toHaveLength(0);
expect(warnings).toHaveLength(0);
expect(program.timelines).toHaveLength(1);
```

---

### `setupCSSRegistry(ctx, cssFileUri, fixture)`

Populate CSS registry with test data.

**Parameters**:
- `ctx: TestContext` - Test context from createTestContext()
- `cssFileUri: string` - CSS file URI (default: `'file:///styles.css'`)
- `fixture: CSSFixture` - CSS classes and IDs (default: `CSS_FIXTURES.common`)

**Example**:
```typescript
beforeAll(() => {
  ctx = createTestContext();
  setupCSSRegistry(ctx, 'file:///styles.css', {
    classes: ['button', 'primary'],
    ids: ['app', 'container'],
  });
});
```

---

### `CSS_FIXTURES`

Predefined CSS test data sets.

**Available Fixtures**:
- `CSS_FIXTURES.common` - General-purpose classes (button, primary, active, etc.)
- `CSS_FIXTURES.timeline` - Timeline-specific classes (test-container, presentation-container, etc.)

**Example**:
```typescript
// Use common fixture
setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);

// Use timeline fixture
setupCSSRegistry(ctx, 'file:///timeline.css', CSS_FIXTURES.timeline);

// Merge fixtures
setupCSSRegistry(ctx, 'file:///styles.css', {
  ...CSS_FIXTURES.common,
  classes: [...CSS_FIXTURES.common.classes, 'custom-class'],
});
```

---

### `getErrors(document)` / `getWarnings(document)`

Filter diagnostics by severity level.

**Example**:
```typescript
import { getErrors, getWarnings } from './test-helpers.js';

const document = await ctx.parse(`timeline "Test" in ".container" using raf {}`);
const errors = getErrors(document);
const warnings = getWarnings(document);

expect(errors).toHaveLength(0);
expect(warnings).toHaveLength(0);
```

---

### `DiagnosticSeverity`

Enum for diagnostic severity levels (matches Langium LSP protocol).

**Values**:
- `DiagnosticSeverity.Error` = 1
- `DiagnosticSeverity.Warning` = 2
- `DiagnosticSeverity.Information` = 3
- `DiagnosticSeverity.Hint` = 4

**Example**:
```typescript
import { DiagnosticSeverity } from './test-helpers.js';

const document = await ctx.parse(`...`);
const errors = document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
```

---

## Migration Guide

### Before (Old Pattern)

```typescript
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('My Tests', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);

    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('file:///styles.css', {
      classes: new Set(['button', 'primary', 'secondary']),
      ids: new Set(['app', 'container']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });
  });

  async function parseAndValidate(code: string) {
    const document = await parse(code);
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const documentUri = document.uri?.toString();
    if (documentUri) {
      cssRegistry.registerImports(documentUri, ['file:///styles.css']);
    }
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return {
      document,
      program: document.parseResult.value as Program,
      diagnostics: document.diagnostics ?? [],
      validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
    };
  }

  test('example', async () => {
    const { validationErrors } = await parseAndValidate(`
      timeline "Test" in ".container" using raf {}
    `);
    expect(validationErrors).toHaveLength(0);
  });
});
```

### After (New Pattern with Helpers)

```typescript
import { createTestContext, setupCSSRegistry, CSS_FIXTURES, type TestContext } from './test-helpers.js';

describe('My Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('example', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {}
    `);
    expect(errors).toHaveLength(0);
  });
});
```

**Lines Reduced**: 30+ lines → 10 lines (67% reduction)

---

## Common Patterns

### Pattern 1: Basic Test with Service Setup

```typescript
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Parsing Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  test('parses valid timeline', async () => {
    const { errors, program } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {}
    `);
    expect(errors).toHaveLength(0);
    expect(program.timelines).toHaveLength(1);
  });
});
```

### Pattern 2: CSS Validation Tests

```typescript
import { createTestContext, setupCSSRegistry, CSS_FIXTURES, type TestContext } from './test-helpers.js';

describe('CSS Validation Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('validates valid CSS class', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {
        at 0s selectElement("#box") {
          addClass("button")
        }
      }
    `);
    expect(errors).toHaveLength(0);
  });

  test('detects invalid CSS class', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {
        at 0s selectElement("#box") {
          addClass("nonexistent")
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Unknown CSS class');
  });
});
```

### Pattern 3: Custom CSS Fixtures

```typescript
import { createTestContext, setupCSSRegistry, type TestContext } from './test-helpers.js';

describe('Custom CSS Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///custom.css', {
      classes: ['my-custom-class', 'another-class'],
      ids: ['custom-id'],
    });
  });

  test('validates custom CSS', async () => {
    const { errors } = await ctx.parseAndValidate(`
      timeline "Test" in ".container" using raf {
        at 0s selectElement("#custom-id") {
          addClass("my-custom-class")
        }
      }
    `);
    expect(errors).toHaveLength(0);
  });
});
```

### Pattern 4: Merging Multiple Fixtures

```typescript
import { createTestContext, setupCSSRegistry, CSS_FIXTURES, type TestContext } from './test-helpers.js';

describe('Merged Fixtures Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///styles.css', {
      ...CSS_FIXTURES.common,
      ...CSS_FIXTURES.timeline,
      classes: [
        ...CSS_FIXTURES.common.classes,
        ...CSS_FIXTURES.timeline.classes,
        'extra-class',
      ],
      ids: [
        ...CSS_FIXTURES.common.ids,
        ...CSS_FIXTURES.timeline.ids,
        'extra-id',
      ],
    });
  });

  test('has all classes from both fixtures', async () => {
    // Test uses classes from common, timeline, and extra-class
  });
});
```

---

## Best Practices

### ✅ DO

- Use `createTestContext()` in `beforeAll()` for expensive setup
- Use `setupCSSRegistry()` after creating context
- Use `CSS_FIXTURES.common` for general tests
- Use `CSS_FIXTURES.timeline` for timeline-specific tests
- Use `ctx.parseAndValidate()` for most tests (combines parse + validate)
- Use destructuring to extract only needed fields: `const { errors } = await ctx.parseAndValidate(...)`
- Use `DiagnosticSeverity` enum instead of magic numbers

### ❌ DON'T

- Don't create services manually (use `createTestContext()`)
- Don't manually populate CSS registry (use `setupCSSRegistry()`)
- Don't use magic numbers for severity (use `DiagnosticSeverity` enum)
- Don't create `parseAndValidate` function yourself (use `ctx.parseAndValidate()`)
- Don't type-assert `document.parseResult.value as Program` (helper returns typed `program`)

---

## Troubleshooting

### Issue: "Cannot find module './test-helpers.js'"

**Solution**: Import path is relative to test file location. Use `./test-helpers.js` if test is in `__tests__/` root, or `../test-helpers.js` if in subdirectory.

```typescript
// Test in __tests__/validation.spec.ts
import { createTestContext } from './test-helpers.js';

// Test in __tests__/css-validation/valid.spec.ts
import { createTestContext } from '../test-helpers.js';
```

### Issue: CSS validation not working

**Solution**: Make sure to call `setupCSSRegistry()` after `createTestContext()` and before running tests:

```typescript
beforeAll(() => {
  ctx = createTestContext();
  setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common); // Must be after createTestContext
});
```

### Issue: Tests fail with "Cannot read property 'css' of undefined"

**Solution**: Make sure `ctx` is initialized in `beforeAll()` before tests run:

```typescript
let ctx: TestContext;  // Declare at top

beforeAll(() => {
  ctx = createTestContext();  // Initialize before tests
});

test('example', async () => {
  const { errors } = await ctx.parseAndValidate(`...`);  // Now ctx is defined
});
```

---

## Performance Tips

- **Use beforeAll() for context creation** - Creates services once per test suite (not per test)
- **Use beforeEach() for per-test cleanup** - Only if tests modify shared state
- **Avoid creating multiple contexts** - One context per describe block is sufficient
- **Reuse CSS fixtures** - Don't create custom fixtures unless needed

---

## Further Reading

- [TEST_SUITE_ANALYSIS.md](../../TEST_SUITE_ANALYSIS.md) - Comprehensive test suite analysis
- [spec.md](./spec.md) - Feature specification
- [plan.md](./plan.md) - Implementation plan
- [Vitest Documentation](https://vitest.dev/) - Vitest testing framework
- [Langium Testing Utilities](https://langium.org/docs/testing/) - Langium test helpers

---

**Last Updated**: 2025-11-02
**Feature Status**: Implementation in progress (Phase 1)
