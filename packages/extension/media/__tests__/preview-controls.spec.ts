/**
 * Preview scrubber, readout and pickers (audit feature idea #5).
 */
import { describe, expect, test } from 'vitest';
import {
  fillPicker,
  formatTime,
  initialLanguage,
  languageOptions,
  pickedLanguage,
  showPlayhead,
  timeReadout,
  withPickedLanguage,
} from '../preview-controls.js';

describe('time readout', () => {
  test('seconds below a minute, m:ss.s from one minute on', () => {
    expect(formatTime(0)).toBe('0.0s');
    expect(formatTime(12.34)).toBe('12.3s');
    expect(formatTime(62.5)).toBe('1:02.5');
    expect(formatTime(-1)).toBe('0.0s');
    expect(formatTime(Number.NaN)).toBe('0.0s');
  });

  test('shows the duration only when it is known', () => {
    expect(timeReadout(3, 45)).toBe('3.0s / 45.0s');
    expect(timeReadout(3, undefined)).toBe('3.0s');
    expect(timeReadout(3, Number.POSITIVE_INFINITY)).toBe('3.0s');
  });
});

describe('language picker', () => {
  const config = {
    language: 'en-US',
    availableLanguages: [
      { languageCode: 'en-US', label: 'English' },
      { languageCode: 'nl-NL', label: 'Nederlands' },
    ],
  };

  test('lists the available languages', () => {
    expect(languageOptions(config)).toEqual([
      { value: 'en-US', label: 'English (en-US)' },
      { value: 'nl-NL', label: 'Nederlands (nl-NL)' },
    ]);
  });

  test('keeps a picked language across recompiles while the config still has it', () => {
    expect(initialLanguage(config, 'nl-NL')).toBe('nl-NL');
    expect(initialLanguage(config, 'de-DE')).toBe('en-US');
    expect(initialLanguage(config, undefined)).toBe('en-US');
  });

  test('remembers the pick in the webview state, keeping other keys', () => {
    const state = withPickedLanguage({ keepPositionOnReload: false }, 'nl-NL');
    expect(state).toEqual({ keepPositionOnReload: false, previewLanguage: 'nl-NL' });
    expect(pickedLanguage(state)).toBe('nl-NL');
    expect(pickedLanguage(undefined)).toBeUndefined();
  });
});

describe('DOM updates', () => {
  test('fillPicker writes text, selects the value and hides a picker with one option', () => {
    const select = document.createElement('select');
    fillPicker(
      select,
      [
        { value: 'a', label: '<b>A</b>' },
        { value: 'b', label: 'B' },
      ],
      'b'
    );
    expect(select.value).toBe('b');
    expect(select.querySelector('b')).toBeNull();
    expect(select.options[0].textContent).toBe('<b>A</b>');
    expect(select.style.display).toBe('');

    fillPicker(select, [{ value: 'a', label: 'A' }], 'a');
    expect(select.style.display).toBe('none');
  });

  test('showPlayhead clamps the scrubber and disables it without a duration', () => {
    const scrubber = document.createElement('input');
    scrubber.type = 'range';
    const readout = document.createElement('span');

    showPlayhead(scrubber, readout, 12, 30);
    expect([scrubber.max, scrubber.value, scrubber.disabled]).toEqual(['30', '12', false]);
    expect(readout.textContent).toBe('12.0s / 30.0s');

    showPlayhead(scrubber, readout, 4, undefined);
    expect(scrubber.disabled).toBe(true);
    expect(readout.textContent).toBe('4.0s');
  });
});
