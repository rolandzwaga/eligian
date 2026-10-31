/**
 * preview-dom.ts - DOM helpers for the preview webview (media/preview.ts)
 *
 * Kept free of Eligius/VS Code dependencies so they can be unit tested in jsdom.
 *
 * Every piece of compiler- or engine-provided text (error messages, codes,
 * eventbus event names, topics and args) is written with `textContent`, never
 * interpolated into `innerHTML`: messages routinely contain source text such as
 * import paths, string literals and HTML strings from operation data, which
 * would otherwise render as live markup (an injected `<style>` or `<img>` would
 * restyle the whole preview).
 *
 * Constitution Principle I: Simplicity & Documentation
 */

/** A compilation error/warning as posted by PreviewPanel in a 'showError' message. */
export interface PreviewError {
  message?: unknown;
  severity?: unknown;
  line?: unknown;
  column?: unknown;
  code?: unknown;
}

/** One recorded eventbus event shown in the debug viewer. */
export interface DebugEvent {
  timestamp: number;
  eventName: string;
  eventTopic?: string;
  args: unknown[];
}

const CSS_ID_ATTRIBUTE = 'data-css-id';
const LOAD_ORDER_ATTRIBUTE = 'data-load-order';

/** Severity CSS class: an allow-list, never raw input. */
function severityClass(severity: unknown): 'error' | 'warning' {
  return severity === 'warning' ? 'warning' : 'error';
}

function textDiv(doc: Document, className: string, text: string): HTMLDivElement {
  const div = doc.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

/**
 * Render compilation errors into `container`, replacing its content.
 */
export function renderErrorList(container: HTMLElement, errors: readonly PreviewError[]): void {
  const doc = container.ownerDocument;
  container.replaceChildren(
    ...errors.map(error => {
      const severity = severityClass(error.severity);
      const item = doc.createElement('div');
      item.className = `error-item ${severity}`;
      item.appendChild(
        textDiv(doc, 'error-severity', severity === 'warning' ? '⚠️ Warning' : '❌ Error')
      );
      item.appendChild(textDiv(doc, 'error-message', String(error.message ?? '')));
      if (error.line) {
        const column = error.column ? `, Column ${String(error.column)}` : '';
        item.appendChild(textDiv(doc, 'error-location', `Line ${String(error.line)}${column}`));
      }
      if (error.code) {
        item.appendChild(textDiv(doc, 'error-code', `[${String(error.code)}]`));
      }
      return item;
    })
  );
}

/**
 * Render debug-viewer events into `container`, replacing its content.
 */
export function renderDebugEvents(container: HTMLElement, events: readonly DebugEvent[]): void {
  const doc = container.ownerDocument;

  if (events.length === 0) {
    const empty = doc.createElement('div');
    empty.style.padding = '20px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--vscode-descriptionForeground)';
    empty.textContent = 'No events to display';
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(
    ...events.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      } as Intl.DateTimeFormatOptions);

      const item = doc.createElement('div');
      item.className = 'debug-event';

      const header = doc.createElement('div');
      header.className = 'debug-event-header';
      const name = doc.createElement('span');
      name.className = 'debug-event-name';
      name.textContent = event.eventName;
      const timeSpan = doc.createElement('span');
      timeSpan.className = 'debug-event-time';
      timeSpan.textContent = time;
      header.append(name, timeSpan);
      item.appendChild(header);

      if (event.eventTopic) {
        item.appendChild(textDiv(doc, 'debug-event-topic', `Topic: ${event.eventTopic}`));
      }
      // .debug-event-args is styled white-space: pre-wrap, so the JSON keeps its layout
      item.appendChild(textDiv(doc, 'debug-event-args', JSON.stringify(event.args, null, 2)));
      return item;
    })
  );
}

/** All injected stylesheet tags, in document order. */
function injectedStyleTags(doc: Document): HTMLStyleElement[] {
  return Array.from(doc.head.querySelectorAll<HTMLStyleElement>(`style[${CSS_ID_ATTRIBUTE}]`));
}

/**
 * Find the injected stylesheet tag for `cssId` (compared by attribute value,
 * so ids containing quotes or other selector syntax cannot break the lookup).
 */
export function findStyleTag(doc: Document, cssId: string): HTMLStyleElement | undefined {
  return injectedStyleTags(doc).find(tag => tag.getAttribute(CSS_ID_ATTRIBUTE) === cssId);
}

function loadOrderOf(tag: Element): number {
  const value = Number(tag.getAttribute(LOAD_ORDER_ATTRIBUTE));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Apply a 'css-load' message: create or update the stylesheet and place it in
 * cascade order (before the first injected stylesheet with a higher load
 * order), so reordering `styles` imports in the source reorders the cascade.
 */
export function applyCSSLoad(
  doc: Document,
  cssId: string,
  content: string,
  loadOrder: number
): HTMLStyleElement {
  let styleTag = findStyleTag(doc, cssId);
  if (!styleTag) {
    styleTag = doc.createElement('style');
    styleTag.setAttribute(CSS_ID_ATTRIBUTE, cssId);
  }
  styleTag.setAttribute(LOAD_ORDER_ATTRIBUTE, String(loadOrder));
  // CRITICAL: textContent (NOT innerHTML)
  styleTag.textContent = content;

  const others = injectedStyleTags(doc).filter(tag => tag !== styleTag);
  const next = others.find(tag => loadOrderOf(tag) > loadOrder);
  if (next) {
    next.before(styleTag);
  } else if (others.length > 0) {
    // Last in cascade order: after every other injected stylesheet
    others[others.length - 1].after(styleTag);
  } else if (styleTag.parentNode !== doc.head) {
    doc.head.appendChild(styleTag);
  }
  return styleTag;
}

/**
 * Apply a 'css-reload' message (hot-reload: the timeline keeps running).
 *
 * Creates the stylesheet when it is missing, e.g. a file whose initial load
 * failed and was then fixed, or a webview that was reloaded.
 */
export function applyCSSReload(doc: Document, cssId: string, content: string): HTMLStyleElement {
  let styleTag = findStyleTag(doc, cssId);
  if (!styleTag) {
    styleTag = doc.createElement('style');
    styleTag.setAttribute(CSS_ID_ATTRIBUTE, cssId);
    doc.head.appendChild(styleTag);
  }
  styleTag.textContent = content;
  return styleTag;
}

/**
 * Apply a 'css-remove' message.
 */
export function applyCSSRemove(doc: Document, cssId: string): void {
  findStyleTag(doc, cssId)?.remove();
}
