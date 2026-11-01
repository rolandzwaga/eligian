/**
 * Key names of `on key "<keys>"` (Eligius KeyboardController, hotkeys-js
 * syntax): validation at compile time, where the engine would throw in the
 * controller's `init`, and completion.
 *
 * Mirrors Eligius `findInvalidKeyName` / `splitShortcuts`
 * (src/util/keyboard-input-registry.ts) and the hotkeys-js 4 key map: comma
 * separated shortcuts, each a key optionally preceded by `+`-joined
 * modifiers. Names are case insensitive, so the `KeyboardEvent.key` names of
 * the same keys (`ArrowRight`, `Escape`, `PageDown`, `F1`) work too.
 */

/** hotkeys-js key names (lower case), plus f1 to f19. */
const KEYS: ReadonlySet<string> = new Set([
  'backspace',
  '⌫',
  'tab',
  'clear',
  'enter',
  '↩',
  'return',
  'esc',
  'escape',
  'space',
  'left',
  'up',
  'right',
  'down',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'del',
  'delete',
  'ins',
  'insert',
  'home',
  'end',
  'pageup',
  'pagedown',
  'capslock',
  '⇪',
  ...Array.from({ length: 10 }, (_, i) => `num_${i}`),
  'num_multiply',
  'num_add',
  'num_enter',
  'num_subtract',
  'num_decimal',
  'num_divide',
  ',',
  '.',
  '/',
  '`',
  '-',
  '=',
  ';',
  "'",
  '{',
  '}',
  '[',
  ']',
  '\\',
  ...Array.from({ length: 19 }, (_, i) => `f${i + 1}`),
]);

/** hotkeys-js modifier names (lower case). */
const MODIFIERS: ReadonlySet<string> = new Set([
  '⇧',
  'shift',
  '⌥',
  'alt',
  'option',
  '⌃',
  'ctrl',
  'control',
  '⌘',
  'cmd',
  'meta',
  'command',
]);

/** Keys offered by completion after `on key "`, with what they are. */
export const KEY_COMPLETIONS: ReadonlyMap<string, string> = new Map([
  ['ArrowRight', 'Right arrow'],
  ['ArrowLeft', 'Left arrow'],
  ['ArrowUp', 'Up arrow'],
  ['ArrowDown', 'Down arrow'],
  ['space', 'Space bar (also toggles playback unless a KeyboardController takes it)'],
  ['Enter', 'Enter / Return'],
  ['Escape', 'Escape'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['PageUp', 'Page up'],
  ['PageDown', 'Page down'],
  ['shift+ArrowRight', 'Shift + right arrow'],
  ['shift+ArrowLeft', 'Shift + left arrow'],
]);

/** The comma separated shortcuts of `keys`, as hotkeys-js splits them. */
function splitShortcuts(keys: string): string[] {
  const parts = keys.replace(/\s/g, '').split(',');
  // An empty part after a trailing ',' means the comma key itself ('ctrl+,')
  const last = parts.lastIndexOf('');
  if (last >= 0) {
    parts.splice(last, 1);
    if (parts.length) parts[parts.length - 1] += ',';
  }
  return parts;
}

/**
 * The first part of `keys` the KeyboardController cannot match, or undefined
 * when every shortcut is valid. `''` stands for empty keys. A space (the
 * `KeyboardEvent.key` of the space bar) means `space`.
 */
export function invalidKeyName(keys: string): string | undefined {
  if (keys.length === 0) return '';
  if (keys.trim() === '') return undefined;
  for (const shortcut of splitShortcuts(keys)) {
    const parts = shortcut.split('+');
    const key = parts.pop() ?? '';
    const modifier = parts.find(part => !MODIFIERS.has(part.toLowerCase()));
    if (modifier !== undefined) return modifier;
    if (!KEYS.has(key.toLowerCase()) && !/^[a-z0-9]$/i.test(key)) return key;
  }
  return undefined;
}
