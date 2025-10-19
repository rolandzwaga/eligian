# Data Model: Eligian Timeline Preview

**Feature**: Eligian Timeline Preview
**Date**: 2025-10-18
**Purpose**: Define the data structures and state management for the preview feature

## Overview

The preview feature manages state across three domains:
1. **Extension State** - VS Code extension-side data
2. **Webview State** - Browser-side preview panel data
3. **Communication Messages** - Data passed between extension and webview

## Core Entities

### 1. PreviewPanel

Represents the webview panel instance and its metadata.

**Properties**:
- `panel: vscode.WebviewPanel` - The VS Code webview panel instance
- `documentUri: vscode.Uri` - URI of the `.eligian` file being previewed
- `isDisposed: boolean` - Whether the panel has been disposed
- `lastCompilation: CompilationResult | null` - Most recent compilation result

**Lifecycle**:
- Created when user triggers "Preview Timeline" command
- Updated when file saves or active editor changes
- Disposed when user closes webview or switches to non-`.eligian` file

**Validation Rules**:
- Must have valid `documentUri` pointing to an `.eligian` file
- Cannot create multiple panels for same document (singleton per file)
- Must dispose properly to free resources

### 2. CompilationResult

Represents the result of compiling an `.eligian` file.

**Properties**:
- `success: boolean` - Whether compilation succeeded
- `config: IEngineConfiguration | null` - The compiled Eligius JSON (if success)
- `errors: CompilationError[]` - Array of compilation errors (if failure)
- `timestamp: number` - When compilation occurred (for debouncing)

**Validation Rules**:
- If `success === true`, `config` must be non-null and `errors` must be empty
- If `success === false`, `errors` must contain at least one error
- `timestamp` must be valid Unix timestamp

### 3. CompilationError

Represents a single error from the compilation process.

**Properties**:
- `message: string` - Human-readable error message
- `line: number` - Line number in source file (1-indexed)
- `column: number` - Column number in source file (1-indexed)
- `length: number` - Length of error span in characters
- `code: string` - Error code (e.g., "SYNTAX_ERROR", "UNKNOWN_OPERATION")
- `severity: "error" | "warning"` - Error severity level

**Validation Rules**:
- `line` and `column` must be positive integers
- `message` must be non-empty
- `code` must follow uppercase_snake_case convention

### 4. PreviewMessage (Extension → Webview)

Messages sent from extension to webview.

**Message Types**:

**UpdateConfig**:
```typescript
{
  type: "updateConfig",
  payload: {
    config: IEngineConfiguration,
    mediaBasePath: string  // Converted to webview-accessible URI
  }
}
```

**ShowError**:
```typescript
{
  type: "showError",
  payload: {
    errors: CompilationError[],
    sourceFile: string
  }
}
```

**ClearPreview**:
```typescript
{
  type: "clearPreview"
}
```

### 5. WebviewMessage (Webview → Extension)

Messages sent from webview back to extension.

**Message Types**:

**Ready**:
```typescript
{
  type: "ready"
}
```
Sent when webview has loaded and is ready to receive configuration.

**RuntimeError**:
```typescript
{
  type: "runtimeError",
  payload: {
    message: string,
    stack?: string
  }
}
```
Sent when Eligius engine encounters runtime error.

**PlaybackState**:
```typescript
{
  type: "playbackState",
  payload: {
    state: "playing" | "paused" | "stopped",
    currentTime: number
  }
}
```
Sent when playback state changes (for future features).

### 6. MediaResource

Represents a media file referenced by the timeline.

**Properties**:
- `originalPath: string` - Path as written in `.eligian` file (e.g., "video.mp4")
- `resolvedPath: string` - Absolute filesystem path
- `webviewUri: string` - Converted vscode-webview:// URI
- `type: "video" | "audio" | "image"` - Resource type
- `exists: boolean` - Whether file exists on filesystem

**Validation Rules**:
- `resolvedPath` must be within workspace folders
- `webviewUri` must use `vscode-webview` scheme
- If `exists === false`, should warn user before attempting playback

## State Transitions

### PreviewPanel Lifecycle

```
[Closed]
  → (User triggers preview)
  → [Creating]
  → [Ready]
  → (File changes + debounce)
  → [Compiling]
  → [Ready] or [Error]
  → (User closes panel)
  → [Disposed]
```

**State Descriptions**:
- **Closed**: No preview panel exists
- **Creating**: Webview panel being created, HTML being generated
- **Ready**: Panel showing compiled timeline or idle
- **Compiling**: File changed, compilation in progress
- **Error**: Compilation failed, showing error UI
- **Disposed**: Panel closed, resources cleaned up

### Compilation Workflow

```
[File Save Event]
  → (Check if preview open for this file)
  → [Debounce 300ms]
  → [Read File Content]
  → [Invoke Compiler]
  → [Success: Send updateConfig] or [Failure: Send showError]
  → [Update DiagnosticsCollection]
```

## Relationships

### Extension State Management

```
PreviewPanelManager (singleton)
  │
  ├── Map<documentUri, PreviewPanel>  // Track all open preview panels
  │   └── PreviewPanel
  │       ├── documentUri
  │       ├── webviewPanel
  │       └── lastCompilation
  │
  ├── FileSystemWatcher  // Watch for file saves
  └── DiagnosticsCollection  // VS Code error reporting
```

### Message Flow

```
Extension Host
  │
  ├─── (File Save) ──→ Compile ──→ CompilationResult
  │                                      │
  │                                      ├─ Success → UpdateConfig message
  │                                      └─ Failure → ShowError message
  │
  └─── Webview Panel ←──────────────────┘
         │
         └─── (Runtime Error) ──→ RuntimeError message ──→ Extension
                                                              │
                                                              └─→ Show Notification
```

## Data Constraints

### Performance Constraints

- **Debounce Interval**: 300ms (prevents compilation thrashing)
- **Max File Size**: Warn if `.eligian` file >100KB (indicates potential performance issue)
- **Max Media Size**: Warn if referenced media >50MB (slow webview loading)
- **Compilation Timeout**: 5 seconds (abort if compiler hangs)

### Security Constraints

- **Media Path Resolution**: Must resolve within workspace folders only
- **External URLs**: Allow HTTPS URLs for media (e.g., CDN-hosted videos)
- **Script Execution**: Webview CSP allows scripts only from extension and approved CDNs

## Validation Rules Summary

### Document Validation
- Must be `.eligian` file extension
- Must be within workspace folders
- Must be text document (not binary)

### Compilation Validation
- Must produce valid Eligius JSON schema
- All referenced actions must exist
- All operation names must be in registry

### Resource Validation
- Media files must exist or be valid HTTPS URLs
- Relative paths must resolve within workspace
- Absolute paths not allowed (security)

## Future Extensions

These entities may be added in future iterations:

- **PlaybackState**: Track timeline position, play/pause state
- **BreakpointState**: Support debugging at specific timeline moments
- **PreviewSettings**: User preferences (auto-preview, error display mode)
- **CacheEntry**: Cache compiled configs for performance
