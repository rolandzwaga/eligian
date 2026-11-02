/**
 * Elements and attributes Eligius `createElement` refuses at runtime must never be
 * completed (audit 2026-10-22, low #30), and global attributes (ARIA) are available (#35).
 */

import { describe, expect, test } from 'vitest';
import {
  getAttributeEnumValues,
  getElementAttributes,
  HTML_ELEMENT_ATTRIBUTES,
  HTML_ELEMENT_NAMES,
} from '../html-elements.generated.js';
import { HTMLElementCompletionProvider } from '../html-elements.js';

describe('html element metadata honours the Eligius createElement restrictions', () => {
  const provider = new HTMLElementCompletionProvider();

  test('script is not an element name', () => {
    expect((HTML_ELEMENT_NAMES as readonly string[]).includes('script')).toBe(false);
    expect(provider.getElementNameCompletions('script').map(c => c.label)).not.toContain('script');
    expect(Object.keys(HTML_ELEMENT_ATTRIBUTES)).not.toContain('script');
  });

  test('no element offers srcdoc or on* attributes', () => {
    for (const tag of HTML_ELEMENT_NAMES) {
      const names = getElementAttributes(tag).map(a => a.name);
      expect(names, tag).not.toContain('srcdoc');
      expect(
        names.filter(n => /^on[a-z]/.test(n)),
        tag
      ).toEqual([]);
    }
    expect(provider.getAttributeNameCompletions('iframe').map(c => c.label)).not.toContain(
      'srcdoc'
    );
  });

  test('every element offers the global ARIA attributes and role', () => {
    const completions = provider.getAttributeNameCompletions('div');
    const labels = completions.map(c => c.label);
    expect(labels).toContain('role');
    expect(labels).toContain('aria-label');
    expect(labels).toContain('aria-hidden');
    // Hyphenated names are inserted quoted when completing an identifier key
    expect(completions.find(c => c.label === 'aria-label')?.insertText).toBe('"aria-label"');
  });

  test('a data- prefix entry is offered, respects the typed filter and is sorted', () => {
    const all = provider.getAttributeNameCompletions('div').map(c => c.label);
    expect(all).toContain('data-');
    expect([...all].sort((a, b) => a.localeCompare(b))).toEqual(all);
    expect(provider.getAttributeNameCompletions('div', 'dat').map(c => c.label)).toContain('data-');
    expect(provider.getAttributeNameCompletions('div', 'zzz').map(c => c.label)).not.toContain(
      'data-'
    );
  });

  test('target/formtarget on form-related elements use the browsing-context enum', () => {
    const expected = ['_blank', '_parent', '_self', '_top'];
    expect(getAttributeEnumValues('form', 'target')).toEqual(expected);
    expect(getAttributeEnumValues('button', 'formtarget')).toEqual(expected);
    expect(getAttributeEnumValues('input', 'formtarget')).toEqual(expected);
  });
});
