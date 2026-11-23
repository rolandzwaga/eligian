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
 * On Windows, the tests of changed files that branch on the platform then also run on Linux
 * (WSL, linux-tests.sh), as CI runs them; see runLinuxTests.
 * Fail fast: the first failing step blocks with its output tail. Fails open (exit 0) on any
 * parse / IO / spawn problem so the hook can never wedge the session.
 *
 * Test it: echo '{"tool_input":{"command":"git commit -m x"}}' | node .claude/hooks/guard-ci-gates.cjs
 */
'use strict';

const { spawn, spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * One entry per `run:` step of ci.yml, by its `name:` (the jobs' shared steps, e.g. Build, are
 * one entry and run once).
 * - 'run': run the step's script as written.
 * - 'tests': replaced by `vitest related --run` on the changed files of each package, once for all
 *   the 'tests' steps (the full suites take ~8 min in a row; CI still runs them).
 * - { skip: reason }: not run here.
 */
const STEP_POLICY = {
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
  'CLI bin tests (startup timings)': { skip: '~15 s of startup timings; CI runs it' },
  'CLI tests with coverage (shard)': 'tests',
  'CLI coverage thresholds (merged shards)': { skip: "merges the CI shards' blob reports" },
  'Language tests with coverage': 'tests',
  'Extension and shared-utils tests': 'tests',
  'MCP on the packed tarball': { skip: 'packs (rebuilds dist) and installs from the registry; CI only' },
};

/** Extra vitest arguments per package (cli: leave out the soak and bin projects). */
const VITEST_ARGS = {
  cli: ['--project', 'cli', '--project', 'cli-timed'],
};

/**
 * The Linux run (WSL) of the tests of changed files that branch on the platform: on Windows their
 * POSIX branch never runs, and CI runs on Linux (2026-11-23: the tests' `sh` stubs called
 * `dirname` under a PATH without it; every local run passed, CI shards 2 and 3 failed). cli adds
 * the bin project, which CI also runs on Linux.
 */
const PLATFORM_BRANCH = /process\.platform|os\.platform\(\)|['"]win32['"]/;
const LINUX_VITEST_ARGS = {
  cli: ['--project', 'cli', '--project', 'cli-timed', '--project', 'cli-bin'],
};
/** linux-tests.sh's exit code when WSL lacks node, pnpm or rsync. */
const LINUX_UNAVAILABLE = 90;

const TAIL_LINES = 60;

/** Test data that must be in git: a gitignored file here passes locally and is missing in CI. */
const FIXTURE_PATHSPECS = [
  ':(glob)**/__fixtures__/**',
  ':(glob)evals/mcp/cases/**',
  ':(glob)evals/mcp/fixtures/**',
  // Not test data: the self-ignoring `.eligian/` a server started on a fixture dir writes there
  // (spec 059 phase 2, FR-001, FR-058); tests recreate it, CI never needs it
  ':(exclude,glob)**/.eligian/**',
];

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
function relatedTestScripts(root, changed, vitestArgs = VITEST_ARGS) {
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
      ...(vitestArgs[pkg] || []),
      ...files.map(q),
    ].join(' '),
  }));
}

/** `F:\a\b` → `/mnt/f/a/b`. */
function wslPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(path.resolve(p));
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p;
}

/**
 * The related tests of the changed files that branch on the platform, run on Linux through WSL
 * (`linux-tests.sh`). null when there is nothing to run or the host is not Windows (there the
 * related tests already ran on POSIX); { skipped } when WSL cannot run them; else as runScript.
 */
function runLinuxTests(root, code) {
  if (process.platform !== 'win32') return null;
  const branching = code.filter(p => {
    if (!/^packages\/[^/]+\/.+\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(p)) return false;
    try {
      return PLATFORM_BRANCH.test(fs.readFileSync(path.join(root, p), 'utf8'));
    } catch {
      return false;
    }
  });
  if (branching.length === 0) return null;
  const scripts = relatedTestScripts(root, branching, LINUX_VITEST_ARGS);
  if (scripts.length === 0) return null;
  const commands = scripts.map(s => s.script).join('\n');

  // The tree goes over as one tar stream (Windows' bsdtar reads NTFS natively; see linux-tests.sh)
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    maxBuffer: 64 << 20,
  })
    .toString()
    .split('\0')
    .filter(p => p && fs.existsSync(path.join(root, p)));
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.isFile()) files.push(rel);
    }
  };
  for (const pkg of fs.readdirSync(path.join(root, 'packages'))) {
    if (fs.existsSync(path.join(root, 'packages', pkg, 'dist'))) walk(`packages/${pkg}/dist`);
  }
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'eligian-linux-gate-'));
  const listFile = path.join(tmp, 'files');
  const commandsFile = path.join(tmp, 'commands.sh');
  fs.writeFileSync(listFile, `${files.join('\0')}\0`);
  fs.writeFileSync(commandsFile, `${commands}\n`);
  const tarExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

  return new Promise(resolve => {
    let settled = false;
    const done = result => {
      if (settled) return;
      settled = true;
      fs.rmSync(tmp, { recursive: true, force: true });
      resolve(result);
    };
    let out = '';
    const tar = spawn(tarExe, ['-c', '-f', '-', '--null', '-T', listFile], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const wsl = spawn(
      'wsl.exe',
      ['-e', 'bash', '-l', wslPath(path.join(__dirname, 'linux-tests.sh')), wslPath(commandsFile)],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    tar.on('error', error => {
      wsl.kill();
      done({ skipped: `${tarExe}: ${error.message}` });
    });
    wsl.on('error', error => done({ skipped: `wsl.exe: ${error.message}` }));
    wsl.stdin.on('error', () => {}); // the script may exit before the stream ends
    tar.stdout.pipe(wsl.stdin);
    wsl.stdout.on('data', c => {
      out += c;
    });
    wsl.stderr.on('data', c => {
      out += c;
    });
    wsl.on('close', status => {
      const lines = out.trim().split(/\r?\n/);
      if (status === LINUX_UNAVAILABLE) done({ skipped: lines.pop() });
      else if (status === 0) done(null);
      else {
        done({
          script: commands,
          out: lines.slice(-TAIL_LINES).join('\n') || `exit ${status}`,
        });
      }
    });
  });
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

  // Test data that exists here but is gitignored: every local gate passes on it and CI's clean
  // checkout lacks it (2026-11-15: `*.log` ignored two evals fixtures; three tests failed on CI only)
  let ignoredFixtures = [];
  try {
    ignoredFixtures = execFileSync(
      'git',
      ['ls-files', '-o', '-i', '--exclude-standard', '--', ...FIXTURE_PATHSPECS],
      { cwd: root, maxBuffer: 64 << 20 }
    )
      .toString()
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    /* fail open */
  }
  if (ignoredFixtures.length > 0) {
    process.stderr.write(
      'BLOCKED: test fixtures exist locally but are gitignored, so CI runs without them:\n\n' +
        ignoredFixtures.map(f => `  ${f}`).join('\n') +
        '\n\nAdd a negation to .gitignore (e.g. `!**/__fixtures__/**/*.log`) and commit them.\n'
    );
    process.exit(2);
  }

  const code = changed.filter(isCodePath);
  if (code.length === 0) process.exit(0);

  const plan = [];
  const planned = new Set();
  for (const step of steps) {
    const policy = STEP_POLICY[step.name];
    const key = policy === 'tests' ? 'tests' : `${step.name}\n${step.script}`;
    if (planned.has(key)) continue;
    planned.add(key);
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

  let linux;
  try {
    linux = await runLinuxTests(root, code);
  } catch (error) {
    linux = { skipped: error.message };
  }
  if (linux && linux.skipped) {
    process.stderr.write(`guard-ci-gates: Linux (WSL) tests skipped (${linux.skipped})\n`);
  } else if (linux) {
    process.stderr.write(
      'BLOCKED: the tests of the changed platform-branching files fail on Linux (WSL), as CI ' +
        `runs them.\n\n$ ${linux.script}\n\n${linux.out}\n\nFix it, then commit again. ` +
        '(Gate: .claude/hooks/guard-ci-gates.cjs → linux-tests.sh.)\n'
    );
    process.exit(2);
  }
  process.exit(0);
})();
