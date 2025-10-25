# API Contract: Webview Message Protocol

**Feature**: 011-preview-css-support
**Date**: 2025-10-25

## Overview

This contract defines the message protocol for communication between the VS Code extension (Extension Host) and the webview (Webview Context) for CSS loading and live reload operations.

## Message Direction: Extension → Webview

### 1. CSS Load Message

**Purpose**: Initial CSS injection into webview when preview opens or CSS import added.

**Type**: `css-load`

**Payload**:
```typescript
interface CSSLoadMessage {
  type: 'css-load';
  cssId: string;          // Unique identifier (SHA-256 hash of file path)
  content: string;        // CSS content with rewritten url() paths
  sourceFile: string;     // Original file path (for debugging/logging)
  loadOrder: number;      // Index in import order (0-based)
}
```

**Example**:
```json
{
  "type": "css-load",
  "cssId": "a3f5b2c8d9e1f4",
  "content": ".container { background: url('vscode-webview://...');  }",
  "sourceFile": "/workspace/styles/main.css",
  "loadOrder": 0
}
```

**Behavior**:
- Webview creates new `<style>` tag with `data-css-id` attribute
- Sets `data-load-order` attribute for CSS cascade
- Injects `content` using `textContent` (NOT innerHTML - security)
- Appends to `<head>` in load order

**Idempotency**: If `cssId` already exists, updates content (behaves like reload)

---

### 2. CSS Reload Message

**Purpose**: Hot-reload existing CSS when file changes on disk.

**Type**: `css-reload`

**Payload**:
```typescript
interface CSSReloadMessage {
  type: 'css-reload';
  cssId: string;          // ID of CSS to update
  content: string;        // Updated CSS content with rewritten url() paths
  sourceFile: string;     // Original file path
}
```

**Example**:
```json
{
  "type": "css-reload",
  "cssId": "a3f5b2c8d9e1f4",
  "content": ".container { background: blue; }",
  "sourceFile": "/workspace/styles/main.css"
}
```

**Behavior**:
- Webview finds existing `<style>` tag by `data-css-id`
- Updates `textContent` with new content
- **Does NOT** restart Eligius engine or reload page
- **Preserves** timeline state (position, data, element states)

**Error Handling**: If `cssId` not found, treat as `css-load` (inject new)

---

### 3. CSS Remove Message

**Purpose**: Remove CSS from webview when import removed from Eligian file.

**Type**: `css-remove`

**Payload**:
```typescript
interface CSSRemoveMessage {
  type: 'css-remove';
  cssId: string;          // ID of CSS to remove
}
```

**Example**:
```json
{
  "type": "css-remove",
  "cssId": "a3f5b2c8d9e1f4"
}
```

**Behavior**:
- Webview finds `<style>` tag by `data-css-id`
- Removes tag from DOM
- Clears internal state (loadedCSS map, loadOrder map)

**Idempotency**: If `cssId` doesn't exist, no-op (no error)

---

### 4. CSS Error Message

**Purpose**: Notify webview of CSS loading failure (file not found, permission denied, etc.).

**Type**: `css-error`

**Payload**:
```typescript
interface CSSErrorMessage {
  type: 'css-error';
  cssId: string;          // ID of failed CSS
  filePath: string;       // Original file path
  error: string;          // Human-readable error message
  code: 'NOT_FOUND' | 'READ_ERROR' | 'PARSE_ERROR' | 'PERMISSION_DENIED';
}
```

**Example**:
```json
{
  "type": "css-error",
  "cssId": "a3f5b2c8d9e1f4",
  "filePath": "/workspace/styles/main.css",
  "error": "File not found: /workspace/styles/main.css",
  "code": "NOT_FOUND"
}
```

**Behavior**:
- Webview displays error notification (optional - could be extension-only)
- Retains previous valid CSS (if existed)
- Does NOT inject empty CSS or remove existing CSS

**Error Codes**:
- `NOT_FOUND`: CSS file doesn't exist
- `READ_ERROR`: File read failed (locked, network error)
- `PARSE_ERROR`: CSS syntax error (optional - not validated in MVP)
- `PERMISSION_DENIED`: Insufficient permissions to read file

---

## Message Direction: Webview → Extension (Optional)

**Note**: Feedback messages are optional for MVP. Extension assumes success unless error.

### 1. CSS Loaded Success

**Purpose**: Confirm CSS successfully injected.

**Type**: `css-loaded`

**Payload**:
```typescript
interface CSSLoadedMessage {
  type: 'css-loaded';
  cssId: string;
}
```

**Use Case**: Extension tracks which CSS files are active in webview.

---

### 2. CSS Load Failed

**Purpose**: Report CSS injection failure in webview (e.g., CSP violation).

**Type**: `css-load-failed`

**Payload**:
```typescript
interface CSSLoadFailedMessage {
  type: 'css-load-failed';
  cssId: string;
  error: string;          // Error message from webview
}
```

**Use Case**: Extension shows error notification if webview injection fails.

---

## Message Sequence Examples

### Scenario 1: Initial Preview Open with 2 CSS Files

```
Extension → Webview: css-load (cssId: "abc123", loadOrder: 0, ...)
Extension → Webview: css-load (cssId: "def456", loadOrder: 1, ...)

Webview creates:
  <style data-css-id="abc123" data-load-order="0">...</style>
  <style data-css-id="def456" data-load-order="1">...</style>
```

---

### Scenario 2: Hot-Reload CSS on File Change

```
User edits main.css → FileSystemWatcher detects change → Debounce 300ms

Extension → Webview: css-reload (cssId: "abc123", content: "...")

Webview updates:
  document.querySelector('[data-css-id="abc123"]').textContent = newContent;
```

**Timeline Behavior**: Eligius engine continues running, timeline state preserved.

---

### Scenario 3: CSS File Deleted

```
User deletes main.css → FileSystemWatcher detects deletion

Extension → Webview: css-remove (cssId: "abc123")

Webview removes:
  document.querySelector('[data-css-id="abc123"]').remove();
```

---

### Scenario 4: CSS File Not Found (Error)

```
Extension attempts to load main.css → File doesn't exist

Extension → Webview: css-error (cssId: "abc123", code: "NOT_FOUND", ...)
Extension shows VS Code notification: "CSS file not found: main.css"

Webview: Does nothing (retains previous CSS if existed)
```

---

## Protocol Guarantees

### Idempotency
- All messages can be safely sent multiple times
- `css-load` with existing `cssId` behaves like `css-reload`
- `css-remove` with non-existent `cssId` is no-op

### Ordering
- `css-load` messages MUST be sent in `loadOrder` sequence
- `loadOrder` determines CSS cascade (later styles override earlier)
- `css-reload` messages can arrive in any order (independent)

### Atomicity
- Each message is atomic (no partial application)
- Webview processes messages sequentially (message queue)
- State transitions are immediate (no async delays)

---

## Security Considerations

### Content Injection
- **CRITICAL**: Always use `element.textContent = content` (NOT innerHTML)
- `innerHTML` with CSS is XSS vulnerability (Stencil CVE)
- `textContent` prevents script injection via CSS

### Path Validation
- Extension MUST validate file paths before loading
- Reject absolute paths, path traversal, external URLs
- Only load files within workspace (`localResourceRoots`)

### CSP Compliance
- Webview MUST configure `style-src 'unsafe-inline'` for inline styles
- Use `${webview.cspSource}` for font/image resources
- Do NOT use `'unsafe-eval'` (not required for CSS)

---

## Error Handling

### Extension Side
- File read error → Send `css-error` message + show VS Code notification
- Path validation error → Show notification, do NOT send message
- Webview disposed → Silently drop messages (no error)

### Webview Side
- Unknown message type → Log warning, ignore
- Missing `cssId` → Log error, ignore
- CSP violation → Send `css-load-failed` message (optional)

---

## Performance Considerations

### Message Frequency
- Debounce CSS changes (300ms) to reduce message volume
- Batch multiple CSS loads during initial preview open
- Limit message size (CSS content can be large - consider gzip in future)

### Message Payload Size
- Average CSS file: 10-50 KB
- Maximum CSS file (recommended): 500 KB
- Large files: May cause UI freezes (consider warning)

---

## Testing Scenarios

### Happy Path
- [x] Load single CSS file
- [x] Load multiple CSS files in order
- [x] Reload CSS on file change
- [x] Remove CSS on file deletion
- [x] Handle rapid changes (debouncing)

### Error Cases
- [x] CSS file not found
- [x] CSS file read error (locked, permission)
- [x] CSS file deleted while preview open
- [x] Invalid cssId in reload message
- [x] Malformed message payload

### Edge Cases
- [x] Empty CSS file
- [x] Very large CSS file (>500 KB)
- [x] CSS with syntax errors (browser ignores, no crash)
- [x] CSS with XSS attempts (textContent prevents)
- [x] Rapid file changes (debouncing works)

---

## Implementation Checklist

### Extension Side
- [ ] Implement message sending (`webview.postMessage()`)
- [ ] Generate stable `cssId` (SHA-256 hash of file path)
- [ ] Rewrite CSS `url()` paths before sending
- [ ] Handle file system errors → `css-error` messages
- [ ] Debounce file changes (300ms per file)

### Webview Side
- [ ] Implement message handler (`window.addEventListener('message')`)
- [ ] Implement CSS injection (`<style>` tag creation)
- [ ] Use `textContent` (NOT innerHTML) for security
- [ ] Track loaded CSS by `cssId` (Map)
- [ ] Maintain load order (CSS cascade)

---

## References

- [VS Code Webview Message Passing](https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-an-extension-to-a-webview)
- [Stencil CSS Injection Security Fix](https://github.com/ionic-team/stencil/actions/runs/7878387897)
- Feature Spec: [spec.md](../spec.md)
- Research: [research.md](../research.md)
- Data Model: [data-model.md](../data-model.md)
