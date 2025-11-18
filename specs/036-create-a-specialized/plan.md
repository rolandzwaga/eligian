# Implementation Plan: Label Editor for VSCode Extension

**Branch**: `036-create-a-specialized` | **Date**: 2025-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-create-a-specialized/spec.md`

## Summary

Add a custom webview-based editor for label JSON files that provides a user-friendly GUI for editing multilingual labels without manually editing JSON. Users navigate from `.eligian` label imports using Ctrl+Click or F12 (Definition Provider) to open a split-view editor with label groups (left panel) and translations (right panel). The editor uses `CustomTextEditorProvider` for automatic save/undo/redo, hides translation UUIDs from users, validates input in real-time, and integrates with existing label import validation (Feature 033) and typed label references (Feature 034).

**Technical Approach**: Vanilla HTML + CSS (VSCode theme variables) for simplicity, separate webview bundle (`media/label-editor.ts` → `out/media/label-editor.js`) compiled with esbuild, `CustomTextEditorProvider` for text-based JSON editing, bidirectional messaging pattern following existing preview infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.7+ (ESM with NodeNext module resolution), Node.js 22.11+
**Primary Dependencies**:
- VSCode API 1.106+ (CustomTextEditorProvider, DefinitionProvider, TextDocument)
- Existing: vscode-languageclient 9.0.1, vscode-languageserver 9.0.1
- No new dependencies required (vanilla webview implementation)

**Storage**: JSON files (text-based, UTF-8 encoding)
**Testing**: Vitest 2.1.8 (existing test infrastructure)
**Target Platform**: VSCode extension environment (Node.js for extension, browser for webview)
**Project Type**: VSCode extension (dual runtime: Node.js extension + browser webview)
**Performance Goals**:
- Editor load time < 500ms for 50 label groups (SC-004)
- UI responsiveness < 100ms for 100+ label groups (SC-005)
- Save operations < 1 second for 100 label groups (SC-011)
- Navigation from import to editor < 2 seconds (SC-001)

**Constraints**:
- Must use `CustomTextEditorProvider` (not CustomEditorProvider) for text-based JSON
- Must maintain VSCode theme compatibility (light, dark, high-contrast)
- Must support keyboard-only navigation (WCAG 2.1 AA compliance)
- Must NOT use deprecated Webview UI Toolkit (archived Jan 2025)
- Must reuse existing patterns (PreviewPanel messaging, CSS watcher, compilation service)

**Scale/Scope**:
- Expected: 10-50 label groups per file (typical i18n usage)
- Stress tested: 100+ label groups (remain performant)
- File size: Up to 100KB JSON (typical i18n file)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Yes - Using vanilla HTML (no framework), CustomTextEditorProvider (VSCode handles complexity), documented architecture
- [x] **Comprehensive Testing**: Yes - Unit tests for provider/messaging, integration tests for UI interaction, e2e tests for navigation
- [x] **No Gold-Plating**: Yes - Solves documented need (non-technical users can't edit JSON), no speculative features beyond spec requirements
- [x] **Code Review**: Yes - Standard PR process with constitution compliance verification
- [x] **UX Consistency**: Yes - Consistent with VSCode's native editors (split-view, context menu, keyboard shortcuts), reuses existing command patterns
- [x] **Functional Programming**: Yes - Pure functions for JSON parsing/validation/transformation, Effect-ts for file I/O if needed, immutable external API

- [x] **Technical Overview Consultation** (Principle XXVI): Consulted `specs/TECHNICAL_OVERVIEW.md` during research:
  - Build System (§ Build System): Requires new esbuild bundle for label-editor webview
  - VS Code Extension (§ VS Code Extension): Uses existing extension activation pattern, adds custom editor registration
  - Module Organization: New module `src/extension/label-editor/` for provider and messaging logic
  - Development Workflow: Standard test-first development with Biome + typecheck validation

*No violations - all checks pass.*

## Project Structure

### Documentation (this feature)

```
specs/036-create-a-specialized/
├── spec.md              # Feature specification (COMPLETE)
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0 output (architecture decisions)
├── data-model.md        # Phase 1 output (label file schema, message protocol)
├── quickstart.md        # Phase 1 output (user guide + developer guide)
├── contracts/           # Phase 1 output (message types, validation rules)
│   ├── messages.ts      # Extension ↔ Webview message types
│   └── validation.ts    # Label file validation rules
├── checklists/          # Quality validation
│   └── requirements.md  # Specification quality checklist (COMPLETE)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created yet)
```

### Source Code (repository root)

```
packages/extension/
├── src/extension/
│   ├── main.ts                     # Extension activation (register provider & commands)
│   ├── label-editor/               # NEW: Label editor implementation
│   │   ├── LabelEditorProvider.ts  # CustomTextEditorProvider implementation
│   │   ├── LabelValidation.ts      # JSON schema validation logic
│   │   ├── LabelUsageTracker.ts    # Track which .eligian files use labels
│   │   └── templates/
│   │       └── label-editor.html   # Webview HTML template
│   ├── preview/                    # Existing preview infrastructure (REFERENCE)
│   │   ├── PreviewPanel.ts         # Pattern for webview messaging
│   │   ├── PreviewManager.ts       # Pattern for panel lifecycle
│   │   └── templates/
│   │       └── preview.html        # Pattern for HTML template
│   └── css-watcher.ts              # Existing (reuse pattern for label file watching)
│
├── media/
│   ├── preview.ts                  # Existing Eligius preview webview
│   ├── label-editor.ts             # NEW: Label editor webview script
│   └── empty-stub.ts               # Existing Node.js module stubs
│
├── esbuild.mjs                     # UPDATE: Add third bundle for label-editor.ts
└── package.json                    # UPDATE: Add customEditors contribution

packages/language/
├── src/
│   ├── label-import-registry.ts    # Existing (Feature 033) - reuse for navigation
│   └── eligian-definition-provider.ts # NEW: DefinitionProvider for label imports
│
└── __tests__/
    └── label-editor-integration/   # NEW: Integration tests (separate files per test)
        ├── navigation.spec.ts      # Test Ctrl+Click navigation
        ├── validation.spec.ts      # Test real-time validation
        └── save.spec.ts            # Test save operations
```

**Structure Decision**: Label editor lives in `packages/extension/src/extension/label-editor/` following the same pattern as `preview/`. Webview script in `media/label-editor.ts` compiled to `out/media/label-editor.js` via esbuild. No new packages needed - this is an extension feature, not a separate module.

## Complexity Tracking

*No constitution violations - section intentionally left empty*

---

## Phase 0: Outline & Research

### Research Topics

1. **CustomTextEditorProvider vs CustomEditorProvider** (COMPLETE - See research summary above)
   - Decision: Use CustomTextEditorProvider for text-based JSON
   - Rationale: VSCode handles save/undo/redo automatically, simpler implementation

2. **UI Component Library Selection** (COMPLETE - See research summary above)
   - Decision: Vanilla HTML + CSS variables (no component library for MVP)
   - Rationale: VSCode Webview UI Toolkit deprecated (Jan 2025), VSCode Elements adds complexity, preview already uses vanilla approach successfully
   - Alternative considered: VSCode Elements (Lit-based) - rejected for MVP due to bundle size + learning curve

3. **Bundling Strategy** (COMPLETE - See research summary above)
   - Decision: Add third esbuild bundle for `media/label-editor.ts`
   - Rationale: Webviews run in browser context (IIFE), extension runs in Node.js (CJS), requires separate compilation targets
   - Pattern: Follow existing `media/preview.ts` bundle configuration

4. **Message Protocol Design** (COMPLETE - See contracts section below)
   - Bidirectional messaging pattern following PreviewPanel
   - Message types: initialize, reload, validation-error, save-complete, ready, update, request-save, validate, check-usage

5. **UUID Generation Strategy** (COMPLETE)
   - Decision: Client-side generation using `crypto.randomUUID()` (Web Crypto API)
   - Rationale: Webview has access to browser crypto API, no server round-trip needed
   - Pattern: Generate on "Add Translation" action, hide from UI completely

6. **File Watching Pattern** (COMPLETE)
   - Decision: Reuse CSSWatcherManager pattern from Feature 011
   - Rationale: Same use case (external file modifications), proven implementation
   - Pattern: Watch label JSON files, send reload message to webview on change

### Output Artifact: `research.md`

Document the following decisions with rationale and alternatives considered:

1. **Editor Architecture**: CustomTextEditorProvider vs CustomEditorProvider
2. **UI Implementation**: Vanilla HTML vs VSCode Elements vs React
3. **Bundling**: esbuild configuration for dual runtime targets
4. **Message Protocol**: Extension ↔ Webview communication patterns
5. **State Management**: How webview tracks editor state (labels array, selected group)
6. **UUID Generation**: Client-side crypto.randomUUID() vs server-side generation
7. **File Watching**: CSSWatcherManager pattern for external change detection

---

## Phase 1: Design & Contracts

### Data Model Design (`data-model.md`)

Based on existing `packages/language/src/schemas/labels-schema.json`:

**Entity: Label File**
- Type: JSON array
- Contains: Array of LabelGroup objects
- Validation: Must be valid JSON, match labels schema

**Entity: LabelGroup**
- Fields:
  - `id` (string, required, unique, user-editable): Group identifier used in imports
  - `labels` (array, required, minItems: 1): Array of Translation objects
- Validation:
  - ID must be non-empty, valid identifier characters (alphanumeric, hyphens, underscores, dots)
  - ID must be unique within file
  - Must have at least one translation

**Entity: Translation**
- Fields:
  - `id` (string, required, UUID v4, hidden from user): Unique translation identifier
  - `languageCode` (string, required, pattern: `^[a-z]{2,3}-[A-Z]{2,3}$`): Language code (e.g., en-US)
  - `label` (string, required, minLength: 1): Translated text
- Validation:
  - ID must be valid UUID v4 (auto-generated if missing)
  - Language code must match xx-XX pattern
  - Label text must be non-empty

**State Management (Webview)**
- `labels`: Array<LabelGroup> - Current file state (parsed JSON)
- `selectedGroupIndex`: number | null - Currently selected group in left panel
- `validationErrors`: Map<string, string[]> - Validation errors by group ID
- `isDirty`: boolean - Unsaved changes indicator

### API Contracts (`contracts/`)

**File: `contracts/messages.ts`**

```typescript
// Extension → Webview messages
type ToWebviewMessage =
  | { type: 'initialize'; labels: LabelGroup[]; filePath: string }
  | { type: 'reload'; labels: LabelGroup[] } // External change detected
  | { type: 'validation-error'; errors: ValidationError[] }
  | { type: 'save-complete'; success: boolean }

// Webview → Extension messages
type ToExtensionMessage =
  | { type: 'ready' }
  | { type: 'update'; labels: LabelGroup[] } // User edited data
  | { type: 'request-save'; labels: LabelGroup[] }
  | { type: 'validate'; labels: LabelGroup[] }
  | { type: 'check-usage'; groupId: string } // Check if label used in .eligian files

// Shared types
interface LabelGroup {
  id: string;
  labels: Translation[];
}

interface Translation {
  id: string; // UUID v4
  languageCode: string; // xx-XX pattern
  label: string;
}

interface ValidationError {
  groupId: string;
  translationId?: string;
  field: string;
  message: string;
  code: string; // 'duplicate_id' | 'invalid_language_code' | 'empty_label' | etc.
}
```

**File: `contracts/validation.ts`**

```typescript
// Validation rules (pure functions)
export const validateGroupId = (id: string, existingIds: string[]): ValidationError | null;
export const validateLanguageCode = (code: string): ValidationError | null;
export const validateLabelText = (text: string): ValidationError | null;
export const validateUUID = (id: string): boolean;
export const generateUUID = (): string; // Wrapper for crypto.randomUUID()
```

### Quickstart Guide (`quickstart.md`)

**User Guide**:
1. Open `.eligian` file with label import
2. Ctrl+Click or F12 on import path
3. Label editor opens with split-view
4. Left panel: Click group to select, edit ID inline, drag to reorder, delete with confirmation
5. Right panel: Edit translations (language code + text), add/delete translations
6. Changes auto-save (VSCode handles)
7. Right-click file → "Open With..." to switch between Label Editor and JSON text editor

**Developer Guide**:
1. Architecture: CustomTextEditorProvider + webview messaging
2. Adding message types: Update `contracts/messages.ts` and both handler functions
3. Adding validation rules: Add to `LabelValidation.ts` (pure functions)
4. Testing: Use test helpers from `specs/TESTING_GUIDE.md`

### Agent Context Update

After Phase 1 completion, run:
```bash
pwsh -File .specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This updates `.specify/memory/claude-context.md` with:
- New module: `packages/extension/src/extension/label-editor/`
- New webview bundle: `media/label-editor.ts`
- New message protocol: Extension ↔ Webview label editor messaging
- No new dependencies (vanilla implementation)

---

## Re-Evaluation: Constitution Check (Post-Design)

After completing Phase 1 design, re-verify constitution compliance:

- [x] **Simplicity & Documentation**: Design maintains simplicity (vanilla HTML, message passing, pure validation functions)
- [x] **Comprehensive Testing**: Test strategy defined (unit tests for validation, integration tests for UI, e2e for navigation)
- [x] **No Gold-Plating**: Design implements spec requirements only, no extra features
- [x] **Functional Programming**: Validation functions are pure, message handlers are functional, state transitions are immutable
- [x] **Technical Overview**: Will be updated after implementation with:
  - New esbuild bundle in Build System section
  - LabelEditorProvider in VS Code Extension section
  - Message protocol in Development Workflow section

*No violations - design phase complete, ready for tasks generation via `/speckit.tasks`*

---

## Implementation Notes

### Integration Points (Existing Features)

1. **Feature 033 (Label Imports)**:
   - Reuse `LabelImportRegistry` to find label files from `.eligian` imports
   - Definition provider queries registry to resolve import path to file URI

2. **Feature 034 (Typed Labels)**:
   - Newly created/edited labels immediately available via language server
   - Language server re-validates `.eligian` files when label file changes

3. **Preview Infrastructure (Feature 011)**:
   - Reuse PreviewPanel messaging pattern
   - Reuse CSSWatcherManager pattern for file watching
   - Reuse webview URI conversion utilities

### Key Technical Decisions

**Decision 1: CustomTextEditorProvider**
- VSCode's `TextDocument` is source of truth
- Parse JSON on every webview update (acceptable for <100KB files)
- VSCode handles save, undo, redo automatically
- No custom document model needed

**Decision 2: Vanilla HTML UI**
- No component library dependency
- Use VSCode CSS variables for theming: `var(--vscode-button-background)`, etc.
- Native HTML5 drag-and-drop for reordering
- Keeps bundle size minimal (<50KB gzipped)

**Decision 3: Client-Side UUID Generation**
- Webview generates UUIDs using `crypto.randomUUID()`
- No server round-trip needed
- UUIDs never displayed in UI
- Auto-fix missing/invalid UUIDs on file load

**Decision 4: Bidirectional Messaging**
- Extension sends: initialize, reload (external change), validation errors
- Webview sends: ready, update (user edit), request-save, validate
- Message handlers are pure functions (input → output, no side effects)

### Performance Considerations

- **Editor Load**: Parse JSON (fast), render 50 groups (< 500ms target)
- **UI Updates**: Debounce input changes (300ms), validate incrementally
- **Save Operations**: Stringify JSON (fast), write file (< 1s for 100 groups)
- **File Watching**: Debounce external changes (300ms), reload without losing selection

### Testing Strategy

**Unit Tests** (Pure Functions):
- `LabelValidation.ts`: Test each validation rule independently
- `contracts/validation.ts`: Test UUID generation, language code patterns
- Message type guards: Test message parsing/serialization

**Integration Tests** (Separate Files - Principle II):
- `navigation.spec.ts`: Test Ctrl+Click → editor opens
- `validation.spec.ts`: Test real-time validation, error display
- `save.spec.ts`: Test save operations, undo/redo
- `external-changes.spec.ts`: Test file watcher reload

**E2E Tests** (Full Workflow):
- Create label group → add translations → save → verify JSON
- Edit label → Ctrl+Z → verify undo works
- Open in editor → switch to text editor → verify consistency

### Accessibility Compliance (WCAG 2.1 AA)

- Keyboard navigation: Tab through groups/translations, Enter to edit, Escape to cancel
- Screen reader: ARIA labels for buttons, form fields, error messages
- Color contrast: Use VSCode theme variables (guaranteed compliant)
- Focus indicators: Visible focus ring on all interactive elements

---

## Next Steps

1. **Run** `/speckit.tasks` to generate implementation tasks from this plan
2. **Implement** following test-first development (RED-GREEN-REFACTOR)
3. **Commit** after each phase completes (Principle XXIII)
4. **Update** `specs/TECHNICAL_OVERVIEW.md` after implementation (Principle XXVI)
5. **Verify** coverage meets 80% threshold before PR (Principle II)

---

**Status**: Phase 1 design complete. Ready for task generation.
