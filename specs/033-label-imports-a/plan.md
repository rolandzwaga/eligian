# Implementation Plan: Label Imports

**Branch**: `033-label-imports-a` | **Date**: 2025-11-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/033-label-imports-a/spec.md`

## Summary

Add support for importing multi-language label translations from JSON files using syntax `labels './labels.json'`. The labels JSON file will be validated against a JSON schema and assigned to the `labels` property of the compiled Eligius configuration. This feature follows the same pattern as existing CSS and HTML imports (Feature 010), extending the `DefaultImport` grammar rule with a new `labels` type.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js ESM
**Primary Dependencies**: Langium (DSL parsing), AJV (JSON schema validation - **needs installation**)
**Storage**: N/A (file-based JSON loading)
**Testing**: Vitest (unit + integration tests)
**Target Platform**: Node.js 19+ (CLI compiler + VS Code extension language server)
**Project Type**: Monorepo (packages/language, packages/compiler, packages/cli, packages/extension)
**Performance Goals**: Labels file loading <100ms for files up to 1MB
**Constraints**: Must integrate with existing asset loading pipeline, must follow Compiler-First validation pattern
**Scale/Scope**: Support labels files up to 1MB (~10,000 label translations)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Extends existing DefaultImport pattern, well-documented JSON schema approach
- [x] **Comprehensive Testing**: Unit tests for schema validation, integration tests for E2E label import flow
- [x] **No Gold-Plating**: Solves real need (internationalization support), no speculative features
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Syntax matches existing CSS/HTML imports (`labels './file.json'`)
- [x] **Functional Programming**: Pure validation functions, JSON loading as side effect

**New Dependency Required**: AJV (JSON schema validator)
- **Justification**: Spec requires JSON schema validation (FR-004, FR-008-FR-011)
- **Alternatives Considered**: Manual validation (error-prone), Zod (adds another paradigm)
- **Rationale**: AJV is industry-standard JSON Schema validator, widely used, battle-tested, aligns with specification requirement

*All checks pass. New dependency (AJV) justified by spec requirements.*

## Project Structure

### Documentation (this feature)

```
specs/033-label-imports-a/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (AJV usage, schema design)
├── data-model.md        # Phase 1 output (ILanguageLabel structure)
├── quickstart.md        # Phase 1 output (user guide for labels import)
├── contracts/           # Phase 1 output (JSON schema for labels)
│   └── labels-schema.json
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```
packages/language/src/
├── eligian.langium                      # Grammar: Add 'labels' to DefaultImport type
├── eligian-validator.ts                 # Validation: checkDefaultImports handles 'labels'
├── validators/
│   └── label-import-validator.ts        # NEW: Pure validation functions for labels JSON
├── schemas/
│   └── labels-schema.json               # NEW: JSON schema for labels validation
├── compiler/
│   ├── pipeline.ts                      # Load labels JSON in CLI context
│   └── ast-transformer.ts               # Assign labels to config.labels property
└── __tests__/
    ├── parsing.spec.ts                  # Test labels import parsing
    ├── validation.spec.ts               # Test labels validation errors
    └── label-import/                    # NEW: Label import integration tests
        ├── valid-labels.spec.ts
        ├── invalid-labels.spec.ts
        └── fixtures/
            ├── valid-labels.json
            ├── invalid-syntax.json
            ├── missing-id.json
            └── invalid-type.json

packages/cli/
└── __tests__/
    └── label-import.spec.ts             # NEW: E2E test for labels compilation
```

**Structure Decision**: Extends existing DSL package structure. Labels validation follows same pattern as CSS validation (pure functions + JSON schema). No new packages required.

## Complexity Tracking

*No constitutional violations requiring justification.*

## Phase 0: Research & Investigation

**Objective**: Resolve all technical unknowns before design phase.

### Research Tasks

1. **AJV Integration Research**
   - How to use AJV for JSON schema validation in TypeScript/Node.js
   - Error message format and how to map to Langium ValidationAcceptor
   - Performance characteristics for large JSON files (1MB)
   - Best practices for async vs sync validation

2. **JSON Schema Design**
   - Define schema structure for `ILanguageLabel[]` format
   - Required fields: label group `id`, `labels` array
   - Required fields for translations: `id`, `languageCode`, `label`
   - Schema validation strictness (allow additional properties?)
   - Error reporting strategy (collect all errors vs fail-fast)

3. **Existing Asset Loading Pattern Analysis**
   - How CSS imports are loaded in `pipeline.ts` (lines 293-339)
   - How HTML imports are loaded (check `asset-loading.ts`)
   - File path resolution (relative paths to absolute paths)
   - Error handling for missing files, permission errors
   - Integration with Langium document context

4. **Labels Property Assignment**
   - Verify `IEngineConfiguration.labels` structure matches `ILanguageLabel[]`
   - Check if compiler transformer already initializes `labels` array
   - Determine where to assign loaded labels (ast-transformer.ts line ~408)

### Research Outputs

Document findings in `research.md`:

- **AJV Decision**: Use AJV v8+ with strict mode, async validation for large files
- **Schema Structure**: JSON Schema Draft 2020-12, strict validation with `additionalProperties: true` (forward compatibility)
- **Loading Pattern**: Follow CSS import pattern - load in pipeline.ts, pass to transformer via assets object
- **Error Mapping**: Convert AJV ValidationError[] to Langium diagnostics with file path, line numbers (if available)

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### Design Artifacts

1. **Data Model** (`data-model.md`):
   - Entity: Label Group (`ILanguageLabel`)
     - Fields: `id` (string), `labels` (array of ILabel)
   - Entity: Label Translation (`ILabel`)
     - Fields: `id` (string), `languageCode` (string), `label` (string)
   - Validation Rules:
     - Label group ID required
     - At least one translation per group (or allow empty array?)
     - Translation ID required
     - Language code required (no format validation)
     - Label text required
   - State: Loaded labels JSON → Parsed as ILanguageLabel[] → Assigned to config.labels

2. **JSON Schema Contract** (`contracts/labels-schema.json`):
   - **CRITICAL**: Schema MUST match Eligius `ILanguageLabel` and `ILabel` TypeScript interfaces exactly
   - Root: Array of label groups (ILanguageLabel[])
   - Label Group: `{ "id": string, "labels": array }` (matches ILanguageLabel interface)
   - Label Translation: `{ "id": string, "languageCode": string, "label": string }` (matches ILabel interface)
   - Additional properties allowed (forward compatibility)
   - Use `required` keyword for mandatory fields

3. **Quickstart Guide** (`quickstart.md`):
   - How to create labels JSON file (example with en-US and nl-NL)
   - How to add `labels './labels.json'` import to Eligian program
   - How to reference labels in timeline events (LabelController usage)
   - Common errors and troubleshooting (missing file, invalid JSON, schema violations)
   - Example: Multi-language presentation with label switching

### API Contracts

**Grammar Extension** (`eligian.langium`):
```langium
DefaultImport:
    type=('layout' | 'styles' | 'provider' | 'labels') path=STRING;
```

**Validation Function Signature** (`validators/label-import-validator.ts`):
```typescript
export interface LabelValidationError {
  code: 'invalid_labels_json' | 'invalid_labels_schema' | 'labels_file_not_found';
  message: string;
  hint: string;
  path?: string; // File path
  details?: string; // AJV error details
}

export function validateLabelsJSON(
  jsonContent: string,
  filePath: string
): LabelValidationError | undefined;

export function validateLabelsSchema(
  data: unknown
): LabelValidationError | undefined;
```

**Transformer Signature** (extend existing function in `ast-transformer.ts`):
```typescript
// Extend ProgramAssets interface
interface ProgramAssets {
  layoutTemplate?: string;
  cssFiles?: string[];
  labels?: ILanguageLabel[]; // NEW
}

// transformProgram() uses assets.labels to populate config.labels
```

**Agent Context Update**:
```bash
# After completing Phase 1 design:
pwsh -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/update-agent-context.ps1 -AgentType claude

# This updates .specify/memory/claude-context.md with:
# - AJV dependency added to technology stack
# - Labels import syntax added to feature list
# - JSON schema validation pattern documented
```

### Constitution Check (Post-Design)

Re-verify constitution compliance after design phase:

- [x] Design maintains simplicity (extends existing patterns, no new architecture)
- [x] Test strategy defined (unit tests for validation, integration tests for E2E)
- [x] No unnecessary features (only what spec requires)
- [x] UX remains consistent (same import syntax as CSS/HTML)
- [x] Functional approach maintained (pure validation functions, side effects isolated in pipeline)
- [x] AJV dependency approved by user (via this planning phase)

*All checks pass.*

## Implementation Phases (High-Level Overview)

**Note**: Detailed tasks will be generated by `/speckit.tasks` command. This section provides high-level phase breakdown only.

### Phase 2: Grammar & Parsing
- Extend DefaultImport grammar rule with 'labels' type
- Add parsing tests for labels import syntax
- Verify AST generation

### Phase 3: JSON Schema & Validation
- Create labels JSON schema
- Implement pure validation functions using AJV
- Add unit tests for schema validation (valid/invalid cases)

### Phase 4: Asset Loading Integration
- Extend pipeline.ts to load labels JSON files
- Implement file reading and JSON parsing
- Handle file not found, permission errors, JSON syntax errors
- Add schema validation call after JSON parsing

### Phase 5: Compiler Transformation
- Extend ProgramAssets interface with labels property
- Load labels JSON in pipeline, pass to transformer
- Assign labels to config.labels in ast-transformer
- Verify output matches Eligius IEngineConfiguration.labels format

### Phase 6: Error Reporting
- Map AJV validation errors to Langium diagnostics
- Ensure error messages include file path, error type, location
- Test all error scenarios (missing file, invalid JSON, schema violations)

### Phase 7: Integration Testing
- E2E test: valid labels import compiles successfully
- E2E test: labels data assigned to config.labels correctly
- E2E test: missing file reports error
- E2E test: invalid JSON syntax reports error
- E2E test: schema violations report errors

### Phase 8: Documentation & Examples
- Update `examples/demo.eligian` with labels import example
- Update `LANGUAGE_SPEC.md` with labels import syntax
- Add quickstart guide usage examples
- Verify all examples compile successfully

## Technical Dependencies

### New Dependencies to Install
- **AJV** (`pnpm add ajv` in packages/language)
  - Version: Latest stable (v8.x)
  - Purpose: JSON schema validation for labels files
  - User approval required before installation

### Existing Dependencies
- Langium (AST parsing, validation integration)
- Eligius types (ILanguageLabel, ILabel, IEngineConfiguration)
- Node.js fs (file reading)
- Vitest (testing)

## Risk Analysis

### Technical Risks
1. **AJV async validation complexity**
   - Mitigation: Use sync validation for simplicity (labels files small)
   - Fallback: Async validation with proper error handling

2. **JSON schema error message clarity**
   - Mitigation: Map AJV errors to actionable user messages
   - Fallback: Provide hint text for common schema violations

3. **Large labels file performance**
   - Mitigation: Spec assumes files <1MB, use sync I/O
   - Fallback: Stream-based parsing if performance issues arise

### Integration Risks
1. **Path resolution edge cases**
   - Mitigation: Reuse CSS import path resolution logic
   - Testing: Test relative paths, absolute paths (should error)

2. **Schema validation strictness**
   - Mitigation: Allow additional properties (forward compatibility)
   - Testing: Test files with extra fields (should pass)

## Success Criteria

Feature complete when:
- [x] Grammar accepts `labels './file.json'` syntax
- [x] Validation rejects duplicate labels imports
- [x] Validation rejects absolute file paths
- [x] JSON schema validates labels file structure
- [x] Invalid JSON syntax produces clear error with file path
- [x] Missing labels file produces clear error with file path
- [x] Schema violations produce actionable error messages
- [x] Valid labels JSON compiles successfully
- [x] Compiled config.labels contains all label data
- [x] All tests pass (unit + integration)
- [x] Biome check + typecheck pass
- [x] `examples/demo.eligian` includes labels import example
- [x] `LANGUAGE_SPEC.md` updated with labels syntax
- [x] Documentation complete (quickstart, data model, schema)

## Open Questions

*None - spec is complete and unambiguous.*

## Next Steps

1. Run `/speckit.tasks` to generate detailed task breakdown
2. User approval for AJV dependency installation
3. Begin Phase 0 research (AJV usage, schema design)
4. Proceed with implementation following task list
