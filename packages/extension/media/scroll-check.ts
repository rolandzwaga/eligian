/**
 * Runtime check of a scroll timeline's container in the preview (Feature 049).
 *
 * The compiler can only tell whether the container exists and whether some CSS
 * makes it scrollable. Whether it can actually scroll depends on the rendered
 * layout: its computed overflow and whether its content is taller than it.
 */

const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

/** The problem with the scroll container, or undefined when it can scroll. */
export function scrollContainerProblem(
  element: Element | null,
  selector: string,
  computedOverflowY: (element: Element) => string
): string | undefined {
  if (!element) {
    return `Scroll container '${selector}' is not in the preview's layout, so the timeline cannot move`;
  }
  const overflowY = computedOverflowY(element);
  if (!SCROLLABLE_OVERFLOW.has(overflowY)) {
    return `Scroll container '${selector}' cannot scroll: its overflow-y is '${overflowY}' (needs auto or scroll)`;
  }
  if (element.scrollHeight <= element.clientHeight) {
    return `Scroll container '${selector}' has nothing to scroll: its content (${element.scrollHeight}px) is not taller than the element (${element.clientHeight}px)`;
  }
  return undefined;
}

interface TimelineLike {
  readonly uri: string;
  readonly positionSource?: { readonly systemName?: string; readonly selector?: string };
}

/** The scroll selector of the timeline `uri`, when it is a scroll timeline. */
export function scrollSelectorOf(
  timelines: readonly TimelineLike[] | undefined,
  uri: string
): string | undefined {
  const timeline = timelines?.find(t => t.uri === uri);
  const source = timeline?.positionSource;
  return source?.systemName === 'ScrollPositionSource' ? source.selector : undefined;
}
