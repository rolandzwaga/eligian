# Tasks: Label File Creation Quick Fix

**Feature**: 039-label-file-creation-quickfix
**Branch**: `039-label-file-creation-quickfix`
**Date**: 2025-11-24

## Overview

This document breaks down the implementation of the label file creation quick fix feature into discrete, executable tasks organized by user story priority. Each user story represents an independently testable increment of functionality.

**User Stories**:
- **US1 (P1)**: Create Empty Labels File - MVP functionality
- **US2 (P2)**: Create Labels File with Language Template - Enhanced value
- **US3 (P3)**: Smart Path Resolution and Validation - Robustness

**Implementation Strategy**: Deliver incrementally by user story. US1 provides core MVP. US2 and US3 add enhancements but are independently deployable.

---

## Phase 1: Setup & Prerequisites

**Goal**: Establish project structure and type definitions required for all user stories.

**Tasks**:

- [X] T001 Create type definitions file at packages/language/src/types/code-actions.ts with interfaces: CreateLabelsFileCommand, LabelsFileTemplate, MissingLabelsFileData, FileErrorCode, FileCreationError, FileCreationResult (see data-model.md)
- [X] T002 Add diagnostic code constant 'missing_labels_file' to packages/language/src/eligian-validator.ts (define as exported constant)

**Estimated Time**: 30 minutes
**Blocker**: Must complete before any user story implementation

---

## Phase 2: User Story 1 - Create Empty Labels File (P1 - MVP)

**Story Goal**: Enable developers to create empty labels files (`[]`) via quick fix when no languages block exists.

**Independent Test Criteria**:
1. Eligian file with labels import (non-existent file) + no languages block
2. Trigger quick fix
3. Verify: file created with `[]` content
4. Verify: file opens (fallback to default editor acceptable for MVP)

**Testing Note**: Before implementing test tasks (T012-T014), consult `specs/TESTING_GUIDE.md` for quick start templates, setup patterns (createTestContext, setupCSSRegistry), and common mistakes to avoid (per Constitution Principle XXV).

### Validation & Diagnostic

- [X] T003 [US1] Modify checkLabelsImports() in packages/language/src/eligian-validator.ts to detect missing labels files and create diagnostic with code 'missing_labels_file' and data containing: importPath, resolvedPath, hasLanguagesBlock=false, languageCodes=[]
- [X] T004 [US1] Import resolveAssetPath() from packages/language/src/asset-loading/compiler-integration.ts into validator to normalize labels import path to absolute path

### Code Action Provider

- [X] T005 [US1] Extend getCodeActions() in packages/language/src/eligian-code-actions.ts to detect 'missing_labels_file' diagnostic and call createLabelsFileAction()
- [X] T006 [US1] Implement createLabelsFileAction() method in EligianCodeActionProvider that returns CodeAction with title "Create labels file", kind QuickFix, and command 'eligian.createLabelsFile' with arguments {filePath, content='[]', documentUri}

### Extension Integration

- [X] T007 [US1] Create packages/extension/src/extension/label-file-creator.ts with exported async function createLabelsFile(args: CreateLabelsFileCommand): Promise<FileCreationResult>
- [X] T008 [US1] Implement file creation logic in label-file-creator.ts: use vscode.workspace.fs.writeFile() to write content to filePath
- [X] T009 [US1] Implement directory creation in label-file-creator.ts: use vscode.workspace.fs.createDirectory() on parent directory path before writeFile()
- [X] T010 [US1] Implement editor opening in label-file-creator.ts: try vscode.commands.executeCommand('eligian.openLabelEditor', fileUri), fallback to vscode.window.showTextDocument(fileUri) if command fails
- [X] T011 [US1] Register command handler in packages/extension/src/extension/main.ts: vscode.commands.registerCommand('eligian.createLabelsFile', async (args) => await createLabelsFile(args)) and add to context.subscriptions

### Testing (US1)

- [X] T012 [P] [US1] Create packages/language/src/__tests__/label-file-creation/empty-file-creation.spec.ts with test: "should offer quick fix for missing labels file without languages block" (verify diagnostic code, code action title)
- [X] T013 [P] [US1] Add test to empty-file-creation.spec.ts: "should create file with empty array content" (mock file creation, verify content = '[]')
- [X] T014 [P] [US1] Add test to empty-file-creation.spec.ts: "should create nested directories for relative paths" (test path like './labels/app.json', verify directory creation called)

### Quality Gate (US1)

- [X] T015 [US1] Run pnpm run build and fix any TypeScript compilation errors
- [X] T016 [US1] Run pnpm run check (Biome) and fix all linting/formatting issues
- [X] T017 [US1] Run vitest-mcp tests: mcp__vitest__set_project_root, then mcp__vitest__run_tests with target packages/language/src/__tests__/label-file-creation/, verify all US1 tests pass

**US1 Deliverable**: Quick fix creates empty labels files and opens them. MVP complete and independently deployable.

---

## Phase 3: User Story 2 - Create Labels File with Language Template (P2)

**Story Goal**: Generate template entries with all language codes when languages block exists.

**Independent Test Criteria**:
1. Eligian file with labels import (non-existent file) + languages block (2+ languages)
2. Trigger quick fix
3. Verify: file created with example entry containing ALL language codes
4. Verify: each language has placeholder text

**Dependencies**: Requires US1 complete (diagnostic, code action, file creation infrastructure)

**Testing Note**: Before implementing test tasks (T022-T025), consult `specs/TESTING_GUIDE.md` for test helper patterns and avoid common mistakes (per Constitution Principle XXV).

### Template Generation

- [X] T018 [US2] Add method generateLabelsFileContent(hasLanguagesBlock: boolean, languageCodes: string[]): string to packages/language/src/eligian-code-actions.ts that returns '[]' if no languages, else JSON.stringify([{id: 'example.label', ...languageCodes}], null, 2)
- [X] T019 [US2] Implement getLanguageName(code: string): string helper in eligian-code-actions.ts that maps common codes (en-US → "Example EN", nl-NL → "Voorbeeld NL", fr-FR → "Exemple FR", de-DE → "Beispiel DE") and falls back to "Example {code}" for unknown codes
- [X] T020 [US2] Modify checkLabelsImports() in packages/language/src/eligian-validator.ts to extract languageCodes from program.languages?.languages.map(l => l.code) and set hasLanguagesBlock=true in diagnostic data when languages exist

### Code Action Update

- [X] T021 [US2] Modify createLabelsFileAction() in packages/language/src/eligian-code-actions.ts to call generateLabelsFileContent(data.hasLanguagesBlock, data.languageCodes) instead of hardcoding '[]'

### Testing (US2)

- [X] T022 [P] [US2] Create packages/language/src/__tests__/label-file-creation/template-generation.spec.ts with test: "should generate empty array when no languages block" (verify generateLabelsFileContent(false, []) returns '[]')
- [X] T023 [P] [US2] Add test to template-generation.spec.ts: "should generate template with 2 language codes" (verify parsed JSON has id + 2 language properties)
- [X] T024 [P] [US2] Add test to template-generation.spec.ts: "should generate template with 50 language codes" (verify all 50 codes present in template)
- [X] T025 [P] [US2] Add test to template-generation.spec.ts: "should use appropriate placeholder text for each language" (verify en-US → "Example EN", nl-NL → "Voorbeeld NL")

### Quality Gate (US2)

- [X] T026 [US2] Run pnpm run build and fix any TypeScript compilation errors
- [X] T027 [US2] Run pnpm run check (Biome) and fix all linting/formatting issues
- [X] T028 [US2] Run vitest-mcp tests with target packages/language/src/__tests__/label-file-creation/template-generation.spec.ts, verify all US2 tests pass

**US2 Deliverable**: Quick fix generates smart templates with language codes. Independently deployable enhancement to US1.

---

## Phase 4: User Story 3 - Smart Path Resolution and Validation (P3)

**Story Goal**: Handle edge cases (absolute paths, deeply nested paths, invalid characters, error messages).

**Independent Test Criteria**:
1. Test absolute path labels import → verify created at exact location
2. Test deeply nested relative path (10 levels) → verify all directories created
3. Test invalid path (e.g., `<invalid>`) → verify error message shown

**Dependencies**: Requires US1 complete (file creation infrastructure)

**Testing Note**: Before implementing test tasks (T034-T038), consult `specs/TESTING_GUIDE.md` for test helper patterns and avoid common mistakes (per Constitution Principle XXV).

### Error Handling

- [X] T029 [US3] Add mapErrorCode(error: any): FileErrorCode function to packages/extension/src/extension/label-file-creator.ts that maps error.code: EACCES/EPERM → PermissionDenied, EINVAL → InvalidPath, else → FileSystemError
- [X] T030 [US3] Wrap file creation logic in try/catch in label-file-creator.ts and return FileCreationResult with success=false, error details, and editorOpened=false on failure
- [X] T031 [US3] Add error message display using vscode.window.showErrorMessage() in label-file-creator.ts catch block with specific messages per FileErrorCode

### Path Validation

- [X] T032 [US3] Add validatePath(filePath: string): {valid: boolean, reason?: string} function to packages/extension/src/extension/label-file-creator.ts that checks: has .json extension, length ≤ 260, no invalid chars (<>:"|?*), no trailing spaces/dots
- [X] T033 [US3] Call validatePath() before file creation in createLabelsFile() and return early with InvalidPath error if validation fails

### Testing (US3)

- [X] T034 [P] [US3] Create packages/language/src/__tests__/label-file-creation/path-resolution.spec.ts with test: "should handle absolute paths correctly" (verify diagnostic data.resolvedPath equals absolute path for C:\\absolute\\path.json input)
- [X] T035 [P] [US3] Add test to path-resolution.spec.ts: "should handle relative paths correctly" (verify ./labels/app.json resolved to workspace-relative absolute path)
- [X] T036 [P] [US3] Add test to path-resolution.spec.ts: "should create deeply nested directories" (verify directory creation for path with 10 levels like ./a/b/c/d/e/f/g/h/i/j/file.json)
- [X] T037 [P] [US3] Add test to path-resolution.spec.ts: "should reject paths with invalid characters" (verify validatePath returns valid=false for path with < > : " | ? *)
- [X] T038 [P] [US3] Add test to path-resolution.spec.ts: "should show error message for permission denied" (mock EACCES error, verify showErrorMessage called with 'Permission denied')

### Quality Gate (US3)

- [X] T039 [US3] Run pnpm run build and fix any TypeScript compilation errors
- [X] T040 [US3] Run pnpm run check (Biome) and fix all linting/formatting issues
- [X] T041 [US3] Run vitest-mcp tests with target packages/language/src/__tests__/label-file-creation/path-resolution.spec.ts, verify all US3 tests pass

**US3 Deliverable**: Robust error handling and path validation. Independently deployable enhancement to US1+US2.

---

## Phase 5: Polish & Integration

**Goal**: Final testing, documentation, and quality assurance across all user stories.

### Integration Testing

- [ ] T042 [P] Run full integration test: create .eligian file with missing labels import (no languages), trigger quick fix, verify file created with [] and opens
- [ ] T043 [P] Run full integration test: create .eligian file with missing labels import + languages block (nl-NL, en-US), trigger quick fix, verify file created with template containing both languages
- [ ] T044 [P] Run full integration test: test nested path ./data/localization/labels.json, verify all intermediate directories created

### Final Quality Gates

- [ ] T045 Run vitest-mcp coverage analysis: mcp__vitest__analyze_coverage with target packages/language/src/eligian-code-actions.ts, verify ≥80% coverage
- [ ] T046 Run vitest-mcp coverage analysis: mcp__vitest__analyze_coverage with target packages/extension/src/extension/label-file-creator.ts, verify ≥80% coverage
- [X] T047 Run pnpm run build on entire workspace, verify zero TypeScript errors
- [X] T048 Run pnpm run check on entire workspace, verify zero Biome errors

### Documentation

- [ ] T049 Update packages/extension/README.md with section documenting eligian.createLabelsFile command and its usage
- [ ] T050 Add example .eligian files to examples/ directory demonstrating: (1) labels import without languages, (2) labels import with languages

---

## Task Summary

**Total Tasks**: 50

**By Phase**:
- Phase 1 (Setup): 2 tasks
- Phase 2 (US1 - MVP): 15 tasks (3 validation, 2 code actions, 5 extension, 3 tests, 2 quality)
- Phase 3 (US2 - Templates): 11 tasks (3 template logic, 1 code action, 4 tests, 3 quality)
- Phase 4 (US3 - Path Handling): 13 tasks (3 error handling, 2 validation, 5 tests, 3 quality)
- Phase 5 (Polish): 9 tasks (3 integration tests, 4 quality gates, 2 documentation)

**By User Story**:
- US1 (P1): 15 tasks - MVP, independently deployable
- US2 (P2): 11 tasks - Enhancement, depends on US1
- US3 (P3): 13 tasks - Robustness, depends on US1
- Cross-cutting: 11 tasks (setup + polish)

**Parallel Opportunities**:
- Phase 1: Tasks T001-T002 can run in parallel (different files)
- Phase 2 (US1): Tasks T012-T014 (tests) can run in parallel after T001-T011 complete
- Phase 3 (US2): Tasks T022-T025 (tests) can run in parallel after T018-T021 complete
- Phase 4 (US3): Tasks T034-T038 (tests) can run in parallel after T029-T033 complete
- Phase 5: Tasks T042-T044 (integration tests) can run in parallel, T045-T046 (coverage) can run in parallel

---

## Dependencies & Execution Order

### Story-Level Dependencies

```
Setup (Phase 1)
    ↓
US1 (Phase 2) ← MVP, no dependencies on other stories
    ↓
    ├→ US2 (Phase 3) ← depends on US1 (diagnostic infrastructure)
    └→ US3 (Phase 4) ← depends on US1 (file creation infrastructure)
    ↓
Polish (Phase 5) ← depends on all stories complete
```

### Within-Phase Dependencies

**Phase 2 (US1)**:
1. T003-T004 (validation) must complete first
2. T005-T006 (code actions) depend on T001-T002 (types)
3. T007-T011 (extension) depend on T001 (types)
4. T012-T014 (tests) depend on T003-T011 (implementation)
5. T015-T017 (quality) must run last

**Phase 3 (US2)**:
1. T018-T020 (template logic) can run in any order
2. T021 (code action update) depends on T018
3. T022-T025 (tests) depend on T018-T021
4. T026-T028 (quality) must run last

**Phase 4 (US3)**:
1. T029-T031 (error handling) can run in any order
2. T032-T033 (path validation) can run in any order
3. T034-T038 (tests) depend on T029-T033
4. T039-T041 (quality) must run last

---

## Implementation Strategy

### MVP First (US1 Only)

**Recommended Approach**: Implement US1 (Phase 2) completely and deploy. This provides immediate value:
- Developers can create empty labels files via quick fix
- File creation and editor opening infrastructure in place
- Tests validate core functionality

**Tasks for MVP**: T001-T017 (19 tasks, ~4-6 hours)

### Incremental Delivery

After MVP deployment:
1. **Add US2** (template generation): T018-T028 (11 tasks, ~2-3 hours)
   - Enhances user experience without changing MVP behavior
   - Independently testable

2. **Add US3** (path validation): T029-T041 (13 tasks, ~3-4 hours)
   - Adds robustness without changing core functionality
   - Independently testable

3. **Polish** (integration + docs): T042-T050 (9 tasks, ~2 hours)

### Testing Strategy

**Per Constitution Principle XXV**: Consult `specs/TESTING_GUIDE.md` before writing tests.

**Test Helpers** (per Constitution Principle XXIV):
- Use `createTestContext()` from `packages/language/src/__tests__/test-helpers.ts` in `beforeAll()`
- Use `DiagnosticSeverity` enum instead of magic numbers
- Use `getErrors()` / `getWarnings()` for filtering diagnostics

**vitest-mcp Usage** (per Constitution Principle XXIII):
- Set project root: `mcp__vitest__set_project_root` with path to repository
- Run tests: `mcp__vitest__run_tests` with target (spec file or directory)
- Analyze coverage: `mcp__vitest__analyze_coverage` with target source files
- NEVER use `pnpm test` in quality gate checks

---

## Ready for Implementation

**Status**: ✅ Task breakdown complete

**Next Steps**:
1. Begin with Phase 1 (Setup): T001-T002
2. Proceed to Phase 2 (US1 - MVP): T003-T017
3. After US1 deployed and validated, continue with US2 and US3

**Quality Checkpoints**:
- After each phase: Run build + Biome check + vitest-mcp tests
- Before merging: Run full integration tests (T042-T044)
- Before release: Run coverage analysis (T045-T046), verify ≥80%
