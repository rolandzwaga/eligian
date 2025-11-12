# Phase 0 Research: Event Action Code Completion

**Feature**: 030-event-action-code
**Date**: 2025-11-12
**Status**: Complete

## Research Questions

1. **LSP Snippet Syntax**: How do we use LSP snippets to position cursor inside action body after generation?
2. **Typir Integration**: Should we use Typir to model event action types for parameter type checking (User Story 3)?
3. **camelCase Conversion**: What's the cleanest algorithm for converting hyphenated event names to camelCase?
4. **Event Metadata Access**: How do we access event metadata (arguments, types) for skeleton generation?

## Findings

### 1. LSP Snippet Syntax

**Decision**: Use VS Code snippet syntax with `CompletionItem.insertTextFormat = InsertTextFormat.Snippet`.

**Snippet Syntax**:
```typescript
const skeleton = `on event "${eventName}" action ${actionName}(${params}) [\n\t$0\n]`;
completionItem.insertText = skeleton;
completionItem.insertTextFormat = InsertTextFormat.Snippet;
```

**Placeholders**:
- `$0` - Final cursor position (inside action body)
- `$1`, `$2`, etc. - Tab stops (not needed for this feature)
- `${1:default}` - Tab stop with default value

**Rationale**: LSP snippet format is standard across all language servers. The `$0` placeholder positions the cursor inside the empty action body after generation. Langium's `CompletionItem` already supports this via `insertTextFormat` field.

**Alternatives Considered**:
- Plain text insertion with manual cursor positioning - Rejected: No standard way to position cursor after insertion
- Command-based approach - Rejected: Unnecessarily complex for simple cursor positioning

**Example**:
```typescript
{
  label: 'language-change',
  kind: CompletionItemKind.Event,
  insertText: 'on event "language-change" action handleLanguageChange(languageCode: string) [\n\t$0\n]',
  insertTextFormat: InsertTextFormat.Snippet
}
```

### 2. Typir Integration for Event Action Parameter Type Checking

**Decision**: Do NOT use Typir for this feature. Use existing type system (`packages/language/src/type-system/`).

**Rationale**:
1. **Existing Type System Sufficient**: The existing type system (`type-system/inference.ts`, `type-system/types.ts`) already handles parameter type checking for actions. Event action parameters are identical to regular action parameters - just populated from metadata instead of user input.

2. **Typir is for AST Type Inference**: Typir excels at inferring types from AST node relationships (operations, variables, expressions). Event action parameters have **explicit types from metadata** - no inference needed. The metadata already provides `{name: string, type: string}` for each parameter.

3. **Avoid Unnecessary Abstraction**: Creating a Typir `EventActionType` would add complexity without benefit. The existing `Parameter` AST nodes with type annotations work perfectly.

4. **Type Checking Already Works**: The validator (`eligian-validator.ts`) already checks parameter types against operation requirements. Event action parameters will automatically benefit from existing type validation when used in operation calls.

**Implementation Approach**:
- Parse event action parameters as regular `Parameter` AST nodes with type annotations from metadata
- Existing type system (`inferParameterType()` in `type-system/inference.ts`) handles type checking
- No new Typir types needed

**Alternatives Considered**:
- Create Typir `EventActionType` - Rejected: Over-engineering for explicit types from metadata
- Extend Typir inference rules - Rejected: No inference needed, types are explicit

**User Story 3 Impact**: US3 (parameter type inference) is satisfied by existing type system. No Typir integration required.

### 3. camelCase Conversion Algorithm

**Decision**: Use simple regex-based conversion: split on hyphens, capitalize each word except first, join.

**Algorithm**:
```typescript
function eventNameToCamelCase(eventName: string): string {
  const parts = eventName.split('-');
  return parts
    .map((part, index) => 
      index === 0 
        ? part.toLowerCase() 
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

function generateActionName(eventName: string): string {
  const camelCaseName = eventNameToCamelCase(eventName);
  return `handle${camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1)}`;
}
```

**Examples**:
- `"language-change"` → `handleLanguageChange`
- `"before-request-video-url"` → `handleBeforeRequestVideoUrl`
- `"timeline-play"` → `handleTimelinePlay`

**Rationale**: Simple, readable, handles all hyphenated event names correctly. No external dependencies needed.

**Alternatives Considered**:
- lodash.camelCase - Rejected: Unnecessary dependency for simple string manipulation
- Manual character-by-character parsing - Rejected: Less readable than split/map/join

### 4. Event Metadata Access

**Decision**: Use existing `TIMELINE_EVENTS` export from `timeline-events.generated.ts`.

**Access Pattern**:
```typescript
import { TIMELINE_EVENTS, type TimelineEventMetadata } from './completion/metadata/timeline-events.generated.js';

function findEventMetadata(eventName: string): TimelineEventMetadata | undefined {
  return TIMELINE_EVENTS.find(event => event.name === eventName);
}
```

**Metadata Structure**:
```typescript
interface EventArgMetadata {
  name: string;
  type: string;
}

interface TimelineEventMetadata {
  name: string;
  description: string;
  category?: string;
  args?: EventArgMetadata[];
}
```

**Parameter Generation**:
```typescript
function generateParameters(args: EventArgMetadata[] | undefined): string {
  if (!args || args.length === 0) return '';
  
  return args
    .map(arg => `${arg.name}: ${arg.type}`)
    .join(', ');
}
```

**Rationale**: Metadata is already structured exactly as needed. No parsing or transformation required.

## Technology Choices

| Technology | Decision | Rationale |
|------------|----------|-----------|
| LSP Snippets | Use `InsertTextFormat.Snippet` with `$0` placeholder | Standard LSP feature, positions cursor correctly |
| Typir Integration | Do NOT use Typir | Existing type system sufficient, explicit types from metadata |
| camelCase Conversion | Custom regex-based function | Simple, no dependencies, handles all cases |
| Event Metadata | Use existing `TIMELINE_EVENTS` array | Already structured correctly, no transformation needed |

## Dependencies

**No new dependencies required**. Feature uses existing infrastructure:
- Langium LSP types (`vscode-languageserver`)
- Event metadata (`timeline-events.generated.ts` - Feature 028)
- Existing type system (`type-system/inference.ts`)

## Performance Considerations

- **Event Metadata Lookup**: O(n) linear search through 43 events (acceptable - fast enough)
- **camelCase Conversion**: O(n) where n = event name length (negligible)
- **Skeleton Generation**: String concatenation (instant)
- **Overall Completion Time**: <50ms (well under 300ms requirement)

## Implementation Notes

1. **Skeleton Generation Module**: Create `completion/event-action-skeleton.ts` with pure functions for name conversion and skeleton generation
2. **Integration Point**: Modify `getEventNameCompletions()` in `completion/events.ts` to return skeleton completion items instead of plain event names
3. **Testing Strategy**: Unit tests for name conversion, integration tests for full completion workflow using `eventActionProgram()` helper
4. **Example File**: Add event action examples to `examples/demo.eligian` per Principle XXIV

## Research Validation

All research questions answered. No blocking unknowns remain. Ready for Phase 1 design.
