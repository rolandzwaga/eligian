#!/usr/bin/env node
/**
 * PreToolUse guard (Bash | PowerShell): runs the CI gates before `git commit` and blocks the
 * commit (exit 2) when one fails.
 *
 * Why: on 2026-11-15 the MCP branch went red on its PR because CI's `typecheck:tests` step (the
 * test files, lib ES2020, no `Array#at`) was never run locally, and the coverage run exposed a
 * write race no gate had hit. Every step below costs seconds here and a full CI round trip there.
 *
 * The commands are NOT copied: the hook reads `.github/workflows/ci.yml` and runs each step's own
 * `run:` script through bash, so the gate cannot drift from CI. Every `run:` step of ci.yml needs a
 * policy in STEP_POLICY; a step without one blocks the commit until it gets one (a gate added to
 * CI but not here only fires after the push). Pattern from the krate-audio repo
 * (tools/hooks/guard-ci-gates.js + tools/lint-gate-mirrors-ci.js).
 *
 * Runs on the working tree (staged + unstaged + untracked), not an export of the index. Only when
 * a code path changed: a commit touching only specs/, root-level Markdown or .claude/ runs nothing.
 * Fail fast: the first failing step blocks with its output tail. Fails open (exit 0) on any
 * parse / IO / spawn problem so the hook can never wedge the session.
 *
 * Test it: echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/guard-ci-gates.cjs
 */
'use strict';

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * One entry per `run:` step of ci.yml, by its `name:`.
 * - 'run': run the step's script as written.
 * - 'tests': replaced by `vitest related --run` on the changed files of each package (the full
 *   `test:coverage:ci` takes ~8 min; CI still runs it).
 * - { skip: reason }: not run here.
 */
const STEP_POLICY = {
  'Install dependencies': { skip: 'environment setup (pnpm install --frozen-lockfile)' },
  'Lint and format check (Biome ci)': 'run',
  Build: 'run',
  'Soak test': { skip: '~5 min; run `pnpm -C packages/cli run test:soak` when touching src/mcp' },
  'MCP inspector gate': 'run',
  'Type check': 'run',
  'Type check tests': 'run',
  'Effect LSP diagnostics': 'run',
  'Check examples (eligian check)': 'run',
  'Format examples (eligian fmt --check)': 'run',
  'Play examples (eligian smoke)': 'run',
  'Run tests with coverage': 'tests',
  'MCP on the packed tarball': { skip: 'packs (rebuilds dist) and installs from the registry; CI only' },
};

/** Extra vitest arguments per package (cli: leave out the soak and bin projects). */
const VITEST_ARGS = {
  cli: ['--project', 'cli', '--project', 'cli-timed'],
};

const TAIL_LINES = 60;

/** A path that can change what CI checks. */
function isCodePath(p) {
  if (p.startsWith('specs/')) return false;
  if (p.startsWith('.claude/')) return false;
  if (p.endsWith('.md') && !p.startsWith('packages/')) return false;
  if (p === 'log.txt') return false;
  return true;
}

/** True when the command is a real `git commit` (not `git log`, `git add x/pre-commit.js`, ...). */
function isGitCommit(cmd) {
  if (!/\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+commit\b/.test(cmd)) return false;
  // `git commit --dry-run` and the read-only forms
  if (/\bgit\s+commit\b[^\n;&|]*--dry-run/.test(cmd)) return false;
  return true;
}

/** The `run:` steps of ci.yml in order: [{ name, script }]. Handles `run: x` and `run: |` blocks. */
function ciSteps(root) {
  const lines = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8').split(/\r?\n/);
  const steps = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const step = /^(\s*)- name:\s*(.+?)\s*$/.exec(line);
    if (step) {
      current = { name: step[2].replace(/^['"]|['"]$/g, ''), indent: step[1].length + 2 };
      continue;
    }
    if (!current) continue;
    const run = /^(\s*)run:\s*(.*)$/.exec(line);
    if (!run || run[1].length !== current.indent) continue;
    let script = run[2].trim();
    if (script === '|' || script === '|-' || script === '>') {
      const body = [];
      let blockIndent = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === '') {
          body.push('');
          continue;
        }
        const ind = l.length - l.trimStart().length;
        if (ind <= current.indent) break;
        if (blockIndent < 0) blockIndent = ind;
        body.push(l.slice(blockIndent));
        i = j;
      }
      script = body.join('\n').trim();
    }
    steps.push({ name: current.name, script });
    current = null;
  }
  return steps;
}

function changedPaths(root) {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '-z'], {
    cwd: root,
    maxBuffer: 64 << 20,
  }).toString();
  const paths = [];
  const entries = out.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    paths.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') i++; // the rename source follows
  }
  return paths;
}

function bash() {
  if (process.platform !== 'win32') return 'bash';
  for (const p of ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']) {
    if (fs.existsSync(p)) return p;
  }
  return 'bash';
}

/** Run a script; null on success, else { out } (the output tail). Throws when it cannot spawn. */
function runScript(root, script) {
  const r = spawnSync(bash(), ['-e', '-c', script], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  if (r.error) throw r.error;
  if (r.status === 0) return null;
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/);
  return { out: text.slice(-TAIL_LINES).join('\n') || `exit ${r.status}` };
}

/** `vitest related` per package over the changed files that still exist. */
function relatedTestScripts(root, changed) {
  const byPackage = new Map();
  for (const p of changed) {
    const m = /^packages\/([^/]+)\/(.+)$/.exec(p);
    if (!m || !/\.(ts|tsx|mts|cts|js|mjs|cjs|langium)$/.test(m[2])) continue;
    if (!fs.existsSync(path.join(root, p))) continue;
    if (!byPackage.has(m[1])) byPackage.set(m[1], []);
    byPackage.get(m[1]).push(m[2]);
  }
  const q = s => `'${s.replace(/'/g, "'\\''")}'`;
  return [...byPackage].map(([pkg, files]) => ({
    name: `vitest related (packages/${pkg}, ${files.length} changed file${files.length === 1 ? '' : 's'})`,
    script: [
      `pnpm -C packages/${pkg} exec vitest related --run --passWithNoTests`,
      ...(VITEST_ARGS[pkg] || []),
      ...files.map(q),
    ].join(' '),
  }));
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => {
      data += c;
    });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

(async () => {
  let cmd = '';
  try {
    const payload = JSON.parse(await readStdin());
    cmd = (payload && payload.tool_input && payload.tool_input.command) || '';
  } catch {
    process.exit(0);
  }
  if (!cmd || !isGitCommit(cmd)) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
  let steps;
  let changed;
  try {
    steps = ciSteps(root);
    changed = changedPaths(root);
  } catch (error) {
    process.stderr.write(`guard-ci-gates: skipped (${error.message})\n`);
    process.exit(0);
  }

  const unknown = steps.filter(s => !(s.name in STEP_POLICY)).map(s => s.name);
  if (unknown.length > 0) {
    process.stderr.write(
      'BLOCKED: .github/workflows/ci.yml has steps the commit gate has no policy for:\n\n' +
        unknown.map(n => `  - ${n}`).join('\n') +
        "\n\nAdd each to STEP_POLICY in .claude/hooks/guard-ci-gates.cjs ('run', 'tests' or " +
        '{ skip: reason }), so a gate added to CI also runs before the commit.\n'
    );
    process.exit(2);
  }

  const code = changed.filter(isCodePath);
  if (code.length === 0) process.exit(0);

  const plan = [];
  for (const step of steps) {
    const policy = STEP_POLICY[step.name];
    if (policy === 'run') plan.push(step);
    else if (policy === 'tests') plan.push(...relatedTestScripts(root, code));
  }

  for (const step of plan) {
    let failure;
    try {
      failure = runScript(root, step.script);
    } catch (error) {
      process.stderr.write(`guard-ci-gates: could not run "${step.name}" (${error.message}); skipped\n`);
      process.exit(0);
    }
    if (failure) {
      process.stderr.write(
        `BLOCKED: the CI step "${step.name}" fails on this tree, so the PR's CI will go red.\n\n` +
          `$ ${step.script}\n\n${failure.out}\n\nFix it, then commit again. ` +
          '(Gate: .claude/hooks/guard-ci-gates.cjs, which runs the ci.yml steps.)\n'
      );
      process.exit(2);
    }
  }
  process.exit(0);
})();
