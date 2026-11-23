/**
 * The storyboard checks of `approve-storyboard` (spec 059 Phase 2 FR-029, FR-039, R-6, R-7; plan
 * §10): a `STORYBOARD.md`, read by `readStoryboard` (`../storyboard.ts`), against a brief's
 * evaluation. Outside `storyboard.ts` so that the spec 058 reader imports nothing from `brief/`
 * (P8).
 *
 * - `checkStoryboard`: the five checks of FR-029 in their order, at most one problem each (its
 *   message lists every mismatch of that check).
 * - `checkAdditionStoryboard`: FR-039's subset, only what the addition touches.
 *
 * Pure: values come from the evaluation's settled (answered) instances and its asset list.
 */
import type { Storyboard, StoryboardInteraction } from '../storyboard.js';
import type { Evaluation } from './engine.js';
import type { AdditionScope } from './scoped.js';
import type { AnswerValue } from './tree.js';

export type StoryboardProblemCode =
  | 'storyboard-ignored-rows'
  | 'storyboard-views'
  | 'storyboard-header'
  | 'storyboard-end-block'
  | 'storyboard-interactions';

export interface StoryboardProblem {
  readonly code: StoryboardProblemCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------------------------
// Values of the evaluation.

type Row = Readonly<Record<string, string>>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (v: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(v) ? (v as readonly unknown[]).filter(isRow) : [];

/** The settled value of an instance id, `undefined` when it is not answered. */
const settled = (evaluation: Evaluation, id: string): AnswerValue | undefined =>
  evaluation.instances.find(i => i.id === id && i.status === 'answered')?.value;

const isNone = (v: string | undefined): boolean => v !== undefined && v.toLowerCase() === 'none';

/** A free-text answer that says something (not absent, not `none`). */
const said = (v: AnswerValue | undefined): boolean =>
  typeof v === 'string' && v.trim() !== '' && !isNone(v.trim());

const quoted = (values: readonly string[]) => values.map(v => `"${v}"`).join(', ');

const listed = (values: readonly string[]) => (values.length === 0 ? 'none' : values.join(', '));

const distinct = (values: readonly string[]): readonly string[] =>
  values.filter((value, i) => values.indexOf(value) === i);

/** The comma-separated items of a value, trimmed, empty ones dropped. */
const splitList = (value: string): readonly string[] =>
  value
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '');

/** The language codes of a `- languages:` value, each without its `(default)` marker. */
const itemsOf = (value: string): readonly string[] =>
  splitList(value).map(item => item.replace(/\s*\(default\)\s*$/i, ''));

/** The comma-separated items of a header value, before any `(`, trimmed, empty ones dropped. */
const itemsBeforeParen = (value: string): readonly string[] => {
  const at = value.indexOf('(');
  return (at < 0 ? value : value.slice(0, at))
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '');
};

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every(x => b.includes(x)) && distinct(a).length === a.length;

/** One problem for a check, its mismatches joined; none when there are none. */
const problem = (
  code: StoryboardProblemCode,
  mismatches: readonly string[]
): readonly StoryboardProblem[] =>
  mismatches.length === 0 ? [] : [{ code, message: `${code}: ${mismatches.join('; ')}` }];

// ---------------------------------------------------------------------------------------------
// The checks.

function ignoredRows(storyboard: Storyboard): readonly StoryboardProblem[] {
  const n = storyboard.ignoredRows;
  return problem(
    'storyboard-ignored-rows',
    n === 0
      ? []
      : [
          `${n} table ${n === 1 ? 'row has' : 'rows have'} another number of cells than its header; fix ${n === 1 ? 'it' : 'them'} so every row is read`,
        ]
  );
}

/** FR-029 item 2: the view sections are exactly `views`, each once; beat timelines are views. */
function viewsCheck(storyboard: Storyboard, views: readonly string[]): readonly string[] {
  const mismatches: string[] = [];
  const missing = views.filter(v => !storyboard.views.includes(v));
  if (missing.length > 0) {
    mismatches.push(`no ## view section for ${quoted(missing)} (the views are ${quoted(views)})`);
  }
  const extra = distinct(storyboard.views.filter(v => !views.includes(v)));
  if (extra.length > 0) {
    mismatches.push(
      `## view ${quoted(extra)} is not a view of the brief (${quoted(views)}; names match case-sensitively)`
    );
  }
  const twice = distinct(storyboard.views.filter((v, i) => storyboard.views.indexOf(v) !== i));
  if (twice.length > 0) mismatches.push(`## view ${quoted(twice)} appears more than once`);
  const unknown = distinct(
    storyboard.beats.map(b => b.timeline).filter(timeline => !views.includes(timeline))
  );
  if (unknown.length > 0) {
    mismatches.push(`beat rows name the timeline ${quoted(unknown)}, not a view of the brief`);
  }
  return mismatches;
}

/** FR-029 item 3 (R-6): the header lines against S6, L1, the asset list and H1. */
function headerCheck(storyboard: Storyboard, evaluation: Evaluation): readonly string[] {
  const { header } = storyboard;
  const mismatches: string[] = [];

  const providers = distinct(rowsOf(settled(evaluation, 'S6')).map(r => r.provider));
  if (header.provider === undefined) {
    mismatches.push(`no "- provider:" line; expected ${listed(providers)}`);
  } else if (!sameSet(distinct(itemsBeforeParen(header.provider)), providers)) {
    mismatches.push(
      `"- provider: ${header.provider}" does not list exactly the providers of S6 (${listed(providers)})`
    );
  }

  const l1 = rowsOf(settled(evaluation, 'L1'));
  const expectedLanguages = l1.map(r => (r.default === 'yes' ? `${r.code} (default)` : r.code));
  if (header.languages === undefined) {
    mismatches.push(`no "- languages:" line; expected ${listed(expectedLanguages)}`);
  } else if (!languagesAgree(header.languages, l1)) {
    mismatches.push(
      `"- languages: ${header.languages}" does not list exactly the languages of L1 with (default) after the default (${listed(expectedLanguages)}${l1.length === 1 ? ', or none' : ''})`
    );
  }

  const assets = fileAssets(evaluation);
  if (header.assets === undefined) {
    mismatches.push(`no "- assets:" line; expected ${listed(assets)}`);
  } else if (
    isNone(header.assets) ? assets.length > 0 : !sameSet(splitList(header.assets), assets)
  ) {
    mismatches.push(
      `"- assets: ${header.assets}" does not list exactly the asset files of the brief (${listed(assets)})`
    );
  }

  const h1None = h1IsNone(evaluation);
  if (header.hostModule === undefined) {
    mismatches.push(`no "- host module:" line; expected ${h1None ? 'none' : 'the host module'}`);
  } else if (isNone(header.hostModule) !== h1None) {
    mismatches.push(
      h1None
        ? `"- host module: ${header.hostModule}" names a host module, but H1 is none`
        : '"- host module: none", but H1 lists what needs code'
    );
  }
  return mismatches;
}

/**
 * `- languages:` lists exactly the L1 codes, `(default)` after the default one only; `none` when
 * L1 has one code.
 */
function languagesAgree(value: string, l1: readonly Row[]): boolean {
  if (isNone(value.trim())) return l1.length === 1;
  const items = splitList(value).map(item => {
    const match = /^(\S+)\s*(\(default\))?$/i.exec(item);
    return match === null
      ? { code: item, marked: false }
      : { code: match[1], marked: match[2] !== undefined };
  });
  const codes = items.map(item => item.code);
  return (
    sameSet(
      codes,
      l1.map(r => r.code)
    ) &&
    items.every(item => item.marked === l1.some(r => r.code === item.code && r.default === 'yes'))
  );
}

/**
 * The keys of the asset list (Phase 1 FR-012) that are files or URLs: not the placeholder keys
 * `<view>: <element>`, `<view>: <provider>` and `font: <font>` of rows without a file.
 */
function fileAssets(evaluation: Evaluation): readonly string[] {
  const placeholder = (key: string) =>
    key.startsWith('font: ') || evaluation.views.some(view => key.startsWith(`${view}: `));
  return evaluation.assets.map(e => e.key).filter(key => !placeholder(key));
}

/** H1 is `none` (or not settled: nothing needs code). */
function h1IsNone(evaluation: Evaluation): boolean {
  const h1 = settled(evaluation, 'H1');
  return h1 === undefined || (typeof h1 === 'string' && isNone(h1)) || rowsOf(h1).length === 0;
}

const hasEndBlock = (endBlock: string) => endBlock.trim() !== '' && endBlock.trim() !== '-';

/** FR-029 item 4: every beat row (of `timeline` when set) has an end block. */
function endBlockCheck(storyboard: Storyboard, timeline?: string): readonly string[] {
  const without = storyboard.beats.filter(
    b => (timeline === undefined || b.timeline === timeline) && !hasEndBlock(b.endBlock)
  );
  return without.map(
    b =>
      `the beat ${b.timeline} ${b.start}–${b.end} on ${b.selector} has no end block (the inverse of "${b.change}")`
  );
}

const verbOf = (row: StoryboardInteraction) => row.verb.trim().toLowerCase();

const isKeyTrigger = (trigger: string) => /^key(\s|$)/i.test(trigger.trim());

/** Each S4 row has a `navigate` row with its target and its view as timeline. */
function navigationRows(storyboard: Storyboard, s4: AnswerValue | undefined): readonly string[] {
  return rowsOf(s4)
    .filter(
      r =>
        !storyboard.interactionRows.some(
          row => verbOf(row) === 'navigate' && row.target === r.target && row.timeline === r.view
        )
    )
    .map(
      r =>
        `no interactions row for S4's ${r.view} → ${r.target} (${r.trigger}): verb navigate, target ${r.target}, timeline ${r.view}`
    );
}

const PLAYBACK: readonly string[] = ['play', 'pause', 'toggle', 'stop', 'seek'];

/** FR-029 item 5 (R-7): S4, I2, I1 and V6 against the interactions table. */
function interactionsCheck(storyboard: Storyboard, evaluation: Evaluation): readonly string[] {
  const rows = storyboard.interactionRows;
  const mismatches = [...navigationRows(storyboard, settled(evaluation, 'S4'))];
  for (const r of rowsOf(settled(evaluation, 'I2'))) {
    const trigger = `key ${r.key}`.toLowerCase();
    if (!rows.some(row => row.trigger.trim().replace(/\s+/g, ' ').toLowerCase() === trigger)) {
      mismatches.push(`no interactions row with the trigger "key ${r.key}" (I2: ${r.action})`);
    }
  }
  if (said(settled(evaluation, 'I1')) && !rows.some(row => PLAYBACK.includes(verbOf(row)))) {
    mismatches.push(
      `I1 names transport controls, but no interactions row has a verb among ${PLAYBACK.join(', ')}`
    );
  }
  for (const view of evaluation.views) {
    if (!said(settled(evaluation, `V6:${view}`))) continue;
    if (!rows.some(row => row.timeline === view && !isKeyTrigger(row.trigger))) {
      mismatches.push(
        `V6 of ${view} names reactions, but no interactions row of the timeline ${view} has a trigger that is not a key`
      );
    }
  }
  return mismatches;
}

// ---------------------------------------------------------------------------------------------
// The entry points.

/** FR-029: the five checks in order, at most one problem each; `[]` when the storyboard passes. */
export function checkStoryboard(
  storyboard: Storyboard,
  evaluation: Evaluation
): readonly StoryboardProblem[] {
  return [
    ...ignoredRows(storyboard),
    ...problem('storyboard-views', viewsCheck(storyboard, evaluation.views)),
    ...problem('storyboard-header', headerCheck(storyboard, evaluation)),
    ...problem('storyboard-end-block', endBlockCheck(storyboard)),
    ...problem('storyboard-interactions', interactionsCheck(storyboard, evaluation)),
  ];
}

/**
 * FR-039: an addition's storyboard section, only what it touches. Always: no ignored rows. A view
 * `<name>`: a `## view <name>` section, every beat of `<name>` with an end block, an interactions
 * row for each of the addition's S4 rows (`evaluation` is the addition's). A language `<code>`:
 * the code in `- languages:`. A host module: a `- host module:` line that is not `none`.
 */
export function checkAdditionStoryboard(
  storyboard: Storyboard,
  scope: AdditionScope,
  evaluation: Evaluation
): readonly StoryboardProblem[] {
  const ignored = ignoredRows(storyboard);
  switch (scope.addition) {
    case 'view': {
      const { name } = scope;
      return [
        ...ignored,
        ...problem(
          'storyboard-views',
          storyboard.views.includes(name)
            ? []
            : [`no ## view section for "${name}" (names match case-sensitively)`]
        ),
        ...problem('storyboard-end-block', endBlockCheck(storyboard, name)),
        ...problem(
          'storyboard-interactions',
          navigationRows(storyboard, settled(evaluation, 'S4'))
        ),
      ];
    }
    case 'language': {
      const value = storyboard.header.languages;
      const codes = value === undefined ? [] : itemsOf(value);
      return [
        ...ignored,
        ...problem(
          'storyboard-header',
          codes.includes(scope.name)
            ? []
            : [
                value === undefined
                  ? `no "- languages:" line; it lists ${scope.name}`
                  : `"- languages: ${value}" does not list ${scope.name}`,
              ]
        ),
      ];
    }
    case 'host-module': {
      const value = storyboard.header.hostModule;
      return [
        ...ignored,
        ...problem(
          'storyboard-header',
          value !== undefined && value !== '' && !isNone(value)
            ? []
            : [
                value === undefined
                  ? 'no "- host module:" line; it names the host module'
                  : `"- host module: ${value}" does not name the host module`,
              ]
        ),
      ];
    }
  }
}
