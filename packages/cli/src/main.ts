#!/usr/bin/env node

/**
 * Eligian CLI - Command-line compiler for Eligian DSL
 *
 * Compiles .eligian files to Eligius JSON configuration.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { Cause, Effect, Exit, Option } from 'effect';
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
import { deriveDefaultOutputPath, isSamePath } from './output-path.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');

/**
 * Read the CLI version from package.json. Falls back to '0.0.0' if the file is
 * missing or unreadable so a packaging issue cannot crash the CLI at startup.
 */
async function readPackageVersion(): Promise<string> {
  try {
    const packageContent = await fs.readFile(packagePath, 'utf-8');
    return JSON.parse(packageContent).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const packageVersion = await readPackageVersion();

/**
 * Exit codes
 */
const EXIT_COMPILE_ERROR = 1;
const EXIT_IO_ERROR = 3;

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
    .version(packageVersion)
    .addHelpText(
      'after',
      "\n`eligian <input>` is short for `eligian compile <input>`.\nRun 'eligian compile --help' or 'eligian check --help' for their options."
    );

  // Check command: every diagnostic of every matched file
  program
    .command('check')
    .description('report all errors and warnings in .eligian files (no output is written)')
    .argument('<patterns...>', 'files, directories or globs (e.g. "examples/**/*.eligian")')
    .option('--format <format>', `output format: ${CHECK_FORMATS.join(', ')}`, 'pretty')
    .option('--max-warnings <n>', 'fail when there are more than <n> warnings')
    .option('--warnings-as-errors', 'fail on any warning (same as --max-warnings 0)', false)
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

      const outcome = await runCheck(patterns, {
        format,
        maxWarnings,
        warningsAsErrors: cmdOptions.warningsAsErrors === true,
        cwd: process.cwd(),
        version: packageVersion,
      });
      if (outcome.output) console.log(outcome.output);
      if (outcome.error) console.error(chalk.red(outcome.error));
      process.exit(outcome.exitCode);
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
