/**
 * Spec 059 Phase 3 (FR-029, FR-033; plan §8, R-6, P14): the eval harness's brief fixture. Arm A1
 * starts from a confirmed brief: the harness signs the case's fixture with the engine's own
 * functions (parse, evaluate with the project's facts, `confirm`, `writeBrief`) and a key in the
 * run's state directory, and reads a project's brief state after the run. Plain async code: no
 * exception crosses `confirmBriefFixture`, which resolves to `{ text }` or `{ error }`.
 * Imports only the brief modules, so the evals bundle reaches neither `@eligian/language` nor
 * `effect/ai`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { BRIEF_FILE, type FactsSnapshot, parseBrief, writeBrief } from '../brief/brief-file.js';
import {
  type BriefStateName,
  confirm,
  type Evaluation,
  evaluate,
  textDirection,
} from '../brief/engine.js';
import { makeFacts } from '../brief/facts.js';
import { ensureKey, makeSigner, readKey } from '../brief/signature.js';
import { TREE } from '../brief/tree.js';

/** The confirmation message of a case's fixture (R-6). */
export const FIXTURE_CONFIRMATION = (caseId: string): string =>
  `eval harness: the brief fixture of case ${caseId}`;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The installed `eligian` version of the project (`node_modules/eligian/package.json`). */
async function installedEligian(projectDir: string): Promise<string | undefined> {
  try {
    const manifest: unknown = JSON.parse(
      await fs.readFile(path.join(projectDir, 'node_modules', 'eligian', 'package.json'), 'utf8')
    );
    const version =
      typeof manifest === 'object' && manifest !== null
        ? Reflect.get(manifest, 'version')
        : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/** The L1 codes with their text directions once L1 is answered, else undefined. */
const directionsOf = (evaluation: Evaluation): FactsSnapshot['textDirection'] => {
  const l1 = evaluation.instances.find(i => i.id === 'L1');
  if (l1?.status !== 'answered' || !Array.isArray(l1.value)) return undefined;
  return l1.value.flatMap((row: unknown) => {
    const code = typeof row === 'object' && row !== null ? Reflect.get(row, 'code') : undefined;
    return typeof code === 'string' ? [{ code, direction: textDirection(code) }] : [];
  });
};

/**
 * The fixture `text` as a confirmed brief of `projectDir` (FR-029): refused with `{ error }` when
 * the parser ignores a line or the brief is not complete; otherwise signed `agent-reported` with
 * `message` at `now`, with the key of `stateDir` (created on first need).
 */
export async function confirmBriefFixture(
  text: string,
  projectDir: string,
  stateDir: string,
  now: Date,
  message = 'eval harness: brief fixture'
): Promise<{ readonly text: string } | { readonly error: string }> {
  const parsed = parseBrief(text);
  if (parsed.ignored.length > 0) {
    return {
      error: parsed.ignored.map(({ line, reason }) => `line ${line}: ${reason}`).join('; '),
    };
  }
  let key: Buffer;
  try {
    key = await ensureKey(stateDir);
  } catch (error) {
    return { error: `the brief key in ${stateDir} cannot be created: ${errorText(error)}` };
  }
  const signer = makeSigner(key);
  const facts = { ...makeFacts(projectDir, projectDir), signer };
  const evaluation = evaluate(TREE, parsed.brief, facts);
  if (evaluation.frontier.length > 0) {
    return { error: `the brief is open: ${evaluation.frontier.map(i => i.id).join(', ')}` };
  }
  const confirmed = confirm(
    parsed.brief,
    'agent-reported',
    message,
    now,
    evaluation,
    signer,
    'brief'
  );
  const after = evaluate(TREE, confirmed, facts);
  if (after.state !== 'confirmed') {
    return { error: `the signed brief is ${after.state}, not confirmed` };
  }
  const installed = await installedEligian(projectDir);
  const snapshot: FactsSnapshot = {
    state: after.state,
    serverEligian: installed ?? '-',
    eligianInstalled: installed,
    packageManager: undefined,
    textDirection: directionsOf(after),
    assets: after.assets,
  };
  return { text: writeBrief(TREE, { ...parsed, brief: confirmed }, snapshot) };
}

/**
 * The state of `<projectDir>/BRIEF.md` read with the key of `stateDir` (P14): `none` without
 * the file (or when it cannot be read); a missing or unreadable key verifies nothing.
 */
export async function briefStateOf(
  projectDir: string,
  stateDir: string
): Promise<'none' | BriefStateName> {
  let text: string;
  try {
    text = await fs.readFile(path.join(projectDir, BRIEF_FILE), 'utf8');
  } catch {
    return 'none';
  }
  const key = await readKey(stateDir).catch(() => undefined);
  const facts = {
    ...makeFacts(projectDir, projectDir),
    ...(key === undefined ? {} : { signer: makeSigner(key) }),
  };
  return evaluate(TREE, parseBrief(text).brief, facts).state;
}
