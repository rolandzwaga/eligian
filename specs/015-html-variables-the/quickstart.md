# Quickstart Guide: Implementing HTML Variables

**Feature**: HTML Variables
**Audience**: Developers implementing this feature
**Estimated Time**: 8-12 hours (with test-first development)

---

## Overview

This guide walks through implementing HTML file imports as string variables in the Eligian DSL. Follow the phases in order, using test-first development (RED-GREEN-REFACTOR) per Constitution Principle II.

**Key Files**:
- Grammar: `packages/language/src/eligian.langium`
- Validator: `packages/language/src/eligian-validator.ts`
- HTML Loader: `packages/compiler/src/html-loader.ts` (NEW)
- Path Resolver: `packages/compiler/src/path-resolver.ts` (NEW)
- Transformer: `packages/compiler/src/ast-transformer.ts` (MODIFY)

---

## Prerequisites

1. **Read documentation**:
   - [spec.md](spec.md) - Feature specification
   - [research.md](research.md) - Technical decisions
   - [data-model.md](data-model.md) - Entity definitions
   - [contracts/](contracts/) - API contracts

2. **Environment setup**:
   ```bash
   # Install dependencies (already done for existing project)
   pnpm install

   # Run existing tests to verify baseline
   pnpm run test

   # Verify Biome and typecheck pass
   pnpm run check && pnpm run typecheck
   ```

3. **Create feature branch** (already done by setup script):
   ```bash
   git checkout 015-html-variables-the
   ```

---

## Phase 1: Grammar & Parsing (Test-First)

**Goal**: Parse `import name from 'path'` syntax into AST

### Step 1.1: Write Parsing Tests (RED)

Create test file: `packages/language/src/__tests__/html-import-parsing.spec.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { parseHelper } from './test-utils.js';

describe('HTML Import Parsing', () => {
  const parse = parseHelper();

  test('parses single HTML import', () => {
    const result = parse(`
      import header from './header.html'
    `);

    expect(result.parseResult.lexerErrors).toHaveLength(0);
    expect(result.parseResult.parserErrors).toHaveLength(0);

    const program = result.parseResult.value;
    expect(program.htmlImports).toHaveLength(1);
    expect(program.htmlImports[0].name).toBe('header');
    expect(program.htmlImports[0].path).toBe('./header.html');
  });

  test('parses multiple HTML imports', () => {
    const result = parse(`
      import header from './header.html'
      import footer from './footer.html'
    `);

    expect(result.parseResult.parserErrors).toHaveLength(0);
    const program = result.parseResult.value;
    expect(program.htmlImports).toHaveLength(2);
  });

  test('parses HTML import with relative path', () => {
    const result = parse(`
      import shared from '../shared/component.html'
    `);

    expect(result.parseResult.parserErrors).toHaveLength(0);
    expect(result.parseResult.value.htmlImports[0].path).toBe('../shared/component.html');
  });
});
```

**Run tests** (should FAIL):
```bash
pnpm --filter @eligian/language run test html-import-parsing
```

### Step 1.2: Add Grammar Rule (GREEN)

Edit `packages/language/src/eligian.langium`:

```langium
// Add HTMLImport rule
HTMLImport:
  'import' name=ID 'from' path=STRING;

// Update Program to include HTML imports
Program:
  (htmlImports+=HTMLImport)*
  (layout=LayoutDeclaration)?
  (cssImports+=CSSImport)*
  (actions+=ActionDefinition)*
  (timelines+=Timeline)*;
```

**Regenerate Langium artifacts**:
```bash
pnpm --filter @eligian/language run langium:generate
```

**Run tests** (should PASS):
```bash
pnpm --filter @eligian/language run test html-import-parsing
```

### Step 1.3: Verify & Refactor

- Verify tests pass
- Check code quality: `pnpm run check && pnpm run typecheck`
- Commit: `git commit -m "feat: add HTML import grammar and parsing tests"`

---

## Phase 2: Path Resolution & Security (Test-First)

**Goal**: Resolve HTML import paths and validate security constraints

### Step 2.1: Write Path Resolver Tests (RED)

Create test file: `packages/compiler/src/__tests__/path-resolver.spec.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { resolveHTMLPath, validateWithinProject } from '../path-resolver.js';

describe('Path Resolver', () => {
  const projectRoot = '/home/user/project';
  const sourceFile = '/home/user/project/src/main.eligian';

  test('resolves simple relative path', () => {
    const resolved = resolveHTMLPath('./snippet.html', sourceFile, projectRoot);
    expect(resolved).toBe('/home/user/project/src/snippet.html');
  });

  test('resolves path with parent directory (within project)', () => {
    const resolved = resolveHTMLPath('../shared/header.html', sourceFile, projectRoot);
    expect(resolved).toBe('/home/user/project/shared/header.html');
  });

  test('rejects path escaping project directory', () => {
    expect(() =>
      resolveHTMLPath('../../../etc/passwd', sourceFile, projectRoot)
    ).toThrow('PathSecurityViolation');
  });

  test('normalizes path separators', () => {
    const resolved = resolveHTMLPath('.\\windows\\style.html', sourceFile, projectRoot);
    expect(resolved).toContain('/windows/style.html');
  });
});
```

**Run tests** (should FAIL):
```bash
pnpm --filter @eligian/compiler run test path-resolver
```

### Step 2.2: Implement Path Resolver (GREEN)

Create file: `packages/compiler/src/path-resolver.ts`

```typescript
import path from 'node:path';
import { Effect, Context } from 'effect';

// See contracts/path-resolver-api.ts for full API contract

export class PathResolverService extends Context.Tag('PathResolver')<
  PathResolverService,
  {
    readonly resolveHTMLPath: (
      importPath: string,
      sourceFilePath: string,
      projectRoot: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<string, PathResolutionError>;

    readonly normalizePath: (path: string) => string;

    readonly validateWithinProject: (
      absolutePath: string,
      projectRoot: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<void, PathSecurityError>;
  }
>() {}

// Implementation
export const PathResolverLive = Layer.succeed(PathResolverService, {
  resolveHTMLPath: (importPath, sourceFilePath, projectRoot, location) =>
    Effect.gen(function* (_) {
      // 1. Normalize path separators
      const normalized = importPath.replace(/\\/g, '/');

      // 2. Resolve relative to source file
      const sourceDir = path.dirname(sourceFilePath);
      const absolutePath = path.resolve(sourceDir, normalized);

      // 3. Validate within project
      const relativePath = path.relative(projectRoot, absolutePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return yield* _(Effect.fail({
          _tag: 'PathSecurityViolation' as const,
          importPath,
          resolvedPath: absolutePath,
          projectRoot,
          sourceLocation: location
        }));
      }

      return absolutePath;
    }),

  normalizePath: (p) => p.replace(/\\/g, '/'),

  validateWithinProject: (absolutePath, projectRoot, location) =>
    Effect.gen(function* (_) {
      const relativePath = path.relative(projectRoot, absolutePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return yield* _(Effect.fail({
          _tag: 'PathSecurityViolation' as const,
          importPath: absolutePath,
          resolvedPath: absolutePath,
          projectRoot,
          sourceLocation: location
        }));
      }
    })
});
```

**Run tests** (should PASS):
```bash
pnpm --filter @eligian/compiler run test path-resolver
```

### Step 2.3: Verify & Commit

- Run Biome: `pnpm run check`
- Run typecheck: `pnpm run typecheck`
- Commit: `git commit -m "feat: implement path resolver with security validation"`

---

## Phase 3: HTML File Loading (Test-First)

**Goal**: Load HTML file content with typed error handling

### Step 3.1: Write HTML Loader Tests (RED)

Create test file: `packages/compiler/src/__tests__/html-loader.spec.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { HTMLLoaderService } from '../html-loader.js';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

describe('HTML Loader', () => {
  const testDir = path.join(process.cwd(), '__test-fixtures__');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('loads valid HTML file', async () => {
    const filePath = path.join(testDir, 'test.html');
    await writeFile(filePath, '<div>Test</div>', 'utf-8');

    const loader = yield* _(HTMLLoaderService);
    const content = await Effect.runPromise(
      loader.loadHTML(filePath, { line: 1, column: 1 })
    );

    expect(content).toBe('<div>Test</div>');
  });

  test('returns FileNotFound for missing file', async () => {
    const loader = yield* _(HTMLLoaderService);
    const result = await Effect.runPromise(
      loader.loadHTML('/nonexistent/file.html', { line: 1, column: 1 }).pipe(
        Effect.either
      )
    );

    expect(result._tag).toBe('Left');
    expect(result.left._tag).toBe('FileNotFound');
  });

  // Add more tests for PermissionDenied, ReadError, etc.
});
```

**Run tests** (should FAIL):
```bash
pnpm --filter @eligian/compiler run test html-loader
```

### Step 3.2: Implement HTML Loader (GREEN)

Create file: `packages/compiler/src/html-loader.ts`

```typescript
import { Effect, Context, Layer } from 'effect';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

// See contracts/html-loader-api.ts for full API contract

export class HTMLLoaderService extends Context.Tag('HTMLLoader')<
  HTMLLoaderService,
  {
    readonly loadHTML: (
      absolutePath: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<string, HTMLLoadError>;

    readonly validateFileSize: (
      absolutePath: string,
      maxSize?: number
    ) => Effect.Effect<void, FileSizeError>;
  }
>() {}

// Implementation
export const HTMLLoaderLive = Layer.succeed(HTMLLoaderService, {
  loadHTML: (absolutePath, location) =>
    Effect.tryPromise({
      try: () => readFile(absolutePath, 'utf-8'),
      catch: (error: any) => {
        if (error.code === 'ENOENT') {
          return {
            _tag: 'FileNotFound' as const,
            path: absolutePath,
            sourceLocation: location
          };
        }
        if (error.code === 'EACCES') {
          return {
            _tag: 'PermissionDenied' as const,
            path: absolutePath,
            sourceLocation: location
          };
        }
        return {
          _tag: 'ReadError' as const,
          path: absolutePath,
          cause: error,
          sourceLocation: location
        };
      }
    }),

  validateFileSize: (absolutePath, maxSize = 1024 * 1024) =>
    Effect.tryPromise({
      try: async () => {
        const stats = await stat(absolutePath);
        if (stats.size > maxSize) {
          throw {
            _tag: 'FileSizeExceeded' as const,
            path: absolutePath,
            sizeBytes: stats.size,
            maxBytes: maxSize,
            sourceLocation: { line: 0, column: 0 }  // Updated by caller
          };
        }
      },
      catch: (error: any) => error
    })
});
```

**Run tests** (should PASS):
```bash
pnpm --filter @eligian/compiler run test html-loader
```

### Step 3.3: Verify & Commit

- Run Biome: `pnpm run check`
- Run typecheck: `pnpm run typecheck`
- Commit: `git commit -m "feat: implement HTML file loader with typed errors"`

---

## Phase 4: Validation (Test-First)

**Goal**: Validate HTML imports in Langium validator

### Step 4.1: Write Validation Tests (RED)

Create test file: `packages/language/src/__tests__/html-import-validation.spec.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { validateHelper } from './test-utils.js';

describe('HTML Import Validation', () => {
  const validate = validateHelper();

  test('detects duplicate HTML import names', async () => {
    const diagnostics = await validate(`
      import header from './header.html'
      import header from './other.html'
    `);

    const duplicateError = diagnostics.find(d => d.code === 'DUPLICATE_HTML_VARIABLE');
    expect(duplicateError).toBeDefined();
    expect(duplicateError.message).toContain("already defined");
  });

  test('detects missing HTML file', async () => {
    const diagnostics = await validate(`
      import missing from './nonexistent.html'
    `);

    const notFoundError = diagnostics.find(d => d.code === 'HTML_FILE_NOT_FOUND');
    expect(notFoundError).toBeDefined();
  });

  test('detects path security violation', async () => {
    const diagnostics = await validate(`
      import bad from '../../../etc/passwd'
    `);

    const securityError = diagnostics.find(d => d.code === 'HTML_PATH_SECURITY_VIOLATION');
    expect(securityError).toBeDefined();
  });

  test('accepts valid HTML import', async () => {
    // Create test fixture file first
    const diagnostics = await validate(`
      import header from './test-fixtures/header.html'
    `);

    expect(diagnostics).toHaveLength(0);
  });
});
```

**Run tests** (should FAIL):
```bash
pnpm --filter @eligian/language run test html-import-validation
```

### Step 4.2: Implement Validation (GREEN)

Edit `packages/language/src/eligian-validator.ts`:

```typescript
import { ValidationAcceptor, ValidationChecks } from 'langium';
import { Program, HTMLImport } from './generated/ast.js';
import { PathResolverService } from '@eligian/compiler/path-resolver.js';
import { HTMLLoaderService } from '@eligian/compiler/html-loader.js';

export class EligianValidator {
  // ... existing validators

  /**
   * Validate HTML imports
   */
  @Check
  checkHTMLImports(program: Program, accept: ValidationAcceptor): void {
    // 1. Check for duplicates
    this.checkHTMLImportDuplicates(program, accept);

    // 2. Validate each import
    const sourceFilePath = program.$document?.uri?.fsPath ?? '';
    const projectRoot = this.getProjectRoot();

    for (const htmlImport of program.htmlImports) {
      this.checkHTMLImportPath(htmlImport, sourceFilePath, projectRoot, accept);
    }
  }

  private checkHTMLImportDuplicates(program: Program, accept: ValidationAcceptor): void {
    const seen = new Map<string, HTMLImport>();

    for (const htmlImport of program.htmlImports) {
      const existing = seen.get(htmlImport.name);
      if (existing) {
        const firstLine = existing.$cstNode?.range.start.line ?? 0;
        accept('error',
          `Variable '@${htmlImport.name}' is already defined (first defined at line ${firstLine})`,
          {
            node: htmlImport,
            property: 'name',
            code: 'DUPLICATE_HTML_VARIABLE'
          }
        );
      } else {
        seen.set(htmlImport.name, htmlImport);
      }
    }
  }

  private checkHTMLImportPath(
    htmlImport: HTMLImport,
    sourceFilePath: string,
    projectRoot: string,
    accept: ValidationAcceptor
  ): void {
    const location = {
      line: htmlImport.$cstNode?.range.start.line ?? 0,
      column: htmlImport.$cstNode?.range.start.column ?? 0
    };

    // Use PathResolverService and HTMLLoaderService (with Effect runtime)
    // ... implementation details
  }

  private getProjectRoot(): string {
    // VS Code: workspace root, CLI: current working directory
    return process.cwd();
  }
}
```

**Run tests** (should PASS):
```bash
pnpm --filter @eligian/language run test html-import-validation
```

### Step 4.3: Verify & Commit

- Run Biome: `pnpm run check`
- Run typecheck: `pnpm run typecheck`
- Commit: `git commit -m "feat: add HTML import validation"`

---

## Phase 5: AST Transformation (Test-First)

**Goal**: Transform HTML imports into variables and embed content in operations

### Step 5.1: Write Transformation Tests (RED)

Edit `packages/compiler/src/__tests__/ast-transformer.spec.ts`:

```typescript
describe('HTML Import Transformation', () => {
  test('transforms HTML import to variable', () => {
    const ast = parseProgram(`
      import header from './header.html'

      timeline "Demo" at 0s {
        at 0s selectElement("#box") {
          setElementContent(@header)
        }
      }
    `);

    const config = transformAST(ast);

    // Verify HTML content embedded in operation
    const operation = config.timelines[0].operations[0];
    expect(operation.systemName).toBe('setElementContent');
    expect(operation.operationData.content).toContain('<header>');
  });
});
```

**Run tests** (should FAIL):
```bash
pnpm --filter @eligian/compiler run test ast-transformer
```

### Step 5.2: Implement Transformation (GREEN)

Edit `packages/compiler/src/ast-transformer.ts`:

```typescript
function transformProgram(program: Program): EligiusConfig {
  const config = createEmptyConfig();
  const variables = new Map<string, HTMLVariable>();

  // 1. Load HTML imports
  for (const htmlImport of program.htmlImports) {
    const htmlContent = loadHTMLFile(htmlImport.path);
    variables.set(htmlImport.name, {
      name: htmlImport.name,
      type: 'string',
      value: htmlContent,
      mutable: false,
      scope: 'program'
    });
  }

  // 2. Transform timelines (with variable resolution)
  // ... existing transformation logic

  return config;
}

function resolveVariableReference(ref: VariableReference, variables: Map<string, HTMLVariable>): string {
  const variable = variables.get(ref.name);
  if (!variable) {
    throw new Error(`Unknown variable: @${ref.name}`);
  }
  return variable.value;
}
```

**Run tests** (should PASS):
```bash
pnpm --filter @eligian/compiler run test ast-transformer
```

### Step 5.3: Verify & Commit

- Run Biome: `pnpm run check`
- Run typecheck: `pnpm run typecheck`
- Commit: `git commit -m "feat: transform HTML imports to embedded variables"`

---

## Phase 6: Integration Tests & Coverage

**Goal**: Verify end-to-end compilation and achieve 80% coverage

### Step 6.1: Write Integration Tests

Create test file: `packages/language/src/__tests__/html-imports-integration.spec.ts`

```typescript
describe('HTML Imports Integration', () => {
  test('compiles HTML import end-to-end', async () => {
    const source = `
      import header from './fixtures/header.html'

      timeline "Demo" at 0s {
        at 0s selectElement("#box") {
          setElementContent(@header)
        }
      }
    `;

    const config = await compile(source);

    expect(config.timelines[0].operations[0].operationData.content).toBe('<header>Test Header</header>');
  });
});
```

### Step 6.2: Run Coverage Analysis

```bash
pnpm run test:coverage
```

**Check coverage report**:
- Statements: >80%
- Branches: >80%
- Functions: >80%
- Lines: >80%

**If coverage is below 80%**: Add missing tests until threshold is met.

### Step 6.3: Final Verification

```bash
# Run all tests
pnpm run test

# Run Biome
pnpm run check

# Run typecheck
pnpm run typecheck

# Build project
pnpm run build
```

**All must pass** before proceeding.

### Step 6.4: Create Example File

Create `examples/html-imports-demo.eligian`:

```eligian
// HTML Variables Demo
import header from './snippets/header.html'
import footer from './snippets/footer.html'

layout "./app.html"

timeline "HTML Imports Demo" at 0s {
  at 0s selectElement("#container") {
    setElementContent(@header)
  }

  at 2s selectElement("#footer-container") {
    setElementContent(@footer)
  }
}
```

Create fixture HTML files in `examples/snippets/`:
- `header.html`
- `footer.html`

---

## Final Checklist

Before marking feature complete, verify:

- [ ] All tests pass (`pnpm run test`)
- [ ] Coverage meets 80% threshold (`pnpm run test:coverage`)
- [ ] Biome passes (`pnpm run check`)
- [ ] TypeScript type check passes (`pnpm run typecheck`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Example file works with CLI (`node packages/cli/bin/cli.js examples/html-imports-demo.eligian`)
- [ ] Documentation updated (if needed)
- [ ] All commits follow convention (`feat:`, `test:`, `docs:`)

---

## Common Issues & Solutions

### Issue: Langium type generation fails

**Solution**: Run `pnpm --filter @eligian/language run langium:generate` after grammar changes

### Issue: Effect-ts type errors

**Solution**: Consult [contracts/html-loader-api.ts](contracts/html-loader-api.ts) for correct Effect types

### Issue: Path resolution fails on Windows

**Solution**: Use `path.resolve()` and normalize separators with `.replace(/\\/g, '/')`

### Issue: Tests timeout

**Solution**: Increase Vitest timeout in test files: `test('...', async () => { ... }, 10000)`

---

## Time Estimates

- Phase 1 (Grammar & Parsing): 1-2 hours
- Phase 2 (Path Resolution): 2-3 hours
- Phase 3 (HTML Loading): 2-3 hours
- Phase 4 (Validation): 2-3 hours
- Phase 5 (Transformation): 2-3 hours
- Phase 6 (Integration & Coverage): 1-2 hours

**Total**: 10-16 hours (with test-first development)

---

## Next Steps After Implementation

1. Create pull request with all commits
2. Request code review (verify Constitution compliance)
3. Address review feedback
4. Merge to main after approval
5. Update LANGUAGE_SPEC.md with HTML import syntax (Constitution Principle XVII)
6. Close feature branch

**Ready to start?** Begin with Phase 1 (Grammar & Parsing) using test-first development.
