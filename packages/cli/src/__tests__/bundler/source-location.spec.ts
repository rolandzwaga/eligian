/**
 * Source Location Tracking Tests (IMP4)
 *
 * Tests for tracking line numbers in CSS url() references
 * to provide better error messages with source locations.
 */

import { describe, expect, test } from 'vitest';
import { extractCSSUrlsWithLines } from '../../bundler/asset-collector.js';

describe('Source Location Tracking (IMP4)', () => {
  describe('extractCSSUrlsWithLines', () => {
    test('should return empty array for empty CSS', () => {
      const result = extractCSSUrlsWithLines('');
      expect(result).toEqual([]);
    });

    test('should return empty array for CSS with no URLs', () => {
      const css = `.button { color: red; }`;
      const result = extractCSSUrlsWithLines(css);
      expect(result).toEqual([]);
    });

    test('should return correct line number for single URL', () => {
      const css = `.bg { background: url('./image.png'); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('./image.png');
      expect(result[0].line).toBe(1);
    });

    test('should return correct line numbers for multiple URLs on different lines', () => {
      const css = `.header {
  background: url('./header-bg.png');
}

.footer {
  background: url('./footer-bg.png');
}`;

      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ url: './header-bg.png', line: 2 });
      expect(result[1]).toEqual({ url: './footer-bg.png', line: 6 });
    });

    test('should handle multiple URLs on the same line', () => {
      const css = `.multi { background: url('./a.png'), url('./b.png'); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ url: './a.png', line: 1 });
      expect(result[1]).toEqual({ url: './b.png', line: 1 });
    });

    test('should handle URLs with single quotes', () => {
      const css = `.icon { background: url('./icon.svg'); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './icon.svg', line: 1 });
    });

    test('should handle URLs with double quotes', () => {
      const css = `.icon { background: url("./icon.svg"); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './icon.svg', line: 1 });
    });

    test('should handle URLs without quotes', () => {
      const css = `.icon { background: url(./icon.svg); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './icon.svg', line: 1 });
    });

    test('should skip external URLs', () => {
      const css = `.external {
  background: url('https://example.com/image.png');
  border-image: url('./local.png');
}`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './local.png', line: 3 });
    });

    test('should skip data URIs', () => {
      const css = `.data {
  background: url('data:image/png;base64,abc123');
  border-image: url('./local.png');
}`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './local.png', line: 3 });
    });

    test('should skip protocol-relative URLs', () => {
      const css = `.proto {
  background: url('//cdn.example.com/image.png');
  border-image: url('./local.png');
}`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ url: './local.png', line: 3 });
    });

    test('should handle real-world CSS file structure', () => {
      const css = `/* Main stylesheet */
@font-face {
  font-family: 'MyFont';
  src: url('./fonts/myfont.woff2') format('woff2');
}

.hero {
  background-image: url('./images/hero.jpg');
  background-size: cover;
}

.sidebar {
  background: #f0f0f0;
}

.footer {
  background: url('./images/pattern.png') repeat;
}

@media (max-width: 768px) {
  .hero {
    background-image: url('./images/hero-mobile.jpg');
  }
}`;

      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ url: './fonts/myfont.woff2', line: 4 });
      expect(result[1]).toEqual({ url: './images/hero.jpg', line: 8 });
      expect(result[2]).toEqual({ url: './images/pattern.png', line: 17 });
      expect(result[3]).toEqual({ url: './images/hero-mobile.jpg', line: 22 });
    });

    test('should return duplicate URLs with their respective line numbers', () => {
      // Unlike extractCSSUrls() which deduplicates, this function returns all occurrences
      // because each occurrence needs its own line number for error reporting
      const css = `.a { background: url('./shared.png'); }
.b { background: url('./shared.png'); }`;

      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ url: './shared.png', line: 1 });
      expect(result[1]).toEqual({ url: './shared.png', line: 2 });
    });

    test('should trim whitespace from URLs', () => {
      const css = `.space { background: url('  ./image.png  '); }`;
      const result = extractCSSUrlsWithLines(css);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('./image.png');
    });
  });
});
