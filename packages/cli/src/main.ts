#!/usr/bin/env node

/**
 * Eligian CLI - Command-line compiler for Eligian DSL
 *
 * Compiles .eligian files to Eligius JSON configuration.
 */

import * as fs from 'node:fs/promises';
import { getCompilerVersion, parseSelectorNotInLayout, STARTERS } from '@eligian/language';
import chalk from 'chalk';
import { Command } from 'commander';
import { Cause, Effect, Exit, Option } from 'effect';
import { AGENT_CLIENTS, parseAgentClients, printConfig, runAgentsSetup } from './agents.js';
import { BundleCompileError, BundleError, createBundle } from './bundler/index.js';
import { DEFAULT_INLINE_THRESHOLD } from './bundler/types.js';
import { parseCheckFormat, parseMaxWarnings, runCheck } from './check/check-command.js';
import { CHECK_FORMATS } from './check/reporters.js';
import { eligianMapPath, parseInlineThreshold, validateOptionCombination } from './cli-options.js';
import {
  AssetError,
  CompilationError,
  type CompileWarning,
  compileFile,
  IOError,
  ParseError,
} from './compile-file.js';
import { startDevServer } from './dev/dev-server.js';
import { FMT_FORMATS, runFmt } from './fmt.js';
import { runInit } from './init.js';
import { deriveDefaultOutputPath, isSamePath } from './output-path.js';
import { parseSmokeFormat, runSmoke, SMOKE_FORMATS } from './smoke/smoke-command.js';

/** The package version, injected by the CLI build (esbuild `define`) */
const version = getCompilerVersion().compiler;

/**
 * Exit codes
 */
const EXIT_COMPILE_ERROR = 1;
const EXIT_IO_ERROR = 3;

/** A repeatable option's accumulator: no commander default, so an absent option is undefined */
const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/** `--client <client>` (spec 058 plan E3): repeatable, not variadic, so `[dir]` stays positional */
const CLIENT_FLAGS = '--client <client>';
const CLIENT_HELP = `agent client: ${AGENT_CLIENTS.join(', ')} (repeatable; default claude)`;

/**
 * `smoke --scenario <file>` (spec 058 FR-034): the parsed scenario. A file that cannot be read,
 * is not JSON or breaks the scenario rules is a usage error: a message on stderr, exit 2.
 */
async function readScenarioFile(file: string) {
  const { parseScenario } = await import('./smoke/scenario.js');
  const refuse = (reason: string): never => {
    console.error(`Error: --scenario ${file}: ${reason}`);
    process.exit(2);
  };
  let text: string;
  try {
    text = await fs.readFile(file, 'utf-8');
  } catch (error) {
    return refuse(`cannot read the file (${error instanceof Error ? error.message : error})`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return refuse(`not JSON (${error instanceof Error ? error.message : error})`);
  }
  const parsed = parseScenario(json);
  return parsed.ok ? parsed.scenario : refuse(parsed.message);
}

/**
 * CLI-specific options (extends library options)
 */
interface CLIOptions {
  output?: string;
  check: boolean;
  minify: boolean;
  optimize: boolean;
  verbose: boolean;
  quiet: boolean;
  bundle: boolean;
  inlineThreshold: number;
  sourcemap: boolean;
  force: boolean;
  /** Idea #14: also write `<out>.eligian-map.json` */
  eligianMap: boolean;
}

/**
 * Format and print a list of formatted compiler errors (parse or compilation)
 * to the console, under the given header.
 */
function printFormattedErrors(
  header: string,
  formatted: Array<{ message: string; codeSnippet?: string; hint?: string }>
): void {
  console.error(chalk.red(`\n${header}\n`));

  for (const err of formatted) {
    console.error(err.message);

    if (err.codeSnippet) {
      console.error(`\n${err.codeSnippet}`);
    }

    if (err.hint) {
      console.error(`\n${chalk.yellow(`💡 ${err.hint}`)}`);
    }

    console.error(); // blank line
  }
}

/**
 * Print non-fatal diagnostics (warnings / info / hints) to stderr. They never
 * change the exit code; stderr keeps `-o -` JSON output on stdout clean.
 */
function printWarnings(warnings: ReadonlyArray<CompileWarning>): void {
  for (const w of warnings) {
    const label = w.severity === 'warning' ? 'Warning' : w.severity === 'info' ? 'Info' : 'Hint';
    console.error(chalk.yellow(`${label}: ${w.message}`));
    console.error(chalk.gray(`  at ${w.file}:${w.line}:${w.column}`));
  }
}

/**
 * Format and print asset errors to console
 */
function printAssetErrors(error: AssetError): void {
  console.error(chalk.red('\nAsset validation failed:\n'));

  for (const err of error.errors) {
    console.error(chalk.red(`✗ ${err.message}`));
    console.error(chalk.gray(`  File: ${err.filePath}`));
    console.error(chalk.gray(`  Path: ${err.absolutePath}`));
    console.error(
      chalk.gray(
        `  Location: ${err.sourceLocation.file}:${err.sourceLocation.line}:${err.sourceLocation.column}`
      )
    );

    if (err.hint) {
      console.error(chalk.yellow(`  💡 ${err.hint}`));
    }

    if (err.details) {
      console.error(chalk.gray(`  Details: ${err.details}`));
    }

    console.error(); // blank line
  }
}

/**
 * Print a compile-step error with its full details (line, snippet, hint) and
 * exit with the matching code. Shared by the compile and bundle commands so
 * bundle mode does not flatten errors to a single message line.
 */
function reportCompileError(error: unknown): never {
  if (error instanceof ParseError) {
    printFormattedErrors('Parse failed:', error.formatted);
    process.exit(EXIT_COMPILE_ERROR);
  }

  if (error instanceof AssetError) {
    printAssetErrors(error);
    process.exit(EXIT_COMPILE_ERROR);
  }

  if (error instanceof CompilationError) {
    printFormattedErrors('Compilation failed:', error.formatted);
    process.exit(EXIT_COMPILE_ERROR);
  }

  if (error instanceof IOError) {
    console.error(chalk.red(`I/O Error: ${error.message}`));
    process.exit(EXIT_IO_ERROR);
  }

  // Unknown error
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(EXIT_IO_ERROR);
}

/**
 * CLI wrapper for compileFile - handles console output and process.exit()
 */
async function compileFileCLI(inputPath: string, options: CLIOptions): Promise<void> {
  if (options.verbose) {
    // Progress goes to stderr: stdout carries the JSON payload when output is '-'
    console.error(chalk.blue(`Compiling ${inputPath}...`));
  }

  try {
    const result = await compileFile(inputPath, {
      minify: options.minify,
      optimize: options.optimize,
    });

    if (!options.quiet) {
      printWarnings(result.warnings);
    }

    if (options.verbose) {
      if (result.assetCount > 0) {
        console.error(chalk.green(`✓ Validated ${result.assetCount} asset(s)`));
      }
    }

    // Check-only mode: don't write output
    if (options.check) {
      if (!options.quiet) {
        console.log(chalk.green(`✓ ${inputPath} is valid`));
      }
      return;
    }

    // Determine output path
    const outputPath = options.output || deriveDefaultOutputPath(inputPath, '.json');

    // Never overwrite the source file
    if (isSamePath(inputPath, outputPath)) {
      console.error(
        chalk.red(
          `Output path '${outputPath}' is the same as the input file; refusing to overwrite.`
        )
      );
      process.exit(EXIT_IO_ERROR);
    }

    // Write output file (or stdout if output is -)
    if (outputPath === '-') {
      console.log(result.json);
    } else {
      await fs.writeFile(outputPath, result.json, 'utf-8');

      if (!options.quiet) {
        console.log(chalk.green(`✓ Compiled ${inputPath} → ${outputPath}`));
      }

      if (options.eligianMap) {
        const mapPath = eligianMapPath(outputPath);
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
        if (!options.quiet) {
          console.log(chalk.green(`✓ Eligian map → ${mapPath}`));
        }
      }
    }
  } catch (error) {
    reportCompileError(error);
  }
}

/**
 * Create a standalone bundle from CLI
 */
async function bundleCLI(inputPath: string, options: CLIOptions): Promise<void> {
  if (options.verbose) {
    console.error(chalk.gray(`Bundling ${inputPath}...`));
  }

  // Use runPromiseExit so we can inspect the Cause directly and distinguish a
  // typed BundleError failure from a defect/interruption. Cause.findErrorOption
  // recovers the typed error (BundleError and its subclasses like OutputExistsError).
  const exit = await Effect.runPromiseExit(
    createBundle(inputPath, {
      outputDir: options.output,
      minify: options.minify,
      inlineThreshold: options.inlineThreshold,
      sourcemap: options.sourcemap,
      force: options.force,
      optimize: options.optimize,
    })
  );

  if (Exit.isSuccess(exit)) {
    const result = exit.value;
    if (!options.quiet) {
      console.log(chalk.green(`✓ Bundle created: ${result.outputDir}`));
      console.log(chalk.gray(`  Files: ${result.stats.fileCount}`));
      console.log(chalk.gray(`  Size: ${(result.stats.totalSize / 1024).toFixed(1)} KB`));
      console.log(chalk.gray(`  Time: ${result.stats.bundleTime}ms`));
    }
    return;
  }

  const failure = Cause.findErrorOption(exit.cause);
  if (Option.isSome(failure) && failure.value instanceof BundleCompileError) {
    reportCompileError(failure.value.compileError);
  }

  if (Option.isSome(failure) && failure.value instanceof BundleError) {
    console.error(chalk.red(`\nBundle failed: ${failure.value.message}`));
    process.exit(EXIT_COMPILE_ERROR);
  }

  // Defect or interruption (not a typed BundleError failure)
  console.error(chalk.red('Unexpected error:'), Cause.pretty(exit.cause));
  process.exit(EXIT_IO_ERROR);
}

/**
 * Main CLI program
 */
export default function main(): void {
  const program = new Command();

  program
    .name('eligian')
    .description('Eligian DSL compiler - compile .eligian files to Eligius JSON')
    .version(version)
    .addHelpText(
      'after',
      "\n`eligian <input>` is short for `eligian compile <input>`.\nRun 'eligian <command> --help' (compile, check, fmt, smoke, dev, init, mcp) for its options."
    );

  // Check command: every diagnostic of every matched file
  program
    .command('check')
    .description('report all errors and warnings in .eligian files (no output is written)')
    .argument('<patterns...>', 'files, directories or globs (e.g. "examples/**/*.eligian")')
    .option('--format <format>', `output format: ${CHECK_FORMATS.join(', ')}`, 'pretty')
    .option('--max-warnings <n>', 'fail when there are more than <n> warnings')
    .option('--warnings-as-errors', 'fail on any warning (same as --max-warnings 0)', false)
    .option('--no-lint', "skip Eligius' configuration lint of the compiled programs (eligius/lint)")
    .option('--no-review', 'skip the review pass')
    .option(
      '--selector-not-in-layout <mode>',
      'in a program that imports a layout, warn about selector ids (ids) or ids and classes (all) that are in the CSS but not in the layout HTML: off, ids, all',
      'ids'
    )
    .action(async (patterns: string[], cmdOptions: Record<string, unknown>) => {
      const format = parseCheckFormat(String(cmdOptions.format));
      if (!format) {
        console.error(
          `Error: --format must be one of ${CHECK_FORMATS.join(', ')} (got "${cmdOptions.format}")`
        );
        process.exit(2);
      }
      let maxWarnings: number | undefined;
      if (cmdOptions.maxWarnings !== undefined) {
        maxWarnings = parseMaxWarnings(String(cmdOptions.maxWarnings));
        if (maxWarnings === undefined) {
          console.error(
            `Error: --max-warnings must be a non-negative whole number (got "${cmdOptions.maxWarnings}")`
          );
          process.exit(2);
        }
      }

      const selectorNotInLayout = parseSelectorNotInLayout(cmdOptions.selectorNotInLayout);
      if (!selectorNotInLayout) {
        console.error(
          `Error: --selector-not-in-layout must be one of off, ids, all (got "${cmdOptions.selectorNotInLayout}")`
        );
        process.exit(2);
      }
      const outcome = await runCheck(patterns, {
        selectorNotInLayout,
        format,
        maxWarnings,
        warningsAsErrors: cmdOptions.warningsAsErrors === true,
        lint: cmdOptions.lint !== false,
        review: cmdOptions.review !== false,
        cwd: process.cwd(),
        version,
      });
      if (outcome.output) console.log(outcome.output);
      if (outcome.error) console.error(chalk.red(outcome.error));
      process.exit(outcome.exitCode);
    });

  // Dev command (idea #23): the presentation in the browser, rebuilt on change
  program
    .command('dev')
    .description(
      'serve a presentation in the browser and rebuild it when its files change (keeps the playhead)'
    )
    .argument('<input>', 'input .eligian file')
    .option('-p, --port <port>', 'port (the next free one is used when it is taken)', '5180')
    .option('--open', 'open it in the default browser', false)
    .action(async (input: string, cmdOptions: Record<string, unknown>) => {
      const port = Number(cmdOptions.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error(`Error: --port must be a port number (got "${cmdOptions.port}")`);
        process.exit(2);
      }
      const time = () => new Date().toTimeString().slice(0, 8);
      const server = await startDevServer(input, {
        port,
        open: cmdOptions.open === true,
        log: line => console.log(chalk.gray(`[${time()}] `) + line),
      });
      console.log(
        `${chalk.green('eligian dev')} ${input} → ${chalk.cyan(server.url)} (Ctrl+C to stop)`
      );
      const stop = () => void server.close().then(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });

  // Smoke command (idea #21): play every timeline headlessly
  program
    .command('smoke')
    .description(
      'play every timeline of .eligian programs headlessly (jsdom) and report runtime failures'
    )
    .argument('<patterns...>', 'files, directories or globs (e.g. "examples/**/*.eligian")')
    .option(
      '--format <format>',
      `output format: ${SMOKE_FORMATS.join(', ')} (ndjson: one JSON object per line, as the run goes)`,
      'pretty'
    )
    .option('--strict', 'also fail on selectElement selectors that match no element', false)
    // Repeatable, not variadic: `<name...>` would swallow the patterns after it
    .option('--timeline <name>', 'play only this timeline (repeatable)', collect)
    .option('--step-timeout-ms <n>', 'longest a single engine step may take (default 10000)')
    .option(
      '--scenario <file>',
      'after the walk, replay this scenario ({ "steps": [...], "assertions"?: [...] } JSON) on a fresh engine; one program file only'
    )
    .option(
      '--determinism',
      'also compare the DOM at every boundary reached by linear play, a straight seek and a seek back from the end (position-nondeterministic)',
      false
    )
    .action(async (patterns: string[], cmdOptions: Record<string, unknown>) => {
      const format = parseSmokeFormat(String(cmdOptions.format));
      if (!format) {
        console.error(
          `Error: --format must be one of ${SMOKE_FORMATS.join(', ')} (got "${cmdOptions.format}")`
        );
        process.exit(2);
      }
      const scenario =
        cmdOptions.scenario === undefined
          ? undefined
          : await readScenarioFile(String(cmdOptions.scenario));
      let stepTimeoutMs: number | undefined;
      if (cmdOptions.stepTimeoutMs !== undefined) {
        stepTimeoutMs = Number(cmdOptions.stepTimeoutMs);
        if (!Number.isInteger(stepTimeoutMs) || stepTimeoutMs <= 0) {
          console.error(
            `Error: --step-timeout-ms must be a positive integer (got "${cmdOptions.stepTimeoutMs}")`
          );
          process.exit(2);
        }
      }
      // ndjson (spec 058 P14): stdout carries only the lines; any other output goes to stderr
      const out =
        format === 'ndjson'
          ? (await import('./mcp/stdio.js')).redirectConsoleToStderr()
          : undefined;
      const outcome = await runSmoke(patterns, {
        format,
        strict: cmdOptions.strict === true,
        cwd: process.cwd(),
        timelines: cmdOptions.timeline as string[] | undefined,
        stepTimeoutMs,
        scenario,
        determinism: cmdOptions.determinism === true,
        ...(out ? { writeLine: (line: string) => void out.write(`${line}\n`) } : {}),
      });
      if (outcome.exitCode === 2) console.error(chalk.red(outcome.output));
      else if (!out) console.log(outcome.output);
      // A pipe write is asynchronous (Windows): process.exit would drop the queued lines
      await out?.flush();
      process.exit(outcome.exitCode);
    });

  // Init command (idea #12): write a starter project
  program
    .command('init')
    .description('create a starter presentation project')
    .argument('[dir]', 'directory to create it in (created if missing)', '.')
    .option(
      '-t, --template <name>',
      `starter: ${STARTERS.map(s => `${s.name} (${s.description})`).join('; ')}`,
      'blank'
    )
    .option('--title <title>', 'presentation title (default: from the directory name)')
    .option('--force', 'overwrite existing files', false)
    .option(CLIENT_FLAGS, CLIENT_HELP, collect)
    .option('--no-agents', 'write no agent files (.mcp.json, AGENTS.md, ...)')
    .action(async (dir: string, cmdOptions: Record<string, unknown>) => {
      const parsed = parseAgentClients(cmdOptions.client as string[] | undefined);
      if ('error' in parsed) {
        console.error(chalk.red(parsed.error));
        process.exit(2);
      }
      const outcome = await runInit(dir, {
        template: String(cmdOptions.template),
        title: cmdOptions.title as string | undefined,
        force: cmdOptions.force === true,
        cwd: process.cwd(),
        agents: cmdOptions.agents === false ? [] : parsed.clients,
      });
      if (outcome.exitCode === 0) console.log(outcome.output);
      else console.error(chalk.red(outcome.output));
      process.exit(outcome.exitCode);
    });

  // Agents command (spec 058 FR-062): the MCP server entry and agent instructions of a project
  program
    .command('agents')
    .description('set up coding agents for an Eligian project')
    .command('setup')
    .description('write or merge the eligian MCP server entry and the AGENTS.md block per client')
    .argument('[dir]', 'project directory', '.')
    .option(CLIENT_FLAGS, CLIENT_HELP, collect)
    .action(async (dir: string, cmdOptions: Record<string, unknown>) => {
      const outcome = await runAgentsSetup(dir, cmdOptions.client as string[] | undefined, {
        cwd: process.cwd(),
      });
      if (outcome.exitCode === 2) console.error(chalk.red(outcome.output));
      else console.log(outcome.output);
      process.exit(outcome.exitCode);
    });

  // Format command (idea #15): the editor's Format Document rules
  program
    .command('fmt')
    .description(
      'format .eligian files (whitespace only); --check lists unformatted files with a diff'
    )
    .argument('<patterns...>', 'files, directories or globs (e.g. "examples/**/*.eligian")')
    .option(
      '--check',
      'report files that are not formatted (the default); exit code 1 if any',
      false
    )
    .option('--write', 'rewrite the files that are not formatted', false)
    .option('--format <format>', `output format: ${FMT_FORMATS.join(', ')}`, 'text')
    .action(async (patterns: string[], cmdOptions: Record<string, unknown>) => {
      if (cmdOptions.check === true && cmdOptions.write === true) {
        console.error('Error: --check and --write cannot be combined');
        process.exit(2);
      }
      if (!(FMT_FORMATS as readonly string[]).includes(String(cmdOptions.format))) {
        console.error(
          `Error: --format must be one of ${FMT_FORMATS.join(', ')} (got "${cmdOptions.format}")`
        );
        process.exit(2);
      }
      const outcome = await runFmt(patterns, {
        write: cmdOptions.write === true,
        cwd: process.cwd(),
        github: cmdOptions.format === 'github',
      });
      if (outcome.output) console.log(outcome.output);
      process.exit(outcome.exitCode);
    });

  // MCP command: the Model Context Protocol server over stdio (effect/ai loads only here)
  program
    .command('mcp')
    .description('start the Model Context Protocol server for coding agents (stdio)')
    .option(
      '--print-config <client>',
      `print the server entry for ${AGENT_CLIENTS.join(', ')} and exit (starts no server)`
    )
    .action(async (cmdOptions: Record<string, unknown>) => {
      if (cmdOptions.printConfig !== undefined) {
        const parsed = parseAgentClients([String(cmdOptions.printConfig)]);
        if ('error' in parsed) {
          console.error(chalk.red(parsed.error));
          process.exit(2);
        }
        // stdout is the config alone (FR-063): return before the server module loads
        console.log(printConfig(parsed.clients[0], process.cwd()));
        return;
      }
      const { runServer } = await import('./mcp/server.js');
      await runServer({ cwd: process.cwd() });
    });

  // Compile command (the default: `eligian <input>` is `eligian compile <input>`)
  program
    .command('compile', { isDefault: true })
    .description('compile an .eligian file to Eligius JSON, or bundle it with --bundle')
    .argument('<input>', 'input .eligian file')
    .option('-o, --output <file>', 'output file (default: <input>.json, use "-" for stdout)')
    .option('--check', 'syntax check only (do not generate output)', false)
    .option(
      '--minify',
      'minify JSON output (no whitespace); with --bundle, minify the bundle JS and CSS',
      false
    )
    .option('--no-optimize', 'disable optimization passes')
    .option('-v, --verbose', 'verbose logging', false)
    .option('-q, --quiet', 'suppress success messages', false)
    .option('--bundle', 'create standalone bundle instead of JSON', false)
    .option(
      '--inline-threshold <bytes>',
      'image inlining threshold in bytes',
      String(DEFAULT_INLINE_THRESHOLD)
    )
    .option('--sourcemap', 'generate source maps in bundle', false)
    .option(
      '--eligian-map',
      'also write <output>.eligian-map.json: compiled actions and operations → .eligian source locations',
      false
    )
    .option('--force', 'overwrite existing output directory', false)
    .action(async (input: string, cmdOptions: Record<string, unknown>) => {
      const inlineThreshold = parseInlineThreshold(String(cmdOptions.inlineThreshold));
      if (inlineThreshold === undefined) {
        console.error(
          `Error: --inline-threshold must be a non-negative whole number of bytes (got "${cmdOptions.inlineThreshold}")`
        );
        process.exit(1);
      }

      const options: CLIOptions = {
        output: cmdOptions.output as string | undefined,
        check: cmdOptions.check as boolean,
        minify: cmdOptions.minify as boolean,
        optimize: cmdOptions.optimize !== false, // --no-optimize sets this to false
        verbose: cmdOptions.verbose as boolean,
        quiet: cmdOptions.quiet as boolean,
        bundle: cmdOptions.bundle as boolean,
        inlineThreshold,
        sourcemap: cmdOptions.sourcemap as boolean,
        force: cmdOptions.force as boolean,
        eligianMap: cmdOptions.eligianMap === true,
      };

      const combinationError = validateOptionCombination(options);
      if (combinationError) {
        console.error(`Error: ${combinationError}`);
        process.exit(1);
      }

      if (options.bundle) {
        await bundleCLI(input, options);
      } else {
        await compileFileCLI(input, options);
      }
    });

  // Parse arguments. The '<input>' argument is required, so Commander prints
  // its usage error and exits during parse() when no input is supplied — no
  // manual "show help if no arguments" fallback is needed (it was unreachable).
  program.parse(process.argv);
}
