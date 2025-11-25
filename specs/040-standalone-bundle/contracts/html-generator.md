# Contract: HTML Generator

**Module**: `packages/cli/src/bundler/html-generator.ts`

## Purpose

Generates the `index.html` file for the standalone bundle, embedding CSS, layout template, and initialization script.

## Public API

```typescript
/**
 * Generate the index.html file content
 *
 * @param config - HTML generation configuration
 * @returns HTML string ready to write to file
 */
export function generateHTML(config: HTMLGeneratorConfig): string;

/**
 * Configuration for HTML generation
 */
export interface HTMLGeneratorConfig {
  /**
   * Page title
   */
  title: string;

  /**
   * Combined CSS content to embed in <style> tag
   */
  css: string;

  /**
   * Layout template HTML content
   * Inserted inside the container element
   */
  layoutTemplate: string;

  /**
   * Container selector from Eligius config
   * Used to create container element with matching ID/class
   * @example "#eligius-container" -> <div id="eligius-container">
   */
  containerSelector: string;

  /**
   * Path to JavaScript bundle (relative to HTML file)
   * @default "bundle.js"
   */
  bundlePath?: string;
}
```

## Behavior

### HTML Template Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
{{css}}
  </style>
</head>
<body>
  {{containerElement}}
  <script src="{{bundlePath}}"></script>
</body>
</html>
```

### Container Element Generation

The container element is generated from the selector:

| Selector | Generated Element |
|----------|-------------------|
| `#eligius-container` | `<div id="eligius-container">{{layout}}</div>` |
| `.presentation` | `<div class="presentation">{{layout}}</div>` |
| `#app.main` | `<div id="app" class="main">{{layout}}</div>` |
| `body` | `<body>{{layout}}</body>` (special case) |

```typescript
function generateContainerElement(
  selector: string,
  layoutTemplate: string
): string {
  // Parse selector to extract ID and classes
  const id = extractId(selector);      // "#foo" -> "foo"
  const classes = extractClasses(selector); // ".bar.baz" -> ["bar", "baz"]

  // Build attributes
  const attrs: string[] = [];
  if (id) attrs.push(`id="${id}"`);
  if (classes.length) attrs.push(`class="${classes.join(' ')}"`);

  return `<div ${attrs.join(' ')}>\n${layoutTemplate}\n</div>`;
}
```

### CSS Embedding

CSS is embedded directly in a `<style>` tag (no external file):

```html
<style>
/* Combined from: main.css, theme.css */
.button { color: blue; }
.header { background: white; }
</style>
```

### Title Derivation

If no title provided, derive from:
1. First timeline name in configuration
2. Input file name (without extension)
3. Default: "Eligius Presentation"

## Error Handling

This module is pure and doesn't perform I/O, so it doesn't produce errors. Input validation is the caller's responsibility.

## Example Usage

```typescript
import { generateHTML } from './html-generator';

const html = generateHTML({
  title: 'My Presentation',
  css: '.slide { background: #fff; }',
  layoutTemplate: '<div class="slide"></div>',
  containerSelector: '#presentation',
  bundlePath: 'bundle.js'
});

// Write to file
await fs.writeFile('output/index.html', html);
```

## Output Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Presentation</title>
  <style>
.slide { background: #fff; }
  </style>
</head>
<body>
  <div id="presentation">
<div class="slide"></div>
  </div>
  <script src="bundle.js"></script>
</body>
</html>
```

## Dependencies

None - pure string manipulation.

## Test Cases

1. **Full configuration** - All fields populated
2. **Minimal configuration** - Only required fields
3. **Empty layout template** - Container with no content
4. **Empty CSS** - No style tag content
5. **ID selector** - `#container` generates correct element
6. **Class selector** - `.app` generates correct element
7. **Combined selector** - `#app.main.active` generates correct attributes
8. **Special characters in title** - HTML-escaped
9. **HTML in layout template** - Preserved correctly
10. **Large CSS** - Handles multi-kilobyte stylesheets
