# Implementation Plan: Library Files with Action Imports

**Branch**: `023-library-files-with` | **Date**: 2025-11-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-library-files-with/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement library file support for Eligian DSL to enable code reuse through importable actions. Library files use explicit `library` keyword and contain only action definitions (no timelines, constants, or imports). Program files import actions using ES6-style syntax with optional aliasing. Actions support `private` visibility modifier to hide implementation details (public by default). Full IDE integration includes auto-completion, hover docs, and go-to-definition for imported actions.

**Technical Approach**: Extend Langium grammar for library files and import statements, implement custom scope provider to filter private actions from exports, enhance validator to prevent library constraint violations and name collisions, extend compiler transformer to resolve and merge imported actions, integrate with existing IDE providers (completion, hover, definition).

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 20+ (ESM modules)
**Primary Dependencies**: Langium 3.0+ (grammar, parsing, scoping), Existing validation infrastructure, Existing compiler transformer
**Storage**: N/A (all library files are local .eligian files)
**Testing**: Vitest 3.2.4+ with 80% coverage threshold
**Target Platform**: VS Code Extension (Langium language server) + CLI compiler
**Project Type**: Monorepo (packages/language for Langium, packages/compiler for transformation)
**Performance Goals**:
- Library validation: <1s
- IDE features (completion, hover, goto): <500ms
- Compilation with imports: identical to local actions (no overhead)

**Constraints**:
- Must maintain 100% backward compatibility (existing programs without imports continue working)
- Library imports must resolve at validation time (no runtime import errors)
- Imported actions must compile identically to locally-defined actions
- Private actions must be enforced at validation time (cannot be imported)

**Scale/Scope**:
- Support libraries with 10-50 actions (realistic library size)
- Support programs importing from 5-10 library files
- Support nested library paths (../../shared/lib.eligian)
- No circular import detection for MVP (assume developers avoid it)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is clear - extend grammar, add validation, integrate with scoping. Well-documented in spec.
- [x] **Comprehensive Testing**: Unit tests + integration tests planned for all components (grammar parsing, validation, scoping, IDE features)
- [x] **No Gold-Plating**: Solves real, documented need (code duplication across projects). MVP excludes tree-shaking, versioning, package management.
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Import syntax mirrors ES6 modules (familiar to developers), error messages follow existing patterns
- [x] **Functional Programming**: Grammar AST nodes are immutable, validation returns errors (no exceptions), compiler transformer uses existing immutable transformation patterns

**Additional Constitution Principles**:

- [x] **UUID-Based Identifiers**: N/A (no Eligius IDs generated in this feature - library actions use existing action compilation)
- [x] **ESM Import Extensions**: All imports will use .js extensions (packages/language/src/*.ts import with .js)
- [x] **Validation Pattern**: Validation logic will follow compiler-first pattern (pure functions in compiler, thin Langium adapter)
- [x] **Biome Integration**: Will run `pnpm run check` and `pnpm run typecheck` after each task
- [x] **Operation Metadata Consultation**: N/A (no new Eligius operations introduced)
- [x] **Language Specification Maintenance**: Will update LANGUAGE_SPEC.md with library syntax, import syntax, visibility modifiers
- [x] **Research & Documentation Standards**: Will use context7 for Langium scoping patterns, Langium import resolution, Langium cross-file references
- [x] **Dependency Management**: No new dependencies required (uses existing Langium infrastructure)
- [x] **Accessibility Standards**: Error messages will be clear, actionable, screen-reader compatible (WCAG 2.1 AA)

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/023-library-files-with/
├── spec.md              # Feature specification (COMPLETE)
├── checklists/
│   └── requirements.md  # Specification quality checklist (COMPLETE)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Existing Monorepo Structure** (modified for library support):

```
packages/
├── language/                       # Langium grammar and language server
│   ├── src/
│   │   ├── eligian.langium         # [MODIFIED] Add library, private, import grammar rules
│   │   ├── eligian-module.ts       # [POSSIBLY MODIFIED] Register custom services if needed
│   │   ├── eligian-scope.ts        # [MODIFIED] Filter private actions from exports
│   │   ├── eligian-validator.ts    # [MODIFIED] Validate library constraints, imports, name collisions
│   │   ├── eligian-completion-provider.ts  # [MODIFIED] Suggest public actions in imports
│   │   ├── eligian-hover-provider.ts       # [POSSIBLY MODIFIED] Show imported action docs
│   │   ├── name-resolver.ts        # [NEW] Helper to resolve imported actions
│   │   ├── library-utils.ts        # [NEW] Utilities for library file detection
│   │   └── __tests__/
│   │       ├── library-parsing.spec.ts     # [NEW] Test library grammar
│   │       ├── import-parsing.spec.ts      # [NEW] Test import syntax
│   │       ├── library-validation.spec.ts  # [NEW] Test library constraints
│   │       ├── import-validation.spec.ts   # [NEW] Test import validation
│   │       ├── private-actions.spec.ts     # [NEW] Test private visibility
│   │       ├── library-scoping.spec.ts     # [NEW] Test export filtering
│   │       ├── library-completion.spec.ts  # [NEW] Test import completion
│   │       └── library-hover.spec.ts       # [NEW] Test imported action hover
│   └── package.json
│
├── compiler/                       # DSL → Eligius JSON compiler
│   ├── src/
│   │   ├── ast-transformer.ts      # [MODIFIED] Resolve imported actions, merge into AST
│   │   ├── name-resolver.ts        # [POSSIBLY MODIFIED] Resolve action names across imports
│   │   └── __tests__/
│   │       ├── library-compilation.spec.ts  # [NEW] Test import resolution + compilation
│   │       └── library-merging.spec.ts      # [NEW] Test action merging logic
│   └── package.json
│
└── cli/                            # Command-line compiler
    ├── src/
    │   └── main.ts                 # [NO CHANGES] Libraries compile like programs (no special handling)
    └── package.json

examples/
├── libraries/                      # [NEW] Example library files
│   ├── animations.eligian          # [NEW] Animation actions library
│   └── utils.eligian               # [NEW] Utility actions library
└── with-imports.eligian            # [NEW] Example program using imports

LANGUAGE_SPEC.md                    # [MODIFIED] Document library syntax, import syntax, visibility
```

**Structure Decision**: Monorepo structure - Langium grammar, validation, and scoping in `packages/language`, compilation/transformation in `packages/compiler`, no CLI changes needed. All integration tests in respective `__tests__/` directories.

## Complexity Tracking

*No constitution violations - all checks passed.*

## Phase 0: Research & Problem Definition

**Objectives**:
- Research Langium scoping patterns for cross-file references
- Research Langium import resolution and file loading
- Research best practices for filtering exports based on visibility
- Document grammar extension strategy (library vs program disambiguation)
- Document validation strategy (library constraints, import validation)
- Document scoping strategy (private action filtering)
- Document compilation strategy (import resolution, action merging)

**Research Tasks**:

1. **Langium Scoping for Cross-File References**
   - How does Langium handle cross-file references?
   - How to implement custom scope provider to filter exports?
   - How to load referenced files during validation?
   - Use context7 to research Langium scoping documentation

2. **Grammar Disambiguation**
   - How to distinguish library files from program files at parse time?
   - Should `library` and `Program` be separate entry rules or variants?
   - How to ensure library files reject timelines/imports/constants?

3. **Import Resolution Strategy**
   - How to resolve relative paths in import statements?
   - How to load and parse imported library files?
   - How to handle missing library files (validation errors)?
   - How to cache parsed libraries (performance)?

4. **Export Filtering Strategy**
   - How to filter private actions from scope exports?
   - How to implement visibility checking in scope provider?
   - How to provide "Did you mean?" suggestions for private actions?

5. **Compilation Strategy**
   - How to resolve imported actions during AST transformation?
   - How to merge imported action definitions into program AST?
   - How to ensure imported actions compile identically to local actions?
   - How to handle aliased imports during transformation?

**Deliverable**: `research.md` with all findings documented (Decision, Rationale, Alternatives Considered)

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

**Objectives**:
- Design grammar extensions (library keyword, private modifier, import statements)
- Design validation rules (library constraints, import validation, name collision prevention)
- Design scoping rules (export filtering, private action hiding)
- Design compilation strategy (import resolution, action merging)
- Document data model (Library AST node, Import AST node, Action visibility)
- Generate API contracts (if applicable - N/A for DSL features)
- Generate quickstart guide for library creation and usage

**Design Tasks**:

1. **Grammar Design** → `data-model.md`
   - `Library` AST node structure (name, actions)
   - `ImportStatement` AST node structure (actions, path, aliases)
   - `ActionDeclaration` enhancement (optional private modifier)
   - Entry rule modification (EligianFile = Program | Library)

2. **Validation Design** → `data-model.md`
   - Library constraint validation (no timelines, no imports, no constants)
   - Import validation (file exists, actions exist, actions are public)
   - Name collision validation (action conflicts with built-ins or other imports)
   - Visibility validation (private keyword only in libraries)
   - Duplicate action validation (within library, within program)

3. **Scoping Design** → `data-model.md`
   - Custom scope provider to filter private actions
   - Export filtering based on visibility
   - Import resolution for action references
   - Aliased action handling

4. **Compilation Design** → `data-model.md`
   - Import resolution algorithm (load library, extract actions)
   - Action merging strategy (imported actions added to program AST)
   - Aliasing transformation (action references use alias name)
   - Compilation output (imported actions compiled identically to local)

5. **IDE Integration Design** → `data-model.md`
   - Completion provider: suggest public actions in import statements
   - Hover provider: show imported action JSDoc documentation
   - Definition provider: jump to library file on imported action

**Deliverables**:
- `data-model.md`: AST node structures, validation rules, scoping rules, compilation strategy
- `quickstart.md`: Quick reference for creating libraries and importing actions
- `contracts/` directory: N/A (no external API contracts for DSL grammar features)

**Agent Context Update**: Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude` to add:
- Langium scoping patterns
- Import resolution strategy
- Private action visibility handling

## Phase 2: Task Breakdown

**Note**: This phase is executed by `/speckit.tasks`, NOT by `/speckit.plan`. The command stops here.

Tasks will be generated from Phase 0 research and Phase 1 design, organized into logical implementation phases:

1. **Grammar Extension** (3-5 tasks)
   - Add Library grammar rule
   - Add ImportStatement grammar rule
   - Add private modifier to ActionDeclaration
   - Update entry rule to accept Library | Program
   - Test library and import parsing

2. **Validation Implementation** (8-10 tasks)
   - Implement library constraint validation (no timelines, etc.)
   - Implement import validation (file exists, actions exist)
   - Implement private action import prevention
   - Implement name collision detection (built-ins, imports, local actions)
   - Implement visibility modifier validation (libraries only)
   - Implement duplicate action detection
   - Test all validation rules

3. **Scoping Implementation** (4-6 tasks)
   - Implement custom scope provider
   - Implement export filtering for private actions
   - Implement import resolution
   - Implement aliased action scoping
   - Test scoping rules

4. **Compilation Implementation** (4-6 tasks)
   - Implement import resolution in transformer
   - Implement action merging logic
   - Implement aliased action transformation
   - Test compilation with imports
   - Verify identical output for imported vs local actions

5. **IDE Integration** (3-5 tasks)
   - Update completion provider for import suggestions
   - Update hover provider for imported actions
   - Update definition provider for library navigation
   - Test IDE features

6. **Documentation & Examples** (2-3 tasks)
   - Update LANGUAGE_SPEC.md with library syntax
   - Create example library files
   - Create example program with imports
   - Update CLAUDE.md if needed

**Total Estimated Tasks**: 24-35 tasks organized into 6 phases

## Implementation Strategy

### Grammar Extension Strategy

**Approach**: Introduce new grammar rules while maintaining backward compatibility.

1. **Entry Rule Modification**:
   ```langium
   entry EligianFile:
       Program | Library;
   ```
   - Allows parser to accept either program files or library files
   - Disambiguation handled by `library` keyword

2. **Library Grammar Rule**:
   ```langium
   Library:
       'library' name=ID
       (actions+=ActionDeclaration)+;
   ```
   - Explicit `library` keyword makes intent clear
   - Only actions allowed (validation enforces no timelines/imports/constants)

3. **Import Grammar Rule**:
   ```langium
   ImportStatement:
       'import' '{' actions+=ActionImport (',' actions+=ActionImport)* '}' 'from' path=STRING;

   ActionImport:
       name=ID ('as' alias=ID)?;
   ```
   - ES6-style import syntax (familiar to developers)
   - Supports multiple actions and optional aliasing

4. **Private Modifier**:
   ```langium
   ActionDeclaration:
       (visibility='private')?
       ('endable')? 'action' name=ID
       ('(' params+=Parameter (',' params+=Parameter)* ')')?
       body=ActionBody;
   ```
   - Optional `private` keyword before `action`
   - Defaults to public when omitted

### Validation Strategy

**Approach**: Compiler-first validation with Langium adapter (Constitution Principle X).

1. **Library Constraint Validation**:
   - Validator checks Library nodes for disallowed children (timelines, imports, constants)
   - Error code: `'library_invalid_content'`
   - Message: "Library files cannot contain {type}"

2. **Import Validation**:
   - Resolve import path relative to current file
   - Load and parse library file
   - Check each imported action exists in library
   - Check each imported action is public (not private)
   - Error codes: `'import_file_not_found'`, `'import_action_not_found'`, `'import_private_action'`

3. **Name Collision Detection**:
   - Check action names don't conflict with built-in operations (from operation registry)
   - Check imported actions don't conflict with local actions
   - Check imported actions from different libraries don't conflict (unless aliased)
   - Error codes: `'action_conflicts_builtin'`, `'action_conflicts_local'`, `'action_conflicts_import'`

4. **Visibility Validation**:
   - Check `private` keyword only used in Library files (not Program files)
   - Error code: `'private_only_in_library'`
   - Message: "Visibility modifier 'private' can only be used in library files"

### Scoping Strategy

**Approach**: Custom scope provider filters exports based on visibility.

1. **Export Filtering**:
   ```typescript
   export class EligianScopeProvider extends DefaultScopeProvider {
     override getScope(context: ReferenceInfo): Scope {
       if (isActionImport(context.container)) {
         // Load library file
         const library = this.loadLibrary(importPath);

         // Filter out private actions
         const publicActions = library.actions.filter(a => a.visibility !== 'private');

         return this.createScope(publicActions);
       }
       return super.getScope(context);
     }
   }
   ```

2. **Import Resolution**:
   - Resolve import paths using Langium's URI utilities (platform-agnostic)
   - Cache parsed library files for performance
   - Provide clear errors for missing files

3. **Aliased Actions**:
   - When action is imported with alias, scope uses alias name
   - Original name not accessible in importing file

### Compilation Strategy

**Approach**: Resolve imports during AST transformation, merge actions into program AST.

1. **Import Resolution**:
   ```typescript
   function resolveImports(program: Program): ActionDeclaration[] {
     const importedActions: ActionDeclaration[] = [];

     for (const importStmt of program.imports) {
       const library = loadLibrary(importStmt.path);

       for (const actionImport of importStmt.actions) {
         const action = library.actions.find(a => a.name === actionImport.name);

         // If aliased, create new action with alias name
         const resolvedAction = actionImport.alias
           ? { ...action, name: actionImport.alias }
           : action;

         importedActions.push(resolvedAction);
       }
     }

     return importedActions;
   }
   ```

2. **Action Merging**:
   - Imported actions added to program's action list
   - Compilation treats imported actions identically to local actions
   - No special handling needed in transformer (imported actions become part of program AST)

3. **Alias Handling**:
   - When action is imported with alias, create new ActionDeclaration node with alias name
   - Action references use alias name (standard name resolution)

### IDE Integration Strategy

**Approach**: Extend existing providers to support imported actions.

1. **Completion Provider**:
   - When completing import statement, suggest public actions from library
   - Filter private actions from suggestions
   - Show action signature and JSDoc in completion item documentation

2. **Hover Provider**:
   - When hovering over imported action invocation, show JSDoc from library
   - Include library file path in hover content
   - Same formatting as locally-defined actions

3. **Definition Provider**:
   - When navigating to imported action definition, jump to library file
   - Use Langium's cross-file reference resolution

## Testing Strategy

**Approach**: Test-first development (Constitution Principle II) - write failing tests before implementation.

### Unit Tests (packages/language/src/__tests__/)

1. **Grammar Parsing Tests** (`library-parsing.spec.ts`, `import-parsing.spec.ts`):
   - Test library file parsing (valid library, invalid content)
   - Test import statement parsing (single action, multiple actions, aliases)
   - Test private modifier parsing

2. **Validation Tests** (`library-validation.spec.ts`, `import-validation.spec.ts`, `private-actions.spec.ts`):
   - Test library constraint validation (timelines rejected, imports rejected, constants rejected)
   - Test import validation (missing file, missing action, private action)
   - Test name collision detection (built-ins, local actions, imports)
   - Test visibility validation (private only in libraries)

3. **Scoping Tests** (`library-scoping.spec.ts`):
   - Test export filtering (private actions hidden from imports)
   - Test import resolution (actions available in importing file)
   - Test aliased action scoping (alias name used)

4. **IDE Feature Tests** (`library-completion.spec.ts`, `library-hover.spec.ts`):
   - Test completion suggestions (public actions only)
   - Test hover documentation (imported action JSDoc)
   - Test definition navigation (jump to library file)

### Integration Tests (packages/compiler/src/__tests__/)

1. **Compilation Tests** (`library-compilation.spec.ts`, `library-merging.spec.ts`):
   - Test end-to-end compilation with imports
   - Test action merging (imported actions in output)
   - Test aliased action compilation
   - Test identical output for imported vs local actions

### Test Coverage

- Target: 80% coverage for all business logic (per Constitution Principle II)
- Run `pnpm run test:coverage` after implementation
- Verify coverage meets threshold or document exceptions with user approval

### Test Data

- Create example library files in `examples/libraries/`
- Create example program files with imports in `examples/`
- Use realistic action examples (animations, utilities)

## Rollout Plan

### Phase 1: Grammar & Parsing (3-5 days)
- Extend grammar with library, import, private rules
- Implement parsing tests
- Verify backward compatibility (existing programs parse correctly)
- **Commit after completion** (NOT pushed until feature complete)

### Phase 2: Validation (5-7 days)
- Implement library constraint validation
- Implement import validation
- Implement name collision detection
- Implement visibility validation
- Comprehensive validation tests
- **Commit after completion**

### Phase 3: Scoping & Resolution (4-6 days)
- Implement custom scope provider
- Implement export filtering
- Implement import resolution
- Scoping tests
- **Commit after completion**

### Phase 4: Compilation (3-5 days)
- Implement import resolution in transformer
- Implement action merging logic
- Compilation tests
- Verify identical output for imported vs local actions
- **Commit after completion**

### Phase 5: IDE Integration (3-4 days)
- Update completion provider
- Update hover provider
- Update definition provider
- IDE feature tests
- **Commit after completion**

### Phase 6: Documentation & Examples (2-3 days)
- Update LANGUAGE_SPEC.md
- Create example libraries and programs
- Update CLAUDE.md if needed
- Final integration testing
- **Commit after completion**

### Phase 7: Final Review & Merge (1-2 days)
- Run `pnpm run check` and `pnpm run typecheck` across all packages
- Run `pnpm run test:coverage` and verify 80%+ coverage
- Create example programs demonstrating library usage
- Final code review
- **Push to remote and create PR**

**Total Estimated Timeline**: 21-32 days

### Rollout Notes

- **Commit after each phase** (per user directive)
- **DO NOT push until feature complete and reviewed**
- **Maintain backward compatibility** throughout (existing programs without imports must continue working)
- **Run Biome + typecheck after each task** (per Constitution Principle XI)
- **Test-first development** for all components (per Constitution Principle II)

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Langium scoping complexity | High - Export filtering may be difficult | Research Langium scoping patterns early (Phase 0), consult Langium docs via context7, fallback to simpler "all actions exported" if filtering too complex |
| Import resolution errors | High - Missing files or parse errors break validation | Comprehensive error handling, clear error messages with file paths, test with missing/invalid library files |
| Performance with large libraries | Medium - IDE could slow down with 50+ action libraries | Profile during Phase 5, optimize scope provider if needed, consider caching parsed libraries |
| Name collision edge cases | Medium - Complex collision scenarios (aliases, nested imports) | Comprehensive collision detection tests, document all collision scenarios |
| Compilation output changes | High - Imported actions must compile identically | Integration tests comparing imported vs local action output, manual verification of generated JSON |

## Success Criteria

**From Spec**:
- SC-001: Developers can create library files with multiple actions and receive validation feedback in under 1 second
- SC-002: Developers can import actions from library files and use them in timelines without any additional setup or configuration
- SC-003: Imported actions execute identically to locally-defined actions in 100% of scenarios (same compilation output)
- SC-004: IDE auto-completion for library imports displays all public actions from the target library within 500ms
- SC-005: Attempting to import a private action results in a clear validation error shown in the IDE within 1 second
- SC-006: Hover documentation for imported actions displays JSDoc content identically to locally-defined actions
- SC-007: Go-to-definition for imported actions navigates to the library file within 500ms
- SC-008: Library files with syntax errors or constraint violations (e.g., containing timelines) show validation errors within 1 second
- SC-009: Name collision errors (action conflicts with built-in operations or other imports) are detected and reported within 1 second
- SC-010: Developers can refactor private actions in libraries without breaking any importing program files (validation still passes)

**Verification**:
- Manual testing with example library files
- Performance profiling for IDE features
- Integration tests comparing imported vs local action compilation output
- Test coverage reports (80%+ for business logic)

## Notes

- This feature is foundational for future ecosystem of shared libraries
- Private actions enable library evolution without breaking consumers
- ES6-style import syntax leverages developer familiarity
- Explicit `library` keyword allows future metadata expansion (library version, exports configuration, etc.)
- No tree-shaking for MVP (all imported actions included in output) - optimization for future
- No circular import detection for MVP (assume developers avoid circular dependencies)
