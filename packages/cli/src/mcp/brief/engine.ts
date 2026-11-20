/**
 * The brief engine (spec 059 FR-007 to FR-018, FR-022, FR-023, FR-039, FR-040; plan §3): pure
 * functions over a question tree, a brief and the looked-up facts.
 *
 * - `evaluate`: one walk over a topological order of the effective template graph (needs ∪ reads,
 *   FR-003; ties by tree order). Branch V expands into one copy per S2 view (FR-010); each
 *   applies-when rule gets an `AnswerView` restricted to its `reads` (FR-008); an answer to a
 *   question that does not apply is dormant (FR-040); an own answer is re-validated (FR-039) and
 *   is stale by a prerequisite's later round or a changed view basis (FR-016); a `same as` copy is
 *   settled only where its source is (FR-014); the asset list (FR-012) is recomputed from the
 *   settled values; counts, the delegated list, the digest (FR-022) and the state (FR-023) follow.
 *   Tree versions (FR-018) take two passes (P11): with a confirmation, first without the questions
 *   newer than the brief's version; when that digest does not match, against the full tree.
 * - `applyAnswers`: one `answer` call (FR-007, FR-015): duplicates, dependency order, status,
 *   shape (`validateValue`), cross-references (`crossCheck`, `references.ts`), no-op, `by` only,
 *   and the review of a stale answer kept as it is (`reviewed`, the round kept).
 * - `confirm`, `approve`: the signed confirmation and approval lines of an evaluation (Phase 2
 *   FR-024, FR-027). The HMAC comes in as `Facts.signer` and as the `signer` argument (Phase 2
 *   P4), so the engine stays pure; with no signer nothing verifies.
 * - `nextRound`, `viewBasis`, `canonicalAnswers`, `digest`, `textDirection`: the small rules the
 *   tool and the file use.
 *
 * Pure: no `node:fs`, no `effect`. Existence and containment come only from `Facts` (P16).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { posix } from 'node:path';
import { type CrossContext, crossCheck, SAME_AS_VALUE } from './references.js';
import type { CanonicalAnswers, SignaturePayload, Signer } from './signature.js';
import {
  ALWAYS,
  type AnswerValue,
  type AnswerView,
  type AssetEntry,
  effectivePrerequisites,
  type Question,
  type Shape,
  TREE_VERSION,
} from './tree.js';
import { expectedForm, validateValue } from './values.js';

/** `code`: a fact read from the program by adoption (Phase 2 FR-042, P12), never via `answer`. */
export type By = 'user' | 'delegated' | 'code';

export interface Answer {
  readonly id: string;
  readonly value: AnswerValue;
  readonly by: By;
  readonly round: number;
  readonly reviewed?: number;
  readonly basis?: string;
}

/** The signed confirmation line (Phase 2 FR-024). */
export interface Confirmation {
  readonly mode: 'elicitation' | 'agent-reported';
  /** ISO-8601 UTC. */
  readonly at: string;
  /** The watermark n (FR-026); absent on a Phase 1 `sha256:` line, which never verifies. */
  readonly round?: number;
  /** `hmac-sha256:<64 hex>`, or a Phase 1 line's `sha256:<64 hex>` (round-tripped verbatim). */
  readonly hmac: string;
  /** `agent-reported` only: the user's reply verbatim. */
  readonly message?: string;
}

/** The signed approval line (Phase 2 FR-024); its payload holds the confirmation's HMAC. */
export interface Approval {
  readonly mode: 'elicitation' | 'agent-reported' | 'existing-storyboard';
  /** ISO-8601 UTC. */
  readonly at: string;
  /** `hmac-sha256:<64 hex>`. */
  readonly hmac: string;
  /** `agent-reported` only. */
  readonly message?: string;
}

/** What an addition adds (Phase 2 FR-036). */
export type AdditionKind = 'view' | 'language' | 'host-module';

/** One `## Addition: …` section of `BRIEF.md` (Phase 2 FR-035). */
export interface AdditionState {
  readonly kind: AdditionKind;
  /** The view name or language code; `''` for a host module. */
  readonly name: string;
  /** `Addition: view Outro`: the section of its signed lines (FR-038). */
  readonly heading: string;
  readonly confirmation?: Confirmation;
  readonly approval?: Approval;
  readonly answers: readonly Answer[];
}

export interface BriefState {
  readonly idea?: string;
  readonly treeVersion: number;
  /** `adopt`: the brief of an adopted presentation (Phase 2 FR-041). */
  readonly scope?: 'adopt';
  readonly confirmation?: Confirmation;
  readonly approval?: Approval;
  readonly answers: readonly Answer[];
  /** The addition sections in creation order (Phase 2 FR-035); absent means none. */
  readonly additions?: readonly AdditionState[];
}

export interface Facts {
  /** Posix, relative to the project root, `.` at the root. */
  readonly briefDir: string;
  /** A file exists at that path (relative to the brief's directory). */
  readonly exists: (fromBrief: string) => boolean;
  /** The path resolves under the project root. */
  readonly inside: (fromBrief: string) => boolean;
  /** The HMAC over the key (Phase 2 P4); absent when there is no key, so nothing verifies. */
  readonly signer?: Signer;
  /** The HMAC section: `brief` (the default) or an addition's heading (Phase 2 FR-024). */
  readonly section?: string;
  /** Phase 2 P11: when set, branch V expands over exactly these names instead of S2's. */
  readonly views?: readonly string[];
}

export type BriefStateName = 'open' | 'complete' | 'confirmed' | 'approved';

/** Whether a signed line verifies (Phase 2 FR-025): absent, verifies, or does not. */
export type SignatureStatus = 'none' | 'valid' | 'invalid';

export type InstanceStatus = 'answered' | 'open' | 'stale' | 'waiting' | 'not-applicable';

export interface Instance {
  /** `P1`, `V3:intro`, `V:signup`; before S2, the V template copy is `V1` … `V6`. */
  readonly id: string;
  /** The template (`V:<name>`: the synthetic `SAME_AS` question). */
  readonly question: Question;
  /** The title shown for this instance: a V copy's is prefixed `<name>: ` (FR-010). */
  readonly title: string;
  readonly view?: string;
  readonly status: InstanceStatus;
  /** An answer is recorded for a question that does not apply (FR-040). */
  readonly dormant: boolean;
  /** The own recorded answer. */
  readonly answer?: Answer;
  /** The effective value: the own answer's, or the `same as` source's. */
  readonly value?: AnswerValue;
  /** The effective round, for dependents' staleness. */
  readonly round: number;
  /** Stale only. */
  readonly previous?: AnswerValue;
  /** FR-039 only. */
  readonly reason?: string;
  /** False for `V:<name>` (P13). */
  readonly counted: boolean;
  /** The ids of the instances this one depends on (the instance graph, FR-017). */
  readonly dependsOn: readonly string[];
}

export interface Counts {
  readonly answered: number;
  readonly delegated: number;
  readonly open: number;
  readonly waiting: number;
  readonly notApplicable: number;
  /**
   * Phase 2 FR-045: the answered instances settled by a fact (`by: code`), also in `answered`.
   * Present only when there is one, so a brief without facts has Phase 1's counts.
   */
  readonly fromCode?: number;
}

export interface Evaluation {
  readonly state: BriefStateName;
  /** In evaluation order. */
  readonly instances: readonly Instance[];
  /** The open and stale instances, in evaluation order. */
  readonly frontier: readonly Instance[];
  readonly counts: Counts;
  readonly delegated: readonly {
    readonly id: string;
    readonly title: string;
    readonly value: AnswerValue;
  }[];
  readonly assets: readonly AssetEntry[];
  readonly views: readonly string[];
  /** FR-022 over the recorded answers of the applicable, non-dormant instances. */
  readonly digest: string;
  /** The list `digest` hashes and the signed lines sign (Phase 2 FR-024). */
  readonly canonical: CanonicalAnswers;
  readonly confirmationStatus: SignatureStatus;
  readonly approvalStatus: SignatureStatus;
  /**
   * Phase 2 FR-026: with a present, invalid confirmation that has a watermark, the recorded
   * applicable answers whose `round` or `reviewed` is above it; `[]` otherwise.
   */
  readonly changed: readonly {
    readonly id: string;
    readonly title: string;
    readonly value: AnswerValue;
  }[];
}

export type RejectionReason =
  | 'unknown-question'
  | 'duplicate'
  | 'waiting'
  | 'not-applicable'
  | 'invalid-value'
  | 'invalid-reference'
  /** Phase 2 FR-045: the id is settled by a fact read from the code. */
  | 'fact';

export interface Rejection {
  readonly id: string;
  readonly reason: RejectionReason;
  readonly message: string;
}

export interface AnswerInput {
  readonly id: string;
  readonly value: unknown;
  readonly delegated?: boolean;
}

export interface RoundItem {
  readonly id: string;
  readonly title: string;
  readonly ask: string;
  readonly shape: Shape;
  readonly docs: readonly string[];
  readonly facts: readonly string[];
  readonly previous?: AnswerValue;
  readonly reason?: string;
}

export const EMPTY_BRIEF: BriefState = { treeVersion: TREE_VERSION, answers: [], additions: [] };

/**
 * The synthetic question of a `V:<name>` answer (`same as <other>`, FR-014): branch V of `<name>`
 * uses `<other>`'s answers. Like the V templates it needs S2 and S6.
 */
export const SAME_AS: Question = {
  id: 'V',
  branch: 'V',
  title: 'same as',
  ask: "Answer this view's whole branch with another view's answers: same as <view>.",
  shape: { kind: 'text' },
  needs: ['S2', 'S6'],
  reads: [],
  appliesWhen: ALWAYS,
  when: 'always',
  check: v =>
    typeof v === 'string' && SAME_AS_VALUE.test(v) ? undefined : 'expected "same as <view>"',
  docs: [],
  facts: [],
  since: 1,
};

// ---------------------------------------------------------------------------------------------
// Small helpers.

type Row = Readonly<Record<string, string>>;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The HMAC strings compared in constant time, the length checked first (plan §3). */
function sameHmac(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
}

const BRIEF_SECTION = 'brief';

/** The payload a confirmation line signs (FR-024), or `undefined` without a watermark. */
function confirmationPayload(
  section: string,
  confirmation: Confirmation,
  canonical: CanonicalAnswers
): SignaturePayload | undefined {
  if (confirmation.round === undefined) return undefined;
  const { mode, at, round } = confirmation;
  return ['eligian-brief/1', 'confirmation', section, mode, at, round, canonical];
}

/** The payload an approval line signs: the confirmation's watermark and HMAC included (FR-024). */
function approvalPayload(
  section: string,
  approval: Pick<Approval, 'mode' | 'at'>,
  confirmation: Confirmation,
  canonical: CanonicalAnswers
): SignaturePayload | undefined {
  if (confirmation.round === undefined) return undefined;
  const { mode, at } = approval;
  return [
    'eligian-brief/1',
    'approval',
    section,
    mode,
    at,
    confirmation.round,
    canonical,
    confirmation.hmac,
  ];
}

/** Phase 2 FR-025: a line verifies when the signer's HMAC over its payload equals its own. */
function statusOf(
  hmac: string | undefined,
  payload: SignaturePayload | undefined,
  signer: Signer | undefined
): SignatureStatus {
  if (hmac === undefined) return 'none';
  if (payload === undefined || signer === undefined) return 'invalid';
  return sameHmac(signer.sign(payload), hmac) ? 'valid' : 'invalid';
}

/**
 * The statuses of the brief's signed lines over `canonical`. An approval never outlives its
 * confirmation: it is valid only while the confirmation is.
 */
function signatureStatuses(
  brief: BriefState,
  canonical: CanonicalAnswers,
  facts: Facts
): { readonly confirmation: SignatureStatus; readonly approval: SignatureStatus } {
  const section = facts.section ?? BRIEF_SECTION;
  const { confirmation, approval } = brief;
  const confirmationStatus = statusOf(
    confirmation?.hmac,
    confirmation === undefined ? undefined : confirmationPayload(section, confirmation, canonical),
    facts.signer
  );
  const approvalStatus: SignatureStatus =
    approval === undefined
      ? 'none'
      : confirmation === undefined || confirmationStatus !== 'valid'
        ? 'invalid'
        : statusOf(
            approval.hmac,
            approvalPayload(section, approval, confirmation, canonical),
            facts.signer
          );
  return { confirmation: confirmationStatus, approval: approvalStatus };
}

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (v: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(v) ? (v as readonly unknown[]).filter(isRow) : [];

/**
 * S6's rows: its table's, or, for an addition's scoped S6 (Phase 2 P11), its record as the row of
 * `view` (the addition's one view).
 */
const s6RowsOf = (v: AnswerValue | undefined, view: string | undefined): readonly Row[] =>
  isRow(v) ? (view === undefined ? [] : [{ view, ...v }]) : rowsOf(v);

const byCodeUnits = (l: string, r: string): number => (l < r ? -1 : l > r ? 1 : 0);

const isSettled = (i: Instance | undefined): boolean =>
  i !== undefined && (i.status === 'answered' || i.status === 'not-applicable');

/** The cross-reference context over the instances evaluated so far (answered values only). */
const crossContext = (
  views: readonly string[],
  byId: ReadonlyMap<string, Instance>,
  assets: readonly AssetEntry[],
  sameAs: ReadonlyMap<string, string>,
  facts: Facts
): CrossContext => ({
  views,
  value: other => {
    const i = byId.get(other);
    return i?.status === 'answered' ? i.value : undefined;
  },
  assets,
  sameAs,
  facts,
});

/** The questions an addition asks as one record of the view instead of a table (FR-036). */
const SCOPED_RECORDS: readonly string[] = ['S5', 'S6', 'D5'];

/**
 * The cross-references of a value (FR-011 to FR-014). For a scoped clone (Phase 2 P11): its S5, S6
 * and D5 records are read as the addition's one row of the template's table; its S4 rows name
 * views outside the addition, so the clone's own check (`scoped.ts`) replaces S4's S2 check.
 */
function scopedCrossCheck(
  question: Question,
  id: string,
  value: AnswerValue,
  context: CrossContext
): string | undefined {
  if (question.scoped !== true) return crossCheck(id, value, context);
  if (question.id === 'S4') return undefined;
  const view = context.views.length === 1 ? context.views[0] : undefined;
  return SCOPED_RECORDS.includes(question.id) && isRow(value) && view !== undefined
    ? crossCheck(id, [{ view, ...value }], context)
    : crossCheck(id, value, context);
}

type Checked =
  | { readonly ok: true; readonly value: AnswerValue }
  | {
      readonly ok: false;
      readonly reason: 'invalid-value' | 'invalid-reference';
      readonly message: string;
    };

/**
 * The checks of acceptance (FR-007) and of re-validation (FR-039), so a re-sent invalid value is
 * rejected with the very reason its stale instance carries: the shape (`validateValue`, the
 * message carrying the expected form), then the cross-references (`crossCheck`).
 */
function checkAnswer(
  question: Question,
  id: string,
  value: unknown,
  context: CrossContext
): Checked {
  const validated = validateValue(question, value);
  if (!validated.ok) {
    const form = expectedForm(question.shape);
    const message = validated.message.includes(form)
      ? validated.message
      : `${validated.message}; ${form}`;
    return { ok: false, reason: 'invalid-value', message };
  }
  const problem = scopedCrossCheck(question, id, validated.value, context);
  return problem === undefined
    ? { ok: true, value: validated.value }
    : { ok: false, reason: 'invalid-reference', message: problem };
}

// ---------------------------------------------------------------------------------------------
// The topological order of the effective template graph, memoized per tree.

const ORDERS = new WeakMap<readonly Question[], readonly Question[]>();

/** Kahn's algorithm over needs ∪ reads (FR-003); among the ready questions, tree order first. */
function templateOrder(tree: readonly Question[]): readonly Question[] {
  const cached = ORDERS.get(tree);
  if (cached !== undefined) return cached;
  const index = new Map(tree.map((q, i) => [q.id, i]));
  const pending = tree.map(
    q => new Set(effectivePrerequisites(q).filter(id => index.has(id) && id !== q.id))
  );
  const done = new Set<string>();
  const order: Question[] = [];
  while (order.length < tree.length) {
    const next = tree.findIndex(
      (q, i) => !done.has(q.id) && [...pending[i]].every(id => done.has(id))
    );
    if (next < 0) {
      const left = tree.filter(q => !done.has(q.id)).map(q => q.id);
      throw new Error(`the question tree has a cycle among: ${left.join(', ')}`);
    }
    done.add(tree[next].id);
    order.push(tree[next]);
  }
  ORDERS.set(tree, order);
  return order;
}

// ---------------------------------------------------------------------------------------------
// The asset list (FR-012).

const URL_PATTERN = /^https?:\/\//i;
const MEDIA_KINDS: readonly string[] = ['image', 'video', 'audio'];

const isRelativePath = (p: string): boolean => !posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p);

function assetState(file: string, facts: Facts): AssetEntry['state'] {
  if (file === '-') return 'missing';
  if (URL_PATTERN.test(file)) return 'remote';
  return isRelativePath(file) && !facts.exists(file) ? 'missing' : 'exists';
}

/**
 * Every V3 copy's rows (copies in S2 order, rows in table order), then S6's rows, then D3's,
 * deduplicated by key with the first occurrence kept.
 */
function assetList(
  v3: readonly { readonly view: string; readonly value: AnswerValue }[],
  s6: AnswerValue | undefined,
  d3: AnswerValue | undefined,
  facts: Facts
): readonly AssetEntry[] {
  const entries: AssetEntry[] = [];
  const add = (entry: AssetEntry) => {
    if (!entries.some(e => e.key === entry.key)) entries.push(entry);
  };
  for (const copy of v3) {
    for (const row of rowsOf(copy.value)) {
      const media = MEDIA_KINDS.includes(row.kind);
      if (!media && row.file === '-') continue;
      add({
        key: row.file !== '-' ? row.file : `${copy.view}: ${row.element}`,
        kind: media ? (row.kind as AssetEntry['kind']) : 'other',
        state: assetState(row.file, facts),
      });
    }
  }
  for (const row of rowsOf(s6)) {
    if (row.provider !== 'video' && row.provider !== 'audio') continue;
    add({
      key: row.source !== '-' ? row.source : `${row.view}: ${row.provider}`,
      kind: row.provider,
      state: assetState(row.source, facts),
    });
  }
  for (const row of rowsOf(d3)) {
    if (row.source !== 'project' && row.source !== 'cdn') continue;
    add({
      key: row.file !== '-' ? row.file : `font: ${row.font}`,
      kind: 'font',
      state: row.source === 'cdn' ? 'remote' : assetState(row.file, facts),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// evaluate

/** The views of S2's recorded, shape-valid answer, whatever its status (P12), or `undefined`. */
function viewsOf(
  tree: readonly Question[],
  answers: ReadonlyMap<string, Answer>
): readonly string[] | undefined {
  const s2 = tree.find(q => q.id === 'S2');
  const answer = answers.get('S2');
  if (s2 === undefined || answer === undefined) return undefined;
  const validated = validateValue(s2, answer.value);
  return validated.ok ? rowsOf(validated.value).map(r => r.name) : undefined;
}

/** The recorded `V:<view>` declarations of the views: view → source (`''` when malformed). */
function sameAsOf(
  answers: ReadonlyMap<string, Answer>,
  views: readonly string[] | undefined
): ReadonlyMap<string, string> {
  const sameAs = new Map<string, string>();
  for (const view of views ?? []) {
    const answer = answers.get(`V:${view}`);
    if (answer === undefined) continue;
    const match = typeof answer.value === 'string' ? SAME_AS_VALUE.exec(answer.value) : null;
    sameAs.set(view, match === null ? '' : match[1]);
  }
  return sameAs;
}

/** The recorded answers by id, the first one kept. */
function answersById(brief: BriefState): ReadonlyMap<string, Answer> {
  const answers = new Map<string, Answer>();
  for (const answer of brief.answers) {
    if (!answers.has(answer.id)) answers.set(answer.id, answer);
  }
  return answers;
}

interface Spec {
  readonly id: string;
  readonly question: Question;
  readonly title: string;
  readonly view?: string;
  readonly counted: boolean;
  readonly deps: readonly Instance[];
  /**
   * The effective prerequisites whose rounds can make an own answer stale (FR-016): `deps`, but
   * for a V instance without S2 and S6 (its basis covers them) and without the `same as`
   * declaration (not an effective prerequisite).
   */
  readonly roundDeps: readonly Instance[];
  /** For a V copy of a `same as` view: the source view. */
  readonly sameAs?: string;
}

/** S2 and S6 never make a V answer stale by round: the view's basis covers its rows (FR-016). */
const BASIS_IDS: readonly string[] = ['S2', 'S6'];

/**
 * FR-018 in two passes (P11). Pass 1, while a confirmation is present: the questions newer than
 * the brief's tree version do not apply, so a later tree does not reopen a confirmed brief. When
 * the confirmation's HMAC does not verify over pass 1's canonical answers (Phase 2 P4), the
 * confirmation is not valid there and the brief is evaluated against the full tree (pass 2), as is
 * every unconfirmed brief.
 */
export function evaluate(tree: readonly Question[], brief: BriefState, facts: Facts): Evaluation {
  const confirmation = brief.confirmation;
  if (confirmation !== undefined && tree.some(q => q.since > brief.treeVersion)) {
    const pass1 = evaluatePass(tree, brief, facts, brief.treeVersion);
    if (pass1.confirmationStatus === 'valid') return pass1;
  }
  return evaluatePass(tree, brief, facts, undefined);
}

/**
 * FR-018: the tree version the next write of `brief` records. A brief that pass 1 confirms under
 * its recorded version keeps it; every other brief is evaluated against the current tree, so it
 * records `current` (the version of `tree`).
 */
export function recordedTreeVersion(
  tree: readonly Question[],
  brief: BriefState,
  facts: Facts,
  current: number
): number {
  const confirmation = brief.confirmation;
  const keep =
    confirmation !== undefined &&
    tree.some(q => q.since > brief.treeVersion) &&
    evaluatePass(tree, brief, facts, brief.treeVersion).confirmationStatus === 'valid';
  return keep ? brief.treeVersion : current;
}

/** One evaluation pass; `versionGate` set: the questions with a later `since` do not apply. */
function evaluatePass(
  tree: readonly Question[],
  brief: BriefState,
  facts: Facts,
  versionGate: number | undefined
): Evaluation {
  const order = templateOrder(tree);
  const templates = new Map(tree.map(q => [q.id, q]));
  const isVTemplate = (id: string) => templates.get(id)?.branch === 'V';

  const answers = answersById(brief);
  // P11: an addition's interview fixes the views; S2 names them otherwise (FR-010).
  const views = facts.views ?? viewsOf(tree, answers);
  const sameAs = sameAsOf(answers, views);

  const instances: Instance[] = [];
  const byId = new Map<string, Instance>();
  const ofTemplate = new Map<string, Instance[]>();

  let assets: readonly AssetEntry[] | undefined;
  const currentAssets = (): readonly AssetEntry[] => {
    if (assets === undefined) {
      const value = (id: string) => {
        const i = byId.get(id);
        return i?.status === 'answered' ? i.value : undefined;
      };
      const v3 = (views ?? []).flatMap(view => {
        const copy = value(`V3:${view}`);
        return copy === undefined ? [] : [{ view, value: copy }];
      });
      // P11: an addition's S6 is a record, the row of its one view.
      assets = assetList(v3, s6RowsOf(value('S6'), views?.[0]), value('D3'), facts);
    }
    return assets;
  };

  /** The instances behind prerequisite ids; a V template id means its copy for `view`, or all. */
  const resolve = (ids: readonly string[], view?: string): Instance[] =>
    ids.flatMap(id => {
      if (isVTemplate(id)) {
        const copy = view === undefined ? undefined : byId.get(`${id}:${view}`);
        return copy !== undefined ? [copy] : (ofTemplate.get(id) ?? []);
      }
      const i = byId.get(id);
      return i === undefined ? [] : [i];
    });

  /** The `AnswerView` of FR-008: serves only `q.reads`, throws on any other id. */
  const answerView = (q: Question): AnswerView => {
    const guard = (id: string) => {
      if (!q.reads.includes(id)) {
        throw new Error(
          `the applies-when rule of ${q.id} read ${id}, which is not in its reads (a defect in the tree)`
        );
      }
    };
    return {
      get(id) {
        guard(id);
        if (isVTemplate(id)) {
          throw new Error(`the applies-when rule of ${q.id} read the V template ${id} with get`);
        }
        const i = byId.get(id);
        return i?.status === 'answered' ? i.value : undefined;
      },
      copies(id) {
        guard(id);
        if (!isVTemplate(id)) {
          throw new Error(`the applies-when rule of ${q.id} read the non-V id ${id} with copies`);
        }
        return (views ?? []).flatMap(view => {
          const i = byId.get(`${id}:${view}`);
          return i?.status === 'answered' && i.value !== undefined ? [i.value] : [];
        });
      },
    };
  };

  const push = (instance: Instance) => {
    instances.push(instance);
    byId.set(instance.id, instance);
    const list = ofTemplate.get(instance.question.id) ?? [];
    list.push(instance);
    ofTemplate.set(instance.question.id, list);
    if (['V3', 'S6', 'D3'].includes(instance.question.id)) assets = undefined;
  };

  /**
   * Why an own answer of an applicable instance with settled prerequisites is stale (FR-016), or
   * `undefined` when it is answered: e. it no longer validates (FR-039; the message is the
   * `reason`), f. an effective prerequisite carries a later `round` than the answer's
   * `max(round, reviewed)`, g. a V answer's `basis` is missing or not the view's current one.
   */
  const staleness = (spec: Spec, answer: Answer): { readonly reason?: string } | undefined => {
    const context = crossContext(views ?? [], byId, currentAssets(), sameAs, facts);
    const checked = checkAnswer(spec.question, spec.id, answer.value, context);
    if (!checked.ok) return { reason: checked.message };
    // P12: a fact is never stale by a round or a basis; only a re-read of the code changes it.
    if (answer.by === 'code') return undefined;
    const since = Math.max(answer.round, answer.reviewed ?? 0);
    if (spec.roundDeps.some(d => d.round > since)) return {};
    if (spec.view !== undefined && answer.basis !== viewBasis(brief, spec.view)) return {};
    return undefined;
  };

  const add = (spec: Spec) => {
    const answer = answers.get(spec.id);
    const base = {
      id: spec.id,
      question: spec.question,
      title: spec.title,
      ...(spec.view === undefined ? {} : { view: spec.view }),
      ...(answer === undefined ? {} : { answer }),
      counted: spec.counted,
    };
    const dependsOn = spec.deps.map(d => d.id);
    // P12: a fact (`by: code`) needs no decision before it, so it never waits; whether it applies
    // is decided once its prerequisites are settled (until then it counts as applicable).
    const settled = spec.deps.every(isSettled);
    if (!settled && answer?.by !== 'code') {
      push({ ...base, status: 'waiting', dormant: false, round: 0, dependsOn });
      return;
    }
    if (
      (versionGate !== undefined && spec.question.since > versionGate) ||
      (settled && !spec.question.appliesWhen(answerView(spec.question), currentAssets()))
    ) {
      push({
        ...base,
        status: 'not-applicable',
        dormant: answer !== undefined,
        round: 0,
        dependsOn,
      });
      return;
    }
    if (answer !== undefined) {
      const stale = staleness(spec, answer);
      push(
        stale === undefined
          ? {
              ...base,
              status: 'answered',
              dormant: false,
              value: answer.value,
              round: answer.round,
              dependsOn,
            }
          : {
              ...base,
              status: 'stale',
              dormant: false,
              round: answer.round,
              previous: answer.value,
              ...(stale.reason === undefined ? {} : { reason: stale.reason }),
              dependsOn,
            }
      );
      return;
    }
    if (spec.sameAs !== undefined) {
      // A copy is settled only where the source's answer is settled (FR-014).
      const sourceId = `${spec.question.id}:${spec.sameAs}`;
      const source = byId.get(sourceId);
      const copyDeps = [...dependsOn, sourceId];
      if (source?.status === 'answered' && source.value !== undefined) {
        push({
          ...base,
          status: 'answered',
          dormant: false,
          value: source.value,
          round: source.round,
          dependsOn: copyDeps,
        });
      } else if (source?.status === 'not-applicable') {
        push({ ...base, status: 'not-applicable', dormant: false, round: 0, dependsOn: copyDeps });
      } else {
        push({ ...base, status: 'waiting', dormant: false, round: 0, dependsOn: copyDeps });
      }
      return;
    }
    push({ ...base, status: 'open', dormant: false, round: 0, dependsOn });
  };

  const sameAsAdded = new Set<string>();
  for (const q of order) {
    const prerequisites = effectivePrerequisites(q);
    if (q.branch !== 'V') {
      const deps = resolve(prerequisites);
      add({ id: q.id, question: q, title: q.title, counted: true, deps, roundDeps: deps });
      continue;
    }
    const roundPrerequisites = prerequisites.filter(id => !BASIS_IDS.includes(id));
    if (views === undefined) {
      // Before S2: one template copy of branch V (FR-010).
      add({
        id: q.id,
        question: q,
        title: q.title,
        counted: true,
        deps: resolve(prerequisites),
        roundDeps: resolve(roundPrerequisites),
      });
      continue;
    }
    // Views without `same as` first, in S2 order, then the `same as` views (FR-014).
    const plain = views.filter(view => !sameAs.has(view));
    const copied = views.filter(view => sameAs.has(view));
    for (const view of plain) {
      add({
        id: `${q.id}:${view}`,
        question: q,
        title: `${view}: ${q.title}`,
        view,
        counted: true,
        deps: resolve(prerequisites, view),
        roundDeps: resolve(roundPrerequisites, view),
      });
    }
    for (const view of copied) {
      if (!sameAsAdded.has(view)) {
        sameAsAdded.add(view);
        add({
          id: `V:${view}`,
          question: SAME_AS,
          title: `${view}: ${SAME_AS.title}`,
          view,
          counted: false,
          deps: resolve(SAME_AS.needs),
          // Stale only by its basis or FR-039, never by a round (FR-014).
          roundDeps: [],
        });
      }
      const declaration = byId.get(`V:${view}`);
      add({
        id: `${q.id}:${view}`,
        question: q,
        title: `${view}: ${q.title}`,
        view,
        counted: true,
        deps: [
          ...resolve(prerequisites, view),
          ...(declaration === undefined ? [] : [declaration]),
        ],
        roundDeps: resolve(roundPrerequisites, view),
        sameAs: sameAs.get(view),
      });
    }
  }

  const frontier = instances.filter(i => i.status === 'open' || i.status === 'stale');
  const counted = instances.filter(i => i.counted);
  const ownDelegated = counted.filter(
    i => i.status === 'answered' && i.answer !== undefined && i.answer.by === 'delegated'
  );
  const fromCode = counted.filter(
    i => i.status === 'answered' && i.answer !== undefined && i.answer.by === 'code'
  ).length;
  const counts: Counts = {
    answered: counted.filter(i => i.status === 'answered').length,
    delegated: ownDelegated.length,
    open: counted.filter(i => i.status === 'open' || i.status === 'stale').length,
    waiting: counted.filter(i => i.status === 'waiting').length,
    notApplicable: counted.filter(i => i.status === 'not-applicable').length,
    ...(fromCode === 0 ? {} : { fromCode }),
  };
  const delegated = ownDelegated.flatMap(i =>
    i.answer === undefined ? [] : [{ id: i.id, title: i.title, value: i.answer.value }]
  );
  const applicable = instances.flatMap(i =>
    i.status !== 'not-applicable' && i.answer !== undefined ? [i.answer] : []
  );
  const canonical = canonicalAnswers(applicable);
  const statuses = signatureStatuses(brief, canonical, facts);
  // Phase 2 FR-026.
  const state: BriefStateName =
    frontier.length > 0
      ? 'open'
      : statuses.confirmation !== 'valid'
        ? 'complete'
        : statuses.approval === 'valid'
          ? 'approved'
          : 'confirmed';
  // The answers recorded after the watermark of an invalid confirmation (FR-026).
  const watermark = brief.confirmation?.round;
  const changed =
    statuses.confirmation !== 'invalid' || watermark === undefined
      ? []
      : instances.flatMap(i =>
          i.status !== 'not-applicable' &&
          i.answer !== undefined &&
          Math.max(i.answer.round, i.answer.reviewed ?? 0) > watermark
            ? [{ id: i.id, title: i.title, value: i.answer.value }]
            : []
        );

  return {
    state,
    instances,
    frontier,
    counts,
    delegated,
    assets: currentAssets(),
    views: views ?? [],
    digest: sha256(JSON.stringify(canonical)),
    canonical,
    confirmationStatus: statuses.confirmation,
    approvalStatus: statuses.approval,
    changed,
  };
}

// ---------------------------------------------------------------------------------------------
// applyAnswers (FR-007, FR-015).

/** Key order does not matter: records compare by their fields (canonical values, P7). */
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : isRow(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort(byCodeUnits)
            .map(k => [k, canonical(v[k])])
        )
      : v;

const sameValue = (l: AnswerValue, r: AnswerValue): boolean =>
  JSON.stringify(canonical(l)) === JSON.stringify(canonical(r));

/** The brief with `answer` in place of the recorded answer of its id (appended when new). */
function withAnswer(brief: BriefState, answer: Answer): BriefState {
  const index = brief.answers.findIndex(x => x.id === answer.id);
  const answers =
    index < 0
      ? [...brief.answers, answer]
      : brief.answers.map((x, i) => (i === index ? answer : x));
  return { ...brief, answers };
}

type Target =
  | { readonly question: Question; readonly view?: string; readonly instance?: Instance }
  | { readonly rejection: Rejection };

const reject = (id: string, reason: RejectionReason, message: string): Target => ({
  rejection: { id, reason, message },
});

/** The question and instance an answer id names, or why it names none (FR-007, FR-010). */
function locate(
  tree: readonly Question[],
  evaluation: Evaluation,
  byId: ReadonlyMap<string, Instance>,
  id: string
): Target {
  const colon = id.indexOf(':');
  const templateId = colon < 0 ? id : id.slice(0, colon);
  const view = colon < 0 ? undefined : id.slice(colon + 1);
  const question =
    view !== undefined && templateId === SAME_AS.id ? SAME_AS : tree.find(q => q.id === templateId);
  if (question === undefined || (view !== undefined && question.branch !== 'V')) {
    return reject(id, 'unknown-question', `${id} is not a question of the brief`);
  }
  if (view !== undefined && !evaluation.views.includes(view)) {
    return isSettled(byId.get('S2'))
      ? reject(
          id,
          'unknown-question',
          `${id}: "${view}" is not a view of S2 (${evaluation.views.join(', ')})`
        )
      : reject(id, 'waiting', `${id} waits for S2, which names the views`);
  }
  const instance = byId.get(id);
  if (instance !== undefined)
    return { question, instance, ...(view === undefined ? {} : { view }) };
  if (question === SAME_AS && view !== undefined) return { question, view };
  return reject(
    id,
    'unknown-question',
    `${id} is asked per view: answer ${id}:<view> (${evaluation.views.join(', ')})`
  );
}

/**
 * The prerequisites that keep an instance from being answered, `[]` when it can be. A `same as`
 * copy that waits only for its source can be answered: an explicit answer overrides the copy
 * (FR-014).
 */
function blockers(
  target: { readonly question: Question; readonly view?: string; readonly instance?: Instance },
  byId: ReadonlyMap<string, Instance>,
  sameAs: ReadonlyMap<string, string>
): readonly string[] {
  const { question, view, instance } = target;
  // A `V:<view>` not recorded yet has no instance: it waits for SAME_AS's needs (S2, S6).
  if (instance === undefined) return question.needs.filter(d => !isSettled(byId.get(d)));
  if (instance.status !== 'waiting') return [];
  const source = view === undefined || question === SAME_AS ? undefined : sameAs.get(view);
  const sourceId = source === undefined ? undefined : `${question.id}:${source}`;
  const open = instance.dependsOn.filter(d => d !== sourceId && !isSettled(byId.get(d)));
  return open.length > 0 || sourceId !== undefined ? open : instance.dependsOn;
}

/**
 * One `answer` call (FR-007, FR-015): duplicates are rejected (the later one), the rest go in the
 * instance order of a full evaluation (unknown ids last, in input order), each against the state
 * that holds the answers accepted before it. Status, then the shape (`invalid-value`, with the
 * expected form), then the cross-references (`invalid-reference`); the same value and `by` is a
 * no-op, `by` alone keeps the round, a change takes `round` (and the view's basis for a V answer).
 * `rejected` is in input order; `changed` is whether the brief's answers changed.
 */
export function applyAnswers(
  tree: readonly Question[],
  brief: BriefState,
  facts: Facts,
  input: readonly AnswerInput[],
  round: number
): {
  readonly brief: BriefState;
  readonly rejected: readonly Rejection[];
  readonly changed: boolean;
} {
  const rejected: { readonly index: number; readonly rejection: Rejection }[] = [];
  const seen = new Set<string>();
  const unique: { readonly index: number; readonly item: AnswerInput }[] = [];
  input.forEach((item, index) => {
    if (seen.has(item.id)) {
      rejected.push({
        index,
        rejection: {
          id: item.id,
          reason: 'duplicate',
          message: `${item.id} is answered more than once in this call; the first answer is used`,
        },
      });
      return;
    }
    seen.add(item.id);
    unique.push({ index, item });
  });

  const initial = evaluate(tree, brief, facts);
  const position = new Map(initial.instances.map((i, n) => [i.id, n]));
  const rank = (id: string) => position.get(id) ?? Number.POSITIVE_INFINITY;
  const ordered = [...unique].sort(
    (l, r) => rank(l.item.id) - rank(r.item.id) || l.index - r.index
  );

  let current = brief;
  for (const { index, item } of ordered) {
    const evaluation = evaluate(tree, current, facts);
    const byId = new Map(evaluation.instances.map(i => [i.id, i]));
    const answers = answersById(current);
    const sameAs = sameAsOf(answers, evaluation.views);
    const outcome = applyOne(item, round, current, evaluation, byId, sameAs, tree, facts);
    if ('rejection' in outcome) rejected.push({ index, rejection: outcome.rejection });
    else current = outcome.brief;
  }

  return {
    brief: current,
    rejected: rejected.sort((l, r) => l.index - r.index).map(r => r.rejection),
    changed: current !== brief,
  };
}

const FACT_SETTLED = 'settled by the code; change the code and call with scope adopt again';

function applyOne(
  item: AnswerInput,
  round: number,
  brief: BriefState,
  evaluation: Evaluation,
  byId: ReadonlyMap<string, Instance>,
  sameAs: ReadonlyMap<string, string>,
  tree: readonly Question[],
  facts: Facts
): { readonly brief: BriefState } | { readonly rejection: Rejection } {
  const { id } = item;
  // FR-045: a fact is changed only by the code and a re-read (`scope: adopt`), never by `answer`.
  if (brief.answers.find(x => x.id === id)?.by === 'code') {
    return {
      rejection: {
        id,
        reason: 'fact',
        message: `${id} is ${FACT_SETTLED}`,
      },
    };
  }
  const target = locate(tree, evaluation, byId, id);
  if ('rejection' in target) return target;
  const { question, view, instance } = target;

  if (instance?.status === 'not-applicable') {
    return {
      rejection: {
        id,
        reason: 'not-applicable',
        message: `${id} does not apply: ${question.when}`,
      },
    };
  }
  const waitingFor = blockers(target, byId, sameAs);
  if (waitingFor.length > 0) {
    return {
      rejection: { id, reason: 'waiting', message: `${id} waits for ${waitingFor.join(', ')}` },
    };
  }

  // A stale answer whose value no longer validates is rejected here with the reason its
  // instance carries, so it is never reviewed (FR-015, FR-039).
  const context = crossContext(evaluation.views, byId, evaluation.assets, sameAs, facts);
  const checked = checkAnswer(question, id, item.value, context);
  if (!checked.ok) {
    return { rejection: { id, reason: checked.reason, message: checked.message } };
  }
  const value = checked.value;

  const by: By = item.delegated === true ? 'delegated' : 'user';
  const basis = view === undefined ? {} : { basis: viewBasis(brief, view) };
  const existing = brief.answers.find(x => x.id === id);
  if (existing !== undefined && sameValue(existing.value, value)) {
    if (instance?.status === 'stale') {
      // Review (FR-015): kept as it is, so its round stays and nothing below it reopens.
      return { brief: withAnswer(brief, { ...existing, by, reviewed: round, ...basis }) };
    }
    return { brief: existing.by === by ? brief : withAnswer(brief, { ...existing, by }) };
  }
  return { brief: withAnswer(brief, { id, value, by, round, ...basis }) };
}

// ---------------------------------------------------------------------------------------------
// confirm and approve (FR-029 engine half; Phase 2 FR-024, FR-027).

/**
 * The brief with a signed confirmation of `evaluation` (the evaluation of `brief`): the time as
 * ISO-8601 UTC, the watermark n (the highest `round` or `reviewed`, `nextRound - 1`), the HMAC over
 * `["eligian-brief/1", "confirmation", section, mode, at, n, canonical]`, and for
 * `agent-reported` the message verbatim. The tool refuses the cases of FR-029 before calling it.
 */
export function confirm(
  brief: BriefState,
  mode: Confirmation['mode'],
  message: string | undefined,
  now: Date,
  evaluation: Evaluation,
  signer: Signer,
  section: string
): BriefState {
  const at = now.toISOString();
  const round = nextRound(brief) - 1;
  const hmac = signer.sign([
    'eligian-brief/1',
    'confirmation',
    section,
    mode,
    at,
    round,
    evaluation.canonical,
  ]);
  const withMessage = mode === 'agent-reported' && message !== undefined ? { message } : {};
  return { ...brief, confirmation: { mode, at, round, hmac, ...withMessage } };
}

/**
 * The brief with a signed approval of `evaluation` (the evaluation of `brief`): its payload holds
 * the confirmation's watermark and HMAC, so it never outlives that confirmation (FR-024). A brief
 * whose confirmation has no watermark (none, or a Phase 1 line) is returned unchanged: the tool
 * refuses an approval before a valid confirmation.
 */
export function approve(
  brief: BriefState,
  mode: Approval['mode'],
  message: string | undefined,
  now: Date,
  evaluation: Evaluation,
  signer: Signer,
  section: string
): BriefState {
  const confirmation = brief.confirmation;
  if (confirmation === undefined) return brief;
  const at = now.toISOString();
  const payload = approvalPayload(section, { mode, at }, confirmation, evaluation.canonical);
  if (payload === undefined) return brief;
  const withMessage = mode === 'agent-reported' && message !== undefined ? { message } : {};
  return { ...brief, approval: { mode, at, hmac: signer.sign(payload), ...withMessage } };
}

// ---------------------------------------------------------------------------------------------
// Round selection (FR-017).

/**
 * The frontier instances ranked for a round (FR-017): by the number of distinct unsettled
 * instances that transitively depend on each one (through the reverse instance graph), descending;
 * ties by tree order, then S2 view order. A `V:<name>` instance ranks just before branch V.
 */
export function rankFrontier(
  tree: readonly Question[],
  evaluation: Evaluation
): readonly { readonly id: string; readonly dependents: number }[] {
  const dependentsOf = new Map<string, Instance[]>();
  for (const i of evaluation.instances) {
    for (const id of i.dependsOn) {
      const list = dependentsOf.get(id) ?? [];
      list.push(i);
      dependentsOf.set(id, list);
    }
  }
  const countDependents = (root: Instance): number => {
    const seen = new Set<string>();
    const stack = [root.id];
    while (stack.length > 0) {
      for (const d of dependentsOf.get(stack.pop() as string) ?? []) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        stack.push(d.id);
      }
    }
    return evaluation.instances.filter(i => seen.has(i.id) && !isSettled(i)).length;
  };
  const treeIndex = new Map(tree.map((q, i) => [q.id, i]));
  const firstV = tree.findIndex(q => q.branch === 'V');
  const position = (i: Instance): number =>
    i.question === SAME_AS ? firstV - 0.5 : (treeIndex.get(i.question.id) ?? tree.length);
  const viewIndex = (i: Instance): number =>
    i.view === undefined ? -1 : evaluation.views.indexOf(i.view);
  return evaluation.frontier
    .map(i => ({ instance: i, dependents: countDependents(i) }))
    .sort(
      (l, r) =>
        r.dependents - l.dependents ||
        position(l.instance) - position(r.instance) ||
        viewIndex(l.instance) - viewIndex(r.instance)
    )
    .map(({ instance, dependents }) => ({ id: instance.id, dependents }));
}

/** The first `max` ranked frontier instances as round items (FR-017; `max` 1 to 20, default 7). */
export function pickRound(
  tree: readonly Question[],
  evaluation: Evaluation,
  max = 7
): readonly RoundItem[] {
  const byId = new Map(evaluation.frontier.map(i => [i.id, i]));
  return rankFrontier(tree, evaluation)
    .slice(0, max)
    .flatMap(({ id }) => {
      const i = byId.get(id);
      if (i === undefined) return [];
      const stale = i.status === 'stale';
      return [
        {
          id: i.id,
          title: i.title,
          ask: i.question.ask,
          shape: i.question.shape,
          docs: [...i.question.docs],
          facts: [...i.question.facts],
          ...(stale && i.previous !== undefined ? { previous: i.previous } : {}),
          ...(stale && i.reason !== undefined ? { reason: i.reason } : {}),
        },
      ];
    });
}

// ---------------------------------------------------------------------------------------------
// The small rules.

/** FR-015: 1 + the highest `round` or `reviewed` of the recorded answers; 1 for an empty brief. */
export function nextRound(brief: BriefState): number {
  let highest = 0;
  for (const answer of brief.answers) {
    highest = Math.max(highest, answer.round, answer.reviewed ?? 0);
  }
  return highest + 1;
}

/**
 * FR-022: `[id, value, by]` of each answer sorted by id (round, `reviewed` and basis excluded):
 * the list `digest` hashes and the signed lines sign (Phase 2 FR-024).
 */
export function canonicalAnswers(answers: readonly Answer[]): CanonicalAnswers {
  return answers
    .map(answer => [answer.id, answer.value, answer.by] as const)
    .sort(([l], [r]) => byCodeUnits(l, r));
}

/** FR-022: the hex SHA-256 of the JSON of `canonicalAnswers(answers)`. */
export function digest(answers: readonly Answer[]): string {
  return sha256(JSON.stringify(canonicalAnswers(answers)));
}

/**
 * FR-016: the first 16 hex of the SHA-256 of `[s2Row, s6Row]` for the view (keys in column order;
 * `null` for a missing row), from the recorded S2 and S6 answers.
 */
export function viewBasis(brief: BriefState, view: string): string {
  const rowFor = (id: string, key: string): Row | undefined =>
    rowsOf(brief.answers.find(answer => answer.id === id)?.value).find(r => r[key] === view);
  const s2 = rowFor('S2', 'name');
  // P11: an addition's S6 is a record, the row of its one view.
  const s6 = s6RowsOf(brief.answers.find(answer => answer.id === 'S6')?.value, view).find(
    r => r.view === view
  );
  const s2Row = s2 === undefined ? null : { name: s2.name, purpose: s2.purpose };
  const s6Row =
    s6 === undefined ? null : { view: s6.view, provider: s6.provider, source: s6.source };
  return sha256(JSON.stringify([s2Row, s6Row])).slice(0, 16);
}

/**
 * The text direction of a language code (FR-019): `Intl.Locale`'s `getTextInfo()`, else its
 * `textInfo` getter (older V8), else `ltr`; any throw gives `ltr`. `Reflect.get` keeps this within
 * the ES2020 `lib`.
 */
export function textDirection(code: string): 'ltr' | 'rtl' {
  try {
    const locale: object = new Intl.Locale(code);
    const getTextInfo: unknown = Reflect.get(locale, 'getTextInfo');
    const info: unknown =
      typeof getTextInfo === 'function'
        ? getTextInfo.call(locale)
        : Reflect.get(locale, 'textInfo');
    const direction =
      typeof info === 'object' && info !== null ? Reflect.get(info, 'direction') : undefined;
    return direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
