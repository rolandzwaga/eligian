<!--
Sync Impact Report:
- Version change: 1.1.0 → 1.2.0
- Amendment: Added Principle VIII (Debug Cleanup and Workspace Hygiene)
- Modified principles: None
- Added sections: Principle VIII - Debug Cleanup and Workspace Hygiene (NON-NEGOTIABLE)
- Removed sections: None
- Templates requiring updates: None (new principle is process/hygiene-specific)
- Follow-up TODOs:
  - Review all packages for any remaining debug files
  - Add debug file patterns to .gitignore if not already present
  - Document cleanup checklist in development workflow
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

**Version**: 1.3.0 | **Ratified**: 2025-10-14 | **Last Amended**: 2025-10-15
