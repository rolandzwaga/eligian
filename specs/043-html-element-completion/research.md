# Research: HTML Element Completion for createElement

**Feature**: 043-html-element-completion
**Date**: 2025-12-01

## Research Questions

### Q1: How to extract HTML element and attribute metadata from TypeScript?

**Decision**: Use TypeScript Compiler API to introspect `lib.dom.d.ts` at build time

**Rationale**:
- TypeScript's DOM lib contains the authoritative `HTMLElementTagNameMap` interface
- The Compiler API allows programmatic access to type information
- Build-time generation ensures metadata stays in sync with TypeScript version
- Generated file can be committed or regenerated on demand

**Alternatives Considered**:
1. **Hardcode element list**: Rejected - would drift from TypeScript definitions over time
2. **Runtime introspection**: Rejected - not possible in Node.js (no DOM), would add runtime overhead
3. **MDN web scraping**: Rejected - fragile, requires network, may differ from TypeScript types

**Implementation Approach**:
```typescript
// scripts/generate-html-metadata.ts
import * as ts from 'typescript';

// 1. Create program with lib.dom.d.ts
const program = ts.createProgram(['lib.dom.d.ts'], { lib: ['lib.dom.d.ts'] });
const checker = program.getTypeChecker();

// 2. Find HTMLElementTagNameMap interface
// 3. For each property (element name → interface):
//    - Get the interface (e.g., HTMLAnchorElement)
//    - Extract properties (href, target, etc.)
//    - Filter to DOM attributes (exclude methods, inherited from EventTarget, etc.)
// 4. Output to html-elements.generated.ts
```

### Q2: Which attributes should be included for each element?

**Decision**: Include element-specific attributes plus commonly-used HTMLElement attributes

**Rationale**:
- Element-specific attributes (e.g., `href` on `<a>`) are most valuable
- Generic HTMLElement attributes (id, className, style, etc.) apply to all elements
- Exclude inherited methods, event handlers (onclick, etc.), and internal properties

**Filtering Strategy**:
1. **Include**: Properties that are `string | number | boolean` types
2. **Include**: Properties with enumerated string literal types
3. **Exclude**: Methods (functions)
4. **Exclude**: Event handlers (`on*` properties)
5. **Exclude**: Readonly internal properties (`tagName`, `nodeName`, etc.)
6. **Exclude**: Deprecated attributes (marked with `@deprecated`)

**Common HTMLElement attributes to always include**:
- `id`, `className`, `title`, `lang`, `dir`
- `hidden`, `tabIndex`, `draggable`, `contentEditable`
- `style` (as string for inline styles)
- `dataset` (excluded - complex type)

### Q3: How to handle enumerated attribute values?

**Decision**: Extract string literal union types and provide as value completions

**Rationale**:
- TypeScript defines many attributes with literal types (e.g., `type: "text" | "password" | ...`)
- These provide excellent completion candidates
- Users benefit from seeing valid values without consulting documentation

**Key Enumerated Attributes**:

| Element | Attribute | Values |
|---------|-----------|--------|
| `input` | `type` | text, password, checkbox, radio, email, number, date, file, hidden, submit, button, ... |
| `a` | `target` | _self, _blank, _parent, _top |
| `a` | `rel` | noopener, noreferrer, nofollow, ... |
| `img` | `loading` | eager, lazy |
| `img` | `decoding` | sync, async, auto |
| `form` | `method` | get, post |
| `form` | `enctype` | application/x-www-form-urlencoded, multipart/form-data, text/plain |
| `script` | `type` | module, text/javascript |
| `button` | `type` | submit, reset, button |
| `textarea` | `wrap` | hard, soft |

### Q4: How to detect createElement context in the completion provider?

**Decision**: Follow CSS context detection pattern with multi-level detection

**Rationale**:
- Existing `css/context-detection.ts` provides proven pattern
- Need to detect: (1) inside elementName parameter, (2) inside attributes object, (3) inside attribute value

**Context Detection Strategy**:
```typescript
enum HTMLCompletionContext {
  None,           // Not in createElement
  ElementName,    // createElement("|")
  AttributeName,  // createElement("div", { | })
  AttributeValue, // createElement("div", { id: "|" })
}

function detectHTMLContext(context: CompletionContext): {
  type: HTMLCompletionContext;
  elementName?: string;      // For AttributeName/AttributeValue contexts
  attributeName?: string;    // For AttributeValue context
}
```

**Detection Logic**:
1. Find enclosing `OperationCall` node
2. Check if operation name is `createElement`
3. Determine cursor position relative to arguments:
   - First argument string → `ElementName`
   - Second argument object literal → `AttributeName`
   - Inside object property value → `AttributeValue`
4. Extract `elementName` by parsing first argument
5. Extract `attributeName` by finding enclosing property assignment

### Q5: How should the generated metadata be structured?

**Decision**: Single TypeScript file with typed constants

**Rationale**:
- TypeScript provides type safety for consumers
- Single file simplifies imports
- Can be tree-shaken if needed
- Follows existing `operations.generated.ts` pattern

**Generated File Structure**:
```typescript
// html-elements.generated.ts

/** All valid HTML element tag names */
export const HTML_ELEMENT_NAMES = [
  'a', 'abbr', 'address', /* ... 112 total */
] as const;

export type HTMLElementName = typeof HTML_ELEMENT_NAMES[number];

/** Attribute metadata for each HTML element */
export interface HTMLAttributeMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  enumValues?: readonly string[];  // For type='enum'
  description?: string;
}

export interface HTMLElementMetadata {
  tagName: string;
  interfaceName: string;  // e.g., 'HTMLAnchorElement'
  attributes: readonly HTMLAttributeMetadata[];
}

/** Element-specific attributes (excludes common HTMLElement attrs) */
export const HTML_ELEMENT_ATTRIBUTES: Record<HTMLElementName, HTMLElementMetadata> = {
  a: {
    tagName: 'a',
    interfaceName: 'HTMLAnchorElement',
    attributes: [
      { name: 'href', type: 'string' },
      { name: 'target', type: 'enum', enumValues: ['_self', '_blank', '_parent', '_top'] },
      { name: 'download', type: 'string' },
      // ...
    ]
  },
  // ... all 112 elements
};

/** Common attributes inherited from HTMLElement (apply to all elements) */
export const COMMON_HTML_ATTRIBUTES: readonly HTMLAttributeMetadata[] = [
  { name: 'id', type: 'string' },
  { name: 'className', type: 'string' },
  { name: 'title', type: 'string' },
  { name: 'hidden', type: 'boolean' },
  { name: 'tabIndex', type: 'number' },
  // ...
];
```

### Q6: What is the estimated size of generated metadata?

**Decision**: Acceptable - estimated 50-100KB generated file

**Analysis**:
- 112 elements
- Average ~30 attributes per element (including inherited)
- ~10 enumerated attributes with ~10 values each
- Estimated: 112 × 30 × 50 bytes = ~168KB uncompressed
- After minification/tree-shaking: ~50KB

**Mitigation if too large**:
- Split into element-specific chunks (lazy load)
- Store only element-specific attrs, compute inherited at runtime
- Use shorter property names in generated code

## Summary

All research questions resolved. The implementation will:

1. **Build-time generator**: TypeScript Compiler API extracts metadata from `lib.dom.d.ts`
2. **Generated metadata**: Single `.generated.ts` file with element names, attributes, and enum values
3. **Context detection**: Follow CSS pattern - detect elementName, attributeName, attributeValue positions
4. **Completion provider**: Integrate with `EligianCompletionProvider` following CSS completion pattern
5. **Filtering**: Include relevant attributes, exclude methods/events/deprecated/internal properties
