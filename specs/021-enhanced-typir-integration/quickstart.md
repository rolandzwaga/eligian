# Quickstart Guide: Enhanced Typir Integration

**Feature**: Enhanced Typir Integration for IDE Support
**Branch**: `021-enhanced-typir-integration`
**Target Audience**: Developers implementing Typir custom types and validation

## Overview

This guide provides step-by-step instructions for implementing enhanced Typir integration with custom types, inference rules, and validation rules for Eligian DSL constructs.

**What You'll Build**:
- Custom Typir types (ImportType, TimelineEventType, TimelineType)
- Type inference rules for AST nodes
- Validation rules integrated with Langium
- Hover support showing type information
- Real-time validation in VS Code

**Prerequisites**:
- Familiarity with Langium framework
- Understanding of Typir basics (see [TYPIR_INTEGRATION_RESEARCH.md](../../TYPIR_INTEGRATION_RESEARCH.md))
- TypeScript 5.7+ knowledge
- Node.js 18+ environment

---

## Step 1: Project Setup

### 1.1 Verify Dependencies

Check that Typir packages are installed:

```bash
cd packages/language
pnpm list typir typir-langium
```

Expected output:
```
typir@1.0.0
typir-langium@1.0.0
```

### 1.2 Understand Current Structure

Review existing Typir integration:

```bash
ls -la src/type-system-typir/
```

Current files:
- `eligian-type-system.ts` - Main type system implementation
- `eligian-specifics.ts` - Type system specifics
- `README.md` - Current status (Phase 3 Complete - US1)

---

## Step 2: Create Custom Type Definitions

### 2.1 Create Types Directory

```bash
mkdir -p src/type-system-typir/types
```

### 2.2 Define ImportType (US1)

Create `src/type-system-typir/types/import-type.ts`:

```typescript
import { CustomKind } from 'typir';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * ImportType - Custom type for import statements
 */
export type ImportType = {
  assetType: 'html' | 'css' | 'media';
  path: string;
  isDefault: boolean;
};

/**
 * Create ImportType factory
 */
export function createImportTypeFactory(typir: TypirServices<EligianSpecifics>) {
  return new CustomKind<ImportType, EligianSpecifics>(typir, {
    name: 'Import',
    calculateTypeName: (props) => `Import<${props.assetType}>`,
  });
}
```

### 2.3 Define TimelineEventType (US3)

Create `src/type-system-typir/types/timeline-event-type.ts`:

```typescript
import { CustomKind } from 'typir';
import type { EligianSpecifics } from '../eligian-specifics.js';

/**
 * TimelineEventType - Custom type for timeline events
 */
export type TimelineEventType = {
  eventKind: 'timed' | 'sequence' | 'stagger';
  startTime: number;
  endTime?: number;
  duration?: number;
};

/**
 * Create TimelineEventType factory
 */
export function createEventTypeFactory(typir: TypirServices<EligianSpecifics>) {
  return new CustomKind<TimelineEventType, EligianSpecifics>(typir, {
    name: 'TimelineEvent',
    calculateTypeName: (props) => `${props.eventKind}Event`,
  });
}
```

### 2.4 Define TimelineType (US5)

Create `src/type-system-typir/types/timeline-type.ts`:

```typescript
import { CustomKind } from 'typir';
import type { EligianSpecifics } from '../eligian-specifics.js';
import type { TimelineEventType } from './timeline-event-type.js';

/**
 * TimelineType - Custom type for timeline configurations
 */
export type TimelineType = {
  provider: 'video' | 'audio' | 'raf' | 'custom';
  containerSelector: string;
  source?: string;
  events: TimelineEventType[];
};

/**
 * Create TimelineType factory
 */
export function createTimelineTypeFactory(typir: TypirServices<EligianSpecifics>) {
  return new CustomKind<TimelineType, EligianSpecifics>(typir, {
    name: 'Timeline',
    calculateTypeName: (props) => `Timeline<${props.provider}>`,
  });
}
```

---

## Step 3: Implement Inference Rules

### 3.1 Create Inference Directory

```bash
mkdir -p src/type-system-typir/inference
```

### 3.2 Import Inference (US1)

Create `src/type-system-typir/inference/import-inference.ts`:

```typescript
import type { DefaultImport, NamedImport } from '../../generated/ast.js';
import type { EligianTypeSystem } from '../eligian-type-system.js';
import { inferAssetTypeFromExtension } from '../utils/asset-type-inferrer.js';

/**
 * Register import inference rules
 */
export function registerImportInference(typeSystem: EligianTypeSystem) {
  const { typir, importFactory } = typeSystem;

  typir.Inference.addInferenceRulesForAstNodes({
    DefaultImport: (node: DefaultImport) => {
      const assetType = inferAssetTypeFromKeyword(node.type);
      return importFactory.create({
        properties: {
          assetType,
          path: node.path,
          isDefault: true,
        }
      }).finish().getTypeFinal()!;
    },

    NamedImport: (node: NamedImport) => {
      const assetType = node.assetType || inferAssetTypeFromExtension(node.path);
      return importFactory.create({
        properties: {
          assetType,
          path: node.path,
          isDefault: false,
        }
      }).finish().getTypeFinal()!;
    },
  });
}

function inferAssetTypeFromKeyword(keyword: string): 'html' | 'css' | 'media' {
  switch (keyword) {
    case 'layout': return 'html';
    case 'styles': return 'css';
    case 'provider': return 'media';
    default: return 'html';
  }
}
```

### 3.3 Constant Inference (US2)

Already implemented in `eligian-type-system.ts` - just enhance with reserved keyword check.

### 3.4 Event Inference (US3)

Create `src/type-system-typir/inference/event-inference.ts`:

```typescript
import type { TimedEvent, SequenceEvent, StaggerEvent } from '../../generated/ast.js';
import type { EligianTypeSystem } from '../eligian-type-system.js';
import { parseTimeExpression } from '../utils/time-parser.js';

/**
 * Register timeline event inference rules
 */
export function registerEventInference(typeSystem: EligianTypeSystem) {
  const { typir, eventFactory } = typeSystem;

  typir.Inference.addInferenceRulesForAstNodes({
    TimedEvent: (node: TimedEvent) => {
      return eventFactory.create({
        properties: {
          eventKind: 'timed',
          startTime: parseTimeExpression(node.startTime),
          endTime: node.endTime ? parseTimeExpression(node.endTime) : undefined,
        }
      }).finish().getTypeFinal()!;
    },

    SequenceEvent: (node: SequenceEvent) => {
      return eventFactory.create({
        properties: {
          eventKind: 'sequence',
          startTime: 0,
          duration: parseTimeExpression(node.duration),
        }
      }).finish().getTypeFinal()!;
    },

    StaggerEvent: (node: StaggerEvent) => {
      return eventFactory.create({
        properties: {
          eventKind: 'stagger',
          startTime: 0,
          duration: parseTimeExpression(node.duration),
        }
      }).finish().getTypeFinal()!;
    },
  });
}
```

---

## Step 4: Implement Validation Rules

### 4.1 Create Validation Directory

```bash
mkdir -p src/type-system-typir/validation
```

### 4.2 Import Validation (US1)

Create `src/type-system-typir/validation/import-validation.ts`:

```typescript
import { AstUtils } from 'langium';
import type { DefaultImport, NamedImport, Program } from '../../generated/ast.js';
import type { ValidationAcceptor } from 'typir-langium';
import { isDefaultImport, isNamedImport } from '../../utils/ast-helpers.js';
import { inferAssetTypeFromExtension } from '../utils/asset-type-inferrer.js';

/**
 * Register import validation rules
 */
export function registerImportValidation(typir: TypirServices) {
  typir.validation.Collector.addValidationRulesForAstNodes({
    DefaultImport: (node: DefaultImport, accept: ValidationAcceptor) => {
      // Check for duplicate default imports
      const program = AstUtils.getContainerOfType(node, isProgram);
      if (!program) return;

      const duplicates = program.statements.filter(
        s => isDefaultImport(s) && s.type === node.type && s !== node
      );

      if (duplicates.length > 0) {
        accept('error', `Duplicate '${node.type}' import`, {
          languageNode: node,
          languageProperty: 'type',
        });
      }
    },

    NamedImport: (node: NamedImport, accept: ValidationAcceptor) => {
      // Check for type mismatch
      if (node.assetType) {
        const inferred = inferAssetTypeFromExtension(node.path);
        if (inferred !== node.assetType) {
          accept('warning',
            `File extension suggests '${inferred}' but explicitly declared as '${node.assetType}'`,
            {
              languageNode: node,
              languageProperty: 'assetType',
            }
          );
        }
      }
    },
  });
}

function isProgram(node: unknown): node is Program {
  return typeof node === 'object' && node !== null && '$type' in node && node.$type === 'Program';
}
```

### 4.3 Constant Validation (US2)

Create `src/type-system-typir/validation/constant-validation.ts`:

```typescript
import type { VariableDeclaration } from '../../generated/ast.js';
import type { ValidationAcceptor } from 'typir-langium';
import { RESERVED_KEYWORDS } from '../../../contracts/typir-types.js';

/**
 * Register constant validation rules
 */
export function registerConstantValidation(typir: TypirServices) {
  typir.validation.Collector.addValidationRulesForAstNodes({
    VariableDeclaration: (node: VariableDeclaration, accept: ValidationAcceptor) => {
      // Check reserved keywords
      if (RESERVED_KEYWORDS.has(node.name)) {
        accept('error', `'${node.name}' is a reserved keyword`, {
          languageNode: node,
          languageProperty: 'name',
        });
      }
    },
  });
}
```

### 4.4 Event Validation (US3)

Create `src/type-system-typir/validation/event-validation.ts`:

```typescript
import { AstUtils } from 'langium';
import type { TimedEvent, Timeline } from '../../generated/ast.js';
import type { ValidationAcceptor } from 'typir-langium';
import { parseTimeExpression } from '../utils/time-parser.js';
import { eventsOverlap } from '../../../contracts/typir-types.js';

/**
 * Register timeline event validation rules
 */
export function registerEventValidation(typir: TypirServices) {
  typir.validation.Collector.addValidationRulesForAstNodes({
    TimedEvent: (node: TimedEvent, accept: ValidationAcceptor) => {
      const start = parseTimeExpression(node.startTime);
      const end = node.endTime ? parseTimeExpression(node.endTime) : undefined;

      // Validate start time
      if (start < 0) {
        accept('error', 'Start time cannot be negative', {
          languageNode: node,
          languageProperty: 'startTime',
        });
      }

      // Validate end time
      if (end !== undefined && end <= start) {
        accept('error', 'End time must be greater than start time', {
          languageNode: node,
          languageProperty: 'endTime',
        });
      }
    },

    Timeline: (node: Timeline, accept: ValidationAcceptor) => {
      // Detect overlapping events
      const timedEvents = node.events.filter(e => isTimedEvent(e));
      for (let i = 0; i < timedEvents.length; i++) {
        for (let j = i + 1; j < timedEvents.length; j++) {
          const e1 = inferEventType(timedEvents[i]);
          const e2 = inferEventType(timedEvents[j]);
          if (eventsOverlap(e1, e2)) {
            accept('warning',
              `Events overlap: [${formatTime(e1)}] and [${formatTime(e2)}]`,
              { languageNode: timedEvents[i] }
            );
          }
        }
      }
    },
  });
}

function formatTime(event: { startTime: number; endTime?: number }): string {
  return event.endTime !== undefined
    ? `${event.startTime}s→${event.endTime}s`
    : `${event.startTime}s`;
}
```

---

## Step 5: Create Utility Functions

### 5.1 Time Parser

Create `src/type-system-typir/utils/time-parser.ts`:

```typescript
/**
 * Parse time expression to seconds
 */
export function parseTimeExpression(expr: string): number {
  const match = expr.match(/^(\d+(?:\.\d+)?)(s|ms)$/);
  if (!match) return 0;

  const value = Number.parseFloat(match[1]);
  const unit = match[2];

  return unit === 'ms' ? value / 1000 : value;
}
```

### 5.2 Asset Type Inferrer

Create `src/type-system-typir/utils/asset-type-inferrer.ts`:

```typescript
/**
 * Infer asset type from file extension
 */
export function inferAssetTypeFromExtension(path: string): 'html' | 'css' | 'media' {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'css': return 'css';
    case 'html':
    case 'htm': return 'html';
    case 'mp4':
    case 'webm':
    case 'ogg':
    case 'mp3':
    case 'wav': return 'media';
    default: return 'html';
  }
}
```

---

## Step 6: Integrate with Main Type System

### 6.1 Update `eligian-type-system.ts`

Add new factories and register rules:

```typescript
import { createImportTypeFactory } from './types/import-type.js';
import { createEventTypeFactory } from './types/timeline-event-type.js';
import { createTimelineTypeFactory } from './types/timeline-type.js';
import { registerImportInference } from './inference/import-inference.js';
import { registerEventInference } from './inference/event-inference.js';
import { registerImportValidation } from './validation/import-validation.js';
import { registerConstantValidation } from './validation/constant-validation.js';
import { registerEventValidation } from './validation/event-validation.js';

export class EligianTypeSystem implements LangiumTypeSystemDefinition {
  // ... existing code ...

  onInitialize(): void {
    // ... existing factories ...

    // NEW: Create custom type factories
    this.importFactory = createImportTypeFactory(this.typirServices);
    this.eventFactory = createEventTypeFactory(this.typirServices);
    this.timelineFactory = createTimelineTypeFactory(this.typirServices);

    // NEW: Register inference rules
    registerImportInference(this);
    registerEventInference(this);

    // NEW: Register validation rules
    registerImportValidation(this.typirServices);
    registerConstantValidation(this.typirServices);
    registerEventValidation(this.typirServices);
  }
}
```

---

## Step 7: Write Tests (Test-First!)

### 7.1 Import Validation Tests

Create `src/__tests__/typir-import-validation.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDocument, validate } from './test-helpers.js';

describe('Typir Import Validation', () => {
  it('should infer css type for styles import', async () => {
    const doc = await parseDocument(`
      styles './main.css'
    `);

    const type = typir.Inference.inferType(doc.parseResult.value.statements[0]);
    expect(type.name).toBe('Import<css>');
  });

  it('should error on duplicate default imports', async () => {
    const doc = await parseDocument(`
      styles './a.css'
      styles './b.css'
    `);

    const diagnostics = await validate(doc);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('Duplicate');
  });

  // ... more tests ...
});
```

### 7.2 Run Tests

```bash
cd packages/language
pnpm test -- typir-import-validation
```

---

## Step 8: Verify IDE Integration

### 8.1 Build Extension

```bash
pnpm run build
```

### 8.2 Test in VS Code

1. Open VS Code
2. Open an `.eligian` file
3. Type `styles './main.css'`
4. Hover over the import statement
5. **Expected**: Hover shows "Import<css>"

### 8.3 Test Validation

1. Type two `layout` imports
2. **Expected**: Red squiggle on second import
3. **Expected**: Error message: "Duplicate 'layout' import"

---

## Common Issues & Solutions

### Issue 1: Type Not Inferred

**Symptom**: Hover shows nothing or "unknown"

**Solution**: Check that inference rule is registered in `onInitialize()`:

```typescript
registerImportInference(this);
```

### Issue 2: Validation Not Running

**Symptom**: No errors appear for invalid code

**Solution**: Check that validation rule is registered:

```typescript
registerImportValidation(this.typirServices);
```

### Issue 3: Circular Type Error

**Symptom**: `getTypeFinal()` returns `undefined`

**Solution**: Use callback pattern:

```typescript
factory.create({...}).finish().addListener(type => {
  // Use type here
});
```

---

## Performance Optimization

### Profiling

Measure Typir overhead:

```typescript
const start = performance.now();
await validate(doc);
const elapsed = performance.now() - start;
console.log(`Validation took: ${elapsed}ms`);
```

**Target**: < 50ms for 500-line documents

### Optimization Tips

1. **Cache inferred types**: Typir does this automatically
2. **Avoid deep AST traversal**: Use `AstUtils.getContainerOfType` sparingly
3. **Lazy validation**: Only validate what changed

---

## Next Steps

1. Complete US1-US2 (Phase 1): Import + Constant validation
2. Run full test suite: `pnpm test`
3. Verify coverage: `pnpm run test:coverage` (80%+ required)
4. Run Biome: `pnpm run check`
5. Proceed to US3 (Phase 2): Timeline event validation

## Resources

- [Typir Documentation](https://github.com/TypeFox/typir)
- [LOX Example](../../TYPIR_INTEGRATION_RESEARCH.md#lox-example-analysis)
- [Langium Docs](https://langium.org/)
- [Feature Spec](spec.md)
- [Data Model](data-model.md)
