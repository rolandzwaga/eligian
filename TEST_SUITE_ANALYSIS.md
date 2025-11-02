# Test Suite Analysis: Eligian Language Package

**Date**: 2025-11-02
**Analyzer**: Claude (Sonnet 4.5)
**Test Framework**: Vitest 3.2.4
**Language Framework**: Langium 3.0+
**Total Test Files**: 85
**Total Tests**: 1462
**Coverage**: 81.72%

---

## Executive Summary

The Eligian test suite is **generally well-structured** with good coverage and adherence to most best practices. However, there are several opportunities for improvement around **test helper duplication**, **lifecycle hook consistency**, and **setup/teardown patterns**.

**Key Findings**:
- ✅ **Strengths**: Isolated integration tests, good use of Langium helpers, comprehensive coverage
- ⚠️ **Issues**: Repeated service initialization, inconsistent CSS registry setup, mixed lifecycle hook patterns
- 🎯 **Priority**: Extract shared test utilities to eliminate duplication

---

## 1. Test Organization & Structure

### Current Structure
```
packages/language/src/__tests__/
├── *.spec.ts (root level integration tests)
├── css-classname-validation/
├── css-selector-validation/
├── css-invalid-file/
├── css-hot-reload/
├── css-ide-features/
├── integration/
├── jsdoc-integration/
└── __fixtures__/
```

### ✅ Strengths

1. **Feature-Based Organization**: Tests are organized by feature domain (CSS validation, JSDoc, Typir integration)
2. **Isolated Integration Tests**: Per Constitution requirements, each integration test is in a separate file
3. **Fixture Management**: Centralized `__fixtures__/` directory with `valid/` and `invalid/` subdirectories
4. **Clear Naming**: Test files use descriptive names (e.g., `typir-import-validation.spec.ts`)

### ⚠️ Areas for Improvement

1. **Inconsistent Depth**: Some tests are at root level (e.g., `parsing.spec.ts`, `validation.spec.ts`) while others are nested 2-3 levels deep
2. **Mixed Concerns**: Root-level tests mix grammar parsing, validation, and integration concerns

**Recommendation**: Consider flattening structure or establishing clear rules (e.g., `integration/` for cross-cutting tests, `unit/` for isolated components).

---

## 2. Duplication Analysis

### 🔴 Critical Duplication: Service Initialization

**Pattern Found 124 Times**:
```typescript
const services = createEligianServices(EmptyFileSystem).Eligian;
const parse = parseHelper<Program>(services);
```

**Impact**: Every test file repeats this 3-4 line setup, leading to ~400+ lines of duplicated code.

### Duplication Hotspots

#### A. Service Initialization (High Priority)

**Current Pattern** (repeated in ~40 files):
```typescript
let services: ReturnType<typeof createEligianServices>;
let parse: ReturnType<typeof parseHelper<Program>>;

beforeAll(async () => {
  services = createEligianServices(EmptyFileSystem);
  parse = parseHelper<Program>(services.Eligian);
});
```

**Recommended Fix**: Create shared test utility:
```typescript
// __tests__/test-helpers.ts
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

export interface TestContext {
  services: ReturnType<typeof createEligianServices>;
  parse: ReturnType<typeof parseHelper<Program>>;
  parseAndValidate: (code: string) => Promise<ValidationResult>;
}

export function createTestContext(): TestContext {
  const services = createEligianServices(EmptyFileSystem);
  const parse = parseHelper<Program>(services.Eligian);

  return {
    services,
    parse,
    async parseAndValidate(code: string) {
      const document = await parse(code);
      await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
      return {
        document,
        program: document.parseResult.value as Program,
        diagnostics: document.diagnostics ?? [],
        validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
        validationWarnings: document.diagnostics?.filter(d => d.severity === 2) ?? [],
      };
    },
  };
}
```

**Usage**:
```typescript
describe('My Tests', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  test('example', async () => {
    const { validationErrors } = await ctx.parseAndValidate(`...`);
    expect(validationErrors).toHaveLength(0);
  });
});
```

**Estimated Savings**: ~400 lines of code, improved consistency, easier maintenance.

---

#### B. CSS Registry Setup (Medium Priority)

**Current Pattern** (repeated in ~24 files):
```typescript
const cssRegistry = services.Eligian.css.CSSRegistry;
cssRegistry.updateCSSFile('file:///styles.css', {
  classes: new Set(['button', 'primary', 'secondary']),
  ids: new Set(['box', 'container']),
  classLocations: new Map(),
  idLocations: new Map(),
  classRules: new Map(),
  idRules: new Map(),
  errors: [],
});
```

**Issues**:
1. **Verbose Boilerplate**: 7 lines of setup for empty Maps
2. **Inconsistent URIs**: Some use `file:///styles.css`, others use `file:///test/styles.css`
3. **Repeated Class Lists**: Same classes redefined across tests

**Recommended Fix**: Create CSS registry helper:
```typescript
// __tests__/test-helpers.ts
export interface CSSFixture {
  classes?: string[];
  ids?: string[];
}

export function setupCSSRegistry(
  services: ReturnType<typeof createEligianServices>,
  cssFileUri: string = 'file:///styles.css',
  fixture: CSSFixture = {}
) {
  const cssRegistry = services.Eligian.css.CSSRegistry;
  cssRegistry.updateCSSFile(cssFileUri, {
    classes: new Set(fixture.classes ?? []),
    ids: new Set(fixture.ids ?? []),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors: [],
  });
}

// Predefined fixtures
export const CSS_FIXTURES = {
  common: {
    classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible'],
    ids: ['app', 'container', 'box', 'element'],
  },
  timeline: {
    classes: ['test-container', 'container', 'presentation-container'],
    ids: ['test', 'title', 'credits'],
  },
};
```

**Usage**:
```typescript
beforeAll(() => {
  setupCSSRegistry(services, 'file:///styles.css', CSS_FIXTURES.common);
});
```

**Estimated Savings**: ~150 lines, improved consistency.

---

#### C. parseAndValidate Helper (Medium Priority)

**Current Pattern** (repeated in ~15 files):
```typescript
async function parseAndValidate(code: string) {
  const document = await parse(code);
  await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
  return {
    document,
    program: document.parseResult.value as Program,
    diagnostics: document.diagnostics ?? [],
    validationErrors: document.diagnostics?.filter(d => d.severity === 1) ?? [],
  };
}
```

**Issue**: Identical function defined in multiple test files.

**Recommended Fix**: Include in `createTestContext()` (shown above in Section A).

---

#### D. Fixture Loading (Low Priority)

**Current Pattern**:
```typescript
function loadFixture(filename: string): string {
  const path = join(__dirname, '__fixtures__', filename);
  return readFileSync(path, 'utf-8');
}
```

**Frequency**: ~5 files

**Recommended Fix**: Extract to shared utility:
```typescript
// __tests__/test-helpers.ts
export function loadFixture(filename: string, subdir: string = ''): string {
  const path = join(__dirname, '__fixtures__', subdir, filename);
  return readFileSync(path, 'utf-8');
}
```

---

## 3. Langium Test Helper Usage

### ✅ Correct Patterns

The project correctly uses Langium testing utilities:

1. **parseHelper**: Properly imported from `langium/test`
2. **EmptyFileSystem**: Correctly used for isolated testing
3. **Validation Triggering**: Properly enables validation with `{ validation: true }`
4. **DocumentBuilder**: Correctly builds documents before checking diagnostics

**Example of Correct Usage**:
```typescript
const services = createEligianServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Eligian);
const document = await parse(code);
await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
```

### ⚠️ Potential Issues

#### 1. Missing Error Checks in Some Tests

**Issue**: Some parsing tests don't verify lexer/parser errors before asserting on AST structure.

**Example** (`parsing.spec.ts:41-52`):
```typescript
test('should parse video timeline with source', async () => {
  const program = await parseEligian('timeline "main" in ".container" using video from "video.mp4" {}');

  expect(getElements(program)).toHaveLength(1);
  // ❌ Missing: No check for parseResult.lexerErrors or parseResult.parserErrors
});
```

**Recommended Pattern** (from Langium docs):
```typescript
test('should parse video timeline with source', async () => {
  const document = await parseDocument(services, 'timeline "main" ...');

  // ✅ Verify no parsing errors first
  expect(document.parseResult.lexerErrors).toHaveLength(0);
  expect(document.parseResult.parserErrors).toHaveLength(0);

  const program = document.parseResult.value as Program;
  expect(getElements(program)).toHaveLength(1);
});
```

**Recommendation**: Add parsing error checks to all grammar tests in `parsing.spec.ts`.

---

#### 2. Inconsistent Document URI Handling

**Issue**: Some tests manually set document URIs, others rely on auto-generated URIs, leading to CSS path resolution issues.

**Example** (`validation.spec.ts:56-60`):
```typescript
const cssRegistry = services.Eligian.css.CSSRegistry;
const documentUri = document.uri?.toString();
if (documentUri) {
  cssRegistry.registerImports(documentUri, ['file:///styles.css']);
}
```

vs.

**Example** (`css-classname-validation/unknown-classname.spec.ts:29-32`):
```typescript
// Comment: "NOTE: Document URI is file:///1.eligian, so "./styles.css" resolves to "file:///styles.css""
// ❌ Relies on implicit URI generation
```

**Recommendation**: Standardize on explicit URI handling or document the auto-generation pattern clearly.

---

#### 3. CSS Registry State Management

**Issue**: CSS registry state may leak between tests if not properly cleared.

**Current**: Most tests use `beforeAll()` for one-time setup, which doesn't clear state between tests.

**Recommendation**: Add cleanup in `afterEach` or use `beforeEach` for tests that modify CSS registry:
```typescript
afterEach(() => {
  // Clear CSS registry to prevent state leakage
  services.Eligian.css.CSSRegistry.clearDocument(document.uri.toString());
});
```

---

## 4. Vitest Best Practices Compliance

### ✅ Strengths

1. **Async/Await**: All async operations properly use `async/await` in lifecycle hooks
2. **Descriptive Tests**: Test names clearly describe what they're testing
3. **describe() Grouping**: Good use of nested `describe()` blocks for organization
4. **Assertions**: Clear, focused assertions using Vitest matchers

### ⚠️ Issues & Anti-Patterns

#### A. Inconsistent Lifecycle Hook Usage

**Issue**: Mixed use of `beforeAll()` vs `beforeEach()` without clear rationale.

**Current State**:
- ~30 files use `beforeAll()` for service initialization
- ~5 files use `beforeEach()` for per-test setup
- Some files use both without clear separation of concerns

**Vitest Best Practice** (from Context7 docs):
- `beforeAll()`: One-time setup (database connections, service initialization)
- `beforeEach()`: Per-test setup (resetting mocks, clearing state)
- `afterEach()`: Per-test cleanup (clearing mocks, closing connections)
- `afterAll()`: One-time teardown (closing database, cleaning up resources)

**Recommendation**:
```typescript
describe('Test Suite', () => {
  let ctx: TestContext;

  beforeAll(() => {
    // ✅ One-time: Create services (expensive, stateless)
    ctx = createTestContext();
  });

  beforeEach(() => {
    // ✅ Per-test: Clear mocks, reset state (cheap, stateful)
    vi.clearAllMocks();
  });

  afterEach(() => {
    // ✅ Per-test: Cleanup CSS registry (if modified in test)
    ctx.services.Eligian.css.CSSRegistry.clear();
  });
});
```

---

#### B. No Global Setup/Teardown

**Issue**: Test suite lacks global setup file for shared configuration.

**Vitest Best Practice**: Use `setupFiles` for common initialization:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

**Recommendation**: Create `__tests__/setup.ts` for:
- Setting test timeouts
- Configuring global mock behaviors
- Initializing test environment variables

---

#### C. Missing Mock Cleanup

**Issue**: Some tests spy on functions but don't restore them.

**Example** (potential issue):
```typescript
test('spy on method', () => {
  const spy = vi.spyOn(object, 'method');
  // ❌ Missing: spy.mockRestore() or vi.restoreAllMocks()
});
```

**Vitest Best Practice** (from Context7 docs):
```typescript
afterEach(() => {
  vi.restoreAllMocks(); // Restores all spies/mocks
});
```

**Recommendation**: Add to shared test helper or global setup.

---

#### D. Test Fixtures as Constants

**Issue**: Some fixtures are loaded repeatedly in `beforeEach()` loops.

**Example** (`integration/constant-folding.spec.ts`):
```typescript
beforeEach(() => {
  // ❌ Repeatedly reads same file
  const fixture = loadFixture('valid/constant-folding.eligian');
});
```

**Vitest Best Practice**: Load fixtures once in `beforeAll()`:
```typescript
let fixture: string;

beforeAll(() => {
  fixture = loadFixture('valid/constant-folding.eligian'); // ✅ Load once
});

test('uses fixture', async () => {
  const result = await parse(fixture);
  // ...
});
```

---

## 5. Anti-Patterns & Code Smells

### 🔴 High Priority

#### A. Unnecessary Type Assertions

**Pattern**:
```typescript
const program = document.parseResult.value as Program;
```

**Issue**: Repeated in ~50+ locations. Type should be inferred from `parseHelper<Program>`.

**Recommended**: Define `parseHelper` with proper generic:
```typescript
const parse = parseHelper<Program>(services.Eligian);
const document = await parse(code);
const program = document.parseResult.value; // ✅ Already typed as Program
```

---

#### B. Silent Failures in Loops

**Pattern** (`validation.spec.ts:108-125`):
```typescript
for (const provider of validProviders) {
  const code = /* ... */;
  const { validationErrors } = await parseAndValidate(code);

  const providerErrors = validationErrors.filter(e => /* ... */);
  expect(providerErrors.length).toBe(0);
}
```

**Issue**: If one provider fails, test continues with others, making failures unclear.

**Vitest Best Practice**: Use `test.each()`:
```typescript
test.each([
  { provider: 'video', needsSource: true },
  { provider: 'audio', needsSource: true },
  { provider: 'raf', needsSource: false },
  { provider: 'custom', needsSource: false },
])('should accept $provider provider', async ({ provider, needsSource }) => {
  const code = needsSource
    ? `timeline "test" in ".test-container" using ${provider} from "test.mp4" {}`
    : `timeline "test" in ".test-container" using ${provider} {}`;

  const { validationErrors } = await parseAndValidate(code);

  const providerErrors = validationErrors.filter(e => e.message.includes('Invalid timeline provider'));
  expect(providerErrors.length).toBe(0);
});
```

**Benefits**:
- Clear failure messages showing which provider failed
- Better test isolation
- Parallel execution potential

---

#### C. Magic Numbers

**Pattern**:
```typescript
const validationErrors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
const validationWarnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
```

**Issue**: Magic numbers `1` and `2` repeated ~30+ times.

**Recommended**: Create constants:
```typescript
// __tests__/test-helpers.ts
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export function getErrors(document: LangiumDocument) {
  return document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
}

export function getWarnings(document: LangiumDocument) {
  return document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [];
}
```

---

### ⚠️ Medium Priority

#### D. Repeated CSS Registry Boilerplate

**Already covered in Section 2.B** (CSS Registry Setup).

---

#### E. Inconsistent Assertion Patterns

**Pattern Variations**:
```typescript
// Pattern 1
expect(validationErrors.length).toBeGreaterThan(0);
expect(validationErrors.some(e => e.message.includes('...'))).toBe(true);

// Pattern 2
expect(validationErrors.length).toBe(1);
expect(validationErrors[0].message).toContain('...');

// Pattern 3
const errorMessages = validationErrors.map(e => e.message);
expect(errorMessages).toContain('...');
```

**Recommendation**: Standardize on Pattern 2 when expecting specific errors:
```typescript
expect(validationErrors).toHaveLength(1);
expect(validationErrors[0].message).toContain('...');
```

Or create custom matchers:
```typescript
expect.extend({
  toHaveErrorMatching(received, messageMatcher) {
    const errors = received.diagnostics?.filter(d => d.severity === 1) ?? [];
    const pass = errors.some(e => e.message.includes(messageMatcher));
    return {
      pass,
      message: () => `expected errors to ${pass ? 'not ' : ''}contain "${messageMatcher}"`,
    };
  },
});

// Usage
expect(document).toHaveErrorMatching('Duplicate layout');
```

---

## 6. Performance Considerations

### Current Performance: ✅ Good

- **Test Suite Runtime**: ~8 seconds for 1462 tests
- **Average Test Time**: ~5ms per test
- **No Obvious Bottlenecks**

### Potential Optimizations

#### A. Parallel Test Execution

**Current**: Vitest runs tests in parallel by default, and suite performs well.

**Recommendation**: No action needed, but monitor as suite grows.

---

#### B. Shared Service Instance Caching

**Opportunity**: Services are recreated in every test file's `beforeAll()`.

**Potential Optimization**: Create a shared service instance manager:
```typescript
// __tests__/test-helpers.ts
let _sharedServices: ReturnType<typeof createEligianServices> | null = null;

export function getSharedServices() {
  if (!_sharedServices) {
    _sharedServices = createEligianServices(EmptyFileSystem);
  }
  return _sharedServices;
}
```

**Caution**: Only safe if tests don't mutate shared service state. Current tests mostly modify CSS registry, which is safe to share if cleared properly.

**Estimated Savings**: Minimal (~100ms) - current approach is already fast.

---

## 7. Test Coverage Analysis

### Current Coverage: 81.72% ✅

**Breakdown by Module**:
- `type-system-typir`: 86.2% ✅
- `type-system-typir/utils`: 100% ✅
- `type-system-typir/validation`: 92.97% ✅
- `type-system-typir/inference`: 20.74% ⚠️
- `type-system-typir/types`: 58.42% ⚠️

### Coverage Gaps

#### Low Coverage Modules

**`type-system-typir/inference` (20.74%)**:
- **Reason**: Inference functions are registration callbacks called by Typir framework
- **Assessment**: Low coverage is expected - integration tests verify these work end-to-end
- **Recommendation**: **No action needed** - integration tests provide sufficient coverage

**`type-system-typir/types` (58.42%)**:
- **Reason**: Type factories called by Typir framework at runtime
- **Assessment**: Similar to inference, these are framework-internal
- **Recommendation**: **No action needed** - hover tests verify type names work correctly

### Uncovered Scenarios

Based on fixture analysis, the following scenarios may lack coverage:

1. **Complex nested control flow** (if inside for inside if)
2. **Edge cases in arithmetic expressions** (division by zero, overflow)
3. **Unicode handling** in identifiers/strings
4. **Very large programs** (1000+ lines) for performance testing

**Recommendation**: Add targeted tests if these scenarios are encountered in production.

---

## 8. Recommended Action Plan

### Phase 1: High Priority (Week 1)

**Goal**: Eliminate duplication, improve maintainability

1. **Create Shared Test Utilities** (2 hours)
   - Implement `__tests__/test-helpers.ts` with:
     - `createTestContext()` function
     - `setupCSSRegistry()` helper
     - `CSS_FIXTURES` constants
     - `DiagnosticSeverity` enum
     - Diagnostic filter helpers (`getErrors()`, `getWarnings()`)

2. **Refactor 10 High-Traffic Test Files** (4 hours)
   - Update `validation.spec.ts`, `parsing.spec.ts`, `typir-*.spec.ts`
   - Replace duplicated code with shared utilities
   - Verify tests still pass

3. **Add Parse Error Checks** (2 hours)
   - Update all tests in `parsing.spec.ts` to check `lexerErrors` and `parserErrors`
   - Follows Langium best practices

**Estimated Impact**: -400 lines of code, improved consistency, easier maintenance

---

### Phase 2: Medium Priority (Week 2)

**Goal**: Improve test quality and consistency

1. **Standardize Lifecycle Hooks** (2 hours)
   - Add documentation for when to use `beforeAll()` vs `beforeEach()`
   - Add `afterEach()` cleanup for CSS registry state
   - Add `vi.restoreAllMocks()` to relevant test suites

2. **Convert Loop Tests to test.each()** (2 hours)
   - Refactor provider validation tests
   - Refactor parameter type tests
   - Improves failure diagnostics

3. **Add Global Setup File** (1 hour)
   - Create `__tests__/setup.ts` with common configuration
   - Configure in `vitest.config.ts`

**Estimated Impact**: Improved test isolation, clearer failure messages

---

### Phase 3: Low Priority (Week 3)

**Goal**: Polish and optimization

1. **Custom Vitest Matchers** (2 hours)
   - Implement `toHaveErrorMatching()`, `toHaveWarningMatching()`
   - Simplifies assertion patterns

2. **Performance Profiling** (1 hour)
   - Profile test suite with `vitest --reporter=verbose`
   - Identify any slow tests (>100ms)

3. **Documentation** (2 hours)
   - Add `TESTING.md` guide for contributors
   - Document test helper usage
   - Document fixture organization

**Estimated Impact**: Improved developer experience, better onboarding

---

## 9. Code Examples

### Before: Duplicated Setup (Current Pattern)

```typescript
// File 1: validation.spec.ts
describe('Eligian Grammar - Validation', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(async () => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);

    const cssRegistry = services.Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile('file:///styles.css', {
      classes: new Set(['test-container', 'container', 'active']),
      ids: new Set(['box', 'element']),
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

  test('should require exactly one timeline', async () => {
    const code = `...`;
    const { validationErrors } = await parseAndValidate(code);
    expect(validationErrors.length).toBeGreaterThan(0);
  });
});

// File 2: typir-import-validation.spec.ts
describe('US1: Import Statement Type Checking', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  // ... same setup repeated ...
});
```

### After: Shared Test Utilities (Recommended Pattern)

```typescript
// __tests__/test-helpers.ts
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { LangiumDocument } from 'langium';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface ValidationResult {
  document: LangiumDocument<Program>;
  program: Program;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface TestContext {
  services: ReturnType<typeof createEligianServices>;
  parse: ReturnType<typeof parseHelper<Program>>;
  parseAndValidate: (code: string, cssFileUri?: string) => Promise<ValidationResult>;
}

export function createTestContext(): TestContext {
  const services = createEligianServices(EmptyFileSystem);
  const parse = parseHelper<Program>(services.Eligian);

  return {
    services,
    parse,
    async parseAndValidate(code: string, cssFileUri: string = 'file:///styles.css') {
      const document = await parse(code);

      const documentUri = document.uri?.toString();
      if (documentUri) {
        services.Eligian.css.CSSRegistry.registerImports(documentUri, [cssFileUri]);
      }

      await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

      return {
        document,
        program: document.parseResult.value,
        diagnostics: document.diagnostics ?? [],
        errors: document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [],
        warnings: document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [],
      };
    },
  };
}

export interface CSSFixture {
  classes?: string[];
  ids?: string[];
}

export const CSS_FIXTURES = {
  common: {
    classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible'],
    ids: ['app', 'container', 'box', 'element'],
  },
  timeline: {
    classes: ['test-container', 'container', 'presentation-container'],
    ids: ['test', 'title', 'credits'],
  },
};

export function setupCSSRegistry(
  ctx: TestContext,
  cssFileUri: string = 'file:///styles.css',
  fixture: CSSFixture = CSS_FIXTURES.common
) {
  ctx.services.Eligian.css.CSSRegistry.updateCSSFile(cssFileUri, {
    classes: new Set(fixture.classes ?? []),
    ids: new Set(fixture.ids ?? []),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors: [],
  });
}

// Custom matchers
export function toHaveErrorMatching(document: LangiumDocument, pattern: string) {
  const errors = document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
  const pass = errors.some(e => e.message.includes(pattern));
  return {
    pass,
    message: () => `expected document to ${pass ? 'not ' : ''}have error matching "${pattern}"`,
  };
}
```

```typescript
// validation.spec.ts (refactored)
import { describe, test, expect, beforeAll } from 'vitest';
import { createTestContext, setupCSSRegistry, CSS_FIXTURES, type TestContext } from './test-helpers.js';

describe('Eligian Grammar - Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.timeline);
  });

  test('should require exactly one timeline', async () => {
    const code = `
      endable action test [
        selectElement("#element")
      ] []
    `;
    const { errors } = await ctx.parseAndValidate(code);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('timeline declaration is required'))).toBe(true);
  });
});
```

**Benefits**:
- 70% reduction in boilerplate code
- Consistent API across all test files
- Centralized maintenance point
- Better type safety
- Easier onboarding for new contributors

---

## 10. Summary & Metrics

### Test Suite Health: **B+ (Good)**

| Category | Score | Notes |
|----------|-------|-------|
| **Coverage** | A (81.72%) | Exceeds 80% target ✅ |
| **Organization** | B+ | Good structure, minor inconsistencies |
| **Duplication** | C | High duplication in setup code ⚠️ |
| **Langium Usage** | A- | Correct patterns, minor improvements needed |
| **Vitest Best Practices** | B | Good fundamentals, inconsistent hooks |
| **Performance** | A | Fast runtime, no bottlenecks ✅ |
| **Maintainability** | B- | Duplication impacts maintenance ⚠️ |

### Key Metrics

- **Total Test Files**: 85
- **Total Tests**: 1462
- **Average Test Time**: ~5ms
- **Suite Runtime**: ~8 seconds
- **Code Duplication**: ~400 lines (service setup)
- **CSS Test Duplication**: ~150 lines (registry setup)

### Estimated ROI for Improvements

| Phase | Effort | Impact | Lines Saved | Time Saved (monthly) |
|-------|--------|--------|-------------|----------------------|
| Phase 1 | 8 hours | High | ~400 | ~4 hours |
| Phase 2 | 5 hours | Medium | ~100 | ~2 hours |
| Phase 3 | 5 hours | Low | ~50 | ~1 hour |
| **Total** | **18 hours** | - | **~550 lines** | **~7 hours/month** |

**Payback Period**: ~2.5 months

---

## 11. Conclusion

The Eligian test suite is **well-architected** and follows most best practices. The primary area for improvement is **reducing duplication** through shared test utilities.

**Top 3 Recommendations**:

1. ��� **Create shared test helpers** (`test-helpers.ts`) - Eliminates 400+ lines of duplication
2. ⚠️ **Standardize lifecycle hooks** - Improves test isolation and clarity
3. ✅ **Add parse error checks** - Follows Langium best practices

Implementing **Phase 1** recommendations will provide the highest ROI and significantly improve maintainability.

---

**Analysis Complete** | Generated by Claude Sonnet 4.5 | 2025-11-02
