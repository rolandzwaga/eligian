/**
 * Where a timeline is declared in an .eligian source, for diagnostics the
 * preview reports at runtime (Feature 049: scroll container checks).
 */

export interface LineRange {
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

/** `value` with every regular-expression metacharacter escaped. */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The 0-based range of `timeline "<name>"` in `text`, or undefined when no
 * timeline with that name is declared.
 */
export function findTimelineHeader(text: string, name: string): LineRange | undefined {
  const pattern = new RegExp(`\\btimeline\\s+(["'])${escapeRegExp(name)}\\1`);
  const lines = text.split(/\r?\n/);
  for (let line = 0; line < lines.length; line++) {
    const match = pattern.exec(lines[line]);
    if (match) {
      return { line, startCharacter: match.index, endCharacter: match.index + match[0].length };
    }
  }
  return undefined;
}
