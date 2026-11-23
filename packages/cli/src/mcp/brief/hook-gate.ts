/**
 * Spec 059 Phase 3 (FR-013 to FR-020; plan §4): the rules of `eligian brief gate`, the Claude Code
 * plugin's `PreToolUse` hook. Plain async TypeScript: `hookDecision` resolves to a decision and
 * `runBriefGate` to an exit code; no exception crosses either. It reads only (`BRIEF.md`, the
 * key, a settings file, `fs.stat`), never writes, never creates the key, and loads no document.
 *
 * The four rules, in order: 1 `BRIEF.md` (only `eligian_brief` writes it), 4 the record of known
 * programs, 3 a hook that answers an elicitation in any `.claude` settings file, 2 a new program
 * before its directory's brief is approved (the gate's own verdict, `newProgramVerdict`).
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { BRIEF_FILE } from './brief-file.js';
import { newProgramVerdict } from './gate.js';
import { RECORD_FILE } from './known-programs.js';

/**
 * FR-018, SC-024: the hook events that can answer or rewrite an elicitation (plan "Guarded
 * events": code.claude.com/docs/en/hooks, "Decision control", row "Elicitation, ElicitationResult").
 */
export const ELICITATION_HOOK_EVENTS: readonly string[] = ['Elicitation', 'ElicitationResult'];

/** FR-013: the last sentence of every block. */
export const HOOK_SUFFIX = 'This hook comes from the eligian Claude Code plugin.';

/** The part of Claude Code's `PreToolUse` input the rules read (FR-013, FR-014). */
export interface HookInput {
  readonly tool_name: string;
  readonly tool_input: Readonly<Record<string, unknown>>;
  readonly cwd?: string;
}

export type HookRule = 'brief-file' | 'new-program' | 'elicitation-hook' | 'programs-record';

export type HookDecision =
  | { readonly block: false }
  | { readonly block: true; readonly rule: HookRule; readonly reason: string };

const GUARDED_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit']);

const ALLOW: HookDecision = { block: false };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** FR-014: a file-writing tool with a string `tool_input.file_path`, else `undefined`. */
export function parseHookInput(input: unknown): HookInput | undefined {
  if (!isRecord(input)) return undefined;
  const { tool_name, tool_input, cwd } = input;
  if (typeof tool_name !== 'string' || !GUARDED_TOOLS.has(tool_name)) return undefined;
  if (!isRecord(tool_input) || typeof tool_input.file_path !== 'string') return undefined;
  return typeof cwd === 'string' ? { tool_name, tool_input, cwd } : { tool_name, tool_input };
}

/**
 * P11: `oldString` replaced by `newString` literally (no `$&` / `$1` patterns): the first
 * occurrence, or every one with `replaceAll`. An `oldString` that is not found leaves the text
 * (Claude Code refuses that edit); an empty one creates the text of an empty file only.
 */
export function applyEdit(
  text: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): string {
  if (oldString === '') return text === '' ? newString : text;
  if (replaceAll) return text.split(oldString).join(newString);
  const at = text.indexOf(oldString);
  return at < 0 ? text : text.slice(0, at) + newString + text.slice(at + oldString.length);
}

/** The guarded kind of a target, decided from its path alone (before any read). */
type TargetKind = HookRule | undefined;

interface Target {
  readonly input: HookInput;
  readonly file: string;
  readonly cwd: string;
  readonly kind: TargetKind;
}

const RECORD_DIR = path.basename(path.dirname(RECORD_FILE));
const RECORD_NAME = path.basename(RECORD_FILE);
const SETTINGS_FILES: readonly string[] = ['settings.json', 'settings.local.json'];

/** FR-014, FR-015: the resolved target and its rule kind; `undefined` when nothing is guarded. */
function targetOf(input: unknown, platform: NodeJS.Platform): Target | undefined {
  const parsed = parseHookInput(input);
  if (parsed === undefined) return undefined;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const cwd = p.resolve(parsed.cwd ?? process.cwd());
  const file = p.resolve(cwd, parsed.tool_input.file_path as string);
  const name = (s: string) => (platform === 'win32' ? s.toLowerCase() : s);
  const same = (a: string | undefined, b: string) => a !== undefined && name(a) === name(b);
  const segments = file.split(/[\\/]/).filter(s => s !== '');
  const last = segments[segments.length - 1];
  const parent = segments[segments.length - 2];
  let kind: TargetKind;
  if (same(last, BRIEF_FILE)) kind = 'brief-file';
  else if (same(parent, RECORD_DIR) && same(last, RECORD_NAME)) kind = 'programs-record';
  else if (same(parent, '.claude') && SETTINGS_FILES.some(s => same(last, s))) {
    kind = 'elicitation-hook';
  } else if (
    parsed.tool_name === 'Write' &&
    last !== undefined &&
    name(last).endsWith('.eligian')
  ) {
    kind = 'new-program';
  }
  return { input: parsed, file, cwd, kind };
}

const errnoOf = (cause: unknown): string => {
  const code = typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : undefined;
  return typeof code === 'string' ? code : String(cause);
};

const blocked = (rule: HookRule, reason: string): HookDecision => ({ block: true, rule, reason });

/** Rule 3's text before the write: missing or unreadable is an empty file. */
async function readOrEmpty(file: string): Promise<string> {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

/** Rule 3's text after the write (FR-018). */
function textAfter(input: HookInput, before: string): string {
  const { tool_name, tool_input } = input;
  const editOf = (text: string, edit: unknown): string =>
    isRecord(edit) && typeof edit.old_string === 'string' && typeof edit.new_string === 'string'
      ? applyEdit(text, edit.old_string, edit.new_string, edit.replace_all === true)
      : text;
  if (tool_name === 'Write') {
    return typeof tool_input.content === 'string' ? tool_input.content : '';
  }
  if (tool_name === 'Edit') return editOf(before, tool_input);
  const edits = Array.isArray(tool_input.edits) ? tool_input.edits : [];
  return edits.reduce<string>(editOf, before);
}

/** JSON with sorted keys, so two equal hooks have one identity. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The identities of `hooks[event]`: one per hook of a matcher group, else the entry itself. */
function identitiesOf(entries: unknown): Set<string> {
  const found = new Set<string>();
  const list = Array.isArray(entries) ? entries : entries === undefined ? [] : [entries];
  for (const entry of list) {
    if (isRecord(entry) && Array.isArray(entry.hooks)) {
      for (const hook of entry.hooks) found.add(canonicalJson({ matcher: entry.matcher, hook }));
    } else found.add(canonicalJson(entry));
  }
  return found;
}

/** Each guarded event's hook identities, or `'invalid'` for text that is not JSON. */
function hooksOf(text: string): Map<string, Set<string>> | 'invalid' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'invalid';
  }
  const hooks = isRecord(parsed) && isRecord(parsed.hooks) ? parsed.hooks : {};
  return new Map(ELICITATION_HOOK_EVENTS.map(event => [event, identitiesOf(hooks[event])]));
}

/** Rule 3 (FR-018): the event of a hook the write adds, or of an unjudgeable result. */
async function addedElicitationHook(target: Target): Promise<string | undefined> {
  const before = await readOrEmpty(target.file);
  const after = textAfter(target.input, before);
  const added = hooksOf(after);
  if (added === 'invalid') return ELICITATION_HOOK_EVENTS.find(e => after.includes(`"${e}"`));
  const existing = before === '' ? 'invalid' : hooksOf(before);
  for (const event of ELICITATION_HOOK_EVENTS) {
    const old = existing === 'invalid' ? undefined : existing.get(event);
    for (const identity of added.get(event) ?? []) {
      if (old === undefined || !old.has(identity)) return event;
    }
  }
  return undefined;
}

/** Rule 2 (FR-017): the gate's verdict of the program the `Write` would create. */
async function newProgramDecision(target: Target, env: NodeJS.ProcessEnv): Promise<HookDecision> {
  try {
    await fsp.stat(target.file);
    return ALLOW; // it exists: a replace is free (decision 7)
  } catch (cause) {
    const errno = errnoOf(cause);
    if (errno !== 'ENOENT') {
      return blocked('new-program', `${target.file} cannot be checked: ${errno}.`);
    }
  }
  const content = target.input.tool_input.content;
  let result: Awaited<ReturnType<typeof newProgramVerdict>>;
  try {
    result = await newProgramVerdict(
      target.file,
      typeof content === 'string' ? content : '',
      target.cwd,
      env
    );
  } catch (cause) {
    return blocked(
      'new-program',
      `the brief beside ${target.file} cannot be read: ${errnoOf(cause)}.`
    );
  }
  if (result === undefined || result.verdict.verdict === 'runs') return ALLOW;
  const { code } = result.verdict;
  if (code === 'addition-not-briefed') return ALLOW; // the gate's, on the next eligian_check
  return blocked(
    'new-program',
    `${code}: ${target.file} — ${result.briefFile} is ${result.state}. ${result.next}`
  );
}

/** FR-014 to FR-019: the decision on one `PreToolUse` input; never rejects for a guarded read. */
export async function hookDecision(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<HookDecision> {
  const target = targetOf(input, platform);
  switch (target?.kind) {
    case undefined:
      return ALLOW;
    case 'brief-file':
      return blocked(
        'brief-file',
        `${target.file}: BRIEF.md is written only by \`eligian_brief\`: change an answer with \`eligian_brief\` and \`action: answer\`.`
      );
    case 'programs-record':
      return blocked(
        'programs-record',
        `${target.file} is the record of known programs, written only by \`eligian_brief\`: to add existing work, ask the user and call \`eligian_brief\` with \`action: accept-existing\`.`
      );
    case 'elicitation-hook': {
      const event = await addedElicitationHook(target);
      return event === undefined
        ? ALLOW
        : blocked(
            'elicitation-hook',
            `${target.file}: a \`${event}\` hook answers an elicitation instead of the user, so it would sign off a brief the user never saw; the plugin does not let an agent add one (the user can edit the file).`
          );
    }
    case 'new-program':
      return newProgramDecision(target, env);
  }
}

/**
 * FR-013: the subcommand's whole behaviour over its stdin. Not JSON → exit 0; a block → exit 2
 * with the reason; a defect fails closed for a guarded target and open for any other.
 */
export async function runBriefGate(
  stdin: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<{ readonly exitCode: 0 | 2; readonly stderr: string }> {
  let input: unknown;
  try {
    input = JSON.parse(stdin);
  } catch {
    return { exitCode: 0, stderr: '' };
  }
  let decision: HookDecision;
  try {
    decision = await hookDecision(input, env, platform);
  } catch (cause) {
    let target: Target | undefined;
    try {
      target = targetOf(input, platform);
    } catch {
      target = undefined;
    }
    if (target?.kind === undefined) return { exitCode: 0, stderr: '' };
    decision = blocked(target.kind, `${target.file} cannot be checked: ${errnoOf(cause)}.`);
  }
  return decision.block
    ? { exitCode: 2, stderr: `${decision.reason} ${HOOK_SUFFIX}\n` }
    : { exitCode: 0, stderr: '' };
}
