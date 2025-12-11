# Quickstart: Eligius 2.0.0 API Migration

**Feature**: 044-eligius-api-migration
**Date**: 2025-12-11

## Overview

This migration updates the Eligian codebase to use the Eligius 2.0.0 API. The key change is that `EngineFactory.createEngine()` now returns an `IEngineFactoryResult` object instead of directly returning `IEligiusEngine`.

## Before You Start

Ensure Eligius 2.1.0 is installed:
```bash
pnpm list eligius
# Should show: eligius 2.1.0
```

## Migration Pattern

### Old Pattern (Eligius 1.x)

```typescript
import { EngineFactory, IEligiusEngine } from 'eligius';

let engine: IEligiusEngine | null = null;
const factory = new EngineFactory(importer, window, { eventbus });

// Create engine
engine = factory.createEngine(config);

// Destroy engine
if (engine) {
  await engine.destroy();
  engine = null;
}
```

### New Pattern (Eligius 2.x)

```typescript
import { EngineFactory, IEligiusEngine, IEngineFactoryResult } from 'eligius';

let engine: IEligiusEngine | null = null;
let factoryResult: IEngineFactoryResult | null = null;
const factory = new EngineFactory(importer, window, { eventbus });

// Create engine - destructure the result
const result = factory.createEngine(config);
factoryResult = result;
engine = result.engine;

// Destroy engine - use factory result's destroy method
if (factoryResult) {
  await factoryResult.destroy();  // Properly disconnects adapters
  factoryResult = null;
  engine = null;
}
```

## Key Changes

### 1. Import `IEngineFactoryResult`

```typescript
// Add IEngineFactoryResult to imports
import {
  EngineFactory,
  type IEligiusEngine,
  type IEngineFactoryResult,  // NEW
  // ... other imports
} from 'eligius';
```

### 2. Store Factory Result

```typescript
// Add state variable for factory result
let factoryResult: IEngineFactoryResult | null = null;
```

### 3. Destructure `createEngine()` Result

```typescript
// OLD
engine = factory.createEngine(config);

// NEW
const result = factory.createEngine(config);
factoryResult = result;
engine = result.engine;
```

### 4. Use `factoryResult.destroy()` for Cleanup

```typescript
// OLD - Only destroys engine
await engine.destroy();

// NEW - Destroys engine AND disconnects adapters
await factoryResult.destroy();
```

## Factory Result Properties

The `IEngineFactoryResult` provides access to:

| Property | Type | Description |
|----------|------|-------------|
| `engine` | `IEligiusEngine` | The engine instance |
| `languageManager` | `ILanguageManager` | Language/i18n manager |
| `eventbus` | `IEventbus` | The eventbus instance |
| `destroy` | `() => Promise<void>` | Cleanup function |

## Why This Matters

The new destroy method properly:
1. Disconnects `EngineInputAdapter` (hotkeys, window resize)
2. Disconnects `LanguageEventbusAdapter` (language events)
3. Disconnects `EngineEventbusAdapter` (engine events)
4. Destroys the engine and language manager

Using `engine.destroy()` alone would leave adapters connected, causing memory leaks.

## Verification Steps

After migration:

```bash
# 1. Build should pass
pnpm run build

# 2. Lint should pass
pnpm run check

# 3. Tests should pass
pnpm test
```

## Troubleshooting

### TypeScript Error: Property 'engine' does not exist

Ensure you're destructuring the result:
```typescript
// Wrong
engine = factory.createEngine(config);

// Correct
const { engine } = factory.createEngine(config);
// OR
const result = factory.createEngine(config);
engine = result.engine;
```

### Console errors after closing preview

Ensure you're using `factoryResult.destroy()` not `engine.destroy()`.

### Eventbus events not firing

Verify the eventbus is still being passed to the factory constructor. The 2.0.0 API doesn't change this pattern.
