# Research: Label File Creation Quick Fix

**Feature**: 039-label-file-creation-quickfix
**Date**: 2025-11-24
**Status**: Complete

## Overview

This document consolidates research findings for implementing the label file creation quick fix feature. All technical unknowns from the Technical Context section have been resolved through codebase analysis.

## Research Questions

### Q1: How does the existing code actions system work?

**Decision**: Extend the existing `EligianCodeActionProvider` in `eligian-code-actions.ts` with a new code action for creating missing labels files.

**Rationale**:
- The codebase already has a code actions infrastructure at `packages/language/src/eligian-code-actions.ts`
- Current implementation provides quick fixes for other scenarios (based on TECHNICAL_OVERVIEW.md mentioning "eligian-code-actions.ts - Quick fixes (260 lines)")
- Langium provides `CodeActionProvider` interface for adding quick fixes
- Code actions are triggered by diagnostics (validation errors/warnings)

**Alternatives Considered**:
- **Create separate quick fix system**: Rejected because it would duplicate infrastructure and complicate maintenance
- **Use VS Code commands directly**: Rejected because code actions integrate better with LSP and provide consistent UX

**Implementation Approach**:
1. Add new diagnostic code for "missing labels file" in `eligian-validator.ts`
2. Extend `EligianCodeActionProvider` to detect this diagnostic
3. Create `CodeAction` with title "Create labels file" and appropriate command
4. Link to command that executes file creation logic

### Q2: What is the path normalization logic in the asset loading module?

**Decision**: Reuse the `resolveAssetPath()` function from the asset-loading module for consistent path normalization.

**Rationale**:
- TECHNICAL_OVERVIEW.md section 7 ("Asset Loading & Validation") describes path normalization for CSS, HTML, labels, and library imports
- The spec explicitly requires: "Path normalization logic from TECHNICAL_OVERVIEW.md (must be reused to ensure consistency with how paths are resolved for validation)"
- Using the same path resolution as validation ensures that created files are found by the validator
- Prevents bugs where created files are not recognized due to path mismatch

**Alternatives Considered**:
- **Implement custom path resolution**: Rejected because it would lead to inconsistencies and duplicate code
- **Use Node.js `path` module directly**: Rejected because asset loading has special handling for relative paths (resolved relative to Eligian file, not CWD)

**Implementation Details**:
- Import from: `packages/language/src/asset-loading/compiler-integration.ts` or similar
- Function signature (inferred): `resolveAssetPath(importPath: string, documentUri: string): string`
- Returns absolute file system path suitable for file operations

### Q3: How is the custom label editor registered and invoked?

**Decision**: Use the existing VS Code command for opening the label editor (assumption: command already exists from previous feature implementation).

**Rationale**:
- Spec's Dependencies section states: "Label editor must be registered and functional in the VS Code extension"
- Spec's Notes section states: "The custom label editor is assumed to be already implemented as part of a previous feature"
- VS Code commands are the standard way to trigger editor actions
- Commands can be invoked from language server via `executeCommand` LSP method

**Alternatives Considered**:
- **Open file in default editor**: Rejected because spec explicitly requires opening in "custom label editor"
- **Implement editor opening logic inline**: Rejected because violates separation of concerns (language server shouldn't know about editor details)

**Implementation Approach**:
1. Language server provides code action with command: `eligian.createLabelsFile`
2. Extension package registers command handler in `extension/main.ts`
3. Command handler:
   - Receives file path and content from command arguments
   - Creates file using VS Code workspace file system API
   - Invokes label editor command: `eligian.openLabelEditor` (or similar)
4. Fallback: If label editor command doesn't exist, open in default JSON editor

### Q4: What format should the template entry use for labels files?

**Decision**: Use the Eligius labels schema format with structure: `[{"id": "example.label", "language-code": "Placeholder text", ...}]`

**Rationale**:
- Spec FR-007 explicitly defines the structure
- TECHNICAL_OVERVIEW.md mentions "Labels JSON imports" with "schema validation (labels JSON with AJV)"
- The schema is documented at `packages/language/src/asset-loading/validators/label-import-validator.ts` (per TECHNICAL_OVERVIEW.md section 7)
- Consistency with existing validation ensures generated files pass validation

**Alternatives Considered**:
- **Use different schema**: Rejected because spec and validation are already defined
- **Generate multiple example entries**: Rejected because spec says "an example entry" (singular) - one entry is sufficient for learning

**Template Structure**:
```json
[]  // No languages block

[
  {
    "id": "example.label",
    "nl-NL": "Voorbeeld NL",
    "en-US": "Example EN"
  }
]  // With languages block (nl-NL, en-US)
```

**Placeholder Text Pattern**: `"{Language Name} {Code}"` (e.g., "Example EN" for en-US, "Voorbeeld NL" for nl-NL)

### Q5: How should languages block detection work?

**Decision**: Check if the Program AST node has a non-empty `languages` property (assuming grammar includes this).

**Rationale**:
- Feature 037 (Languages Syntax) and Feature 038 (Language Quick Fixes) already implement languages block parsing
- AST should have a `languages` property on the `Program` node
- Can extract language codes from the languages block for template generation

**Alternatives Considered**:
- **Parse file again with regex**: Rejected because AST is already available and more reliable
- **Use validation state**: Rejected because we need the actual language codes, not just presence/absence

**Implementation Approach**:
1. Access `program.languages` from the AST
2. If undefined/empty → no languages block → use empty array
3. If present → extract language codes → generate template with all codes
4. First language code (definition order) becomes default in template

### Q6: How to create files and directories from the language server?

**Decision**: Language server provides code action with command; extension package handles file creation using VS Code workspace API.

**Rationale**:
- Language servers typically don't perform file I/O directly (security and sandboxing concerns)
- VS Code's `workspace.fs` API provides safe file system access with proper error handling
- Separation of concerns: language server detects issue, extension performs action

**Alternatives Considered**:
- **Use Node.js fs module in language server**: Rejected because language server should remain platform-agnostic and side-effect-free
- **Use workspace edits**: Rejected because workspace edits are for document changes, not file creation

**Implementation Approach**:
1. Language server code action includes command: `eligian.createLabelsFile`
2. Command arguments: `{ filePath: string, content: string, documentUri: string }`
3. Extension command handler:
   ```typescript
   const fileUri = vscode.Uri.file(filePath);
   await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(filePath)));
   await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
   await vscode.commands.executeCommand('eligian.openLabelEditor', fileUri);
   ```

### Q7: What error handling is needed for file creation?

**Decision**: Handle three error categories: path validation, permission errors, file system errors. Display appropriate error messages to user via `window.showErrorMessage`.

**Rationale**:
- Spec FR-011 requires: "System MUST handle path resolution errors gracefully (e.g., invalid characters, permission issues)"
- Edge cases section lists: "Read-only directory or insufficient permissions", "Path invalid on current OS"
- Good UX requires specific error messages with actionable guidance

**Error Categories**:
1. **Path Validation Errors** (before file creation):
   - Invalid characters for OS
   - Path too long (OS limits)
   - Error message: "Invalid file path: {reason}. Please check the labels import path."

2. **Permission Errors**:
   - Directory creation failed (permission denied)
   - File write failed (permission denied)
   - Error message: "Cannot create labels file: Permission denied. Please check folder permissions for {path}."

3. **File System Errors**:
   - Disk full
   - Network drive unavailable
   - Unexpected I/O errors
   - Error message: "Failed to create labels file: {error message}. Please try again."

**Implementation Approach**:
```typescript
try {
  await createDirectories(dirPath);
  await writeFile(filePath, content);
  await openLabelEditor(filePath);
} catch (error) {
  if (error.code === 'EACCES') {
    vscode.window.showErrorMessage(`Cannot create labels file: Permission denied.`);
  } else if (error.code === 'EINVAL') {
    vscode.window.showErrorMessage(`Invalid file path: ${error.message}`);
  } else {
    vscode.window.showErrorMessage(`Failed to create labels file: ${error.message}`);
  }
}
```

## Best Practices

### Langium Code Actions

**Source**: Langium documentation + existing codebase patterns

**Key Patterns**:
1. **Diagnostic-Driven**: Code actions should be triggered by specific diagnostic codes
2. **Lazy Computation**: Only compute fixes when requested (not during validation)
3. **Command Pattern**: Use commands for actions requiring extension context
4. **Async Execution**: Code action execution can be async (returns Promise)

**Example Structure**:
```typescript
class EligianCodeActionProvider implements CodeActionProvider {
  getCodeActions(document, range, context): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code === 'missing_labels_file') {
        actions.push(this.createLabelsFileAction(diagnostic, document));
      }
    }

    return actions;
  }

  private createLabelsFileAction(diagnostic, document): CodeAction {
    return {
      title: 'Create labels file',
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        command: 'eligian.createLabelsFile',
        title: 'Create labels file',
        arguments: [/* ... */]
      }
    };
  }
}
```

### VS Code File System API

**Source**: VS Code API documentation

**Key APIs**:
- `workspace.fs.createDirectory(uri)` - Creates directory and parents
- `workspace.fs.writeFile(uri, content)` - Writes file (creates if doesn't exist)
- `workspace.fs.stat(uri)` - Checks file existence
- All methods return `Thenable<void>` (Promise-like)

**Error Handling**:
- `FileSystemError.FileExists` - File already exists
- `FileSystemError.FileNotFound` - Parent directory doesn't exist
- `FileSystemError.NoPermissions` - Insufficient permissions
- Catch with try/catch on async/await

### Path Normalization

**Source**: TECHNICAL_OVERVIEW.md + Node.js path module

**Key Principles**:
1. **Relative paths**: Resolved relative to the Eligian file's directory (not CWD)
2. **Absolute paths**: Used as-is after validation
3. **Platform handling**: Use `path.normalize()` for cross-platform compatibility
4. **URI conversion**: Convert file paths to VS Code URIs for API calls

**Pattern**:
```typescript
// From label-import-validator.ts (inferred)
function resolveLabelsPath(importPath: string, documentUri: string): string {
  const documentDir = path.dirname(URI.parse(documentUri).fsPath);
  const absolutePath = path.isAbsolute(importPath)
    ? importPath
    : path.resolve(documentDir, importPath);
  return path.normalize(absolutePath);
}
```

## Technical Decisions Summary

| Question | Decision | Rationale |
|----------|----------|-----------|
| Code actions integration | Extend `EligianCodeActionProvider` | Reuse existing infrastructure, consistent with codebase patterns |
| Path normalization | Reuse `resolveAssetPath()` from asset loading | Ensure consistency with validation, avoid duplicate logic |
| Label editor invocation | Use existing VS Code command | Separation of concerns, assumes feature already implemented |
| Labels file format | Eligius schema with AJV validation | Match existing validation, ensure generated files are valid |
| Languages block detection | Check `program.languages` AST property | Reliable, already parsed by grammar |
| File creation approach | Extension command handler with `workspace.fs` | Security, proper error handling, platform-agnostic language server |
| Error handling strategy | Three categories with specific messages | Good UX, actionable guidance per spec requirements |

## Dependencies Confirmed

1. ✅ **Existing code actions system** - `eligian-code-actions.ts` exists (TECHNICAL_OVERVIEW.md)
2. ✅ **Path normalization logic** - Asset loading module has this (TECHNICAL_OVERVIEW.md section 7)
3. ✅ **Languages block parsing** - Features 037-038 implemented this
4. ⚠️ **Label editor command** - Assumed to exist; fallback to default editor if not
5. ✅ **VS Code workspace API** - Standard API, always available
6. ✅ **Eligius labels schema** - Defined in label-import-validator.ts

## Implementation Readiness

All technical unknowns have been resolved. Ready to proceed to **Phase 1: Design & Contracts**.

**Next Steps**:
1. Generate data-model.md (entity definitions)
2. Generate contracts/ (API schemas for command arguments)
3. Generate quickstart.md (developer guide)
4. Update agent context
