/**
 * Spec 058 Phase 2 (FR-034; plan C2): smoke scenarios. `parseScenario` decodes a scenario file's
 * JSON and applies the cross-field rules the schema cannot express; a violation is a usage error
 * (CLI exit 2, tool kind io) before anything runs. `describe('scenario')` runs scenarios in-process
 * on the fixtures under `__fixtures__/mcp/scenario/` (T021). `describe('--scenario')` covers the
 * one-program rule and the CLI's usage errors: exit 2, nothing played (T022).
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { compileFile } from '../compile-file.js';
import { loadEligius, smokeWindow } from '../smoke/dom-environment.js';
import {
  type ElementSnapshot,
  POSITION_TOLERANCE_S,
  parseScenario,
  type Scenario,
  type ScenarioStepResult,
} from '../smoke/scenario.js';
import { runSmoke, smokeFile } from '../smoke/smoke-command.js';
import { type SmokeResult, smokeConfig } from '../smoke/smoke-runner.js';
import { requireFreshBundle } from './fresh-bundle.js';

/** The parsed scenario, failing the test with the message when parsing refuses. */
const accepted = (json: unknown): Scenario => {
  const parsed = parseScenario(json);
  if (!parsed.ok) throw new Error(`refused: ${parsed.message}`);
  return parsed.scenario;
};

/** The refusal message, failing the test when parsing accepts. */
const refused = (json: unknown): string => {
  const parsed = parseScenario(json);
  if (parsed.ok) throw new Error(`accepted: ${JSON.stringify(json)}`);
  return parsed.message;
};

describe('parseScenario', () => {
  it('accepts each step kind', () => {
    const steps = [
      { seek: 2.5 },
      { click: '#next' },
      { key: 'ArrowRight' },
      { key: 'ArrowLeft', in: '#stage' },
      { navigate: 'chapter-2' },
      { wait: 300 },
      { snapshot: 'after-wait' },
    ];
    expect(accepted({ steps }).steps).toEqual(steps);
  });

  it('accepts the assertion fields', () => {
    const scenario = {
      steps: [{ snapshot: 'start' }, { wait: 300 }, { snapshot: 'later' }],
      assertions: [
        { after: 'start', selector: '#box', hasClass: 'on' },
        { after: 0, selector: '#box', notHasClass: 'off' },
        { after: 1, selector: '#title', text: 'Hello' },
        { after: 'later', selector: '#box', visible: false },
        { after: 'later', selector: '#box', controllers: ['LabelController'] },
        { after: 'later', timeline: 'main' },
        { after: 'start', position: 0 },
        { after: 1, position: { sameAs: 'start' } },
        { after: 'later', position: { greaterThan: 1 } },
      ],
    };
    expect(accepted(scenario)).toEqual(scenario);
  });

  it('accepts a scenario without assertions', () => {
    expect(accepted({ steps: [] })).toEqual({ steps: [] });
  });

  it('rejects a malformed step', () => {
    const message = refused({ steps: [{ seek: 1 }, { fly: 1 }] });
    expect(message).toContain('step 1');
    expect(message).toContain('{"fly":1}');
  });

  it('rejects a step with two kinds', () => {
    expect(refused({ steps: [{ seek: 1, click: '#a' }] })).toContain('step 0');
  });

  it('rejects a document that is not a scenario', () => {
    expect(refused([{ seek: 1 }])).toContain('steps');
    expect(refused({ steps: [], assertions: [{ after: 0, hasclass: 'x' }] })).toContain(
      'assertion 0'
    );
  });

  it('after must name a snapshot label or an index in range', () => {
    const steps = [{ snapshot: 'start' }, { wait: 10 }];
    expect(
      accepted({ steps, assertions: [{ after: 1, timeline: 'main' }] }).assertions
    ).toHaveLength(1);
    for (const after of [2, -1, 'missing']) {
      const message = refused({ steps, assertions: [{ after, timeline: 'main' }] });
      expect(message).toContain('assertion 0');
      expect(message).toContain(JSON.stringify(after));
    }
    const relative = refused({ steps, assertions: [{ after: 1, position: { sameAs: 'nope' } }] });
    expect(relative).toContain('"nope"');
  });

  it('selector must be #<id>', () => {
    for (const selector of ['.cls', '#a .b', 'div']) {
      const message = refused({
        steps: [{ wait: 1 }],
        assertions: [{ after: 0, selector, visible: true }],
      });
      expect(message).toContain(JSON.stringify(selector));
      expect(message).toContain('assertions address layout ids');
    }
  });

  it('an element field without a selector is rejected', () => {
    for (const field of [
      { hasClass: 'a' },
      { notHasClass: 'a' },
      { text: 'a' },
      { visible: true },
      { controllers: [] },
    ]) {
      const message = refused({ steps: [{ wait: 1 }], assertions: [{ after: 0, ...field }] });
      expect(message).toContain(Object.keys(field)[0]);
      expect(message).toContain('selector');
    }
  });

  it('#activeTimelineActions is rejected', () => {
    const message = refused({
      steps: [{ wait: 1 }],
      assertions: [{ after: 0, selector: '#activeTimelineActions', visible: true }],
    });
    expect(message).toContain('activeTimelineActions');
    expect(message).toContain('reserved');
  });

  it('rejects domEquals with a selector', () => {
    for (const domEquals of [{ freshAt: 0 }, { linearAt: 12 }]) {
      const message = refused({
        steps: [{ wait: 1 }],
        assertions: [{ after: 0, selector: '#box', domEquals }],
      });
      expect(message).toContain('assertion 0');
      expect(message).toContain('domEquals');
      expect(message).toContain('takes no selector');
    }
  });

  it('rejects textPrefixOf without a selector', () => {
    const message = refused({
      steps: [{ wait: 1 }],
      assertions: [{ after: 0, textPrefixOf: 'The quick brown fox' }],
    });
    expect(message).toContain('assertion 0');
    expect(message).toContain('textPrefixOf');
    expect(message).toContain('selector');
  });

  it('accepts domEquals { freshAt } and { linearAt } without a selector', () => {
    const scenario = {
      steps: [{ seek: 15 }, { click: '#restart' }, { click: '#skip' }],
      assertions: [
        { after: 1, domEquals: { freshAt: 0 } },
        { after: 2, domEquals: { linearAt: 12 } },
        { after: 0, selector: '#sentence', textPrefixOf: 'The quick brown fox' },
      ],
    };
    expect(accepted(scenario)).toEqual(scenario);
    expect(refused({ steps: [], assertions: [{ after: 0, domEquals: { atTime: 1 } }] })).toContain(
      'assertion 0'
    );
  });
});

/** The scenario fixtures (T021): one directory per case, each with a main.eligian. */
const FIXTURES = path.join(__dirname, '__fixtures__', 'mcp', 'scenario');
const fixture = (name: string) => path.join(FIXTURES, name, 'main.eligian');

/** Smoke one fixture in-process with a scenario (json format: no streaming). */
const play = (name: string, scenario: Scenario): Promise<SmokeResult> =>
  smokeFile(fixture(name), { format: 'json', strict: false, cwd: FIXTURES, scenario });

const element = (step: ScenarioStepResult, id: string) => step.snapshot[id] as ElementSnapshot;
const stepOf = (result: SmokeResult, index: number): ScenarioStepResult => {
  const step = result.steps?.[index];
  if (!step) throw new Error(`no step ${index}: ${JSON.stringify(result)}`);
  return step;
};

describe('scenario', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('click toggles a class (hasClass)', async () => {
    const result = await play(
      'click-toggle',
      accepted({
        steps: [{ snapshot: 'before' }, { click: '#btn' }, { snapshot: 'clicked' }],
        assertions: [
          { after: 'before', selector: '#box', notHasClass: 'on' },
          { after: 'clicked', selector: '#box', hasClass: 'on' },
        ],
      })
    );
    expect(result.problems).toEqual([]);
    expect(result.steps).toHaveLength(3);
    expect(element(stepOf(result, 0), 'box').classes).not.toContain('on');
    expect(element(stepOf(result, 1), 'box').classes).toContain('on');
    expect(stepOf(result, 2).label).toBe('clicked');
  });

  it('key changes the timeline', async () => {
    const result = await play(
      'deck',
      accepted({
        steps: [{ snapshot: 'start' }, { key: 'ArrowRight' }],
        assertions: [
          { after: 'start', timeline: 'slide1' },
          { after: 1, timeline: 'slide2' },
        ],
      })
    );
    expect(result.problems).toEqual([]);
    expect(stepOf(result, 0).timeline).toBe('slide1');
    expect(stepOf(result, 1).timeline).toBe('slide2');
  });

  it('navigate: timeline equals the target and position 0', async () => {
    const result = await play(
      'deck',
      accepted({
        steps: [{ seek: 3 }, { navigate: 'slide2' }],
        assertions: [{ after: 1, timeline: 'slide2', position: 0 }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(stepOf(result, 1).timeline).toBe('slide2');
    expect(stepOf(result, 1).position).toBeLessThanOrEqual(POSITION_TOLERANCE_S);
  });

  it('seek: position = s within POSITION_TOLERANCE_S', async () => {
    const result = await play(
      'headline',
      accepted({
        steps: [{ seek: 1.5 }],
        assertions: [{ after: 0, position: 1.5, selector: '#headline', hasClass: 'in' }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(Math.abs(stepOf(result, 0).position - 1.5)).toBeLessThanOrEqual(POSITION_TOLERANCE_S);
  });

  it('wait: position greaterThan the previous step', async () => {
    const result = await play(
      'click-toggle',
      accepted({
        steps: [{ snapshot: 'a' }, { wait: 300 }],
        assertions: [{ after: 1, position: { greaterThan: 'a' } }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(stepOf(result, 1).position).toBeGreaterThan(stepOf(result, 0).position);
  });

  it('a snapshot label is addressable by after', async () => {
    const result = await play(
      'click-toggle',
      accepted({
        steps: [{ click: '#btn' }, { snapshot: 'here' }, { click: '#btn' }],
        assertions: [
          { after: 'here', selector: '#box', hasClass: 'on' },
          { after: 2, selector: '#box', notHasClass: 'on' },
        ],
      })
    );
    expect(result.problems).toEqual([]);
    expect(stepOf(result, 1)).toMatchObject({
      index: 1,
      step: { snapshot: 'here' },
      label: 'here',
    });
  });

  it('wrong assertion: expected/actual, exit 1', async () => {
    const scenario = accepted({
      steps: [{ click: '#btn' }, { snapshot: 'clicked' }],
      assertions: [{ after: 'clicked', selector: '#box', hasClass: 'wrong' }],
    });
    const outcome = await runSmoke([fixture('click-toggle')], {
      format: 'json',
      strict: false,
      cwd: FIXTURES,
      scenario,
    });
    expect(outcome.exitCode).toBe(1);
    const [file] = JSON.parse(outcome.output) as { problems: Record<string, unknown>[] }[];
    expect(file.problems).toHaveLength(1);
    const [problem] = file.problems;
    expect(problem).toMatchObject({
      code: 'scenario-assertion-failed',
      severity: 'error',
      step: 1,
    });
    expect(JSON.parse(problem.expected as string)).toBe('wrong');
    expect(JSON.parse(problem.actual as string)).toEqual(['on']);
    expect(problem.message).toContain('clicked');
    expect(problem.message).toContain('#box');
    expect(problem.message).toContain('hasClass');
  });

  it('class-driven visible against injected CSS', async () => {
    const result = await play(
      'headline',
      accepted({
        steps: [{ snapshot: 'start' }, { seek: 1.5 }, { snapshot: 'shown' }],
        assertions: [
          { after: 'start', selector: '#headline', visible: false },
          { after: 'shown', selector: '#headline', visible: true },
        ],
      })
    );
    expect(result.problems).toEqual([]);
    expect(element(stepOf(result, 0), 'headline')).toMatchObject({
      classes: ['hidden'],
      visible: false,
    });
    expect(element(stepOf(result, 2), 'headline').visible).toBe(true);
    // The injected styles are removed after the scenario
    const window = await smokeWindow();
    expect(window.document.querySelectorAll('style[data-eligian-smoke]')).toHaveLength(0);
  });

  it('selector not found / unknown timeline: one problem each', async () => {
    const missing = await play(
      'click-toggle',
      accepted({ steps: [{ wait: 1 }, { click: '#nope' }] })
    );
    expect(missing.problems).toEqual([
      expect.objectContaining({ code: 'scenario-selector-not-found', severity: 'error', step: 1 }),
    ]);
    expect(missing.steps).toHaveLength(2);

    const unknown = await play('deck', accepted({ steps: [{ navigate: 'nope' }] }));
    expect(unknown.problems).toEqual([
      expect.objectContaining({ code: 'scenario-unknown-timeline', severity: 'error', step: 0 }),
    ]);
    expect(unknown.problems[0].message).toContain('slide2');
    expect(stepOf(unknown, 0).timeline).toBe('slide1');
  });

  it('a scenario navigates to a media timeline', async () => {
    const result = await play(
      'raf-plus-media',
      accepted({
        steps: [{ navigate: 'film' }, { snapshot: 'after' }],
        assertions: [{ after: 'after', timeline: 'film' }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(result.problems.map(p => p.code)).not.toContain('scenario-media-timeline');
    expect(stepOf(result, 0).timeline).toBe('film');
    expect(stepOf(result, 1).timeline).toBe('film');
  });

  it('a media-only program plays its scenario', async () => {
    const result = await play('media-only', accepted({ steps: [{ wait: 10 }, { snapshot: 's' }] }));
    expect(result.problems).toEqual([]);
    expect(result.steps).toHaveLength(2);
    expect(stepOf(result, 1)).toMatchObject({ label: 's', timeline: 'film' });
  });

  it('key target order', async () => {
    const window = await smokeWindow();
    const targets: string[] = [];
    const record = (event: Event) => {
      const target = event.target as Element | Document;
      targets.push(target === window.document ? 'document' : `#${(target as Element).id}`);
    };
    window.document.addEventListener('keydown', record, true);
    try {
      // 1. the `in` element (of two element-scoped controllers, only #b's runs)
      const inElement = await play(
        'key-in',
        accepted({
          steps: [{ key: 'x', in: '#b' }],
          assertions: [
            { after: 0, selector: '#b', hasClass: 'on' },
            { after: 0, selector: '#a', notHasClass: 'on' },
          ],
        })
      );
      expect(inElement.problems).toEqual([]);
      expect(targets).toEqual(['#b']);

      // 2. without `in`: the element the KeyboardController is attached to (element scope:
      // a press sent to the document would not reach it)
      targets.length = 0;
      const controller = await play(
        'key-controller',
        accepted({
          steps: [{ key: 'x' }],
          assertions: [{ after: 0, selector: '#panel', hasClass: 'on' }],
        })
      );
      expect(controller.problems).toEqual([]);
      expect(targets).toEqual(['#panel']);

      // 3. no KeyboardController: the document
      targets.length = 0;
      const document = await play('key-document', accepted({ steps: [{ key: 'x' }] }));
      expect(document.problems).toEqual([]);
      expect(targets).toEqual(['document']);
    } finally {
      window.document.removeEventListener('keydown', record, true);
    }
  });

  it('visible false via hidden and via ancestor display none', async () => {
    const hidden = await play(
      'hidden-attr',
      accepted({
        steps: [{ snapshot: 's' }],
        assertions: [
          { after: 's', selector: '#note', visible: false },
          { after: 's', selector: '#shown', visible: true },
        ],
      })
    );
    expect(hidden.problems).toEqual([]);
    expect(element(stepOf(hidden, 0), 'note')).toMatchObject({ exists: true, visible: false });

    const ancestor = await play(
      'ancestor-none',
      accepted({
        steps: [{ snapshot: 's' }],
        assertions: [
          { after: 's', selector: '#inner', visible: false },
          { after: 's', selector: '#stage', visible: true },
        ],
      })
    );
    expect(ancestor.problems).toEqual([]);
    expect(element(stepOf(ancestor, 0), 'inner')).toMatchObject({ exists: true, visible: false });
  });

  it('removed element: exists false and visible false at the next step', async () => {
    const result = await play(
      'remove-element',
      accepted({
        steps: [{ snapshot: 'start' }, { seek: 1.5 }],
        assertions: [
          { after: 'start', selector: '#gone', visible: true },
          { after: 1, selector: '#gone', visible: false },
        ],
      })
    );
    expect(result.problems).toEqual([]);
    expect(element(stepOf(result, 0), 'gone')).toMatchObject({ exists: true, visible: true });
    expect(element(stepOf(result, 1), 'gone')).toEqual({
      exists: false,
      classes: [],
      text: '',
      style: '',
      visible: false,
      controllers: [],
    });
    expect(element(stepOf(result, 1), 'keep').exists).toBe(true);
  });

  it('pause, wait 300, play: sameAs then greaterThan', async () => {
    const result = await play(
      'pause-play',
      accepted({
        steps: [
          { click: '#pause' },
          { snapshot: 'paused' },
          { wait: 300 },
          { snapshot: 'waited' },
          { click: '#play' },
          { wait: 300 },
          { snapshot: 'played' },
        ],
        assertions: [
          { after: 'waited', position: { sameAs: 'paused' } },
          { after: 'played', position: { greaterThan: 'waited' } },
        ],
      })
    );
    expect(result.problems).toEqual([]);
  });

  it('snapshot shape', async () => {
    const long = await play('long-text', accepted({ steps: [{ snapshot: 's' }] }));
    expect(long.problems).toEqual([]);
    const text = element(stepOf(long, 0), 'long').text;
    expect(text).toHaveLength(200);
    expect(text).toBe('0123456789'.repeat(20));

    const result = await play(
      'listener',
      accepted({
        steps: [{ snapshot: 's' }],
        assertions: [{ after: 's', selector: '#btn', controllers: ['DOMEventListenerController'] }],
      })
    );
    expect(result.problems).toEqual([]);
    const step = stepOf(result, 0);
    // Flat: one key per layout id, plus activeTimelineActions
    expect(Object.keys(step.snapshot).sort()).toEqual(
      ['activeTimelineActions', 'box', 'btn', 'stage'].sort()
    );
    expect(element(step, 'btn')).toEqual({
      exists: true,
      classes: [],
      text: 'Go',
      style: '',
      visible: true,
      controllers: ['DOMEventListenerController'],
    });
    // The map's name of the running event (0s..30s); the open-ended on enter is not running
    expect(step.snapshot.activeTimelineActions).toEqual(['timeline-action-0-30']);
    expect(step).toMatchObject({ index: 0, step: { snapshot: 's' }, label: 's', timeline: 'main' });
  });

  it('#not-in-layout: one scenario-selector-not-found', async () => {
    const result = await play(
      'click-toggle',
      accepted({
        steps: [{ snapshot: 's' }],
        assertions: [{ after: 's', selector: '#not-in-layout', visible: true }],
      })
    );
    expect(result.problems).toEqual([
      expect.objectContaining({ code: 'scenario-selector-not-found', severity: 'error', step: 0 }),
    ]);
    expect(result.problems[0].message).toContain('#not-in-layout');
  });

  it('the walk keeps cssFiles: []', async () => {
    const { EngineFactory } = await loadEligius();
    const createEngine = vi.spyOn(EngineFactory.prototype, 'createEngine');
    const result = await play('headline', accepted({ steps: [{ snapshot: 's' }] }));
    expect(result.problems).toEqual([]);
    // The walk's engine, then the scenario's: neither loads the CSS files itself
    expect(createEngine).toHaveBeenCalledTimes(2);
    for (const [configuration] of createEngine.mock.calls) {
      expect(configuration.cssFiles).toEqual([]);
    }
  });

  it('steps go to the listener as they happen (ndjson)', async () => {
    const lines: string[] = [];
    await smokeFile(fixture('click-toggle'), {
      format: 'ndjson',
      strict: false,
      cwd: FIXTURES,
      scenario: accepted({ steps: [{ wait: 1 }, { snapshot: 's' }] }),
      writeLine: line => void lines.push(line),
    });
    const steps = lines.map(line => JSON.parse(line)).filter(line => line.type === 'step');
    expect(steps.map(step => step.index)).toEqual([0, 1]);
    expect(steps[1]).toMatchObject({ label: 's', timeline: 'main' });
  });
});

describe('--scenario', () => {
  const BIN = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-scenario-cli-'));
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const clickScenario = accepted({
    steps: [{ click: '#btn' }, { snapshot: 'clicked' }],
    assertions: [{ after: 'clicked', selector: '#box', hasClass: 'on' }],
  });

  /** Run the built CLI to its exit: stdout, stderr and the exit code. */
  const cli = (args: readonly string[]) =>
    new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, ...args], { cwd: FIXTURES });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf-8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf-8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', exitCode => resolve({ stdout, stderr, exitCode }));
    });

  /** A scenario file in the temp dir, holding `json`. */
  const scenarioFile = (name: string, json: unknown): string => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, JSON.stringify(json));
    return file;
  };

  it('two program files: exit 2, nothing played', async () => {
    const { EngineFactory } = await loadEligius();
    const createEngine = vi.spyOn(EngineFactory.prototype, 'createEngine');
    const outcome = await runSmoke([fixture('click-toggle'), fixture('headline')], {
      format: 'json',
      strict: false,
      cwd: FIXTURES,
      scenario: clickScenario,
    });
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain('--scenario applies to one program file');
    expect(outcome.output).toContain('click-toggle/main.eligian');
    expect(outcome.output).toContain('headline/main.eligian');
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('one program + a library runs', async () => {
    const library = path.join(tmp, 'helpers.eligian');
    fs.writeFileSync(library, 'library helpers\naction noop() [ selectElement("#a") ]\n');
    const outcome = await runSmoke([fixture('click-toggle'), library], {
      format: 'json',
      strict: false,
      cwd: FIXTURES,
      scenario: clickScenario,
    });
    expect(outcome.exitCode).toBe(0);
    const files = JSON.parse(outcome.output) as {
      file: string;
      library?: boolean;
      problems: unknown[];
      timelines: unknown[];
    }[];
    expect(files).toHaveLength(2);
    const [program] = files.filter(f => !f.library);
    expect(program).toMatchObject({ file: 'click-toggle/main.eligian', problems: [] });
    expect(program.timelines).toHaveLength(1);
    expect(files.filter(f => f.library)).toHaveLength(1);
  });

  it('json has no steps key with a scenario', async () => {
    const outcome = await runSmoke([fixture('click-toggle')], {
      format: 'json',
      strict: false,
      cwd: FIXTURES,
      scenario: clickScenario,
    });
    expect(outcome.exitCode).toBe(0);
    const [file] = JSON.parse(outcome.output) as Record<string, unknown>[];
    expect(file).not.toHaveProperty('steps');
    expect(file).toMatchObject({ file: 'click-toggle/main.eligian', problems: [] });
  });

  describe('spawned', () => {
    beforeAll(() => requireFreshBundle());

    it('assertion rules: each exit 2 with nothing played', async () => {
      const cases: [string, unknown, string][] = [
        [
          'class-selector.json',
          {
            steps: [{ snapshot: 's' }],
            assertions: [{ after: 's', selector: '.cls', visible: true }],
          },
          'selector ".cls" is not one id',
        ],
        [
          'unknown-label.json',
          { steps: [{ snapshot: 's' }], assertions: [{ after: 'nope', timeline: 'main' }] },
          'after "nope" is neither a snapshot label',
        ],
        [
          'no-selector.json',
          { steps: [{ snapshot: 's' }], assertions: [{ after: 's', hasClass: 'on' }] },
          'hasClass reads an element and needs a selector',
        ],
      ];
      for (const [name, json, message] of cases) {
        const result = await cli([
          'smoke',
          fixture('click-toggle'),
          '--scenario',
          scenarioFile(name, json),
        ]);
        expect(result.exitCode, name).toBe(2);
        expect(result.stdout, name).toBe('');
        expect(result.stderr, name).toContain(message);
      }
    });

    it('missing scenario file: stderr message, exit 2', async () => {
      const missing = path.join(tmp, 'missing.json');
      const result = await cli(['smoke', fixture('click-toggle'), '--scenario', missing]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(missing);
    });

    it('a scenario file that is not JSON: stderr message, exit 2', async () => {
      const file = path.join(tmp, 'broken.json');
      fs.writeFileSync(file, '{ "steps": [');
      const result = await cli(['smoke', fixture('click-toggle'), '--scenario', file]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(file);
    });

    it('two program files on the CLI: exit 2, both named on stderr', async () => {
      const result = await cli([
        'smoke',
        'click-toggle/main.eligian',
        'headline/main.eligian',
        '--scenario',
        scenarioFile('snapshot.json', { steps: [{ snapshot: 's' }] }),
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('click-toggle/main.eligian');
      expect(result.stderr).toContain('headline/main.eligian');
    });
  });
});

describe('textPrefixOf', () => {
  /** The typewriter fixture: #sentence grows "The" → "The quick" → … → SENTENCE over 4 s. */
  const TYPEWRITER = path.join(FIXTURES, 'typewriter', 'main.eligian');
  const SENTENCE = 'The quick brown fox';

  /** Seek to `seconds`, then assert `textPrefixOf: full` on #sentence. */
  const prefixAt = async (seconds: number, full: string): Promise<SmokeResult> => {
    const { config, map } = await compileFile(TYPEWRITER);
    const scenario = accepted({
      steps: [{ seek: seconds }],
      assertions: [{ after: 0, selector: '#sentence', textPrefixOf: full }],
    });
    return smokeConfig(config, map, { scenario, sourceDir: path.dirname(TYPEWRITER) });
  };

  /** Exactly one scenario-assertion-failed: expected the full string, actual the element text. */
  const expectOneFailure = (result: SmokeResult, full: string, text: string) => {
    expect(result.problems).toHaveLength(1);
    const [problem] = result.problems;
    expect(problem).toMatchObject({
      code: 'scenario-assertion-failed',
      severity: 'error',
      step: 0,
    });
    expect(JSON.parse(problem.expected as string)).toBe(full);
    expect(JSON.parse(problem.actual as string)).toBe(text);
    expect(problem.message).toContain('textPrefixOf');
  };

  it('passes on a proper prefix', async () => {
    const result = await prefixAt(2.5, SENTENCE);
    expect(result.problems).toEqual([]);
    expect(element(stepOf(result, 0), 'sentence').text).toBe('The quick');
  });

  it('fails on the full string', async () => {
    const result = await prefixAt(4.5, SENTENCE);
    expectOneFailure(result, SENTENCE, SENTENCE);
  });

  it('fails on the empty string', async () => {
    const result = await prefixAt(0.5, SENTENCE);
    expectOneFailure(result, SENTENCE, '');
  });

  it('fails on a non-prefix', async () => {
    const result = await prefixAt(2.5, 'A quick brown fox');
    expectOneFailure(result, 'A quick brown fox', 'The quick');
  });
});

describe('domEquals', () => {
  /**
   * Run `scenario` on a fixture in-process; `engines` counts the reference engines `domEquals`
   * builds (the test-only `onReferenceEngine` hook, as smoke-determinism.spec.ts counts them).
   */
  const replay = async (name: string, scenario: Scenario) => {
    const file = fixture(name);
    const { config, map } = await compileFile(file);
    let engines = 0;
    const result = await smokeConfig(config, map, {
      scenario,
      sourceDir: path.dirname(file),
      onReferenceEngine: () => {
        engines++;
      },
    });
    return { ...result, engines };
  };

  /** Played to 15 s (the "seen" range is active), then #restart is clicked. */
  const RESTART = accepted({
    steps: [{ seek: 15 }, { snapshot: 'late' }, { click: '#restart' }, { snapshot: 'restarted' }],
    assertions: [{ after: 'restarted', domEquals: { freshAt: 0 } }],
  });

  it('freshAt passes after a resetting restart', async () => {
    const result = await replay('replay-good', RESTART);
    expect(result.problems).toEqual([]);
    // The negative control: before the restart the DOM is not the fresh one
    expect(element(stepOf(result, 1), 'box').classes).toContain('seen');
    expect(element(stepOf(result, 3), 'box').classes).toEqual([]);
    expect(result.engines).toBe(1);
  });

  it('fails on a leftover class, naming element and property', async () => {
    const result = await replay('replay-leftover', RESTART);
    expect(result.problems).toHaveLength(1);
    const [problem] = result.problems;
    expect(problem).toMatchObject({
      code: 'scenario-assertion-failed',
      severity: 'error',
      step: 3,
    });
    expect(JSON.parse(problem.expected as string)).toEqual([]);
    expect(JSON.parse(problem.actual as string)).toEqual(['seen']);
    expect(problem.message).toContain('domEquals');
    expect(problem.message).toContain('#box');
    expect(problem.message).toContain('classes');
  });

  it('linearAt passes after a seek to t from linear play', async () => {
    const result = await replay(
      'replay-good',
      accepted({
        steps: [{ seek: 12 }, { snapshot: 'at-12' }],
        assertions: [{ after: 'at-12', domEquals: { linearAt: 12 } }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(element(stepOf(result, 1), 'box').classes).toEqual(['seen']);
    expect(result.engines).toBe(1);
  });

  it('linearAt fails where the seek path differs from linear play', async () => {
    const result = await replay(
      'seek-path',
      accepted({
        steps: [{ seek: 12 }, { snapshot: 'at-12' }],
        assertions: [{ after: 'at-12', domEquals: { linearAt: 12 } }],
      })
    );
    expect(result.problems).toHaveLength(1);
    const [problem] = result.problems;
    expect(problem).toMatchObject({ code: 'scenario-assertion-failed', step: 1 });
    // Linear play passed 2s..4s, which adds "visited" and never removes it; the seek skipped it
    expect(JSON.parse(problem.expected as string)).toEqual(['visited']);
    expect(JSON.parse(problem.actual as string)).toEqual([]);
    expect(problem.message).toContain('#box');
    expect(problem.message).toContain('classes');
  });

  it('a scenario without domEquals builds no second engine', async () => {
    const result = await replay(
      'replay-leftover',
      accepted({
        steps: [{ seek: 15 }, { click: '#restart' }, { snapshot: 'restarted' }],
        assertions: [{ after: 'restarted', selector: '#box', hasClass: 'seen' }],
      })
    );
    expect(result.problems).toEqual([]);
    expect(result.engines).toBe(0);
  });
});
