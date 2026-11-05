/**
 * Spec 058 Phase 2 (FR-025; plan D3): the machine-readable tables of a STORYBOARD.md (roadmap §5).
 *
 * A Markdown table is a run of consecutive lines that start with `|`; its first line is the header.
 * A table whose header is `| timeline | start | end | selector | change | end-block |` is a beat
 * table, `| trigger | target | verb | timeline |` the interactions table; every other table and all
 * prose is skipped. Separator rows (`|---|`) are not data rows. A data row of a beat or interactions
 * table whose cell count differs from its header is counted in `ignoredRows`. Never throws.
 */

export interface StoryboardBeat {
  readonly timeline: string;
  readonly start: string;
  readonly end: string;
  readonly selector: string;
  readonly change: string;
  readonly endBlock: string;
}

export interface Storyboard {
  readonly beats: readonly StoryboardBeat[];
  readonly interactions: number;
  readonly ignoredRows: number;
}

const BEAT_HEADER = ['timeline', 'start', 'end', 'selector', 'change', 'end-block'];
const INTERACTION_HEADER = ['trigger', 'target', 'verb', 'timeline'];

type TableKind = 'beats' | 'interactions' | 'other';

/** The trimmed cells of a `|` row; an escaped `\|` stays inside its cell. */
function cellsOf(row: string): string[] {
  let body = row.trim().slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map(cell => cell.trim());
}

function sameCells(cells: readonly string[], header: readonly string[]): boolean {
  return (
    cells.length === header.length &&
    cells.every((cell, index) => cell.toLowerCase() === header[index])
  );
}

function kindOf(header: readonly string[]): TableKind {
  if (sameCells(header, BEAT_HEADER)) return 'beats';
  if (sameCells(header, INTERACTION_HEADER)) return 'interactions';
  return 'other';
}

function isSeparator(cells: readonly string[]): boolean {
  return cells.every(cell => /^:?-+:?$/.test(cell));
}

/** The §5 tables of a STORYBOARD.md: the beat rows, the interaction row count, the malformed rows. */
export function readStoryboard(text: string): Storyboard {
  const beats: StoryboardBeat[] = [];
  let interactions = 0;
  let ignoredRows = 0;
  let kind: TableKind | undefined;
  let width = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      kind = undefined;
      continue;
    }
    const cells = cellsOf(line);
    if (kind === undefined) {
      kind = kindOf(cells);
      width = cells.length;
      continue;
    }
    if (kind === 'other' || isSeparator(cells)) continue;
    if (cells.length !== width) {
      ignoredRows++;
    } else if (kind === 'beats') {
      const [timeline, start, end, selector, change, endBlock] = cells;
      beats.push({ timeline, start, end, selector, change, endBlock });
    } else {
      interactions++;
    }
  }
  return { beats, interactions, ignoredRows };
}
