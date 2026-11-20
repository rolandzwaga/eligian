/**
 * Spec 059 Phase 1 (FR-005, FR-006, FR-019 value formats, FR-020 value parsing; plan §2, P7, P10):
 * the answer values of the brief interview, `mcp/brief/values.ts`. Pure, no server.
 */
import { describe, expect, it } from 'vitest';
import { type AnswerValue, type Question, type Shape, TREE } from '../mcp/brief/tree.js';
import {
  escapeCell,
  expectedForm,
  formatValue,
  parseValue,
  unescapeCell,
  validateValue,
} from '../mcp/brief/values.js';

const byId = new Map(TREE.map(q => [q.id, q]));

function question(id: string): Question {
  const q = byId.get(id);
  if (q === undefined) throw new Error(`no question ${id}`);
  return q;
}

/** One valid canonical value per FR-006 id (all 63). */
const CANONICAL: readonly (readonly [string, AnswerValue])[] = [
  ['P1', 'Viewers know the three steps of onboarding.'],
  ['P2', 'none'],
  ['P3', 'New customers.\nThey know the product name only.'],
  ['P4', 'friendly'],
  ['P5', 90],
  ['C1', 'self-paced'],
  [
    'C2',
    [
      { device: 'desktop', primary: 'yes' },
      { device: 'phone', primary: 'no' },
    ],
  ],
  ['C3', ['mouse', 'keyboard']],
  ['C4', 'both'],
  ['C5', 'online'],
  ['S1', 'hub-and-chapters'],
  [
    'S2',
    [
      { name: 'intro', purpose: 'Says hello | sets the tone' },
      { name: 'Demo 2', purpose: 'Shows the product' },
    ],
  ],
  ['S3', 'intro'],
  [
    'S4',
    [
      { view: 'intro', target: 'Demo 2', trigger: 'click the Next button' },
      { view: 'Demo 2', target: 'intro', trigger: 'the Escape key' },
    ],
  ],
  [
    'S5',
    [
      { view: 'intro', end: 'advance' },
      { view: 'Demo 2', end: 'hub' },
    ],
  ],
  [
    'S6',
    [
      { view: 'intro', provider: 'raf', source: '-' },
      { view: 'Demo 2', provider: 'video', source: 'media/demo.mp4' },
    ],
  ],
  ['S7', true],
  ['S8', 'loop'],
  ['V1', 'The product saves time.'],
  ['V2', 'Welcome\n\nThree steps to get going.'],
  [
    'V3',
    [
      { element: 'logo', kind: 'image', file: 'images/logo.png' },
      { element: 'hero', kind: 'video', file: 'https://cdn.example.com/hero.mp4' },
      { element: 'next', kind: 'button', file: '-' },
    ],
  ],
  ['V4', 'The title fades in, then the list items one by one.'],
  ['V5', { duration: '30', pacing: 'fixed', 'cues-from': '-' }],
  ['V6', 'none'],
  ['I1', 'Play and pause at the bottom right.'],
  [
    'I2',
    [
      { key: 'ArrowRight', action: 'next view' },
      { key: 'Space', action: 'play or pause' },
    ],
  ],
  ['I3', ['bar', 'counter']],
  ['I4', 'resume'],
  ['I5', false],
  ['D1', 'none'],
  ['D2', 'Dark background, white text, orange accent; dark only.'],
  [
    'D3',
    [
      { font: 'Inter', source: 'project', file: 'fonts/inter.woff2', licence: 'OFL' },
      { font: 'Arial', source: 'system', file: '-', licence: '-' },
      {
        font: 'Roboto',
        source: 'cdn',
        file: 'https://fonts.example.com/roboto.css',
        licence: 'Apache-2.0',
      },
      { font: 'Lato', source: 'cdn', file: '-', licence: 'OFL' },
    ],
  ],
  ['D4', { choice: 'fixed-ratio', detail: '16:9' }],
  [
    'D5',
    [
      { view: 'intro', layout: 'title' },
      { view: 'Demo 2', layout: 'full-bleed media' },
    ],
  ],
  ['D6', 'Short fades, 300 ms, ease-out.'],
  ['D7', 'shorten'],
  ['D8', 'Photos from the brand library.'],
  [
    'L1',
    [
      { code: 'en-US', default: 'yes' },
      { code: 'nl-NL', default: 'no' },
    ],
  ],
  [
    'L2',
    [
      { language: 'en-US', supplier: 'the author', when: 'now' },
      { language: 'nl-NL', supplier: 'an agency', when: 'next week' },
    ],
  ],
  ['L3', 'A toggle in the top right corner.'],
  ['L4', 'The narration audio.'],
  ['L5', { choice: 'yes', source: 'a cue sheet per language' }],
  ['A1', [{ asset: 'intro: logo', who: 'the design team', when: 'before the first review' }]],
  ['A2', { choice: 'yes', kind: 'grey boxes with the asset name' }],
  ['A3', 'Photo by A. Person, CC BY 4.0'],
  [
    'A4',
    [
      {
        file: 'media/demo.mp4',
        poster: 'media/demo.jpg',
        captions: 'media/demo.vtt',
        loop: 'no',
        muted: 'yes',
      },
    ],
  ],
  ['A5', [{ image: 'images/logo.png', alt: 'The company logo' }]],
  ['A6', 'project'],
  ['H1', [{ need: 'analytics', detail: 'count the views' }]],
  ['H2', 'A JSON file from the product API.'],
  ['H3', 'View counts, to our own endpoint; consent is needed.'],
  ['X1', 'wcag-2.2-aa'],
  ['X2', true],
  ['X3', { focus: 'yes', announce: 'no' }],
  ['X4', 'captions'],
  ['X5', true],
  ['R1', { choice: 'standalone', detail: 'a page on the product site' }],
  ['R2', 'evergreen'],
  ['R3', 'presentations/onboarding.eligian'],
  ['R4', false],
  ['W1', 'nothing'],
  ['W2', 'first-view'],
  ['W3', 'A colleague watched it once without help.'],
];

/** Reverses an object's key order (to prove the stored order is the column order, P7). */
function reversed(value: AnswerValue): AnswerValue {
  const flip = (row: Readonly<Record<string, string>>) =>
    Object.fromEntries(Object.entries(row).reverse());
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map(v =>
      typeof v === 'object' && v !== null ? flip(v as Record<string, string>) : v
    ) as AnswerValue;
  }
  if (typeof value === 'object') return flip(value as Readonly<Record<string, string>>);
  return value;
}

function rejects(id: string, value: unknown): string {
  const result = validateValue(question(id), value);
  if (result.ok) throw new Error(`${id} accepted ${JSON.stringify(value)}`);
  return result.message;
}

describe('wire forms', () => {
  it('the canonical table covers every question', () => {
    expect(CANONICAL.map(([id]) => id)).toEqual(TREE.map(q => q.id));
  });

  it.each(CANONICAL)('accepts the canonical form of %s', (id, value) => {
    const q = question(id);
    const result = validateValue(q, reversed(value));
    expect(result).toEqual({ ok: true, value });
    if (!result.ok) return;
    const columns = (q.shape.columns ?? []).map(c => c.name);
    if (q.shape.kind === 'record') {
      expect(Object.keys(result.value as object)).toEqual(columns);
    }
    if (q.shape.kind === 'table' && Array.isArray(result.value)) {
      for (const row of result.value as readonly object[]) {
        expect(Object.keys(row)).toEqual(columns);
      }
    }
  });

  const SHAPE_FAILURES: readonly (readonly [string, string, unknown, string])[] = [
    ['"yes"', 'S7', 'yes', 'expected a JSON boolean (true or false)'],
    ['"90"', 'P5', '90', 'expected a JSON number of seconds greater than 0, or "viewer-paced"'],
    ['"90s"', 'P5', '90s', 'expected a JSON number of seconds greater than 0, or "viewer-paced"'],
    [
      '"1m30s"',
      'P5',
      '1m30s',
      'expected a JSON number of seconds greater than 0, or "viewer-paced"',
    ],
    [
      'a comma-separated string',
      'C3',
      'mouse, touch',
      'expected an array of strings from: mouse, touch, keyboard, clicker',
    ],
    ['a single record', 'C2', { device: 'desktop', primary: 'yes' }, ''],
    ['"Self-Paced"', 'C1', 'Self-Paced', ''],
    ['a number cell', 'S2', [{ name: 1, purpose: 'x' }], ''],
    ['a boolean cell', 'S2', [{ name: 'intro', purpose: true }], ''],
  ];

  it.each(SHAPE_FAILURES)('rejects %s for %s', (_variant, id, value, expected) => {
    const message = rejects(id, value);
    expect(message).toContain(expectedForm(question(id).shape));
    expect(message).toContain(expected);
  });

  const P7_FAILURES: readonly (readonly [string, string, unknown, string])[] = [
    ['a string with \\r', 'P1', 'line one\r\nline two', 'line breaks must be \\n'],
    ['a cell with \\r', 'S2', [{ name: 'intro', purpose: 'a\rb' }], 'line breaks must be \\n'],
    ['a cell with \\n', 'S2', [{ name: 'intro', purpose: 'a\nb' }], 'a cell is one line'],
    [
      'a path cell with \\',
      'D3',
      [{ font: 'Inter', source: 'project', file: 'fonts\\inter.woff2', licence: 'OFL' }],
      'a path uses forward slashes',
    ],
    ['an R3 path with \\', 'R3', 'presentations\\a.eligian', 'a path uses forward slashes'],
    [
      'a record with an extra key',
      'D4',
      { choice: 'fluid', detail: 'two breakpoints', extra: 'x' },
      'expected exactly the fields: choice, detail',
    ],
    [
      'a record with a missing key',
      'D4',
      { choice: 'fluid' },
      'expected exactly the fields: choice, detail',
    ],
    [
      'a table row with an extra key',
      'C2',
      [{ device: 'desktop', primary: 'yes', extra: 'x' }],
      'expected exactly the fields: device, primary',
    ],
    [
      'a table row with a missing key',
      'C2',
      [{ device: 'desktop' }],
      'expected exactly the fields: device, primary',
    ],
  ];

  it.each(P7_FAILURES)('rejects %s for %s with the P7 text', (_variant, id, value, expected) => {
    expect(rejects(id, value)).toContain(expected);
  });
});

describe('one wrong value per shape', () => {
  const WRONG: readonly (readonly [string, string, unknown])[] = [
    ['text', 'P1', 42],
    ['choice', 'C1', 'sometimes'],
    ['set', 'C3', ['mouse', 'trackpad']],
    ['yes-no', 'S7', 1],
    ['duration', 'P5', 0],
    ['view', 'S3', ['intro']],
    ['path', 'R3', 7],
    ['record', 'D4', ['fluid', 'two breakpoints']],
    ['table', 'C2', 'desktop'],
    ['"none" on a shape without none', 'P1', 'none'],
  ];

  it.each(WRONG)('rejects the wrong value for %s (%s)', (_kind, id, value) => {
    expect(rejects(id, value)).toContain(expectedForm(question(id).shape));
  });

  it('every shape kind is covered', () => {
    const kinds = new Set(WRONG.map(([, id]) => question(id).shape.kind));
    expect([...kinds].sort()).toEqual(
      ['choice', 'duration', 'path', 'record', 'set', 'table', 'text', 'view', 'yes-no'].sort()
    );
  });
});

describe('extra validation (FR-006)', () => {
  const two = (a: Record<string, string>, b: Record<string, string>) => [a, b];
  const CASES: readonly (readonly [string, string, unknown, string])[] = [
    [
      'C2 with two primary: yes',
      'C2',
      two({ device: 'desktop', primary: 'yes' }, { device: 'phone', primary: 'yes' }),
      'exactly one device is primary: yes',
    ],
    [
      'C2 with no primary: yes',
      'C2',
      two({ device: 'desktop', primary: 'no' }, { device: 'phone', primary: 'no' }),
      'exactly one device is primary: yes',
    ],
    [
      'C2 with a duplicate device',
      'C2',
      two({ device: 'desktop', primary: 'yes' }, { device: 'desktop', primary: 'no' }),
      'each device once',
    ],
    [
      'S2 with a duplicate name',
      'S2',
      two({ name: 'intro', purpose: 'a' }, { name: 'intro', purpose: 'b' }),
      'each view name once',
    ],
    ['S2 with a name with :', 'S2', [{ name: 'a:b', purpose: 'x' }], 'no ":", "|"'],
    ['S2 with a name with |', 'S2', [{ name: 'a|b', purpose: 'x' }], 'no ":", "|"'],
    [
      'S6 video with source -',
      'S6',
      [{ view: 'intro', provider: 'video', source: '-' }],
      'its source names the file or URL',
    ],
    [
      'S6 audio with source -',
      'S6',
      [{ view: 'intro', provider: 'audio', source: '-' }],
      'its source names the file or URL',
    ],
    [
      'S6 raf with a path',
      'S6',
      [{ view: 'intro', provider: 'raf', source: 'media/a.mp4' }],
      'its source is -',
    ],
    [
      'V5 duration none with pacing fixed',
      'V5',
      { duration: 'none', pacing: 'fixed', 'cues-from': '-' },
      'duration is none exactly when pacing is none',
    ],
    [
      'V5 duration 30 with pacing none',
      'V5',
      { duration: '30', pacing: 'none', 'cues-from': '-' },
      'duration is none exactly when pacing is none',
    ],
    [
      'V5 pacing cues with cues-from -',
      'V5',
      { duration: '30', pacing: 'cues', 'cues-from': '-' },
      'cues-from names',
    ],
    [
      'D3 project with file -',
      'D3',
      [{ font: 'Inter', source: 'project', file: '-', licence: 'OFL' }],
      'comes from the project',
    ],
    [
      'D3 system with a path',
      'D3',
      [{ font: 'Arial', source: 'system', file: 'fonts/arial.ttf', licence: '-' }],
      'is a system font',
    ],
    [
      'D3 cdn with a relative path',
      'D3',
      [{ font: 'Lato', source: 'cdn', file: 'fonts/lato.css', licence: 'OFL' }],
      'comes from a CDN',
    ],
    ['L5 choice yes with source -', 'L5', { choice: 'yes', source: '-' }, 'choice yes: source'],
    ['A2 choice yes with kind -', 'A2', { choice: 'yes', kind: '-' }, 'choice yes: kind'],
    ['[] for C2', 'C2', [], 'expected at least one row'],
    ['[] for S2', 'S2', [], 'expected at least one view'],
    ['[] for S4', 'S4', [], 'expected at least one row'],
    ['[] for I2', 'I2', [], 'expected at least one row'],
    ['[] for L1', 'L1', [], 'expected at least one language'],
    ['[] for C3', 'C3', [], expectedForm(question('C3').shape)],
    ...['P1', 'V1', 'D2', 'L3', 'H2', 'R2', 'W1', 'W3'].flatMap(
      id =>
        [
          [`"" for ${id}`, id, '', 'expected non-empty text'],
          [`"   " for ${id}`, id, '   ', 'expected non-empty text'],
        ] as const
    ),
  ];

  it.each(CASES)('rejects %s', (_case, id, value, expected) => {
    expect(rejects(id, value)).toContain(expected);
  });

  it('every rejected question has an accepted twin in the canonical table', () => {
    const accepted = new Set(CANONICAL.map(([id]) => id));
    for (const [, id] of CASES) expect(accepted.has(id)).toBe(true);
  });
});

describe('S2 names', () => {
  const S2_RULE =
    'must be 1 to 64 characters, no ":", "|", line break, or leading or trailing space';
  const views = (...names: readonly string[]) => names.map(name => ({ name, purpose: 'x' }));

  it('accepts "Timeline & Time", "Files & Imports"', () => {
    // `-intro` moved here from the rejected table: the widened rule allows a leading `-`.
    const value = views('Timeline & Time', 'Files & Imports', '-intro');
    expect(validateValue(question('S2'), value)).toEqual({ ok: true, value });
  });

  it('rejects ":", "|", a leading space, a trailing space, a line break, 65 characters', () => {
    for (const name of ['a:b', 'a|b', 'x'.repeat(65)]) {
      expect(rejects('S2', views(name))).toContain(S2_RULE);
    }
    // Spaces at either end and line breaks are refused by the shape's cell check before the S2
    // rule runs; the S2 rule refuses them too.
    expect(rejects('S2', views(' intro'))).toContain('a cell has no leading or trailing spaces');
    expect(rejects('S2', views('intro '))).toContain('a cell has no leading or trailing spaces');
    expect(rejects('S2', views('a\nb'))).toContain('a cell is one line');
    expect(validateValue(question('S2'), views('x'.repeat(64))).ok).toBe(true);
  });
});

describe('format and parse', () => {
  it.each(CANONICAL)('round-trips the canonical value of %s', (id, value) => {
    const shape = question(id).shape;
    expect(parseValue(shape, formatValue(shape, value))).toEqual(value);
  });

  it('text lines starting with # and \\# round-trip', () => {
    const shape = question('V2').shape;
    const value = '# a heading\n\\# an escaped one\nplain';
    const lines = formatValue(shape, value);
    expect(lines).toEqual(['\\# a heading', '\\\\# an escaped one', 'plain']);
    expect(parseValue(shape, lines)).toBe(value);
  });

  it('a cell with | is written \\| and read back', () => {
    const shape = question('S2').shape;
    const value = [{ name: 'intro', purpose: 'a | b' }];
    const lines = formatValue(shape, value);
    expect(lines).toEqual(['| name | purpose |', '| --- | --- |', '| intro | a \\| b |']);
    expect(parseValue(shape, lines)).toEqual(value);
  });

  it('a record is a | field | value | table in column order', () => {
    const shape = question('V5').shape;
    expect(formatValue(shape, { duration: '30', pacing: 'fixed', 'cues-from': '-' })).toEqual([
      '| field | value |',
      '| --- | --- |',
      '| duration | 30 |',
      '| pacing | fixed |',
      '| cues-from | - |',
    ]);
  });

  it('P5 90 is written 90s; parse accepts 90s and rejects 090s and 90.0s', () => {
    const shape = question('P5').shape;
    expect(formatValue(shape, 90)).toEqual(['90s']);
    expect(formatValue(shape, 'viewer-paced')).toEqual(['viewer-paced']);
    expect(parseValue(shape, ['90s'])).toBe(90);
    expect(parseValue(shape, ['2.5s'])).toBe(2.5);
    expect(parseValue(shape, ['viewer-paced'])).toBe('viewer-paced');
    expect(parseValue(shape, ['090s'])).toBeUndefined();
    expect(parseValue(shape, ['90.0s'])).toBeUndefined();
    expect(parseValue(shape, ['90'])).toBeUndefined();
    expect(parseValue(shape, ['0s'])).toBeUndefined();
  });

  it('yes-no is yes/no, a set is "a, b"', () => {
    const yesNo = question('S7').shape;
    expect(formatValue(yesNo, true)).toEqual(['yes']);
    expect(formatValue(yesNo, false)).toEqual(['no']);
    expect(parseValue(yesNo, ['yes'])).toBe(true);
    expect(parseValue(yesNo, ['no'])).toBe(false);
    expect(parseValue(yesNo, ['Yes'])).toBeUndefined();
    const set = question('C3').shape;
    expect(formatValue(set, ['mouse', 'keyboard'])).toEqual(['mouse, keyboard']);
    expect(parseValue(set, ['mouse, keyboard'])).toEqual(['mouse', 'keyboard']);
    expect(parseValue(set, ['mouse, trackpad'])).toBeUndefined();
  });

  it('a table with a wrong cell count parses to undefined', () => {
    const shape = question('S2').shape;
    expect(
      parseValue(shape, ['| name | purpose |', '| --- | --- |', '| intro | a | b |'])
    ).toBeUndefined();
    expect(parseValue(shape, ['| name | purpose |', '| --- | --- |', '| intro |'])).toBeUndefined();
    expect(parseValue(shape, ['| name | goal |', '| --- | --- |', '| a | b |'])).toBeUndefined();
    expect(parseValue(shape, ['| name | purpose |', '| a | b |'])).toBeUndefined();
  });

  it('a table row of dashes is a row, not a separator', () => {
    const shape = question('I2').shape;
    const value = [{ key: '-', action: '---' }];
    expect(parseValue(shape, formatValue(shape, value))).toEqual(value);
  });

  it('none round-trips where the shape accepts it', () => {
    for (const id of ['P2', 'V3', 'I3', 'H1', 'D1']) {
      const shape = question(id).shape;
      expect(formatValue(shape, 'none')).toEqual(['none']);
      expect(parseValue(shape, ['none'])).toBe('none');
    }
    expect(parseValue(question('C3').shape, ['none'])).toBeUndefined();
    expect(parseValue(question('C2').shape, ['none'])).toBeUndefined();
  });

  it('a value that does not fit its shape parses to undefined', () => {
    expect(parseValue(question('C1').shape, ['Self-Paced'])).toBeUndefined();
    expect(parseValue(question('C1').shape, ['loop', 'loop'])).toBeUndefined();
    expect(parseValue(question('P1').shape, [])).toBeUndefined();
    expect(parseValue(question('P1').shape, [''])).toBeUndefined();
  });

  it('escapeCell / unescapeCell are inverse', () => {
    for (const cell of ['plain', 'a | b', '|', '\\|', 'a\\', '\\\\|x|', '']) {
      expect(unescapeCell(escapeCell(cell))).toBe(cell);
    }
    expect(escapeCell('a | b')).toBe('a \\| b');
    expect(unescapeCell('a \\| b')).toBe('a | b');
  });
});

describe('expectedForm (FR-005)', () => {
  it.each([
    [{ kind: 'yes-no' }, 'expected a JSON boolean (true or false)'],
    [
      { kind: 'duration', alternatives: ['viewer-paced'] },
      'expected a JSON number of seconds greater than 0, or "viewer-paced"',
    ],
    [
      { kind: 'set', options: ['mouse', 'touch', 'keyboard', 'clicker'] },
      'expected an array of strings from: mouse, touch, keyboard, clicker',
    ],
  ] as readonly (readonly [Shape, string])[])('%j is "%s"', (shape, text) => {
    expect(expectedForm(shape)).toBe(text);
  });
});
