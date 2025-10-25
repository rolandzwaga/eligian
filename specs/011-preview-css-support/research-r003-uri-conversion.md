# Research R003: VS Code Webview URI Conversion and Path Resolution for CSS Assets

**Date**: 2025-10-25
**Status**: Complete
**Related**: Feature 011 - Preview CSS Support

## Executive Summary

VS Code webviews require special URI conversion for loading local resources. CSS files loaded into webviews face two main challenges:

1. **File path conversion**: Local file paths must be converted to `vscode-webview-resource://` URIs using `asWebviewUri()`
2. **CSS relative path resolution**: Relative paths within CSS files (e.g., `url(./fonts/font.woff)`) require special handling using a `<base>` tag

**Key Finding**: CSS files must be converted to webview URIs, but relative paths inside CSS (fonts, images) do NOT automatically resolve. We must either:
- Set a `<base href>` tag to establish a base URL for CSS resource resolution
- OR rewrite all `url()` paths in CSS content to use converted webview URIs

## 1. asWebviewUri API

### What It Does

`webview.asWebviewUri()` converts local file system URIs to special URIs that webviews can access. This is required because webviews run in isolated contexts and cannot directly load resources using `file://` URIs.

**Conversion Example**:
```
Input:  file:///Users/dev/project/media/cat.gif
Output: vscode-webview-resource://authority/Users/dev/project/media/cat.gif
```

### When to Use It

**Always use `asWebviewUri()` for**:
- CSS files referenced in `<link>` tags
- JavaScript files referenced in `<script>` tags
- Images referenced in `<img>` tags
- Video/audio files referenced in `<video>`/`<audio>` tags
- Any local resource loaded by the webview

**Never use it for**:
- HTTP/HTTPS URLs (pass through unchanged)
- Resources already converted to webview URIs
- Inline content (inline styles, inline scripts)

### Basic Usage Pattern

```typescript
// 1. Get the file URI
const cssPath = vscode.Uri.file('/path/to/styles.css');

// 2. Convert to webview URI
const cssUri = webview.asWebviewUri(cssPath);

// 3. Use in HTML
const html = `<link rel="stylesheet" href="${cssUri.toString()}">`;
```

### Complete Example

```typescript
import * as vscode from 'vscode';
import * as path from 'node:path';

export function activate(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'myView',
    'My View',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media')
      ]
    }
  );

  // Convert CSS file path to webview URI
  const cssPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'styles.css');
  const cssUri = panel.webview.asWebviewUri(cssPath);

  // Convert image path to webview URI
  const imagePath = vscode.Uri.joinPath(context.extensionUri, 'media', 'logo.png');
  const imageUri = panel.webview.asWebviewUri(imagePath);

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="${cssUri}">
    </head>
    <body>
      <img src="${imageUri}" />
    </body>
    </html>
  `;
}
```

## 2. CSS Relative Path Resolution

### The Problem

When a CSS file contains relative paths (e.g., `background-image: url(./images/bg.png)`), those paths **do NOT automatically resolve** relative to the CSS file's location in webviews.

**Example Failure**:
```css
/* File: /project/styles/main.css */
@font-face {
  font-family: 'MyFont';
  src: url(./fonts/myfont.ttf);  /* ❌ Will NOT resolve correctly */
}

body {
  background-image: url(../images/bg.png);  /* ❌ Will NOT resolve correctly */
}
```

### Why It Fails

VS Code webviews don't automatically establish a base URL for CSS files. Without a base URL, the browser doesn't know how to resolve relative paths in CSS.

### Solution 1: Set Base URL with `<base>` Tag

Add a `<base href>` element to the HTML to establish a base URL for all relative paths.

```typescript
// Convert workspace root to webview URI
const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
const baseUri = panel.webview.asWebviewUri(workspaceRoot);

panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <base href="${baseUri.toString()}/">
    <link rel="stylesheet" href="${cssUri}">
  </head>
  <body>
    <!-- Now relative paths in CSS work! -->
  </body>
  </html>
`;
```

**How It Works**:
- The `<base>` tag tells the browser to resolve all relative URLs relative to that base
- CSS `url()` paths are resolved against the base URL
- If CSS is at `/project/styles/main.css` and base is `/project/`, then `url(./fonts/font.ttf)` resolves to `/project/styles/fonts/font.ttf`

**Limitations**:
- Only ONE `<base>` tag is allowed per HTML document
- All relative URLs (in CSS, HTML, JS) use the same base
- If CSS files are in different directories, some relative paths may break

### Solution 2: Rewrite CSS `url()` Paths

Instead of using a base tag, rewrite all `url()` paths in CSS content to use converted webview URIs.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadCssWithRewrittenUrls(
  cssFilePath: string,
  webview: vscode.Webview
): string {
  // Read CSS file
  let cssContent = fs.readFileSync(cssFilePath, 'utf-8');
  const cssDir = path.dirname(cssFilePath);

  // Find all url() references
  const urlPattern = /url\(['"]?([^'")]+)['"]?\)/g;

  cssContent = cssContent.replace(urlPattern, (match, urlPath) => {
    // Skip absolute URLs
    if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
      return match;
    }

    // Resolve relative path
    const resolvedPath = path.resolve(cssDir, urlPath);

    // Convert to webview URI
    const webviewUri = webview.asWebviewUri(vscode.Uri.file(resolvedPath));

    return `url('${webviewUri.toString()}')`;
  });

  return cssContent;
}

// Use in webview
const cssContent = loadCssWithRewrittenUrls('/project/styles/main.css', panel.webview);
panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>${cssContent}</style>
  </head>
  <body>
    <!-- CSS with rewritten URLs! -->
  </body>
  </html>
`;
```

**Advantages**:
- Works with CSS files in different directories
- No base URL conflicts
- More control over path resolution

**Disadvantages**:
- More complex implementation
- Must parse and rewrite CSS content
- Inline styles instead of `<link>` tags (or inject via JS)

### Solution 3: Hybrid Approach (Recommended)

For Feature 011, we recommend a hybrid approach:

1. **Use `<base>` tag** for the primary CSS directory (usually workspace root or document directory)
2. **Warn users** if CSS files are in different directories with relative paths
3. **Document** that relative paths in CSS should be relative to workspace root

```typescript
// Set base to document directory (where .eligian file lives)
const documentDir = path.dirname(documentUri.fsPath);
const baseUri = panel.webview.asWebviewUri(vscode.Uri.file(documentDir));

panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <!-- Base URL for relative path resolution -->
    <base href="${baseUri.toString()}/">

    <!-- CSS files -->
    ${cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n')}
  </head>
  <body>
    <!-- Preview content -->
  </body>
  </html>
`;
```

## 3. Security Considerations

### Content Security Policy (CSP)

All webviews should set a Content Security Policy to prevent content injections.

**Minimal CSP for CSS Loading**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource};
               img-src ${webview.cspSource} https:;
               font-src ${webview.cspSource};" />
```

**CSP Directives Explained**:
- `default-src 'none'` - Deny everything by default
- `style-src ${webview.cspSource}` - Allow stylesheets from webview resources
- `img-src ${webview.cspSource} https:` - Allow images from webview resources and HTTPS
- `font-src ${webview.cspSource}` - Allow fonts from webview resources

**Important**: `${webview.cspSource}` is a special placeholder that VS Code replaces with the webview's origin. Always use this in CSP for local resources.

### Local Resource Access Control

The `localResourceRoots` option controls which directories the webview can access.

**Example Configuration**:
```typescript
vscode.window.createWebviewPanel(
  'eligianPreview',
  'Preview',
  vscode.ViewColumn.Beside,
  {
    enableScripts: true,
    localResourceRoots: [
      // Extension resources
      context.extensionUri,
      // Workspace folders (for user CSS files)
      ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || [])
    ]
  }
);
```

**Security Best Practices**:
1. **Always set `localResourceRoots`** - Don't allow access to entire file system
2. **Use workspace folders** - Users expect access to workspace files
3. **Reject absolute paths** - Prevent access to system files
4. **Validate path traversal** - Ensure `../../` doesn't escape workspace

### Path Traversal Prevention

```typescript
function isPathWithinWorkspace(resolvedPath: string, workspaceRoot: string): boolean {
  const normalizedPath = path.normalize(resolvedPath);
  const normalizedRoot = path.normalize(workspaceRoot);
  return normalizedPath.startsWith(normalizedRoot);
}

// Usage
const cssPath = path.resolve(workspaceRoot, userProvidedPath);
if (!isPathWithinWorkspace(cssPath, workspaceRoot)) {
  throw new Error('Path traversal detected - access denied');
}
```

## 4. Base Path Handling

### Challenge: Multiple CSS Files from Different Directories

If CSS files are in different directories, a single `<base>` tag may not work for all relative paths.

**Example Problem**:
```
/project/styles/main.css        → url(./fonts/font.woff)  ✓ Works with base=/project/styles/
/project/components/ui.css      → url(./icons/icon.svg)  ✗ Breaks with base=/project/styles/
```

### Strategy 1: Single Base (Document Directory)

Set base to the document directory (where `.eligian` file lives). Require all CSS relative paths to be relative to document directory.

```typescript
const documentDir = path.dirname(documentUri.fsPath);
const baseUri = webview.asWebviewUri(vscode.Uri.file(documentDir));
```

**Pros**:
- Simple implementation
- Clear convention for users
- Matches existing behavior for media files

**Cons**:
- Users must adjust CSS paths if CSS is in subdirectories
- May break existing CSS with relative paths

### Strategy 2: Multiple Bases (Per-CSS Directory)

Track each CSS file's directory and inject CSS as inline `<style>` blocks with resolved URLs.

```typescript
const cssBlocks = [];
for (const cssPath of cssFilePaths) {
  const cssDir = path.dirname(cssPath);
  const cssContent = rewriteCssUrls(cssPath, cssDir, webview);
  cssBlocks.push(`<style data-source="${cssPath}">${cssContent}</style>`);
}
```

**Pros**:
- Supports CSS files in any directory
- Relative paths work as authored

**Cons**:
- More complex implementation
- No `<link>` tags (affects browser caching)
- Must parse CSS content

### Strategy 3: Workspace Root Base

Set base to workspace root. Document that CSS relative paths should be relative to workspace root.

```typescript
const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri;
const baseUri = webview.asWebviewUri(workspaceRoot);
```

**Pros**:
- Consistent base for all CSS
- Matches common web development patterns
- Works well with build tools

**Cons**:
- May not match user expectations if they think paths are relative to CSS file
- Requires documentation and examples

### Recommended Approach for Feature 011

Use **Strategy 1: Single Base (Document Directory)** with clear documentation:

1. Set `<base href>` to document directory (where `.eligian` file lives)
2. Document that CSS `url()` paths should be relative to document directory
3. Show examples in documentation
4. Warn users if CSS files are not in document directory or subdirectories

**Rationale**:
- Matches existing `MediaResolver` behavior (resolves media relative to document)
- Simple to implement and understand
- Users already expect paths relative to their `.eligian` file
- Can be enhanced later with path rewriting if needed

## 5. Windows Path Separator Issues

**Problem**: CSS doesn't accept Windows backslashes (`\`) in `url()` paths.

**Example Failure**:
```css
/* ❌ Fails on Windows */
@font-face {
  src: url(vscode-resource:C:\Users\me\project\font.ttf);
}
```

**Solution**: Always normalize paths to forward slashes before injecting into CSS or HTML.

```typescript
function toWebviewCssPath(fileUri: vscode.Uri, webview: vscode.Webview): string {
  const webviewUri = webview.asWebviewUri(fileUri);
  // Replace backslashes with forward slashes for CSS compatibility
  return webviewUri.toString().replace(/\\/g, '/');
}
```

## 6. Implementation Guide for Feature 011

### Step 1: Convert CSS File Paths

```typescript
// In PreviewPanel.ts

private getCssUris(cssFilePaths: string[]): vscode.Uri[] {
  return cssFilePaths.map(cssPath => {
    // Resolve relative to document directory
    const documentDir = path.dirname(this.documentUri.fsPath);
    const resolvedPath = path.resolve(documentDir, cssPath);

    // Security: Ensure within workspace
    if (!this.isPathWithinWorkspace(resolvedPath)) {
      console.warn(`Rejected CSS path outside workspace: ${cssPath}`);
      return null;
    }

    // Convert to webview URI
    const fileUri = vscode.Uri.file(resolvedPath);
    return this.panel.webview.asWebviewUri(fileUri);
  }).filter(uri => uri !== null);
}
```

### Step 2: Set Base URL in HTML Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${cspSource};
                 script-src ${cspSource};
                 img-src ${cspSource} https:;
                 font-src ${cspSource};
                 media-src ${cspSource} https:;" />

  <!-- Base URL for CSS relative path resolution -->
  <base href="${baseUri}/">

  <!-- CSS files -->
  ${cssLinks}
</head>
<body>
  <!-- Preview content -->
</body>
</html>
```

### Step 3: Generate CSS Links Dynamically

```typescript
private getHtmlForWebview(cssUris: vscode.Uri[]): string {
  const templatePath = path.join(/* ... */);
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Set base URL (document directory)
  const documentDir = path.dirname(this.documentUri.fsPath);
  const baseUri = this.panel.webview.asWebviewUri(vscode.Uri.file(documentDir));
  html = html.replace(/\$\{baseUri\}/g, baseUri.toString());

  // Generate CSS link tags
  const cssLinks = cssUris
    .map(uri => `<link rel="stylesheet" href="${uri.toString()}">`)
    .join('\n    ');
  html = html.replace(/\$\{cssLinks\}/g, cssLinks);

  // ... other replacements ...

  return html;
}
```

### Step 4: Handle CSS Reload

For live reload, send a message to the webview to replace CSS:

```typescript
// In PreviewPanel.ts
private async reloadCss(cssFilePath: string): Promise<void> {
  const cssUri = this.getCssUri(cssFilePath);

  await this.panel.webview.postMessage({
    type: 'reloadCss',
    payload: {
      cssPath: cssFilePath,
      cssUri: cssUri.toString(),
      timestamp: Date.now() // Cache busting
    }
  });
}
```

```javascript
// In webview (preview.ts)
window.addEventListener('message', event => {
  const message = event.data;

  if (message.type === 'reloadCss') {
    const { cssPath, cssUri, timestamp } = message.payload;

    // Find existing link tag
    const link = document.querySelector(`link[data-css-path="${cssPath}"]`);

    if (link) {
      // Replace href with cache-busting timestamp
      link.href = `${cssUri}?t=${timestamp}`;
    }
  }
});
```

## 7. Testing Checklist

- [ ] CSS file from document directory loads correctly
- [ ] CSS file from subdirectory loads correctly
- [ ] CSS file from parent directory (security test) is rejected
- [ ] Multiple CSS files load in correct order
- [ ] Relative paths in CSS (fonts) resolve correctly
- [ ] Relative paths in CSS (images) resolve correctly
- [ ] Relative paths in CSS (@import) resolve correctly
- [ ] HTTPS URLs in CSS pass through unchanged
- [ ] Windows path separators are normalized
- [ ] CSP allows CSS loading
- [ ] CSS reload doesn't restart Eligius engine
- [ ] CSS reload preserves timeline state
- [ ] Missing CSS file shows error but doesn't crash
- [ ] CSS syntax error shows error but doesn't crash

## 8. Key Takeaways

1. **Always use `asWebviewUri()`** for local CSS file paths in HTML
2. **Set `<base>` tag** to enable relative path resolution in CSS
3. **Configure CSP** to allow webview resources for styles, fonts, and images
4. **Set `localResourceRoots`** to workspace folders for user file access
5. **Normalize Windows paths** to forward slashes for CSS compatibility
6. **Validate paths** to prevent traversal attacks
7. **Test with real CSS** that includes fonts and images
8. **Document path conventions** for users (relative to document directory)

## References

- [VS Code Webview API Guide](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [GitHub Issue #45669: CSS url() paths in webviews](https://github.com/Microsoft/vscode/issues/45669)
- [GitHub Issue #98542: Webview baseUrl support](https://github.com/microsoft/vscode/issues/98542)
- [Stack Overflow: Using local .ttf in webview](https://stackoverflow.com/questions/55656679/using-local-ttf-in-vscode-extension-webview)
- Existing implementation: `MediaResolver.ts` in this project
