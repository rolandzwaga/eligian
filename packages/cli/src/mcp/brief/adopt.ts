/**
 * Spec 059 Phase 2 (FR-041 to FR-048, readings R-9, R-10, R-11; plan §9): what adoption reads from
 * an existing program, and the conflicts between those facts and the user's answers.
 *
 * - `readCodeFacts`: one section under the compiler lock. `withLoadedDocuments` loads the program
 *   (and its libraries) for the AST facts, which works on a program that does not compile; then
 *   `compileFile` gives each timeline's duration (a rejection leaves them out). The AST is walked
 *   without importing `langium` (the CLI does not depend on it): a generic walk over the own,
 *   non-`$` properties of `$type`-tagged objects. A timeline's interactions are those in its body
 *   and in every action its body calls, transitively (R-9, through `calledAction`), so an
 *   interaction inside an action counts for each timeline that calls it.
 * - `factAnswers`: the facts as `by: code` answers in the tree's canonical shapes (FR-042).
 * - `conflictsOf`: the three fact/answer rules of FR-046 (R-11) over an evaluation.
 *
 * The only brief module that imports `@eligian/language` (plan P1).
 */
import path from 'node:path';
import { hostModuleOf, type Program, withLoadedDocuments } from '@eligian/language';
import {
  calledAction,
  type navigatesTo,
  timelineNamed,
  timelineNames,
} from '@eligian/language/mcp';
import { Effect } from 'effect';
import { compileFile } from '../../compile-file.js';
import { CompilerLock } from '../compiler-lock.js';
import { type ToolError, ToolInternal, toToolError } from '../errors.js';
import type { Answer, Evaluation, Instance } from './engine.js';
import { type AnswerValue, TREE } from './tree.js';

export interface CodeFacts {
  /** R3: the program's path from the project root, forward slashes. */
  readonly program: string;
  /** S2: the timeline names in program order. */
  readonly views: readonly string[];
  /** S4: one row per `navigate` interaction a timeline reaches. */
  readonly navigation: readonly { view: string; target: string; trigger: string }[];
  /** S6: one row per timeline; `source` is `-` when the timeline has none. */
  readonly providers: readonly { view: string; provider: string; source: string }[];
  /** L1: absent when the program has no `languages` block. */
  readonly languages?: readonly { code: string; default: 'yes' | 'no' }[];
  /** I1: the play, pause, toggle, stop and seek interactions, as `<view>: <text>`. */
  readonly transport: readonly string[];
  /** I2: one row per distinct `key` interaction. */
  readonly keys: readonly { key: string; action: string }[];
  /** H1: the declared host names; absent when there is no `extensions` block. */
  readonly host?: readonly string[];
  /** V3 (media), V6 (reactions), V5 (seconds: the compiled duration; absent when not compiled). */
  readonly perView: ReadonlyMap<
    string,
    { media?: string; reactions: readonly string[]; seconds?: number }
  >;
  /** V3 of the entry view: the named asset imports. */
  readonly entryImports: readonly { file: string; kind: 'image' | 'other' }[];
  /** FR-047: the timeline names outside the S2 name rule. */
  readonly badNames: readonly string[];
}

export interface Conflict {
  readonly ids: readonly string[];
  readonly message: string;
}

type Interaction = ReturnType<typeof navigatesTo>[number];
type OperationCall = Parameters<typeof calledAction>[0];
type Timeline = NonNullable<ReturnType<typeof timelineNamed>>;
type Statement = Program['statements'][number];
type NamedImport = Extract<Statement, { readonly $type: 'NamedImport' }>;

interface AstObject {
  readonly $type: string;
  readonly [key: string]: unknown;
}

const isAst = (value: unknown): value is AstObject =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { readonly $type?: unknown }).$type === 'string';

/** The child nodes of `node`: its own non-`$` properties holding AST objects. */
function childrenOf(node: AstObject): AstObject[] {
  const children: AstObject[] = [];
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (isAst(item)) children.push(item);
    } else if (isAst(value)) {
      children.push(value);
    }
  }
  return children;
}

/** The interactions in `root` and in every action it calls, transitively (R-9), each once. */
function reachedInteractions(root: AstObject): Interaction[] {
  const found: Interaction[] = [];
  const visitedActions = new Set<unknown>();
  const visit = (node: AstObject): void => {
    if (node.$type === 'InteractionStatement') found.push(node as unknown as Interaction);
    if (node.$type === 'OperationCall') {
      const action = calledAction(node as unknown as OperationCall);
      if (action !== undefined && !visitedActions.has(action)) {
        visitedActions.add(action);
        visit(action as unknown as AstObject);
      }
    }
    for (const child of childrenOf(node)) visit(child);
  };
  visit(root);
  return found;
}

/** A node's source text on one line. */
const sourceText = (node: { readonly $cstNode?: { readonly text: string } } | undefined): string =>
  node?.$cstNode?.text.replace(/\s+/g, ' ').trim() ?? '';

const quoted = (text: string | undefined): string => JSON.stringify(text ?? '');

/** S4's trigger: `click <selector>`, `<event> <selector>` or `key <keys>`. */
const triggerOf = (s: Interaction): string =>
  s.keys !== undefined ? `key ${s.keys}` : `${s.event ?? ''} ${s.selector ?? ''}`;

/** I2's action: `<verb> <target or position or call>`. */
function actionOf(s: Interaction): string {
  switch (s.verb) {
    case 'navigate':
      return `navigate ${s.target ?? ''}${s.position ? ` at ${sourceText(s.position)}` : ''}`;
    case 'seek':
      return `seek ${sourceText(s.position)}`;
    case 'run':
      return `run ${sourceText(s.call)}`;
    default:
      return s.verb;
  }
}

/** The interaction as Eligian text (I1, V6). */
function interactionText(s: Interaction): string {
  const on =
    s.keys !== undefined
      ? `key ${quoted(s.keys)}${s.selector === undefined ? '' : ` in ${quoted(s.selector)}`}`
      : `${s.event ?? ''} ${quoted(s.selector)}`;
  const verb =
    s.verb === 'navigate'
      ? `navigate ${quoted(s.target)}${s.position ? ` at ${sourceText(s.position)}` : ''}`
      : actionOf(s);
  return `on ${on} ${verb}`;
}

const TRANSPORT_VERBS: readonly string[] = ['play', 'pause', 'toggle', 'stop', 'seek'];
const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

const posixPath = (text: string): string => text.replace(/\\/g, '/');

/** FR-047's S2 name rule, through the tree's own S2 check on a one-row table. */
const S2_CHECK = TREE.find(q => q.id === 'S2')?.check;
const isViewName = (name: string): boolean =>
  S2_CHECK === undefined || S2_CHECK([{ name, purpose: '-' }]) === undefined;

/** The facts of the loaded program, except the durations. */
function astFacts(program: Program, file: string, root: string): CodeFacts {
  const views = timelineNames(program);
  const timelines = views
    .map(name => timelineNamed(program, name))
    .filter((timeline): timeline is Timeline => timeline !== undefined);
  const navigation: { view: string; target: string; trigger: string }[] = [];
  const providers: { view: string; provider: string; source: string }[] = [];
  const transport: string[] = [];
  const keys: { key: string; action: string }[] = [];
  const perView = new Map<string, { media?: string; reactions: readonly string[] }>();

  for (const timeline of timelines) {
    const view = timeline.name;
    const source = timeline.source === undefined ? undefined : posixPath(timeline.source);
    providers.push({ view, provider: timeline.provider, source: source ?? '-' });
    const reactions: string[] = [];
    for (const s of reachedInteractions(timeline as unknown as AstObject)) {
      if (s.verb === 'navigate' && s.target !== undefined) {
        navigation.push({ view, target: s.target, trigger: triggerOf(s) });
      }
      if (TRANSPORT_VERBS.includes(s.verb)) {
        const line = `${view}: ${interactionText(s)}`;
        if (!transport.includes(line)) transport.push(line);
      }
      if (s.keys !== undefined) {
        const row = { key: s.keys, action: actionOf(s) };
        if (!keys.some(k => k.key === row.key && k.action === row.action)) keys.push(row);
      } else {
        reactions.push(interactionText(s));
      }
    }
    const media =
      (timeline.provider === 'video' || timeline.provider === 'audio') && source !== undefined
        ? source
        : undefined;
    perView.set(view, { ...(media === undefined ? {} : { media }), reactions });
  }

  const entries = program.languages?.entries ?? [];
  const host = hostModuleOf(program);
  const entryImports = program.statements
    .filter((statement): statement is NamedImport => statement.$type === 'NamedImport')
    .map(named => ({
      file: posixPath(named.path),
      kind: IMAGE_EXTENSIONS.includes(path.extname(named.path).toLowerCase())
        ? ('image' as const)
        : ('other' as const),
    }));

  return {
    program: posixPath(path.relative(root, file)),
    views,
    navigation,
    providers,
    ...(entries.length === 0
      ? {}
      : {
          languages: entries.map(entry => ({
            code: entry.code,
            default: entry.isDefault ? ('yes' as const) : ('no' as const),
          })),
        }),
    transport,
    keys,
    ...(host === undefined
      ? {}
      : { host: [...host.operations, ...host.controllers, ...host.functions] }),
    perView,
    entryImports,
    badNames: views.filter(name => !isViewName(name)),
  };
}

/**
 * The code facts of `file` (FR-042), in one section of the compiler lock: the AST facts from the
 * loaded documents, then the compiled durations (none when the program does not compile).
 */
export const readCodeFacts = (
  file: string,
  root: string,
  requestId: string
): Effect.Effect<CodeFacts, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const lock = yield* CompilerLock;
    const absolute = path.resolve(file);
    return yield* lock.run(
      requestId,
      Effect.gen(function* () {
        let unreadable: unknown;
        const facts = yield* Effect.tryPromise({
          try: () =>
            withLoadedDocuments(
              [absolute],
              loaded => {
                const document = loaded.documentOf(absolute);
                return document === undefined
                  ? undefined
                  : astFacts(document.parseResult.value as Program, absolute, root);
              },
              (missing, error) => {
                if (path.resolve(missing) === absolute) unreadable = error;
              }
            ),
          catch: cause =>
            new ToolInternal({
              message: `reading the code facts of ${absolute} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              path: absolute,
            }),
        });
        if (facts === undefined) {
          return yield* toToolError('read', absolute)(unreadable);
        }
        const compiled = yield* Effect.tryPromise(() =>
          compileFile(absolute, { optimize: true })
        ).pipe(Effect.orElseSucceed(() => undefined));
        if (compiled === undefined) return facts;
        const perView = new Map(
          facts.views.map((view, index) => {
            const seconds = compiled.config.timelines[index]?.duration;
            const entry = facts.perView.get(view) ?? { reactions: [] };
            return [view, seconds === undefined ? entry : { ...entry, seconds }] as const;
          })
        );
        return { ...facts, perView };
      })
    );
  });

/** V5's duration cell: seconds greater than 0 in the cell form, or `undefined`. */
function durationCell(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const cell = String(Math.round(seconds * 1000) / 1000);
  return /^\d+(\.\d+)?$/.test(cell) && Number(cell) > 0 ? cell : undefined;
}

/** The facts as `by: code` answers (FR-042), each with `round`. */
export function factAnswers(facts: CodeFacts, round: number): readonly Answer[] {
  const answers: Answer[] = [];
  const add = (id: string, value: AnswerValue) => answers.push({ id, value, by: 'code', round });

  add(
    'S2',
    facts.views.map(name => ({ name, purpose: '-' }))
  );
  if (facts.views.length > 1) add('S3', facts.views[0]);
  if (facts.navigation.length > 0)
    add(
      'S4',
      facts.navigation.map(row => ({ ...row }))
    );
  add(
    'S6',
    facts.providers.map(row => ({ ...row }))
  );
  if (facts.languages !== undefined)
    add(
      'L1',
      facts.languages.map(row => ({ ...row }))
    );
  add('I1', facts.transport.length > 0 ? facts.transport.join('\n') : 'none');
  if (facts.keys.length > 0)
    add(
      'I2',
      facts.keys.map(row => ({ ...row }))
    );
  add(
    'H1',
    facts.host === undefined
      ? 'none'
      : [
          {
            need: 'other',
            detail: facts.host.length > 0 ? facts.host.join(', ') : 'the extensions block',
          },
        ]
  );
  add('R3', facts.program);

  facts.views.forEach((view, index) => {
    const entry = facts.perView.get(view);
    const provider = facts.providers.find(row => row.view === view)?.provider ?? 'raf';
    const elements = [
      ...(entry?.media === undefined
        ? []
        : [{ element: provider, kind: provider, file: entry.media }]),
      ...(index === 0
        ? facts.entryImports.map(named => ({
            element: named.file,
            kind: named.kind,
            file: named.file,
          }))
        : []),
    ];
    const duration = durationCell(entry?.seconds);
    const reactions = entry?.reactions ?? [];
    add(`V2:${view}`, `in the code: ${facts.program}`);
    add(`V3:${view}`, elements.length > 0 ? elements : 'none');
    add(
      `V5:${view}`,
      duration === undefined
        ? { duration: 'none', pacing: 'none', 'cues-from': '-' }
        : { duration, pacing: 'fixed', 'cues-from': '-' }
    );
    add(`V6:${view}`, reactions.length > 0 ? reactions.join('\n') : 'none');
  });
  return answers;
}

// ---------------------------------------------------------------------------------------------
// Conflicts (FR-046, R-11): a fact and a user's answer that disagree. Conflicts never block.

type Row = Readonly<Record<string, string>>;

const rowsOf = (value: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(value)
    ? (value as readonly unknown[]).filter(
        (row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row)
      )
    : [];

const isRemote = (text: string | undefined): boolean =>
  text !== undefined && /^https?:\/\//.test(text);

/** The recorded fact of an instance (`by: code`), also when it is dormant (P12). */
const factOf = (instance: Instance): AnswerValue | undefined =>
  instance.answer?.by === 'code' ? instance.answer.value : undefined;

/** The conflicts of an evaluation (FR-046): each with the ids of both sides, user's first. */
export function conflictsOf(evaluation: Evaluation): readonly Conflict[] {
  const byId = new Map(evaluation.instances.map(instance => [instance.id, instance]));
  const userAnswer = (id: string): AnswerValue | undefined => {
    const answer = byId.get(id)?.answer;
    return answer === undefined || answer.by === 'code' ? undefined : answer.value;
  };
  const facts = (template: string) =>
    evaluation.instances.flatMap(instance => {
      const value = instance.question.id === template ? factOf(instance) : undefined;
      return value === undefined ? [] : [{ id: instance.id, value }];
    });
  const conflicts: Conflict[] = [];

  const c3 = userAnswer('C3');
  if (Array.isArray(c3)) {
    const inputs = c3 as readonly unknown[];
    const keyFacts = facts('I2').filter(fact => rowsOf(fact.value).length > 0);
    if (!inputs.includes('keyboard') && keyFacts.length > 0) {
      conflicts.push({
        ids: ['C3', ...keyFacts.map(fact => fact.id)],
        message:
          'C3 has no keyboard, but the code binds keys (I2): add keyboard to C3, or remove the on key interactions from the code and call with scope adopt again',
      });
    }
    const pointerFacts = [
      ...facts('S4').filter(fact =>
        rowsOf(fact.value).some(row => !(row.trigger ?? '').startsWith('key '))
      ),
      ...facts('V6').filter(fact => typeof fact.value === 'string' && fact.value !== 'none'),
    ];
    if (!inputs.includes('mouse') && !inputs.includes('touch') && pointerFacts.length > 0) {
      const ids = pointerFacts.map(fact => fact.id);
      conflicts.push({
        ids: ['C3', ...ids],
        message: `C3 has neither mouse nor touch, but the code reacts to clicks or other pointer events (${ids.join(', ')}): add mouse or touch to C3, or change those interactions in the code and call with scope adopt again`,
      });
    }
  }

  if (userAnswer('C5') === 'offline') {
    const remoteFacts = [
      ...facts('S6').filter(fact => rowsOf(fact.value).some(row => isRemote(row.source))),
      ...facts('V3').filter(fact => rowsOf(fact.value).some(row => isRemote(row.file))),
    ];
    if (remoteFacts.length > 0) {
      const ids = remoteFacts.map(fact => fact.id);
      conflicts.push({
        ids: ['C5', ...ids],
        message: `C5 is offline, but the code plays media from an http(s) URL (${ids.join(', ')}): answer C5 online, or move the media into the project and call with scope adopt again`,
      });
    }
  }
  return conflicts;
}
