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
import { Effect } from 'effect';
import { BundleError, createBundle } from './bundler/index.js';
import { AssetError, CompilationError, compileFile, IOError, ParseError } from './compile-file.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');
const packageJson = JSON.parse(packageContent);

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
 * Format and print parse errors to console
 */
function printParseErrors(error: ParseError): void {
  console.error(chalk.red('\nParse failed:\n'));

  for (const err of error.formatted) {
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
 * Format and print compilation errors to console
 */
function printCompilationErrors(error: CompilationError): void {
  console.error(chalk.red('\nCompilation failed:\n'));

  for (const err of error.formatted) {
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
      printParseErrors(error);
      process.exit(EXIT_COMPILE_ERROR);
    }

    if (error instanceof AssetError) {
      printAssetErrors(error);
      process.exit(EXIT_COMPILE_ERROR);
    }

    if (error instanceof CompilationError) {
      printCompilationErrors(error);
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
  try {
    if (options.verbose) {
      console.log(chalk.gray(`Bundling ${inputPath}...`));
    }

    const result = await Effect.runPromise(
      createBundle(inputPath, {
        outputDir: options.output,
        minify: options.minify,
        inlineThreshold: options.inlineThreshold,
        sourcemap: options.sourcemap,
        force: options.force,
      })
    );

    if (!options.quiet) {
      console.log(chalk.green(`✓ Bundle created: ${result.outputDir}`));
      console.log(chalk.gray(`  Files: ${result.stats.fileCount}`));
      console.log(chalk.gray(`  Size: ${(result.stats.totalSize / 1024).toFixed(1)} KB`));
      console.log(chalk.gray(`  Time: ${result.stats.bundleTime}ms`));
    }
  } catch (error) {
    if (error instanceof BundleError) {
      console.error(chalk.red(`\nBundle failed: ${error.message}`));
      process.exit(EXIT_COMPILE_ERROR);
    }

    // Check for Effect FiberFailure wrapper
    const errorStr = String(error);
    if (errorStr.includes('BundleError') || errorStr.includes('OutputExistsError')) {
      console.error(chalk.red(`\nBundle failed: ${errorStr}`));
      process.exit(EXIT_COMPILE_ERROR);
    }

    // Unknown error
    console.error(chalk.red('Unexpected error:'), error);
    process.exit(EXIT_IO_ERROR);
  }
}

/**
 * Main CLI program
 */
export default function main(): void {
  const program = new Command();

  program
    .name('eligian')
    .description('Eligian DSL compiler - compile .eligian files to Eligius JSON')
    .version(packageJson.version);

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
    .option('--inline-threshold <bytes>', 'image inlining threshold in bytes', '51200')
    .option('--sourcemap', 'generate source maps in bundle', false)
    .option('--force', 'overwrite existing output directory', false)
    .action(async (input: string, cmdOptions: Record<string, unknown>) => {
      const options: CLIOptions = {
        output: cmdOptions.output as string | undefined,
        check: cmdOptions.check as boolean,
        minify: cmdOptions.minify as boolean,
        optimize: cmdOptions.optimize !== false, // --no-optimize sets this to false
        verbose: cmdOptions.verbose as boolean,
        quiet: cmdOptions.quiet as boolean,
        bundle: cmdOptions.bundle as boolean,
        inlineThreshold: parseInt(cmdOptions.inlineThreshold as string, 10),
        sourcemap: cmdOptions.sourcemap as boolean,
        force: cmdOptions.force as boolean,
      };

      if (options.bundle) {
        await bundleCLI(input, options);
      } else {
        await compileFileCLI(input, options);
      }
    });

  // Parse arguments
  program.parse(process.argv);

  // Show help if no arguments
  if (process.argv.length <= 2) {
    program.outputHelp();
  }
}
