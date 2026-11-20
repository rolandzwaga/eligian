/**
 * The scoped trees of an addition (spec 059 Phase 2 FR-036, P11, R-8; plan §7): the questions an
 * addition to an existing presentation asks, cloned from `TREE` by id with their ids and texts.
 *
 * - a view `<name>`: S4 (the rows into or out of `<name>`, or `none`), S5, S6 (records: the
 *   table's columns without `view`), V1–V6 (templates the engine expands over `Facts.views`), I4
 *   (only when the presentation then has more than one view), D5 (a record) and A1–A6 (Phase 1's
 *   rules over the addition's own assets: its V3 and S6);
 * - a language `<code>`: L2 (a record: `supplier`, `when`), L3, L4, L5;
 * - a host module: H1 (not `none`), H2, H3.
 *
 * Prerequisites outside the scope are dropped (they are settled in the main brief or by the code).
 * An applies-when rule that reads an id outside the scope reads it from the `ScopeContext` (the
 * main brief's settled answers and the code facts) and applies when it finds nothing there (R-8).
 * Answer validation, rejections, rounds and staleness stay the engine's.
 *
 * Pure: imports only the tree and the engine's types. `scopedTree` assumes a valid name: the tool
 * refuses one outside FR-047's rule, or already in the approved set, before it builds the tree.
 */
import type { AdditionKind } from './engine.js';
import {
  ALWAYS,
  type AnswerValue,
  type AnswerView,
  type Column,
  type Question,
  type Shape,
  TREE,
} from './tree.js';

export interface AdditionScope {
  readonly addition: AdditionKind;
  /** The view name or the language code; ignored for a host module. */
  readonly name: string;
}

export interface ScopeContext {
  /**
   * The main brief's settled answer, or the fact read from the code, of an instance id (`C3`,
   * `S2`, `V3:Hub`); `undefined` when there is neither.
   */
  readonly get: (id: string) => AnswerValue | undefined;
  /** The timeline names the record knows for the directory's programs (I4's view count). */
  readonly timelines?: readonly string[];
}

/** The ids each kind of addition asks, in tree order (FR-036). */
const SCOPE_IDS: Readonly<Record<AdditionKind, readonly string[]>> = {
  view: [
    'S4',
    'S5',
    'S6',
    'V1',
    'V2',
    'V3',
    'V4',
    'V5',
    'V6',
    'I4',
    'D5',
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
  ],
  language: ['L2', 'L3', 'L4', 'L5'],
  'host-module': ['H1', 'H2', 'H3'],
};

/** The section heading of an addition in `BRIEF.md` and its HMAC section (FR-035, FR-038). */
export function additionHeading(scope: AdditionScope): string {
  return scope.addition === 'host-module'
    ? 'Addition: host-module'
    : `Addition: ${scope.addition} ${scope.name}`;
}

// ---------------------------------------------------------------------------------------------
// Value helpers (values arrive in their canonical form).

type Row = Readonly<Record<string, string>>;

const NONE = 'none';

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (v: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(v) ? (v as readonly unknown[]).filter(isRow) : [];

const MEDIA_KINDS: readonly string[] = ['image', 'video', 'audio'];

/** A table's shape as one record: its columns without `column` (FR-036). */
const recordWithout = (shape: Shape, column: string): Shape => ({
  kind: 'record',
  columns: (shape.columns ?? []).filter((c: Column) => c.name !== column),
});

// ---------------------------------------------------------------------------------------------
// The rules that read the context.

/**
 * A rule whose reads outside the scope come from `context` (R-8): it applies when one of them is
 * read and found nowhere; otherwise it is Phase 1's rule over those values.
 */
const readingContext =
  (
    rule: Question['appliesWhen'],
    inScope: ReadonlySet<string>,
    context: ScopeContext
  ): Question['appliesWhen'] =>
  (answers, assets) => {
    let nothing = false;
    const view: AnswerView = {
      get(id) {
        if (inScope.has(id)) return answers.get(id);
        const value = context.get(id);
        if (value === undefined) nothing = true;
        return value;
      },
      copies(id) {
        if (inScope.has(id)) return answers.copies(id);
        nothing = true;
        return [];
      },
    };
    const applies = rule(view, assets);
    return applies || nothing;
  };

/** The number of views once `name` is added: S2's names, the record's timelines and `name`. */
const viewsWith = (name: string, context: ScopeContext): number =>
  new Set([...rowsOf(context.get('S2')).map(r => r.name), ...(context.timelines ?? []), name]).size;

/** More than one language once `code` is added; applies when no L1 is known (R-8). */
const languagesWith = (code: string, context: ScopeContext): boolean => {
  const l1 = context.get('L1');
  return l1 === undefined || new Set([...rowsOf(l1).map(r => r.code), code]).size > 1;
};

/**
 * The presentation has an asset (FR-012's list: V3 rows with media or a file, S6 video or audio,
 * D3 project or CDN fonts), read from the context; applies when none of them is known (R-8).
 */
function presentationHasAssets(context: ScopeContext): boolean {
  const s6 = context.get('S6');
  const d3 = context.get('D3');
  const v3 = rowsOf(context.get('S2')).flatMap(r => {
    const copy = context.get(`V3:${r.name}`);
    return copy === undefined ? [] : [copy];
  });
  if (s6 === undefined && d3 === undefined && v3.length === 0) return true;
  return (
    rowsOf(s6).some(r => r.provider === 'video' || r.provider === 'audio') ||
    rowsOf(d3).some(r => r.source === 'project' || r.source === 'cdn') ||
    v3.some(copy => rowsOf(copy).some(r => MEDIA_KINDS.includes(r.kind) || r.file !== '-'))
  );
}

// ---------------------------------------------------------------------------------------------
// The checks of the reshaped questions.

/** S4 of a view addition: every row names the view as `view` or `target`; `none` is accepted. */
const namesTheView =
  (name: string) =>
  (v: AnswerValue): string | undefined => {
    if (v === NONE) return undefined;
    const rows = rowsOf(v);
    if (rows.length === 0) return 'expected at least one row, or "none"';
    const i = rows.findIndex(r => r.view !== name && r.target !== name);
    return i < 0
      ? undefined
      : `row ${i + 1}: names "${name}" neither as view nor as target; list only the ways into and out of ${name}`;
  };

/** S6 of a view addition: Phase 1's per-row rule on the record as the view's row. */
const s6AsRow =
  (name: string, check: Question['check']) =>
  (v: AnswerValue): string | undefined =>
    isRow(v) ? check?.([{ view: name, ...v }]) : undefined;

/** H1 of a host-module addition names at least one need (FR-036: not `none`). */
const someNeed = (v: AnswerValue): string | undefined =>
  v === NONE || rowsOf(v).length === 0
    ? 'a host module addition names what needs code: at least one row, not none'
    : undefined;

// ---------------------------------------------------------------------------------------------
// scopedTree

type Override = Partial<
  Pick<Question, 'shape' | 'needs' | 'reads' | 'appliesWhen' | 'when' | 'check'>
>;

/** A scoped clone: prerequisites outside the scope dropped, outside reads read from `context`. */
function clone(
  q: Question,
  inScope: ReadonlySet<string>,
  context: ScopeContext,
  override: Override
): Question {
  const outside = q.reads.some(id => !inScope.has(id));
  const check = override.check ?? q.check;
  return {
    ...q,
    shape: override.shape ?? q.shape,
    needs: override.needs ?? q.needs.filter(id => inScope.has(id)),
    reads: override.reads ?? q.reads.filter(id => inScope.has(id)),
    appliesWhen:
      override.appliesWhen ??
      (outside ? readingContext(q.appliesWhen, inScope, context) : q.appliesWhen),
    when: override.when ?? q.when,
    ...(check === undefined ? {} : { check }),
    scoped: true,
  };
}

/** The reshaped questions of each scope (FR-036); the others are plain clones. */
function overrides(scope: AdditionScope, context: ScopeContext): ReadonlyMap<string, Override> {
  const { name } = scope;
  switch (scope.addition) {
    case 'view': {
      const s4 = TREE.find(q => q.id === 'S4');
      const s6 = TREE.find(q => q.id === 'S6');
      const record = (id: string): Override => {
        const q = TREE.find(t => t.id === id);
        return q === undefined ? {} : { shape: recordWithout(q.shape, 'view') };
      };
      return new Map<string, Override>([
        [
          'S4',
          {
            shape: { ...(s4?.shape ?? { kind: 'table' }), none: true },
            appliesWhen: ALWAYS,
            when: 'always',
            check: namesTheView(name),
          },
        ],
        ['S5', record('S5')],
        ['S6', { ...record('S6'), check: s6AsRow(name, s6?.check) }],
        ['D5', record('D5')],
        // Present only when the presentation then has more than one view (filtered below).
        ['I4', { appliesWhen: ALWAYS, when: 'always' }],
      ]);
    }
    case 'language': {
      const l2 = TREE.find(q => q.id === 'L2');
      const more = languagesWith(name, context);
      const when = `more than one language once ${name} is added`;
      return new Map<string, Override>([
        [
          'L2',
          {
            ...(l2 === undefined ? {} : { shape: recordWithout(l2.shape, 'language') }),
            appliesWhen: () => more,
            when,
          },
        ],
        ['L3', { appliesWhen: () => more, when }],
        [
          'L4',
          {
            appliesWhen: () => more && presentationHasAssets(context),
            when: `${when}, and any asset`,
          },
        ],
      ]);
    }
    case 'host-module':
      return new Map<string, Override>([['H1', { check: someNeed }]]);
  }
}

/** The questions of an addition (FR-036, P11): clones of `TREE`'s, in tree order. */
export function scopedTree(scope: AdditionScope, context: ScopeContext): readonly Question[] {
  const ids = SCOPE_IDS[scope.addition].filter(
    id => id !== 'I4' || viewsWith(scope.name, context) > 1
  );
  const inScope: ReadonlySet<string> = new Set(ids);
  const reshaped = overrides(scope, context);
  return TREE.filter(q => inScope.has(q.id)).map(q =>
    clone(q, inScope, context, reshaped.get(q.id) ?? {})
  );
}
