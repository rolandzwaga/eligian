# Research: Asset Import Syntax

**Date**: 2025-10-25
**Feature**: Asset Import Syntax
**Research Tasks**: R001-R005 from plan.md

## R001: Langium Grammar Patterns for Import Statements

**Question**: What's the correct Langium grammar pattern for parsing import statements with optional type overrides?

**Research Findings**:

From Langium documentation, import statements should use:

1. **Alternatives** (`|`) for default imports vs. named imports
2. **Optional clauses** (`?`) for the `as type` suffix
3. **Keywords** to distinguish different import types

**Decision**: Use two separate parser rules with clear keywords:

```langium
// Default imports (layout, styles, provider)
DefaultImport:
    type=('layout' | 'styles' | 'provider') path=STRING;

// Named imports with optional type override
NamedImport:
    'import' name=ID 'from' path=STRING ('as' assetType=('html' | 'css' | 'media'))?;
```

**Rationale**:
- Keywords (`layout`, `styles`, `provider`, `import`) make parser unambiguous
- Optional `as` clause uses `?` operator (Langium standard pattern)
- Alternatives `|` for enum-like values (type and assetType)
- `STRING` terminal for paths (defined with quotes in grammar)

**Langium Reference**: [Grammar Language Reference - Alternatives](https://langium.org/docs/reference/grammar-language)

---

## R002: Path Validation Strategies

**Question**: Should relative path validation be done at grammar level (terminals) or validator level (functions)?

**Research Findings**:

Langium supports two approaches:

1. **Grammar-level validation**: Define custom STRING terminal with regex
2. **Validator-level validation**: Use standard STRING, validate in validator

**Decision**: Validator-level validation

```langium
// Use standard STRING terminal (accepts any quoted string)
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

// Validate path format in validator function
```

**Rationale**:
- Grammar-level regex would be complex and hard to maintain
- Better error messages possible with validators (can explain what's wrong)
- Validator approach follows Constitution Principle X (Compiler-First Validation)
- Can provide helpful hints ("use './' prefix for relative paths")
- Easier to test (validator functions are pure functions)

**Langium Reference**: [Validation Documentation](https://langium.org/docs/reference/document-lifecycle#validation)

**Implementation Pattern**:
```typescript
// Validator function (pure, testable)
function validateRelativePath(path: string): PathError | undefined {
    if (path.startsWith('/')) {
        return { code: 'ABSOLUTE_PATH', message: 'Path must be relative...', hint: '...' };
    }
    // More validations...
}

// Langium validator (thin adapter)
checkImportPath(import: DefaultImport | NamedImport, accept: ValidationAcceptor): void {
    const error = validateRelativePath(import.path);
    if (error) {
        accept('error', `${error.message}. ${error.hint}`, { node: import, property: 'path' });
    }
}
```

---

## R003: Type Inference from File Extensions

**Question**: Where should type inference logic live? Grammar, validator, or separate utility?

**Research Findings**:

Type inference requires logic (mapping extensions to types), which belongs in code, not grammar.

**Decision**: Separate utility module

Location: `packages/language/src/utils/asset-type-inference.ts`

```typescript
// Pure function for type inference
export function inferAssetType(path: string): AssetType | undefined {
    const ext = path.match(/\.([^.]+)$/)?.[1]?.toLowerCase();

    const extensionMap: Record<string, AssetType> = {
        'html': 'html',
        'css': 'css',
        'mp4': 'media',
        'webm': 'media',
        'mp3': 'media',
        'wav': 'media',
        // .ogg excluded - ambiguous, requires explicit type
    };

    return extensionMap[ext];
}
```

**Rationale**:
- Grammar cannot perform logic (only pattern matching)
- Utility function is pure, testable in isolation
- Can be reused by both validator and future compiler features
- Easy to extend with new extensions
- Case-insensitive handling (`.HTML` → `.html`)
- Follows functional programming principles (pure function)

**Testing Strategy**:
```typescript
// Unit tests for type inference
describe('inferAssetType', () => {
    it('infers HTML from .html extension', () => {
        expect(inferAssetType('./file.html')).toBe('html');
    });

    it('handles case-insensitive extensions', () => {
        expect(inferAssetType('./file.HTML')).toBe('html');
    });

    it('returns undefined for unknown extensions', () => {
        expect(inferAssetType('./file.xyz')).toBeUndefined();
    });
});
```

---

## R004: AST Node Structure for Imports

**Question**: How should import AST nodes be structured to support both default and named imports?

**Research Findings**:

Langium generates TypeScript interfaces from grammar rules. Two approaches:

1. **Separate interfaces**: `DefaultImport` and `NamedImport` (recommended)
2. **Union type**: Single `Import` type with discriminated union

**Decision**: Separate interfaces with shared base

```langium
// Grammar rules
DefaultImport:
    type=('layout' | 'styles' | 'provider') path=STRING;

NamedImport:
    'import' name=ID 'from' path=STRING ('as' assetType=('html' | 'css' | 'media'))?;
```

**Generated AST** (automatic from Langium):
```typescript
// Generated by Langium from grammar
interface DefaultImport extends AstNode {
    type: 'layout' | 'styles' | 'provider';
    path: string;
}

interface NamedImport extends AstNode {
    name: string;
    path: string;
    assetType?: 'html' | 'css' | 'media';
}

// Union type for validators
type ImportStatement = DefaultImport | NamedImport;
```

**Rationale**:
- Clean separation of concerns (default vs. named imports)
- Type-safe access to properties (`import.type` only exists on `DefaultImport`)
- Langium automatically generates types from grammar
- Easy to validate: type narrowing with `is*` helper functions
- Matches user mental model (two distinct import syntaxes)

**Type Guards** (for validators):
```typescript
function isDefaultImport(node: AstNode): node is DefaultImport {
    return node.$type === 'DefaultImport';
}

function isNamedImport(node: AstNode): node is NamedImport {
    return node.$type === 'NamedImport';
}
```

---

## R005: Integration with Existing Grammar

**Question**: Where should import statements fit in the existing Eligian grammar? Top-level only?

**Research Findings**:

From existing Eligian grammar (`eligian.langium`), the entry rule is:

```langium
entry EligianDocument:
    (actions+=Action | timeline=Timeline)+;
```

Import statements should be top-level declarations, appearing before actions and timeline.

**Decision**: Extend entry rule with optional imports

```langium
entry EligianDocument:
    (imports+=ImportStatement)* // NEW: imports at top
    (actions+=Action | timeline=Timeline)+;

ImportStatement:
    DefaultImport | NamedImport;

DefaultImport:
    type=('layout' | 'styles' | 'provider') path=STRING;

NamedImport:
    'import' name=ID 'from' path=STRING ('as' assetType=('html' | 'css' | 'media'))?;
```

**Rationale**:
- Imports appear before actions/timeline (matches ES modules convention)
- Optional (`*`) - maintains backward compatibility (existing files without imports still parse)
- Import scoping is document-wide (top-level only, not inside actions)
- Follows Langium best practice: entry rule contains document structure

**Backward Compatibility**:
```eligian
// Old file (no imports) - still valid
action fadeIn [
    selectElement(".box")
]

timeline {
    at 0s..5s fadeIn()
}
```

```eligian
// New file (with imports) - valid
layout './layout.html'
import tooltip from './tooltip.html'

action fadeIn [
    selectElement(".box")
]

timeline {
    at 0s..5s fadeIn()
}
```

**Langium Reference**: [Grammar Structure - Entry Rules](https://langium.org/docs/reference/grammar-language#entry-rules)

---

## Summary of Technical Decisions

| Decision Area | Chosen Approach | Rationale |
|---------------|----------------|-----------|
| **Grammar Pattern** | Separate rules for default/named imports | Clear keywords, unambiguous parsing |
| **Path Validation** | Validator-level (not grammar) | Better error messages, testable |
| **Type Inference** | Separate utility module | Pure function, reusable, testable |
| **AST Structure** | Separate interfaces (`DefaultImport`, `NamedImport`) | Type-safe, clean separation |
| **Grammar Integration** | Extend entry rule with `imports` array | Backward compatible, top-level scope |

---

## Next Steps

All research questions resolved. Proceed to:

1. **Phase 1**: Generate data-model.md (AST node structure details)
2. **Phase 1**: Generate contracts/ (grammar rules and validator signatures)
3. **Phase 1**: Generate quickstart.md (usage examples)
4. **Phase 1**: Update agent context
5. **Phase 2**: Generate tasks.md (via `/speckit.tasks`)

---

## References

- [Langium Grammar Language Reference](https://langium.org/docs/reference/grammar-language)
- [Langium Semantic Model Documentation](https://langium.org/docs/reference/semantic-model)
- [Langium Validation Documentation](https://langium.org/docs/reference/document-lifecycle#validation)
- Context7 Library: `/eclipse-langium/langium-website` (348 code snippets)
