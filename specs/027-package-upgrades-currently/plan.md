# Implementation Plan: Dependency Package Upgrades

**Branch**: `027-package-upgrades-currently` | **Date**: 2025-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/027-package-upgrades-currently/spec.md`

## Summary

Upgrade three CSS/HTML parsing dependencies to their latest major versions (postcss-selector-parser v6→v7, htmlparser2 v9→v10, css-tree v2→v3) while maintaining 100% test pass rate and existing functionality. This is a maintenance task ensuring the language package stays current with security patches, bug fixes, and performance improvements from upstream libraries.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 20.10.0+ ESM modules
**Primary Dependencies**:
- postcss-selector-parser (v6.1.2 → v7.1.0) - CSS selector parsing
- htmlparser2 (v9.1.0 → v10.0.0) - HTML validation
- css-tree (v2.3.1 → v3.1.0) - CSS parsing (currently unused)
- postcss 8.5.6 (peer dependency, may need update)

**Storage**: N/A (dependency upgrade only)
**Testing**: Vitest with 1,483 existing tests, 81.72% coverage baseline
**Target Platform**: Node.js ESM environment (CLI + VS Code extension)
**Project Type**: Monorepo with pnpm workspaces (packages/language affected)
**Performance Goals**:
- Test suite completes in <60 seconds (current baseline)
- Build time does not increase by >10%
- No runtime performance regression

**Constraints**:
- Must maintain 100% backwards compatibility with existing Eligian DSL features
- All 1,483+ tests must pass without modification (or with minimal fixes for breaking API changes)
- Code coverage must remain ≥81.72%
- Biome checks must pass (0 errors, 0 warnings)
- TypeScript compilation must succeed
- Cannot introduce new security vulnerabilities

**Scale/Scope**:
- 3 package upgrades across major versions
- 3 source files potentially affected (css-parser.ts, selector-parser.ts, html-validator.ts)
- 130+ CSS-related tests, smaller number of HTML tests
- Single feature branch, no API surface changes for end users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Straightforward dependency upgrades with minimal code changes expected. Document any breaking API changes encountered.
- [x] **Comprehensive Testing**: All existing tests verify functionality. No new tests needed unless breaking changes require adapters.
- [x] **No Gold-Plating**: This solves real maintenance needs (security patches, bug fixes, staying current). No speculative features.
- [x] **Code Review**: Standard PR process applies after all tests pass.
- [x] **UX Consistency**: No user-facing changes expected. CSS/HTML validation behavior remains identical.
- [x] **Functional Programming**: Existing code already follows functional patterns. No architectural changes needed.
- [x] **Test-First Development**: Exception approved for dependency upgrades. Rationale: No new functionality added - existing 1,483 tests verify behavior remains unchanged. These tests were written first (before original implementation) and still enforce correctness. Conditional tasks (T009-T011, T018-T019) handle refactoring IF breaking changes found.
- [x] **Dependency Management**: User approved this upgrade request explicitly. No NEW dependencies added.
- [x] **Biome + TypeCheck**: Required after any code refactoring for breaking changes.

*No constitutional violations expected. If breaking API changes require significant refactoring, reassess simplicity principle.*

## Project Structure

### Documentation (this feature)

```
specs/027-package-upgrades-currently/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Breaking changes analysis (COMPLETED)
├── quickstart.md        # Phase 1: Upgrade procedure guide (COMPLETED)
└── checklists/
    └── requirements.md  # Spec quality checklist (COMPLETED)
```

### Source Code (repository root)

```
packages/language/
├── package.json                          # MODIFIED: Update dependency versions
├── src/
│   ├── css/
│   │   ├── css-parser.ts                 # MAY NEED MODIFICATION (postcss-selector-parser usage)
│   │   └── selector-parser.ts            # MAY NEED MODIFICATION (postcss-selector-parser usage)
│   └── asset-loading/
│       └── html-validator.ts             # MAY NEED MODIFICATION (htmlparser2 usage)
└── __tests__/
    ├── css/
    │   ├── css-parser.spec.ts            # VERIFY: 44 tests pass
    │   └── selector-parser.spec.ts       # VERIFY: 42 tests pass
    └── asset-loading/
        └── html-validator.spec.ts        # VERIFY: tests pass

pnpm-lock.yaml                            # MODIFIED: Dependency resolution updates
```

**Structure Decision**: This is a focused maintenance task affecting only `packages/language`. No architectural changes, no new files beyond documentation. The monorepo structure with pnpm workspaces is already established.

## Complexity Tracking

*No constitutional violations expected. Section left empty unless breaking API changes require justification during implementation.*

## Phase 0: Outline & Research

**Objective**: Investigate breaking changes in each package's major version upgrade to determine if code refactoring is needed.

### Research Tasks

1. **postcss-selector-parser v6 → v7 Breaking Changes**
   - Query Context7 for postcss-selector-parser migration guide
   - Review changelog: https://github.com/postcss/postcss-selector-parser/blob/main/CHANGELOG.md
   - Identify API changes affecting:
     - `selectorParser()` constructor/processor API
     - `walkClasses()` and `walkIds()` methods
     - Error handling and message formats
   - Document findings in research.md

2. **htmlparser2 v9 → v10 Breaking Changes**
   - Query Context7 for htmlparser2 migration guide
   - Review changelog: https://github.com/fb55/htmlparser2/blob/master/CHANGELOG.md
   - Identify API changes affecting:
     - `Parser` constructor signature
     - Error callback format and parameters
     - Event handler interfaces
   - Document findings in research.md

3. **css-tree v2 → v3 Breaking Changes**
   - Query Context7 for css-tree migration guide
   - Review changelog: https://github.com/csstree/csstree/blob/master/CHANGELOG.md
   - Note: Package currently unused in codebase, but verify no transitive dependencies
   - Check if @types/css-tree needs update
   - Document findings in research.md

4. **Peer Dependency Analysis**
   - Check if postcss needs upgrade (currently 8.5.6)
   - Check if domhandler/domutils need updates (used with htmlparser2)
   - Verify pnpm can resolve all peer dependencies
   - Document requirements in research.md

### Research Output: `research.md`

**Structure**:
```markdown
# Dependency Upgrade Research

## postcss-selector-parser v6.1.2 → v7.1.0
- **Breaking Changes**: [list changes]
- **Code Impact**: [which files affected]
- **Migration Required**: [yes/no + details]

## htmlparser2 v9.1.0 → v10.0.0
- **Breaking Changes**: [list changes]
- **Code Impact**: [which files affected]
- **Migration Required**: [yes/no + details]

## css-tree v2.3.1 → v3.1.0
- **Breaking Changes**: [list changes]
- **Code Impact**: [none - unused]
- **Type Definitions**: [@types/css-tree update needed?]

## Peer Dependencies
- **postcss**: [version requirement]
- **domhandler/domutils**: [version requirements]
- **Resolution**: [pnpm can resolve all]

## Decision: Upgrade Strategy
[Sequential vs parallel, which order, expected effort]
```

## Phase 1: Design & Contracts

**Objective**: Define the upgrade procedure and expected code changes based on research findings.

### Phase 1 Outputs

#### 1. `quickstart.md` - Upgrade Procedure Guide

**Purpose**: Step-by-step guide for performing the upgrades and verifying success.

**Structure**:
```markdown
# Dependency Upgrade Quickstart

## Prerequisites
- Feature branch checked out: `027-package-upgrades-currently`
- All existing tests passing on main branch
- Baseline metrics captured (test time, build time, coverage)

## Upgrade Steps

### Step 1: Update package.json
```json
{
  "dependencies": {
    "postcss-selector-parser": "7.1.0",
    "htmlparser2": "10.0.0",
    "css-tree": "3.1.0"
  },
  "devDependencies": {
    "@types/css-tree": "3.0.0"  // if available
  }
}
```

### Step 2: Install dependencies
```bash
cd packages/language
pnpm install
```

### Step 3: Run tests (expect failures if breaking changes)
```bash
pnpm test
```

### Step 4: Fix breaking changes (if needed)
[Refer to research.md findings]
- Update css-parser.ts if postcss-selector-parser API changed
- Update selector-parser.ts if postcss-selector-parser API changed
- Update html-validator.ts if htmlparser2 API changed

### Step 5: Run code quality checks
```bash
pnpm run check        # Biome format + lint
pnpm run typecheck    # TypeScript type checking
```

### Step 6: Verify test coverage
```bash
pnpm test:coverage
# Verify coverage ≥81.72% baseline
```

### Step 7: Build verification
```bash
pnpm run build
# Verify build succeeds, note build time
```

### Step 8: Full workspace verification
```bash
cd ../..  # Back to repo root
pnpm -w run test     # All workspace tests
pnpm -w run build    # All workspace builds
```

## Success Criteria Checklist
- [ ] All 1,483+ tests pass
- [ ] Coverage ≥81.72%
- [ ] Biome checks pass (0 errors, 0 warnings)
- [ ] TypeScript compiles successfully
- [ ] Build time <10% increase
- [ ] Test time <60 seconds
- [ ] No new security vulnerabilities (pnpm audit)

## Rollback Procedure
If upgrades fail and cannot be fixed:
```bash
git checkout packages/language/package.json
pnpm install
pnpm test  # Verify back to working state
```
```

#### 2. `data-model.md` - N/A for this feature

**Rationale**: Dependency upgrades do not introduce new entities or data models. This section is not applicable.

#### 3. `contracts/` - N/A for this feature

**Rationale**: No API contracts are changing. The DSL surface remains identical for users. Internal library APIs are documented in research.md, not as contracts.

### Agent Context Update

After Phase 1 completion, run:
```bash
.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This updates CLAUDE.md with technology context from this plan (no new technologies in this case, but documents the upgrade).

## Phase 2: Task Generation (via /speckit.tasks)

**Note**: Phase 2 (task generation) is handled by the `/speckit.tasks` command, NOT by `/speckit.plan`. This plan command stops after Phase 1.

Expected task breakdown:
1. **Research Phase**: Analyze breaking changes for all 3 packages
2. **Upgrade postcss-selector-parser**: Update package.json, fix breaking changes, verify tests
3. **Upgrade htmlparser2**: Update package.json, fix breaking changes, verify tests
4. **Upgrade css-tree**: Update package.json, verify no impact (unused)
5. **Integration Testing**: Run full test suite, verify coverage
6. **Code Quality**: Run Biome + TypeCheck, fix issues
7. **Performance Verification**: Measure build/test time, ensure no regression
8. **Documentation**: Update quickstart.md with actual findings, finalize research.md

## Implementation Notes

### Expected Effort
- **If no breaking changes**: 1-2 hours (update package.json, verify tests, done)
- **If minor breaking changes**: 4-6 hours (API adapter updates, test fixes)
- **If major breaking changes**: 8-12 hours (significant refactoring, extensive testing)

### Risk Assessment
- **Low Risk**: css-tree upgrade (unused package)
- **Medium Risk**: htmlparser2 upgrade (simple API, isolated usage in one file)
- **Medium Risk**: postcss-selector-parser upgrade (used in two files, critical for CSS validation)

### Contingency Plan
If breaking changes prove too costly to fix:
1. Document the issue and breaking changes
2. Consult user (Roland) on whether to:
   - Defer upgrade until more stable API
   - Accept technical debt of staying on older version
   - Allocate more time for extensive refactoring
3. Do NOT proceed with partial upgrades (all three or none)

### Success Verification
After all upgrades complete:
```bash
# Run full verification suite
pnpm -w run test:coverage   # All tests + coverage
pnpm -w run check           # Biome
pnpm -w run typecheck       # TypeScript
pnpm -w run build           # Build all packages
pnpm audit                  # Security check

# Capture metrics
- Test count: [should be 1,483+]
- Test time: [should be <60s]
- Build time: [record for comparison]
- Coverage: [should be ≥81.72%]
```

## Constitution Re-Check (After Phase 1)

- [x] **Simplicity**: Upgrade procedure is straightforward. Code changes (if any) are minimal adapters for breaking APIs.
- [x] **Testing**: All existing tests verify functionality. No new tests needed for dependency upgrades.
- [x] **No Gold-Plating**: Upgrades are maintenance-focused, not speculative.
- [x] **UX Consistency**: No user-facing changes.
- [x] **Functional Programming**: No architectural changes.
- [x] **Documentation**: Research.md and quickstart.md provide clear guidance.

*No violations. Ready for task generation via `/speckit.tasks`.*
