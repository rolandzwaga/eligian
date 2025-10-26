/**
 * Unit tests for CSS code action helpers and provider
 *
 * These tests verify that CSS quick fix code actions are generated correctly:
 * - Extract class/ID names from diagnostic messages
 * - Create WorkspaceEdit for adding CSS rules
 * - Generate CodeAction items with proper structure
 */

import { describe, expect, it } from 'vitest';
import type { Diagnostic, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import {
  CSS_RELATED_CODES,
  createCSSClassEdit,
  createCSSIDEdit,
  extractClassNameFromDiagnostic,
  extractIDNameFromDiagnostic,
  isCSSRelatedDiagnostic,
} from '../../css/code-action-helpers.js';

describe('CSS Code Action Helpers', () => {
  describe('extractClassNameFromDiagnostic', () => {
    it('should extract class name from "Unknown CSS class" message', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS class 'button'",
        severity: DiagnosticSeverity.Error,
        code: 'css-unknown-class',
      };

      const result = extractClassNameFromDiagnostic(diagnostic);

      expect(result).toBe('button');
    });

    it('should extract class name from "not defined" message', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "CSS class 'primary' is not defined in any imported CSS files",
        severity: DiagnosticSeverity.Error,
        code: 'css-unknown-class',
      };

      const result = extractClassNameFromDiagnostic(diagnostic);

      expect(result).toBe('primary');
    });

    it('should extract class name with hyphens', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS class 'btn-primary'",
        severity: DiagnosticSeverity.Error,
        code: 'css-unknown-class',
      };

      const result = extractClassNameFromDiagnostic(diagnostic);

      expect(result).toBe('btn-primary');
    });

    it('should return undefined for non-CSS diagnostic', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Some other error message',
        severity: DiagnosticSeverity.Error,
      };

      const result = extractClassNameFromDiagnostic(diagnostic);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no class name in message', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'CSS syntax error',
        severity: DiagnosticSeverity.Error,
        code: 'css-invalid-selector',
      };

      const result = extractClassNameFromDiagnostic(diagnostic);

      expect(result).toBeUndefined();
    });
  });

  describe('extractIDNameFromDiagnostic', () => {
    it('should extract ID name from "Unknown CSS ID" message', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS ID 'header'",
        severity: DiagnosticSeverity.Error,
        code: 'css-unknown-id',
      };

      const result = extractIDNameFromDiagnostic(diagnostic);

      expect(result).toBe('header');
    });

    it('should return undefined for non-CSS ID diagnostic', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS class 'button'",
        severity: DiagnosticSeverity.Error,
        code: 'css-unknown-class',
      };

      const result = extractIDNameFromDiagnostic(diagnostic);

      expect(result).toBeUndefined();
    });
  });

  describe('createCSSClassEdit', () => {
    it('should create WorkspaceEdit with CSS class rule at end of file', () => {
      const cssFileUri = 'file:///styles.css';
      const className = 'button';
      const cssFileContent = '.existing { color: red; }\n';

      const result: WorkspaceEdit = createCSSClassEdit(cssFileUri, className, cssFileContent);

      expect(result.changes).toBeDefined();
      expect(result.changes![cssFileUri]).toHaveLength(1);

      const textEdit = result.changes![cssFileUri][0];
      expect(textEdit.newText).toContain('.button {');
      expect(textEdit.newText).toContain('/* TODO: Add styles */');
      expect(textEdit.newText).toMatch(/\.button \{\n {2}\/\* TODO: Add styles \*\/\n\}\n/);
    });

    it('should insert at correct position for empty file', () => {
      const cssFileUri = 'file:///styles.css';
      const className = 'new-class';
      const cssFileContent = '';

      const result: WorkspaceEdit = createCSSClassEdit(cssFileUri, className, cssFileContent);

      const textEdit = result.changes![cssFileUri][0];
      expect(textEdit.range.start.line).toBe(0);
      expect(textEdit.range.start.character).toBe(0);
    });

    it('should insert at end of multi-line file', () => {
      const cssFileUri = 'file:///styles.css';
      const className = 'footer';
      const cssFileContent = '.header { color: blue; }\n.main { color: green; }\n';

      const result: WorkspaceEdit = createCSSClassEdit(cssFileUri, className, cssFileContent);

      const textEdit = result.changes![cssFileUri][0];
      // Should be on line 2 (0-indexed), after ".main { color: green; }\n"
      expect(textEdit.range.start.line).toBe(2);
    });

    it('should handle class names with hyphens and underscores', () => {
      const cssFileUri = 'file:///styles.css';
      const className = 'btn-primary_active';
      const cssFileContent = '';

      const result: WorkspaceEdit = createCSSClassEdit(cssFileUri, className, cssFileContent);

      const textEdit = result.changes![cssFileUri][0];
      expect(textEdit.newText).toContain('.btn-primary_active {');
    });
  });

  describe('createCSSIDEdit', () => {
    it('should create WorkspaceEdit with CSS ID rule', () => {
      const cssFileUri = 'file:///styles.css';
      const idName = 'header';
      const cssFileContent = '.button { color: red; }\n';

      const result: WorkspaceEdit = createCSSIDEdit(cssFileUri, idName, cssFileContent);

      expect(result.changes).toBeDefined();
      expect(result.changes![cssFileUri]).toHaveLength(1);

      const textEdit = result.changes![cssFileUri][0];
      expect(textEdit.newText).toContain('#header {');
      expect(textEdit.newText).toContain('/* TODO: Add styles */');
    });
  });

  describe('isCSSRelatedDiagnostic', () => {
    it('should return true for unknown_css_class code in data', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS class 'button'",
        severity: DiagnosticSeverity.Error,
        data: { code: 'unknown_css_class' },
      };

      expect(isCSSRelatedDiagnostic(diagnostic)).toBe(true);
    });

    it('should return true for unknown_css_id_in_selector code in data', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "Unknown CSS ID in selector: 'header'",
        severity: DiagnosticSeverity.Error,
        data: { code: 'unknown_css_id_in_selector' },
      };

      expect(isCSSRelatedDiagnostic(diagnostic)).toBe(true);
    });

    it('should return false for non-CSS diagnostic code', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Syntax error',
        severity: DiagnosticSeverity.Error,
        data: { code: 'syntax-error' },
      };

      expect(isCSSRelatedDiagnostic(diagnostic)).toBe(false);
    });

    it('should return false when diagnostic has no data', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Some error',
        severity: DiagnosticSeverity.Error,
      };

      expect(isCSSRelatedDiagnostic(diagnostic)).toBe(false);
    });

    it('should return false when diagnostic data.code is a number', () => {
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Some error',
        severity: DiagnosticSeverity.Error,
        data: { code: 123 },
      };

      expect(isCSSRelatedDiagnostic(diagnostic)).toBe(false);
    });
  });

  describe('CSS_RELATED_CODES constant', () => {
    it('should include unknown_css_class', () => {
      expect(CSS_RELATED_CODES).toContain('unknown_css_class');
    });

    it('should include unknown_css_class_in_selector', () => {
      expect(CSS_RELATED_CODES).toContain('unknown_css_class_in_selector');
    });

    it('should include unknown_css_id_in_selector', () => {
      expect(CSS_RELATED_CODES).toContain('unknown_css_id_in_selector');
    });

    it('should include invalid_css_selector', () => {
      expect(CSS_RELATED_CODES).toContain('invalid_css_selector');
    });
  });
});
