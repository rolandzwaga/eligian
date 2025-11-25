/**
 * HTML Generator Tests
 *
 * Tests for the html-generator module that creates the index.html entry point
 * for standalone bundles.
 *
 * Includes tests for:
 * - FR-017: Minimal HTML wrapper when no layout template
 * - FR-018: Layout template HTML content inclusion
 */

import { describe, expect, test } from 'vitest';
import { generateContainerElement, generateHTML } from '../../bundler/html-generator.js';
import type { HTMLGeneratorConfig } from '../../bundler/types.js';

describe('HTML Generator (Feature 040, Phase 2)', () => {
  describe('generateHTML', () => {
    test('should generate complete HTML document with all fields populated', () => {
      const config: HTMLGeneratorConfig = {
        title: 'My Presentation',
        css: '.slide { background: #fff; }',
        layoutTemplate: '<div class="slide">Content</div>',
        containerSelector: '#presentation',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>My Presentation</title>');
      expect(html).toContain('.slide { background: #fff; }');
      expect(html).toContain('<div class="slide">Content</div>');
      expect(html).toContain('id="presentation"');
      expect(html).toContain('<script type="module" src="bundle.js"></script>');
    });

    test('should generate minimal HTML wrapper when no layout template (FR-017)', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Minimal',
        css: '',
        layoutTemplate: '', // No layout template
        containerSelector: '#app',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      // Should still have valid structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Minimal</title>');
      expect(html).toContain('id="app"');
      // Container should be empty but present
      expect(html).toContain('<div id="app"></div>');
    });

    test('should include layout template HTML content in container (FR-018)', () => {
      const layoutHTML = `<header class="header">Header Content</header>
        <main class="content">
          <section id="slide1">Slide 1</section>
          <section id="slide2">Slide 2</section>
        </main>
        <footer class="footer">Footer</footer>`;

      const config: HTMLGeneratorConfig = {
        title: 'With Layout',
        css: '',
        layoutTemplate: layoutHTML,
        containerSelector: '#container',
        bundlePath: 'bundle.js',
      };

      const html = generateHTML(config);

      // Layout template should be inserted inside container
      expect(html).toContain('<header class="header">Header Content</header>');
      expect(html).toContain('<section id="slide1">Slide 1</section>');
      expect(html).toContain('<footer class="footer">Footer</footer>');
    });

    test('should handle empty CSS gracefully', () => {
      const config: HTMLGeneratorConfig = {
        title: 'No CSS',
        css: '',
        layoutTemplate: '<div>Content</div>',
        containerSelector: '#app',
      };

      const html = generateHTML(config);

      // Should have style tag even if empty
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
    });

    test('should use default bundle path when not specified', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Default Bundle',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
        // bundlePath not specified - should default to 'bundle.js'
      };

      const html = generateHTML(config);
      expect(html).toContain('<script type="module" src="bundle.js"></script>');
    });

    test('should HTML-escape special characters in title', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Test <script>alert("xss")</script>',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);

      // Title should be escaped
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });

    test('should include viewport meta tag for responsive design', () => {
      const config: HTMLGeneratorConfig = {
        title: 'Responsive',
        css: '',
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('width=device-width');
    });

    test('should handle large CSS content', () => {
      const largeCSS = '.class { color: red; }\n'.repeat(1000);
      const config: HTMLGeneratorConfig = {
        title: 'Large CSS',
        css: largeCSS,
        layoutTemplate: '',
        containerSelector: '#app',
      };

      const html = generateHTML(config);
      expect(html).toContain('.class { color: red; }');
    });
  });

  describe('generateContainerElement', () => {
    test('should generate div with ID from selector "#container"', () => {
      const element = generateContainerElement('#container', '');
      expect(element).toContain('id="container"');
      expect(element).toMatch(/<div /);
    });

    test('should generate div with class from selector ".app"', () => {
      const element = generateContainerElement('.app', '');
      expect(element).toContain('class="app"');
    });

    test('should generate div with ID and classes from combined selector "#app.main.active"', () => {
      const element = generateContainerElement('#app.main.active', '');
      expect(element).toContain('id="app"');
      expect(element).toContain('class="main active"');
    });

    test('should include layout template content inside container', () => {
      const layout = '<div class="inner">Content</div>';
      const element = generateContainerElement('#container', layout);
      expect(element).toContain(layout);
    });

    test('should handle empty layout template', () => {
      const element = generateContainerElement('#container', '');
      expect(element).toBe('<div id="container"></div>');
    });
  });
});
