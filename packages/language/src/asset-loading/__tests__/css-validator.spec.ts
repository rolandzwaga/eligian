/**
 * CSS Validator Tests
 *
 * Tests for ICssValidator interface and CssValidator implementation.
 *
 * Note: css-tree is fault-tolerant and recovers from many CSS errors (like browsers).
 * These tests focus on validating that CSS is parseable, not on enforcing strict
 * CSS specification compliance.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CssValidator } from '../css-validator.js';

// Get current file's directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CSS Validator', () => {
  const validator = new CssValidator();
  const fixturesDir = resolve(__dirname, '../__fixtures__/assets');

  describe('Valid CSS', () => {
    it('should validate well-formed CSS', () => {
      const css = readFileSync(resolve(fixturesDir, 'valid.css'), 'utf-8');
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with media queries', () => {
      const css = `
@media (min-width: 768px) {
  .container {
    max-width: 1200px;
  }
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with keyframes', () => {
      const css = `
@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with custom properties', () => {
      const css = `
:root {
  --primary-color: #007bff;
  --font-size: 16px;
}

.button {
  color: var(--primary-color);
  font-size: var(--font-size);
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with pseudo-classes', () => {
      const css = `
a:hover {
  color: blue;
}

input:focus {
  border-color: red;
}

.item:nth-child(2) {
  background: gray;
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with nested selectors', () => {
      const css = `
.container .item {
  color: red;
}

div > p {
  margin: 0;
}

h1 + p {
  font-weight: bold;
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept empty CSS', () => {
      const result = validator.validate('');

      // Empty CSS is technically valid (no rules)
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CSS with comments only', () => {
      const css = `
/* This is a comment */
/* Another comment */
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject CSS with missing semicolons', () => {
      // PostCSS is stricter than css-tree and catches missing semicolons
      const css = `
.container {
  color: red
  font-size: 16px
}
`;
      const result = validator.validate(css);

      // PostCSS catches missing semicolons (stricter validation)
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('semicolon');
    });
  });

  describe('Edge Cases', () => {
    it('should handle CSS with @ rules', () => {
      const css = `
@import url('other.css');
@charset "UTF-8";
@font-face {
  font-family: 'MyFont';
  src: url('font.woff2');
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS with important declarations', () => {
      const css = `
.override {
  color: red !important;
  font-size: 16px !important;
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle whitespace variations', () => {
      const css = `.compact{color:red;margin:0;}`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle complex nesting', () => {
      const css = `
@media screen and (min-width: 768px) {
  .container {
    display: flex;
  }
  
  .item:hover > .child {
    opacity: 1;
  }
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS Grid properties', () => {
      const css = `
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-gap: 1rem;
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CSS Flexbox properties', () => {
      const css = `
.flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
`;
      const result = validator.validate(css);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
