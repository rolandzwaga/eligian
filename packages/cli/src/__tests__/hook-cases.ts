/**
 * Spec 059 Phase 3 (SC-007, SC-024; T002): the cases of `eligian brief gate`, shared by the rule
 * spec (`brief-hook-gate.spec.ts`) and the plugin prefilter's spec (`hook-prefilter.spec.ts`).
 *
 * Every SC-007 bullet is one case or more. `<tmp>` in an input stands for the case's temp project
 * and `<home>` for its temp home directory (outside the project, the input's `cwd`); an input that
 * is a string is the raw stdin (`'not json'`). Windows inputs are literal `C:\\…` paths decided
 * with `platform: 'win32'`, so they run on every OS (CI is Linux).
 *
 * The rule-2 briefs live in `<tmp>/talk` (the directory of the program the case writes), built
 * through `eligian_brief` on an in-memory server whose cwd is `<tmp>/talk` (`prepareHookCase`):
 * the terse persona's R3 is `main.eligian`, which must sit beside its brief relative to the root
 * (`references.ts` `checkR3`), so the server's record, and with it the hook's root, is in `talk`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ELICITATION_HOOK_EVENTS, type HookRule } from '../mcp/brief/hook-gate.js';
import { approvedBrief, tempProject } from './brief-helpers.js';
import { loadPersona, runPersona, type Step } from './brief-persona-driver.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

export type HookBrief =
  | 'none'
  | 'open'
  | 'complete'
  | 'confirmed'
  | 'approved'
  | 'approved-other-key';

export interface HookCase {
  readonly name: string;
  /** The hook input (`<tmp>` / `<home>` replaced), or a raw stdin string. */
  readonly input: unknown;
  /** Files of the temp project (relative path → text, or a directory). */
  readonly files?: Readonly<Record<string, string | { readonly dir: true }>>;
  readonly platform?: NodeJS.Platform;
  /** The state of `<tmp>/talk/BRIEF.md`, made through `eligian_brief`; default `none`. */
  readonly brief?: HookBrief;
  readonly expect: 0 | 2;
  readonly rule?: HookRule;
  /** Rule 2: the gate code the reason names. */
  readonly code?: string;
  /** Texts the reason contains (`<tmp>` replaced, `/` turned into the OS separator). */
  readonly reasonIncludes?: readonly string[];
}

/** A program with the terse persona's one view (`hours`, its S2). */
export const BRIEFED_PROGRAM = 'timeline "hours" in "#s" using raf {}\n';
/** A program whose timeline is not in the terse persona's S2. */
export const UNBRIEFED_PROGRAM = 'timeline "extra" in "#s" using raf {}\n';
const LIBRARY = '/** shared */\nlibrary lib\naction f() [\n]\n';

const write = (file: string, content: unknown = '# x\n') => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content },
  cwd: '<tmp>',
});
const edit = (file: string, oldString = 'x', newString = 'y', replaceAll?: boolean) => ({
  tool_name: 'Edit',
  tool_input: {
    file_path: file,
    old_string: oldString,
    new_string: newString,
    ...(replaceAll === undefined ? {} : { replace_all: replaceAll }),
  },
  cwd: '<tmp>',
});
const multiEdit = (
  file: string,
  edits: readonly { old_string: string; new_string: string; replace_all?: boolean }[]
) => ({ tool_name: 'MultiEdit', tool_input: { file_path: file, edits }, cwd: '<tmp>' });
const at = (file: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content: '{}' },
});

/** A hook list (one matcher group, one command) as a settings file holds it under an event. */
const hookOf = (command = 'node approve.js') => [
  { matcher: '', hooks: [{ type: 'command', command }] },
];
const settings = (hooks: Readonly<Record<string, unknown>> = {}, allow: string[] = []): string =>
  `${JSON.stringify({ permissions: { allow }, hooks }, null, 2)}\n`;
const NO_HOOKS = `{\n  "permissions": { "allow": [] },\n  "hooks": {}\n}\n`;
const insertion = (event: string): string =>
  `"hooks": { ${JSON.stringify(event)}: ${JSON.stringify(hookOf())} }`;
/** `"hooks": {}` twice: first nested in `x`, then the top-level `hooks`. */
const TWICE = `{\n  "x": { "hooks": {} },\n  "hooks": {}\n}\n`;

const rule1: HookCase[] = [
  {
    name: 'rule 1: Write of an absent BRIEF.md',
    input: write('<tmp>/talk/BRIEF.md'),
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1: Write of an existing BRIEF.md',
    input: write('<tmp>/talk/BRIEF.md'),
    files: { 'talk/BRIEF.md': '# Brief\n' },
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1: Edit of an existing BRIEF.md',
    input: edit('<tmp>/talk/BRIEF.md', 'Brief', 'Mine'),
    files: { 'talk/BRIEF.md': '# Brief\n' },
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1: Edit of an absent BRIEF.md',
    input: edit('<tmp>/talk/BRIEF.md'),
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1: MultiEdit of BRIEF.md',
    input: multiEdit('<tmp>/BRIEF.md', [{ old_string: 'Brief', new_string: 'Mine' }]),
    files: { 'BRIEF.md': '# Brief\n' },
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1, win32: C:\\proj\\talk\\BRIEF.md',
    input: at('C:\\proj\\talk\\BRIEF.md'),
    platform: 'win32',
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1, win32: c:\\proj\\talk\\brief.md',
    input: at('c:\\proj\\talk\\brief.md'),
    platform: 'win32',
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1, win32: C:/proj/talk/Brief.md',
    input: at('C:/proj/talk/Brief.md'),
    platform: 'win32',
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'rule 1, linux: /proj/talk/brief.md is not BRIEF.md',
    input: at('/proj/talk/brief.md'),
    platform: 'linux',
    expect: 0,
  },
  {
    name: 'rule 1, linux: /proj/talk/BRIEF.md',
    input: at('/proj/talk/BRIEF.md'),
    platform: 'linux',
    expect: 2,
    rule: 'brief-file',
  },
];

const PROGRAM = '<tmp>/talk/main.eligian';
const PROGRAM_SOURCE = 'timeline "A" in "#s" using raf {}\n';

const rule2: HookCase[] = [
  {
    name: 'rule 2: a new program, no record and no BRIEF.md (Q5)',
    input: write(PROGRAM, PROGRAM_SOURCE),
    expect: 2,
    rule: 'new-program',
    code: 'brief-required',
    reasonIncludes: ['<tmp>/talk/BRIEF.md'],
  },
  {
    name: 'rule 2: a new program, a record and no BRIEF.md',
    input: write(PROGRAM, PROGRAM_SOURCE),
    files: { '.eligian/programs.json': '{ "version": 1, "programs": [] }\n' },
    expect: 2,
    rule: 'new-program',
    code: 'brief-required',
  },
  {
    name: 'rule 2: a new proj/a/b program, proj/.eligian/programs.json and no BRIEF.md in a/b',
    input: write('<tmp>/a/b/main.eligian', PROGRAM_SOURCE),
    files: { '.eligian/programs.json': '{ "version": 1, "programs": [] }\n' },
    expect: 2,
    rule: 'new-program',
    code: 'brief-required',
  },
  {
    name: 'rule 2: an open brief',
    input: write(PROGRAM, BRIEFED_PROGRAM),
    brief: 'open',
    expect: 2,
    rule: 'new-program',
    code: 'brief-incomplete',
  },
  {
    name: 'rule 2: a complete, unconfirmed brief',
    input: write(PROGRAM, BRIEFED_PROGRAM),
    brief: 'complete',
    expect: 2,
    rule: 'new-program',
    code: 'brief-not-confirmed',
  },
  {
    name: 'rule 2: a confirmed brief, storyboard not approved',
    input: write(PROGRAM, BRIEFED_PROGRAM),
    brief: 'confirmed',
    expect: 2,
    rule: 'new-program',
    code: 'storyboard-not-approved',
  },
  {
    name: 'rule 2: an approved brief',
    input: write(PROGRAM, BRIEFED_PROGRAM),
    brief: 'approved',
    expect: 0,
  },
  {
    name: 'rule 2: an approved brief signed with another key',
    input: write(PROGRAM, BRIEFED_PROGRAM),
    brief: 'approved-other-key',
    expect: 2,
    rule: 'new-program',
  },
  {
    name: 'rule 2: a timeline not in S2 under an approved brief is the gate’s (addition-not-briefed)',
    input: write(PROGRAM, UNBRIEFED_PROGRAM),
    brief: 'approved',
    expect: 0,
  },
  {
    name: 'rule 2: a new library file',
    input: write('<tmp>/talk/lib.eligian', LIBRARY),
    expect: 0,
  },
  {
    name: 'rule 2: an Edit of an existing program',
    input: edit(PROGRAM, '"A"', '"B"'),
    files: { 'talk/main.eligian': PROGRAM_SOURCE },
    expect: 0,
  },
  {
    name: 'rule 2: a Write replacing an existing program',
    input: write(PROGRAM, UNBRIEFED_PROGRAM),
    files: { 'talk/main.eligian': PROGRAM_SOURCE },
    expect: 0,
  },
  {
    name: 'rule 2: BRIEF.md is a directory (EISDIR): fails closed',
    input: write(PROGRAM, PROGRAM_SOURCE),
    files: { 'talk/BRIEF.md': { dir: true } },
    expect: 2,
    rule: 'new-program',
    reasonIncludes: ['cannot be read'],
  },
];

const SETTINGS = '<tmp>/.claude/settings.json';
const LOCAL = '<tmp>/.claude/settings.local.json';

const perEvent = (event: string): HookCase[] => [
  {
    name: `rule 3: Write of .claude/settings.json adding hooks.${event}`,
    input: write(SETTINGS, settings({ [event]: hookOf() })),
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: Write of .claude/settings.local.json adding hooks.${event}`,
    input: write(LOCAL, settings({ [event]: hookOf() })),
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: Write of <home>/.claude/settings.json adding hooks.${event}`,
    input: write('<home>/.claude/settings.json', settings({ [event]: hookOf() })),
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: Write of <home>/.claude/settings.local.json adding hooks.${event}`,
    input: write('<home>/.claude/settings.local.json', settings({ [event]: hookOf() })),
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: an Edit inserting hooks.${event}`,
    input: edit(SETTINGS, '"hooks": {}', insertion(event)),
    files: { '.claude/settings.json': NO_HOOKS },
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: an Edit of settings.local.json inserting hooks.${event}`,
    input: edit(LOCAL, '"hooks": {}', insertion(event)),
    files: { '.claude/settings.local.json': NO_HOOKS },
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: a MultiEdit inserting hooks.${event}`,
    input: multiEdit(SETTINGS, [
      { old_string: '"allow": []', new_string: '"allow": ["Read"]' },
      { old_string: '"hooks": {}', new_string: insertion(event) },
    ]),
    files: { '.claude/settings.json': NO_HOOKS },
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3: an invalid-JSON result containing "${event}"`,
    input: write(SETTINGS, `{ "hooks": { "${event}": [ `),
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: `rule 3, win32: C:\\proj\\.claude\\settings.json adding hooks.${event}`,
    input: {
      tool_name: 'Write',
      tool_input: {
        file_path: 'C:\\proj\\.claude\\settings.json',
        content: settings({ [event]: hookOf() }),
      },
    },
    platform: 'win32',
    expect: 2,
    rule: 'elicitation-hook',
  },
];

const rule3: HookCase[] = [
  ...ELICITATION_HOOK_EVENTS.flatMap(perEvent),
  {
    name: 'rule 3: a Write that changes only permissions',
    input: write(SETTINGS, settings({}, ['Read'])),
    files: { '.claude/settings.json': settings({}) },
    expect: 0,
  },
  {
    name: 'rule 3: a Write that keeps an existing Elicitation hook unchanged',
    input: write(SETTINGS, settings({ Elicitation: hookOf() }, ['Read'])),
    files: { '.claude/settings.json': settings({ Elicitation: hookOf() }) },
    expect: 0,
  },
  {
    name: 'rule 3: a Write adding a PreToolUse hook',
    input: write(SETTINGS, settings({ PreToolUse: hookOf() })),
    expect: 0,
  },
  {
    name: 'rule 3: "hooks": {} twice, replace_all true adds the top-level Elicitation hook',
    input: edit(SETTINGS, '"hooks": {}', insertion('Elicitation'), true),
    files: { '.claude/settings.json': TWICE },
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: 'rule 3: "hooks": {} twice, replace_all absent replaces only the nested one',
    input: edit(SETTINGS, '"hooks": {}', insertion('Elicitation')),
    files: { '.claude/settings.json': TWICE },
    expect: 0,
  },
  {
    name: 'rule 3: "hooks": {} twice, replace_all false replaces only the nested one',
    input: edit(SETTINGS, '"hooks": {}', insertion('Elicitation'), false),
    files: { '.claude/settings.json': TWICE },
    expect: 0,
  },
  {
    name: 'rule 3, win32: C:\\proj\\.CLAUDE\\Settings.json',
    input: {
      tool_name: 'Write',
      tool_input: {
        file_path: 'C:\\proj\\.CLAUDE\\Settings.json',
        content: settings({ Elicitation: hookOf() }),
      },
    },
    platform: 'win32',
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: 'rule 3, win32: C:\\Users\\u\\.claude\\settings.json adding an Elicitation hook',
    input: {
      tool_name: 'Write',
      tool_input: {
        file_path: 'C:\\Users\\u\\.claude\\settings.json',
        content: settings({ Elicitation: hookOf() }),
      },
    },
    platform: 'win32',
    expect: 2,
    rule: 'elicitation-hook',
  },
  {
    name: 'rule 3, linux: /proj/.CLAUDE/settings.json is not a settings file',
    input: {
      tool_name: 'Write',
      tool_input: {
        file_path: '/proj/.CLAUDE/settings.json',
        content: settings({ Elicitation: hookOf() }),
      },
    },
    platform: 'linux',
    expect: 0,
  },
  {
    name: 'rule 3: settings.json outside .claude',
    input: write('<tmp>/settings.json', settings({ Elicitation: hookOf() })),
    expect: 0,
  },
  {
    name: 'rule 3: .claude/other.json',
    input: write('<tmp>/.claude/other.json', settings({ Elicitation: hookOf() })),
    expect: 0,
  },
];

const rule4: HookCase[] = [
  {
    name: 'rule 4: Write of .eligian/programs.json',
    input: write('<tmp>/.eligian/programs.json', '{ "version": 1, "programs": [] }\n'),
    expect: 2,
    rule: 'programs-record',
  },
  {
    name: 'rule 4: Edit of .eligian/programs.json',
    input: edit('<tmp>/.eligian/programs.json', '[]', '[{}]'),
    files: { '.eligian/programs.json': '{ "version": 1, "programs": [] }\n' },
    expect: 2,
    rule: 'programs-record',
  },
  {
    name: 'rule 4: programs.json elsewhere',
    input: write('<tmp>/other/programs.json', '{}\n'),
    expect: 0,
  },
  {
    name: 'rule 4, win32: C:\\proj\\.eligian\\programs.json',
    input: at('C:\\proj\\.eligian\\programs.json'),
    platform: 'win32',
    expect: 2,
    rule: 'programs-record',
  },
  {
    name: 'rule 4, win32: c:\\proj\\.Eligian\\Programs.json',
    input: at('c:\\proj\\.Eligian\\Programs.json'),
    platform: 'win32',
    expect: 2,
    rule: 'programs-record',
  },
  {
    name: 'rule 4, linux: /proj/.Eligian/programs.json',
    input: at('/proj/.Eligian/programs.json'),
    platform: 'linux',
    expect: 0,
  },
];

const failOpen: HookCase[] = [
  {
    name: 'fail-open: tool_name Read',
    input: { tool_name: 'Read', tool_input: { file_path: '<tmp>/talk/BRIEF.md' }, cwd: '<tmp>' },
    expect: 0,
  },
  { name: 'fail-open: stdin not json', input: 'not json', expect: 0 },
  {
    name: 'fail-open: a missing file_path',
    input: { tool_name: 'Write', tool_input: { content: 'x' }, cwd: '<tmp>' },
    expect: 0,
  },
  {
    name: 'fail-open: a non-string file_path',
    input: { tool_name: 'Write', tool_input: { file_path: 7, content: 'x' }, cwd: '<tmp>' },
    expect: 0,
  },
  {
    name: 'relative file_path: talk/BRIEF.md against cwd (rule 1)',
    input: write('talk/BRIEF.md'),
    expect: 2,
    rule: 'brief-file',
  },
  {
    name: 'relative file_path: talk/main.eligian against cwd, no brief (rule 2)',
    input: write('talk/main.eligian', PROGRAM_SOURCE),
    expect: 2,
    rule: 'new-program',
    code: 'brief-required',
    reasonIncludes: ['<tmp>/talk/BRIEF.md'],
  },
];

/** Every SC-007 case (rule 3's per-event cases iterate `ELICITATION_HOOK_EVENTS`, SC-024). */
export const HOOK_CASES: readonly HookCase[] = [
  ...rule1,
  ...rule2,
  ...rule3,
  ...rule4,
  ...failOpen,
];

// ---------------------------------------------------------------------------------------------
// Materialising a case.

const DOCS = path.join(import.meta.dirname, '__fixtures__', 'mcp', 'docs-mini');

/** The directory of the rule-2 briefs. */
export const BRIEF_DIR = 'talk';

export interface PreparedHookCase {
  /** The temp project (`<tmp>`), its files and brief written. */
  readonly project: string;
  /** The temp home directory (`<home>`). */
  readonly home: string;
  /** The `ELIGIAN_STATE_DIR` of the call: absent for `none`, else the key's (or an empty one). */
  readonly stateDir: string;
  /** The input with `<tmp>` / `<home>` replaced (a raw string as it is). */
  readonly input: unknown;
  /** `ELIGIAN_STATE_DIR`, `HOME` and `USERPROFILE`. */
  readonly env: NodeJS.ProcessEnv;
  /** `reasonIncludes` with the placeholders replaced. */
  readonly reasonIncludes: readonly string[];
  /** Removes every temp directory. */
  readonly cleanup: () => void;
}

const realTemp = (prefix: string): string =>
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

/** `value` with `<tmp>` and `<home>` replaced in every string. */
function replacePlaceholders(value: unknown, project: string, home: string): unknown {
  if (typeof value === 'string')
    return value.split('<tmp>').join(project).split('<home>').join(home);
  if (Array.isArray(value)) return value.map(item => replacePlaceholders(item, project, home));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replacePlaceholders(v, project, home)])
    );
  }
  return value;
}

/** Takes `<project>/talk/BRIEF.md` to `brief` through `eligian_brief` (the terse persona). */
async function briefTo(server: InMemoryServer, dir: string, brief: HookBrief, stateDir: string) {
  if (brief === 'approved' || brief === 'approved-other-key') {
    await approvedBrief(server, dir, { stateDir });
    return;
  }
  const call = async (args: Readonly<Record<string, unknown>>): Promise<any> => {
    const result = await server.callTool('eligian_brief', { directory: dir, ...args });
    if (result.isError) throw new Error(`eligian_brief failed: ${JSON.stringify(result.payload)}`);
    return result.payload;
  };
  const persona = loadPersona('terse');
  const status = () => call({ action: 'status', idea: persona.idea }) as Promise<Step>;
  if (brief === 'open') {
    const step = await status();
    if (step.state !== 'open') throw new Error(`status left the brief ${step.state}`);
    return;
  }
  const run = await runPersona(
    persona,
    async answers => (await call({ action: 'answer', answers })) as Step,
    status
  );
  if (run.final.state !== 'complete') throw new Error(`the brief is ${run.final.state}`);
  if (brief === 'complete') return;
  const confirmed = await call({ action: 'confirm', confirmation: 'Yes, that is the brief.' });
  if (confirmed.state !== 'confirmed') throw new Error(`confirm left the brief ${confirmed.state}`);
}

/**
 * The case on disk: a temp project with its files, a temp home, the brief made through the
 * server (closed before this returns) and the state dir the call reads.
 */
export async function prepareHookCase(hookCase: HookCase): Promise<PreparedHookCase> {
  const project = tempProject();
  const home = realTemp('eligian-hook-home-');
  const states = realTemp('eligian-hook-state-');
  for (const [name, content] of Object.entries(hookCase.files ?? {})) {
    const file = path.join(project, name);
    if (typeof content === 'string') {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    } else fs.mkdirSync(file, { recursive: true });
  }
  const brief = hookCase.brief ?? 'none';
  let stateDir = path.join(states, 'absent');
  if (brief !== 'none') {
    const signing = path.join(states, 'key');
    const dir = path.join(project, BRIEF_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const server = await startInMemoryServer({
      cwd: dir,
      docsRoot: DOCS,
      brief: { stateDir: signing },
    });
    try {
      await briefTo(server, dir, brief, signing);
    } finally {
      await server.close();
    }
    stateDir = signing;
    if (brief === 'approved-other-key') {
      stateDir = path.join(states, 'other');
      fs.mkdirSync(stateDir);
    }
  }
  return {
    project,
    home,
    stateDir,
    input: replacePlaceholders(hookCase.input, project, home),
    env: { ELIGIAN_STATE_DIR: stateDir, HOME: home, USERPROFILE: home },
    reasonIncludes: (hookCase.reasonIncludes ?? []).map(text =>
      path.normalize(String(replacePlaceholders(text, project, home)))
    ),
    cleanup: () => {
      for (const dir of [project, home, states]) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
