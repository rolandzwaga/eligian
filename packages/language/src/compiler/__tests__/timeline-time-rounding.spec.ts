/**
 * Regression (2026-10-22 audit, low): stagger/sequence/relative times were
 * computed in raw floating point, so values like 0.30000000000000004 leaked
 * into duration.start/end and into the generated timeline action names.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import type { EligiusIR } from '../types/eligius-ir.js';

const PRELUDE = `languages { * "en-US" "English" }
action f(sel) [ selectElement(sel) addClass("on") ]
`;

/** Any decimal with a run of 9+ zeros or nines betrays float accumulation. */
const FLOAT_NOISE = /\d\.\d*(0{9,}|9{9,})\d/;

describe('emitted timeline times are free of floating-point noise', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function compileTimeline(body: string): Promise<EligiusIR> {
    const document = await parse(`${PRELUDE}timeline "T" in "#stage" using raf {\n${body}\n}`);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return Effect.runPromise(transformAST(document.parseResult.value));
  }

  const timelineActions = (ir: EligiusIR) => ir.config.timelines[0].timelineActions;

  test('stagger with an action call (the audit scenario)', async () => {
    const ir = await compileTimeline('  stagger 100ms [".a", ".b", ".c", ".d"] with f() for 1s');
    const actions = timelineActions(ir);

    expect(actions.map(a => a.duration.start)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(actions.map(a => a.duration.end)).toEqual([1, 1.1, 1.2, 1.3]);
    expect(actions[3].name).toBe('stagger-f-3-0.3-1.3');
    for (const action of actions) {
      expect(action.name).not.toMatch(FLOAT_NOISE);
    }
  });

  test('stagger with inline operations', async () => {
    const ir = await compileTimeline(`  stagger 100ms [".a", ".b", ".c", ".d"] for 1s [
    selectElement(@@item)
  ] []`);
    const actions = timelineActions(ir);

    expect(actions.map(a => a.duration.start)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(actions.map(a => a.duration.end)).toEqual([1, 1.1, 1.2, 1.3]);
  });

  test('sequence items accumulate cleanly', async () => {
    const ir = await compileTimeline(`  sequence {
    f(".a") for 100ms
    f(".b") for 200ms
    f(".c") for 100ms
  }`);
    const actions = timelineActions(ir);

    expect(actions.map(a => [a.duration.start, a.duration.end])).toEqual([
      [0, 0.1],
      [0.1, 0.3],
      [0.3, 0.4],
    ]);
    for (const action of actions) {
      expect(action.name).not.toMatch(FLOAT_NOISE);
    }
  });

  test('relative and arithmetic time ranges', async () => {
    const ir = await compileTimeline(`  at 0s..100ms f(".a")
  at +0s..+200ms f(".b")
  at +0s..+100ms f(".c")
  at 100ms * 3..1s f(".d")`);
    const actions = timelineActions(ir);

    expect(actions.map(a => [a.duration.start, a.duration.end])).toEqual([
      [0, 0.1],
      [0.1, 0.3],
      [0.3, 0.4],
      [0.3, 1],
    ]);
  });

  test('stagger after a relative chain starts from a clean base', async () => {
    const ir = await compileTimeline(`  at 0s..100ms f(".a")
  at +0s..+200ms f(".b")
  stagger 100ms [".c", ".d"] with f() for 100ms`);
    const actions = timelineActions(ir);

    expect(actions.slice(2).map(a => [a.duration.start, a.duration.end])).toEqual([
      [0.3, 0.4],
      [0.4, 0.5],
    ]);
  });
});
