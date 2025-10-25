/**
 * HTML Validator Tests
 *
 * Tests for IHtmlValidator interface and HtmlValidator implementation.
 *
 * Note: htmlparser2 mimics browser behavior and is forgiving with many HTML quirks.
 * These tests focus on truly malformed HTML that would cause runtime issues,
 * not strict XHTML validation.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HtmlValidator } from '../html-validator.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('HTML Validator', () => {
  const validator = new HtmlValidator();
  const fixturesDir = resolve(__dirname, '../__fixtures__/assets');

  describe('Valid HTML', () => {
    it('should validate well-formed HTML', () => {
      const html = readFileSync(resolve(fixturesDir, 'valid.html'), 'utf-8');
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept HTML5 doctype', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept self-closing tags', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <img src="image.png" alt="Test">
  <br>
  <hr>
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept HTML with nested elements', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <div class="container">
    <header>
      <h1>Title</h1>
    </header>
    <main>
      <p>Content</p>
    </main>
  </div>
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept HTML with UTF-8 characters', () => {
      const html = '<!DOCTYPE html><html><body><p>© 2025 — Test</p></body></html>';
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept HTML with optional closing tags omitted (browser-style)', () => {
      // Browsers auto-close <p> tags - this is valid HTML5
      const html = '<html><body><p>Text<div>Content</div></body></html>';
      const result = validator.validate(html);

      expect(result.valid).toBe(true); // Browser-style HTML is valid
    });

    it('should accept HTML with void elements', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <input type="text">
  <br>
  <hr>
  <img src="test.png" alt="Test">
  <meta charset="UTF-8">
  <link rel="stylesheet" href="style.css">
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid HTML - Truly Malformed', () => {
    it('should handle empty string', () => {
      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message.toLowerCase()).toContain('empty');
    });

    it('should handle non-HTML content', () => {
      const result = validator.validate('This is just plain text without HTML tags');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only content', () => {
      const result = validator.validate('   \n\t  \n  ');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message.toLowerCase()).toContain('empty');
    });
  });

  describe('Error Details', () => {
    it('should provide helpful hints for empty content', () => {
      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].hint).toBeTruthy();
      expect(result.errors[0].hint.length).toBeGreaterThan(0);
    });

    it('should provide hints for non-HTML content', () => {
      const result = validator.validate('Just plain text');

      expect(result.valid).toBe(false);
      expect(result.errors[0].hint).toContain('HTML');
    });
  });

  describe('Edge Cases', () => {
    it('should handle HTML comments', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <!-- This is a comment -->
  <p>Content</p>
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CDATA sections', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <script><![CDATA[
    var x = 1 < 2;
  ]]></script>
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle HTML entities', () => {
      const html =
        '<!DOCTYPE html><html><body><p>&lt;div&gt; &amp; &quot;test&quot;</p></body></html>';
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle complex nesting', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <div>
    <ul>
      <li><a href="#">Link</a></li>
      <li><span>Text</span></li>
    </ul>
  </div>
</body>
</html>`;
      const result = validator.validate(html);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
