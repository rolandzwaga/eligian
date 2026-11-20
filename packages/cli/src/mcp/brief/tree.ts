/**
 * The question tree of the brief interview (spec 059 FR-002, FR-003, FR-004, FR-006, FR-008,
 * FR-038; roadmap §3.2–§3.13). Pure data: this module imports nothing and does no I/O at import
 * (SC-012). The engine (`engine.ts`) evaluates it; `values.ts` validates, formats and parses the
 * answer values against each question's `shape`.
 */

/** The version of this tree; a question records the version that added it in `since` (FR-018). */
export const TREE_VERSION = 1;

export type BranchId = 'P' | 'C' | 'S' | 'V' | 'I' | 'D' | 'L' | 'A' | 'H' | 'X' | 'R' | 'W';

/** The branches in tree order, named as the roadmap's §3 headings (FR-002). */
export const BRANCHES: readonly { readonly id: BranchId; readonly name: string }[] = [
  { id: 'P', name: 'Purpose' },
  { id: 'C', name: 'Context of use' },
  { id: 'S', name: 'Structure' },
  { id: 'V', name: 'One copy per view' },
  { id: 'I', name: 'Interaction' },
  { id: 'D', name: 'Visual design' },
  { id: 'L', name: 'Languages' },
  { id: 'A', name: 'Assets' },
  { id: 'H', name: 'Custom behaviour' },
  { id: 'X', name: 'Accessibility' },
  { id: 'R', name: 'Delivery' },
  { id: 'W', name: 'Working agreement' },
];

/** A cell of a record or table: always a string (FR-005). */
export type Cell = string;

/** The canonical JSON form of an answer value (FR-005). */
export type AnswerValue =
  | string
  | number
  | boolean
  | readonly string[]
  | Readonly<Record<string, Cell>>
  | readonly Readonly<Record<string, Cell>>[];

export type CellKind = 'text' | 'choice' | 'yes-no' | 'duration' | 'view' | 'path' | 'language';

export interface Column {
  readonly name: string;
  readonly kind: CellKind;
  readonly options?: readonly string[];
  /** `-` is accepted (an empty cell). */
  readonly dash?: true;
  /** `none` is accepted (V5 `duration`). */
  readonly none?: true;
}

export interface Shape {
  readonly kind:
    | 'text'
    | 'choice'
    | 'set'
    | 'yes-no'
    | 'duration'
    | 'view'
    | 'path'
    | 'record'
    | 'table';
  readonly options?: readonly string[];
  readonly columns?: readonly Column[];
  /** The literal `"none"` is accepted. */
  readonly none?: true;
  /** Strings accepted besides the shape's own form (P5: `viewer-paced`). */
  readonly alternatives?: readonly string[];
  /** The table needs exactly one row per S2 view. */
  readonly rows?: 'one-per-view';
}

/**
 * The answers an applies-when rule reads (FR-008). The engine serves only the question's `reads`;
 * any other id throws (a defect in the tree, never a user path).
 *
 * - `get(id)`: the effective value of a non-V question, `undefined` when it is not applicable or
 *   not settled.
 * - `copies(id)`: for a V template id (`V3`, `V5`), the settled copies' values in S2 order.
 */
export interface AnswerView {
  get(id: string): AnswerValue | undefined;
  copies(id: string): readonly AnswerValue[];
}

/** One entry of the asset list (FR-012), a fact computed by the engine. */
export interface AssetEntry {
  readonly key: string;
  readonly kind: 'image' | 'video' | 'audio' | 'font' | 'other';
  readonly state: 'exists' | 'missing' | 'remote';
}

export interface Question {
  readonly id: string;
  readonly branch: BranchId;
  /** The roadmap's question text, without its "(doc …)" parenthetical. */
  readonly title: string;
  /** What to ask: the roadmap's question text (S2 adds one sentence, FR-038). */
  readonly ask: string;
  readonly shape: Shape;
  /** The declared prerequisites (roadmap "Needs"). */
  readonly needs: readonly string[];
  /** The ids `appliesWhen` reads; they are effective prerequisites too (FR-003). */
  readonly reads: readonly string[];
  readonly appliesWhen: (answers: AnswerView, assets: readonly AssetEntry[]) => boolean;
  /** The roadmap's "Applies when" text, `always` otherwise. */
  readonly when: string;
  /** The intra-value rules of FR-006, run after the shape check: a message, or `undefined`. */
  readonly check?: (value: AnswerValue) => string | undefined;
  /** Index ids the agent reads to form its recommendation. */
  readonly docs: readonly string[];
  /** What the agent looks up before recommending (§3.1). */
  readonly facts: readonly string[];
  readonly since: number;
  /** A clone made by `scopedTree` for an addition (P11); V clones keep `branch: 'V'`. */
  readonly scoped?: true;
}

/** The rule of every question that applies always. */
export const ALWAYS: Question['appliesWhen'] = () => true;

/** A question's effective prerequisites: its `needs` plus its `reads` (FR-003). */
export const effectivePrerequisites = (q: Question): readonly string[] => [
  ...q.needs,
  ...q.reads.filter(id => !q.needs.includes(id)),
];

// ---------------------------------------------------------------------------------------------
// Value helpers for the rules and checks (values arrive in their canonical form, FR-005).

type Row = Readonly<Record<string, Cell>>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (v: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(v) ? (v as readonly unknown[]).filter(isRow) : [];

const stringsOf = (v: AnswerValue | undefined): readonly string[] =>
  Array.isArray(v)
    ? (v as readonly unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

const recordOf = (v: AnswerValue | undefined): Row | undefined => (isRow(v) ? v : undefined);

const isUrl = (s: string) => /^https?:\/\//.test(s);

const isMedia = (provider: string | undefined) => provider === 'video' || provider === 'audio';

const atLeastOneRow = (v: AnswerValue): string | undefined =>
  rowsOf(v).length === 0 ? 'expected at least one row' : undefined;

const duplicates = (values: readonly string[]): readonly string[] =>
  values.filter((value, i) => values.indexOf(value) !== i);

// ---------------------------------------------------------------------------------------------
// The applies-when rules (FR-008). Each reads only the ids listed in its question's `reads`.

const moreThanOneView: Question['appliesWhen'] = a => rowsOf(a.get('S2')).length > 1;
const someMediaView = (a: AnswerView) => rowsOf(a.get('S6')).some(r => isMedia(r.provider));
const c3Has = (a: AnswerView, ...inputs: readonly string[]) =>
  stringsOf(a.get('C3')).some(input => inputs.includes(input));
const someV3Image = (a: AnswerView) =>
  a.copies('V3').some(copy => rowsOf(copy).some(r => r.kind === 'image'));
const moreThanOneLanguage = (a: AnswerView) => rowsOf(a.get('L1')).length > 1;
const anyAsset: Question['appliesWhen'] = (_a, assets) => assets.length > 0;
const assetMissing: Question['appliesWhen'] = (_a, assets) =>
  assets.some(e => e.state === 'missing');
const h1Lists = (a: AnswerView, need: string) => rowsOf(a.get('H1')).some(r => r.need === need);

// ---------------------------------------------------------------------------------------------
// The intra-value checks (FR-006).

/** A view name (FR-047): 1 to 64 characters, no `:`, `|`, line break, leading or trailing space. */
const S2_NAME = /^(?! )[^:|\r\n]{1,64}(?<! )$/;

const checkC2 = (v: AnswerValue): string | undefined => {
  const rows = rowsOf(v);
  if (rows.length === 0) return 'expected at least one row';
  const repeated = duplicates(rows.map(r => r.device));
  if (repeated.length > 0) return `each device once: ${repeated[0]} is listed twice`;
  const primaries = rows.filter(r => r.primary === 'yes').length;
  return primaries === 1 ? undefined : `exactly one device is primary: yes (found ${primaries})`;
};

const checkC3 = (v: AnswerValue): string | undefined =>
  stringsOf(v).length === 0 ? 'expected at least one input' : undefined;

const checkS2 = (v: AnswerValue): string | undefined => {
  const rows = rowsOf(v);
  if (rows.length === 0) return 'expected at least one view';
  const bad = rows.find(r => !S2_NAME.test(r.name));
  if (bad !== undefined) {
    return `the view name "${bad.name}" must be 1 to 64 characters, no ":", "|", line break, or leading or trailing space`;
  }
  const repeated = duplicates(rows.map(r => r.name));
  return repeated.length > 0 ? `each view name once: ${repeated[0]} is listed twice` : undefined;
};

const checkS6 = (v: AnswerValue): string | undefined => {
  for (const r of rowsOf(v)) {
    if (isMedia(r.provider) && r.source === '-') {
      return `the view ${r.view} uses ${r.provider}: its source names the file or URL`;
    }
    if (!isMedia(r.provider) && r.source !== '-') {
      return `the view ${r.view} uses ${r.provider}: its source is -`;
    }
  }
  return undefined;
};

const checkV5 = (v: AnswerValue): string | undefined => {
  const r = recordOf(v);
  if (r === undefined) return undefined;
  if ((r.duration === 'none') !== (r.pacing === 'none')) {
    return 'duration is none exactly when pacing is none';
  }
  if (r.pacing === 'cues' && r['cues-from'] === '-') {
    return 'pacing cues: cues-from names who supplies the cue points';
  }
  return undefined;
};

const checkD3 = (v: AnswerValue): string | undefined => {
  for (const r of rowsOf(v)) {
    if (r.source === 'project' && (r.file === '-' || isUrl(r.file))) {
      return `the font ${r.font} comes from the project: its file is a path in the project`;
    }
    if (r.source === 'system' && r.file !== '-') {
      return `the font ${r.font} is a system font: its file is -`;
    }
    if (r.source === 'cdn' && r.file !== '-' && !isUrl(r.file)) {
      return `the font ${r.font} comes from a CDN: its file is a URL or -`;
    }
  }
  return undefined;
};

/** L1's codes (valid, unique) and its one default are cross-references (`references.ts`, FR-011). */
const checkL1 = (v: AnswerValue): string | undefined =>
  rowsOf(v).length === 0 ? 'expected at least one language' : undefined;

/** L5 and A2: a `choice` / detail record whose detail is not `-` when the choice is `yes`. */
const yesNeeds =
  (detail: string, what: string) =>
  (v: AnswerValue): string | undefined => {
    const r = recordOf(v);
    return r !== undefined && r.choice === 'yes' && r[detail] === '-'
      ? `choice yes: ${detail} names ${what}`
      : undefined;
  };

// ---------------------------------------------------------------------------------------------
// Shapes and columns.

const TEXT: Shape = { kind: 'text' };
const TEXT_OR_NONE: Shape = { kind: 'text', none: true };
const YES_NO: Shape = { kind: 'yes-no' };
const choice = (...options: readonly string[]): Shape => ({ kind: 'choice', options });
const table = (columns: readonly Column[], extra?: Pick<Shape, 'none' | 'rows'>): Shape => ({
  kind: 'table',
  columns,
  ...extra,
});
const record = (columns: readonly Column[]): Shape => ({ kind: 'record', columns });

const text = (name: string): Column => ({ name, kind: 'text' });
const textOrDash = (name: string): Column => ({ name, kind: 'text', dash: true });
const pick = (name: string, ...options: readonly string[]): Column => ({
  name,
  kind: 'choice',
  options,
});
const yesNo = (name: string): Column => ({ name, kind: 'yes-no' });
const view = (name: string): Column => ({ name, kind: 'view' });
const pathOrDash = (name: string): Column => ({ name, kind: 'path', dash: true });
const language = (name: string): Column => ({ name, kind: 'language' });

// ---------------------------------------------------------------------------------------------
// Docs and facts (FR-004).

const CSS = ['css-conventions'];
const EVENTS = ['map-events-and-interactions'];
const LOCALES = ['map-locales-and-languages'];
const ASSETS = ['map-imports-and-assets'];
const PATTERNS = ['presentation-patterns'];

const FACT_CSS = 'eligian_project: the CSS classes and custom properties the project has';
const FACT_ASSET_FILES = 'the asset files the project has (eligian_project files, the file system)';

// ---------------------------------------------------------------------------------------------
// The questions (roadmap §3.2–§3.13).

interface Definition {
  readonly id: string;
  readonly title: string;
  /** The roadmap text when it differs from the title (a doc parenthetical, FR-038's sentence). */
  readonly ask?: string;
  readonly shape: Shape;
  readonly needs?: readonly string[];
  readonly reads?: readonly string[];
  readonly appliesWhen?: Question['appliesWhen'];
  readonly when?: string;
  readonly check?: Question['check'];
  readonly docs?: readonly string[];
  readonly facts?: readonly string[];
}

const DEFINITIONS: readonly Definition[] = [
  // P: purpose. No prerequisites.
  { id: 'P1', title: 'What should a viewer know, feel or do afterwards?', shape: TEXT },
  { id: 'P2', title: 'What does the last screen ask of the viewer?', shape: TEXT_OR_NONE },
  { id: 'P3', title: 'Who watches, and what do they already know?', shape: TEXT },
  { id: 'P4', title: 'What tone: formal, playful, technical, …?', shape: TEXT },
  {
    id: 'P5',
    title: 'How long should it take to watch?',
    shape: { kind: 'duration', alternatives: ['viewer-paced'] },
  },

  // C: context of use. No prerequisites.
  {
    id: 'C1',
    title:
      'How is it used: self-paced on a web page, led by a presenter, an unattended loop, or embedded in an app?',
    shape: choice('self-paced', 'presenter', 'loop', 'embedded'),
  },
  {
    id: 'C2',
    title: 'On which devices, and which is the main one?',
    shape: table([pick('device', 'desktop', 'tablet', 'phone', 'large-screen'), yesNo('primary')]),
    check: checkC2,
  },
  {
    id: 'C3',
    title: 'Which inputs: mouse, touch, keyboard, clicker?',
    shape: { kind: 'set', options: ['mouse', 'touch', 'keyboard', 'clicker'] },
    check: checkC3,
  },
  { id: 'C4', title: 'Is sound heard, or must it work muted?', shape: choice('on', 'off', 'both') },
  { id: 'C5', title: 'Online, or must it run offline?', shape: choice('online', 'offline') },

  // S: structure.
  {
    id: 'S1',
    title:
      'Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece?',
    ask: 'Which architecture: slide deck, hub and chapters, media annotation, scrollytelling, one timed piece? (doc `decisions`)',
    shape: choice(
      'slide-deck',
      'hub-and-chapters',
      'media-annotation',
      'scrollytelling',
      'timed-piece'
    ),
    needs: ['C1', 'P5'],
    docs: ['decisions'],
  },
  {
    id: 'S2',
    title: 'Which views are there: a name and a one-line purpose for each, in order?',
    ask: 'Which views are there: a name and a one-line purpose for each, in order? Each name is the timeline name the program will use, matched exactly (case-sensitive).',
    shape: table([text('name'), text('purpose')]),
    needs: ['S1'],
    check: checkS2,
    docs: PATTERNS,
  },
  {
    id: 'S3',
    title: 'Which view opens first?',
    shape: { kind: 'view' },
    needs: ['S2'],
    reads: ['S2'],
    appliesWhen: moreThanOneView,
    when: 'more than one view',
  },
  {
    id: 'S4',
    title: 'From each view, where can the viewer go, and how?',
    shape: table([view('view'), view('target'), text('trigger')]),
    needs: ['S2', 'C3'],
    reads: ['S2'],
    appliesWhen: moreThanOneView,
    when: 'more than one view',
    check: atLeastOneRow,
    docs: EVENTS,
  },
  {
    id: 'S5',
    title: "When a view's timeline ends: stay, advance, loop, or return to the hub?",
    shape: table([view('view'), pick('end', 'stay', 'advance', 'loop', 'hub')], {
      rows: 'one-per-view',
    }),
    needs: ['S2', 'C1'],
    docs: PATTERNS,
  },
  {
    id: 'S6',
    title: "What drives each view's time: `raf`, `video`, `audio`, `scroll`?",
    ask: "What drives each view's time: `raf`, `video`, `audio`, `scroll`? (doc `provider-choice`)",
    shape: table(
      [view('view'), pick('provider', 'raf', 'video', 'audio', 'scroll'), pathOrDash('source')],
      { rows: 'one-per-view' }
    ),
    needs: ['S2', 'C4'],
    check: checkS6,
    docs: ['provider-choice'],
  },
  {
    id: 'S7',
    title: 'Is there a Start button before media with sound?',
    shape: YES_NO,
    needs: ['S6'],
    reads: ['S6', 'C4'],
    appliesWhen: a => someMediaView(a) && a.get('C4') !== 'off',
    when: 'a view uses `video` or `audio` and C4 is not off',
  },
  {
    id: 'S8',
    title: 'After the last view: stay, restart, or loop?',
    shape: choice('stay', 'restart', 'loop'),
    needs: ['S2', 'C1'],
    docs: PATTERNS,
  },

  // V: one copy per view. Needs S2 and S6.
  { id: 'V1', title: 'What is the one thing this view says?', shape: TEXT, needs: ['S2', 'S6'] },
  {
    id: 'V2',
    title: 'What is every text on it, word for word?',
    shape: TEXT,
    needs: ['S2', 'S6'],
  },
  {
    id: 'V3',
    title: 'What is on screen besides text: images, video, lists, figures, buttons?',
    shape: table(
      [
        text('element'),
        pick('kind', 'text', 'image', 'video', 'audio', 'list', 'figure', 'button', 'other'),
        pathOrDash('file'),
      ],
      { none: true }
    ),
    needs: ['S2', 'S6'],
    facts: [FACT_ASSET_FILES],
  },
  {
    id: 'V4',
    title: 'What appears, changes and disappears, in what order, and what stays to the end?',
    shape: TEXT,
    needs: ['S2', 'S6'],
  },
  {
    id: 'V5',
    title:
      'How long does the view last, and what paces it: fixed seconds, cue points of the media (and who supplies them), or a staggered list?',
    shape: record([
      { name: 'duration', kind: 'duration', none: true },
      pick('pacing', 'fixed', 'cues', 'stagger', 'none'),
      textOrDash('cues-from'),
    ]),
    needs: ['S2', 'S6'],
    check: checkV5,
  },
  {
    id: 'V6',
    title: 'Which elements react to a click or hover, and what does each do?',
    shape: TEXT_OR_NONE,
    needs: ['S2', 'S6'],
    reads: ['C3'],
    appliesWhen: a => c3Has(a, 'mouse', 'touch'),
    when: 'C3 has mouse or touch',
    docs: EVENTS,
  },

  // I: interaction.
  {
    id: 'I1',
    title: 'Which transport controls: play, pause, restart, seek, and where are they?',
    shape: TEXT_OR_NONE,
    needs: ['S6', 'V5'],
    reads: ['V5'],
    appliesWhen: a =>
      a.copies('V5').some(copy => {
        const duration = recordOf(copy)?.duration;
        return duration !== undefined && duration !== 'none';
      }),
    when: 'a V5 answer has a duration',
    docs: EVENTS,
  },
  {
    id: 'I2',
    title: 'Which keys do what?',
    shape: table([text('key'), text('action')]),
    needs: ['S4'],
    reads: ['C3'],
    appliesWhen: a => c3Has(a, 'keyboard'),
    when: 'C3 has keyboard',
    check: atLeastOneRow,
    docs: EVENTS,
  },
  {
    id: 'I3',
    title: 'Is progress shown: a bar, a slide counter, a chapter menu?',
    shape: { kind: 'set', options: ['bar', 'counter', 'chapter-menu'], none: true },
    needs: ['S2'],
    docs: EVENTS,
  },
  {
    id: 'I4',
    title: 'When the viewer returns to a view: restart at 0, or resume?',
    shape: choice('restart', 'resume'),
    needs: ['S4'],
    reads: ['S2'],
    appliesWhen: moreThanOneView,
    when: 'more than one view',
    docs: EVENTS,
  },
  {
    id: 'I5',
    title: 'Are touch gestures (swipe) needed? They are not built in and need a host module.',
    shape: YES_NO,
    needs: ['C3'],
    reads: ['C3'],
    appliesWhen: a => c3Has(a, 'touch'),
    when: 'C3 has touch',
    docs: EVENTS,
  },

  // D: visual design.
  {
    id: 'D1',
    title: 'Is there a brand guide, a design system, CSS or a site to match?',
    shape: TEXT_OR_NONE,
    needs: ['P4'],
    docs: CSS,
    facts: [FACT_CSS],
  },
  {
    id: 'D2',
    title: 'Which colours (background, text, accent), and light, dark or both?',
    shape: TEXT,
    needs: ['D1'],
    docs: CSS,
    facts: [FACT_CSS],
  },
  {
    id: 'D3',
    title: 'Which fonts, from where (system, files in the project, a CDN), under which licence?',
    shape: table([
      text('font'),
      pick('source', 'system', 'project', 'cdn'),
      pathOrDash('file'),
      text('licence'),
    ]),
    needs: ['D1', 'C5'],
    check: checkD3,
    docs: CSS,
    facts: ['the font files the project has'],
  },
  {
    id: 'D4',
    title:
      'A fixed-ratio stage scaled to the window (which ratio), or a fluid layout (which breakpoints)?',
    shape: record([pick('choice', 'fixed-ratio', 'fluid'), text('detail')]),
    needs: ['C2'],
    docs: CSS,
  },
  {
    id: 'D5',
    title: 'Which layout does each view use: title, two columns, full-bleed media, …?',
    shape: table([view('view'), text('layout')], { rows: 'one-per-view' }),
    needs: ['S2', 'D4'],
    docs: CSS,
  },
  {
    id: 'D6',
    title: 'Which motion: kinds of transition, durations, easing, how expressive?',
    shape: TEXT,
    needs: ['P4'],
    docs: CSS,
  },
  {
    id: 'D7',
    title: 'Under reduced-motion settings: shorten or remove transitions, or keep them?',
    shape: choice('shorten', 'remove', 'keep'),
    needs: ['D6'],
    docs: CSS,
  },
  {
    id: 'D8',
    title: 'Which imagery: photos, illustrations, icons, and from where?',
    shape: TEXT_OR_NONE,
    needs: ['D1'],
    reads: ['V3'],
    appliesWhen: someV3Image,
    when: 'a V3 answer lists images',
    docs: CSS,
  },

  // L: languages.
  {
    id: 'L1',
    title: 'Which languages, and which is the default?',
    shape: table([language('code'), yesNo('default')]),
    needs: ['P3'],
    check: checkL1,
    docs: LOCALES,
    facts: ['the languages of the programs the project has', "each language code's text direction"],
  },
  {
    id: 'L2',
    title: 'Who supplies each translation, and when?',
    shape: table([language('language'), text('supplier'), text('when')]),
    needs: ['L1'],
    reads: ['L1'],
    appliesWhen: moreThanOneLanguage,
    when: 'more than one language',
    docs: LOCALES,
  },
  {
    id: 'L3',
    title: 'Where does the viewer switch language, and what does the switch look like?',
    shape: TEXT,
    needs: ['L1'],
    reads: ['L1'],
    appliesWhen: moreThanOneLanguage,
    when: 'more than one language',
    docs: LOCALES,
  },
  {
    id: 'L4',
    title: 'Which assets differ per language: audio, video, subtitles, images with text?',
    shape: TEXT_OR_NONE,
    needs: ['L1', 'V3'],
    reads: ['L1', 'V3', 'S6', 'D3'],
    appliesWhen: (a, assets) => moreThanOneLanguage(a) && assets.length > 0,
    when: 'more than one language and any asset',
    docs: LOCALES,
  },
  {
    id: 'L5',
    title: 'Do the cue times differ per language?',
    shape: record([pick('choice', 'yes', 'no'), textOrDash('source')]),
    needs: ['L4'],
    reads: ['L4'],
    appliesWhen: a => {
      const l4 = a.get('L4');
      return typeof l4 === 'string' && l4 !== 'none';
    },
    when: 'L4 is not none',
    check: yesNeeds('source', 'where the cue times per language come from'),
    docs: LOCALES,
  },

  // A: assets. One row per asset named in V3, S6 or D3 (the asset list, FR-012).
  {
    id: 'A1',
    title: 'For each asset that does not exist yet: who delivers it, and when?',
    shape: table([text('asset'), text('who'), text('when')]),
    needs: ['V3'],
    reads: ['V3', 'S6', 'D3'],
    appliesWhen: assetMissing,
    when: 'an asset is missing',
    docs: ASSETS,
    facts: [FACT_ASSET_FILES],
  },
  {
    id: 'A2',
    title: 'May the build use placeholders for missing assets, and of what kind?',
    shape: record([pick('choice', 'yes', 'no'), textOrDash('kind')]),
    needs: ['A1'],
    reads: ['V3', 'S6', 'D3'],
    appliesWhen: assetMissing,
    when: 'an asset is missing',
    check: yesNeeds('kind', 'the kind of placeholder'),
    docs: ASSETS,
  },
  {
    id: 'A3',
    title: 'Which licence or credit lines must be shown?',
    shape: TEXT_OR_NONE,
    needs: ['V3'],
    reads: ['V3', 'S6', 'D3'],
    appliesWhen: anyAsset,
    when: 'any asset',
    docs: ASSETS,
  },
  {
    id: 'A4',
    title: 'For video and audio: poster image, captions track, loop, muted start?',
    shape: table([text('file'), text('poster'), text('captions'), yesNo('loop'), yesNo('muted')]),
    needs: ['S6'],
    reads: ['S6', 'V3'],
    appliesWhen: (_a, assets) => assets.some(e => e.kind === 'video' || e.kind === 'audio'),
    when: 'a view uses `video` or `audio`',
    docs: ASSETS,
  },
  {
    id: 'A5',
    title: 'What is the alt text of each meaningful image?',
    shape: table([text('image'), text('alt')]),
    needs: ['V3'],
    reads: ['V3'],
    appliesWhen: someV3Image,
    when: 'a V3 answer lists images',
    docs: ASSETS,
  },
  {
    id: 'A6',
    title: 'Are the files in the project, or at remote URLs?',
    shape: choice('project', 'remote'),
    needs: ['C5'],
    reads: ['V3', 'S6', 'D3'],
    appliesWhen: anyAsset,
    when: 'any asset',
    docs: ASSETS,
    facts: [FACT_ASSET_FILES],
  },

  // H: custom behaviour.
  {
    id: 'H1',
    title:
      'Does anything need code beyond the built-in operations: analytics, charts, form input, external data, gestures?',
    ask: 'Does anything need code beyond the built-in operations: analytics, charts, form input, external data, gestures? (docs `assets-and-host-modules`, `not-eligian`)',
    shape: table(
      [
        pick('need', 'analytics', 'charts', 'form-input', 'external-data', 'gestures', 'other'),
        text('detail'),
      ],
      { none: true }
    ),
    needs: ['V4', 'V6', 'I5'],
    docs: ['assets-and-host-modules', 'not-eligian'],
    facts: ['eligian_project: the host module declarations the project has'],
  },
  {
    id: 'H2',
    title: 'Is content loaded at run time, and from where?',
    shape: TEXT,
    needs: ['H1'],
    reads: ['H1'],
    appliesWhen: a => h1Lists(a, 'external-data'),
    when: 'H1 lists external data',
  },
  {
    id: 'H3',
    title: 'Which events are tracked, where do they go, and is consent needed?',
    shape: TEXT,
    needs: ['H1'],
    reads: ['H1'],
    appliesWhen: a => h1Lists(a, 'analytics'),
    when: 'H1 lists analytics',
  },

  // X: accessibility.
  {
    id: 'X1',
    title: 'Which target: WCAG 2.2 AA, best effort, or none stated?',
    shape: choice('wcag-2.2-aa', 'best-effort', 'none'),
    needs: ['C1'],
  },
  {
    id: 'X2',
    title: 'Must every interaction work with the keyboard alone?',
    shape: YES_NO,
    needs: ['I2', 'V6'],
  },
  {
    id: 'X3',
    title: 'On a view change: move focus, and announce the view to screen readers?',
    shape: record([yesNo('focus'), yesNo('announce')]),
    needs: ['S4'],
    reads: ['S2'],
    appliesWhen: moreThanOneView,
    when: 'more than one view',
  },
  {
    id: 'X4',
    title: 'Captions or a transcript for speech?',
    shape: choice('captions', 'transcript', 'none'),
    needs: ['S6'],
    reads: ['S6'],
    appliesWhen: someMediaView,
    when: 'a view uses `video` or `audio`',
  },
  {
    id: 'X5',
    title: 'A pause control for content that advances by itself?',
    shape: YES_NO,
    needs: ['S5'],
    reads: ['S5'],
    appliesWhen: a => rowsOf(a.get('S5')).some(r => r.end === 'advance' || r.end === 'loop'),
    when: 'an S5 answer is advance or loop',
  },

  // R: delivery. No prerequisites except where noted.
  {
    id: 'R1',
    title:
      'Where does it run: a standalone page (`--bundle`), inside an existing site or app, or an offline bundle?',
    shape: record([pick('choice', 'standalone', 'embedded', 'offline'), text('detail')]),
    needs: ['C1', 'C5'],
    facts: [
      "the installed eligian version (the `- eligian-installed:` line of the brief's `## Facts`)",
      "the package manager (the `- package-manager:` line of the brief's `## Facts`)",
    ],
  },
  { id: 'R2', title: 'Which browsers?', shape: TEXT },
  {
    id: 'R3',
    title: 'Which directory and entry file name?',
    shape: { kind: 'path' },
    facts: ['the .eligian files already in the directory'],
  },
  {
    id: 'R4',
    title: 'Are any actions shared with other presentations (a library file)?',
    shape: YES_NO,
  },

  // W: working agreement. W1's needs are filled in below: every other question.
  {
    id: 'W1',
    title: 'What may the agent decide on its own during the build, beyond the delegated answers?',
    shape: TEXT,
  },
  {
    id: 'W2',
    title:
      'When does the user look: after the first view, or only at the end? (The storyboard approval is fixed.)',
    shape: choice('first-view', 'end'),
    needs: ['S2'],
  },
  { id: 'W3', title: 'What is "done" beyond the tools passing?', shape: TEXT },
];

const branchOf = (id: string): BranchId => id.charAt(0) as BranchId;

/** The 63 template questions in branch order; the V entries are templates (FR-010). */
export const TREE: readonly Question[] = DEFINITIONS.map(
  (d): Question => ({
    id: d.id,
    branch: branchOf(d.id),
    title: d.title,
    ask: d.ask ?? d.title,
    shape: d.shape,
    needs: d.id === 'W1' ? DEFINITIONS.filter(o => o.id !== 'W1').map(o => o.id) : (d.needs ?? []),
    reads: d.reads ?? [],
    appliesWhen: d.appliesWhen ?? ALWAYS,
    when: d.when ?? 'always',
    ...(d.check === undefined ? {} : { check: d.check }),
    docs: d.docs ?? [],
    facts: d.facts ?? [],
    since: 1,
  })
);
