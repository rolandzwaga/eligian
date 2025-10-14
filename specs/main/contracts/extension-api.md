# VS Code Extension API Contract

**Date**: 2025-10-14
**Component**: VS Code Extension

## Overview

The VS Code extension provides integrated language support for Eligius DSL files (`.eli`). It includes syntax highlighting, validation, autocompletion, on-the-fly compilation, and debugging support.

## Extension Metadata

**Name**: Eligius DSL
**ID**: `eligius.eligius-dsl`
**Publisher**: `eligius`
**Version**: `1.0.0`
**Display Name**: Eligius DSL Language Support
**Description**: Language support and compiler integration for Eligius Story Telling Engine DSL

## File Association

**File Extension**: `.eli`
**Language ID**: `eligius-dsl`
**MIME Type**: `text/x-eligius-dsl`

## Features

### 1. Syntax Highlighting

**Scope**: All `.eli` files

**Supported Constructs**:
- Keywords: `timeline`, `event`, `at`, `from`, `with`, `show`, `hide`, `animate`, `trigger`
- Providers: `video`, `audio`, `raf`, `custom`
- Literals: strings, numbers, time ranges
- Comments: `// single-line`, `/* multi-line */`
- Selectors: `#id`, `.class`, `element`
- Operators: `..` (range), `+`, `-`, `*`, `/`

**TextMate Grammar**: `syntaxes/eligius.tmLanguage.json`

### 2. IntelliSense (Autocompletion)

**Trigger Characters**: Space, `.`, `#`, `(`, `{`

**Completion Types**:

**Keywords**:
```
timeline|
event|
at|
from|
with|
```

**Timeline Providers**:
```
timeline video|
timeline audio|
timeline raf|
```

**Actions**:
```
show|
hide|
animate|
trigger|
```

**Selectors** (after action):
```
show #|         → ID completion
show .|         → Class completion
show element|   → Element name completion
```

**Properties** (context-aware):
```
with fadeIn(|)       → duration parameter hint
with slideIn(|, |)   → duration, direction parameter hints
```

**Snippets**:
```
timeline → timeline video from "$1"
event    → event $1 at $2..$3 {
             $4
           }
action   → show $1 with $2
```

### 3. Diagnostics (Real-time Validation)

**Trigger**: On file open, edit, save

**Diagnostic Types**:
- **Error**: Syntax errors, type errors, validation failures
- **Warning**: Style issues, deprecated syntax, timeline ordering
- **Info**: Optimization opportunities, best practices

**Example Diagnostics**:
```typescript
{
  severity: DiagnosticSeverity.Error,
  range: { start: { line: 15, character: 10 }, end: { line: 15, character: 15 } },
  message: "Type error: Expected number, got string",
  source: "eligius-dsl",
  code: "E001",
  relatedInformation: [{
    location: { uri: "file:///path/to/file.eli", range: {...} },
    message: "Timeline provider requires numeric times"
  }]
}
```

### 4. Code Actions

**Quick Fixes**:
- Fix import/reference errors
- Convert string to number
- Add missing required fields
- Rename duplicate IDs

**Refactorings**:
- Extract event to separate block
- Inline event reference
- Rename event ID (with references)

**Example**:
```typescript
// Quick fix: Convert string to number
event intro at "5"..10 {  // Error: string "5" should be number
  show #title
}

// Code action: "Convert '5' to 5"
// Result:
event intro at 5..10 {
  show #title
}
```

### 5. Hover Information

**Trigger**: Hover over keyword, identifier, or construct

**Information Displayed**:
- **Keywords**: Description, usage examples
- **Event IDs**: Event definition, time range, action count
- **Actions**: Action type, parameters, examples
- **Selectors**: Target elements, matching count (if known)

**Example**:
```
Hover over "event":
---
**event** - Define a timeline event

Syntax: `event <id> at <start>..<end> { <actions> }`

Example:
```
event intro at 0..5 {
  show #title with fadeIn(500ms)
}
```
---
```

### 6. Go to Definition

**Supported**:
- Jump to event definition from reference
- Jump to provider configuration
- Jump to variable/constant declaration (future)

**Shortcut**: `F12` or `Ctrl+Click`

### 7. Find References

**Supported**:
- Find all references to event ID
- Find all uses of action type
- Find all timeline provider usages

**Shortcut**: `Shift+F12`

### 8. Document Symbols

**Outline View** (`Ctrl+Shift+O`):
```
📄 presentation.eli
  🕐 timeline: video
  ⚡ event intro (0..5)
  ⚡ event main-content (5..120)
  ⚡ event outro (120..130)
```

**Breadcrumb Navigation**:
```
presentation.eli > event intro > show #title
```

### 9. Formatting

**Trigger**: `Shift+Alt+F` or format on save

**Formatting Rules**:
- Indent with 2 spaces
- Align actions within events
- One blank line between events
- Consistent spacing around operators

**Example**:
```
// Before
timeline video from"video.mp4"
event intro at 0..5{show #title}

// After
timeline video from "video.mp4"

event intro at 0..5 {
  show #title
}
```

### 10. Compilation Commands

**Commands** (via Command Palette):

#### `Eligius DSL: Compile Current File`
- **ID**: `eligius-dsl.compile`
- **Keybinding**: `Ctrl+Shift+B`
- **Action**: Compile active `.eli` file to JSON
- **Output**: Output panel + JSON file in workspace

#### `Eligius DSL: Compile and Preview`
- **ID**: `eligius-dsl.compileAndPreview`
- **Keybinding**: `Ctrl+Shift+P`
- **Action**: Compile + show JSON preview in side panel

#### `Eligius DSL: Watch Mode`
- **ID**: `eligius-dsl.watch`
- **Action**: Enable watch mode for active file
- **Indicator**: Status bar item shows "👁️ Watching"

## Extension Settings

**Configuration** (`settings.json`):

```json
{
  "eligius-dsl.compiler.optimize": true,
  "eligius-dsl.compiler.sourcemap": true,
  "eligius-dsl.compiler.minify": false,
  "eligius-dsl.validation.enabled": true,
  "eligius-dsl.validation.onType": true,
  "eligius-dsl.validation.onSave": true,
  "eligius-dsl.format.enabled": true,
  "eligius-dsl.format.indentSize": 2,
  "eligius-dsl.completion.enabled": true,
  "eligius-dsl.output.showOnCompile": true,
  "eligius-dsl.diagnostics.maxNumberOfProblems": 100,
  "eligius-dsl.trace.server": "off"
}
```

**Settings Schema**:
```typescript
{
  "eligius-dsl.compiler.optimize": {
    "type": "boolean",
    "default": true,
    "description": "Enable optimization passes during compilation"
  },
  "eligius-dsl.validation.onType": {
    "type": "boolean",
    "default": true,
    "description": "Validate while typing (real-time diagnostics)"
  },
  "eligius-dsl.trace.server": {
    "type": "string",
    "enum": ["off", "messages", "verbose"],
    "default": "off",
    "description": "Trace communication between VS Code and language server"
  }
}
```

## Extension Activation

**Activation Events**:
```json
{
  "activationEvents": [
    "onLanguage:eligius-dsl",
    "onCommand:eligius-dsl.compile",
    "workspaceContains:**/*.eli"
  ]
}
```

## Language Server

**Protocol**: Language Server Protocol (LSP)
**Implementation**: Langium-generated language server
**Transport**: Node IPC (local) or stdio (remote)

**Capabilities**:
```json
{
  "textDocumentSync": 2,  // Incremental
  "completionProvider": {
    "triggerCharacters": [" ", ".", "#", "(", "{"]
  },
  "hoverProvider": true,
  "definitionProvider": true,
  "referencesProvider": true,
  "documentSymbolProvider": true,
  "documentFormattingProvider": true,
  "codeActionProvider": {
    "codeActionKinds": ["quickfix", "refactor"]
  },
  "diagnosticProvider": {
    "interFileDependencies": false,
    "workspaceDiagnostics": false
  }
}
```

## Output Channel

**Name**: "Eligius DSL"

**Output Types**:
1. **Compilation Results**:
   ```
   [12:00:00] Compiling presentation.eli...
   [12:00:00] ✓ Compiled successfully (45ms)
   [12:00:00] Output: dist/presentation.json (2.1 KB)
   ```

2. **Errors**:
   ```
   [12:00:00] ✗ Compilation failed (23ms)
   [12:00:00] TypeError at line 15:10
   [12:00:00]   Expected number, got string
   [12:00:00] See Problems panel for details
   ```

3. **Watch Mode**:
   ```
   [12:00:00] 👁️ Watching presentation.eli...
   [12:00:05] File changed, recompiling...
   [12:00:05] ✓ Compiled successfully (12ms)
   ```

## Status Bar Integration

**Status Bar Items**:

1. **Language Mode**: `Eligius DSL`
   - Click to change language mode

2. **Compiler Status**: `✓ Compiled` / `✗ 3 errors`
   - Shows last compilation result
   - Click to open Problems panel

3. **Watch Mode**: `👁️ Watching`
   - Visible when watch mode active
   - Click to stop watching

## Testing

Extension must have integration tests for:
1. Language server activation
2. Syntax highlighting
3. Autocompletion providers
4. Diagnostics generation
5. Code actions
6. Compilation commands
7. Settings application

**Test Framework**: `@vscode/test-electron`

**Example Test**:
```typescript
import * as vscode from 'vscode'
import { expect } from 'chai'

suite('Eligius DSL Extension Tests', () => {
  test('Syntax highlighting activates', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'eligius-dsl',
      content: 'timeline video from "test.mp4"'
    })

    expect(doc.languageId).to.equal('eligius-dsl')
  })

  test('Compile command available', async () => {
    const commands = await vscode.commands.getCommands()
    expect(commands).to.include('eligius-dsl.compile')
  })
})
```

## Performance Requirements

Per technical context:
- **Autocompletion response**: <200ms
- **Diagnostics update**: <200ms after typing stops
- **Compilation**: <500ms for typical files
- **Memory**: <100MB extension host

## Package Distribution

**VSIX Package**: `eligius-dsl-1.0.0.vsix`
**Bundle Size**: <10MB (including language server)
**Dependencies**: Bundled (no external runtime deps)

---

**Contract Version**: 1.0.0
**Status**: Defined
**Next**: Implement in `src/extension/` and `src/language/`
