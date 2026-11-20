/**
 * The cross-references of the brief (spec 059 FR-011 to FR-014; plan §3 `crossCheck`): the checks
 * of an answer value against the other settled answers, the asset list (FR-012) and the facts.
 * One table keyed by template id; every failure is `invalid-reference` with a message naming the
 * bad cell. The shape and the intra-value rules (FR-005, FR-006) are `values.ts`'s.
 *
 * Pure: existence and containment come only from `Facts` (P16).
 */
import { posix } from 'node:path';
import type { Facts } from './engine.js';
import type { AnswerValue, AssetEntry } from './tree.js';

/**
 * A language code (`en-US`, language-REGION): the language's `LANGUAGE_CODE_REGEX`
 * (`packages/language/src/compiler/constants.ts`), copied so the brief does not load the language.
 */
export const LANGUAGE_CODE = /^[a-z]{2,3}-[A-Z]{2,3}$/;

/** `same as <other>`, the value of a `V:<name>` answer (FR-014). */
export const SAME_AS_VALUE = /^same as (.+)$/;

/** What a cross-reference reads: the settled values, the asset list, the facts. */
export interface CrossContext {
  /** The S2 view names, in S2 order. */
  readonly views: readonly string[];
  /** The settled (answered) value of a non-V question, or `undefined`. */
  readonly value: (id: string) => AnswerValue | undefined;
  /** The asset list (FR-012) of the settled values. */
  readonly assets: readonly AssetEntry[];
  /** The recorded `same as` declarations: view → the source view (`''` when malformed). */
  readonly sameAs: ReadonlyMap<string, string>;
  readonly facts: Facts;
}

type Row = Readonly<Record<string, string>>;

type Check = (
  value: AnswerValue,
  ctx: CrossContext,
  view: string | undefined
) => string | undefined;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (v: AnswerValue): readonly Row[] =>
  Array.isArray(v) ? (v as readonly unknown[]).filter(isRow) : [];

const URL_PATTERN = /^https?:\/\//i;

const isRelativePath = (p: string): boolean => !posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p);

const listed = (values: readonly string[]) => values.map(v => `"${v}"`).join(', ');

/**
 * The rows' `column` cells are exactly `expected`, each once (in any order). `what` names the
 * expected cells, e.g. `S2 views`.
 */
function exactlyOnce(
  rows: readonly Row[],
  column: string,
  expected: readonly string[],
  what: string
): string | undefined {
  const known = expected.length === 0 ? 'none' : listed(expected);
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][column];
    if (!expected.includes(cell)) {
      return `row ${i + 1}, ${column}: "${cell}" is not one of the ${what} (${known})`;
    }
    if (rows.slice(0, i).some(r => r[column] === cell)) {
      return `row ${i + 1}, ${column}: "${cell}" has a row already; one row for each of the ${what}`;
    }
  }
  const missing = expected.filter(e => !rows.some(r => r[column] === e));
  return missing.length === 0
    ? undefined
    : `no row for ${listed(missing)}: one row for each of the ${what} (${known})`;
}

/** The relative paths of a column lie under the project root (FR-012, `Facts.inside`). */
function pathsInside(rows: readonly Row[], column: string, facts: Facts): string | undefined {
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][column];
    if (cell === '-' || URL_PATTERN.test(cell) || !isRelativePath(cell)) continue;
    if (!facts.inside(cell)) {
      return `row ${i + 1}, ${column}: "${cell}" lies outside the project`;
    }
  }
  return undefined;
}

const S2_VIEW = 'a view of S2';

const onePerView: Check = (v, ctx) => exactlyOnce(rowsOf(v), 'view', ctx.views, 'S2 views');

const keysOf = (assets: readonly AssetEntry[], keep: (e: AssetEntry) => boolean) =>
  assets.filter(keep).map(e => e.key);

function checkL1(v: AnswerValue): string | undefined {
  const rows = rowsOf(v);
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].code;
    if (!LANGUAGE_CODE.test(code)) {
      return `row ${i + 1}, code: "${code}" is not a language code such as en-US (language-REGION)`;
    }
    if (rows.slice(0, i).some(r => r.code === code)) {
      return `row ${i + 1}, code: "${code}" is listed twice; each language once`;
    }
  }
  const defaults = rows.filter(r => r.default === 'yes').length;
  return defaults === 1 ? undefined : `exactly one language is default: yes (found ${defaults})`;
}

/** FR-013: a relative posix path ending in `.eligian`, in the brief's own directory. */
function checkR3(v: AnswerValue, ctx: CrossContext): string | undefined {
  if (typeof v !== 'string') return undefined;
  if (!isRelativePath(v)) return `"${v}" is not a relative path from the project root`;
  if (posix.normalize(v) !== v || v.split('/').includes('..')) {
    return `"${v}" is not a plain relative path (no ./, .. or //)`;
  }
  if (!v.endsWith('.eligian')) return `"${v}" does not end in .eligian`;
  const dir = posix.dirname(v);
  const briefDir = ctx.facts.briefDir;
  return dir === briefDir
    ? undefined
    : `"${v}" lies in directory: "${dir}", but this brief is in directory: "${briefDir}"; the entry file sits next to its brief, so call eligian_brief with directory: "${dir}" for that program`;
}

/** FR-014: `<other>` is another S2 view and is not itself `same as` (no chains). */
function checkSameAs(v: AnswerValue, ctx: CrossContext, view: string | undefined) {
  const match = typeof v === 'string' ? SAME_AS_VALUE.exec(v) : null;
  if (match === null || view === undefined) return undefined;
  const other = match[1];
  if (other === view) return `"${view}" cannot be the same as itself`;
  if (!ctx.views.includes(other)) return `"${other}" is not ${S2_VIEW} (${listed(ctx.views)})`;
  const source = ctx.sameAs.get(other);
  if (source !== undefined) {
    return `"${other}" is itself same as ${source}: name a view with its own answers (no chains)`;
  }
  return undefined;
}

const CHECKS: ReadonlyMap<string, Check> = new Map<string, Check>([
  [
    'S3',
    (v, ctx) =>
      typeof v === 'string' && !ctx.views.includes(v)
        ? `"${v}" is not ${S2_VIEW} (${listed(ctx.views)})`
        : undefined,
  ],
  [
    'S4',
    (v, ctx) => {
      const rows = rowsOf(v);
      for (let i = 0; i < rows.length; i++) {
        for (const column of ['view', 'target']) {
          const cell = rows[i][column];
          if (!ctx.views.includes(cell)) {
            return `row ${i + 1}, ${column}: "${cell}" is not ${S2_VIEW} (${listed(ctx.views)})`;
          }
        }
      }
      return undefined;
    },
  ],
  ['S5', onePerView],
  ['S6', (v, ctx) => onePerView(v, ctx, undefined) ?? pathsInside(rowsOf(v), 'source', ctx.facts)],
  ['D5', onePerView],
  ['V3', (v, ctx) => pathsInside(rowsOf(v), 'file', ctx.facts)],
  ['D3', (v, ctx) => pathsInside(rowsOf(v), 'file', ctx.facts)],
  ['L1', checkL1],
  [
    'L2',
    (v, ctx) => {
      const codes = rowsOf(ctx.value('L1') ?? []).map(r => r.code);
      return exactlyOnce(rowsOf(v), 'language', codes, 'L1 codes');
    },
  ],
  [
    'A1',
    (v, ctx) =>
      exactlyOnce(
        rowsOf(v),
        'asset',
        keysOf(ctx.assets, e => e.state === 'missing'),
        'missing assets'
      ),
  ],
  [
    'A4',
    (v, ctx) =>
      exactlyOnce(
        rowsOf(v),
        'file',
        keysOf(ctx.assets, e => e.kind === 'video' || e.kind === 'audio'),
        'video and audio assets'
      ),
  ],
  [
    'A5',
    (v, ctx) =>
      exactlyOnce(
        rowsOf(v),
        'image',
        keysOf(ctx.assets, e => e.kind === 'image'),
        'image assets'
      ),
  ],
  ['R3', checkR3],
  ['V', checkSameAs],
]);

/**
 * The cross-reference check of an instance's value (`P1`, `V3:intro`, `V:signup`): a message, or
 * `undefined` when it holds. A question with no cross-reference always holds.
 */
export function crossCheck(id: string, value: AnswerValue, ctx: CrossContext): string | undefined {
  const colon = id.indexOf(':');
  const template = colon < 0 ? id : id.slice(0, colon);
  const view = colon < 0 ? undefined : id.slice(colon + 1);
  return CHECKS.get(template)?.(value, ctx, view);
}
