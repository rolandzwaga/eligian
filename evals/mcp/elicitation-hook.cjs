'use strict';
/**
 * Spec 059 FR-030, FR-040 (plan §12): the eval harness's `Elicitation` hook. Claude Code runs it
 * from the eval project's `.claude/settings.json` as
 *
 *   node <this script> <accept|persona> <log> [--sheet s] [--conversation c] [--user-model m]
 *
 * with the hook input on stdin (`spikes.md` §4.2: `hook_event_name`, `mcp_server_name`, `message`,
 * `mode`, `requested_schema`), and reads exactly one JSON object from its stdout.
 *
 * - `accept`: the server `eligian`'s form is accepted with its one required boolean `true`.
 * - `persona`: the user model decides. It runs once, through the command named by
 *   `ELIGIAN_EVAL_USER_COMMAND` (a JSON array) or `claude -p` with the isolation of FR-048 (from
 *   `ELIGIAN_EVAL_ISOLATION`, else `DEFAULT_ISOLATION_ARGS`), with `simulated-user.md` (beside this
 *   script), the persona sheet, the conversation so far, the dialog's message and the confirm
 *   instruction on stdin. Exactly `{"confirm": true}` on the last non-empty line accepts; anything
 *   else declines.
 *
 * Any other server or mode is declined. Every call appends `{ input, raw, answer }` (and `reason`
 * when the user model could not run) to the log. Only `node:` builtins; it never crashes: a
 * failure is a decline.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** The isolation args when `ELIGIAN_EVAL_ISOLATION` is unset; equal to `agentIsolation().args`. */
const DEFAULT_ISOLATION_ARGS = ['--setting-sources', 'project,local'];
const DEFAULT_ISOLATION_ENV = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };

const USER_COMMAND_ENV = 'ELIGIAN_EVAL_USER_COMMAND';
const ISOLATION_ENV = 'ELIGIAN_EVAL_ISOLATION';
const USER_TIMEOUT_MS = 150_000;
const CONFIRM_INSTRUCTION =
  'Do you confirm this? End your reply with one line of JSON: {"confirm": true} or {"confirm": false}.';

const DECLINE = { hookSpecificOutput: { hookEventName: 'Elicitation', action: 'decline' } };

const accept = field => ({
  hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept', content: { [field]: true } },
});

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A form of the `eligian` server: the only dialog the hook answers. */
const isEligianForm = input =>
  isObject(input) && input.mcp_server_name === 'eligian' && input.mode === 'form';

/**
 * The boolean to set: the one key of `required` (Phase 2's forms have exactly one), else the first
 * boolean property; undefined when the schema has neither.
 */
function booleanField(schema) {
  if (!isObject(schema)) return undefined;
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.length === 1 && typeof required[0] === 'string') return required[0];
  return Object.keys(properties).find(
    key => isObject(properties[key]) && properties[key].type === 'boolean'
  );
}

/** The text the decision reads: a `claude -p` JSON output's `result`, else stdout itself. */
function replyText(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    const events = Array.isArray(parsed) ? parsed : [parsed];
    const result = events
      .filter(event => isObject(event) && event.type === 'result')
      .map(event => event.result)
      .pop();
    if (typeof result === 'string') return result;
  } catch {
    // Not `claude -p` JSON: the stdout is the reply.
  }
  return stdout;
}

/** FR-040: the last non-empty line, parsed, is exactly `{"confirm": true}`. */
function confirmed(stdout) {
  const lines = replyText(stdout)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '');
  if (lines.length === 0) return false;
  try {
    const value = JSON.parse(lines[lines.length - 1]);
    return isObject(value) && Object.keys(value).length === 1 && value.confirm === true;
  } catch {
    return false;
  }
}

/**
 * The hook's answer. `reply` is the user model's run in mode `persona` (`{ status, stdout }`),
 * undefined when it did not run; a non-zero or missing status declines.
 */
function decide(input, mode, reply) {
  if (!isEligianForm(input)) return DECLINE;
  const field = booleanField(input.requested_schema);
  if (field === undefined) return DECLINE;
  if (mode === 'accept') return accept(field);
  if (mode !== 'persona' || reply === undefined || reply.status !== 0) return DECLINE;
  return confirmed(typeof reply.stdout === 'string' ? reply.stdout : '') ? accept(field) : DECLINE;
}

/** `<mode> <log> [--sheet s] [--conversation c] [--user-model m]`. */
function parseArgs(argv) {
  const [mode, log, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    if (name === '--sheet') options.sheet = rest[i + 1];
    else if (name === '--conversation') options.conversation = rest[i + 1];
    else if (name === '--user-model') options.userModel = rest[i + 1];
  }
  return { mode, log, ...options };
}

/** The value of `name` in `env`, matching the key case-insensitively (`Path` on Windows). */
function envValue(env, name) {
  const key = Object.keys(env).find(k => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** On win32: the first `<dir>\claude<ext>` over PATH × PATHEXT. */
function findOnPath(name, env) {
  const dirs = (envValue(env, 'PATH') ?? '')
    .split(';')
    .map(dir => dir.replace(/^"(.*)"$/, '$1'))
    .filter(dir => dir !== '');
  const exts = (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(e => e !== '');
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.win32.join(dir, name + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/** One argument quoted for `cmd.exe` and the C runtime's argv parser. */
const winQuote = arg => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;

/**
 * How to start `claude` with `args`: directly, except a `.cmd` / `.bat` shim on Windows, which only
 * starts through `cmd.exe` and so takes one quoted command line.
 */
function claudeInvocation(args, env) {
  if (process.platform !== 'win32') return { command: 'claude', args, shell: false };
  const found = findOnPath('claude', env);
  if (found === undefined) return { command: 'claude', args, shell: false };
  if (!/\.(cmd|bat)$/i.test(found)) return { command: found, args, shell: false };
  return { command: [winQuote(found), ...args.map(winQuote)].join(' '), args: [], shell: true };
}

/** The isolation of FR-048 from `ELIGIAN_EVAL_ISOLATION`, or an error string. */
function isolationFrom(env) {
  const raw = env[ISOLATION_ENV];
  if (raw === undefined || raw === '') {
    return { args: DEFAULT_ISOLATION_ARGS, env: DEFAULT_ISOLATION_ENV };
  }
  try {
    const value = JSON.parse(raw);
    if (
      isObject(value) &&
      Array.isArray(value.args) &&
      value.args.every(arg => typeof arg === 'string') &&
      isObject(value.env)
    ) {
      return { args: value.args, env: value.env };
    }
  } catch {
    // Falls through to the error.
  }
  return `${ISOLATION_ENV} is not the JSON of { args, env }`;
}

const readFile = (file, what) => {
  if (file === undefined) return { error: `no --${what} argument` };
  try {
    return { text: fs.readFileSync(file, 'utf8') };
  } catch (error) {
    return { error: `cannot read the ${what} ${file}: ${error.message}` };
  }
};

/** The user model's prompt (FR-040), or `{ error }` naming what could not be read. */
function buildPrompt(input, options) {
  const promptFile = path.join(__dirname, 'simulated-user.md');
  const parts = [
    readFile(promptFile, 'prompt'),
    readFile(options.sheet, 'sheet'),
    readFile(options.conversation, 'conversation'),
  ];
  const failed = parts.find(part => part.error !== undefined);
  if (failed !== undefined) return { error: failed.error };
  const [prompt, sheet, conversation] = parts.map(part => part.text);
  return {
    text: [
      prompt.trim(),
      '## Your persona sheet',
      sheet.trim(),
      '## The conversation so far',
      conversation.trim(),
      '## The dialog the agent shows you',
      String(input.message ?? ''),
      CONFIRM_INSTRUCTION,
      '',
    ].join('\n\n'),
  };
}

/**
 * Mode `persona`: runs the user model once. Returns `{ reply }` (its `{ status, stdout }`) or
 * `{ reason }` when it could not be started.
 */
function runUserModel(input, options, env) {
  const prompt = buildPrompt(input, options);
  if (prompt.error !== undefined) return { reason: prompt.error };
  const userCommand = env[USER_COMMAND_ENV];
  let invocation;
  let childEnv = env;
  let cwd;
  try {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-simulated-user-'));
  } catch (error) {
    return { reason: `cannot create a temp dir: ${error.message}` };
  }
  try {
    if (userCommand !== undefined && userCommand !== '') {
      let command;
      try {
        command = JSON.parse(userCommand);
      } catch {
        command = undefined;
      }
      if (
        !Array.isArray(command) ||
        command.length === 0 ||
        !command.every(part => typeof part === 'string')
      ) {
        return { reason: `${USER_COMMAND_ENV} is not a JSON array of strings` };
      }
      invocation = { command: command[0], args: command.slice(1), shell: false };
    } else {
      if (options.userModel === undefined || options.userModel === '') {
        return { reason: 'no --user-model argument: the user model is not started' };
      }
      const isolation = isolationFrom(env);
      if (typeof isolation === 'string') return { reason: isolation };
      const mcpConfig = path.join(cwd, 'mcp-empty.json');
      fs.writeFileSync(mcpConfig, `${JSON.stringify({ mcpServers: {} })}\n`);
      const args = [
        ...isolation.args,
        '-p',
        '--output-format',
        'json',
        '--model',
        options.userModel,
        '--strict-mcp-config',
        '--mcp-config',
        mcpConfig,
        '--tools',
        '',
      ];
      childEnv = { ...env, ...isolation.env };
      invocation = claudeInvocation(args, childEnv);
    }
    const result = spawnSync(invocation.command, invocation.args, {
      cwd,
      env: childEnv,
      input: prompt.text,
      encoding: 'utf8',
      shell: invocation.shell,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: USER_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    const reply = { status: result.status, stdout: result.stdout ?? '' };
    if (result.error) return { reply, reason: `the user model failed: ${result.error.message}` };
    return { reply };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function appendLog(log, entry) {
  if (typeof log !== 'string' || log === '') return;
  try {
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.appendFileSync(log, `${JSON.stringify(entry)}\n`);
  } catch {
    // The answer still goes out; the record misses one line.
  }
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let input = null;
  let answer = DECLINE;
  let raw = null;
  let reason;
  try {
    input = JSON.parse(await readAll(process.stdin));
    if (options.mode === 'persona' && isEligianForm(input)) {
      const run = runUserModel(input, options, process.env);
      reason = run.reason;
      if (run.reply !== undefined) raw = run.reply.stdout;
      answer = decide(input, options.mode, run.reply);
    } else {
      answer = decide(input, options.mode);
    }
  } catch (error) {
    answer = DECLINE;
    reason = `hook failure: ${error instanceof Error ? error.message : String(error)}`;
  }
  appendLog(options.log, { input, raw, answer, ...(reason === undefined ? {} : { reason }) });
  process.stdout.write(JSON.stringify(answer));
}

module.exports = { DEFAULT_ISOLATION_ARGS, decide };

if (require.main === module) main();
