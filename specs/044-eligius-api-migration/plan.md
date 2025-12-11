# Implementation Plan: Eligius 2.0.0 API Migration

**Branch**: `044-eligius-api-migration` | **Date**: 2025-12-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/044-eligius-api-migration/spec.md`

## Summary

Migrate the Eligian codebase to the Eligius 2.0.0 API by updating `EngineFactory.createEngine()` usages to destructure the new `IEngineFactoryResult` return type, updating destroy logic to use the factory result's `destroy()` method (which properly disconnects adapters), and fixing the generated runtime bundler code.

## Technical Context

**Language/Version**: TypeScript 5.9.3 with Node.js
**Primary Dependencies**: Eligius 2.1.0, Effect-ts 3.19.11, Langium, VS Code Extension API
**Storage**: N/A (no persistent storage changes)
**Testing**: Vitest 4.0.15 (`pnpm test`)
**Target Platform**: VS Code Extension (webview context), CLI (Node.js), Browser (runtime bundles)
**Project Type**: Monorepo (packages: language, extension, cli, shared-utils)
**Performance Goals**: N/A (API migration, no performance changes)
**Constraints**: Must maintain backwards compatibility with existing eventbus patterns
**Scale/Scope**: 2 files requiring code changes, minimal scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity First | PASS | Straightforward API migration, no new abstractions |
| II. Comprehensive Testing | PASS | Will verify existing tests pass after changes |
| III. Type Safety with Effect | N/A | No Effect changes required |
| V. Test-Driven Development | PASS | Existing tests serve as regression suite |
| VI. External Immutability | N/A | No new APIs being created |
| VII. Functional Programming | N/A | No new patterns being introduced |
| VIII. Package Manager Discipline | PASS | Using pnpm exclusively |
| XI. Code Quality with Biome | PASS | Will run `pnpm run check` after changes |
| XIV. Windows Path Handling | PASS | Using Windows-style paths |
| XV. Eligius Library Research | PASS | Importing from `eligius` npm package |
| XXIII. Testing with Standard Commands | PASS | Using `pnpm test` |

**Gate Result**: PASS - All applicable principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/044-eligius-api-migration/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec validation checklist
```

### Source Code (affected files)

```text
packages/
├── extension/
│   └── media/
│       └── preview.ts           # US1: Engine lifecycle changes
└── cli/
    └── src/
        └── bundler/
            └── runtime-bundler.ts  # US2: Generated code changes
```

**Structure Decision**: Existing monorepo structure. No new files or directories needed - only modifications to 2 existing files.

## Complexity Tracking

> No violations - this is a minimal API migration with no new abstractions.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Files Requiring Changes

### 1. packages/extension/media/preview.ts

**Changes Required**:
- Add `IEngineFactoryResult` to imports from `eligius`
- Add `factoryResult` state variable to store factory result
- Update `initializeEngine()` to destructure factory result
- Update `destroyEngine()` to call `factoryResult.destroy()` instead of `engine.destroy()`

**Before** (Line 68):
```typescript
engine = factory.createEngine(config);
```

**After**:
```typescript
const result = factory.createEngine(config);
factoryResult = result;
engine = result.engine;
```

**Before** (Lines 54-57):
```typescript
if (engine) {
  await engine.destroy();
  engine = null;
}
```

**After**:
```typescript
if (factoryResult) {
  await factoryResult.destroy();
  factoryResult = null;
  engine = null;
}
```

### 2. packages/cli/src/bundler/runtime-bundler.ts

**Changes Required**:
- Update generated initialization code to destructure factory result

**Before** (Lines 172-174):
```typescript
lines.push('  const factory = new EngineFactory(new BundledResourceImporter(), window);');
lines.push('  const engine = factory.createEngine(CONFIG);');
lines.push('  return engine.init();');
```

**After**:
```typescript
lines.push('  const factory = new EngineFactory(new BundledResourceImporter(), window);');
lines.push('  const { engine } = factory.createEngine(CONFIG);');
lines.push('  return engine.init();');
```

## Implementation Tasks

### Task 1: Update preview.ts engine lifecycle (US1)

1. Add `IEngineFactoryResult` to imports
2. Add `let factoryResult: IEngineFactoryResult | null = null;` state variable
3. Update `initializeEngine()` function:
   - Destructure factory result
   - Store result in `factoryResult`
   - Extract `engine` from result
4. Update `destroyEngine()` function:
   - Check `factoryResult` instead of `engine`
   - Call `factoryResult.destroy()` for proper cleanup
   - Reset both `factoryResult` and `engine` to null
5. Update cleanup in `initializeEngine()` error path (if applicable)

### Task 2: Update runtime-bundler.ts generated code (US2)

1. Update `generateEntryPoint()` function:
   - Change generated engine assignment to use destructuring
   - Verify generated code is syntactically correct

### Task 3: Verification (US1, US2, US3)

1. Run `pnpm run build` - verify TypeScript compilation succeeds
2. Run `pnpm run check` - verify Biome passes
3. Run `pnpm test` - verify all tests pass
4. Manual test: Open preview panel with `.eligian` file, verify engine initializes
5. Manual test: Close preview panel, verify no console errors
6. Manual test: Test playback controls (play/pause/stop/restart)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Eventbus patterns changed | Low | High | Verified eventbus APIs unchanged in 2.0.0 |
| TypeScript compilation errors | Low | Medium | Type imports are explicit in Eligius exports |
| Preview panel regression | Low | High | Existing test suite + manual verification |
| CLI bundle generation broken | Low | Medium | Generated code is simple destructuring change |

## Rollback Plan

If issues are discovered after implementation:
1. Revert changes to both files
2. Pin Eligius to previous version in package.json
3. Run `pnpm install` to restore previous state

## Dependencies

- Eligius 2.1.0 must be installed (verified: already at 2.1.0 in package.json)
- No other feature dependencies
