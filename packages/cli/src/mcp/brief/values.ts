/**
 * The answer values of the brief interview (spec 059 FR-005, FR-006, FR-019 value formats,
 * FR-020 value parsing; plan §2, P7, P10).
 *
 * - `validateValue`: the one canonical wire form of each shape (no coercion), then the question's
 *   intra-value rules (`Question.check`, FR-006). Records and table rows come back with their keys
 *   in column order (P7).
 * - `formatValue` / `parseValue`: the value lines of an answer in `BRIEF.md` (FR-019). A table
 *   row is read with the storyboard's cell splitter (`cellsOf`, `storyboard.ts`), so `\|` stays
 *   inside its cell. Parsing never throws: a value that does not fit its shape is `undefined`.
 *
 * Pure: imports only the tree's types and the storyboard's cell helpers.
 */
import { cellsOf, isSeparator } from '../storyboard.js';
import type { AnswerValue, Column, Question, Shape } from './tree.js';

export type Validated =
  | { readonly ok: true; readonly value: AnswerValue }
  | { readonly ok: false; readonly message: string };

type Row = Readonly<Record<string, string>>;

const NONE = 'none';
const CR = 'line breaks must be \\n';
const ONE_LINE = 'a cell is one line';
const NON_EMPTY = 'expected non-empty text';
const SLASHES = 'a path uses forward slashes';
const DURATION_CELL = /^\d+(\.\d+)?$/;

const fail = (message: string): Validated => ({ ok: false, message });
const ok = (value: AnswerValue): Validated => ({ ok: true, value });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** An own key (`Object.hasOwn` is ES2022; the repo `lib` is ES2020). */
const hasKey = (o: object, key: string): boolean => Object.keys(o).includes(key);

const hasCr = (v: unknown): boolean => {
  if (typeof v === 'string') return v.includes('\r');
  if (Array.isArray(v)) return v.some(hasCr);
  if (isPlainObject(v)) return Object.values(v).some(hasCr);
  return false;
};

const orNone = (shape: Shape) => (shape.none === true ? ', or "none"' : '');

function describeColumn(column: Column): string {
  const dash = column.dash === true ? ', or -' : '';
  switch (column.kind) {
    case 'choice':
      return `${column.name} (${(column.options ?? []).join('/')})`;
    case 'yes-no':
      return `${column.name} (yes/no)`;
    case 'duration':
      return `${column.name} (seconds greater than 0${column.none === true ? ', or none' : ''})`;
    case 'view':
      return `${column.name} (a view name of S2)`;
    case 'path':
      return `${column.name} (a path with forward slashes or a URL${dash})`;
    case 'language':
      return `${column.name} (a language code such as en-US)`;
    default:
      return `${column.name} (text${dash})`;
  }
}

/** The expected form of a shape, the text every `invalid-value` message shows (FR-005). */
export function expectedForm(shape: Shape): string {
  const columns = (shape.columns ?? []).map(describeColumn).join(', ');
  switch (shape.kind) {
    case 'text':
      return `expected a JSON string of non-empty text${orNone(shape)}`;
    case 'choice':
      return `expected one of the JSON strings: ${(shape.options ?? []).join(', ')} (case-sensitive)`;
    case 'set':
      return `expected an array of strings from: ${(shape.options ?? []).join(', ')}${orNone(shape)}`;
    case 'yes-no':
      return 'expected a JSON boolean (true or false)';
    case 'duration':
      return `expected a JSON number of seconds greater than 0${(shape.alternatives ?? [])
        .map(a => `, or "${a}"`)
        .join('')}`;
    case 'view':
      return 'expected a JSON string naming a view of S2';
    case 'path':
      return 'expected a JSON string holding a relative path with forward slashes';
    case 'record':
      return `expected a JSON object whose values are strings, with the fields: ${columns}`;
    case 'table':
      return `expected an array of JSON objects, one per row, whose values are strings, with the fields: ${columns}${orNone(shape)}`;
  }
}

const shapeFailure = (shape: Shape, detail: string): Validated =>
  fail(`${expectedForm(shape)}; ${detail}`);

/** A cell's own rule (FR-005, P7), or `undefined` when it fits its column. */
function checkCell(column: Column, cell: string): string | undefined {
  if (cell.includes('\n')) return ONE_LINE;
  if (cell !== cell.trim()) return 'a cell has no leading or trailing spaces';
  if (column.dash === true && cell === '-') return undefined;
  switch (column.kind) {
    case 'choice':
      return (column.options ?? []).includes(cell)
        ? undefined
        : `expected one of: ${(column.options ?? []).join(', ')}`;
    case 'yes-no':
      return cell === 'yes' || cell === 'no' ? undefined : 'expected "yes" or "no"';
    case 'duration':
      if (column.none === true && cell === NONE) return undefined;
      return DURATION_CELL.test(cell) && Number(cell) > 0
        ? undefined
        : 'expected a number of seconds greater than 0';
    case 'path':
      if (cell.includes('\\')) return SLASHES;
      return cell === '' ? 'expected a path' : undefined;
    case 'view':
    case 'language':
      return cell === ''
        ? `expected ${column.kind === 'view' ? 'a view name' : 'a code'}`
        : undefined;
    default:
      return undefined;
  }
}

/** A record or table row: exactly the column keys, string cells, stored in column order (P7). */
function validateRow(
  shape: Shape,
  value: unknown,
  where: string
): { readonly row: Row } | { readonly error: Validated } {
  const columns = shape.columns ?? [];
  if (!isPlainObject(value)) return { error: shapeFailure(shape, `${where} is not an object`) };
  const names = columns.map(c => c.name);
  const keys = Object.keys(value);
  if (keys.length !== names.length || !names.every(n => hasKey(value, n))) {
    return {
      error: fail(
        `${where}: expected exactly the fields: ${names.join(', ')} (got: ${keys.join(', ')})`
      ),
    };
  }
  const row: Record<string, string> = {};
  for (const column of columns) {
    const cell = value[column.name];
    if (typeof cell !== 'string') {
      return { error: shapeFailure(shape, `${where}, ${column.name} is not a string`) };
    }
    const problem = checkCell(column, cell);
    if (problem !== undefined) {
      const error =
        problem === ONE_LINE || problem === SLASHES
          ? fail(`${where}, ${column.name}: ${problem}`)
          : shapeFailure(shape, `${where}, ${column.name}: ${problem}`);
      return { error };
    }
    row[column.name] = cell;
  }
  return { row };
}

/** The shape check alone (FR-005, P7). */
function validateShape(shape: Shape, value: unknown): Validated {
  if (hasCr(value)) return fail(CR);
  if (shape.none === true && value === NONE) return ok(NONE);
  switch (shape.kind) {
    case 'text':
      if (typeof value !== 'string') return shapeFailure(shape, 'not a string');
      if (value.trim() === '') return fail(`${NON_EMPTY}; ${expectedForm(shape)}`);
      if (value === NONE) return shapeFailure(shape, 'this question does not accept "none"');
      return ok(value);
    case 'choice':
      return typeof value === 'string' && (shape.options ?? []).includes(value)
        ? ok(value)
        : shapeFailure(shape, `got ${JSON.stringify(value)}`);
    case 'view':
      if (typeof value !== 'string' || value.trim() === '' || value.includes('\n')) {
        return shapeFailure(shape, `got ${JSON.stringify(value)}`);
      }
      return ok(value);
    case 'path':
      if (typeof value !== 'string' || value.trim() === '' || value.includes('\n')) {
        return shapeFailure(shape, `got ${JSON.stringify(value)}`);
      }
      return value.includes('\\') ? fail(SLASHES) : ok(value);
    case 'yes-no':
      return typeof value === 'boolean'
        ? ok(value)
        : shapeFailure(shape, `got ${JSON.stringify(value)}`);
    case 'duration':
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return ok(value);
      return typeof value === 'string' && (shape.alternatives ?? []).includes(value)
        ? ok(value)
        : shapeFailure(shape, `got ${JSON.stringify(value)}`);
    case 'set': {
      const options = shape.options ?? [];
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every(v => typeof v === 'string' && options.includes(v)) ||
        new Set(value).size !== value.length
      ) {
        return shapeFailure(shape, `got ${JSON.stringify(value)}`);
      }
      return ok([...(value as readonly string[])]);
    }
    case 'record': {
      const result = validateRow(shape, value, 'the record');
      return 'row' in result ? ok(result.row) : result.error;
    }
    case 'table': {
      if (!Array.isArray(value)) return shapeFailure(shape, 'not an array of rows');
      const rows: Row[] = [];
      for (let i = 0; i < value.length; i++) {
        const result = validateRow(shape, value[i], `row ${i + 1}`);
        if (!('row' in result)) return result.error;
        rows.push(result.row);
      }
      return ok(rows);
    }
  }
}

/** A wire value against its question: the shape (FR-005), then `question.check` (FR-006). */
export function validateValue(question: Question, value: unknown): Validated {
  const shaped = validateShape(question.shape, value);
  if (!shaped.ok) return shaped;
  const problem = question.check?.(shaped.value);
  return problem === undefined ? shaped : fail(problem);
}

/** `|` in a cell → `\|` (FR-019). */
export function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/** `\|` → `|`, the inverse of `escapeCell`. */
export function unescapeCell(cell: string): string {
  return cell.replace(/\\\|/g, '|');
}

const tableLine = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;

/** The value lines of an answer in `BRIEF.md` (FR-019). `value` is canonical (validated). */
export function formatValue(shape: Shape, value: AnswerValue): readonly string[] {
  if (shape.none === true && value === NONE) return [NONE];
  const columns = shape.columns ?? [];
  switch (shape.kind) {
    case 'text':
      // A line that starts with `#` (after any `\`) gets one more leading `\`.
      return String(value)
        .split('\n')
        .map(line => (/^\\*#/.test(line) ? `\\${line}` : line));
    case 'yes-no':
      return [value === true ? 'yes' : 'no'];
    case 'set':
      return [(value as readonly string[]).join(', ')];
    case 'duration':
      return [typeof value === 'number' ? `${String(value)}s` : String(value)];
    case 'record': {
      const record = value as Row;
      return [
        tableLine(['field', 'value']),
        tableLine(['---', '---']),
        ...columns.map(c => tableLine([c.name, escapeCell(record[c.name] ?? '')])),
      ];
    }
    case 'table':
      return [
        tableLine(columns.map(c => c.name)),
        tableLine(columns.map(() => '---')),
        ...(value as readonly Row[]).map(row =>
          tableLine(columns.map(c => escapeCell(row[c.name] ?? '')))
        ),
      ];
    default:
      return [String(value)];
  }
}

/** The data rows of a Markdown table (header, separator, rows), or `undefined`. */
function tableRows(
  lines: readonly string[],
  header: readonly string[]
): readonly string[][] | undefined {
  if (lines.length < 2 || !lines.every(l => l.trim().startsWith('|'))) return undefined;
  const head = cellsOf(lines[0]);
  if (head.length !== header.length || !head.every((cell, i) => cell === header[i])) {
    return undefined;
  }
  const separator = cellsOf(lines[1]);
  if (separator.length !== header.length || !isSeparator(separator)) return undefined;
  const rows: string[][] = [];
  for (const line of lines.slice(2)) {
    const cells = cellsOf(line);
    if (cells.length !== header.length) return undefined;
    rows.push(cells.map(unescapeCell));
  }
  return rows;
}

/** The raw (wire-shaped) value of `BRIEF.md` lines, before validation, or `undefined`. */
function readRaw(shape: Shape, lines: readonly string[]): unknown {
  const columns = shape.columns ?? [];
  const single = lines.length === 1 ? lines[0] : undefined;
  switch (shape.kind) {
    case 'text':
      return lines.map(line => (/^\\+#/.test(line) ? line.slice(1) : line)).join('\n');
    case 'yes-no':
      return single === 'yes' ? true : single === 'no' ? false : undefined;
    case 'set':
      return single === undefined ? undefined : single.split(', ');
    case 'duration': {
      if (single === undefined || (shape.alternatives ?? []).includes(single)) return single;
      const text = /^(.+)s$/.exec(single)?.[1];
      if (text === undefined) return undefined;
      const seconds = Number(text);
      return String(seconds) === text ? seconds : undefined;
    }
    case 'record': {
      const rows = tableRows(lines, ['field', 'value']);
      if (rows === undefined) return undefined;
      const record: Record<string, string> = {};
      for (const [field, cell] of rows) {
        if (hasKey(record, field)) return undefined;
        record[field] = cell;
      }
      return record;
    }
    case 'table': {
      const names = columns.map(c => c.name);
      return tableRows(lines, names)?.map(cells =>
        Object.fromEntries(names.map((name, i) => [name, cells[i]]))
      );
    }
    default:
      return single;
  }
}

/**
 * The canonical value of an answer's value lines in `BRIEF.md` (FR-020), or `undefined` when the
 * lines do not fit the shape (the caller reports the answer as ignored). Never throws.
 */
export function parseValue(shape: Shape, lines: readonly string[]): AnswerValue | undefined {
  if (lines.length === 0) return undefined;
  if (shape.none === true && lines.length === 1 && lines[0] === NONE) return NONE;
  const raw = readRaw(shape, lines);
  if (raw === undefined) return undefined;
  const result = validateShape(shape, raw);
  return result.ok ? result.value : undefined;
}
