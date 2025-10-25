# Implementation Plan: Preview CSS Support with Live Reload

**Branch**: `011-preview-css-support` | **Date**: 2025-10-25 | **Spec**: [spec.md](./spec.md)

## Summary

Enable automatic CSS loading and hot-reloading in the Eligian preview webview. When developers import CSS files via `styles` statements, those files are loaded into the preview and watched for changes. CSS modifications trigger immediate reloads without restarting the Eligius engine or losing timeline state, providing a seamless development experience.

## Technical Context

**Language/Version**: TypeScript 5.x with NodeNext module resolution
**Primary Dependencies**: VS Code API (vscode), VS Code Webview API, File System Watcher API
**Storage**: N/A (file system reads only)
**Testing**: Vitest for unit tests, manual testing for VS Code extension integration
**Target Platform**: VS Code Extension Host (Node.js ESM environment)
**Project Type**: VS Code Extension (packages/extension/)
**Performance Goals**: CSS loads in <500ms, reloads in <300ms (per success criteria)
**Constraints**: Must preserve timeline state during reload, debounce rapid changes, handle up to 10 CSS files
**Scale/Scope**: Single preview webview, ~10 CSS files max, file watcher management

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Simplicity & Documentation**: Approach is straightforward - file watchers + webview message passing. Well-documented VS Code API patterns.
- [x] **Comprehensive Testing**: Unit tests planned for CSS loader logic, file watcher lifecycle, and debouncing. Integration tests for webview injection (manual).
- [x] **No Gold-Plating**: Solves documented need (Feature 010 added CSS imports but preview doesn't load them). No speculative features.
- [x] **Code Review**: Standard PR process applies
- [x] **UX Consistency**: Consistent with existing preview update mechanism (reuses webview messaging pattern)
- [x] **Functional Programming**: CSS loader will be pure functions, file watchers in Effect context if needed, external immutability maintained

*All checks pass. No complexity justification needed.*

## Project Structure

### Documentation (this feature)

```
specs/011-preview-css-support/
├── plan.md              # This file
├── research.md          # Phase 0: VS Code API patterns, webview CSS injection
├── data-model.md        # Phase 1: CSS watcher state, loader logic
├── quickstart.md        # Phase 1: How to use CSS live reload
├── contracts/           # Phase 1: Webview message protocol
└── tasks.md             # Phase 2: Not created by this command
```

### Source Code (repository root)

```
packages/extension/
├── src/
│   ├── extension/
│   │   ├── main.ts                    # Extension activation (existing)
│   │   ├── preview-manager.ts         # Preview management (existing)
│   │   ├── css-loader.ts              # NEW: CSS file loading logic
│   │   ├── css-watcher.ts             # NEW: File system watcher for CSS
│   │   └── webview-css-injector.ts    # NEW: CSS injection into webview
│   └── language/
│       └── main.ts                    # Language server (existing)
│
└── __tests__/                         # NEW: Tests for CSS loading features
    ├── css-loader.spec.ts
    ├── css-watcher.spec.ts
    └── webview-css-injector.spec.ts

packages/language/
└── src/
    └── compiler/
        └── pipeline.ts                # Already provides cssFiles from asset loading
```

**Structure Decision**: Feature lives entirely in `packages/extension/` since it's VS Code preview functionality. Reuses existing asset loading from `packages/language/` which already provides `cssFiles` array from compiled Eligian files. No changes needed to compiler package.

## Complexity Tracking

*No violations - constitution check passed cleanly.*

## Phase 0: Research & Discovery

**Objective**: Resolve technical unknowns and establish implementation patterns for VS Code webview CSS injection and file watching.

### Research Tasks

#### R001: VS Code Webview CSS Injection Patterns

**Question**: What's the recommended pattern for dynamically injecting and replacing CSS in VS Code webviews?

**Research Areas**:
- VS Code Webview API documentation (asWebviewUri, postMessage)
- Best practices for CSS injection without page reload
- Handling CSS with relative paths (background-image, fonts)

**Output**: Document injection approach in `research.md`

---

#### R002: File System Watcher Lifecycle Management

**Question**: How do we properly create, manage, and dispose file system watchers in VS Code extensions?

**Research Areas**:
- `workspace.createFileSystemWatcher` API and glob patterns
- Watcher disposal and cleanup best practices
- Debouncing file change events
- Performance implications of multiple watchers

**Output**: Document watcher lifecycle patterns in `research.md`

---

#### R003: Webview Message Protocol for CSS Updates

**Question**: How should the extension communicate CSS updates to the webview?

**Research Areas**:
- Webview message passing patterns (extension → webview)
- Message payload structure for CSS updates
- Error handling and feedback from webview
- Timeline state preservation during CSS reload

**Output**: Define message protocol contract in `research.md`

---

#### R004: CSS Path Resolution in Webview Context

**Question**: How do we convert file system paths to webview-compatible URIs while preserving relative paths in CSS?

**Research Areas**:
- `Webview.asWebviewUri()` API usage
- Handling CSS with relative paths (./images, ../fonts)
- Base path resolution for CSS assets
- Security considerations (CSP, resource loading)

**Output**: Document path resolution strategy in `research.md`

---

**Deliverable**: `research.md` with all questions answered and implementation approaches defined.

## Phase 1: Design & Contracts

### Data Model

**File**: `data-model.md`

**Entities**:

1. **CSSWatcherState**
   - Tracked CSS file paths (from compiled Eligian output)
   - File system watcher disposables
   - Debounce timers per file
   - Lifecycle: created on preview open, disposed on preview close

2. **CSSLoadRequest**
   - Source file path (absolute)
   - Target webview URI (converted via asWebviewUri)
   - Load order index
   - Timestamp for debouncing

3. **WebviewCSSMessage**
   - Message type: 'cssLoad', 'cssReload', 'cssError'
   - CSS file URI (webview-compatible)
   - CSS content or error details
   - File identifier for tracking

### API Contracts

**File**: `contracts/webview-messages.md`

**Extension → Webview Messages**:

```typescript
// Load new CSS file
{
  type: 'cssLoad',
  fileUri: string,        // Webview URI
  content: string,        // CSS content
  index: number,          // Load order
  identifier: string      // Unique ID for tracking
}

// Reload existing CSS file
{
  type: 'cssReload',
  identifier: string,     // File ID to replace
  content: string         // Updated CSS content
}

// CSS error notification
{
  type: 'cssError',
  filePath: string,       // Original file path
  error: string           // Error message
}
```

**Webview → Extension Messages** (if needed for feedback):

```typescript
{
  type: 'cssLoadSuccess',
  identifier: string
}

{
  type: 'cssLoadError',
  identifier: string,
  error: string
}
```

### Component Design

**File**: `contracts/components.md`

**CSSLoader** (pure functions):
- `loadCSSFile(path: string): Promise<string>` - Read CSS from disk
- `convertToWebviewUri(path: string, webview: Webview): Uri` - Convert path to webview URI
- `extractCSSFiles(config: IEngineConfiguration): string[]` - Get CSS file paths from config

**CSSWatcher** (lifecycle management):
- `createWatchers(files: string[], onChange: (file: string) => void): Disposable[]` - Setup file watchers
- `disposeWatchers(disposables: Disposable[]): void` - Cleanup watchers
- `debounceChange(file: string, callback: () => void, delay: number): void` - Debounce changes

**WebviewCSSInjector** (webview integration):
- `injectCSS(webview: Webview, cssFiles: string[]): Promise<void>` - Initial CSS load
- `reloadCSS(webview: Webview, file: string, content: string): Promise<void>` - Hot reload single file
- `showCSSError(file: string, error: string): void` - Display error notification

### Quickstart Guide

**File**: `quickstart.md`

Content: How CSS live reload works, how to import CSS in Eligian files, what happens when CSS changes, troubleshooting tips.

## Phase 2: Task Breakdown

*Generated by `/speckit.tasks` command - not created by this plan*

## Notes

- **Existing Infrastructure**: Asset loading already provides `cssFiles` array from compiled config (Feature 010)
- **Reuse Preview Manager**: Extend existing `preview-manager.ts` rather than creating new preview system
- **Webview Script**: May need to add JavaScript to webview HTML for handling CSS injection messages
- **Error Handling**: Use VS Code notification API (`window.showErrorMessage`) for CSS errors
- **Cleanup Critical**: File watchers MUST be disposed on preview close to avoid memory leaks
