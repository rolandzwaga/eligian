# Research: Eligius 2.0.0 API Migration

**Feature**: 044-eligius-api-migration
**Date**: 2025-12-11
**Status**: Complete

## Research Tasks

### 1. Eligius 2.0.0 Breaking Changes

**Task**: Investigate all breaking changes in Eligius 2.0.0

**Decision**: The following breaking changes affect our codebase:

| Change | Impact | Required Action |
|--------|--------|-----------------|
| `createEngine()` return type | HIGH | Destructure `IEngineFactoryResult` |
| `factoryResult.destroy()` | HIGH | Use factory result's destroy method |
| Eventbus request pattern | LOW | Factory handles internally |
| LanguageManager constructor | LOW | Factory handles internally |
| Devtools removed | NONE | Not used in our codebase |

**Rationale**: The new API improves separation of concerns with adapters handling eventbus integration. The factory result provides a cleaner destroy lifecycle.

**Alternatives Considered**:
- Pinning to Eligius 1.x - Rejected: Would miss new features and bugfixes
- Partial migration - Rejected: All createEngine() calls must be updated

### 2. IEngineFactoryResult Interface

**Task**: Understand the new return type structure

**Decision**: `IEngineFactoryResult` contains:
```typescript
interface IEngineFactoryResult {
  engine: IEligiusEngine;        // The engine instance
  languageManager: ILanguageManager;  // Language manager
  eventbus: IEventbus;           // The eventbus instance
  destroy: () => Promise<void>;  // Cleanup function
}
```

**Rationale**: The factory result encapsulates all created components and provides a single destroy function that properly disconnects all adapters.

**Alternatives Considered**: None - this is the new API contract.

### 3. Adapter Pattern Impact

**Task**: Determine if adapters require direct interaction

**Decision**: No direct adapter interaction needed. The factory creates and connects:
- `EngineEventbusAdapter` - Bridges engine events to eventbus
- `LanguageEventbusAdapter` - Bridges language manager to eventbus
- `EngineInputAdapter` - Handles hotkeys and window resize

The `factoryResult.destroy()` method disconnects all adapters automatically.

**Rationale**: The adapter pattern is an internal implementation detail. Our code interacts with the eventbus as before.

**Alternatives Considered**:
- Direct adapter management - Rejected: Factory handles this automatically

### 4. Eventbus Compatibility

**Task**: Verify eventbus event names remain unchanged

**Decision**: All eventbus event names are unchanged:
- `timeline-play-request`
- `timeline-pause-request`
- `timeline-stop-request`
- `timeline-complete`
- `timeline-play`
- `timeline-pause`
- `timeline-stop`
- `timeline-restart`

**Rationale**: Eligius 2.0.0 maintains backwards compatibility for eventbus events.

**Alternatives Considered**: None needed - compatibility confirmed.

### 5. Generated Bundle Code

**Task**: Determine required changes for runtime bundler

**Decision**: Only the engine assignment line needs updating:
```typescript
// Before
const engine = factory.createEngine(CONFIG);

// After
const { engine } = factory.createEngine(CONFIG);
```

**Rationale**: The generated bundle uses the engine for `init()` only. The factory result's other properties are not needed for basic bundle execution.

**Alternatives Considered**:
- Store full factory result in bundle - Rejected: Adds complexity without benefit
- Add destroy handling to bundle - Rejected: Out of scope, bundles don't need cleanup

## Unresolved Questions

None - all technical questions have been answered.

## References

- [Eligius CHANGELOG.md](F:\projects\eligius\eligius\CHANGELOG.md) - Breaking changes documentation
- [Eligius types.ts](F:\projects\eligius\eligius\src\types.ts) - IEngineFactoryResult interface
- [Eligius engine-factory.ts](F:\projects\eligius\eligius\src\engine-factory.ts) - Factory implementation
