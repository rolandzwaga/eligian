<!--
===================================================================================
SYNC IMPACT REPORT - Constitution Update
===================================================================================

VERSION CHANGE: 1.9.0 → 2.0.0 → 2.0.1 → 2.1.0 → 2.1.1
Rationale: MAJOR version bump (2.0.0) - Enhanced Principle II (Test-First Development) with
strict enforcement workflow that redefines testing requirements, making "tests later"
a constitutional violation (backward incompatible with prior "encouraged" TDD stance).
Added 5 new principles that significantly expand governance scope.

PATCH version bump (2.0.1) - Added integration test isolation requirement to Principle II.

MINOR version bump (2.1.0) - Added Principle XXIII (Incremental Feature Commits) for speckit workflow.
nPATCH version bump (2.1.1) - Added Principle XXIV (Unified Example File) requirement.

AMENDMENTS (v2.1.0):
+ Added Principle XXIII: Incremental Feature Commits (NON-NEGOTIABLE)
  - Mandates commits after each phase completion in speckit workflow
  - Prohibits pushing to remote until feature is complete
  - Requires conventional commit message format
  - Documents commit workflow and examples
  - This is FORWARD COMPATIBLE - codifies existing best practice

AMENDMENTS (v2.0.1):
* Enhanced Principle II: Comprehensive Testing (PATCH UPDATE)
  - Added requirement: Integration tests MUST be isolated in separate files
  - Rationale: Test environment state cannot be reliably reset between integration tests
  - Environment pollution causes flaky tests when multiple integration tests share a file
  - Unit tests CAN share files (isolated functions, no shared state)
  - This is FORWARD COMPATIBLE - clarifies existing best practice

AMENDMENTS (v2.0.0):
* Enhanced Principle II: Comprehensive Testing (NON-NEGOTIABLE)
  - Added explicit Red-Green-Refactor workflow enforcement
  - Added strict rule: "I'll add tests later" is NOT acceptable and is a violation
  - Added enforcement: Implementation commits without tests will be rejected
  - Added mandatory coverage verification (80% threshold with blocking)
  - This is BACKWARD INCOMPATIBLE - previously TDD was "encouraged", now MANDATORY

* Enhanced Principle XI: Code Quality: Biome Integration (NON-NEGOTIABLE)
  - Added mandatory TypeScript type checking after Biome checks
  - Requires `npm run typecheck` after Biome passes
  - Mandates fixing all type errors before task completion
  - Updated workflow: lint → format → check → typecheck → all pass before commit

+ Added Principle XVIII: Research & Documentation Standards (NON-NEGOTIABLE)
  - Mandates use of context7 MCP server for library research and API patterns
  - Requires verification against official documentation
  - Documents research workflow and examples

+ Added Principle XIX: Dependency Management (NON-NEGOTIABLE)
  - Prohibits automatic package.json modifications
  - Requires user consultation before adding dependencies
  - Enforces approval workflow for new dependencies

+ Added Principle XX: Debugging Attempt Limit (NON-NEGOTIABLE)
  - Limits troubleshooting to 5 attempts before user consultation
  - Defines "attempt" and tracking requirements
  - Prevents infinite debugging loops

+ Added Principle XXI: Token Efficiency (NON-NEGOTIABLE)
  - Prohibits generating test coverage reports in documentation
  - Prevents redundant documentation of machine-readable output
  - Focuses documentation on insights, not data dumps

+ Added Principle XXII: Accessibility Standards (NON-NEGOTIABLE)
  - Mandates WCAG 2.1 AA compliance for all UI components
  - Requires keyboard navigation and screen reader support
  - Defines accessibility requirements for CLI/extension interfaces

MODIFIED SECTIONS:
- Principle II: Now strictly enforces TDD with Red-Green-Refactor workflow
- Principle XI: Expanded to include TypeScript type checking
- Development Workflow → Testing Standards: Added coverage verification requirements
- Governance → Compliance Review: Added new principle checkpoints

PRINCIPLES ESTABLISHED (v1.0.0 - v1.9.0):
I. Simplicity, Documentation, and Maintainability
II. Comprehensive Testing (NOW NON-NEGOTIABLE with strict enforcement)
III. No Gold-Plating
IV. Mandatory Code Reviews
V. UX Consistency
VI. Functional Programming with Pragmatic Performance
VII. UUID-Based Identifiers (NON-NEGOTIABLE)
VIII. Debug Cleanup and Workspace Hygiene (NON-NEGOTIABLE)
IX. ESM Import Extensions (NON-NEGOTIABLE)
X. Validation Pattern: Compiler-First with Langium Integration (NON-NEGOTIABLE)
XI. Code Quality: Biome Integration (NON-NEGOTIABLE) - ENHANCED with typecheck
XII. Eligius Architecture Understanding (NON-NEGOTIABLE)
XIII. Eligius Domain Expert Consultation (NON-NEGOTIABLE)
XIV. Question-First Implementation (NON-NEGOTIABLE)
XV. Operation Metadata Consultation (NON-NEGOTIABLE)
XVI. Concise Communication (NON-NEGOTIABLE)
XVII. Language Specification Maintenance (NON-NEGOTIABLE)
XVIII. Research & Documentation Standards (NON-NEGOTIABLE) - NEW
XIX. Dependency Management (NON-NEGOTIABLE) - NEW
XX. Debugging Attempt Limit (NON-NEGOTIABLE) - NEW
XXI. Token Efficiency (NON-NEGOTIABLE) - NEW
XXII. Accessibility Standards (NON-NEGOTIABLE) - NEW
XXIII. Incremental Feature Commits (NON-NEGOTIABLE) - NEW (v2.1.0)
XXIV. Unified Example File (NON-NEGOTIABLE) - NEW (v2.1.1)

TEMPLATE CONSISTENCY CHECK:
✅ plan-template.md - Constitution Check section aligns with new principles
✅ spec-template.md - No changes required (principles don't affect spec structure)
✅ tasks-template.md - No changes required (task generation unaffected)
✅ Development Workflow section - Updated with new testing and quality requirements
✅ Compliance Review section - Updated with new principle checkpoints

FOLLOW-UP TODOS:
- Update CLAUDE.md to reference new principles (especially context7, dependency management)
- Ensure all contributors are aware of strict TDD enforcement (breaking change)
- Update PR templates to include new principle checkpoints
- Consider adding automated checks for principle compliance in CI/CD

PROJECT CONTEXT:
- Project: Eligian - Langium-based DSL and compiler for Eligius library
- Domain: Story-telling engine DSL with VS Code extension
- Tech Stack: TypeScript, Langium, Effect-TS, Vitest, Biome, Node.js ESM
- Development Model: Test-First Development (NOW STRICTLY ENFORCED)
- Code Quality: Biome + TypeScript type checking (mandatory enforcement)
- Testing: Vitest with 80% coverage threshold + mandatory verification
- Research Tool: context7 MCP server (NOW MANDATORY for library research)
- Dependency Policy: NO automatic installations, user approval required
- Debugging Policy: Maximum 5 attempts before user consultation
- Communication Policy: Brief, technical communication for senior developers
- Documentation Policy: NEVER generate redundant coverage reports

===================================================================================
-->

# Eligian DSL Constitution

## Core Principles

### I. Simplicity, Documentation, and Maintainability

All code, architecture, and design decisions MUST prioritize simplicity and clarity over
cleverness. Every component MUST be documented with clear purpose, usage examples, and
architectural rationale. Code MUST be written for maintainability first, anticipating
future developers who need to understand and modify it.

**Rationale**: The Eligian project provides a DSL that simplifies Eligius configuration
by reducing JSON verbosity and improving readability. If the DSL compiler itself lacks
clarity and documentation, it defeats its own purpose. Maintainability ensures long-term
viability as both Eligius and the DSL evolve.

**Requirements**:
- All modules MUST include purpose documentation at the top
- All public functions MUST have clear docstrings explaining purpose, parameters, and return values
- Complex algorithms MUST include inline comments explaining the "why" not just the "what"
- Architecture decisions MUST be documented in CLAUDE.md or dedicated architecture docs
- Avoid premature abstraction - prefer clear, direct code over complex patterns

### II. Comprehensive Testing (NON-NEGOTIABLE)

**STRICTLY ENFORCED**: Every feature MUST begin with tests before any implementation code
is written. No implementation code shall be written without a failing test first. "I'll add
tests later" is NOT acceptable and constitutes a constitutional violation.

All production code MUST have both unit tests and integration tests. Tests verify individual
components in isolation and real-world scenarios. Test coverage MUST meet the 80% threshold
for business logic, with mandatory verification after spec completion.

**Rationale**: The DSL compiler transforms user code into Eligius configuration. Incorrect
parsing, validation, or compilation directly impacts user productivity and runtime correctness.
Test-first development ensures every behavior is explicitly defined and verified before
implementation, reducing bugs and driving proper design. Tests written after implementation
often miss edge cases and validation requirements.

**Test-First Development Workflow (NO EXCEPTIONS)**:

1. **RED**: Write failing test that describes desired behavior (BEFORE ANY IMPLEMENTATION)
2. **GREEN**: Write MINIMUM code necessary to make the test pass
3. **REFACTOR**: Improve code quality while keeping tests green
4. **NEVER**: Write implementation before test exists

**Requirements**:
- Every public function MUST have unit tests written FIRST
- Every MCP tool MUST have integration tests using real Eligian DSL source files
- ANY file containing `function`, `const fn =`, `class`, or executable code MUST have corresponding test file
- Implementation commits without tests will be REJECTED in code review
- All tests MUST pass before moving on after refactoring
- Test coverage MUST be tracked and maintained above 80% for business logic
- Integration tests MUST use realistic DSL examples from actual use cases
- When tests fail due to intentional changes (grammar updates, API changes), update test expectations immediately
- **Integration tests MUST be isolated in separate files** (one integration test per file)
  - Rationale: Test environment state cannot be reliably reset between integration tests
  - If multiple integration tests share a file, environment pollution causes flaky tests
  - Unit tests CAN share files (they test isolated functions, no shared state)
  - Example: `integration/completion-test.spec.ts`, `integration/hover-test.spec.ts` (separate files)

**Coverage Verification (MANDATORY after spec completion)**:
- Run `npm run test:coverage` when spec is finished
- Analyze coverage report and identify files/functions below 80% threshold
- Implement missing tests to achieve 80% coverage for ALL business logic
- **Exception process**: If coverage cannot be achieved for valid reason:
  1. **STOP IMMEDIATELY** - Do not continue
  2. Document specific files/functions that cannot reach 80%
  3. Provide detailed technical justification for why coverage is impossible
  4. Present findings to user and **WAIT for explicit approval**
  5. Only proceed after user grants exception or provides alternative approach
- NO EXCEPTIONS for business logic, utilities, or critical workflows without user approval
- A spec is NOT complete until coverage requirements met or user has approved exception

**Enforcement**:
- Implementation commits without tests will be rejected in code review
- "I'll add tests later" is a constitutional violation
- Each commit MUST show test written before implementation (reviewable in git history)

### III. No Gold-Plating

Favor "good enough" solutions over perfect, over-engineered ones. Features MUST solve
real, immediate problems. Avoid speculative features, premature optimization, and
unnecessary abstraction. Every addition must justify its complexity.

**Rationale**: The Eligian DSL is production-ready with focused functionality. Adding
unnecessary features or complexity risks introducing bugs, maintenance burden, and
cognitive overhead without proportional benefit.

**Requirements**:
- New features MUST solve a documented user need or pain point
- Optimizations MUST be justified with profiling data showing actual performance issues
- Abstractions MUST be justified by actual code reuse (3+ instances minimum)
- Design patterns MUST solve concrete problems, not be applied "just because"
- When uncertain, choose the simpler implementation
- Technical debt is acceptable if documented and time-boxed

### IV. Mandatory Code Reviews

All code changes MUST go through code review before merging. Reviews verify adherence to
constitution principles, code quality, test coverage, and documentation completeness.

**Rationale**: Code reviews catch bugs, enforce consistency, share knowledge, and ensure
constitution compliance. They are essential for maintaining quality in a functional
codebase with external immutability requirements.

**Requirements**:
- All pull requests MUST have at least one approval before merging
- Reviewers MUST verify constitution compliance (especially testing and documentation)
- Reviewers MUST verify functional programming principles (external immutability)
- Self-reviews are NOT sufficient (except for documentation-only changes)
- Reviews MUST check for clear commit messages and logical commit structure

### V. UX Consistency

User experience across all tools (CLI, VS Code extension, programmatic API) MUST be
consistent. Same interaction patterns, same error formats, same validation messages,
same accessibility considerations.

**Rationale**: Consistent UX across CLI compilation, IDE validation, and programmatic
usage ensures users can predict behavior and understand errors regardless of how they
invoke the compiler. Inconsistent error messages or validation between CLI and IDE
would confuse users and reduce trust.

**Requirements**:
- CLI, VS Code extension, and programmatic API MUST use same validation logic
- Error messages MUST be clear, actionable, and formatted consistently across all interfaces
- Tool descriptions and documentation MUST follow the same pattern
- Response times SHOULD be predictable across compilation modes
- Validation rules MUST be identical in IDE and CLI (compiler-first pattern enforces this)

### VI. Functional Programming with Pragmatic Performance

Prefer functional programming style where external immutability is REQUIRED but internal
mutation is ALLOWED for performance. Use Effect-ts constructs for composition, error
handling, and type safety. Prioritize referential transparency at API boundaries.

**Rationale**: Functional programming with immutable data structures provides
predictability, testability, and concurrent safety. However, performance matters for
parsing and transforming large DSL files and ASTs. Internal mutation keeps code performant
while maintaining external purity.

**Requirements**:
- All public functions MUST have referentially transparent signatures (same input → same output)
- All public data structures MUST be treated as immutable by callers
- Internal mutation is ALLOWED in private functions for performance (with clear comments)
- Use Effect-ts for async operations, error handling, and composition
- Avoid global mutable state entirely
- Side effects MUST be explicitly captured in Effect types
- Performance-critical sections MAY use mutable data structures internally (document why)

### VII. UUID-Based Identifiers (NON-NEGOTIABLE)

All identifiers generated for Eligius configuration elements (timelines, actions, events,
operations) MUST use UUID v4 (random UUIDs). Never use timestamps, sequential numbers,
or other non-UUID schemes for ID generation.

**Rationale**: Eligius configurations may be merged, cached, or run concurrently. UUIDs
provide guaranteed global uniqueness without coordination, preventing ID conflicts during
merging, avoiding race conditions in concurrent scenarios, and enabling safe configuration
composition. Timestamps create collision risks and lack randomness.

**Requirements**:
- All `id` fields in generated Eligius configuration MUST be UUIDs (v4)
- Use `crypto.randomUUID()` (Node.js 19+) or equivalent UUID library for generation
- NEVER use `Date.now()`, sequential counters, or name-based schemes for IDs
- UUID generation MUST be documented in code comments where IDs are created
- Test fixtures MAY use hardcoded UUIDs for deterministic testing
- User-provided IDs (from DSL) MAY use custom naming but SHOULD validate uniqueness

### VIII. Debug Cleanup and Workspace Hygiene (NON-NEGOTIABLE)

All temporary debug files, test scripts, and investigation artifacts MUST be removed from
the workspace after debugging sessions complete. The codebase MUST remain clean, organized,
and free from debugging clutter. Temporary files are acceptable during active investigation
but MUST be cleaned up before committing changes.

**Rationale**: Debug scripts, temporary test files, and investigation artifacts accumulate
quickly during problem-solving. If left unchecked, they create confusion, increase
maintenance burden, and make the project structure unclear. A clean workspace is essential
for maintainability and professionalism.

**Requirements**:
- All debug scripts (`debug-*.js`, `debug-*.mjs`, `test-*.js`, etc.) MUST be deleted after debugging completes
- Temporary investigation files MUST NOT be committed to version control
- Test files belong in `__tests__/` directories, never in root or `src/` directories
- Build artifacts (`.tsbuildinfo`, `out/`, `dist/`) should be in `.gitignore`, not tracked
- After any debugging session: review workspace, delete temporary files, restore clean state
- If a debug script proves useful, convert it to a proper test in `__tests__/` directory
- Document any temporary files created during investigation in pull request descriptions

### IX. ESM Import Extensions (NON-NEGOTIABLE)

All relative imports in TypeScript source files MUST use `.js` extensions (the runtime/output
extension), not `.ts` extensions. This is required for `NodeNext`/`Node16` module resolution
and ensures compatibility with Node.js ESM, Vitest, and other ESM-compliant tools.

**Rationale**: TypeScript with `module: "NodeNext"` implements Node.js ESM semantics, which
requires explicit file extensions in imports. TypeScript does NOT rewrite `.ts` to `.js`
during compilation, so using `.ts` extensions causes runtime module resolution failures.
The TypeScript team's official guidance is to use the output extension (`.js`) even in
`.ts` source files.

**Requirements**:
- All relative imports MUST use `.js` extensions: `import { foo } from './bar.js'`
- NEVER use `.ts` extensions in imports: `import { foo } from './bar.ts'` ❌
- TypeScript will still correctly resolve types regardless of extension
- This applies to all relative imports (`./`, `../`) in `.ts` files
- Package imports (without `./` or `../`) do NOT need extensions
- Type-only imports also require `.js`: `import type { Foo } from './types.js'`
- Third-party package imports remain unchanged: `import { effect } from 'effect'` ✅

### X. Validation Pattern: Compiler-First with Langium Integration (NON-NEGOTIABLE)

All validation logic for DSL constructs MUST be implemented first in the compiler package
with pure functions returning typed errors, then exposed to the Langium validator as a
thin adapter for IDE integration. The compiler validation is the source of truth.

**Rationale**: Separating validation logic from IDE integration ensures the compiler can
validate independently (for CLI/programmatic use), enables comprehensive unit testing of
validation logic in isolation, maintains single source of truth for validation rules,
and keeps the Langium validator as a lightweight adapter focused solely on IDE concerns.
This pattern prevents code duplication and ensures consistency across CLI, programmatic,
and IDE validation.

**Requirements**:
- Validation logic MUST be implemented in `packages/compiler/src/operations/validator.ts`
- Validation functions MUST return structured error objects (e.g., `UnknownOperationError`)
- Error objects MUST include `code`, `message`, `hint`, and relevant context
- Validation functions MUST be pure (no side effects, deterministic)
- Validation functions MUST be exported from `packages/compiler/src/index.ts`
- Langium validator MUST call compiler validation functions, not reimplement logic
- Langium validator methods MUST be thin adapters that convert errors to `ValidationAcceptor` format
- All validation logic MUST have unit tests in `packages/compiler/src/operations/__tests__/validator.spec.ts`
- Langium integration MAY have integration tests in `packages/language/src/__tests__/validation.spec.ts`

**Pattern Example**:
```typescript
// Compiler (source of truth):
export function validateOperationExists(name: string): UnknownOperationError | undefined {
  if (hasOperation(name)) return undefined;
  return { code: 'UNKNOWN_OPERATION', message: `Unknown operation: "${name}"`, ... };
}

// Langium (thin adapter):
checkOperationExists(op: OperationCall, accept: ValidationAcceptor): void {
  const error = validateOperationExists(op.operationName);
  if (error) {
    accept('error', `${error.message}. ${error.hint}`, { node: op, code: error.code });
  }
}
```

### XI. Code Quality: Biome Integration (NON-NEGOTIABLE)

All code changes MUST be formatted and linted with Biome, followed by TypeScript type
checking, after each task completion. Any issues surfaced by Biome or TypeScript (formatting,
linting errors, unused imports, type errors, code smells) MUST be fixed as part of that task
before the task is considered complete.

**Rationale**: Consistent code formatting and linting prevent style bikeshedding, catch
common bugs early (unused variables, missing returns, etc.), and ensure the codebase
remains clean and maintainable. TypeScript type checking catches entire classes of bugs
at compile time. Running both after each task ensures issues are caught immediately when
context is fresh, rather than accumulating and creating large cleanup PRs.

**Requirements**:
- MUST run `npm run check` after completing each task (formats and lints with auto-fix)
- MUST run `npm run typecheck` after Biome passes (verify TypeScript type correctness)
- All Biome errors and TypeScript type errors MUST be fixed before task completion
- Biome warnings SHOULD be addressed or explicitly suppressed with justification
- Configuration changes to `biome.json` MUST be documented with rationale
- Generated files (`.generated.ts`, `out/`, `dist/`) MUST be excluded from Biome checks
- Task completion checklist MUST include "Biome + typecheck pass" as final step
- If issues are legitimate, fix them; if false positives, update configuration with justification
- NEVER commit code with unresolved linting, formatting, or type errors

**Workflow**:
```bash
# After completing a task:
npm run check      # Format and lint with auto-fix
npm run typecheck  # Verify TypeScript types

# If Biome issues remain:
npm run lint       # Review issues
# Fix issues or update biome.json if false positives

# If typecheck issues remain:
# Fix type errors - no suppression without justification

# Verify clean:
npm run check && npm run typecheck  # Both must pass
```

### XII. Eligius Architecture Understanding (NON-NEGOTIABLE)

Understanding how Eligius operations work internally is CRITICAL for correct DSL compilation.
The following architecture concepts are fundamental and MUST be understood before implementing
any operation-related features:

**operationData Object** (passed between operations in a chain):
- Contains configuration properties provided by the user
- Operations can add properties to it (outputs)
- Operations can read properties from it (dependencies)
- Properties marked with `erased: true` are **deleted** from `operationData` after use by that operation
- Subsequent operations cannot access erased properties (validation must catch this)

**IOperationScope** (the `this` pointer of operation functions, aliased as `$scope` in DSL):
- System-level shared state, NOT user configuration
- Contains: `loopIndex`, `loopLength`, `currentItem`, `variables`, etc.
- Allows operations to share information outside of `operationData`
- In Eligian DSL: `@@loopIndex` → `$scope.loopIndex` (system properties)
- In Eligian DSL: `@myVar` → `$scope.variables.myVar` (user-declared local variables)
- The `variables` property enables cross-cutting values when operations use different property names

**Operation Dependencies** (from metadata):
- Properties an operation EXPECTS to find on `operationData`
- Could be outputs from previous operations (e.g., `selectedElement`)
- Could be properties set directly in the operation invocation
- NOT related to `$scope` - dependencies are purely about `operationData`

**Operation Outputs** (from metadata):
- Properties an operation ADDS to `operationData` for subsequent operations
- Example: `selectElement` outputs `selectedElement` to `operationData`

**Erased Properties** (from metadata - parameters with `erased: true`):
- When an operation uses a parameter marked `erased: true`, it DELETES that property from `operationData`
- This is Eligius's memory management - properties are consumed and removed
- Erased property validation MUST track `operationData` state and prevent access to erased properties

**Rationale**: Misunderstanding these concepts leads to incorrect compilation, runtime failures,
and wasted debugging effort. The distinction between `operationData` (user config) and `$scope`
(system state) is fundamental to how Eligius operations communicate. Erased property tracking
prevents runtime errors by catching bugs at compile time.

**Requirements**:
- MUST understand the difference between `operationData` and `$scope` before implementing features
- MUST track `operationData` properties separately from `$scope` properties
- MUST validate erased property access by tracking what's on `operationData` at each step
- MUST NOT confuse operation dependencies (what's on `operationData`) with scope properties
- Document any operation data flow logic with references to this architecture section

### XIII. Eligius Domain Expert Consultation (NON-NEGOTIABLE)

When implementing features that interact with Eligius engine internals, runtime behavior,
or architectural patterns, Claude MUST first attempt to understand the issue independently
through documentation, source code analysis, and metadata consultation. However, Claude
MUST confirm understanding with the user (Roland Zwaga, Eligius author) before proceeding
with implementation when uncertainty exists.

**Rationale**: Eligius is a complex story-telling engine with specific architectural patterns,
runtime behaviors, and design decisions that may not be fully documented or immediately apparent
from code inspection. The author has deep knowledge of edge cases, intentional design choices,
and future compatibility considerations. Making incorrect assumptions about Eligius internals
can lead to subtle bugs that only surface at runtime or break future Eligius versions.

**Requirements**:
- MUST read existing documentation, source code, and metadata FIRST before asking questions
- MUST formulate specific, targeted questions based on investigation findings
- MUST explain what was discovered and where uncertainty remains
- MUST NOT make assumptions about Eligius runtime behavior without confirmation
- MUST document confirmed behaviors in code comments for future reference
- MAY proceed with implementation only after domain expert confirms understanding
- Questions SHOULD be specific: "Does operation X delete property Y?" not "How does X work?"

**Pattern Example**:
```
Claude Investigation:
"I examined the selectElement operation metadata and see it outputs 'selectedElement'
to operationData. I also see the animate operation has a dependency on 'selectedElement'.
However, I'm uncertain if animate ERASES selectedElement after use, which would affect
subsequent operations in the chain.

Question: Does the animate operation erase the 'selectedElement' property from operationData,
or does it remain available for subsequent operations?"

User Response: "Good investigation! The animate operation does NOT erase selectedElement -
it's designed to allow multiple animations on the same selected element. The erased flag
is only set on properties that represent one-time actions or temporary state."
```

### XIV. Question-First Implementation (NON-NEGOTIABLE)

When Claude encounters uncertainty, asks the user a question, or requests clarification during
implementation, Claude MUST STOP and WAIT for the user's response before proceeding with ANY
further implementation work. Questions are asked because more information is needed - continuing
without that information defeats the entire purpose of asking.

**Rationale**: Asking questions and then immediately proceeding with implementation without
waiting for answers is completely backwards and wastes everyone's time. If Claude is uncertain
enough to ask a question, then Claude lacks the information needed to proceed correctly.
Continuing implementation while questions are pending creates work that may need to be undone,
generates incorrect code based on assumptions, and frustrates the user who took time to provide
answers that were then ignored.

**Requirements**:
- MUST stop ALL implementation work after asking a question
- MUST wait for user response before writing ANY new code
- MUST NOT make assumptions or "fill in the blanks" while waiting for answers
- MUST read and incorporate user's answers before proceeding
- MAY perform read-only investigation (reading files, searching code) while waiting
- MAY ask follow-up clarifying questions based on investigation findings
- MUST NOT write, edit, or generate any code until user provides requested information
- After receiving answers, MUST acknowledge them and explain how they inform the implementation

**Pattern Example**:
```
Claude: "I'm uncertain about how Eligius handles enum types in parameters. Looking at the
calc operation, I see type can be an array of {value: string} objects. Should I:
1) Keep type as string in the interface and convert arrays to string representation?
2) Change the interface to allow type: string | Array<{value: string}>?
3) Something else?

What's your preference for handling this?"

❌ WRONG: Immediately starts writing code for option #2 without waiting

✅ CORRECT: Waits for user response, reads it, then proceeds based on user's guidance
```

### XV. Operation Metadata Consultation (NON-NEGOTIABLE)

Before implementing any transformation or generation of Eligius operations, the operation's
metadata MUST be consulted from the operation registry (`registry.generated.ts`). Never make
assumptions about operation parameters, dependencies, or structure. The metadata is the
single source of truth for how operations work.

**Rationale**: Eligius operations have specific parameter requirements, dependency structures,
and behaviors documented in their metadata. Making assumptions about operations leads to
incorrect code generation, runtime failures, and wasted debugging time. The operation registry
contains authoritative documentation extracted directly from Eligius source code.

**Requirements**:
- MUST check operation metadata in `registry.generated.ts` before using any operation
- MUST verify parameter names, types, and required/optional status from metadata
- MUST verify dependency requirements (what outputs previous operations must provide)
- MUST NOT assume operation structure based on naming or intuition
- MUST consult `description` field in metadata for usage guidance and examples
- When in doubt about an operation's behavior, check Eligius source code or documentation
- Document operation usage with references to metadata when implementing transformations

**Pattern Example**:
```typescript
// ❌ WRONG - Assumption without checking metadata
operations.push({
  systemName: 'startAction',
  operationData: {
    actionInstance: 'operationdata.actionInstance',  // WRONG: this is a dependency, not a parameter!
    actionOperationData: { ... }
  }
});

// ✅ CORRECT - After consulting metadata
// Metadata shows: parameters: [{ name: 'actionOperationData', type: 'object', required: false }]
// Metadata shows: dependencies: [{ name: 'actionInstance', type: 'object' }]
operations.push({
  systemName: 'startAction',
  operationData: {
    actionOperationData: { ... }  // Only pass parameters, dependencies come from previous ops
  }
});
```

**Consultation Workflow**:
1. Identify operation name you need to use
2. Search `registry.generated.ts` for that operation
3. Read `description` field for usage guidance
4. Check `parameters` array for what goes in `operationData`
5. Check `dependencies` array for what must come from previous operations
6. Check `outputs` array for what this operation provides to subsequent operations
7. Implement transformation based on metadata, not assumptions

### XVI. Concise Communication (NON-NEGOTIABLE)

The user is a senior developer. Brief, technical communication only.

**Rationale**: Verbose communication wastes time and tokens. Senior developers don't need
explanations of basic operations or hand-holding through routine tasks.

**Requirements**:
- Keep responses SHORT and TO THE POINT
- NO hand-holding explanations
- NO verbose status updates about routine operations
- State what you did, not how or why (unless asked)
- Be verbose only when: user requests detail, critical errors, architectural proposals, or 5+ failed debug attempts

### XVII. Language Specification Maintenance (NON-NEGOTIABLE)

The `LANGUAGE_SPEC.md` file is the authoritative documentation of Eligian syntax, semantics,
and compilation behavior. It MUST be updated whenever ANY language feature is added, modified,
or removed. The spec is a living document that defines the language contract.

**Rationale**: A DSL without a complete, accurate specification becomes impossible to maintain,
extend, or use correctly. Grammar changes, new syntax features, or semantic changes must be
documented immediately while context is fresh. Outdated specs lead to incorrect implementations
and user confusion.

**Requirements**:
- MUST update `LANGUAGE_SPEC.md` when adding/changing/removing language features
- MUST update spec BEFORE implementing the feature (spec drives implementation)
- MUST update version number in spec header when modified
- MUST document syntax, semantics, compilation behavior, and examples for each feature
- MUST verify spec examples compile correctly with the CLI compiler
- Spec updates are NOT optional - feature is incomplete without spec documentation
- Grammar changes MUST be reflected in spec within same commit/PR
- Run `node packages/cli/bin/cli.js --check` on all spec examples to verify correctness

**Workflow**:
```bash
# When adding a language feature:
1. Update LANGUAGE_SPEC.md with syntax and semantics
2. Add examples to spec
3. Verify examples: node packages/cli/bin/cli.js --check <example-file>
4. Implement grammar changes
5. Implement compiler transformations
6. Verify spec examples still compile correctly
7. Commit with message: "feat: <feature> (with spec update)"
```

### XVIII. Research & Documentation Standards (NON-NEGOTIABLE)

When researching library usage, API patterns, or implementation details, accuracy is critical.
ALWAYS consult the context7 MCP server when researching how to use code libraries and
implementations to ensure current, authoritative documentation is used.

**Rationale**: Outdated or incorrect library usage leads to bugs, technical debt, and maintenance
burden. The context7 MCP server provides access to current, authoritative documentation, reducing
implementation errors and ensuring code follows established patterns. In DSL compilation,
using libraries incorrectly (Langium, Effect-TS, Typir) can introduce subtle bugs that compromise
compilation correctness or IDE integration.

**Requirements**:
- ALWAYS consult context7 MCP server when researching library usage and API patterns
- Use context7 to retrieve current, accurate documentation for dependencies (Langium, Effect-TS, Typir, Vitest, etc.)
- Verify API signatures and patterns against official documentation via context7
- When implementing features with unfamiliar libraries, query context7 BEFORE writing code
- Cross-reference implementation patterns with context7 to ensure best practices
- Document any discrepancies between context7 documentation and actual behavior

**Context7 Usage Examples**:
- "How do I use Langium's validation API for custom rules?"
- "What's the correct Effect-TS pattern for error handling in pipelines?"
- "Show me the Typir API for type inference and validation"
- "How do I test Langium validators with @solidjs/testing-library?"

### XIX. Dependency Management (NON-NEGOTIABLE)

**CRITICAL**: Dependency changes affect application stability, security, and maintainability.
All dependency modifications require explicit user approval.

**Rationale**: In DSL compilation projects, every dependency is a potential security risk,
maintenance burden, and stability concern. Uncontrolled dependency growth leads to version
conflicts, security vulnerabilities, and increased attack surface. User approval ensures
dependencies are necessary, vetted, and aligned with project goals. This principle prevents
dependency bloat and maintains a stable, auditable dependency graph.

**Requirements**:
- DO NOT automatically install or modify package.json
- DO NOT add new dependencies without user consultation and approval
- When a new dependency is required, STOP and discuss with the user first
- DO NOT continue working until user approval is obtained
- Focus development efforts on:
  - Project structure and file organization
  - Configuration files (tsconfig.json, vitest.config.ts, etc.)
  - Code organization and architecture
  - Implementation using existing dependencies
- Document dependency requirements in planning phase for user review
- Justify every new dependency with specific use case and rationale
- Consider alternatives using existing dependencies before proposing new ones

**Approval Process for New Dependencies**:
1. Identify the need during planning or implementation
2. Research alternatives using existing dependencies
3. Document the specific requirement and justification
4. Present options to user with pros/cons
5. Wait for explicit user approval
6. Only after approval, proceed with installation

### XX. Debugging Attempt Limit (NON-NEGOTIABLE)

**CRITICAL**: When debugging or troubleshooting issues, you are limited to **5 attempts**
before requiring user consultation.

**Rationale**: Infinite debugging loops waste time and often indicate a fundamental
misunderstanding of the problem. After 5 failed attempts, it's clear that either the approach
is wrong, critical information is missing, or the problem requires a different perspective.
Consulting the user after 5 attempts prevents wasted effort, brings fresh insight, and often
reveals that the entire approach needs to change.

**Attempt Definition**: An "attempt" is any iteration of trying a different approach to solve
the same problem, including:
- Modifying code in a different way
- Trying a different configuration
- Clearing caches or reinstalling dependencies
- Changing file structure or imports
- Applying patches or workarounds

**The 5-Attempt Rule**:
1. **Attempt 1**: Initial diagnosis and first solution attempt
2. **Attempt 2**: If failed, try a different approach based on new information
3. **Attempt 3**: If failed, research the issue more deeply (context7, documentation)
4. **Attempt 4**: If failed, try a more fundamental approach or alternative solution
5. **Attempt 5**: If failed, document the attempts and prepare questions for user

**After 5 Failed Attempts**:
- **STOP IMMEDIATELY** - Do not continue troubleshooting
- **DOCUMENT** what was tried and why each attempt failed
- **ANALYZE** the common patterns across failures
- **FORMULATE** specific, focused questions for the user:
  - What have I tried?
  - What patterns did I observe?
  - What are the possible root causes?
  - What information do I need to proceed?
- **PRESENT** findings and questions clearly to the user
- **WAIT** for user response before continuing

**DO NOT**:
- Continue brute-forcing solutions past 5 attempts
- Try variations of the same failed approach
- Keep debugging indefinitely without user consultation
- Assume the next attempt will work "this time"

**Example Tracking** (internal):
```
Issue: Type inference not working for operation parameters
Attempt 1: Added type annotations to metadata - FAILED
Attempt 2: Updated Typir inference rules - FAILED
Attempt 3: Checked Typir documentation via context7 - FAILED
Attempt 4: Simplified type constraints - FAILED
Attempt 5: Added logging to trace inference flow - FAILED
→ STOP. Consult user about Typir type system architecture.
```

### XXI. Token Efficiency (NON-NEGOTIABLE)

**CRITICAL**: Token usage is a finite resource. NEVER generate documentation that duplicates
machine-readable output.

**Rationale**: Test coverage reports, lint output, and other machine-readable data can be
generated instantly with commands. Documenting this output in markdown files wastes thousands
of tokens transcribing data that provides zero additional value over running the command.
Token efficiency is critical for senior developers who value concise, actionable information
over verbose data dumps.

**Prohibited Documentation Practices**:
- NEVER generate test coverage reports in spec documentation (e.g., coverage-report.md)
- NEVER copy/paste or transcribe output from `npm run test:coverage` into markdown files
- NEVER document coverage metrics, percentages, or file-by-file breakdowns
- NEVER create "Coverage Report" or "Test Results" sections in spec completion documents
- NEVER duplicate information that can be obtained by running a single command

**Required Practices**:
- ALWAYS run `npm run test:coverage` to view coverage (per Principle II)
- ALWAYS analyze coverage output directly from the terminal
- ONLY document coverage-related INSIGHTS if they require human interpretation:
  - Explanation of why a specific file has low coverage (if valid reason exists)
  - Justification for coverage exceptions (if user approved)
  - Architecture decisions that affect testability
- VERIFY coverage meets 80% threshold via command output, not documentation

**What to Document Instead**:
- ✅ Test strategy and approach
- ✅ Edge cases that were explicitly tested
- ✅ Rationale for test organization decisions
- ✅ User-approved coverage exceptions with justification
- ❌ Coverage percentages, metrics, or reports (use `npm run test:coverage` instead)

**Examples**:

**Good (Insight-based documentation)**:
```markdown
## Testing Notes
- Langium AST traversal tests skip certain edge cases due to Langium's internal node structure
- User approved 72% coverage for AST transformer due to unreachable error paths in generated code
```

**Bad (Redundant data dump)**:
```markdown
## Coverage Report
- Statements: 95.37%
- Branches: 92.44%
- Functions: 97.04%
- Lines: 95.37%

### By Module
- compiler/ast-transformer.ts: 97.85%
- compiler/validator.ts: 100%
- compiler/optimizer.ts: 92.14%
[... 50 more lines of redundant data ...]
```

### XXII. Accessibility Standards (NON-NEGOTIABLE)

All user-facing interfaces (CLI output, VS Code extension UI, error messages) MUST be
accessible to users with disabilities. Follow WCAG 2.1 AA standards for all interactive
components and output.

**Rationale**: Accessibility is both a legal requirement and moral obligation. Developers
with disabilities must have equal access to DSL compilation tools, IDE integration, and
error diagnostics. Inaccessible error messages or IDE UI elements prevent users from
effectively using the Eligian DSL.

**Requirements**:
- Follow WCAG 2.1 AA standards for ALL user-facing components (CLI, extension UI)
- Ensure keyboard navigation for all interactive elements in VS Code extension
- Provide clear, actionable error messages and validation feedback
- Use semantic HTML/markup in extension webviews (if any)
- Include ARIA labels and roles where semantic markup is insufficient
- Ensure color contrast ratios meet WCAG AA requirements (4.5:1 for normal text)
- Support screen readers and assistive technologies
- Test CLI output with screen readers (ensure error messages are readable)
- Test VS Code extension with keyboard-only navigation

**CLI-Specific Requirements**:
- Error messages MUST be clear and parseable by screen readers
- Use standard exit codes (0 for success, non-zero for errors)
- Provide progress indicators that work with screen readers (avoid spinners, use text)
- Support `--no-color` flag for color-blind users or terminals without color support

**VS Code Extension-Specific Requirements**:
- Diagnostic messages MUST include clear descriptions and locations
- Quick fixes MUST be keyboard-accessible
- Extension commands MUST have descriptive labels
- Webviews (if any) MUST follow WCAG 2.1 AA standards

### XXIII. Incremental Feature Commits (NON-NEGOTIABLE)

When implementing features using the speckit workflow (specification → planning → implementation),
each completed phase MUST be committed to the feature branch immediately after completion.
Commits MUST NOT be pushed to remote until the entire feature is complete and ready for review.

**Rationale**: Incremental commits provide granular git history that enables easy rollback to
specific implementation stages, creates clear checkpoints for debugging and code review, allows
resuming work from well-defined states after breaks, and maintains logical separation of concerns
(design artifacts vs implementation vs tests). However, pushing incomplete work creates noise in
the remote repository and may trigger unnecessary CI/CD runs or confuse other developers.

**Requirements**:
- MUST commit after each major phase completes:
  - Phase 0: Research artifacts (research.md)
  - Phase 1: Design artifacts (data-model.md, quickstart.md, contracts/)
  - Phase 2: Grammar and parsing implementation
  - Phase 3: Validation implementation
  - Phase 4: Compiler/transformation implementation
  - Phase 5: IDE integration (completion, hover, definition)
  - Phase 6: Tests and documentation
  - Phase 7: Final review and cleanup
- MUST use descriptive commit messages following conventional commits format:
  - `docs(spec-023): Add research artifacts for library files feature`
  - `docs(spec-023): Add design artifacts (data model, quickstart)`
  - `feat(spec-023): Implement library file grammar and parsing`
  - `feat(spec-023): Add library validation rules`
  - `feat(spec-023): Implement import resolution and compilation`
  - `feat(spec-023): Add IDE integration for library imports`
  - `test(spec-023): Add comprehensive test coverage`
  - `docs(spec-023): Update LANGUAGE_SPEC.md with library syntax`
- MUST NOT push to remote until feature is complete and ready for PR
- MUST verify all tests pass and code quality checks pass before each commit
- MAY amend the most recent commit if immediate fixes are needed (before pushing)
- MUST squash or organize commits into logical units before pushing (if needed for clarity)

**Commit Message Format**:
```
<type>(spec-XXX): <description>

[optional body explaining what was done and why]

[optional footer with breaking changes or issue references]
```

**Workflow Example**:
```bash
# After completing Phase 0: Research
git add specs/023-library-files-with/research.md
git commit -m "docs(spec-023): Add research artifacts for library files feature"

# After completing Phase 1: Design
git add specs/023-library-files-with/data-model.md specs/023-library-files-with/quickstart.md
git commit -m "docs(spec-023): Add design artifacts (data model, quickstart)"

# After completing Phase 2: Grammar
git add packages/language/src/eligian.langium packages/language/src/__tests__/library-parsing.spec.ts
git commit -m "feat(spec-023): Implement library file grammar and parsing

- Add Library AST node with library keyword
- Add ImportStatement and ActionImport nodes
- Add private visibility modifier to ActionDeclaration
- Add parsing tests for all new grammar rules"

# ... continue for each phase ...

# After ALL phases complete and tests pass:
git push origin 023-library-files-with
# Now create PR for review
```

**DO NOT**:
- Push incomplete phases to remote (keep work local until feature complete)
- Skip commits between phases (each phase MUST have a commit)
- Create massive commits that combine multiple phases
- Push feature branches before they are ready for review

## Development Workflow

### Pull Request Process

All code changes follow this workflow:

1. **Branch Creation**: Create feature branch from main with descriptive name
2. **Test-First Implementation**: Write failing tests BEFORE any implementation
3. **Implementation**: Write MINIMUM code to pass tests, then refactor
4. **Testing**: Verify all tests pass (unit + integration)
5. **Code Quality**: Run `npm run check && npm run typecheck` and fix all issues
6. **Coverage Verification**: Run `npm run test:coverage` and ensure 80%+ for business logic
7. **Documentation**: Update relevant documentation (code comments, CLAUDE.md, LANGUAGE_SPEC.md)
8. **Self Review**: Review own changes for constitution compliance
9. **Pull Request**: Create PR with clear description of changes and rationale
10. **Code Review**: Address reviewer feedback, maintain constitution compliance
11. **Merge**: Merge only after approval and passing CI/CD checks

### Testing Standards

- **Test-First Development**: Write failing tests BEFORE implementation (RED-GREEN-REFACTOR)
- **Unit Tests**: Test individual functions/modules in isolation
- **Integration Tests**: Test compilation end-to-end with real Eligian DSL source files
- **Test Location**: Tests in `__tests__/` subdirectories alongside code
- **Test Naming**: `*.spec.ts` extension
- **Coverage**: Minimum 80% coverage for business logic, verified after spec completion
- **Coverage Verification**: Run `npm run test:coverage`, achieve threshold, or get user approval for exceptions

### Documentation Requirements

- **Code Documentation**: Inline comments for complex logic, docstrings for all public APIs
- **Architecture Documentation**: Major decisions documented in CLAUDE.md
- **Language Specification**: LANGUAGE_SPEC.md kept up to date with all grammar changes
- **Technical Analysis**: Complex domains (Eligius architecture) documented in dedicated sections
- **NO Redundant Documentation**: Never duplicate machine-readable output (coverage reports, lint results)

## Governance

### Amendment Process

This constitution MAY be amended when project needs evolve. Amendments require:

1. **Proposal**: Document proposed change with rationale and impact analysis
2. **Discussion**: Team discussion of benefits, risks, and alternatives
3. **Approval**: Consensus approval from active maintainers
4. **Migration Plan**: Document how existing code will adapt to new principles
5. **Version Bump**: Increment constitution version following semantic versioning
6. **Template Updates**: Update all dependent templates and documentation

### Versioning Policy

Constitution follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Backward incompatible changes (principle removals or redefinitions)
- **MINOR**: New principles or materially expanded guidance
- **PATCH**: Clarifications, wording improvements, non-semantic refinements

### Compliance Review

All pull requests MUST verify compliance with this constitution:

- Does the code follow functional programming principles?
- Were tests written FIRST (verify git history if needed)?
- Are tests comprehensive (unit + integration)?
- Does test coverage meet 80% threshold for business logic?
- Did Biome and TypeScript type checking pass without errors?
- Is documentation complete and clear (no redundant coverage reports)?
- Is the solution appropriately simple (no gold-plating)?
- Is UX consistent with existing tools?
- Were dependencies added without user approval? (constitutional violation if yes)
- Did debugging exceed 5 attempts without user consultation? (constitutional violation if yes)
- Was context7 consulted for library research?
- Are error messages accessible (WCAG 2.1 AA)?
- Were phases committed incrementally (for speckit features)?
- Has code review been completed?

Complexity MUST be justified. If a feature violates a principle (e.g., adds significant
complexity), the justification MUST be documented in the pull request and reviewed.

### Runtime Guidance

For detailed development guidance, workflow specifics, and tool usage, refer to CLAUDE.md.
That file provides practical guidance for working with this codebase, while this
constitution defines the non-negotiable principles that govern the project.

**Version**: 2.1.1 | **Ratified**: 2025-10-14 | **Last Amended**: 2025-11-02

### XXIV. Unified Example File (NON-NEGOTIABLE)

All language feature examples MUST be consolidated in a single comprehensive example file
(`examples/demo.eligian`) rather than scattered across multiple separate files. This ensures
every feature is demonstrated in one canonical location that users and developers can reference.

**Rationale**: Having a single comprehensive example file that demonstrates ALL language features
provides several critical benefits: (1) Users have one authoritative reference showing every
language capability in context, (2) Developers can verify all features work together without
conflicts, (3) New features are immediately visible in the canonical example, preventing feature
blindness where capabilities exist but nobody knows about them, (4) Testing can verify the
comprehensive example compiles successfully, ensuring all features remain compatible as the
language evolves. Multiple separate example files fragment knowledge and make it harder to
understand the full scope of language capabilities.

**Requirements**:
- ALL new language features MUST be added to `examples/demo.eligian` as part of feature implementation
- Feature examples MUST include clear comments explaining the feature and its syntax
- Feature examples MUST demonstrate typical usage patterns, not just minimal syntax
- Feature examples MUST include JSDoc comments where applicable (for action definitions)
- Separate feature-specific example files are PROHIBITED (use `demo.eligian` only)
- When adding a feature example, update the file header to list the new feature
- Feature examples MUST be grouped by category (Asset Imports, Constants, Actions, Control Flow, etc.)
- The demo.eligian file MUST compile successfully with the CLI compiler after any feature additions
- Run `node packages/cli/bin/cli.js examples/demo.eligian` to verify demo compiles after changes

**Example Addition Pattern**:
```eligian
// When adding event actions feature (Feature 028):

// 1. Update file header to list "Event actions (runtime event handling)"
// 2. Add new section with clear delimiter:
// ============================================================================
// EVENT ACTIONS - Runtime Event Handling (Feature 028)
// ============================================================================

// 3. Add feature examples with comments:
/**
 * Handle language change events
 * @param languageCode The new language code
 */
on event "language-change" action HandleLanguageChange(languageCode: string) [
  selectElement("#language-display")
  setElementContent(languageCode)
]

// 4. Demonstrate feature variations (parameters, topics, etc.)
// 5. Verify demo.eligian compiles: node packages/cli/bin/cli.js examples/demo.eligian
```

**Prohibited Practices**:
- ❌ Creating separate example files like `event-actions-demo.eligian`, `library-imports-demo.eligian`
- ❌ Having feature examples only in test fixtures without user-facing examples
- ❌ Adding features without updating `examples/demo.eligian`
- ❌ Leaving the demo file outdated after feature implementation
- ❌ Creating "specialized" examples that fragment the canonical reference

