/**
 * preview-dom regression tests (2026-10-22 audit, low findings):
 *
 * - #60 Compiler error messages and debug-viewer events were interpolated into
 *   innerHTML, so `<b>`, `<style>` or `<img>` in a message rendered as markup.
 * - #52 css-load never reordered an existing stylesheet (reordering `styles`
 *   imports did not change the cascade) and css-reload was a silent no-op for
 *   a stylesheet that was not injected yet.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyCSSLoad,
  applyCSSReload,
  applyCSSRemove,
  findStyleTag,
  renderDebugEvents,
  renderErrorList,
} from '../preview-dom.js';

function injectedIds(): Array<string | null> {
  return Array.from(document.head.querySelectorAll('style[data-css-id]')).map(tag =>
    tag.getAttribute('data-css-id')
  );
}

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('renderErrorList (#60)', () => {
  test('renders markup in messages and codes as text, not elements', () => {
    renderErrorList(container, [
      {
        message:
          'Cannot find "./<b>x.html"<style>body{display:none}</style><img src=https://x/y.png>',
        severity: 'error',
        line: 3,
        column: 7,
        code: '<i>E1</i>',
      },
    ]);

    expect(container.querySelector('b, style, img, i')).toBeNull();
    expect(container.querySelector('.error-message')?.textContent).toBe(
      'Cannot find "./<b>x.html"<style>body{display:none}</style><img src=https://x/y.png>'
    );
    expect(container.querySelector('.error-code')?.textContent).toBe('[<i>E1</i>]');
    expect(container.querySelector('.error-location')?.textContent).toBe('Line 3, Column 7');
  });

  test('takes the severity class from an allow-list', () => {
    renderErrorList(container, [
      { message: 'a', severity: 'warning' },
      { message: 'b', severity: 'error" onclick="x' },
      { message: 'c' },
    ]);

    const items = Array.from(container.querySelectorAll('.error-item'));
    expect(items.map(item => item.className)).toEqual([
      'error-item warning',
      'error-item error',
      'error-item error',
    ]);
    expect(items.some(item => item.hasAttribute('onclick'))).toBe(false);
    expect(items[0].querySelector('.error-severity')?.textContent).toContain('Warning');
    expect(items[1].querySelector('.error-severity')?.textContent).toContain('Error');
  });

  test('omits location and code when absent, and replaces previous content', () => {
    renderErrorList(container, [{ message: 'first' }, { message: 'second' }]);
    renderErrorList(container, [{ message: 'only' }]);

    expect(container.querySelectorAll('.error-item')).toHaveLength(1);
    expect(container.querySelector('.error-location')).toBeNull();
    expect(container.querySelector('.error-code')).toBeNull();
    expect(container.querySelector('.error-message')?.textContent).toBe('only');
  });
});

describe('renderDebugEvents (#60)', () => {
  test('renders event names, topics and HTML-bearing args as text', () => {
    renderDebugEvents(container, [
      {
        timestamp: 0,
        eventName: '<b>evt</b>',
        eventTopic: '<style>*{color:red}</style>',
        args: [{ template: '<link rel=stylesheet href=https://x/y.css><div>hi</div>' }],
      },
    ]);

    expect(container.querySelector('b, style, link')).toBeNull();
    expect(container.querySelector('.debug-event-name')?.textContent).toBe('<b>evt</b>');
    expect(container.querySelector('.debug-event-topic')?.textContent).toBe(
      'Topic: <style>*{color:red}</style>'
    );
    const args = container.querySelector('.debug-event-args')?.textContent ?? '';
    // Pretty-printed JSON, layout preserved
    expect(JSON.parse(args)).toEqual([
      { template: '<link rel=stylesheet href=https://x/y.css><div>hi</div>' },
    ]);
    expect(args).toContain('\n');
  });

  test('omits the topic row when there is no topic', () => {
    renderDebugEvents(container, [{ timestamp: 0, eventName: 'e', args: [] }]);
    expect(container.querySelector('.debug-event-topic')).toBeNull();
  });

  test('shows a placeholder when there are no events', () => {
    renderDebugEvents(container, [{ timestamp: 0, eventName: 'e', args: [] }]);
    renderDebugEvents(container, []);

    expect(container.querySelector('.debug-event')).toBeNull();
    expect(container.textContent).toBe('No events to display');
  });
});

describe('CSS stylesheet messages (#52)', () => {
  test('css-load creates stylesheets in load order with textContent', () => {
    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}</style><script>x()</script>', 1);

    expect(injectedIds()).toEqual(['a', 'b']);
    expect(document.head.querySelector('script')).toBeNull();
    expect(findStyleTag(document, 'b')?.textContent).toBe('.b{}</style><script>x()</script>');
  });

  test('reordered imports reorder the cascade', () => {
    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}', 1);
    applyCSSLoad(document, 'c', '.c{}', 2);

    // Recompile with the order c, a, b
    applyCSSLoad(document, 'c', '.c{}', 0);
    applyCSSLoad(document, 'a', '.a{}', 1);
    applyCSSLoad(document, 'b', '.b{}', 2);

    expect(injectedIds()).toEqual(['c', 'a', 'b']);
    expect(findStyleTag(document, 'a')?.getAttribute('data-load-order')).toBe('1');
  });

  test('swapping two imports swaps their stylesheets', () => {
    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}', 1);

    applyCSSLoad(document, 'b', '.b{}', 0);
    applyCSSLoad(document, 'a', '.a{}', 1);

    expect(injectedIds()).toEqual(['b', 'a']);
  });

  test('injected stylesheets stay after the template’s own styles', () => {
    const templateStyle = document.createElement('style');
    templateStyle.textContent = 'body{}';
    document.head.appendChild(templateStyle);

    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}', 1);
    applyCSSLoad(document, 'b', '.b{}', 0);
    applyCSSLoad(document, 'a', '.a{}', 1);

    expect(document.head.firstElementChild).toBe(templateStyle);
    expect(injectedIds()).toEqual(['b', 'a']);
  });

  test('css-reload updates an existing stylesheet in place', () => {
    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}', 1);

    applyCSSReload(document, 'a', '.a{color:red}');

    expect(injectedIds()).toEqual(['a', 'b']);
    expect(findStyleTag(document, 'a')?.textContent).toBe('.a{color:red}');
  });

  test('css-reload creates a stylesheet that is not injected yet', () => {
    applyCSSReload(document, 'late', '.late{}');

    expect(injectedIds()).toEqual(['late']);
    expect(findStyleTag(document, 'late')?.textContent).toBe('.late{}');
  });

  test('css-remove removes only the given stylesheet', () => {
    applyCSSLoad(document, 'a', '.a{}', 0);
    applyCSSLoad(document, 'b', '.b{}', 1);

    applyCSSRemove(document, 'a');
    applyCSSRemove(document, 'missing');

    expect(injectedIds()).toEqual(['b']);
  });

  test('ids containing selector syntax are matched literally', () => {
    applyCSSLoad(document, 'x"] , style[data-css-id="a', '.x{}', 0);
    applyCSSLoad(document, 'a', '.a{}', 1);

    applyCSSRemove(document, 'x"] , style[data-css-id="a');

    expect(injectedIds()).toEqual(['a']);
  });
});
