# Data Model: HTML Element Completion

**Feature**: 043-html-element-completion
**Date**: 2025-12-01

## Entities

### HTMLElementMetadata

Represents metadata for a single HTML element type.

| Field | Type | Description |
|-------|------|-------------|
| `tagName` | `string` | The HTML tag name (e.g., "a", "div", "input") |
| `interfaceName` | `string` | TypeScript interface name (e.g., "HTMLAnchorElement") |
| `attributes` | `HTMLAttributeMetadata[]` | Element-specific attributes |

**Constraints**:
- `tagName` must be a valid HTML5 element name
- `tagName` is unique (primary key)
- `interfaceName` corresponds to DOM interface in TypeScript lib

### HTMLAttributeMetadata

Represents metadata for a single HTML attribute.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Attribute name (e.g., "href", "type", "disabled") |
| `type` | `'string' \| 'number' \| 'boolean' \| 'enum'` | Value type |
| `enumValues` | `string[]` (optional) | Valid values when `type='enum'` |
| `description` | `string` (optional) | Brief description for tooltip |
| `required` | `boolean` (optional) | Whether attribute is typically required |

**Constraints**:
- `name` must be a valid HTML attribute name
- `enumValues` required when `type='enum'`
- `enumValues` empty/undefined when `type!='enum'`

### HTMLCompletionContext

Represents the detected completion context for createElement.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `HTMLCompletionContextType` | Context type enum |
| `elementName` | `string` (optional) | Detected element name (for attr contexts) |
| `attributeName` | `string` (optional) | Detected attribute name (for value context) |
| `partialText` | `string` (optional) | Text typed so far for filtering |

**Context Types**:
```typescript
enum HTMLCompletionContextType {
  None = 'None',
  ElementName = 'ElementName',       // createElement("|")
  AttributeName = 'AttributeName',   // createElement("div", { | })
  AttributeValue = 'AttributeValue', // createElement("div", { type: "|" })
}
```

## Relationships

```
HTMLElementMetadata (112 elements)
    │
    └──< HTMLAttributeMetadata (many per element)
             │
             └── enumValues (many per enum attribute)

HTMLCompletionContext
    │
    ├── references → HTMLElementMetadata (via elementName)
    │
    └── references → HTMLAttributeMetadata (via attributeName)
```

## State Transitions

### Completion Context State Machine

```
[No Context]
     │
     ▼ (cursor enters createElement first arg)
[ElementName]
     │
     ▼ (element selected, cursor in second arg)
[AttributeName]
     │
     ▼ (cursor enters attribute value)
[AttributeValue]
     │
     ▼ (value selected)
[AttributeName] (back to attribute context)
```

## Validation Rules

### Element Name Validation
- Must be one of 112 standard HTML elements
- Case-insensitive matching (normalize to lowercase)
- Unknown elements fall back to generic HTMLElement attributes

### Attribute Name Validation
- Must be valid for the specified element type
- Include both element-specific and common HTMLElement attributes
- Case-sensitive (HTML attributes are case-insensitive but conventional)

### Attribute Value Validation
- For enum types: must be one of enumValues
- For boolean: "true" or "false" (or attribute presence)
- For string/number: any valid literal

## Generated Data Statistics

| Category | Count | Notes |
|----------|-------|-------|
| HTML Elements | 112 | From HTMLElementTagNameMap |
| Common Attributes | ~15 | Shared across all elements |
| Element-Specific Attrs | ~1500 total | Average ~13 per element |
| Enumerated Attributes | ~25 | With string literal types |
| Enum Values | ~150 total | Average ~6 per enum |
