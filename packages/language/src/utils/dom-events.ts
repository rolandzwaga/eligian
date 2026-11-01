/**
 * DOM event names for `on <event> "<sel>" <verb>` (audit idea #19): validation
 * ("did you mean …?") and completion. Not exhaustive: an unknown name is a
 * warning, since an element can also receive custom events.
 */
import { levenshteinDistance } from '../css/levenshtein.js';

/** Common DOM events, grouped by kind, with a short description for completion. */
export const DOM_EVENTS: ReadonlyMap<string, string> = new Map([
  ['click', 'The element is clicked (or activated with Enter / Space)'],
  ['dblclick', 'The element is double-clicked'],
  ['contextmenu', 'The context menu is requested (right click)'],
  ['auxclick', 'A non-primary button is clicked'],
  ['mousedown', 'A mouse button is pressed on the element'],
  ['mouseup', 'A mouse button is released on the element'],
  ['mouseenter', 'The pointer enters the element (does not bubble)'],
  ['mouseleave', 'The pointer leaves the element (does not bubble)'],
  ['mouseover', 'The pointer moves onto the element or a child'],
  ['mouseout', 'The pointer moves off the element or a child'],
  ['mousemove', 'The pointer moves over the element'],
  ['pointerdown', 'A pointer (mouse, pen, touch) is pressed'],
  ['pointerup', 'A pointer is released'],
  ['pointerenter', 'A pointer enters the element'],
  ['pointerleave', 'A pointer leaves the element'],
  ['pointerover', 'A pointer moves onto the element or a child'],
  ['pointerout', 'A pointer moves off the element or a child'],
  ['pointermove', 'A pointer moves over the element'],
  ['pointercancel', 'A pointer interaction is cancelled'],
  ['touchstart', 'A touch starts on the element'],
  ['touchend', 'A touch ends'],
  ['touchmove', 'A touch moves'],
  ['touchcancel', 'A touch is cancelled'],
  ['wheel', 'The mouse wheel is turned over the element'],
  ['keydown', 'A key is pressed while the element has focus'],
  ['keyup', 'A key is released while the element has focus'],
  ['focus', 'The element receives focus (does not bubble)'],
  ['blur', 'The element loses focus (does not bubble)'],
  ['focusin', 'The element or a child receives focus'],
  ['focusout', 'The element or a child loses focus'],
  ['input', 'The value of an input changes'],
  ['change', 'The value of a form control is committed'],
  ['submit', 'A form is submitted'],
  ['reset', 'A form is reset'],
  ['scroll', 'The element is scrolled'],
  ['dragstart', 'Dragging the element starts'],
  ['drag', 'The element is dragged'],
  ['dragend', 'Dragging the element ends'],
  ['dragenter', 'A dragged item enters the element'],
  ['dragleave', 'A dragged item leaves the element'],
  ['dragover', 'A dragged item is over the element'],
  ['drop', 'A dragged item is dropped on the element'],
  ['animationstart', 'A CSS animation starts'],
  ['animationend', 'A CSS animation ends'],
  ['animationiteration', 'A CSS animation iteration ends'],
  ['transitionend', 'A CSS transition ends'],
  ['play', 'A media element starts playing'],
  ['pause', 'A media element pauses'],
  ['ended', 'A media element reached its end'],
  ['load', 'A resource (image, iframe) has loaded'],
]);

/** Known event names within edit distance 2 of `name`, closest first (at most 3). */
export function similarDomEvents(name: string): string[] {
  return [...DOM_EVENTS.keys()]
    .map(event => ({ event, distance: levenshteinDistance(name, event, 2) }))
    .filter(candidate => candidate.distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(candidate => candidate.event);
}
