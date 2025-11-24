# Implementation Plan: Label File Creation Quick Fix

**Branch**: `039-label-file-creation-quickfix` | **Date**: 2025-11-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/039-label-file-creation-quickfix/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature adds a VS Code quick fix that automatically creates missing labels files when referenced in a labels import statement. When triggered, the quick fix:
1. Detects that a labels import references a non-existent file
2. Checks if a languages block exists in the Eligian file
3. Creates the file with either an empty array `[]` (no languages block) or a template entry with all language codes (languages block present)
4. Automatically opens the newly created file in the custom label editor

Technical approach: Extend the existing code actions system (`eligian-code-actions.ts`) with a new provider that detects missing labels file diagnostics and offers a fix. Reuse existing path normalization logic from the asset loading module. Integrate with VS Code's file system API for file/directory creation and the label editor command for opening files.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js ≥20.10.0)
**Primary Dependencies**:
- Langium 4.0.3 (LSP framework, code actions)
- vscode-languageserver 9.0.1 (LSP server protocol)
- VS Code API (file system operations, editor commands)

**Storage**: File system (creating JSON files, creating directories)
**Testing**: Vitest 3.2.4 with test-helpers.ts utilities
**Target Platform**: VS Code Extension (Language Server)
**Project Type**: VS Code Language Extension (monorepo package: `@eligian/language`)
**Performance Goals**:
- Quick fix offered within 1 second of opening file with missing labels import
- File creation completes in <3 seconds (per SC-001)
- Label editor opens within 500ms of file creation

**Constraints**:
- Must reuse existing path normalization logic from asset-loading module (consistency requirement)
- Quick fix must only be available when labels file doesn't exist (not for invalid JSON)
- Must handle both relative and absolute paths
- Must create intermediate directories if they don't exist

**Scale/Scope**:
- Single quick fix provider (extends existing code actions system)
- Supports up to 50 language codes in template generation (per spec edge cases)
- Handles paths up to 10 levels deep (per SC-006)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | How Compliance is Ensured |
|-----------|----------|---------------------------|
| **I. Simplicity First** | ✅ Yes | Quick fix logic is straightforward: detect missing file → check languages block → create file with appropriate content → open editor. No premature optimization. |
| **II. Comprehensive Testing** | ✅ Yes | Unit tests for: file creation logic, template generation, path normalization. Integration tests for: full quick fix workflow, languages block detection, editor opening. |
| **III. Type Safety with Effect** | ⚠️ Partial | File I/O operations in extension context (not language package). VS Code API uses Promises, not Effect. Language server code uses Effect where applicable. |
| **IV. Clear Error Messages** | ✅ Yes | Error messages for: invalid paths, permission denied, file system errors. All include actionable suggestions. |
| **V. TDD** | ✅ Yes | Write tests first: (1) missing file detection, (2) template generation with/without languages, (3) path resolution, (4) directory creation, (5) editor opening. |
| **VIII. Package Manager** | ✅ Yes | All commands use `pnpm` exclusively. No npm/yarn usage. |
| **XI. Code Quality** | ✅ Yes | Run `pnpm run check` after implementation. Zero lint errors before commit. |
| **XIV. Windows Paths** | ✅ Yes | Use backslashes for file paths in tool calls (Edit, Glob, Grep, Read). Expand tilde to full path. |
| **XXIII. vitest-mcp Tools** | ✅ Yes | Use `mcp__vitest__run_tests` for test execution. Use `mcp__vitest__analyze_coverage` for coverage analysis. |
| **XXIV. Test Helpers** | ✅ Yes | Use `createTestContext()` from test-helpers.ts. Use `DiagnosticSeverity` enum. |
| **XXV. Testing Guide** | ✅ Yes | Consult `specs/TESTING_GUIDE.md` before writing tests. Use quick start templates. |

**Gate Result**: ✅ **PASS** - All applicable principles have compliance plans. No violations requiring justification.

**Post-Phase 1 Re-check**: ✅ **PASS** - Design phase complete. All constitution principles remain satisfied:
- Simplicity: File creation logic is straightforward (detect → create → open)
- Testing: Test strategy defined in quickstart.md (unit + integration tests)
- Type Safety: Command arguments use typed interfaces (see data-model.md)
- Error Messages: Error handling documented with specific messages (research.md Q7)
- TDD: Test-first approach confirmed (quickstart.md has test examples before implementation)
- Windows Paths: Acknowledged in constitution check (backslashes in tool calls)
- vitest-mcp: Will use `mcp__vitest__run_tests` for quality gates
- Test Helpers: Will use `createTestContext()` and `DiagnosticSeverity` enum

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/language/src/
├── eligian-code-actions.ts              # MODIFIED: Add createLabelsFile quick fix
├── asset-loading/
│   └── validators/
│       └── label-import-validator.ts    # REFERENCE: Path normalization logic
├── __tests__/
│   ├── label-file-creation/             # NEW: Integration tests
│   │   ├── empty-file-creation.spec.ts
│   │   ├── template-generation.spec.ts
│   │   └── path-resolution.spec.ts
│   └── test-helpers.ts                  # REFERENCE: Use createTestContext()

packages/extension/src/extension/
├── label-file-creator.ts                # NEW: File creation logic (VS Code API)
└── commands/
    └── open-label-editor.ts             # REFERENCE: Existing label editor command
```

**Structure Decision**: This feature primarily extends the language package's code actions system (`eligian-code-actions.ts`) with a new quick fix provider. The actual file creation logic lives in the extension package (`label-file-creator.ts`) because it requires VS Code file system API access. The language package provides the diagnostic detection and quick fix offering, while the extension package handles the file I/O and editor opening.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations** - Constitution check passed without requiring justification.

## Phase Completion Summary

### Phase 0: Research ✅ COMPLETE

**Deliverable**: [research.md](research.md)

**Key Findings**:
- Existing code actions system at `eligian-code-actions.ts` (260 lines)
- Path normalization logic in asset-loading module (`resolveAssetPath()`)
- Languages block parsing from Features 037-038 (AST property: `program.languages`)
- Label editor assumed to exist from previous feature (fallback to default editor)
- VS Code workspace API for file creation (`workspace.fs.createDirectory`, `workspace.fs.writeFile`)
- Error handling strategy: 3 categories (path validation, permissions, file system)

**Research Questions Resolved**: 7/7 (100%)

### Phase 1: Design & Contracts ✅ COMPLETE

**Deliverables**:
- [data-model.md](data-model.md) - 4 core entities defined
- [contracts/](contracts/) - 3 JSON schemas
  - [create-labels-file-command.json](contracts/create-labels-file-command.json)
  - [file-creation-result.json](contracts/file-creation-result.json)
  - [labels-file-template.json](contracts/labels-file-template.json)
- [quickstart.md](quickstart.md) - User guide + developer guide
- Agent context updated (CLAUDE.md)

**Key Design Decisions**:
- **Split Architecture**: Language server (diagnostic + code action) + Extension (file I/O + editor)
- **Reuse Path Logic**: Import `resolveAssetPath()` from asset-loading module
- **Template Structure**: Eligius labels schema (validated by AJV)
- **Error Strategy**: Typed errors with user-friendly messages
- **Testing Strategy**: Unit tests (template generation) + Integration tests (full workflow)

**Constitution Re-check**: ✅ PASS (all principles satisfied)

---

## Next Steps

### Phase 2: Task Generation (NOT DONE BY /speckit.plan)

Run `/speckit.tasks` to generate the task breakdown in [tasks.md](tasks.md).

**Expected Task Categories**:
1. **Validation** (2-3 tasks):
   - Add "missing_labels_file" diagnostic
   - Detect missing labels file during validation
   - Extract languages block data

2. **Code Actions** (3-4 tasks):
   - Extend `EligianCodeActionProvider`
   - Implement template generation logic
   - Add code action for "missing_labels_file"

3. **Extension** (4-5 tasks):
   - Register `eligian.createLabelsFile` command
   - Implement file creation logic (`label-file-creator.ts`)
   - Add directory creation
   - Open file in label editor (with fallback)
   - Error handling and user messages

4. **Testing** (6-8 tasks):
   - Unit tests for template generation
   - Unit tests for path resolution
   - Integration test: empty file creation
   - Integration test: template with languages
   - Integration test: nested directory creation
   - Integration test: error scenarios

5. **Quality** (2 tasks):
   - Run Biome check (`pnpm run check`)
   - Run tests with vitest-mcp

**Estimated Total Tasks**: 17-22 tasks

---

## Ready for Implementation

**Status**: ✅ Planning complete, ready for task generation and implementation

**Branch**: `039-label-file-creation-quickfix`

**Documentation**:
- ✅ Spec: [spec.md](spec.md)
- ✅ Plan: [plan.md](plan.md) (this file)
- ✅ Research: [research.md](research.md)
- ✅ Data Model: [data-model.md](data-model.md)
- ✅ Contracts: [contracts/](contracts/)
- ✅ Quickstart: [quickstart.md](quickstart.md)
- ⏳ Tasks: Run `/speckit.tasks` to generate

**Quality Gates**:
- Constitution check: ✅ PASS
- All research questions resolved: ✅ 7/7
- All design artifacts generated: ✅ Yes
- Agent context updated: ✅ Yes
