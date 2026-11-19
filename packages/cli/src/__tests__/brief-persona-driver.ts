/**
 * Spec 059 Phase 1 (SC-002; plan "Persona fixtures"): the persona driver of the brief interview.
 * Not a spec: the shared helper of the persona round trips (`brief-file.spec.ts`) and the persona
 * interviews (`mcp-brief-interview.spec.ts`), so the driver is written once. A `step` answers one
 * round (in process through the engine, or through the `eligian_brief` tool); the driver decides
 * what the persona says.
 *
 * The rules (plan "Persona fixtures"):
 * 1. One value, or a sequence: `{ value }` is sent every time its id is asked; `{ values }` has a
 *    per-id cursor and repeats its last entry once exhausted.
 * 2. An asked id with no entry throws, naming it.
 * 3. When answering round `n` (the n-th round the driver receives, 1-based), the `afterRound: n`
 *    script entries are merged into that call: an entry whose id is also asked replaces that
 *    id's value instead of adding a second entry, and does not advance its cursor.
 * 4. `sent` holds the last value actually sent for each id.
 * The driver stops at `state === 'complete'` with an empty round; after `cap` rounds (20) it
 * throws, naming the last round's ids.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnswerInput, BriefStateName, Counts } from '../mcp/brief/engine.js';
import type { Shape } from '../mcp/brief/tree.js';

/** One answer of a persona: the value in the canonical wire form (FR-005). */
export interface PersonaValue {
  readonly value: unknown;
  readonly delegated?: boolean;
}

/** A persona fixture (`__fixtures__/mcp/brief/personas/<name>.json`). */
export interface Persona {
  readonly idea: string;
  readonly answers: Readonly<
    Record<string, PersonaValue | { readonly values: readonly PersonaValue[] }>
  >;
  readonly script: readonly {
    readonly afterRound: number;
    readonly answers: readonly (PersonaValue & { readonly id: string })[];
  }[];
}

export type PersonaName = 'terse' | 'detailed' | 'vague';

const PERSONAS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'mcp',
  'brief',
  'personas'
);

export function loadPersona(name: PersonaName): Persona {
  return JSON.parse(fs.readFileSync(path.join(PERSONAS, `${name}.json`), 'utf8')) as Persona;
}

/** One round item as the driver reads it (a subset of the engine's `RoundItem`). */
export interface StepItem {
  readonly id: string;
  readonly previous?: unknown;
  readonly reason?: string;
  readonly ask: string;
  readonly shape: Shape;
  readonly docs: readonly string[];
  readonly facts: readonly string[];
}

/** What one `status` / `answer` call returns, as the driver reads it. */
export interface Step {
  readonly state: BriefStateName;
  readonly round: readonly StepItem[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  readonly counts: Counts;
}

export interface PersonaRun {
  /** Every round the driver answered, in order. */
  readonly rounds: readonly Step['round'][];
  /** The last value actually sent for each id (rule 4). */
  readonly sent: Map<string, unknown>;
  /** The step that ended the run: `complete` with an empty round. */
  readonly final: Step;
}

const DEFAULT_CAP = 20;

const toInput = (id: string, answer: PersonaValue): AnswerInput =>
  answer.delegated === true
    ? { id, value: answer.value, delegated: true }
    : { id, value: answer.value };

/**
 * Drives one persona to `complete`: `start` gives the first round (a `status` with the idea), and
 * `step` sends one call's answers and returns the next round.
 */
export async function runPersona(
  persona: Persona,
  step: (answers: AnswerInput[]) => Promise<Step>,
  start: () => Promise<Step>,
  options: { readonly cap?: number } = {}
): Promise<PersonaRun> {
  const cap = options.cap ?? DEFAULT_CAP;
  const cursors = new Map<string, number>();
  const sent = new Map<string, unknown>();
  const rounds: Step['round'][] = [];

  const valueOf = (id: string): PersonaValue => {
    // `Object.hasOwn` is ES2022; the repo `lib` is ES2020.
    const entry = Object.keys(persona.answers).includes(id) ? persona.answers[id] : undefined;
    if (entry === undefined) {
      throw new Error(`the persona has no answer for ${id} (round ${rounds.length})`);
    }
    if (!('values' in entry)) return entry;
    if (entry.values.length === 0) throw new Error(`the persona's values for ${id} are empty`);
    const at = cursors.get(id) ?? 0;
    cursors.set(id, at + 1);
    return entry.values[Math.min(at, entry.values.length - 1)];
  };

  let current = await start();
  for (;;) {
    if (current.round.length === 0) {
      if (current.state === 'complete') return { rounds, sent, final: current };
      throw new Error(`the ${current.state} brief has an empty round`);
    }
    if (rounds.length >= cap) {
      throw new Error(
        `no complete brief after ${cap} rounds; the last round asked ${current.round
          .map(i => i.id)
          .join(', ')}`
      );
    }
    rounds.push(current.round);
    const n = rounds.length;
    const scripted = new Map<string, PersonaValue>();
    for (const entry of persona.script) {
      if (entry.afterRound !== n) continue;
      for (const { id, ...answer } of entry.answers) scripted.set(id, answer);
    }
    const call: AnswerInput[] = current.round.map(item => {
      const replaced = scripted.get(item.id);
      return toInput(item.id, replaced ?? valueOf(item.id));
    });
    for (const [id, answer] of scripted) {
      if (!call.some(a => a.id === id)) call.push(toInput(id, answer));
    }
    for (const answer of call) sent.set(answer.id, answer.value);
    current = await step(call);
  }
}
