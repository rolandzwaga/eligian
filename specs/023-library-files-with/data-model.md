# Data Model & Design: Library Files with Action Imports

**Feature**: 023-library-files-with
**Date**: 2025-11-02
**Purpose**: AST structures, validation rules, scoping design, and compilation strategy

---

## AST Node Structures

### Library Node

```typescript
interface Library extends AstNode {
  $type: 'Library';
  $container: undefined; // Root node
  name: string; // Library name (for future metadata)
  actions: ActionDeclaration[]; // At least one action required
}
```

**Grammar**:
```langium
Library:
    'library' name=ID
    (actions+=ActionDeclaration)+;
```

**Constraints**:
- Must have at least one action
- Cannot contain timelines, imports, or constants (enforced by grammar + validation)

---

### ImportStatement Node

```typescript
interface ImportStatement extends AstNode {
  $type: 'ImportStatement';
  $container: Program;
  actions: ActionImport[]; // List of actions to import
  path: string; // Relative path to library file (e.g., "./animations.eligian")
}
```

**Grammar**:
```langium
ImportStatement:
    'import' '{' actions+=ActionImport (',' actions+=ActionImport)* '}' 'from' path=STRING;
```

**Constraints**:
- Path must be valid .eligian file
- Must import at least one action

---

### ActionImport Node

```typescript
interface ActionImport extends AstNode {
  $type: 'ActionImport';
  $container: ImportStatement;
  name: string; // Name of action in library
  alias?: string; // Optional alias (for name collision resolution)
  ref?: Reference<ActionDeclaration>; // Cross-reference to library action
}
```

**Grammar**:
```langium
ActionImport:
    name=ID ('as' alias=ID)?;
```

**Constraints**:
- Referenced action must exist in library
- Referenced action must be public (not private)
- Alias must not conflict with local actions or other imports

---

### ActionDeclaration Enhancement

```typescript
interface ActionDeclaration extends AstNode {
  $type: 'ActionDeclaration';
  $container: Program | Library;
  visibility?: 'private'; // Optional, defaults to public
  endable?: boolean; // 'endable' keyword present
  name: string;
  params: Parameter[];
  body: ActionBody;
}
```

**Grammar Update**:
```langium
ActionDeclaration:
    (visibility='private')?
    ('endable')? 'action' name=ID
    ('(' params+=Parameter (',' params+=Parameter)* ')')?
    body=ActionBody;
```

**Constraints**:
- `visibility='private'` only allowed in Library files (not Program files)
- Name must not conflict with built-in operations
- Name must be unique within its container (Library or Program)

---

### Program Enhancement

```typescript
interface Program extends AstNode {
  $type: 'Program';
  $container: undefined; // Root node
  imports?: ImportStatement[]; // New: import statements
  constants?: ConstantDeclaration[];
  styles?: StyleImport[];
  actions: ActionDeclaration[];
  timelines: Timeline[]; // At least one timeline required
}
```

**Grammar Update**:
```langium
Program:
    (imports+=ImportStatement)*
    (constants+=ConstantDeclaration)*
    (styles+=StyleImport)*
    (actions+=ActionDeclaration)*
    (timelines+=Timeline)+;
```

**Constraints**:
- Must have at least one timeline
- Import statements processed before actions (dependency order)

---

## Validation Rules

### Rule Group 1: Library Constraint Validation

**V-001: Library Must Only Contain Actions**

```typescript
checkLibraryContent(library: Library, accept: ValidationAcceptor): void {
  // Grammar already prevents timelines/imports/constants in Library
  // This validator is defensive in case AST is manually constructed
  if (library.timelines?.length > 0) {
    accept('error', 'Library files cannot contain timelines', {
      node: library,
      code: 'library_invalid_content'
    });
  }
  if (library.imports?.length > 0) {
    accept('error', 'Library files cannot contain imports', {
      node: library,
      code: 'library_invalid_content'
    });
  }
  if (library.constants?.length > 0) {
    accept('error', 'Library files cannot contain constants', {
      node: library,
      code: 'library_invalid_content'
    });
  }
}
```

**V-002: Library Must Have At Least One Action**

```typescript
checkLibraryNotEmpty(library: Library, accept: ValidationAcceptor): void {
  if (library.actions.length === 0) {
    accept('warning', 'Library should contain at least one action', {
      node: library,
      property: 'name',
      code: 'library_empty'
    });
  }
}
```

---

### Rule Group 2: Import Validation

**V-003: Import File Must Exist**

```typescript
checkImportFileExists(importStmt: ImportStatement, accept: ValidationAcceptor): void {
  const libraryUri = UriUtils.resolve(importStmt.path, importStmt.$document.uri);
  const libraryDoc = this.documents.getDocument(libraryUri);

  if (!libraryDoc) {
    accept('error', `Library file not found: ${importStmt.path}`, {
      node: importStmt,
      property: 'path',
      code: 'import_file_not_found'
    });
    return;
  }

  // Check for parse errors
  if (libraryDoc.parseResult.lexerErrors.length > 0 ||
      libraryDoc.parseResult.parserErrors.length > 0) {
    accept('error', `Library file has syntax errors: ${importStmt.path}`, {
      node: importStmt,
      property: 'path',
      code: 'import_invalid_file'
    });
  }
}
```

**V-004: Imported Actions Must Exist in Library**

```typescript
checkImportedActionsExist(importStmt: ImportStatement, accept: ValidationAcceptor): void {
  const library = this.loadLibrary(importStmt.path, importStmt.$document.uri);
  if (!library) return; // Already reported by V-003

  for (const actionImport of importStmt.actions) {
    const action = library.actions.find(a => a.name === actionImport.name);

    if (!action) {
      accept('error', `Action '${actionImport.name}' not found in library '${importStmt.path}'`, {
        node: actionImport,
        property: 'name',
        code: 'import_action_not_found'
      });
    }
  }
}
```

**V-005: Imported Actions Must Be Public**

```typescript
checkImportedActionsPublic(importStmt: ImportStatement, accept: ValidationAcceptor): void {
  const library = this.loadLibrary(importStmt.path, importStmt.$document.uri);
  if (!library) return;

  for (const actionImport of importStmt.actions) {
    const action = library.actions.find(a => a.name === actionImport.name);

    if (action && action.visibility === 'private') {
      accept('error', `Cannot import private action '${actionImport.name}' from library '${importStmt.path}'`, {
        node: actionImport,
        property: 'name',
        code: 'import_private_action'
      });
    }
  }
}
```

---

### Rule Group 3: Name Collision Detection

**V-006: Action Names Must Not Conflict with Built-in Operations**

```typescript
checkActionNameConflict(action: ActionDeclaration, accept: ValidationAcceptor): void {
  const builtinOps = this.operationRegistry.getAllOperations();

  if (builtinOps.has(action.name)) {
    accept('error', `Action name '${action.name}' conflicts with built-in operation`, {
      node: action,
      property: 'name',
      code: 'action_conflicts_builtin'
    });
  }
}
```

**V-007: Imported Actions Must Not Conflict with Local Actions**

```typescript
checkImportConflictsLocal(program: Program, accept: ValidationAcceptor): void {
  const localActionNames = new Set(program.actions.map(a => a.name));

  for (const importStmt of program.imports ?? []) {
    for (const actionImport of importStmt.actions) {
      const effectiveName = actionImport.alias ?? actionImport.name;

      if (localActionNames.has(effectiveName)) {
        accept('error', `Action '${effectiveName}' is already defined locally`, {
          node: actionImport,
          property: actionImport.alias ? 'alias' : 'name',
          code: 'action_conflicts_local'
        });
      }
    }
  }
}
```

**V-008: Imported Actions Must Not Conflict with Each Other**

```typescript
checkImportConflicts(program: Program, accept: ValidationAcceptor): void {
  const importedNames = new Map<string, ActionImport>(); // name -> first import

  for (const importStmt of program.imports ?? []) {
    for (const actionImport of importStmt.actions) {
      const effectiveName = actionImport.alias ?? actionImport.name;

      const existing = importedNames.get(effectiveName);
      if (existing) {
        accept('error', `Duplicate import: '${effectiveName}' is already imported`, {
          node: actionImport,
          property: actionImport.alias ? 'alias' : 'name',
          code: 'action_conflicts_import'
        });
      } else {
        importedNames.set(effectiveName, actionImport);
      }
    }
  }
}
```

---

### Rule Group 4: Visibility Validation

**V-009: Private Keyword Only in Libraries**

```typescript
checkVisibilityOnlyInLibrary(action: ActionDeclaration, accept: ValidationAcceptor): void {
  if (action.visibility === 'private') {
    const container = action.$container;

    if (!isLibrary(container)) {
      accept('error', "Visibility modifier 'private' can only be used in library files", {
        node: action,
        property: 'visibility',
        code: 'private_only_in_library'
      });
    }
  }
}
```

---

### Rule Group 5: Duplicate Action Detection

**V-010: Action Names Must Be Unique Within Container**

```typescript
checkDuplicateActions(container: Program | Library, accept: ValidationAcceptor): void {
  const actionNames = new Map<string, ActionDeclaration>();

  for (const action of container.actions) {
    const existing = actionNames.get(action.name);

    if (existing) {
      accept('error', `Duplicate action name: '${action.name}'`, {
        node: action,
        property: 'name',
        code: 'duplicate_action_name'
      });
    } else {
      actionNames.set(action.name, action);
    }
  }
}
```

---

## Scoping Design

### Custom Scope Provider

```typescript
export class EligianScopeProvider extends DefaultScopeProvider {
  private documents: LangiumDocuments;
  private uriResolver: UriUtils;

  override getScope(context: ReferenceInfo): Scope {
    const referenceType = this.reflection.getReferenceType(context);

    // Handle ActionImport.ref → ActionDeclaration reference
    if (referenceType === ActionDeclaration && isActionImport(context.container)) {
      return this.getScopeForActionImport(context);
    }

    // Standard scoping for other references
    return super.getScope(context);
  }

  private getScopeForActionImport(context: ReferenceInfo): Scope {
    const actionImport = context.container as ActionImport;
    const importStmt = actionImport.$container as ImportStatement;
    const currentDocUri = importStmt.$document.uri;

    // Resolve library URI
    const libraryUri = this.uriResolver.resolve(importStmt.path, currentDocUri);
    const libraryDoc = this.documents.getDocument(libraryUri);

    if (!libraryDoc || !libraryDoc.parseResult.value) {
      return EMPTY_SCOPE;
    }

    const library = libraryDoc.parseResult.value as Library;

    // Filter public actions only
    const publicActions = library.actions.filter(a => a.visibility !== 'private');

    // Create scope from public actions
    return this.createScope(publicActions);
  }
}
```

**Key Points**:
- Overrides `getScope()` to intercept ActionImport references
- Loads library document using Langium's document infrastructure
- Filters private actions from scope (only public actions available)
- Returns `EMPTY_SCOPE` if library not found (validation handles errors)

---

## Compilation Design

### Import Resolution Algorithm

```typescript
function resolveImports(
  program: Program,
  documents: LangiumDocuments
): ActionDeclaration[] {
  const importedActions: ActionDeclaration[] = [];

  for (const importStmt of program.imports ?? []) {
    // Resolve library URI
    const libraryUri = UriUtils.resolve(importStmt.path, program.$document.uri);
    const libraryDoc = documents.getDocument(libraryUri);

    if (!libraryDoc) {
      // Validation already reported error
      continue;
    }

    const library = libraryDoc.parseResult.value as Library;

    // Process each imported action
    for (const actionImport of importStmt.actions) {
      const action = library.actions.find(a => a.name === actionImport.name);

      if (!action) {
        // Validation already reported error
        continue;
      }

      // Handle aliasing
      const resolvedAction: ActionDeclaration = actionImport.alias
        ? { ...action, name: actionImport.alias } // Create new node with alias name
        : action; // Use original action

      importedActions.push(resolvedAction);
    }
  }

  return importedActions;
}
```

**Key Points**:
- Skips invalid imports (validation handles errors)
- Creates new ActionDeclaration nodes for aliased imports (preserves original library action)
- Returns flattened list of imported actions ready for merging

---

### Action Merging Strategy

```typescript
export function transformProgram(
  program: Program,
  documents: LangiumDocuments
): EligiusConfig {
  // Step 1: Resolve imports
  const importedActions = resolveImports(program, documents);

  // Step 2: Merge with local actions
  const allActions = [...program.actions, ...importedActions];

  // Step 3: Build action registry (for name resolution during timeline transformation)
  const actionRegistry = new Map<string, ActionDeclaration>();
  for (const action of allActions) {
    actionRegistry.set(action.name, action);
  }

  // Step 4: Transform timelines (uses action registry)
  const timelines = program.timelines.map(t =>
    transformTimeline(t, actionRegistry, documents)
  );

  // Step 5: Transform actions (includes imported actions)
  const actions = allActions.map(a => transformAction(a, documents));

  return {
    timelines,
    actions
  };
}
```

**Key Points**:
- Imported actions merged into program's action list
- Action registry includes all actions (local + imported)
- Existing transformation logic handles all actions identically
- No special handling for imported actions (guaranteed identical compilation)

---

### Aliasing Transformation

```typescript
// When importing with alias:
// import { fadeIn as fade } from "./lib.eligian"
//
// The resolveImports() function creates a NEW ActionDeclaration:
const resolvedAction: ActionDeclaration = {
  ...originalAction, // Copy all properties
  name: 'fade' // Override name with alias
};

// In timeline transformation:
// timeline "Test" at 0s {
//   at 0s fade("#box")  // Uses alias name
// }
//
// Name resolution finds aliased action in registry:
const action = actionRegistry.get('fade'); // Finds the aliased action

// Action compiled using standard logic:
const operation = {
  systemName: 'requestAction',
  operationData: {
    actionName: 'fade', // Uses alias name in output
    parameters: transformParameters(actionCall.arguments)
  }
};
```

**Key Points**:
- Aliased actions are new AST nodes (not references)
- Name resolution uses alias name
- Compilation output includes alias name (not original name)
- Transparent to existing transformation logic

---

## IDE Integration Design

### Completion Provider Enhancement

```typescript
export class EligianCompletionProvider extends DefaultCompletionProvider {
  override async completion(params: CompletionParams): Promise<CompletionList> {
    const items = await super.completion(params);

    // Detect if completing inside import statement
    const context = this.getCompletionContext(params);
    if (context.isImportStatement) {
      // Add action completions from library scope
      const libraryActions = this.getLibraryActions(context.importPath);
      const actionCompletions = libraryActions.map(action => ({
        label: action.name,
        kind: CompletionItemKind.Function,
        detail: action.endable ? 'Endable Action' : 'Action',
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.formatActionDocumentation(action)
        },
        insertText: action.name
      }));

      items.items.push(...actionCompletions);
    }

    return items;
  }

  private getLibraryActions(importPath: string): ActionDeclaration[] {
    // Use scope provider to get filtered actions
    // (private actions already filtered out by scope provider)
    // ...implementation...
  }
}
```

**Key Points**:
- Extends existing completion provider
- Detects import statement context
- Uses scope provider (automatically filters private actions)
- Displays JSDoc documentation in completion items

---

### Hover Provider (No Changes)

Langium's default hover provider handles cross-references automatically:
- Follows ActionImport.ref to library action
- Displays JSDoc documentation from referenced action
- Works without custom code

---

### Definition Provider (No Changes)

Langium's default definition provider navigates cross-references:
- Ctrl+Click on imported action → jumps to library file
- Works without custom code

---

## Error Codes Reference

| Code | Severity | Message Template | Recovery |
|------|----------|------------------|----------|
| `library_invalid_content` | error | "Library files cannot contain {type}" | Remove disallowed content |
| `library_empty` | warning | "Library should contain at least one action" | Add actions |
| `import_file_not_found` | error | "Library file not found: {path}" | Fix import path |
| `import_invalid_file` | error | "Library file has syntax errors: {path}" | Fix library syntax |
| `import_action_not_found` | error | "Action '{name}' not found in library '{path}'" | Fix action name or add to library |
| `import_private_action` | error | "Cannot import private action '{name}' from library '{path}'" | Remove import or make action public |
| `action_conflicts_builtin` | error | "Action name '{name}' conflicts with built-in operation" | Rename action |
| `action_conflicts_local` | error | "Action '{name}' is already defined locally" | Use alias or rename action |
| `action_conflicts_import` | error | "Duplicate import: '{name}' is already imported" | Use alias or remove duplicate |
| `private_only_in_library` | error | "Visibility modifier 'private' can only be used in library files" | Remove `private` or move to library |
| `duplicate_action_name` | error | "Duplicate action name: '{name}'" | Rename action |

---

## Performance Considerations

1. **Document Caching**: Langium automatically caches parsed documents (no re-parsing on repeated imports)
2. **Scope Provider Caching**: Langium caches scope results (filtering only happens once per file)
3. **Import Resolution Caching**: Consider caching resolved imports per program (optimization if needed)
4. **Large Libraries**: Profile with 50+ action libraries, optimize if needed

---

## Next Steps (Phase 2: Task Breakdown)

**Prerequisites Met**: All design decisions documented, AST structures defined, validation rules specified, scoping and compilation strategies documented.

**Ready for `/speckit.tasks` to generate implementation task breakdown.**

---

**Design Completed**: 2025-11-02
**Next Phase**: Task Breakdown (tasks.md via `/speckit.tasks` command)
