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
import { BundleError, createBundle } from './bundler/index.js';
import { DEFAULT_INLINE_THRESHOLD } from './bundler/types.js';
import { AssetError, CompilationError, compileFile, IOError, ParseError } from './compile-file.js';

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
 * CLI wrapper for compileFile - handles console output and process.exit()
 */
async function compileFileCLI(inputPath: string, options: CLIOptions): Promise<void> {
  if (options.verbose) {
    console.log(chalk.blue(`Compiling ${inputPath}...`));
  }

  try {
    const result = await compileFile(inputPath, {
      minify: options.minify,
      optimize: options.optimize,
    });

    if (options.verbose) {
      if (result.assetCount > 0) {
        console.log(chalk.green(`✓ Validated ${result.assetCount} asset(s)`));
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
    const outputPath = options.output || inputPath.replace(/\.eligian$/, '.json');

    // Write output file (or stdout if output is -)
    if (outputPath === '-') {
      console.log(result.json);
    } else {
      await fs.writeFile(outputPath, result.json, 'utf-8');

      if (!options.quiet) {
        console.log(chalk.green(`✓ Compiled ${inputPath} → ${outputPath}`));
      }
    }
  } catch (error) {
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
}

/**
 * Create a standalone bundle from CLI
 */
async function bundleCLI(inputPath: string, options: CLIOptions): Promise<void> {
  if (options.verbose) {
    console.log(chalk.gray(`Bundling ${inputPath}...`));
  }

  // Use runPromiseExit so we can inspect the Cause directly: a failed Effect
  // rejects runPromise with an opaque FiberFailure wrapper, against which
  // `instanceof BundleError` always returns false. Cause.failureOption recovers
  // the typed error (BundleError and its subclasses like OutputExistsError).
  const exit = await Effect.runPromiseExit(
    createBundle(inputPath, {
      outputDir: options.output,
      minify: options.minify,
      inlineThreshold: options.inlineThreshold,
      sourcemap: options.sourcemap,
      force: options.force,
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

  const failure = Cause.failureOption(exit.cause);
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
    .version(packageVersion);

  // Compile command (default)
  program
    .argument('<input>', 'input .eligian file')
    .option('-o, --output <file>', 'output file (default: <input>.json, use "-" for stdout)')
    .option('--check', 'syntax check only (do not generate output)', false)
    .option('--minify', 'minify JSON output (no whitespace)', false)
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
    .option('--force', 'overwrite existing output directory', false)
    .action(async (input: string, cmdOptions: Record<string, unknown>) => {
      const inlineThreshold = parseInt(cmdOptions.inlineThreshold as string, 10);
      if (Number.isNaN(inlineThreshold)) {
        console.error(
          `Error: --inline-threshold must be a number (got "${cmdOptions.inlineThreshold}")`
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
      };

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
