/**
 * Spec 059 Phase 2 test helpers (T024): a temp project, a snapshot of its files, and a brief
 * driven to `approved` through the server (`status` with the persona's idea, the persona to
 * `complete`, `confirm`, a `STORYBOARD.md` that passes `checkStoryboard`, `approve-storyboard`).
 * Signed lines come only from the server: never a hand-made HMAC.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRIEF_FILE, parseBrief } from '../mcp/brief/brief-file.js';
import { type Evaluation, evaluate, type Facts } from '../mcp/brief/engine.js';
import { makeFacts } from '../mcp/brief/facts.js';
import { makeSigner, readKey } from '../mcp/brief/signature.js';
import { type AnswerValue, TREE } from '../mcp/brief/tree.js';
import { loadPersona, type PersonaName, runPersona, type Step } from './brief-persona-driver.js';
import type { InMemoryServer } from './mcp-test-client.js';

/** A temp directory (its real path) holding `files` (relative path → text). */
export function tempProject(files: Readonly<Record<string, string>> = {}): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-project-')));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

export interface FileSnapshot {
  readonly bytes: Buffer;
  readonly mtimeMs: number;
}

/** Every file under `dir` (`.eligian/` included), by its `/`-separated relative path. */
export function snapshotFiles(dir: string): Readonly<Record<string, FileSnapshot>> {
  const out: Record<string, FileSnapshot> = {};
  const walk = (at: string) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(dir, full).split(path.sep).join('/');
        out[relative] = { bytes: fs.readFileSync(full), mtimeMs: fs.statSync(full).mtimeMs };
      }
    }
  };
  walk(dir);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

type Row = Readonly<Record<string, string>>;

const settled = (evaluation: Evaluation, id: string): AnswerValue | undefined =>
  evaluation.instances.find(i => i.id === id && i.status === 'answered')?.value;

const rowsOf = (value: AnswerValue | undefined): readonly Row[] =>
  Array.isArray(value)
    ? (value as readonly unknown[]).filter(
        (row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row)
      )
    : [];

const said = (value: AnswerValue | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== 'none';

const cell = (text: string) => text.replace(/\|/g, '\\|');

/**
 * A `STORYBOARD.md` that passes FR-029's checks for `evaluation`: one view section per S2 name
 * with two beats that have end blocks, the header from S6, L1, the asset files and H1, and an
 * interactions row for each S4 row, each I2 key, I1 (a toggle) and each V6 that says something.
 */
export function storyboardFor(evaluation: Evaluation): string {
  const { views } = evaluation;
  const providers = rowsOf(settled(evaluation, 'S6'))
    .map(row => row.provider)
    .filter((p, i, all) => all.indexOf(p) === i);
  const languages = rowsOf(settled(evaluation, 'L1')).map(row =>
    row.default === 'yes' ? `${row.code} (default)` : row.code
  );
  const placeholder = (key: string) =>
    key.startsWith('font: ') || views.some(view => key.startsWith(`${view}: `));
  const assets = evaluation.assets.map(entry => entry.key).filter(key => !placeholder(key));
  const h1 = settled(evaluation, 'H1');
  const hostModule = Array.isArray(h1) && h1.length > 0 ? './host.ts' : 'none';

  const lines = [
    '# Storyboard',
    '',
    '- audience: the test',
    `- provider: ${providers.join(', ')}`,
    `- languages: ${languages.length === 0 ? 'none' : languages.join(', ')}`,
    `- assets: ${assets.length === 0 ? 'none' : assets.join(', ')}`,
    `- host module: ${hostModule}`,
  ];
  for (const [n, view] of views.entries()) {
    lines.push(
      '',
      `## view ${view} (container #stage)`,
      '',
      '| timeline | start | end | selector | change | end-block |',
      '| --- | --- | --- | --- | --- | --- |',
      `| ${cell(view)} | 0 | 4 | #title-${n} | addClass is-visible | removeClass is-visible |`,
      `| ${cell(view)} | 2 | 4 | #text-${n} | addClass is-visible | removeClass is-visible |`
    );
  }
  const interactions: string[] = [];
  const row = (trigger: string, target: string, verb: string, timeline: string) =>
    interactions.push(`| ${cell(trigger)} | ${cell(target)} | ${verb} | ${cell(timeline)} |`);
  for (const s4 of rowsOf(settled(evaluation, 'S4'))) {
    row(s4.trigger, s4.target, 'navigate', s4.view);
  }
  for (const i2 of rowsOf(settled(evaluation, 'I2'))) row(`key ${i2.key}`, '-', 'run', views[0]);
  if (said(settled(evaluation, 'I1'))) row('click #play', '-', 'toggle', views[0]);
  for (const [n, view] of views.entries()) {
    if (said(settled(evaluation, `V6:${view}`))) row(`click #react-${n}`, '-', 'run', view);
  }
  lines.push(
    '',
    '## interactions',
    '',
    '| trigger | target | verb | timeline |',
    '| --- | --- | --- | --- |',
    ...interactions
  );
  return `${lines.join('\n')}\n`;
}

/** The evaluation of `<dir>/BRIEF.md` as the server computes it (with the key, when it exists). */
export async function evaluateBriefFile(
  dir: string,
  options: { readonly root?: string; readonly stateDir: string }
): Promise<Evaluation> {
  const parsed = parseBrief(fs.readFileSync(path.join(dir, BRIEF_FILE), 'utf8'));
  const key = await readKey(options.stateDir);
  const plain = makeFacts(options.root ?? dir, dir);
  const facts: Facts = key === undefined ? plain : { ...plain, signer: makeSigner(key) };
  return evaluate(TREE, parsed.brief, facts);
}

export interface ApprovedBriefOptions {
  /** The server's `brief.stateDir` (the key the server signs with). */
  readonly stateDir: string;
  /** The project root (the server's cwd); default `dir`. */
  readonly root?: string;
  /** Default `terse`. */
  readonly persona?: PersonaName;
}

/**
 * Drives the brief of `dir` to `approved` on `server`. The sign-off calls pass a `confirmation`,
 * so they sign `agent-reported` on a client without elicitation, and through the dialog where the
 * client's responder accepts. Returns the approved brief's evaluation.
 */
export async function approvedBrief(
  server: InMemoryServer,
  dir: string,
  options: ApprovedBriefOptions
): Promise<Evaluation> {
  const call = async (args: Record<string, unknown>) => {
    const result = await server.callTool('eligian_brief', { directory: dir, ...args });
    if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
    return result.payload;
  };
  const persona = loadPersona(options.persona ?? 'terse');
  const run = await runPersona(
    persona,
    async answers => (await call({ action: 'answer', answers })) as Step,
    async () => (await call({ action: 'status', idea: persona.idea })) as Step
  );
  if (run.final.state !== 'complete') throw new Error(`the brief is ${run.final.state}`);
  const confirmed = await call({ action: 'confirm', confirmation: 'Yes, that is the brief.' });
  if (confirmed.state !== 'confirmed') {
    throw new Error(`confirm left the brief ${confirmed.state}: ${JSON.stringify(confirmed)}`);
  }
  const evaluation = await evaluateBriefFile(dir, options);
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), storyboardFor(evaluation));
  const approved = await call({
    action: 'approve-storyboard',
    confirmation: 'Yes, approve the storyboard.',
  });
  if (approved.state !== 'approved') {
    throw new Error(
      `approve-storyboard left the brief ${approved.state}: ${JSON.stringify(approved)}`
    );
  }
  return evaluateBriefFile(dir, options);
}
