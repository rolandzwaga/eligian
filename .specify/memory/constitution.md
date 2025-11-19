<!--
SYNC IMPACT REPORT - Constitution v2.0.0

VERSION CHANGE: [template] → 2.0.0
RATIONALE: Initial constitution ratification with formalized principles from project practices

MODIFIED PRINCIPLES:
- None (initial version)

ADDED SECTIONS:
- All principles I through XXV
- Development Workflow section
- Quality Gates section
- Governance section

REMOVED SECTIONS:
- Template placeholders

TEMPLATES REQUIRING UPDATES:
- ✅ .specify/templates/plan-template.md - updated with vitest-mcp quality gate
- ✅ .specify/templates/spec-template.md - verified alignment
- ✅ .specify/templates/tasks-template.md - updated test quality gate guidance
- ✅ CLAUDE.md - added vitest-mcp to Available MCP Resources section

FOLLOW-UP TODOS:
- None

BREAKING CHANGES:
- Quality gate now requires vitest-mcp tools instead of `pnpm test` commands
- This enables programmatic test execution and coverage analysis via MCP
-->

# Eligian DSL Project Constitution

## Core Principles

### I. Simplicity First

Code must be straightforward and well-documented. Avoid premature optimization—make it work, then make it fast. Document complex transformations with "why" not just "what". Prefer explicit transformations over clever abstractions.

**Rationale**: Clear code enables faster debugging, easier onboarding, and sustainable maintenance. Complexity must be justified with concrete performance requirements.

### II. Comprehensive Testing

Every transformation function MUST have unit tests. Full pipelines MUST have integration tests with snapshots. Test both success and error paths. Use Effect test utilities for mocking services.

**Rationale**: Tests are the executable specification and safety net for refactoring. Without comprehensive tests, confidence in changes evaporates.

### III. Type Safety with Effect

All side effects MUST be captured in Effect types. Explicit error types at each pipeline stage. No throwing exceptions—use Effect.fail for errors. Use Effect.gen for readable async composition.

**Rationale**: Type-safe effects make error handling visible, testable, and composable. Hidden side effects lead to production surprises.

### IV. Clear Error Messages

Include source location (line, column) in all errors. Provide actionable suggestions for fixes. Use clear, jargon-free language. Show relevant code snippet when possible.

**Rationale**: Error messages are the UI for developers debugging issues. Poor error messages waste hours of developer time.

### V. Test-Driven Development (TDD)

Tests MUST be written first, user-approved, tests MUST fail, then implement. Red-Green-Refactor cycle strictly enforced. No implementation without failing tests.

**Rationale**: TDD ensures requirements are testable and implementation matches specification. Skip TDD and watch feature scope creep destroy timelines.

### VI. External Immutability, Internal Performance

External API MUST be immutable (Effect types, pure functions). Internal implementation MAY use mutable structures for performance when documented with justification. Profile before optimizing.

**Rationale**: Immutable APIs provide safety and predictability. Performance-critical internals can mutate when the tradeoff is explicit and measured.

### VII. Functional Programming First

Prefer functional patterns (pure functions, composition, declarative transformations). Minimize imperative loops and stateful classes. Use Effect.gen for sequential operations. Document imperative code with rationale.

**Rationale**: Functional code is easier to test, reason about, and parallelize. Imperative code hides dependencies and makes refactoring hazardous.

### VIII. Package Manager Discipline

This project uses **pnpm** exclusively. NEVER use npm or yarn. All commands MUST use pnpm: `pnpm install`, `pnpm run build`, `pnpm test`.

**Rationale**: The project is configured with `packageManager: "pnpm@10.19.0"` in package.json. Mixing package managers causes dependency resolution conflicts and broken workspaces.

### IX. Langium Grammar Best Practices

Keep grammar rules declarative and unambiguous. Document complex grammar constructs with examples. Test parsing with fixture files covering edge cases.

**Rationale**: Ambiguous grammars lead to parser conflicts and unpredictable behavior. Examples and tests are the specification for language syntax.

### X. VS Code Extension Integration

Extension MUST integrate with compiler for on-the-fly compilation. Use Effect runtime for compilation in extension context. Show errors in Problems panel with source locations.

**Rationale**: Real-time feedback is the baseline expectation for modern IDEs. Without it, the DSL is just a fancy text format.

### XI. Code Quality with Biome

All code changes MUST be formatted and linted with Biome after each task completion. Run `pnpm run check` before committing. Zero tolerance for lint errors. Update biome.json only with documented justification.

**Rationale**: Consistent formatting eliminates bikeshedding. Lint rules catch common bugs. Quality gates without automation are wishes.

### XII. No Premature Documentation

NEVER proactively create documentation files (*.md) or README files unless explicitly requested by the user. Documentation MUST be demand-driven, not supply-driven.

**Rationale**: Unused documentation becomes stale instantly. Documentation should answer real questions, not imagined ones.

### XIII. File Extension Consistency

The DSL language is called **"Eligian"** and MUST use the file extension **`.eligian`**. NEVER use `.eli`, `.elg`, `.egl`, or other abbreviations.

**Rationale**: Consistent file extensions enable tooling integration, file associations, and pattern matching. Abbreviations fragment the ecosystem.

### XIV. Windows Path Handling (CRITICAL)

When referencing file paths in tool calls (EXCEPT Bash), ALWAYS use Windows-style paths with backslashes (`\`). ALWAYS expand tilde (`~`) to full path (e.g., `C:\Users\some.user`). This applies to: Edit, Glob, Grep, Read tools.

**Rationale**: The project runs on Windows. Unix-style paths cause file not found errors. This is a critical workaround for a tool bug.

### XV. Eligius Library Research Context

The Eligius library source (`../eligius/`) is FOR RESEARCH ONLY. NEVER import types or code directly from `../eligius/src/`. ALWAYS import from the installed `eligius` npm package: `import type { ... } from 'eligius';`

**Rationale**: Direct imports from sibling directories break builds and create hidden dependencies. The npm package is the public API contract.

### XVI. Typir Library Research Context

The Typir library source (`f:/projects/typir/`) is FOR RESEARCH ONLY for understanding internals and API reference. NEVER import types or code directly from this directory. ALWAYS import from installed npm packages: `import { ... } from 'typir';` or `import { ... } from 'typir-langium';`

**Rationale**: Same as Principle XV. Local clones are for documentation and understanding, not linking.

### XVII. Effect Services Design

Services MUST be pure interfaces. No side effects hidden in service methods. All effects MUST return Effect types. Use Layer.effect for service implementation. Compose layers for runtime.

**Rationale**: Pure service interfaces enable testability and dependency injection. Hidden side effects make testing impossible.

### XVIII. Compilation Pipeline Stages

Compilation MUST follow stages: Parse → Validate → Type Check → Transform → Optimize → Emit. Each stage MUST return Effect with typed errors. Profile before optimizing. Use Effect.cached for expensive repeated computations.

**Rationale**: Clear pipeline stages enable debugging, testing, and optimization at each step. Monolithic compilation is a black box.

### XIX. AST Transformation Documentation

Every transformation function MUST have a comment explaining what AST construct it transforms and why. Complex transformations MUST have examples in comments. Test transformations with snapshots.

**Rationale**: AST transformations are compiler internals. Without documentation, only the original author understands them (and only for a week).

### XX. Testing Strategy (Comprehensive)

Unit tests in `__tests__/` subdirectories alongside code. Test files use `.spec.ts` extension. Fixtures in `__fixtures__/` subdirectories. Cover valid inputs, invalid inputs, and edge cases.

**Rationale**: Co-located tests are easier to find and maintain. Fixtures enable snapshot testing and regression detection.

### XXI. Git Workflow Discipline

Only create commits when requested by user. NEVER update git config. NEVER run destructive git commands (push --force, hard reset) unless explicitly requested. NEVER skip hooks (--no-verify, --no-gpg-sign). Before amending: ALWAYS check authorship. NEVER commit changes unless user explicitly asks.

**Rationale**: Git is the project history and collaboration mechanism. Unsolicited commits and config changes break team workflows.

### XXII. Sed Command Safety (CRITICAL)

NEVER use sed with line numbers from TypeScript compiler errors. TypeScript error line numbers indicate symptom locations, not fix locations. ALWAYS read file first with Read tool. Use Edit tool for TypeScript changes (requires string matching, not line numbers). Sed is ONLY acceptable for: simple global replacements (`s/old/new/g`), removing all occurrences (`/pattern/d`), adding to end of file.

**Rationale**: The Sed Corruption Incident (documented in CLAUDE.md) corrupted multiple files by blindly targeting error line numbers. Sed line numbers are fragile and error-prone.

### XXIII. Testing with vitest-mcp Tools

All test quality gates MUST use vitest-mcp tools instead of `pnpm test` commands:
- Use `mcp__vitest__run_tests` for running tests programmatically
- Use `mcp__vitest__analyze_coverage` for coverage analysis
- Use `mcp__vitest__list_tests` for test discovery
- NEVER use `pnpm test` or `pnpm run test` in quality gate checks

**Rationale**: vitest-mcp provides structured, programmatic access to test results and coverage data. This enables automated analysis, better error reporting, and integration with AI workflows. Raw npm scripts only provide exit codes and text output.

### XXIV. Test Suite Maintenance (Feature 022)

Use shared test helpers from `packages/language/src/__tests__/test-helpers.ts`:
- `createTestContext()` in `beforeAll()` for service initialization
- `setupCSSRegistry()` in `beforeEach()` for per-test isolation
- `DiagnosticSeverity` enum instead of magic numbers
- `getErrors()` / `getWarnings()` for filtering diagnostics

**Rationale**: Test helpers eliminate 1,251 lines of boilerplate (as measured in Feature 022). Shared utilities ensure consistency and reduce maintenance burden.

### XXV. Testing Guide Discipline

MUST read `specs/TESTING_GUIDE.md` before writing tests. The guide contains quick start templates, setup patterns, and common mistakes. Failure to consult the guide results in 3-4 rounds of trial-and-error fixing basic syntax issues.

**Rationale**: The testing guide codifies lessons learned from 1,913 tests. Skipping it wastes time reinventing solved problems.

## Development Workflow

### Planning and Specification

- Always plan thoroughly before implementing code changes
- Minimize code changes to avoid unnecessary reverts
- Ask clarifying questions before implementation
- Use TodoWrite tool for complex multi-step tasks
- Follow the project constitution: All development MUST comply with these principles

### Code Review and Iteration

- Every pull request MUST verify compliance with constitution principles
- Code reviewers MUST challenge unjustified complexity
- Technical debt MUST be documented with context and proposed timeline for resolution

### Quality Gates

Every task completion MUST pass these gates:

1. **Build**: `pnpm run build` passes (TypeScript compiles successfully)
2. **Lint**: `pnpm run check` passes (0 errors, 0 warnings)
3. **Tests**: Use vitest-mcp tools for programmatic test execution:
   - `mcp__vitest__set_project_root` to configure project
   - `mcp__vitest__run_tests` with appropriate target (file path or directory)
   - Verify all tests pass (no failures in result)
   - For coverage analysis: `mcp__vitest__analyze_coverage` with target source files
4. **Documentation**: Update documentation if adding new public APIs or changing behavior
5. **Configuration**: Update biome.json if rules needed adjustment (with justification)

### Biome Quality Gate Workflow

After each task:

```bash
# 1. Complete code changes
# 2. Run Biome check with auto-fix
pnpm run check

# 3. If issues remain (errors shown):
pnpm run lint  # Review what issues remain

# 4. Fix remaining issues:
#    - If legitimate issues: fix the code
#    - If false positives: update biome.json with justification

# 5. Verify clean:
pnpm run check  # Should show "0 errors, 0 warnings"

# 6. Run tests using vitest-mcp:
#    - Use mcp__vitest__run_tests tool instead of pnpm test
#    - All tests must pass
```

## Governance

This constitution supersedes all other development practices. Amendments require:

1. **Documentation**: Proposed change with rationale
2. **Approval**: User approval required for principle changes
3. **Migration Plan**: For breaking changes, document migration path
4. **Version Increment**: Follow semantic versioning for constitution version

All code reviews and pull requests MUST verify compliance with constitution principles. Complexity MUST be justified with concrete requirements. Use `CLAUDE.md` for runtime development guidance (implementation patterns, examples, tool usage).

### Amendment Procedure

Principle changes:
- MAJOR bump: Backward incompatible governance/principle removals or redefinitions
- MINOR bump: New principle/section added or materially expanded guidance
- PATCH bump: Clarifications, wording, typo fixes, non-semantic refinements

**Version**: 2.0.0 | **Ratified**: 2025-01-20 | **Last Amended**: 2025-01-20
