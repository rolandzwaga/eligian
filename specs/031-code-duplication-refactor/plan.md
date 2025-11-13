# Implementation Plan: Code Duplication Refactoring

**Branch**: `031-code-duplication-refactor` | **Date**: 2025-01-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/031-code-duplication-refactor/spec.md`

## Summary

This feature consolidates 12 identified code duplication patterns across the Eligian codebase into 7 new shared utility modules, reducing duplicated code by 150-200 lines while improving maintainability and consistency. The refactoring is pure code extraction with zero behavior changes, organized in three prioritized phases targeting critical infrastructure duplications first, then common patterns, and finally low-impact utilities. All existing tests must continue to pass without modification, proving behavior preservation.

**Primary Requirement**: Eliminate code duplication while maintaining 100% identical behavior
**Technical Approach**: Extract duplicated logic into shared utilities, update consumers to use utilities, verify tests pass

## Technical Context

**Language/Version**: TypeScript 5.x with NodeNext module resolution
**Primary Dependencies**: Langium (LSP), Effect-ts (not applicable to refactored utilities), Vitest (testing), Biome (code quality)
**Storage**: N/A (refactoring existing code)
**Testing**: Vitest with 1,483+ existing tests (must all pass without modification), coverage must remain ≥81.72%
**Target Platform**: Node.js 18+ ESM, VS Code Extension Host
**Project Type**: Monorepo (packages/language, packages/extension, packages/shared-utils)
**Performance Goals**: No performance degradation (<5% build time increase acceptable), negligible runtime impact
**Constraints**: Zero behavior change, no test modifications, all refactorings must pass existing tests
**Scale/Scope**: 281+ lines duplicated across 12 patterns, 7 new utility modules, ~20 consumer files updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is pure extraction with clear documentation. No unnecessary complexity.
- [x] **Comprehensive Testing**: Existing 1,483+ tests verify behavior preservation. New utility modules will have unit tests.
- [x] **No Gold-Plating**: Solves documented pain point (code duplication analysis report). No speculative features.
- [x] **Code Review**: Standard PR process applies. Constitution compliance verified.
- [x] **UX Consistency**: No user-facing changes. LSP protocol and CLI behavior unchanged.
- [x] **Functional Programming**: Refactored utilities maintain external immutability. No Effect-ts needed (synchronous utilities).

**Post-Phase 1 Re-check**: N/A (no Phase 1 design artifacts needed for pure refactoring)

*All checks pass. No violations to justify.*

## Project Structure

### Documentation (this feature)

```
specs/031-code-duplication-refactor/
├── plan.md              # This file
├── spec.md              # Feature specification (complete)
├── quickstart.md        # Usage guide for new utilities (Phase 1)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── DUPLICATION_ANALYSIS.md  # Analysis report (external, at repo root)
```

**Note**: No `research.md` or `contracts/` needed - this is pure refactoring with no new external APIs.

### Source Code (repository root)

```
packages/language/src/
├── utils/                      # NEW: Shared utilities package
│   ├── string-utils.ts         # NEW (Phase 1) - String literal detection
│   ├── error-builder.ts        # NEW (Phase 1) - Error construction helpers
│   ├── hover-utils.ts          # NEW (Phase 2) - LSP Hover creation
│   ├── markdown-builder.ts     # NEW (Phase 2) - Markdown generation
│   ├── css-file-utils.ts       # NEW (Phase 2) - CSS file operations
│   ├── collection-utils.ts     # NEW (Phase 3) - Collection utilities
│   └── __tests__/              # Unit tests for all new utilities
│       ├── string-utils.spec.ts
│       ├── error-builder.spec.ts
│       ├── hover-utils.spec.ts
│       ├── markdown-builder.spec.ts
│       ├── css-file-utils.spec.ts
│       └── collection-utils.spec.ts
├── completion/
│   └── completion-item-factory.ts  # NEW (Phase 3) - CompletionItem builders
├── css/
│   └── css-hover.ts            # MODIFIED (Phase 1) - Use consolidated builders
├── eligian-completion-provider.ts  # MODIFIED (Phase 1) - Use string-utils
├── eligian-hover-provider.ts   # MODIFIED (Phase 2) - Use hover-utils
├── validators/                 # MODIFIED (Phase 1) - Use error-builder
│   ├── asset-type-validator.ts
│   ├── default-import-validator.ts
│   ├── import-name-validator.ts
│   └── import-path-validator.ts
└── ast-helpers.ts              # MODIFIED (Phase 2) - Delegate to generated guards

packages/shared-utils/src/
└── path-utils.ts               # EXTENDED (Phase 3) - Add getFileExtension()

packages/extension/src/
└── [no changes]                # No extension-specific refactorings
```

**Structure Decision**: Monorepo structure remains unchanged. New utilities added to existing `packages/language/src/utils/` directory. Shared utilities extended in `packages/shared-utils/`. No new packages created.

## Complexity Tracking

*No constitutional violations. This section intentionally left empty.*

## Refactoring Architecture

### Phase 1: High Priority Refactorings (2-4 hours)

**Goal**: Eliminate critical duplications with highest impact (135+ lines reduced)

#### 1.1 String Literal Detection Utility (`utils/string-utils.ts`)

**Duplication**: Identical `isCursorInString` / `isCursorInStringLiteral` implementations in:
- `eligian-completion-provider.ts:44-61` (18 lines)
- `css/context-detection.ts:125-165` (41 lines with extended logic)

**Solution**:
```typescript
// packages/language/src/utils/string-utils.ts

import type { CstNode } from 'langium';

/**
 * Determines if a given document offset falls within a string literal.
 * Walks the CST to find string tokens and checks if offset is within their range.
 *
 * @param rootNode - CST root node to search
 * @param offset - Document offset to check
 * @returns true if offset is inside a string literal, false otherwise
 */
export function isOffsetInStringLiteral(rootNode: CstNode, offset: number): boolean {
  // Implementation extracted from css/context-detection.ts (more comprehensive version)
  // ... (full logic from context-detection.ts lines 125-165)
}
```

**Consumers**:
- `eligian-completion-provider.ts`: Replace `isCursorInString()` with `isOffsetInStringLiteral()`
- `css/context-detection.ts`: Replace `isCursorInStringLiteral()` with `isOffsetInStringLiteral()`

**Testing**: Existing completion and CSS validation tests must pass without modification.

#### 1.2 CSS Hover Markdown/Info Builders (`css/css-hover.ts`)

**Duplication**: 95% identical implementations:
- `buildCSSClassMarkdown` + `buildCSSIDMarkdown` (40 lines total)
- `buildCSSClassInfo` + `buildCSSIDInfo` (66 lines total)

**Solution**:
```typescript
// packages/language/src/css/css-hover.ts (consolidated functions)

/**
 * Builds markdown hover content for a CSS identifier (class or ID).
 * @param name - CSS identifier name (without . or # prefix)
 * @param label - Display label ("CSS Class" or "CSS ID")
 * @param files - Files containing this identifier with locations
 */
function buildCSSIdentifierMarkdown(
  name: string,
  label: string,
  files: Map<string, CSSSourceLocation[]>
): string {
  // Consolidated logic with parameterized label
  const lines = [`### ${label}: \`.${name}\``, '', '**Found in:**'];
  for (const [file, locations] of files) {
    lines.push(`- ${file} (${locations.length} occurrence${locations.length !== 1 ? 's' : ''})`);
  }
  return lines.join('\n');
}

/**
 * Builds CSS identifier info object for hover display.
 * @param name - CSS identifier name
 * @param label - Display label
 * @param registry - CSS registry service
 * @param documentUri - Current document URI
 * @param propertyGetter - Function to get locations from registry metadata
 */
function buildCSSIdentifierInfo(
  name: string,
  label: string,
  registry: CSSRegistryService,
  documentUri: string,
  propertyGetter: (metadata: CSSFileMetadata) => Map<string, CSSSourceLocation[]>
): Map<string, CSSSourceLocation[]> {
  // Consolidated logic with property getter function parameter
  // ... (implementation)
}

// Update callers:
// buildCSSClassMarkdown() → buildCSSIdentifierMarkdown(name, "CSS Class", ...)
// buildCSSIDMarkdown() → buildCSSIdentifierMarkdown(name, "CSS ID", ...)
// buildCSSClassInfo() → buildCSSIdentifierInfo(name, "CSS Class", ..., m => m.classLocations)
// buildCSSIDInfo() → buildCSSIdentifierInfo(name, "CSS ID", ..., m => m.idLocations)
```

**Testing**: Existing CSS hover tests must produce identical markdown output.

#### 1.3 Error Construction Utility (`utils/error-builder.ts`)

**Duplication**: Repeated error object construction pattern across 5+ validators:
- `asset-type-validator.ts:62-81`
- `default-import-validator.ts:51-58`
- `import-name-validator.ts:54-79` (3 instances)
- `import-path-validator.ts:50-54`

**Solution**:
```typescript
// packages/language/src/utils/error-builder.ts

/**
 * Constructs a validation error object with code, message, and hint.
 * @param errorDefinition - Error definition from ERROR_MESSAGES constant
 * @param args - Arguments to pass to error message generator
 * @returns Validation error object ready for ValidationAcceptor
 */
export function createValidationError<T extends (...args: any[]) => { message: string; hint: string }>(
  errorDefinition: T,
  ...args: Parameters<T>
): ReturnType<T> & { code: string } {
  const { message, hint } = errorDefinition(...args);
  const code = /* extract code from errorDefinition function name or metadata */;
  return { code, message, hint };
}

// Usage in validators:
// Before: const { message, hint } = ERROR_MESSAGES.unknown_asset_type(...); return { code: 'unknown_asset_type', message, hint };
// After: return createValidationError(ERROR_MESSAGES.unknown_asset_type, ...);
```

**Consumers**: All 5+ validator files updated to use `createValidationError()`.

**Testing**: Existing validation tests must produce identical error messages.

---

### Phase 2: Medium Priority Refactorings (4-6 hours)

**Goal**: Consolidate commonly used patterns (110+ lines reduced)

#### 2.1 Hover Object Creation Utility (`utils/hover-utils.ts`)

**Duplication**: Identical Hover object creation repeated 6+ times:
- `css/css-hover.ts:68-72` (2 instances)
- `eligian-hover-provider.ts:114-119, 134-139, 151-156, 165-170` (4 instances)

**Solution**:
```typescript
// packages/language/src/utils/hover-utils.ts

import type { Hover, MarkupContent } from 'vscode-languageserver-protocol';

/**
 * Creates an LSP Hover object with markdown content.
 * @param markdown - Markdown-formatted hover content
 * @returns Hover object conforming to LSP protocol
 */
export function createMarkdownHover(markdown: string): Hover {
  return {
    contents: {
      kind: 'markdown',
      value: markdown
    } as MarkupContent
  };
}
```

**Consumers**:
- `css/css-hover.ts`: Replace 2 inline Hover object creations
- `eligian-hover-provider.ts`: Replace 4 inline Hover object creations

**Testing**: Existing hover provider tests must produce identical hover responses.

#### 2.2 Markdown Builder Utility (`utils/markdown-builder.ts`)

**Duplication**: Array-based markdown building repeated 3+ times:
- `css/css-hover.ts:111-124, 134-147`
- `eligian-hover-provider.ts:196-245`

**Solution**:
```typescript
// packages/language/src/utils/markdown-builder.ts

/**
 * Fluent builder for constructing markdown content.
 */
export class MarkdownBuilder {
  private lines: string[] = [];

  heading(level: number, text: string): this {
    this.lines.push(`${'#'.repeat(level)} ${text}`);
    return this;
  }

  text(content: string): this {
    this.lines.push(content);
    return this;
  }

  blank(): this {
    this.lines.push('');
    return this;
  }

  list(items: string[]): this {
    for (const item of items) {
      this.lines.push(`- ${item}`);
    }
    return this;
  }

  codeBlock(code: string, language?: string): this {
    this.lines.push(`\`\`\`${language || ''}`, code, '```');
    return this;
  }

  build(): string {
    return this.lines.join('\n');
  }
}
```

**Consumers**: Update CSS hover and eligian hover providers to use `MarkdownBuilder`.

**Testing**: Generated markdown must remain identical.

#### 2.3 Type Guard Cleanup (`utils/ast-helpers.ts`)

**Duplication**: Manual type guards duplicate Langium-generated guards in `generated/ast.ts`.

**Solution**:
```typescript
// packages/language/src/utils/ast-helpers.ts

// Remove manual implementations like:
// export function isTimeline(node: AstNode): node is Timeline { return node.$type === 'Timeline'; }

// Replace with delegations to generated guards:
import { isTimeline as langiumIsTimeline, isAction as langiumIsAction /* ... */ } from '../generated/ast.js';

// Keep only wrapper functions that add domain logic beyond type checking
export function isTimeline(node: AstNode): node is Timeline {
  return langiumIsTimeline(node);
}

// Or remove wrappers entirely and import directly from generated/ast.js in consumers
```

**Consumers**: Update all imports to use generated type guards or wrapper functions that delegate.

**Testing**: All AST traversal code must continue to work correctly.

#### 2.4 CSS File Reading Utility (`utils/css-file-utils.ts`)

**Duplication**: Try-catch for file reading with console.warn and fallback:
- `css/css-code-actions.ts:70-79`
- Other file reading locations

**Solution**:
```typescript
// packages/language/src/utils/css-file-utils.ts

import { promises as fs } from 'node:fs';

/**
 * Reads a CSS file with error handling and fallback.
 * @param filePath - Absolute path to CSS file
 * @returns File contents or empty string on error
 */
export async function readCSSFileWithErrorHandling(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.warn(`Failed to read CSS file: ${filePath}`, error);
    return '';
  }
}
```

**Consumers**: Update CSS code actions and other file readers.

**Testing**: File reading error scenarios must be handled correctly.

---

### Phase 3: Low Priority Refactorings (2-3 hours)

**Goal**: Polish and complete utility consolidation (36+ lines reduced)

#### 3.1 Completion Item Factory (`completion/completion-item-factory.ts`)

**Duplication**: CompletionItem construction repeated 2+ times across completion providers.

**Solution**:
```typescript
// packages/language/src/completion/completion-item-factory.ts

import type { CompletionItem, CompletionItemKind } from 'vscode-languageserver-protocol';

export function createCompletionItem(
  label: string,
  kind: CompletionItemKind,
  documentation?: string,
  insertText?: string
): CompletionItem {
  return {
    label,
    kind,
    documentation: documentation ? { kind: 'markdown', value: documentation } : undefined,
    insertText: insertText || label
  };
}
```

**Consumers**: Update completion providers for actions, operations, events.

#### 3.2 Collection Utilities (`utils/collection-utils.ts`)

**Duplication**: `Array.from(registry.getDocumentImports())` pattern:
- `eligian-hover-provider.ts:72`
- `css-code-actions.ts:54`

**Solution**:
```typescript
// packages/language/src/utils/collection-utils.ts

/**
 * Converts a Set to an Array.
 * @param set - Set to convert
 * @returns Array of set elements
 */
export function setToArray<T>(set: Set<T>): T[] {
  return Array.from(set);
}
```

**Consumers**: Update hover provider and code actions.

#### 3.3 File Extension Extraction (`shared-utils/path-utils.ts`)

**Duplication**: `path.match(/\.([^.]+)$/); match[1].toLowerCase()` pattern:
- `validators/asset-type-validator.ts:103-108`

**Solution**:
```typescript
// packages/shared-utils/src/path-utils.ts

/**
 * Extracts file extension from a path (without dot).
 * @param filePath - File path to extract extension from
 * @returns Lowercase file extension or empty string if no extension
 */
export function getFileExtension(filePath: string): string {
  const match = filePath.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}
```

**Consumers**: Update asset type validator.

#### 3.4 Service Initialization Factory

**Duplication**: `services || { References: {} }` constructor pattern:
- `eligian-hover-provider.ts`

**Solution**: Extract to factory function if additional instances found, otherwise defer as low priority.

---

## Testing Strategy

### Test-First Workflow

**Phase 1-3**: For each refactoring step:

1. **RED**: Identify existing tests that cover duplicated code behavior
2. **GREEN**: Extract utility function, update consumers, verify tests pass (no modification)
3. **REFACTOR**: Add unit tests for new utility function in isolation

### Coverage Verification

**After Each Phase**:
- Run `pnpm run test` - all 1,483+ tests must pass without modification
- Run `pnpm run test:coverage` - coverage must remain ≥81.72%
- Run `pnpm run check` - Biome checks must pass
- Run `pnpm run typecheck` - TypeScript compilation must succeed

**New Utility Tests**:
Each new utility module must have comprehensive unit tests:
- `string-utils.spec.ts` - Test cursor position detection edge cases
- `error-builder.spec.ts` - Test error object construction variants
- `hover-utils.spec.ts` - Test Hover object creation
- `markdown-builder.spec.ts` - Test markdown generation
- `css-file-utils.spec.ts` - Test file reading error handling
- `collection-utils.spec.ts` - Test collection conversions

### Integration Testing

**Existing Tests as Behavioral Specification**:
- All existing tests must pass without modification (proof of behavior preservation)
- No new integration tests needed (refactoring only)
- Test failures indicate behavioral regression (immediate fix required)

---

## Implementation Phases

### Phase 0: Research & Planning

**Status**: ✅ **COMPLETE** - No research needed (pure refactoring)

**Artifacts**:
- [x] Feature specification (`spec.md`) - complete
- [x] Duplication analysis report (`DUPLICATION_ANALYSIS.md`) - complete at repo root
- [x] Implementation plan (`plan.md`) - this file

**Note**: No `research.md` generated - technical decisions are straightforward extractions.

---

### Phase 1: Design Artifacts

**Goal**: Document utility module APIs and usage patterns

**Deliverables**:
- [ ] `quickstart.md` - Usage guide for all 7 new utility modules
  - String literal detection utilities
  - Error construction helpers
  - Hover creation utilities
  - Markdown generation builders
  - CSS file operation helpers
  - Collection utilities
  - Completion item factories
- [ ] No `data-model.md` needed (no domain entities)
- [ ] No `contracts/` needed (internal utilities, not external APIs)

**Note**: No external APIs being created, so contracts are not applicable.

---

### Phase 2: Implementation (Tracked via /speckit.tasks)

**Note**: Detailed task breakdown will be generated by `/speckit.tasks` command.

**Expected Task Structure**:

**Phase 1 Tasks (High Priority)**:
- [ ] Create `utils/string-utils.ts` with `isOffsetInStringLiteral()`
- [ ] Add unit tests for `string-utils.ts`
- [ ] Update `eligian-completion-provider.ts` to use `isOffsetInStringLiteral()`
- [ ] Update `css/context-detection.ts` to use `isOffsetInStringLiteral()`
- [ ] Verify completion and CSS validation tests pass
- [ ] Consolidate `buildCSSClassMarkdown` and `buildCSSIDMarkdown` in `css/css-hover.ts`
- [ ] Consolidate `buildCSSClassInfo` and `buildCSSIDInfo` in `css/css-hover.ts`
- [ ] Add unit tests for consolidated CSS builders
- [ ] Verify CSS hover tests pass with identical output
- [ ] Create `utils/error-builder.ts` with `createValidationError()`
- [ ] Add unit tests for `error-builder.ts`
- [ ] Update 5+ validator files to use `createValidationError()`
- [ ] Verify all validation tests produce identical errors
- [ ] Run Phase 1 verification: tests, coverage, Biome, typecheck

**Phase 2 Tasks (Medium Priority)**:
- [ ] Create `utils/hover-utils.ts` with `createMarkdownHover()`
- [ ] Add unit tests for `hover-utils.ts`
- [ ] Update 6+ hover creation sites to use `createMarkdownHover()`
- [ ] Verify hover provider tests pass with identical responses
- [ ] Create `utils/markdown-builder.ts` with `MarkdownBuilder` class
- [ ] Add unit tests for `markdown-builder.ts`
- [ ] Update CSS hover to use `MarkdownBuilder`
- [ ] Update eligian hover to use `MarkdownBuilder`
- [ ] Verify generated markdown remains identical
- [ ] Clean up type guards in `ast-helpers.ts` (delegate to generated guards)
- [ ] Verify all AST traversal code works correctly
- [ ] Create `utils/css-file-utils.ts` with `readCSSFileWithErrorHandling()`
- [ ] Add unit tests for `css-file-utils.ts`
- [ ] Update CSS code actions to use `readCSSFileWithErrorHandling()`
- [ ] Run Phase 2 verification: tests, coverage, Biome, typecheck

**Phase 3 Tasks (Low Priority)**:
- [ ] Create `completion/completion-item-factory.ts`
- [ ] Add unit tests for completion item factory
- [ ] Update completion providers to use factory
- [ ] Create `utils/collection-utils.ts` with `setToArray()`
- [ ] Add unit tests for `collection-utils.ts`
- [ ] Update hover provider and code actions to use `setToArray()`
- [ ] Extend `shared-utils/path-utils.ts` with `getFileExtension()`
- [ ] Add unit tests for `getFileExtension()`
- [ ] Update asset type validator to use `getFileExtension()`
- [ ] Run Phase 3 verification: tests, coverage, Biome, typecheck

**Final Verification**:
- [ ] Run full test suite: all 1,483+ tests pass
- [ ] Verify coverage ≥81.72%
- [ ] Verify Biome checks pass
- [ ] Verify TypeScript compilation succeeds
- [ ] Verify code reduction: 150-200 lines removed
- [ ] Verify performance: build time within 5% of baseline
- [ ] Update `quickstart.md` with final usage examples

---

## Success Criteria Mapping

| Success Criterion | Verification Method |
|-------------------|---------------------|
| **SC-001**: 150-200 lines reduced | Count duplicated lines removed vs new utility code added |
| **SC-002**: All 1,483+ tests pass | `pnpm run test` (no test modifications) |
| **SC-003**: Coverage ≥81.72% | `pnpm run test:coverage` after each phase |
| **SC-004**: Zero linting errors | `pnpm run check` after each phase |
| **SC-005**: String detection in 1 location | Verify single implementation in `utils/string-utils.ts` |
| **SC-006**: CSS hover duplication <20 lines | Verify consolidated builders in `css/css-hover.ts` |
| **SC-007**: Error construction in 1 utility | Verify single implementation in `utils/error-builder.ts` |
| **SC-008**: Hover creation in 1 utility | Verify single implementation in `utils/hover-utils.ts` |
| **SC-009**: Type guards reduced by 20+ lines | Verify `ast-helpers.ts` delegates to generated guards |
| **SC-010**: New validators use shared utilities | Code review verification |
| **SC-011**: New hovers use shared utilities | Code review verification |
| **SC-012**: Build time within 5% | Benchmark `pnpm run build` before/after |
| **SC-013**: Phase 1 in 2-4 hours | Time tracking during implementation |
| **SC-014**: Phase 2 in 4-6 hours | Time tracking during implementation |
| **SC-015**: Phase 3 in 2-3 hours | Time tracking during implementation |
| **SC-016**: Total effort 8-13 hours | Sum of phase times |

---

## Risk Mitigation

### Risk 1: Behavioral Regressions

**Mitigation**:
- Run full test suite after each refactoring step
- No test modifications allowed (proves behavior preservation)
- Use git to track each refactoring separately (easy rollback)

### Risk 2: Decreased Code Coverage

**Mitigation**:
- Add unit tests for each new utility module
- Verify coverage after each phase
- Existing integration tests cover utilities through consumers

### Risk 3: Time Overrun

**Mitigation**:
- Follow phased approach (prioritize high-impact refactorings)
- Time-box each phase (defer low-priority if needed)
- Track effort per refactoring (identify slowdowns early)

### Risk 4: Inconsistent Utility Usage

**Mitigation**:
- Document utilities in `quickstart.md`
- Search codebase for remaining patterns after each refactoring
- Add JSDoc to all utility functions

### Risk 5: Merge Conflicts

**Mitigation**:
- Complete refactorings in dedicated feature branch
- Coordinate with team on merge timing
- Keep refactorings focused and minimal

---

## Quickstart Development

See [quickstart.md](./quickstart.md) for:
- Utility module API documentation
- Usage examples for each utility
- Migration guide from old patterns to new utilities
- Testing guidelines for utilities

---

## Notes

**Constitutional Compliance**:
- ✅ Simplicity: Pure extraction, no new complexity
- ✅ Testing: Existing tests verify behavior, new tests cover utilities
- ✅ No Gold-Plating: Solves documented duplication problem
- ✅ Functional Programming: Utilities maintain external immutability
- ✅ ESM Imports: All imports use `.js` extensions
- ✅ Biome Integration: `pnpm run check` after each phase
- ✅ TypeScript Type Checking: `pnpm run typecheck` after each phase

**Refactoring Principles**:
1. Extract utilities one at a time (incremental, low-risk)
2. Verify tests pass after each extraction (immediate feedback)
3. Add unit tests for utilities (isolated coverage)
4. Document utilities with JSDoc (maintainability)
5. Search for remaining patterns (completeness)

**Phased Rollout Alignment**:
- Phase 1 (Spec) → High priority refactorings (SC-005, SC-006, SC-007, SC-013)
- Phase 2 (Spec) → Medium priority refactorings (SC-008, SC-009, SC-014)
- Phase 3 (Spec) → Low priority refactorings (SC-010, SC-012, SC-015)
- Phase 4 (Spec) → Validation and documentation (SC-001 through SC-016)
