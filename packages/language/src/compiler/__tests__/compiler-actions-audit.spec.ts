/**
 * Regression tests for the "compiler-actions" medium findings of the
 * 2026-10-22 codebase audit (docs/audit/2026-10-22-codebase-audit.md):
 *
 * - Local actions must win over imported/transitive library actions of the
 *   same name, and the emitted `actions` must not hold duplicate names.
 * - Transitive library resolution must not depend on import order (no missing
 *   actions, no duplicate action definitions).
 * - An endable action called from an end block (an endable action's end block,
 *   or `if`/`for` inside any end block) must be ended with `endAction`.
 * - Event actions can call imported (library) actions.
 * - `navigate` broadcasts the target timeline's engine `uri` (the media source
 *   for video/audio timelines), not its DSL name.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { parseSource } from '../pipeline.js';
import { syntheticNavActionName } from '../transformers/navigate-operations.js';
import type { EligiusIR } from '../types/eligius-ir.js';

type EmittedAction = EligiusIR['config']['actions'][number];
type Operation = EmittedAction['startOperations'][number];

const systemNames = (ops: readonly Operation[]): string[] => ops.map(op => op.systemName);

const requested = (ops: readonly Operation[]): string[] =>
  ops
    .filter(op => op.systemName === 'requestAction')
    .map(op => String((op.operationData as Record<string, unknown>).systemName));

const actionNamed = (ir: EligiusIR, name: string): EmittedAction | undefined =>
  ir.config.actions.find(a => a.name === name);

describe('compiler-actions audit regressions (files on disk)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-compiler-actions-'));
    await fs.writeFile(
      path.join(tmpdir, 'test.css'),
      '.container {} .a {} .b {} .fromLib {} .fromLocal {} #a {} #box {}'
    );
  });

  afterEach(async () => {
    await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
  });

  async function compileFile(name: string, source: string): Promise<EligiusIR> {
    const mainPath = path.join(tmpdir, name);
    await fs.writeFile(mainPath, source);
    const program = await Effect.runPromise(parseSource(source, URI.file(mainPath).toString()));
    return Effect.runPromise(transformAST(program));
  }

  // Finding: "Comment says local actions override imported ones, but
  // findActionByName returns the imported action first"
  test('a local action wins over a transitively reached library action of the same name', async () => {
    await fs.writeFile(
      path.join(tmpdir, 'libB.eligian'),
      `library libB

action show(selector: string) [
  selectElement(selector)
  addClass("fromLib")
]
`
    );
    await fs.writeFile(
      path.join(tmpdir, 'libA.eligian'),
      `library libA

import { show } from "./libB.eligian"

action a(selector: string) [
  show(selector)
]
`
    );

    const ir = await compileFile(
      'main-shadow.eligian',
      `styles "./test.css"
import { a } from "./libA.eligian"

action show(selector: string) [
  selectElement(selector)
  addClass("fromLocal")
]

timeline "T" in ".container" using raf {
  at 0s..1s show("#a")
  at 1s..2s a("#a")
}
`
    );

    const names = ir.config.actions.map(x => x.name);
    expect(new Set(names).size).toBe(names.length);

    // The program's `show` call binds to the local definition
    const show = actionNamed(ir, 'show');
    const addClass = show?.startOperations.find(op => op.systemName === 'addClass');
    expect(JSON.stringify(addClass?.operationData)).toContain('fromLocal');
    expect(requested(ir.config.timelines[0].timelineActions[0].startOperations)).toEqual(['show']);

    // libA's `show` call binds to libB's definition, emitted under a qualified name
    expect(requested(actionNamed(ir, 'a')?.startOperations ?? [])).toEqual(['libB.show']);
    const libShow = actionNamed(ir, 'libB.show');
    expect(JSON.stringify(libShow?.startOperations)).toContain('fromLib');
  });

  // Finding: "Transitive library resolution is import-order dependent"
  describe('transitive resolution does not depend on import order', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tmpdir, 'animations.eligian'),
        `library animations

action c(selector: string) [
  selectElement(selector)
  addClass("a")
]

action d(selector: string) [
  selectElement(selector)
  addClass("b")
]
`
      );
      await fs.writeFile(
        path.join(tmpdir, 'other.eligian'),
        `library other

import { c, d } from "./animations.eligian"

action b(selector: string) [
  c(selector)
  d(selector)
]
`
      );
    });

    for (const [label, imports] of [
      [
        'animations first',
        'import { c } from "./animations.eligian"\nimport { b } from "./other.eligian"',
      ],
      [
        'other first',
        'import { b } from "./other.eligian"\nimport { c } from "./animations.eligian"',
      ],
    ] as const) {
      test(label, async () => {
        const ir = await compileFile(
          `main-order-${label.replace(/\s+/g, '-')}.eligian`,
          `styles "./test.css"
${imports}

timeline "T" in ".container" using raf {
  at 0s..1s c("#a")
  at 1s..2s b("#a")
}
`
        );

        const names = ir.config.actions.map(x => x.name);
        expect([...names].sort()).toEqual(['animations.d', 'b', 'c']);
        expect(requested(actionNamed(ir, 'b')?.startOperations ?? [])).toEqual([
          'c',
          'animations.d',
        ]);
      });
    }
  });

  // Finding: "Event actions cannot call imported (library) actions"
  test('an event action can call an imported library action', async () => {
    await fs.writeFile(
      path.join(tmpdir, 'animations.eligian'),
      `library animations

action lf(selector: string) [
  selectElement(selector)
  addClass("a")
]
`
    );

    const ir = await compileFile(
      'main-event.eligian',
      `styles "./test.css"
import { lf } from "./animations.eligian"

on event "language-change" action handler(a: string) [
  lf(a)
]

timeline "T" in ".container" using raf {
  at 0s..1s [ selectElement("#a") ] []
}
`
    );

    const handler = ir.config.eventActions!.find(e => e.name === 'handler');
    expect(handler).toBeDefined();
    // The event argument is resolved by a setOperationData before startAction:
    // startAction does not resolve the chains in actionOperationData itself
    expect(systemNames(handler?.startOperations ?? [])).toEqual([
      'requestAction',
      'setOperationData',
      'startAction',
    ]);
    expect(handler?.startOperations[1].operationData).toEqual({
      properties: { actionOperationData: { selector: '$operationData.eventArgs.0' } },
    });
    expect(requested(handler?.startOperations ?? [])).toEqual(['lf']);
    // The called action is emitted
    expect(actionNamed(ir, 'lf')).toBeDefined();
  });

  test('an event action can call a library action under its import alias', async () => {
    await fs.writeFile(
      path.join(tmpdir, 'animations.eligian'),
      `library animations

action lf(selector: string) [
  selectElement(selector)
]
`
    );

    const ir = await compileFile(
      'main-event-alias.eligian',
      `styles "./test.css"
import { lf as lightFade } from "./animations.eligian"

on event "language-change" action handler(a: string) [
  lightFade(a)
]

timeline "T" in ".container" using raf {
  at 0s..1s [ selectElement("#a") ] []
}
`
    );

    const handler = ir.config.eventActions!.find(e => e.name === 'handler');
    expect(requested(handler?.startOperations ?? [])).toEqual(['lightFade']);
    expect(actionNamed(ir, 'lightFade')).toBeDefined();
  });
});

describe('compiler-actions audit regressions (transform shape)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function compile(code: string): Promise<EligiusIR> {
    const document = await parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return Effect.runPromise(transformAST(document.parseResult.value));
  }

  const INNER = `endable action inner(sel) [
  selectElement(sel)
  addClass("a")
] [
  selectElement(sel)
  removeClass("a")
]
`;

  // Finding: "Operations inside an endable action's end block (and inside
  // if/for in any end block) use startAction instead of endAction"
  describe('endable action calls in end blocks use endAction', () => {
    test("in an endable action's end block", async () => {
      const ir = await compile(`${INNER}
endable action outer(sel) [
  inner(sel)
] [
  inner(sel)
]

timeline "T" in ".c" using raf {
  at 0s..1s outer("#a")
}
`);
      const outer = actionNamed(ir, 'outer');
      expect(systemNames(outer?.startOperations ?? [])).toEqual(['requestAction', 'startAction']);
      expect(systemNames(outer?.endOperations ?? [])).toEqual(['requestAction', 'endAction']);
    });

    test("inside if/for in an endable action's end block", async () => {
      const ir = await compile(`${INNER}
endable action outer(sel, flag, items) [
  selectElement(sel)
] [
  if (flag) {
    inner(sel)
  } else {
    inner(sel)
  }
  for (item in items) {
    inner(sel)
  }
]

timeline "T" in ".c" using raf {
  at 0s..1s outer("#a", true, [1, 2])
}
`);
      const outer = actionNamed(ir, 'outer');
      const endOps = systemNames(outer?.endOperations ?? []);
      expect(endOps).not.toContain('startAction');
      expect(endOps.filter(n => n === 'endAction')).toHaveLength(3);
      expect(endOps).toEqual([
        'when',
        'requestAction',
        'endAction',
        'otherwise',
        'requestAction',
        'endAction',
        'endWhen',
        'forEach',
        'requestAction',
        'endAction',
        'endForEach',
      ]);
    });

    test('inside if in an inline timeline end block', async () => {
      const ir = await compile(`${INNER}
timeline "T" in ".c" using raf {
  at 0s..2s [
    inner("#a")
  ] [
    if (true) {
      inner("#a")
    }
  ]
}
`);
      const event = ir.config.timelines[0].timelineActions[0];
      expect(systemNames(event.startOperations)).toEqual(['requestAction', 'startAction']);
      expect(systemNames(event.endOperations)).toEqual([
        'when',
        'requestAction',
        'endAction',
        'endWhen',
      ]);
    });

    test('inside for in a stagger end block', async () => {
      const ir = await compile(`${INNER}
timeline "T" in ".c" using raf {
  stagger 200ms [".a", ".b"] for 1s [
    inner("#a")
  ] [
    for (x in [1]) {
      inner("#a")
    }
  ]
}
`);
      const staggered = ir.config.timelines[0].timelineActions;
      expect(staggered.length).toBeGreaterThan(0);
      for (const event of staggered) {
        expect(systemNames(event.endOperations)).toEqual([
          'forEach',
          'requestAction',
          'endAction',
          'endForEach',
        ]);
      }
    });

    test('a regular action call in an end block still uses startAction', async () => {
      const ir = await compile(`action plain(sel) [
  selectElement(sel)
]

endable action outer(sel) [
  selectElement(sel)
] [
  plain(sel)
]

timeline "T" in ".c" using raf {
  at 0s..1s outer("#a")
}
`);
      const outer = actionNamed(ir, 'outer');
      expect(systemNames(outer?.endOperations ?? [])).toEqual(['requestAction', 'startAction']);
    });
  });

  // Finding: "navigate broadcasts the timeline NAME, but the engine switches by uri"
  describe('navigate broadcasts the target timeline uri', () => {
    const navArgs = (ir: EligiusIR, name: string) => {
      const action = actionNamed(ir, name);
      expect(action).toBeDefined();
      return (action?.startOperations[0].operationData as Record<string, unknown> | undefined)
        ?.eventArgs;
    };

    test('a video timeline is targeted by its media source uri', async () => {
      const ir = await compile(`timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#a" navigate "Clip"
    on click "#b" navigate "Clip" at 5s
  ] []
}
timeline "Clip" in ".c" using video from "./c.mp4" {
  at 0s..1s [ selectElement("#a") ] []
}
`);
      const clip = ir.config.timelines.find(t => t.uri === './c.mp4');
      expect(clip).toBeDefined();
      expect(navArgs(ir, syntheticNavActionName('Clip', 0))).toEqual(['./c.mp4', 0]);
      expect(navArgs(ir, syntheticNavActionName('Clip', 5))).toEqual(['./c.mp4', 5]);
    });

    test('a raf timeline is targeted by its name (its uri)', async () => {
      const ir = await compile(`timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#a" navigate "Chapter One"
  ] []
}
timeline "Chapter One" in "#stage" using raf {
  at 0s..1s [ on click "#back" navigate "Hub" ] []
}
`);
      expect(ir.config.timelines.map(t => t.uri)).toEqual(['Hub', 'Chapter One']);
      expect(navArgs(ir, syntheticNavActionName('Chapter One', 0))).toEqual(['Chapter One', 0]);
      expect(navArgs(ir, syntheticNavActionName('Hub', 0))).toEqual(['Hub', 0]);
    });

    test('every broadcast uri names an emitted timeline', async () => {
      const ir = await compile(`timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#a" navigate "Song"
    on click "#b" navigate "Clip"
  ] []
}
timeline "Clip" in ".c" using video from "./c.mp4" {
  at 0s..1s [ on click "#back" navigate "Hub" ] []
}
timeline "Song" in ".s" using audio from "./s.mp3" {
  at 0s..1s [ selectElement("#a") ] []
}
`);
      const uris = new Set(ir.config.timelines.map(t => t.uri));
      const broadcasts = ir.config.actions
        .filter(a => a.name.startsWith('__nav__'))
        .map(a => (a.startOperations[0].operationData as { eventArgs: unknown[] }).eventArgs[0]);
      expect(broadcasts.sort()).toEqual(['./c.mp4', './s.mp3', 'Hub']);
      for (const uri of broadcasts) {
        expect(uris.has(uri as string)).toBe(true);
      }
    });
  });
});
