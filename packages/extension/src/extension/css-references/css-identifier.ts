/**
 * The class or id under the cursor in a CSS or HTML line (audit idea #22),
 * for "Find Eligian References". Pure, so it is tested without VS Code.
 */
export interface CssIdentifier {
  readonly kind: 'class' | 'id';
  readonly name: string;
}

/** In CSS: the `.class` or `#id` the cursor is on (`.card.on` → the part under it). */
export function identifierInCss(line: string, character: number): CssIdentifier | undefined {
  for (const match of line.matchAll(/([.#])(-?[_a-zA-Z][\w-]*)/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (character < start || character > end) continue;
    // `#fff` in a declaration is a colour, not an id: only selectors (before `{`)
    const before = line.slice(0, start);
    if (before.includes('{') && !before.includes('}')) return undefined;
    return { kind: match[1] === '.' ? 'class' : 'id', name: match[2] };
  }
  return undefined;
}

/** In HTML: the word of a `class="…"` or the value of an `id="…"` the cursor is in. */
export function identifierInHtml(line: string, character: number): CssIdentifier | undefined {
  for (const match of line.matchAll(/\b(class|id)\s*=\s*(["'])([^"']*)\2/gi)) {
    const valueStart = (match.index ?? 0) + match[0].indexOf(match[2]) + 1;
    const value = match[3];
    if (character < valueStart || character > valueStart + value.length) continue;
    if (match[1].toLowerCase() === 'id') {
      const name = value.trim();
      return name ? { kind: 'id', name } : undefined;
    }
    for (const word of value.matchAll(/\S+/g)) {
      const start = valueStart + (word.index ?? 0);
      if (character >= start && character <= start + word[0].length) {
        return { kind: 'class', name: word[0] };
      }
    }
  }
  return undefined;
}
