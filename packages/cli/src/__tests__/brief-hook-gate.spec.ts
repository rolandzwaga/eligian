/**
 * Spec 059 Phase 3 (FR-013 to FR-021, Q5, P20; plan §3, §4): the brief hook's gate.
 *
 * T001: `newProgramVerdict` (the verdict of a program that does not exist yet) and
 * `cliGovernanceRoot` (the root the CLI reads governance against, shared with `cliBriefWarnings`).
 * T003: `eligian brief gate` spawned (after a CLI build) and the purity of `hook-gate.ts`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, test } from 'vitest';
import { cliBriefWarnings, cliGovernanceRoot, newProgramVerdict } from '../mcp/brief/gate.js';
import {
  applyEdit,
  ELICITATION_HOOK_EVENTS,
  HOOK_SUFFIX,
  hookDecision,
  runBriefGate,
} from '../mcp/brief/hook-gate.js';
import { findRecordFile, RECORD_FILE, writeRecordText } from '../mcp/brief/known-programs.js';
import { snapshotFiles, tempProject } from './brief-helpers.js';
import { HOOK_CASES, type HookCase, prepareHookCase } from './hook-cases.js';
import { BIN } from './mcp-test-client.js';

const HERE = import.meta.dirname;
const PROGRAM = path.join(HERE, '__fixtures__', 'mcp', 'brief', 'gate', 'program');
const PROGRAM_FILES = ['main.eligian', 'layout.html', 'styles.css'];
const SOURCE = 'timeline "A" in "#s" using raf {}\n';

const temps: string[] = [];

const track = (dir: string): string => {
  temps.push(dir);
  return dir;
};

const tempDir = (prefix: string): string =>
  track(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))));

/** A state dir path that does not exist (inside a temp dir that is removed afterwards). */
const missingStateDir = (): string => path.join(tempDir('eligian-hook-state-'), 'state');

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const putRecord = (root: string, text: string): void => {
  const file = path.join(root, RECORD_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

describe('newProgramVerdict', () => {
  it('a library source is undefined', async () => {
    const dir = track(tempProject());
    const stateDir = missingStateDir();
    const result = await newProgramVerdict(
      path.join(dir, 'talk', 'lib.eligian'),
      '/** x */\nlibrary lib\naction f() [\n]\n',
      dir,
      { ELIGIAN_STATE_DIR: stateDir }
    );
    expect(result).toBeUndefined();
  });

  it('no record and no BRIEF.md: brief-required (Q5)', async () => {
    const dir = track(tempProject());
    expect(findRecordFile(dir)).toBeUndefined();
    const stateDir = missingStateDir();
    const result = await newProgramVerdict(path.join(dir, 'talk', 'main.eligian'), SOURCE, dir, {
      ELIGIAN_STATE_DIR: stateDir,
    });
    expect(result).toBeDefined();
    expect(result?.verdict).toEqual({ verdict: 'refused', code: 'brief-required' });
    expect(result?.state).toBe('none');
    expect(result?.next).toContain('action: status');
    expect(result?.briefFile).toBe(path.join(dir, 'talk', 'BRIEF.md'));
  });

  describe('root', () => {
    it("the record's root when proj/.eligian/programs.json exists", async () => {
      const proj = track(tempProject());
      putRecord(proj, JSON.stringify({ version: 1, programs: [] }));
      const result = await newProgramVerdict(
        path.join(proj, 'a', 'b', 'main.eligian'),
        SOURCE,
        proj,
        { ELIGIAN_STATE_DIR: missingStateDir() }
      );
      expect(result?.root).toBe(proj);
    });

    it("the target's directory without a record, when the target is outside cwd", async () => {
      const proj = track(tempProject());
      const cwd = tempDir('eligian-hook-cwd-');
      expect(findRecordFile(path.join(proj, 'a', 'b'))).toBeUndefined();
      const result = await newProgramVerdict(
        path.join(proj, 'a', 'b', 'main.eligian'),
        SOURCE,
        cwd,
        { ELIGIAN_STATE_DIR: missingStateDir() }
      );
      expect(result?.root).toBe(path.join(proj, 'a', 'b'));
    });

    it('cwd without a record, when the target is inside cwd', async () => {
      const cwd = track(tempProject());
      expect(findRecordFile(cwd)).toBeUndefined();
      const result = await newProgramVerdict(
        path.join(cwd, 'a', 'b', 'main.eligian'),
        SOURCE,
        cwd,
        { ELIGIAN_STATE_DIR: missingStateDir() }
      );
      expect(result?.root).toBe(cwd);
    });

    it("an unparsable programs.json is no record: root equals cliGovernanceRoot's and the decision is the no-record one", async () => {
      const proj = track(tempProject());
      putRecord(proj, 'not json');
      const dir = path.join(proj, 'a', 'b');
      const cwd = tempDir('eligian-hook-cwd-');
      const governance = await cliGovernanceRoot(dir, cwd);
      expect(governance.found).toBeUndefined();
      const result = await newProgramVerdict(path.join(dir, 'main.eligian'), SOURCE, cwd, {
        ELIGIAN_STATE_DIR: missingStateDir(),
      });
      expect(result?.root).toBe(governance.root);
      expect(result?.verdict).toEqual({ verdict: 'refused', code: 'brief-required' });
    });
  });

  it('reads only: the project and the state dir are unchanged', async () => {
    const proj = track(tempProject({ 'talk/layout.html': '<div id="s"></div>\n' }));
    putRecord(proj, writeRecordText([]));
    const stateDir = missingStateDir();
    const before = snapshotFiles(proj);
    expect(fs.existsSync(stateDir)).toBe(false);
    await newProgramVerdict(path.join(proj, 'talk', 'main.eligian'), SOURCE, proj, {
      ELIGIAN_STATE_DIR: stateDir,
    });
    expect(snapshotFiles(proj)).toEqual(before);
    expect(fs.existsSync(stateDir)).toBe(false);
  });
});

describe('cliBriefWarnings is unchanged', () => {
  /** From `cli-brief-warning.spec.ts`: the gate fixture program in a temp project. */
  const project = (): string => {
    const dir = tempDir('eligian-warn-');
    for (const name of PROGRAM_FILES) {
      fs.copyFileSync(path.join(PROGRAM, name), path.join(dir, name));
    }
    return dir;
  };

  it('a record without the program and no BRIEF.md: one "is none" line', async () => {
    const dir = project();
    putRecord(dir, writeRecordText([]));
    const lines = await cliBriefWarnings([path.join(dir, 'main.eligian')], dir, {
      ELIGIAN_STATE_DIR: missingStateDir(),
    });
    expect(lines).toEqual([
      'eligian: main.eligian — BRIEF.md is none; the open questions: eligian_brief {"action":"status","directory":"."}',
    ]);
  });

  it('no record: no line', async () => {
    const dir = project();
    const lines = await cliBriefWarnings([path.join(dir, 'main.eligian')], dir, {
      ELIGIAN_STATE_DIR: missingStateDir(),
    });
    expect(lines).toEqual([]);
  });
});

/** Building a brief through the persona takes a few seconds per case. */
const SLOW = 120_000;

/** The files of `dir`, or `undefined` when it does not exist. */
const filesOf = (dir: string) => (fs.existsSync(dir) ? snapshotFiles(dir) : undefined);

describe('rules', () => {
  it.each(HOOK_CASES.map(hookCase => [hookCase.name, hookCase] as const))(
    '%s',
    async (_name: string, hookCase: HookCase) => {
      const prepared = await prepareHookCase(hookCase);
      try {
        const project = snapshotFiles(prepared.project);
        const home = snapshotFiles(prepared.home);
        const state = filesOf(prepared.stateDir);
        const decision = await hookDecision(
          prepared.input,
          prepared.env,
          hookCase.platform ?? process.platform
        );
        expect(decision.block, JSON.stringify(decision)).toBe(hookCase.expect === 2);
        if (decision.block) {
          expect(decision.rule).toBe(hookCase.rule);
          if (hookCase.code !== undefined) expect(decision.reason).toContain(hookCase.code);
          for (const text of prepared.reasonIncludes) expect(decision.reason).toContain(text);
        }
        expect(snapshotFiles(prepared.project)).toEqual(project);
        expect(snapshotFiles(prepared.home)).toEqual(home);
        expect(filesOf(prepared.stateDir)).toEqual(state);
      } finally {
        prepared.cleanup();
      }
    },
    SLOW
  );

  it('ELICITATION_HOOK_EVENTS is exactly Elicitation and ElicitationResult (plan "Guarded events")', () => {
    expect(ELICITATION_HOOK_EVENTS).toEqual(['Elicitation', 'ElicitationResult']);
  });

  it('the rule 3 cases iterate ELICITATION_HOOK_EVENTS (SC-024)', () => {
    for (const event of ELICITATION_HOOK_EVENTS) {
      expect(HOOK_CASES.some(c => c.name.endsWith(`adding hooks.${event}`) && c.expect === 2)).toBe(
        true
      );
    }
  });
});

describe('runBriefGate', () => {
  const block = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: 'C:\\proj\\talk\\BRIEF.md', content: '# x\n' },
  });

  it('a block exits 2 with the reason on stderr, ending with the plugin line', async () => {
    const result = await runBriefGate(block, { ELIGIAN_STATE_DIR: missingStateDir() }, 'win32');
    expect(result.exitCode).toBe(2);
    expect(result.stderr.endsWith(`${HOOK_SUFFIX}\n`)).toBe(true);
    expect(result.stderr.endsWith('This hook comes from the eligian Claude Code plugin.\n')).toBe(
      true
    );
    expect(result.stderr).toContain('eligian_brief');
    expect(result.stderr).toContain('action: answer');
  });

  it('an allow exits 0 with nothing on stderr', async () => {
    const result = await runBriefGate(
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/proj/BRIEF.md' } }),
      { ELIGIAN_STATE_DIR: missingStateDir() },
      'linux'
    );
    expect(result).toEqual({ exitCode: 0, stderr: '' });
  });

  it("'not json' exits 0", async () => {
    expect(await runBriefGate('not json')).toEqual({ exitCode: 0, stderr: '' });
  });

  it('rule 4 names accept-existing', async () => {
    const result = await runBriefGate(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '/proj/.eligian/programs.json', content: '{}' },
      }),
      { ELIGIAN_STATE_DIR: missingStateDir() },
      'linux'
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('action: accept-existing');
  });
});

describe('applyEdit is literal (P11)', () => {
  it('a new_string holding $& and $1 is inserted verbatim (first occurrence)', () => {
    expect(applyEdit('a "x" b "x"', '"x"', '[$&|$1|$$]', false)).toBe('a [$&|$1|$$] b "x"');
  });

  it('replace_all replaces every occurrence verbatim', () => {
    expect(applyEdit('a "x" b "x"', '"x"', '[$&|$1]', true)).toBe('a [$&|$1] b [$&|$1]');
  });

  it('an old_string that is not found leaves the text as it is', () => {
    expect(applyEdit('abc', 'z', 'y', false)).toBe('abc');
  });
});

const CLI_ROOT = path.resolve(HERE, '..', '..');
/** The spawned cases need a CLI build (`pnpm -C packages/cli build`). */
const built = fs.existsSync(path.join(CLI_ROOT, 'dist', 'cli.mjs'));
const PLUGIN_LINE = 'This hook comes from the eligian Claude Code plugin.\n';

/** The first case of each rule, one allow and the Q5 no-record case (SC-007, SC-009). */
const SPAWNED: readonly HookCase[] = [
  ...new Set(
    [
      ...(['brief-file', 'new-program', 'elicitation-hook', 'programs-record'] as const).map(rule =>
        HOOK_CASES.find(c => c.rule === rule)
      ),
      HOOK_CASES.find(c => c.name === 'fail-open: tool_name Read'),
      HOOK_CASES.find(c => c.name === 'rule 2: a new program, no record and no BRIEF.md (Q5)'),
    ].filter((c): c is HookCase => c !== undefined)
  ),
];

describe('spawned', () => {
  it('holds one case per rule, an allow and the Q5 case', () => {
    expect(SPAWNED.map(c => c.rule ?? 'allow').sort()).toEqual(
      ['allow', 'brief-file', 'elicitation-hook', 'new-program', 'programs-record'].sort()
    );
    expect(SPAWNED.some(c => c.name.endsWith('(Q5)'))).toBe(true);
  });

  test.skipIf(!built).each(SPAWNED.map(hookCase => [hookCase.name, hookCase] as const))(
    'eligian brief gate: %s',
    async (_name: string, hookCase: HookCase) => {
      const prepared = await prepareHookCase(hookCase);
      try {
        const result = spawnSync(process.execPath, [BIN, 'brief', 'gate'], {
          input:
            typeof prepared.input === 'string' ? prepared.input : JSON.stringify(prepared.input),
          env: { ...process.env, ELIGIAN_STATE_DIR: prepared.stateDir },
          cwd: prepared.project,
          encoding: 'utf8',
        });
        expect(result.status, result.stderr).toBe(hookCase.expect);
        expect(result.stdout).toBe('');
        if (hookCase.expect === 2) {
          expect(result.stderr.endsWith(PLUGIN_LINE), result.stderr).toBe(true);
          if (hookCase.code !== undefined) expect(result.stderr).toContain(hookCase.code);
        } else expect(result.stderr).toBe('');
      } finally {
        prepared.cleanup();
      }
    },
    SLOW
  );
});

describe('purity', () => {
  it('hook-gate.ts imports nothing from @eligian/language, effect/ai or ../tools/; no console. or process.stdout', () => {
    const text = fs.readFileSync(
      path.join(CLI_ROOT, 'src', 'mcp', 'brief', 'hook-gate.ts'),
      'utf8'
    );
    const specifiers = [
      ...[...text.matchAll(/\bfrom\s+'([^']+)'/g)].map(m => m[1]),
      ...[...text.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)].map(m => m[1]),
    ];
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.startsWith('@eligian/language'), specifier).toBe(false);
      expect(specifier.startsWith('effect/ai'), specifier).toBe(false);
      expect(specifier.includes('../tools/'), specifier).toBe(false);
    }
    expect(text).not.toMatch(/\bconsole\./);
    expect(text).not.toMatch(/process\.stdout/);
  });
});
