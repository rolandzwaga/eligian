/**
 * Spec 058 Phase 0 (FR-010, FR-010a, FR-012): the Eligius runtime claims that
 * `examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md` states, each probed on the
 * INSTALLED eligius in jsdom. Every probe is compiled by the real compiler and
 * observes the operationData through the probe host module's `recordBag`
 * (`__fixtures__/runtime-claims/probe-host.ts`).
 *
 * A file of its own: `dom-environment.ts` installs the jsdom globals for the
 * rest of the process. Eligius is imported only from the `eligius` package
 * (through `loadEligius()`, after the window exists).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileWithMap, type EligianMap, type HostModule } from '@eligian/language';
import { Effect } from 'effect';
import type { IEligiusEngine, IEngineConfiguration } from 'eligius';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadHostModule } from '../dev/host-module.js';
import { loadEligius, smokeWindow } from '../smoke/dom-environment.js';
import { smokeConfig } from '../smoke/smoke-runner.js';
import type { Recorded } from './__fixtures__/runtime-claims/probe-host.js';

/** The probed claims; each title occurs verbatim in ELIGIUS_EXECUTION_MODEL.md. */
const CLAIMS = [
  'start and end blocks are independent runs, each starting from an empty operationData',
  "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back",
  'a seek ends the active actions that no longer cover the position and starts the inactive ones that do',
  'a forward jump past a range runs neither its start nor its end operations',
  'a controller attached in on enter survives a timeline switch unless on leave removes it',
  '@@loopLength is the length of the collection minus one',
  'an operation that returns undefined hands the next operation an empty operationData',
  'on enter and on leave blocks start from an empty operationData',
  'an event action starts with only eventArgs',
  "a listener action starts with the listener's actionOperationData plus eventTarget, and eventKey for keys",
  'a plain action call runs the start operations only',
  "switchTimeline ends the leaving timeline's active actions, so its on leave runs",
  'on leave does not run when the content ends',
  'a switch to the timeline that is already current is a no-op',
  'the first timeline starts on the first position update (start or seek), not at init',
  // Phase 2 (FR-071): the claims of timing-models, runtime-quirks and runtime-state-pitfalls
  'wait takes milliseconds, while the times of a range are timeline seconds',
  'animate takes its duration in milliseconds',
  'a wait in flight is not cancelled by a pause, a seek or a timeline switch',
  'a listener action runs outside the timeline, so its operations after a wait run after a switch to another timeline',
  "a when condition treats the strings 'false' and '0' as true",
  'an == comparison against a property chain that does not resolve is strict, so it is false even against null',
  '! binds tighter than ==, so !a == b compares (!a) with b',
  "addController hands the controller the block's operationData itself, not a copy",
  'during playback the starts run in position order, whatever the order of the events in the source',
  'a raf timeline advances in 100 ms ticks, so starts less than a tick apart run in the same tick',
  'a custom timeline plays on the same 100 ms ticks as a raf timeline',
  'a selectElement that matches no element raises no engine error, and the operations after it change nothing',
] as const;

const FIXTURES = fileURLToPath(new URL('./__fixtures__/runtime-claims/', import.meta.url));
const SOURCE_PATH = path.join(FIXTURES, 'probe.eligian');
const EXECUTION_MODEL = fileURLToPath(
  new URL('../../../../examples/eligian-tour/ELIGIUS_EXECUTION_MODEL.md', import.meta.url)
);

const HEADER = `layout "./layout.html"
styles "./styles.css"
extensions "./probe-host.ts" {
  operation recordBag(label: string, value)
  operation returnUndefined()
}
`;

interface CompiledProbe {
  readonly config: IEngineConfiguration;
  readonly map: EligianMap;
  readonly host?: HostModule;
}

/** Compile a probe as `compileFile` does (compile-file.ts:333-342), from the fixture directory. */
async function compileProbe(body: string): Promise<CompiledProbe> {
  const { config, map, host } = await Effect.runPromise(
    compileWithMap(HEADER + body, { sourceUri: SOURCE_PATH })
  );
  return {
    config,
    map: { ...map, source: SOURCE_PATH },
    ...(host
      ? { host: { ...host, path: path.resolve(path.dirname(SOURCE_PATH), host.path) } }
      : {}),
  };
}

/** The engine for a probe, created as `smokeConfig` does (smoke-runner.ts:80-118). */
async function startEngine(compiled: CompiledProbe): Promise<{
  engine: IEligiusEngine;
  window: Window & typeof globalThis;
  errors: unknown[];
}> {
  const { EngineFactory, EligiusResourceImporter } = await loadEligius();
  const window = await smokeWindow();
  window.document.body.innerHTML = '<div id="probe-root"></div>';
  let registrations = {};
  if (compiled.host) {
    const loaded = await loadHostModule(compiled.host);
    expect(loaded.missing).toEqual([]);
    registrations = loaded.registrations;
  }
  const { engine } = new EngineFactory(new EligiusResourceImporter(registrations), window, {
    input: { playToggle: false, resize: false },
  }).createEngine({
    ...compiled.config,
    containerSelector: '#probe-root',
    cssFiles: [],
  } as IEngineConfiguration);
  const errors: unknown[] = [];
  engine.on('error', error => errors.push(error));
  return { engine, window, errors };
}

/** Compile, create the engine, drive it; no engine error; always destroyed. */
async function probe(
  body: string,
  drive: (engine: IEligiusEngine, window: Window & typeof globalThis) => Promise<void>
): Promise<void> {
  const { engine, window, errors } = await startEngine(await compileProbe(body));
  try {
    await drive(engine, window);
    expect(errors).toEqual([]);
  } finally {
    await engine.destroy();
  }
}

/**
 * Compile and play a probe with `eligian smoke`'s seek-every-boundary run; the problems are
 * exactly `expectedCodes` (none by default).
 */
async function smokeProbe(body: string, expectedCodes: readonly string[] = []): Promise<void> {
  const { config, map, host } = await compileProbe(body);
  const result = await smokeConfig(config, map, host ? { host } : {});
  expect(result.problems.map(problem => problem.code)).toEqual(expectedCodes);
}

type ProbeGlobal = { __eligianProbe?: Recorded[] };

const recorded = (): readonly Recorded[] => (globalThis as ProbeGlobal).__eligianProbe ?? [];
const clearLog = () => {
  (globalThis as ProbeGlobal).__eligianProbe = [];
};
const labels = () => recorded().map(entry => entry.label);
const entry = (label: string) => recorded().find(e => e.label === label);
/** The keys the engine passed, without the `label` and `value` the call itself adds. */
const bagKeys = (e: Recorded | undefined) =>
  e ? e.keys.filter(key => key !== 'label' && key !== 'value') : undefined;

/** Time for the operations a step started to finish (as smoke-runner.ts SETTLE_MS). */
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

/** Two timelines with lifecycle blocks, for the switch probes. */
const TWO_TIMELINES = `timeline "A" in "#stage" using raf {
  on enter [ recordBag("A-enter", 0) ]
  on leave [ recordBag("A-leave", 0) ]
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
timeline "B" in "#stage" using raf {
  on enter [ recordBag("B-enter", 0) ]
  on leave [ recordBag("B-leave", 0) ]
  at 0s..1s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`;

/**
 * Run `drive` under fake timers (FR-010a): the engine's raf, timers and
 * performance clock are vitest's, so playback advances only with the clock.
 * jsdom 30 has no `document.timeline` (risk R4), so animationInterval falls
 * back to the faked `performance.now()`.
 */
async function withFakeTimers(
  window: Window & typeof globalThis,
  drive: () => Promise<void>
): Promise<void> {
  const original = {
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
  };
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
    ],
  });
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  try {
    expect((window.document as { timeline?: unknown }).timeline).toBeUndefined();
    await drive();
  } finally {
    vi.useRealTimers();
    window.requestAnimationFrame = original.requestAnimationFrame;
    window.cancelAnimationFrame = original.cancelAnimationFrame;
  }
}

describe('Eligius runtime claims (installed eligius)', () => {
  beforeEach(() => {
    clearLog();
  });

  test(CLAIMS[0], async () => {
    await smokeProbe(`timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") recordBag("start", 0) ] [ recordBag("end", 0) ]
}
`);
    expect(bagKeys(entry('start'))).toContain('selectedElement');
    expect(bagKeys(entry('end'))).toEqual([]);
  });

  test(CLAIMS[1], async () => {
    await smokeProbe(`action callee(param) [
  recordBag("callee", 0)
  setOperationData({ calleeAdded: 1 })
  recordBag("callee-after-set", 0)
]
timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") callee("x") recordBag("after-call", 0) ] [ recordBag("end", 0) ]
}
`);
    expect(bagKeys(entry('callee'))).toEqual(expect.arrayContaining(['selectedElement', 'param']));
    // The callee really added the key, and it stayed with the callee
    expect(bagKeys(entry('callee-after-set'))).toContain('calleeAdded');
    expect(bagKeys(entry('after-call'))).toContain('selectedElement');
    expect(bagKeys(entry('after-call'))).not.toContain('calleeAdded');
    expect(bagKeys(entry('after-call'))).not.toContain('param');
  });

  test(CLAIMS[2], async () => {
    await probe(
      `timeline "T" in "#stage" using raf {
  at 0s..2s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
  at 3s..5s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(1);
        await settle();
        // Precondition: A is active
        expect(labels()).toContain('A-start');
        clearLog();
        await engine.seek(4);
        await settle();
        const seen = labels();
        expect(seen).toContain('A-end');
        expect(seen).toContain('B-start');
        expect(seen.indexOf('A-end')).toBeLessThan(seen.indexOf('B-start'));
      }
    );
  });

  test(CLAIMS[3], async () => {
    await probe(
      `timeline "T" in "#stage" using raf {
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
  at 2s..3s [ recordBag("C-start", 0) ] [ recordBag("C-end", 0) ]
  at 4s..6s [ recordBag("D-start", 0) ] [ recordBag("D-end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        expect(labels()).toContain('A-start');
        await engine.seek(5);
        await settle();
        // The jump landed: D runs, and C (between 0 and 5) never ran
        expect(labels()).toContain('D-start');
        expect(labels()).not.toContain('C-start');
        expect(labels()).not.toContain('C-end');
      }
    );
  });

  test(CLAIMS[4], async () => {
    const controllerProbe = (leave: string) => `action hit() [ recordBag("hit", 0) ]
timeline "A" in "#stage" using raf {
  on enter [ on click "#btn" run hit() ]
  on leave [ ${leave} ]
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
timeline "B" in "#stage" using raf {
  at 0s..1s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`;
    const clickAfterSwitch = async (engine: IEligiusEngine, window: Window & typeof globalThis) => {
      await engine.init();
      await engine.seek(0);
      await settle();
      await engine.switchTimeline('B', 0);
      await settle();
      expect(engine.currentTimelineUri).toBe('B');
      // Precondition: A's on leave ran
      expect(labels()).toContain('leave-ran');
      const button = window.document.getElementById('btn');
      expect(button).not.toBeNull();
      button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await settle();
    };

    await probe(controllerProbe('recordBag("leave-ran", 0)'), clickAfterSwitch);
    expect(labels()).toContain('hit');

    clearLog();
    await probe(
      controllerProbe(
        'recordBag("leave-ran", 0) selectElement("#btn") removeControllerFromElement("DOMEventListenerController")'
      ),
      clickAfterSwitch
    );
    expect(labels()).not.toContain('hit');
  });

  test(CLAIMS[5], async () => {
    await smokeProbe(`timeline "T" in "#stage" using raf {
  at 0s..1s [ for (item in ["x", "y", "z"]) { recordBag("len", @@loopLength) } ] [ recordBag("end", 0) ]
}
`);
    const lengths = recorded().filter(e => e.label === 'len');
    expect(lengths).toHaveLength(3);
    expect(lengths.every(e => e.value === 2)).toBe(true);
  });

  test(CLAIMS[6], async () => {
    await smokeProbe(
      `timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") recordBag("before", 0) returnUndefined() recordBag("after", 0) ] [ recordBag("end", 0) ]
}
`,
      // FR-033: smoke reports the undefined return once, and the run goes on
      ['host-operation-returned-non-object']
    );
    expect(bagKeys(entry('before'))).toContain('selectedElement');
    expect(bagKeys(entry('after'))).toEqual([]);
  });

  test(CLAIMS[7], async () => {
    await probe(
      `timeline "A" in "#stage" using raf {
  on enter [ recordBag("A-enter", 0) selectElement("#a") recordBag("A-enter-selected", 0) ]
  on leave [ recordBag("A-leave", 0) ]
  at 0s..1s [ selectElement("#a") recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
timeline "B" in "#stage" using raf {
  at 0s..1s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        await engine.switchTimeline('B', 0);
        await settle();
        expect(bagKeys(entry('A-enter'))).toEqual([]);
        expect(bagKeys(entry('A-enter-selected'))).toContain('selectedElement');
        expect(bagKeys(entry('A-leave'))).toEqual([]);
      }
    );
  });

  test(CLAIMS[8], async () => {
    await probe(
      `on event "probe-x" action onX [ recordBag("event", 0) ]
timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") broadcastEvent(["v"], "probe-x") ] [ recordBag("end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        expect(bagKeys(entry('event'))).toEqual(['eventArgs']);
      }
    );
  });

  test(CLAIMS[9], async () => {
    await probe(
      `action onClick(tag) [ recordBag("click", 0) ]
action onKey(tag) [ recordBag("key", 0) ]
timeline "T" in "#stage" using raf {
  on enter [
    setOperationData({ wired: 1 })
    on click "#btn" run onClick("clicked")
    on key "ArrowRight" run onKey("pressed")
  ]
  at 0s..1s [ recordBag("start", 0) ] [ recordBag("end", 0) ]
}
`,
      async (engine, window) => {
        await engine.init();
        await engine.seek(0);
        await settle();
        const button = window.document.getElementById('btn');
        expect(button).not.toBeNull();
        button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        const stage = window.document.getElementById('stage') ?? window.document.body;
        stage.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        );
        stage.dispatchEvent(
          new window.KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })
        );
        await settle();
        const click = bagKeys(entry('click'));
        expect(click).toEqual(expect.arrayContaining(['eventTarget', 'tag']));
        expect(click).not.toContain('eventKey');
        expect(click).not.toContain('wired');
        const key = bagKeys(entry('key'));
        expect(key).toEqual(expect.arrayContaining(['eventTarget', 'eventKey', 'tag']));
        expect(key).not.toContain('wired');
      }
    );
  });

  test(CLAIMS[10], async () => {
    await smokeProbe(`endable action shown() [ recordBag("shown-start", 0) ] [ recordBag("shown-end", 0) ]
timeline "T" in "#stage" using raf {
  at 0s..1s [ shown() ] [ recordBag("range-end", 0) ]
}
`);
    // The range ended (its end block ran), the called action's end never did
    expect(labels()).toContain('shown-start');
    expect(labels()).toContain('range-end');
    expect(labels()).not.toContain('shown-end');
  });

  test(CLAIMS[11], async () => {
    await probe(TWO_TIMELINES, async engine => {
      await engine.init();
      await engine.seek(0);
      await settle();
      // Precondition: A's lifecycle action is active
      expect(labels()).toContain('A-enter');
      clearLog();
      await engine.switchTimeline('B', 0);
      await settle();
      expect(labels()).toContain('A-leave');
    });
  });

  test(CLAIMS[12], async () => {
    await probe(
      `timeline "A" in "#stage" using raf {
  on enter [ recordBag("A-enter", 0) ]
  on leave [ recordBag("A-leave", 0) ]
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
`,
      async (engine, window) => {
        let completed = false;
        engine.on('timelineComplete', () => {
          completed = true;
        });
        await engine.init();
        await withFakeTimers(window, async () => {
          const started = engine.start();
          await vi.advanceTimersByTimeAsync(1500);
          await started;
          expect(completed || engine.position >= (engine.duration ?? Infinity)).toBe(true);
          // The content played: its range started and ended
          expect(labels()).toContain('A-enter');
          expect(labels()).toContain('A-end');
          expect(labels()).not.toContain('A-leave');
        });
      }
    );
  });

  test(CLAIMS[13], async () => {
    await probe(TWO_TIMELINES, async engine => {
      await engine.init();
      await engine.seek(0);
      await settle();
      // Precondition: A's lifecycle action is active, so a real switch would end it
      expect(labels()).toContain('A-enter');
      clearLog();
      await engine.switchTimeline(engine.currentTimelineUri);
      await settle();
      await engine.seek(0);
      await settle();
      expect(labels()).not.toContain('A-leave');
      expect(labels()).not.toContain('A-enter');
    });
  });

  test(CLAIMS[14], async () => {
    await probe(
      `timeline "A" in "#stage" using raf {
  on enter [ recordBag("A-enter", 0) ]
  on leave [ recordBag("A-leave", 0) ]
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
`,
      async (engine, window) => {
        await engine.init();
        await settle();
        expect(labels()).not.toContain('A-enter');
        await withFakeTimers(window, async () => {
          const started = engine.start();
          // Observed (baseline/runtime-claims-disagreements.txt): start() emits the
          // current position itself, so on enter runs before any animation frame
          await vi.advanceTimersByTimeAsync(0);
          expect(labels()).toContain('A-enter');
          expect(engine.position).toBe(0);
          // One tick of the raf position source (100 ms) moves the position on
          await vi.advanceTimersByTimeAsync(150);
          await started;
          expect(engine.position).toBeGreaterThan(0);
          expect(labels().filter(label => label === 'A-enter')).toHaveLength(1);
        });
      }
    );

    // The other first position update: a seek without playback (as `eligian smoke` does)
    clearLog();
    await probe(TWO_TIMELINES, async engine => {
      await engine.init();
      await settle();
      expect(labels()).not.toContain('A-enter');
      await engine.seek(0);
      await settle();
      expect(labels()).toContain('A-enter');
    });
  });

  test(CLAIMS[15], async () => {
    const body = `timeline "T" in "#stage" using raf {
  at 0s..1s [ recordBag("before", 0) wait(300) recordBag("waited", 0) ] [ recordBag("end", 0) ]
}
`;
    // The range is in seconds on the timeline
    const { config } = await compileProbe(body);
    expect(config.timelines[0].timelineActions[0].duration).toEqual({ start: 0, end: 1 });

    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const seeking = engine.seek(0);
        await vi.advanceTimersByTimeAsync(0);
        expect(labels()).toContain('before');
        // The wait is in milliseconds: not done after 250 ms, done after 350 ms
        await vi.advanceTimersByTimeAsync(250);
        expect(labels()).not.toContain('waited');
        await vi.advanceTimersByTimeAsync(100);
        expect(labels()).toContain('waited');
        await seeking;
      });
    });
  });

  test(CLAIMS[16], async () => {
    await probe(
      `timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") animate({ opacity: 0 }, 300) recordBag("animated", 0) ] [ recordBag("end", 0) ]
}
`,
      async (engine, window) => {
        await engine.init();
        const began = performance.now();
        const seeking = engine.seek(0);
        // Real timers: jQuery's animation runs on the window's own clock
        await vi.waitFor(() => expect(labels()).toContain('animated'), {
          timeout: 5000,
          interval: 10,
        });
        const elapsed = performance.now() - began;
        expect(elapsed).toBeGreaterThanOrEqual(250);
        expect(elapsed).toBeLessThan(5000);
        expect(window.document.getElementById('a')?.style.opacity).toBe('0');
        await seeking;
      }
    );
  });

  test(CLAIMS[17], async () => {
    const body = `timeline "A" in "#stage" using raf {
  at 0s..2s [ recordBag("start", 0) wait(500) recordBag("waited", 0) ] [ recordBag("end", 0) ]
  at 4s..5s [ recordBag("later", 0) ] [ recordBag("later-end", 0) ]
}
timeline "B" in "#stage" using raf {
  at 0s..1s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`;
    // A pause during playback
    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const started = engine.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(labels()).toContain('start');
        await engine.pause();
        await vi.advanceTimersByTimeAsync(600);
        await started;
        expect(labels()).toContain('waited');
        expect(labels()).not.toContain('end');
      });
    });

    // A seek past the range: the end waits for the start's wait
    clearLog();
    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const first = engine.seek(0);
        await vi.advanceTimersByTimeAsync(0);
        expect(labels()).toContain('start');
        const second = engine.seek(4.5);
        await vi.advanceTimersByTimeAsync(600);
        await first;
        await second;
        const seen = labels();
        expect(seen).toContain('waited');
        expect(seen).toContain('later');
        expect(seen.indexOf('waited')).toBeLessThan(seen.indexOf('end'));
      });
    });

    // A switch to another timeline
    clearLog();
    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const first = engine.seek(0);
        await vi.advanceTimersByTimeAsync(0);
        expect(labels()).toContain('start');
        const switched = engine.switchTimeline('B', 0);
        await vi.advanceTimersByTimeAsync(600);
        await first;
        await switched;
        expect(engine.currentTimelineUri).toBe('B');
        expect(labels()).toContain('waited');
        expect(labels()).toContain('B-start');
      });
    });
  });

  test(CLAIMS[18], async () => {
    await probe(
      `action flash() [ recordBag("flash-start", 0) wait(3000) recordBag("flash-end", 0) ]
timeline "A" in "#stage" using raf {
  on enter [ on click "#btn" run flash() ]
  on leave [ selectElement("#btn") removeControllerFromElement("DOMEventListenerController") ]
  at 0s..1s [ recordBag("A-start", 0) ] [ recordBag("A-end", 0) ]
}
timeline "B" in "#stage" using raf {
  on enter [ recordBag("B-enter", 0) ]
  at 0s..1s [ recordBag("B-start", 0) ] [ recordBag("B-end", 0) ]
}
`,
      async (engine, window) => {
        await engine.init();
        await withFakeTimers(window, async () => {
          const first = engine.seek(0);
          await vi.advanceTimersByTimeAsync(0);
          await first;
          window.document
            .getElementById('btn')
            ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          await vi.advanceTimersByTimeAsync(0);
          expect(labels()).toContain('flash-start');
          // The switch does not wait for the listener action
          const switched = engine.switchTimeline('B', 0);
          await vi.advanceTimersByTimeAsync(0);
          await switched;
          expect(engine.currentTimelineUri).toBe('B');
          expect(labels()).toContain('B-enter');
          expect(labels()).not.toContain('flash-end');
          await vi.advanceTimersByTimeAsync(3000);
          const seen = labels();
          expect(seen).toContain('flash-end');
          expect(seen.indexOf('B-enter')).toBeLessThan(seen.indexOf('flash-end'));
        });
      }
    );
  });

  test(CLAIMS[19], async () => {
    await probe(
      `action check(v) [ if (v) { recordBag("truthy", v) } ]
timeline "T" in "#stage" using raf {
  at 0s..1s [ check("false") check("0") check(0) check(false) ] [ recordBag("end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        expect(
          recorded()
            .filter(e => e.label === 'truthy')
            .map(e => e.value)
        ).toEqual(['false', '0']);
      }
    );
  });

  test(CLAIMS[20], async () => {
    await probe(
      `timeline "T" in "#stage" using raf {
  at 0s..1s [
    if ($operationdata.missing == null) { recordBag("equal", 0) } else { recordBag("not-equal", 0) }
  ] [ recordBag("end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        expect(labels()).toContain('not-equal');
        expect(labels()).not.toContain('equal');
      }
    );
  });

  test(CLAIMS[21], async () => {
    await probe(
      `action compare(a, b) [ if (!a == b) { recordBag("matched", b) } ]
timeline "T" in "#stage" using raf {
  at 0s..1s [ compare(0, false) compare(0, true) ] [ recordBag("end", 0) ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        // (!0) == false is false and (!0) == true is true; !(0 == false) would be true
        expect(
          recorded()
            .filter(e => e.label === 'matched')
            .map(e => e.value)
        ).toEqual([true]);
      }
    );
  });

  test(CLAIMS[22], async () => {
    await probe(
      `timeline "T" in "#stage" using raf {
  at 0s..1s [
    selectElement("#a")
    addController("ProgressbarController")
    recordBag("added-later", 0)
    getControllerFromElement("ProgressbarController")
    recordBag("seen", $operationdata.controllerInstance.operationData.label)
  ] [ selectElement("#a") removeControllerFromElement("ProgressbarController") ]
}
`,
      async engine => {
        await engine.init();
        await engine.seek(0);
        await settle();
        // A key the block added after addController is in the controller's operationData
        expect(entry('seen')?.value).toBe('added-later');
      }
    );
  });

  test(CLAIMS[23], async () => {
    const body = `timeline "T" in "#stage" using raf {
  at 300ms..1s [ recordBag("late", 0) ] [ recordBag("late-end", 0) ]
  at 100ms..1s [ recordBag("early", 0) ] [ recordBag("early-end", 0) ]
}
`;
    // The config keeps the source order
    const { config } = await compileProbe(body);
    expect(config.timelines[0].timelineActions.map(action => action.duration.start)).toEqual([
      0.3, 0.1,
    ]);
    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const started = engine.start();
        await vi.advanceTimersByTimeAsync(450);
        await started;
        const seen = labels();
        expect(seen).toContain('early');
        expect(seen).toContain('late');
        expect(seen.indexOf('early')).toBeLessThan(seen.indexOf('late'));
      });
    });
  });

  /**
   * Play a 40 ms stagger of three items from 100 ms: after each 100 ms of the clock, the
   * position and the number of items started so far, until the position reaches 0.3.
   */
  const staggerTicks = async (provider: string): Promise<Array<[number, number]>> => {
    clearLog();
    const body = `timeline "T" in "#stage" using ${provider} {
  stagger 40ms ["#a", "#b", "#btn"] at 100ms for 1s [ recordBag("item", 0) ]
}
`;
    const { config } = await compileProbe(body);
    expect(config.timelines[0].type).toBe('animation');
    expect(config.timelines[0].timelineActions.map(action => action.duration.start)).toEqual([
      0.1, 0.14, 0.18,
    ]);
    const samples: Array<[number, number]> = [];
    await probe(body, async (engine, window) => {
      await engine.init();
      await withFakeTimers(window, async () => {
        const started = engine.start();
        await vi.advanceTimersByTimeAsync(0);
        for (let step = 0; step < 10 && engine.position < 0.3; step++) {
          await vi.advanceTimersByTimeAsync(100);
          samples.push([engine.position, labels().filter(label => label === 'item').length]);
        }
        await engine.pause();
        await started;
      });
    });
    return samples;
  };

  test(CLAIMS[24], async () => {
    const samples = await staggerTicks('raf');
    // The position moves in steps of 0.1 s, and never stops at 0.14 or 0.18
    const positions = [...new Set(samples.map(([position]) => position))];
    expect(positions.filter(position => position > 0)).toEqual([0.1, 0.2, 0.3]);
    const startedAt = new Map(samples);
    // 0.1: the first item; 0.2: the items at 0.14 and 0.18 together
    expect(startedAt.get(0.1)).toBe(1);
    expect(startedAt.get(0.2)).toBe(3);
  });

  test(CLAIMS[25], async () => {
    expect(await staggerTicks('custom')).toEqual(await staggerTicks('raf'));
  });

  test(CLAIMS[26], async () => {
    // `.on` is a class of the probe's CSS that no element of its layout carries
    const body = `timeline "T" in "#stage" using raf {
  at 0s..1s [ selectElement(".on") addClass("on") recordBag("after-miss", 0) ] [ selectElement(".on") removeClass("on") ]
}
`;
    await probe(body, async (engine, window) => {
      await engine.init();
      await engine.seek(0);
      await settle();
      expect(labels()).toContain('after-miss');
      expect(window.document.querySelectorAll('.on')).toHaveLength(0);
    });
    clearLog();
    // eligian smoke reports the miss only in strict mode
    const { config, map, host } = await compileProbe(body);
    const relaxed = await smokeConfig(config, map, host ? { host } : {});
    expect(relaxed.problems).toEqual([]);
    expect(labels()).toContain('after-miss');
    clearLog();
    const strict = await smokeConfig(config, map, host ? { host, strict: true } : { strict: true });
    const codes = strict.problems.map(problem => problem.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every(code => code === 'smoke-selector-miss')).toBe(true);
    expect(labels()).toContain('after-miss');
  });

  test('ELIGIUS_EXECUTION_MODEL.md states every probed claim', () => {
    const document = fs.readFileSync(EXECUTION_MODEL, 'utf-8');
    expect(CLAIMS).toHaveLength(27);
    expect(CLAIMS.filter(title => !document.includes(title))).toEqual([]);
  });
});
