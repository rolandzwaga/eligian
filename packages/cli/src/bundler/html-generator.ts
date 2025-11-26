/**
 * HTML Generator Module
 *
 * Generates the index.html file for standalone bundles,
 * embedding CSS, layout template, and initialization script.
 *
 * Uses ES modules (<script type="module">) for modern browser support.
 * ESM has 94.58% global browser support (caniuse.com/es6-module).
 */

import * as path from 'node:path';
import type { AssetManifest, HTMLGeneratorConfig } from './types.js';

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

/**
 * Check if a URL is external (http:// or https://)
 */
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

/**
 * Check if a URL is a data URI
 */
function isDataUri(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Resolve a URL reference relative to an HTML file path
 *
 * @param urlRef - The URL reference from the HTML (e.g., "./images/hero.png")
 * @param htmlFilePath - Absolute path to the HTML file
 * @returns Absolute path to the referenced asset
 */
function resolveAssetPath(urlRef: string, htmlFilePath: string): string {
  const htmlDir = path.dirname(htmlFilePath);
  return path.resolve(htmlDir, urlRef);
}

/**
 * Get the rewritten URL for an asset (data URI or file path)
 *
 * @param asset - Asset entry from manifest
 * @returns URL to use (data URI if inlined, otherwise output path)
 */
function getRewrittenUrl(asset: { inline: boolean; dataUri?: string; outputPath: string }): string {
  if (asset.inline && asset.dataUri) {
    return asset.dataUri;
  }
  return asset.outputPath;
}

/**
 * Rewrite asset URLs in HTML content
 *
 * Rewrites src attributes on img, video, audio, source elements,
 * poster attributes on video elements, and srcset attributes
 * to point to bundled asset paths or inline data URIs.
 *
 * @param htmlContent - HTML content string
 * @param htmlFilePath - Absolute path to the HTML file (for resolving relative paths)
 * @param manifest - Asset manifest with rewritten paths
 * @returns HTML content with rewritten URLs
 */
export function rewriteHTMLUrls(
  htmlContent: string,
  htmlFilePath: string,
  manifest: AssetManifest
): string {
  if (!htmlContent) {
    return htmlContent;
  }

  let result = htmlContent;

  // Rewrite src attributes on img, video, audio, source elements
  // Matches: src="..." or src='...' (with optional space before src)
  const srcRegex = /(<(?:img|video|audio|source)[^>]*?)(\s?)src\s*=\s*(['"])([^'"]+)\3/gi;
  result = result.replace(srcRegex, (match, prefix, space, quote, url) => {
    if (isExternalUrl(url) || isDataUri(url)) {
      return match; // Preserve external URLs and data URIs
    }

    const absolutePath = resolveAssetPath(url, htmlFilePath);
    const asset = manifest.assets.get(absolutePath);

    if (!asset) {
      return match; // Asset not in manifest, leave unchanged
    }

    const newUrl = getRewrittenUrl(asset);
    return `${prefix}${space}src=${quote}${newUrl}${quote}`;
  });

  // Rewrite poster attributes on video elements
  const posterRegex = /(<video[^>]*?)(\s)poster\s*=\s*(['"])([^'"]+)\3/gi;
  result = result.replace(posterRegex, (match, prefix, space, quote, url) => {
    if (isExternalUrl(url) || isDataUri(url)) {
      return match;
    }

    const absolutePath = resolveAssetPath(url, htmlFilePath);
    const asset = manifest.assets.get(absolutePath);

    if (!asset) {
      return match;
    }

    const newUrl = getRewrittenUrl(asset);
    return `${prefix}${space}poster=${quote}${newUrl}${quote}`;
  });

  // Rewrite srcset attributes
  const srcsetRegex = /srcset\s*=\s*(['"])([^'"]+)\1/gi;
  result = result.replace(srcsetRegex, (_match, quote, srcsetValue) => {
    // Parse srcset: "url1 1x, url2 2x" or "url1 480w, url2 800w"
    const entries = srcsetValue.split(',').map((entry: string) => {
      const trimmed = entry.trim();
      const spaceIndex = trimmed.indexOf(' ');

      if (spaceIndex <= 0) {
        // No descriptor, just URL
        const url = trimmed;
        if (isExternalUrl(url) || isDataUri(url)) {
          return trimmed;
        }
        const absolutePath = resolveAssetPath(url, htmlFilePath);
        const asset = manifest.assets.get(absolutePath);
        return asset ? getRewrittenUrl(asset) : trimmed;
      }

      const url = trimmed.substring(0, spaceIndex);
      const descriptor = trimmed.substring(spaceIndex); // Include the space

      if (isExternalUrl(url) || isDataUri(url)) {
        return trimmed;
      }

      const absolutePath = resolveAssetPath(url, htmlFilePath);
      const asset = manifest.assets.get(absolutePath);

      if (!asset) {
        return trimmed;
      }

      return getRewrittenUrl(asset) + descriptor;
    });

    return `srcset=${quote}${entries.join(', ')}${quote}`;
  });

  return result;
}
