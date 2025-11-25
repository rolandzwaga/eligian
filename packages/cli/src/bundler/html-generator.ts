/**
 * HTML Generator Module
 *
 * Generates the index.html file for standalone bundles,
 * embedding CSS, layout template, and initialization script.
 *
 * Uses ES modules (<script type="module">) for modern browser support.
 * ESM has 94.58% global browser support (caniuse.com/es6-module).
 */

import type { HTMLGeneratorConfig } from './types.js';

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => escapeMap[char] || char);
}

/**
 * Extract ID from a CSS selector
 * @example "#container" -> "container"
 * @example "#app.main" -> "app"
 */
function extractId(selector: string): string | null {
  const match = selector.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/);
  return match ? match[1] : null;
}

/**
 * Extract class names from a CSS selector
 * @example ".app.main" -> ["app", "main"]
 * @example "#container.active" -> ["active"]
 */
function extractClasses(selector: string): string[] {
  const classes: string[] = [];
  const regex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(selector)) !== null) {
    classes.push(match[1]);
  }
  return classes;
}

/**
 * Generate a container element from a CSS selector
 *
 * @param selector - CSS selector (e.g., "#container", ".app", "#app.main")
 * @param layoutTemplate - HTML content to place inside the container
 * @returns HTML string for the container element
 *
 * @example
 * generateContainerElement("#app", "<div>Content</div>")
 * // Returns: <div id="app">\n<div>Content</div>\n</div>
 */
export function generateContainerElement(selector: string, layoutTemplate: string): string {
  const id = extractId(selector);
  const classes = extractClasses(selector);

  const attrs: string[] = [];
  if (id) {
    attrs.push(`id="${id}"`);
  }
  if (classes.length > 0) {
    attrs.push(`class="${classes.join(' ')}"`);
  }

  const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  const content = layoutTemplate.trim();

  if (content) {
    return `<div${attrString}>\n${content}\n  </div>`;
  }
  return `<div${attrString}></div>`;
}

/**
 * Generate the complete index.html file content
 *
 * Creates a valid HTML5 document with:
 * - Proper DOCTYPE and meta tags
 * - Embedded CSS in a <style> tag
 * - Container element with layout template
 * - ES module script tag for the JavaScript bundle (type="module")
 *
 * @param config - HTML generation configuration
 * @returns Complete HTML document as a string
 */
export function generateHTML(config: HTMLGeneratorConfig): string {
  const { title, css, layoutTemplate, containerSelector, bundlePath = 'bundle.js' } = config;

  // Escape title to prevent XSS
  const safeTitle = escapeHtml(title);

  // Generate container element with layout
  const containerElement = generateContainerElement(containerSelector, layoutTemplate);

  // Build the HTML document
  // Using type="module" for ES module support (94.58% global browser support)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
${css}
  </style>
</head>
<body>
  ${containerElement}
  <script type="module" src="${bundlePath}"></script>
</body>
</html>
`;
}
