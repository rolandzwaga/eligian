# Research: Library Files with Action Imports

**Feature**: 023-library-files-with
**Date**: 2025-11-02
**Purpose**: Technical research for implementing library file support in Eligian DSL

---

## Overview

This document captures technical research findings for implementing library files with action imports. Research covers Langium scoping patterns, grammar disambiguation strategies, import resolution approaches, and compilation integration.

---

## Research Area 1: Langium Scoping for Cross-File References

### Question
How does Langium handle cross-file references, and how can we implement custom scope providers to filter exports based on visibility (public/private)?

### Decision
**Use Langium's DefaultScopeProvider with custom override to filter private actions from exports.**

Langium provides a `DefaultScopeProvider` class that handles standard scoping logic. We override the `getScope()` method to:
1. Detect when resolving references in import statements
2. Load the referenced library file using Langium's document loading infrastructure
3. Filter the library's actions based on visibility (exclude `private` actions)
4. Return a custom scope containing only public actions

### Rationale
- **Built-in infrastructure**: Langium's document loading and caching infrastructure handles file resolution, parsing, and performance
- **Familiarity**: Overriding `DefaultScopeProvider` follows Langium's recommended extension pattern
- **Flexibility**: Custom scope logic allows complex visibility filtering without modifying core Langium code
- **Performance**: Langium automatically caches parsed documents, so repeated imports don't re-parse files

### Alternatives Considered

**1. Manual Document Loading**
- Rejected: Re-implements Langium's caching and URI resolution logic
- Harder to maintain, potential performance issues, duplicates Langium functionality

**2. Pre-processing Phase**
- Rejected: Separate pre-pass to collect all exports before validation
- Adds complexity, breaks Langium's incremental validation model, harder to maintain consistency

**3. Global Export Registry**
- Rejected: Maintain global registry of all library exports
- Race conditions in multi-file editing, stale data issues, harder to keep synchronized

### Implementation Notes

```typescript
export class EligianScopeProvider extends DefaultScopeProvider {
  override getScope(context: ReferenceInfo): Scope {
    const referenceType = this.reflection.getReferenceType(context);

    // Handle import statement action references
    if (referenceType === ActionDeclaration && isActionImport(context.container)) {
      const importStmt = getContainerOfType(context.container, isImportStatement);
      if (!importStmt) return EMPTY_SCOPE;

      // Resolve library document
      const libraryUri = this.uriResolver.resolve(importStmt.path, context.document.uri);
      const libraryDoc = this.documents.getDocument(libraryUri);
      if (!libraryDoc) return EMPTY_SCOPE;

      // Filter public actions only
      const library = libraryDoc.parseResult.value as Library;
      const publicActions = library.actions.filter(a => a.visibility !== 'private');

      return this.createScope(publicActions);
    }

    return super.getScope(context);
  }
}
```

**Key Langium APIs**:
- `DefaultScopeProvider.getScope()`: Override point for custom scoping
- `DocumentProvider.getDocument()`: Load referenced documents
- `UriResolver.resolve()`: Resolve relative paths to absolute URIs
- `createScope()`: Build Langium scope from filtered AST nodes

---

## Research Area 2: Grammar Disambiguation Strategy

### Question
How should we distinguish library files from program files at parse time? Should `library` and `Program` be separate entry rules or variants?

### Decision
**Use a single entry rule with a union type: `entry EligianFile: Program | Library;`**

This approach:
1. Single entry point accepts both file types
2. Parser automatically disambiguates based on `library` keyword presence
3. Validation enforces constraints (Library can't have timelines, Program must have timelines)

### Rationale
- **Clean disambiguation**: `library` keyword makes file type explicit and unambiguous
- **Single parser**: No need for different parsers or multi-pass parsing
- **Backward compatible**: Existing program files (without `library` keyword) parse as `Program`
- **Future-proof**: Easy to add more file types (e.g., `module`, `config`) as union members

### Alternatives Considered

**1. Separate Entry Rules with Parser Selection**
- Rejected: Requires file extension or pre-parsing to choose entry rule
- More complex, error-prone, harder to maintain

**2. Program with Optional `library` Flag**
- Rejected: Ambiguous whether file is library or program (both would have same structure)
- Validation more complex, less explicit intent

**3. Different File Extensions (`.eliglib` vs `.eligian`)**
- Rejected: Fragments ecosystem, confuses users, harder to configure IDEs
- Still need grammar disambiguation for parsing

### Implementation Notes

```langium
entry EligianFile:
    Program | Library;

Program:
    (imports+=ImportStatement)*
    (constants+=ConstantDeclaration)*
    (styles+=StyleImport)*
    (actions+=ActionDeclaration)*
    (timelines+=Timeline)+;  // At least one timeline required

Library:
    'library' name=ID
    (actions+=ActionDeclaration)+;  // At least one action required
```

**Key Points**:
- `Program` requires at least one timeline (enforced by grammar)
- `Library` requires `library` keyword and at least one action
- Both are valid entry points, parser chooses based on first token
- File extension remains `.eligian` for both (no fragmentation)

---

## Research Area 3: Import Resolution Strategy

### Question
How should we resolve relative import paths, load library files, handle missing files, and optimize performance with caching?

### Decision
**Use Langium's built-in URI resolution and document loading infrastructure with error handling for missing files.**

Approach:
1. **Path Resolution**: Use `UriUtils.resolve()` to convert relative paths to absolute URIs (platform-agnostic)
2. **Document Loading**: Use `LangiumDocuments.getDocument()` to load and parse library files (automatic caching)
3. **Missing Files**: Check if document exists and is valid, report validation error if missing
4. **Caching**: Rely on Langium's document cache (no custom caching needed)

### Rationale
- **Platform-agnostic**: Langium's URI utilities handle Windows/Unix path differences
- **Performance**: Langium caches parsed documents automatically (no re-parsing on repeated imports)
- **Consistency**: Same infrastructure used for all cross-file references (no custom file loading)
- **Error handling**: Langium's validation framework integrates seamlessly with document loading errors

### Alternatives Considered

**1. Node.js fs.readFile() + Custom Parsing**
- Rejected: Bypasses Langium's caching, requires custom error handling, platform-specific paths
- Re-implements Langium functionality, harder to maintain

**2. Custom Document Cache**
- Rejected: Langium already provides document caching
- Duplicates functionality, risk of cache inconsistency

**3. Symbolic Links / Aliases**
- Rejected: Adds filesystem complexity, platform-specific behavior
- Harder for users to understand, breaks on some file systems

### Implementation Notes

```typescript
// Resolve import path relative to current file
const importPath = importStatement.path; // "./animations.eligian"
const currentDocUri = document.uri; // "file:///project/src/main.eligian"
const libraryUri = UriUtils.resolve(importPath, currentDocUri); // "file:///project/src/animations.eligian"

// Load library document (cached by Langium)
const libraryDoc = this.documents.getDocument(libraryUri);

if (!libraryDoc) {
  // File not found
  accept('error', `Library file not found: ${importPath}`, {
    node: importStatement,
    property: 'path',
    code: 'import_file_not_found'
  });
  return;
}

if (libraryDoc.parseResult.lexerErrors.length > 0 || libraryDoc.parseResult.parserErrors.length > 0) {
  // Library file has parse errors
  accept('error', `Library file has syntax errors: ${importPath}`, {
    node: importStatement,
    property: 'path',
    code: 'import_invalid_file'
  });
  return;
}

// Access library actions
const library = libraryDoc.parseResult.value as Library;
// ... validate imported actions exist ...
```

**Key Langium APIs**:
- `UriUtils.resolve(path, baseUri)`: Resolve relative paths to absolute URIs
- `LangiumDocuments.getDocument(uri)`: Load and parse document (cached)
- `document.parseResult.lexerErrors/parserErrors`: Check for syntax errors

---

## Research Area 4: Export Filtering Strategy

### Question
How should we filter private actions from scope exports and provide "Did you mean?" suggestions when private actions are attempted to be imported?

### Decision
**Filter private actions in scope provider, provide explicit error message when private action is imported (no "Did you mean?" for private actions).**

Approach:
1. **Filtering**: In `getScope()`, filter `library.actions` to exclude `visibility === 'private'`
2. **Error Handling**: If imported action exists but is private, report dedicated error (not "action not found")
3. **No Suggestions**: Don't suggest private actions as alternatives (they can't be imported)

### Rationale
- **Clear intent**: Private actions shouldn't appear in suggestions (even as "Did you mean?")
- **Explicit errors**: When attempting to import private action, error message explains it's private (not missing)
- **Simplicity**: Filtering at scope level is simple and efficient
- **Encapsulation**: Users shouldn't even know private action names (no leaking implementation details)

### Alternatives Considered

**1. Include Private Actions in Suggestions**
- Rejected: Leaks implementation details, confuses users ("Why is it suggested if I can't use it?")
- Violates encapsulation principle

**2. Two-Pass Validation (Check Existence, Then Privacy)**
- Rejected: More complex, requires tracking intermediate validation state
- Error messages less clear ("Action exists but is private" vs "Private action cannot be imported")

**3. Warning Instead of Error**
- Rejected: Importing private actions should be hard error (not warning)
- Defeats purpose of private visibility

### Implementation Notes

```typescript
// In scope provider
const publicActions = library.actions.filter(a => a.visibility !== 'private');
return this.createScope(publicActions);

// In validator (explicit check for private actions)
for (const actionImport of importStmt.actions) {
  const allActions = library.actions; // Include private for explicit check
  const action = allActions.find(a => a.name === actionImport.name);

  if (!action) {
    // Action doesn't exist
    accept('error', `Action '${actionImport.name}' not found in library '${importStmt.path}'`, {
      node: actionImport,
      property: 'name',
      code: 'import_action_not_found'
    });
  } else if (action.visibility === 'private') {
    // Action exists but is private
    accept('error', `Cannot import private action '${actionImport.name}' from library '${importStmt.path}'`, {
      node: actionImport,
      property: 'name',
      code: 'import_private_action'
    });
  }
}
```

**Key Points**:
- Scope provider filters for auto-completion (only public actions)
- Validator explicitly checks for private actions (better error messages)
- No "Did you mean?" suggestions for private actions (enforce encapsulation)

---

## Research Area 5: Compilation Strategy

### Question
How should we resolve imported actions during AST transformation, merge them into the program AST, and ensure they compile identically to locally-defined actions?

### Decision
**Resolve imports during AST transformation pre-pass, merge imported actions into program's action list, then compile normally.**

Approach:
1. **Pre-pass**: Before transforming timeline events, resolve all imports and collect imported actions
2. **Merging**: Add imported actions to `program.actions` array (aliased actions use alias name)
3. **Normal Compilation**: Existing transformer treats imported actions identically to local actions
4. **No Special Handling**: Imported actions compile using same logic as local actions (guaranteed identical output)

### Rationale
- **Identical compilation**: Imported actions use exact same transformation logic as local actions
- **Simplicity**: No special cases in transformer, no "imported action" tracking
- **Correctness**: Merging actions into program AST ensures name resolution works identically
- **Maintainability**: Single code path for action compilation (easier to maintain)

### Alternatives Considered

**1. Separate Import Transformation Phase**
- Rejected: Duplicates action transformation logic, risk of divergence
- Harder to maintain, more complex, potential for bugs

**2. Inline Expansion at Call Site**
- Rejected: Duplicates action operations at every call site (bloated output)
- Breaks action request/start pattern, harder to debug

**3. External Action Registry**
- Rejected: Actions stored separately from program AST
- Breaks existing name resolution, requires custom resolution logic

### Implementation Notes

```typescript
// Pre-pass: Resolve imports
function resolveImports(program: Program, documents: LangiumDocuments): ActionDeclaration[] {
  const importedActions: ActionDeclaration[] = [];

  for (const importStmt of program.imports ?? []) {
    // Load library document
    const libraryUri = UriUtils.resolve(importStmt.path, program.$document.uri);
    const libraryDoc = documents.getDocument(libraryUri);
    if (!libraryDoc) continue; // Validation already caught this

    const library = libraryDoc.parseResult.value as Library;

    // Collect imported actions (with aliasing)
    for (const actionImport of importStmt.actions) {
      const action = library.actions.find(a => a.name === actionImport.name);
      if (!action) continue; // Validation already caught this

      // If aliased, create new action node with alias name
      const resolvedAction: ActionDeclaration = actionImport.alias
        ? { ...action, name: actionImport.alias } // Shallow copy with new name
        : action;

      importedActions.push(resolvedAction);
    }
  }

  return importedActions;
}

// Main transformation
export function transformProgram(program: Program, documents: LangiumDocuments): EligiusConfig {
  // Resolve imports and merge into program
  const importedActions = resolveImports(program, documents);
  const allActions = [...program.actions, ...importedActions];

  // Build action registry (includes imported actions)
  const actionRegistry = buildActionRegistry(allActions);

  // Transform timelines (uses action registry for name resolution)
  const timelines = program.timelines.map(t => transformTimeline(t, actionRegistry));

  return {
    timelines,
    actions: allActions.map(a => transformAction(a)) // Includes imported actions
  };
}
```

**Key Points**:
- Imported actions added to program's action array (not separate)
- Aliased actions create new ActionDeclaration nodes with alias name
- Existing transformation logic handles all actions identically
- Action registry includes imported actions (name resolution works)

---

## Research Area 6: IDE Integration Patterns

### Question
What are the best practices for integrating library support with Langium's completion, hover, and definition providers?

### Decision
**Extend existing providers with minimal changes - leverage Langium's cross-reference resolution for free navigation.**

Approach:
1. **Completion Provider**: Add logic to suggest actions when completing import statements (use scope provider filtering)
2. **Hover Provider**: No changes needed (cross-references automatically show documentation from library files)
3. **Definition Provider**: No changes needed (Langium's default definition provider handles cross-file navigation)

### Rationale
- **Minimal changes**: Langium's infrastructure handles most IDE features automatically
- **Consistency**: Cross-file navigation works identically to within-file navigation
- **Maintainability**: Less custom code, easier to maintain as Langium evolves
- **Performance**: Langium's caching and incremental parsing optimize IDE responsiveness

### Alternatives Considered

**1. Custom Hover Provider for Imported Actions**
- Rejected: Langium already shows documentation for cross-references
- Duplicates functionality, potential inconsistency

**2. Custom Definition Provider**
- Rejected: Langium's default definition provider handles cross-file navigation
- Re-implements built-in functionality

**3. Inline Documentation Expansion**
- Rejected: Copies JSDoc from library into importing file's metadata
- Wastes memory, harder to keep synchronized

### Implementation Notes

**Completion Provider Extension**:
```typescript
export class EligianCompletionProvider extends DefaultCompletionProvider {
  override async completion(params: CompletionParams): Promise<CompletionList> {
    const completionItems = await super.completion(params);

    // Check if completing import statement
    if (isInImportStatement(params.textDocument, params.position)) {
      // Get library actions from scope provider (already filtered for public only)
      const scope = this.scopeProvider.getScope(/* import context */);
      const actionCompletions = scope.getAllElements().map(elem => ({
        label: elem.name,
        kind: CompletionItemKind.Function,
        detail: elem.type === 'endable action' ? 'Endable Action' : 'Action',
        documentation: extractJSDoc(elem.node) // Use existing JSDoc extraction
      }));

      completionItems.items.push(...actionCompletions);
    }

    return completionItems;
  }
}
```

**Hover Provider** (No Changes Needed):
- Langium's default hover provider follows cross-references automatically
- Displays JSDoc documentation from referenced action in library file
- Works out-of-the-box with import statements

**Definition Provider** (No Changes Needed):
- Langium's default definition provider navigates to referenced AST nodes
- When user navigates to imported action, jumps to library file automatically
- No custom code required

**Key Langium APIs**:
- `DefaultCompletionProvider.completion()`: Override for custom completion logic
- Cross-reference resolution: Automatic (no custom code needed)
- JSDoc extraction: Reuse existing `extractJSDoc()` utility

---

## Summary Table

| Research Area | Decision | Key Benefit |
|---------------|----------|-------------|
| Cross-File Scoping | Override DefaultScopeProvider | Filters private actions, uses built-in caching |
| Grammar Disambiguation | Union entry rule: `Program \| Library` | Clean disambiguation, backward compatible |
| Import Resolution | Use Langium's URI utils + document loading | Platform-agnostic, automatic caching |
| Export Filtering | Filter in scope provider, explicit private errors | Clear encapsulation, no leaking implementation |
| Compilation Strategy | Merge imports into program AST pre-pass | Identical compilation, single code path |
| IDE Integration | Extend completion only, reuse others | Minimal changes, consistent behavior |

---

## Next Steps (Phase 1: Design & Contracts)

1. **Grammar Design**: Document AST node structures (Library, ImportStatement, ActionImport)
2. **Validation Design**: Document all validation rules and error codes
3. **Scoping Design**: Document custom scope provider implementation
4. **Compilation Design**: Document import resolution and action merging algorithm
5. **IDE Integration Design**: Document completion provider changes
6. **Quickstart Guide**: Create user-facing guide for library creation and usage

**Prerequisites Met**: All research questions answered, decisions documented, ready for design phase.

---

**Research Completed**: 2025-11-02
**Next Phase**: Design & Contracts (data-model.md, quickstart.md)
