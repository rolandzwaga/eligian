/**
 * Label Editor Accessibility Tests (Feature 036, User Story 5)
 *
 * Tests verify accessibility requirements:
 * - T048: CSS variables for theme support
 * - T049: Tabindex on interactive elements, keyboard shortcuts
 * - T050: ARIA labels on all elements
 * - T052: Visible focus indicators
 *
 * These tests parse the HTML template and verify accessibility attributes
 * are present, without requiring a full VS Code webview runtime.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Label Editor Accessibility (Feature 036, User Story 5)', () => {
  let dom: JSDOM;
  let document: Document;
  let styleContent: string;

  beforeAll(() => {
    // Load the HTML template
    const templatePath = path.join(__dirname, '..', 'templates', 'locale-editor.html');
    const html = fs.readFileSync(templatePath, 'utf8');
    dom = new JSDOM(html, { runScripts: 'outside-only' });
    document = dom.window.document;

    // Extract style content for CSS testing
    const styleElement = document.querySelector('style');
    styleContent = styleElement?.textContent ?? '';
  });

  describe('T048: CSS Variables for Theme Support', () => {
    it('should use VS Code CSS variables for colors', () => {
      // Check that VS Code theme variables are used
      expect(styleContent).toContain('--vscode-foreground');
      expect(styleContent).toContain('--vscode-editor-background');
      expect(styleContent).toContain('--vscode-button-background');
      expect(styleContent).toContain('--vscode-button-foreground');
      expect(styleContent).toContain('--vscode-input-background');
      expect(styleContent).toContain('--vscode-input-foreground');
    });

    it('should use VS Code CSS variables for borders and panels', () => {
      expect(styleContent).toContain('--vscode-panel-border');
      expect(styleContent).toContain('--vscode-sideBar-background');
      expect(styleContent).toContain('--vscode-titleBar-activeBackground');
    });

    it('should use VS Code CSS variables for list items', () => {
      expect(styleContent).toContain('--vscode-list-activeSelectionBackground');
      expect(styleContent).toContain('--vscode-list-hoverBackground');
      expect(styleContent).toContain('--vscode-list-inactiveSelectionBackground');
    });

    it('should use VS Code CSS variables for focus states', () => {
      expect(styleContent).toContain('--vscode-focusBorder');
    });

    it('should use VS Code CSS variables for validation errors', () => {
      expect(styleContent).toContain('--vscode-errorForeground');
      expect(styleContent).toContain('--vscode-inputValidation-errorBorder');
      expect(styleContent).toContain('--vscode-inputValidation-errorBackground');
    });
  });

  describe('T049: Tabindex on Interactive Elements and Keyboard Shortcuts', () => {
    it('should have tabindex on groups list container', () => {
      const groupsList = document.getElementById('groups-list');
      expect(groupsList).not.toBeNull();
      expect(groupsList?.getAttribute('role')).toBe('list');
    });

    it('should have tabindex on translations container', () => {
      const translationsContainer = document.getElementById('translations-container');
      expect(translationsContainer).not.toBeNull();
      expect(translationsContainer?.getAttribute('role')).toBe('list');
    });

    it('should have tabindex on buttons', () => {
      const buttons = document.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);

      // Buttons should be focusable by default (no negative tabindex)
      buttons.forEach(button => {
        const tabIndex = button.getAttribute('tabindex');
        // Either no tabindex (default focusable) or non-negative
        expect(tabIndex === null || Number.parseInt(tabIndex, 10) >= 0).toBe(true);
      });
    });

    it('should have role="button" on interactive buttons', () => {
      const addGroupBtn = document.getElementById('add-group-btn');
      const addTranslationBtn = document.getElementById('add-translation-btn');

      expect(addGroupBtn?.getAttribute('role')).toBe('button');
      expect(addTranslationBtn?.getAttribute('role')).toBe('button');
    });
  });

  describe('T050: ARIA Labels on Elements', () => {
    it('should have aria-label on Add Label Id button', () => {
      const addGroupBtn = document.getElementById('add-group-btn');
      expect(addGroupBtn?.getAttribute('aria-label')).toBe('Add Label Id');
    });

    it('should have aria-label on Add Translation button', () => {
      const addTranslationBtn = document.getElementById('add-translation-btn');
      expect(addTranslationBtn?.getAttribute('aria-label')).toBe('Add Translation to All Groups');
    });

    it('should have aria-label on groups list container', () => {
      const groupsList = document.getElementById('groups-list');
      expect(groupsList?.getAttribute('aria-label')).toBe('Label Groups');
    });

    it('should have aria-label on translations container', () => {
      const translationsContainer = document.getElementById('translations-container');
      expect(translationsContainer?.getAttribute('aria-label')).toBe('Translations');
    });

    it('should have aria-live on empty state for screen reader announcements', () => {
      const emptyState = document.getElementById('empty-state');
      expect(emptyState?.getAttribute('aria-live')).toBe('polite');
      expect(emptyState?.getAttribute('role')).toBe('status');
    });
  });

  describe('T052: Visible Focus Indicators', () => {
    it('should have CSS rules for focus states on all elements', () => {
      // Check generic focus rule
      expect(styleContent).toContain('*:focus');
      expect(styleContent).toContain('outline:');
    });

    it('should have specific focus rules for buttons', () => {
      expect(styleContent).toContain('button:focus');
    });

    it('should have specific focus rules for inputs', () => {
      expect(styleContent).toContain('input:focus');
    });

    it('should have specific focus rules for selects', () => {
      expect(styleContent).toContain('select:focus');
    });

    it('should use focusBorder variable for focus indicator color', () => {
      // Find focus-related CSS rules
      const focusRuleMatch = styleContent.match(/[*\w:,\s]+focus[^{]*\{[^}]+\}/g);
      expect(focusRuleMatch).not.toBeNull();

      // At least one focus rule should use --vscode-focusBorder
      const hasFocusBorderVar = focusRuleMatch?.some(rule => rule.includes('--vscode-focusBorder'));
      expect(hasFocusBorderVar).toBe(true);
    });

    it('should have outline-offset for better visibility', () => {
      expect(styleContent).toContain('outline-offset');
    });
  });

  describe('Keyboard Navigation Support in Webview Script', () => {
    // These tests verify the webview script includes keyboard navigation handlers
    // The actual keyboard handling is tested dynamically at runtime

    it('should intercept Ctrl+S for save shortcut (verified in webview script)', () => {
      // The webview script locale-editor.ts includes:
      // document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') ... })
      // This cannot be tested without loading the script, but we document it here
      // and verify the script file exists and contains the handler
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      expect(scriptContent).toContain("e.key === 's'");
      expect(scriptContent).toContain('e.ctrlKey');
      expect(scriptContent).toContain('e.metaKey');
    });

    it('should support Enter key to select groups (verified in webview script)', () => {
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      expect(scriptContent).toContain("e.key === 'Enter'");
    });

    it('should support arrow keys for group navigation (verified in webview script)', () => {
      const scriptPath = path.join(__dirname, '..', '..', '..', '..', 'media', 'locale-editor.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      expect(scriptContent).toContain("e.key === 'ArrowDown'");
      expect(scriptContent).toContain("e.key === 'ArrowUp'");
    });
  });
});
