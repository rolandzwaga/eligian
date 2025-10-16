# Tasks: Eligius DSL & Compiler

**Organization**: Tasks organized by feature delivery for incremental implementation.

**Archive**: Detailed implementation history in [tasks-archive.md](./tasks-archive.md)

---

## Completed Phases Summary

### Phase 0: Research & Analysis ✅
**Status**: COMPLETE | **Tasks**: R001-R012
**Deliverable**: ELIGIUS_UNDERSTANDING.md with DSL design

### Phase 1: Setup ✅
**Status**: COMPLETE | **Tasks**: T001-T010
**Deliverable**: Monorepo structure, dependencies installed

### Phase 2: Foundational ✅
**Status**: COMPLETE | **Tasks**: T011-T020
**Deliverable**: IR types, Effect services, foundation ready

### Phase 3: Grammar Development ✅
**Status**: COMPLETE | **Tasks**: T021-T035
**Deliverable**: Function-style operation syntax, 44 language tests passing

### Phase 4: Semantic Validation ✅
**Status**: COMPLETE | **Tasks**: T036-T049
**Deliverable**: Timeline/event/action validation, 18 validation tests

### Phase 5: Compiler Pipeline ✅
**Status**: COMPLETE | **Tasks**: T050-T093 + SA001-SA006
**Deliverable**: Full IEngineConfiguration output, 71 compiler tests passing

### Phase 5.5: Operation Registry ✅
**Status**: COMPLETE | **Tasks**: T200-T228
**Deliverable**: 46 operations validated, parameter mapping, 82 operation tests

### Phase 6: Error Reporting ✅
**Status**: COMPLETE | **Tasks**: T094-T102
**Deliverable**: User-friendly errors with hints, 32 tests

### Phase 7: CLI Compiler ✅
**Status**: COMPLETE | **Tasks**: T103-T126
**Deliverable**: Working CLI with all flags, 12 CLI tests

### Phase 8: VS Code Extension ✅
**Status**: COMPLETE | **Tasks**: T127-T158 + T243-T245
**Deliverable**: Syntax highlighting, validation, compile command, hover tooltips, manual testing guide

### Phase 9: Polish ✅
**Status**: COMPLETE | **Tasks**: T159-T168
**Deliverable**: Documentation, examples, CONTRIBUTING.md

### Phase 10: Bug Fixes ✅
**Status**: COMPLETE | **Tasks**: T170-T172
**Fix**: Action invocations use requestAction + startAction/endAction pattern

### Phase 11: Dependency Validation ✅
**Status**: COMPLETE | **Tasks**: T173-T175
**Deliverable**: Compile-time dependency checking, prevents runtime errors

### Phase 11.5: Multi-Type Parameters ✅
**Status**: COMPLETE | **Tasks**: T191-T196
**Deliverable**: Support pipe-delimited types (array|string), 236 tests passing

### Phase 12: Control Flow ✅
**Status**: COMPLETE | **Tasks**: T176-T181
**Deliverable**: if/else (→when/otherwise/endWhen), for loops (→forEach/endForEach), 246 tests

### Phase 13: Variables ✅
**Status**: COMPLETE | **Tasks**: T182-T184
**Deliverable**: Program-level (setData) and action-level (setVariable) constants

### Phase 14: Action Parameters ✅
**Status**: COMPLETE | **Tasks**: T185-T187
**Deliverable**: Parameterized actions via actionOperationData

### Phase 15: Timeline Enhancements ✅
**Status**: COMPLETE | **Tasks**: T188-T190
**Deliverable**: Duration inference, relative times (+5s), sequence syntax, 251 tests

### Phase 16: Syntactic Sugar ✅
**Status**: COMPLETE | **Tasks**: T192 (T191 removed)
**Deliverable**: Stagger syntax for animations, 254 tests

### Phase 16.5: Reference Syntax Redesign ✅
**Status**: COMPLETE | **Tasks**: T229-T239
**Deliverable**: Bare identifiers (params), @@varName (system), @varName (user vars)

### Phase 8.5: Hover Provider (LSP Enhancement) ✅
**Status**: COMPLETE | **Tasks**: T243-T245
**Deliverable**: Rich hover tooltips for operations showing descriptions, parameters, dependencies, and outputs

**Implementation**:
- T243: Created EligianHoverProvider extending AstNodeHoverProvider
- T244: Override getHoverContent to intercept hovers at CST level using CstUtils.findLeafNodeAtOffset
- T245: Integrate with operation registry to show rich markdown documentation

**Key Features**:
- Hover over any operation name to see full documentation
- Shows operation description from metadata
- Lists all parameters with types and required/optional indicators
- Shows dependencies (what operations must come before)
- Shows outputs (what this operation provides)
- Falls back to default Langium behavior for other nodes (variables, comments)

**Files Added**:
- `packages/language/src/eligian-hover-provider.ts`
- `docs/hover-provider.md`

**Current Test Count**: 254 tests passing

---

## Active Development

### Phase 17: Advanced Timeline Features (Not Started)

**Purpose**: Enable advanced timeline patterns

- [ ] T240 [Timeline] Support multiple timelines per program
  - Grammar: Allow multiple `timeline` declarations
  - Transform: Generate multiple ITimeline objects in configuration
  - Validate: Timeline names must be unique

- [ ] T241 [Timeline] Add timeline sync/coordination
  - Allow cross-timeline event references
  - Support timeline groups for synchronized playback

- [ ] T242 [Timeline] Add event groups
  - Group related events for batch control
  - Support group-level start/pause/stop

**Status**: NOT STARTED

---

## Future Phases

### Phase 18: Type System Enhancements

**Purpose**: Stronger type checking and inference

- [ ] Add type annotations for action parameters
- [ ] Infer types from usage
- [ ] Enhanced property chain type checking
- [ ] Type errors for incompatible assignments

**Status**: DEFERRED

### Phase 19: Error Recovery and Diagnostics

**Purpose**: Better error messages and quick fixes

- [ ] LSP quick fixes (auto-import actions, fix typos)
- [ ] Error recovery in parser (continue parsing after errors)
- [ ] More detailed error messages with multiple suggestions

**Status**: DEFERRED

### Phase 20: Code Generation Optimizations

**Purpose**: Performance and output quality

- [ ] Dead code elimination improvements
- [ ] Timeline optimization (merge adjacent events)
- [ ] JSON minification options
- [ ] Source maps for debugging

**Status**: DEFERRED

---

## "For Later" Features

**Loop Control Flow**:
- Break/Continue statements (requires Eligius support)
- Loop variable scoping enhancements

**Advanced Features**:
- Pattern matching for complex conditionals
- Macros/Templates for code generation
- Full type annotations and checking
- Module system (import/export)

**Performance**:
- Incremental compilation
- Watch mode for CLI
- Build caching

---

## Current Status Summary

**Total Tasks Completed**: 195+ tasks
**Total Tests Passing**: 254 tests
**Code Quality**: Biome clean (0 errors, 0 warnings)
**Build Status**: Clean build
**CLI Status**: Fully functional
**Extension Status**: Working with manual testing guide

**Latest Achievements** (Phase 8.5 - Hover Provider):
- Rich hover tooltips for all operations in VS Code
- Shows operation descriptions, parameters, dependencies, and outputs
- Automatically generated from operation registry metadata
- Improved IDE ergonomics - no need to look up documentation separately
- Falls back to default Langium behavior for other node types

**Previous Achievement** (Phase 16.5 - Reference Syntax):
- Bare identifiers for parameters: `items` instead of `$operationdata.items`
- System properties: `@@item` compiles to `$context.currentItem`
- User variables: `@duration` compiles to `$context.variables.duration`
- Loop variable aliasing: `@@item` in `for (item in items)` → `@@currentItem`
- All 254 tests passing, backward compatible

**Ready For**: Next phase implementation or production release preparation

---

## Notes

- Archive file contains detailed implementation history for all completed phases
- Follow constitution: simplicity, testing, functional programming, immutability
- Run `npm run check` (Biome) after each task
- Run `npm run test` to verify all tests pass
- Commit after each logical task group

---

**Generated**: 2025-10-14
**Last Updated**: 2025-10-16 (Added Phase 8.5: Hover Provider)
**Archive Created**: 2025-10-16
