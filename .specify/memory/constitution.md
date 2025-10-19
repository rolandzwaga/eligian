<!--
Sync Impact Report:
- Version change: 1.7.0 → 1.8.0
- Amendment: Added Principle XIV (Question-First Implementation)
- Modified principles: Renumbered XIV→XV (Operation Metadata Consultation)
- Added sections: Principle XIV - Question-First Implementation (NON-NEGOTIABLE)
- Removed sections: None
- Templates requiring updates: None (workflow guidance for Claude when implementing)
- Follow-up TODOs:
  - Apply this principle immediately when asking ANY question during implementation
  - STOP all implementation work after asking questions
  - WAIT for user answers before proceeding
  - Document user's answers and how they inform implementation
-->

# Eligius GF-RGL MCP Server Constitution

## Core Principles

### I. Simplicity, Documentation, and Maintainability

All code, architecture, and design decisions MUST prioritize simplicity and clarity over
cleverness. Every component MUST be documented with clear purpose, usage examples, and
architectural rationale. Code MUST be written for maintainability first, anticipating
future developers who need to understand and modify it.

**Rationale**: The project addresses lacking GF RGL documentation by providing programmatic
access to source code. If the tool itself lacks clarity and documentation, it defeats its
own purpose. Maintainability ensures long-term viability as GF and RGL evolve.

**Requirements**:
- All modules MUST include purpose documentation at the top
- All public functions MUST have clear docstrings explaining purpose, parameters, and return values
- Complex algorithms MUST include inline comments explaining the "why" not just the "what"
- Architecture decisions MUST be documented in CLAUDE.md or dedicated architecture docs
- Avoid premature abstraction - prefer clear, direct code over complex patterns

### II. Comprehensive Testing (NON-NEGOTIABLE)

All production code MUST have both unit tests and basic integration tests. Tests are
non-negotiable - no feature is complete without tests. Unit tests verify individual
components in isolation. Integration tests verify real-world scenarios and component
interactions.

**Rationale**: The MCP server parses complex GF source code and provides accurate results
to AI assistants. Incorrect parsing or broken tools directly impact user productivity.
Comprehensive testing ensures reliability and catches regressions early.

**Requirements**:
- Every public function MUST have unit tests
- Every MCP tool MUST have integration tests using real GF-RGL source files
- Tests MUST be written before or alongside implementation (TDD encouraged)
- All tests MUST pass before code review
- **All tests MUST pass before moving on after refactoring** - If a refactor breaks tests, fix them immediately before proceeding to new work
- Test coverage SHOULD be tracked and maintained above 80%
- Integration tests MUST use realistic GF source examples from actual RGL modules
- When tests fail due to intentional changes (grammar updates, API changes), update test expectations immediately

### III. No Gold-Plating

Favor "good enough" solutions over perfect, over-engineered ones. Features MUST solve
real, immediate problems. Avoid speculative features, premature optimization, and
unnecessary abstraction. Every addition must justify its complexity.

**Rationale**: The project is production-ready with focused functionality. Adding
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

User experience across all MCP tools MUST be consistent. Same interaction patterns,
same response formats, same error handling, same accessibility considerations.

**Rationale**: As an MCP server, the UX is primarily API-driven. Consistent tool
behavior, error messages, and response formats ensure AI assistants (like Claude)
can reliably use the tools and provide predictable results to end users.

**Requirements**:
- All MCP tools MUST follow consistent naming conventions
- All MCP tools MUST return structured data in the same format
- Error messages MUST be clear, actionable, and formatted consistently
- Tool descriptions MUST follow the same documentation pattern
- Response times SHOULD be predictable and similar across tools
- Tool parameters MUST use consistent naming and validation patterns

### VI. Functional Programming with Pragmatic Performance

Prefer functional programming style where external immutability is REQUIRED but internal
mutation is ALLOWED for performance. Use Effect-ts constructs for composition, error
handling, and type safety. Prioritize referential transparency at API boundaries.

**Rationale**: Functional programming with immutable data structures provides
predictability, testability, and concurrent safety. However, performance matters for
parsing large RGL source trees. Internal mutation keeps code performant while
maintaining external purity.

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
- Test files belong in `__tests__/` or `test/` directories, never in root or `src/` directories
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

All code changes MUST be formatted and linted with Biome after each task completion. Any
issues surfaced by Biome (formatting, linting errors, unused imports, code smells) MUST be
fixed as part of that task before the task is considered complete. Biome ensures consistent
code style, catches common mistakes, and maintains code quality across the project.

**Rationale**: Consistent code formatting and linting prevent style bikeshedding, catch
common bugs early (unused variables, missing returns, etc.), and ensure the codebase
remains clean and maintainable. Running Biome after each task ensures issues are caught
immediately when context is fresh, rather than accumulating and creating large cleanup PRs.

**Requirements**:
- MUST run `npm run check` after completing each task (formats and lints with auto-fix)
- All Biome errors MUST be fixed before the task is considered complete
- Biome warnings SHOULD be addressed or explicitly suppressed with justification
- Configuration changes to `biome.json` MUST be documented with rationale
- Generated files (`.generated.ts`, `out/`, `dist/`) MUST be excluded from Biome checks
- Task completion checklist MUST include "Biome checks pass" as final step
- If Biome surfaces legitimate issues, fix them; if false positives, update configuration
- When adding new rules, ensure they don't break existing valid patterns

**Workflow**:
```bash
# After completing a task:
npm run check  # Format and lint with auto-fix

# If issues remain:
npm run lint   # Review issues
# Fix issues or update biome.json if false positives

# Verify clean:
npm run check  # Should show "0 errors, 0 warnings"
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

## Development Workflow

### Pull Request Process

All code changes follow this workflow:

1. **Branch Creation**: Create feature branch from main with descriptive name
2. **Implementation**: Write code following constitution principles
3. **Testing**: Write and run unit tests + integration tests (all must pass)
4. **Documentation**: Update relevant documentation (code comments, CLAUDE.md, etc.)
5. **Self Review**: Review own changes for constitution compliance
6. **Pull Request**: Create PR with clear description of changes and rationale
7. **Code Review**: Address reviewer feedback, maintain constitution compliance
8. **Merge**: Merge only after approval and passing CI/CD checks

### Testing Standards

- **Unit Tests**: Test individual functions/modules in isolation
- **Integration Tests**: Test MCP tools end-to-end with real GF-RGL sources
- **Test Location**: Tests in `tests/` directory mirroring `src/` structure
- **Test Naming**: `test_<function_name>_<scenario>.ts` or `<module>.test.ts`
- **Coverage**: Minimum 80% coverage, aim for 90%+

### Documentation Requirements

- **Code Documentation**: Inline comments for complex logic, docstrings for all public APIs
- **Architecture Documentation**: Major decisions documented in CLAUDE.md
- **Technical Analysis**: Complex domains (like GF syntax) documented in dedicated files
- **Progress Tracking**: PROJECT_PROGRESS.md maintained for status and next steps
- **README**: Keep up to date with setup, usage, and contribution guidelines

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
- Are tests comprehensive (unit + integration)?
- Is documentation complete and clear?
- Is the solution appropriately simple (no gold-plating)?
- Is UX consistent with existing tools?
- Has code review been completed?

Complexity MUST be justified. If a feature violates a principle (e.g., adds significant
complexity), the justification MUST be documented in the pull request and reviewed.

### Runtime Guidance

For detailed development guidance, workflow specifics, and tool usage, refer to CLAUDE.md.
That file provides practical guidance for working with this codebase, while this
constitution defines the non-negotiable principles that govern the project.

**Version**: 1.8.0 | **Ratified**: 2025-10-14 | **Last Amended**: 2025-10-19
