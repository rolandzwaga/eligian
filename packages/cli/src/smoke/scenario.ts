/**
 * Smoke scenarios (spec 058 FR-034; plan C2): the steps an agent replays on a fresh engine after
 * the boundary walk, and the assertions checked against their snapshots. This module holds the
 * scenario format, its parser and the runner (`runScenario`, called by `smokeConfig`).
 */
import { activeTimelineActions, type EligianMap } from '@eligian/language';
import { scanLayoutElements } from '@eligian/language/mcp';
import { Result, Schema } from 'effect';
import type { IEligiusEngine, IEngineConfiguration } from 'eligius';
import type { ComparedState, LayoutState } from './determinism.js';
import type { SmokeProblem } from './smoke-runner.js';

/** A non-negative number: seconds for `seek`, milliseconds for `wait`. */
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** One scenario step (FR-034): exactly one kind; `key` may name the element it is sent to. */
export const ScenarioStep = Schema.Union([
  Schema.Struct({ seek: NonNegative }),
  Schema.Struct({ click: Schema.String }),
  Schema.Struct({ key: Schema.String, in: Schema.optionalKey(Schema.String) }),
  Schema.Struct({ navigate: Schema.String }),
  Schema.Struct({ wait: NonNegative }),
  Schema.Struct({ snapshot: Schema.String }),
]);
export type ScenarioStep = typeof ScenarioStep.Type;

/** A step reference: a `snapshot` label of the scenario, or a step index. */
const StepReference = Schema.Union([Schema.String, Schema.Int]);

/** An assertion (FR-034 item 7), evaluated against the snapshot of the step `after` names. */
export const Assertion = Schema.Struct({
  after: StepReference,
  selector: Schema.optionalKey(Schema.String),
  hasClass: Schema.optionalKey(Schema.String),
  notHasClass: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  /** FR-015: the element text is a proper prefix of this string (non-empty, strictly shorter) */
  textPrefixOf: Schema.optionalKey(Schema.String),
  visible: Schema.optionalKey(Schema.Boolean),
  controllers: Schema.optionalKey(Schema.Array(Schema.String)),
  timeline: Schema.optionalKey(Schema.String),
  position: Schema.optionalKey(
    Schema.Union([
      Schema.Finite,
      Schema.Struct({ sameAs: StepReference }),
      Schema.Struct({ greaterThan: StepReference }),
    ])
  ),
  /**
   * FR-015: every layout id equals a fresh engine's state at t, reached by a straight seek
   * (`freshAt`) or by linear play (`linearAt`); evaluated by the smoke runner, not `runScenario`
   */
  domEquals: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ freshAt: Schema.Finite }),
      Schema.Struct({ linearAt: Schema.Finite }),
    ])
  ),
});
export type Assertion = typeof Assertion.Type;

/** A scenario file: `{ steps, assertions? }`. */
export const Scenario = Schema.Struct({
  steps: Schema.Array(ScenarioStep),
  assertions: Schema.optionalKey(Schema.Array(Assertion)),
});
export type Scenario = typeof Scenario.Type;

/** One layout element in a snapshot (plan C2 step 3). */
export interface ElementSnapshot {
  /** false: the id is in the layout but not in the document now */
  readonly exists: boolean;
  readonly classes: readonly string[];
  /** textContent trimmed, at most 200 chars */
  readonly text: string;
  /** the style attribute, '' when absent */
  readonly style: string;
  readonly visible: boolean;
  readonly controllers: readonly string[];
}

/** Flat (FR-034 item 4): one key per layout id, plus `activeTimelineActions` (action names). */
export type Snapshot = Readonly<Record<string, ElementSnapshot | readonly string[]>>;

/** What a step returns (FR-034 item 4). */
export interface ScenarioStepResult {
  readonly index: number;
  readonly step: ScenarioStep;
  /** snapshot steps */
  readonly label?: string;
  /** the active timeline, by source name */
  readonly timeline: string;
  /** seconds */
  readonly position: number;
  readonly snapshot: Snapshot;
}

/** Positions are compared within this many seconds (FR-034 item 7). */
export const POSITION_TOLERANCE_S = 0.1;

/** The snapshot key that is not a layout id (plan C2 step 3). */
const RESERVED_KEY = 'activeTimelineActions';

/** An assertion selector addresses one layout id. */
const LAYOUT_ID_SELECTOR = /^#[A-Za-z_][\w-]*$/;

/** The assertion fields that read an element, and so need a `selector`. */
const ELEMENT_FIELDS = [
  'hasClass',
  'notHasClass',
  'text',
  'textPrefixOf',
  'visible',
  'controllers',
] as const;

const STEP_FORMS =
  '{ "seek": <seconds> }, { "click": "<selector>" }, { "key": "<key>", "in"?: "<selector>" }, ' +
  '{ "navigate": "<timeline>" }, { "wait": <ms> }, { "snapshot": "<label>" }';

/** Unknown keys are refused, so a misspelt field is not silently ignored. */
const STRICT = { onExcessProperty: 'error' } as const;

export type ParsedScenario =
  | { readonly ok: true; readonly scenario: Scenario }
  | { readonly ok: false; readonly message: string };

/** Decode a scenario file's JSON; the failure text is the usage error (CLI exit 2, tool kind io). */
export function parseScenario(json: unknown): ParsedScenario {
  const decoded = Schema.decodeUnknownResult(Scenario)(json, STRICT);
  if (Result.isFailure(decoded))
    return { ok: false, message: decodeFailure(json, decoded.failure) };
  const problem = crossFieldProblem(decoded.success);
  return problem === undefined
    ? { ok: true, scenario: decoded.success }
    : { ok: false, message: `invalid scenario: ${problem}` };
}

/** The failing step or assertion, named, instead of the union's per-member issues. */
function decodeFailure(json: unknown, error: Schema.SchemaError): string {
  if (isRecord(json)) {
    const { steps, assertions } = json;
    if (Array.isArray(steps)) {
      const index = steps.findIndex(step => !isStep(step));
      if (index >= 0) {
        return `invalid scenario: step ${index} ${JSON.stringify(steps[index])} is not a step; expected one of ${STEP_FORMS}`;
      }
    }
    if (Array.isArray(assertions)) {
      for (const [index, assertion] of assertions.entries()) {
        const result = Schema.decodeUnknownResult(Assertion)(assertion, STRICT);
        if (Result.isFailure(result)) {
          return `invalid scenario: assertion ${index} ${JSON.stringify(assertion)}: ${result.failure.message}`;
        }
      }
    }
  }
  return `invalid scenario: expected { "steps": [...], "assertions"?: [...] }: ${error.message}`;
}

const isStep = (input: unknown): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(ScenarioStep)(input, STRICT));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The first cross-field rule an assertion breaks (plan C2 step 4), or undefined. */
function crossFieldProblem(scenario: Scenario): string | undefined {
  const labels = new Set(
    scenario.steps.flatMap(step => ('snapshot' in step ? [step.snapshot] : []))
  );
  const resolves = (reference: string | number): boolean =>
    typeof reference === 'string'
      ? labels.has(reference)
      : reference >= 0 && reference < scenario.steps.length;
  const unresolved = (reference: string | number): string =>
    `${JSON.stringify(reference)} is neither a snapshot label of the scenario nor a step index (0..${scenario.steps.length - 1})`;

  for (const [index, assertion] of (scenario.assertions ?? []).entries()) {
    const at = `assertion ${index}`;
    if (!resolves(assertion.after)) return `${at}: after ${unresolved(assertion.after)}`;
    const position = assertion.position;
    if (typeof position === 'object') {
      const [form, reference] =
        'sameAs' in position
          ? (['sameAs', position.sameAs] as const)
          : (['greaterThan', position.greaterThan] as const);
      if (!resolves(reference)) return `${at}: position.${form} ${unresolved(reference)}`;
    }
    const { selector } = assertion;
    if (selector !== undefined && assertion.domEquals !== undefined) {
      return `${at}: domEquals compares every layout id and takes no selector`;
    }
    if (selector === undefined) {
      const field = ELEMENT_FIELDS.find(name => assertion[name] !== undefined);
      if (field !== undefined) {
        return `${at}: ${field} reads an element and needs a selector "#<id>"`;
      }
    } else if (!LAYOUT_ID_SELECTOR.test(selector)) {
      return `${at}: selector ${JSON.stringify(selector)} is not one id; assertions address layout ids, written "#<id>"`;
    } else if (selector === `#${RESERVED_KEY}`) {
      return `${at}: selector "#${RESERVED_KEY}" is reserved for the snapshot's running actions; assertions address layout ids`;
    }
  }
  return undefined;
}

/** What `runScenario` needs besides the engine (plan C2). */
export interface ScenarioContext {
  /** The whole compiled config: every timeline, media ones included */
  readonly config: IEngineConfiguration;
  readonly map: EligianMap;
  /** Source names by config timeline index */
  readonly names: readonly string[];
  readonly scenario: Scenario;
  /** Runs one step under the step timeout (smoke-step-timeout), then lets it settle */
  readonly step: (what: string, run: () => unknown) => Promise<void>;
  readonly report: (problem: SmokeProblem) => void;
  readonly onStep: (result: ScenarioStepResult) => void;
}

/** The longest snapshot text (FR-034 item 4). */
const TEXT_LIMIT = 200;

/** Eligius' jQuery data key of the controllers attached to an element (plan P6). */
const CONTROLLERS_DATA = 'eligiusEngineControllers';

/**
 * Run a scenario on a fresh engine that is not started yet (plan C2 steps 1–4): `init()`, then
 * `start()`, each step and its snapshot, then the assertions. The caller builds the engine, injects
 * the styles and tears it down.
 */
export async function runScenario(
  engine: IEligiusEngine,
  window: Window & typeof globalThis,
  context: ScenarioContext
): Promise<readonly ScenarioStepResult[]> {
  const { config, names, scenario, step, report } = context;
  const { document } = window;
  // The engine's own jQuery instance (one copy in node_modules, plan P6); loaded after Eligius
  const { default: jQuery } = await import('jquery');
  const controllersOf = (element: Element): string[] =>
    ((jQuery(element).data(CONTROLLERS_DATA) as { name: string }[] | undefined) ?? []).map(
      controller => controller.name
    );
  const layoutIds = [...scanLayoutElements(config.layoutTemplate).ids].filter(
    id => id !== RESERVED_KEY
  );
  const declared = () => names.map(name => `'${name}'`).join(', ');
  const timelineName = () => {
    const index = config.timelines.findIndex(t => t.uri === engine.currentTimelineUri);
    return names[index] ?? engine.currentTimelineUri;
  };

  const snapshot = (): Snapshot => {
    const entries: Record<string, ElementSnapshot | readonly string[]> = {};
    for (const id of layoutIds) entries[id] = elementSnapshot(window, id, controllersOf);
    entries[RESERVED_KEY] = activeTimelineActions(
      context.map,
      engine.currentTimelineUri,
      engine.position
    ).map(action => action.name);
    return entries;
  };

  const select = (selector: string, index: number): Element | undefined => {
    let found: Element | null = null;
    try {
      found = document.querySelector(selector);
    } catch {
      // An invalid selector matches nothing
    }
    if (found) return found;
    report({
      code: 'scenario-selector-not-found',
      severity: 'error',
      step: index,
      message: `step ${index}: selector "${selector}" matches no element`,
    });
    return undefined;
  };

  const perform = async (current: ScenarioStep, index: number): Promise<void> => {
    const what = `scenario step ${index}`;
    if ('seek' in current) {
      await step(`${what}: seek ${current.seek}s`, () => engine.seek(current.seek));
    } else if ('click' in current) {
      const target = select(current.click, index);
      if (target) {
        await step(`${what}: click ${current.click}`, () =>
          target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
        );
      }
    } else if ('key' in current) {
      // The `in` element; else the element a KeyboardController is attached to; else the document
      const target =
        current.in !== undefined
          ? select(current.in, index)
          : ([...document.querySelectorAll('*')].find(element =>
              controllersOf(element).includes('KeyboardController')
            ) ?? document);
      if (target) {
        await step(`${what}: key ${current.key}`, () => {
          for (const type of ['keydown', 'keyup']) {
            target.dispatchEvent(
              new window.KeyboardEvent(type, { key: current.key, bubbles: true, cancelable: true })
            );
          }
        });
      }
    } else if ('navigate' in current) {
      const timeline = config.timelines[names.indexOf(current.navigate)];
      if (!timeline) {
        report({
          code: 'scenario-unknown-timeline',
          severity: 'error',
          step: index,
          message: `${what}: timeline '${current.navigate}' is not declared (declared: ${declared()})`,
        });
      } else {
        await step(`${what}: navigate to '${current.navigate}'`, () =>
          engine.switchTimeline(timeline.uri, 0)
        );
      }
    } else if ('wait' in current) {
      const ms = current.wait;
      await step(`${what}: wait ${ms} ms`, () => new Promise(resolve => setTimeout(resolve, ms)));
    }
    // snapshot: no action; the label is recorded with the result
  };

  await step('scenario init', () => engine.init());
  await step('scenario start', () => engine.start());
  const results: ScenarioStepResult[] = [];
  for (const [index, current] of scenario.steps.entries()) {
    await perform(current, index);
    const result: ScenarioStepResult = {
      index,
      step: current,
      ...('snapshot' in current ? { label: current.snapshot } : {}),
      timeline: timelineName(),
      position: engine.position,
      snapshot: snapshot(),
    };
    results.push(result);
    context.onStep(result);
  }
  checkAssertions(scenario, results, new Set(layoutIds), report);
  return results;
}

/** The snapshot of one layout id (plan C2 step 3); an absent element is `exists: false`. */
export function elementSnapshot(
  window: Window & typeof globalThis,
  id: string,
  controllersOf: (element: Element) => string[]
): ElementSnapshot {
  const element = window.document.getElementById(id);
  if (!element) {
    return { exists: false, classes: [], text: '', style: '', visible: false, controllers: [] };
  }
  return {
    exists: true,
    classes: [...element.classList],
    text: (element.textContent ?? '').trim().slice(0, TEXT_LIMIT),
    style: element.getAttribute('style') ?? '',
    visible: isVisible(window, element),
    controllers: controllersOf(element),
  };
}

/**
 * FR-034 item 5: no `hidden` attribute, and neither the element nor an ancestor computes
 * `display: none`, `visibility: hidden` or `opacity: 0` (opacity does not inherit, plan P5).
 */
function isVisible(window: Window, element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.opacity !== '' && Number(style.opacity) === 0) return false;
  }
  return true;
}

/** FR-034 item 7: each failing field is one scenario-assertion-failed error. */
function checkAssertions(
  scenario: Scenario,
  results: readonly ScenarioStepResult[],
  layoutIds: ReadonlySet<string>,
  report: (problem: SmokeProblem) => void
): void {
  // parseScenario checked every reference: a label of a snapshot step, or an index in range
  const resolve = (reference: string | number): ScenarioStepResult | undefined =>
    typeof reference === 'number'
      ? results[reference]
      : results.find(result => result.label === reference);

  for (const assertion of scenario.assertions ?? []) {
    // domEquals is evaluated by the smoke runner after the scenario engine is gone (plan P6)
    const { after, selector } = assertion;
    const result = resolve(after);
    if (!result) continue;
    const step = result.index;
    const at = `after ${JSON.stringify(after)}${selector !== undefined ? ` on ${selector}` : ''}`;
    const fail = (field: string, expected: unknown, actual: unknown) =>
      report({
        code: 'scenario-assertion-failed',
        severity: 'error',
        step,
        expected: JSON.stringify(expected),
        actual: JSON.stringify(actual),
        message: `assertion ${at}: ${field} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      });

    if (selector !== undefined) {
      const id = selector.slice(1);
      if (!layoutIds.has(id)) {
        report({
          code: 'scenario-selector-not-found',
          severity: 'error',
          step,
          message: `assertion ${at}: ${selector} is not an id of the layout; assertions address layout ids`,
        });
        continue;
      }
      const element = result.snapshot[id] as ElementSnapshot;
      if (assertion.hasClass !== undefined && !element.classes.includes(assertion.hasClass))
        fail('hasClass', assertion.hasClass, element.classes);
      if (assertion.notHasClass !== undefined && element.classes.includes(assertion.notHasClass))
        fail('notHasClass', assertion.notHasClass, element.classes);
      if (assertion.text !== undefined && element.text !== assertion.text)
        fail('text', assertion.text, element.text);
      const full = assertion.textPrefixOf;
      if (full !== undefined && !isProperPrefix(element.text, full))
        fail('textPrefixOf', full, element.text);
      if (assertion.visible !== undefined && element.visible !== assertion.visible)
        fail('visible', assertion.visible, element.visible);
      if (
        assertion.controllers !== undefined &&
        !sameMultiset(assertion.controllers, element.controllers)
      )
        fail('controllers', assertion.controllers, element.controllers);
    }
    if (assertion.timeline !== undefined && result.timeline !== assertion.timeline)
      fail('timeline', assertion.timeline, result.timeline);

    const { position } = assertion;
    if (position === undefined) continue;
    const actual = result.position;
    if (typeof position === 'number') {
      if (Math.abs(actual - position) > POSITION_TOLERANCE_S) fail('position', position, actual);
    } else if ('sameAs' in position) {
      const other = resolve(position.sameAs)?.position;
      if (other !== undefined && Math.abs(actual - other) > POSITION_TOLERANCE_S)
        fail('position', { sameAs: position.sameAs, position: other }, actual);
    } else {
      const other = resolve(position.greaterThan)?.position;
      if (other !== undefined && !(actual > other))
        fail('position', { greaterThan: position.greaterThan, position: other }, actual);
    }
  }
}

/** The reference a `domEquals` assertion compares with (FR-015). */
export type DomEqualsKind = 'fresh' | 'linear';

/** The FR-031 state `domEquals` compares. */
const COMPARED_PROPERTIES = ['classes', 'text', 'style', 'visible'] as const;

/**
 * FR-015 (plan B4, P6): each `domEquals` assertion compares the snapshot of every layout id at its
 * step with the state `reference` gives for the step's timeline at t, reached by a straight seek
 * (`freshAt`) or by linear play (`linearAt`). The smoke runner calls it once the scenario engine
 * is destroyed: a reference engine needs the window. One scenario-assertion-failed per differing
 * (element, property), `expected` the reference value and `actual` the step's.
 */
export async function checkDomEquals(
  scenario: Scenario,
  results: readonly ScenarioStepResult[],
  reference: (timelineName: string, kind: DomEqualsKind, at: number) => Promise<LayoutState>,
  report: (problem: SmokeProblem) => void
): Promise<void> {
  for (const assertion of scenario.assertions ?? []) {
    const { after, domEquals } = assertion;
    if (domEquals === undefined) continue;
    // parseScenario checked the reference: a label of a snapshot step, or an index in range
    const result =
      typeof after === 'number'
        ? results[after]
        : results.find(candidate => candidate.label === after);
    if (!result) continue;
    const [kind, at]: [DomEqualsKind, number] =
      'freshAt' in domEquals ? ['fresh', domEquals.freshAt] : ['linear', domEquals.linearAt];
    const path = kind === 'fresh' ? 'a fresh engine seeked' : 'linear play';
    const expected = await reference(result.timeline, kind, at);
    for (const [id, state] of Object.entries(expected)) {
      const element = result.snapshot[id] as ElementSnapshot | undefined;
      if (element === undefined) continue;
      for (const property of COMPARED_PROPERTIES) {
        const [want, got] = [state[property], element[property]];
        if (sameValue(want, got)) continue;
        report({
          code: 'scenario-assertion-failed',
          severity: 'error',
          step: result.index,
          expected: JSON.stringify(want),
          actual: JSON.stringify(got),
          message: `assertion after ${JSON.stringify(after)}: domEquals ${JSON.stringify(domEquals)}: element #${id} ${property} expected ${JSON.stringify(want)} (${path} to ${at}s in '${result.timeline}'), got ${JSON.stringify(got)}`,
        });
      }
    }
  }
}

/** Classes compare as a set (their order is not state); the other properties by value. */
function sameValue(
  a: ComparedState[keyof ComparedState],
  b: ComparedState[keyof ComparedState]
): boolean {
  return Array.isArray(a) && Array.isArray(b) ? sameMultiset(a, b) : a === b;
}

/** FR-015: non-empty, strictly shorter, and a prefix of `full`. */
function isProperPrefix(text: string, full: string): boolean {
  return text !== '' && text.length < full.length && full.startsWith(text);
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  const sorted = (values: readonly string[]) => JSON.stringify([...values].sort());
  return sorted(a) === sorted(b);
}
