#!/usr/bin/env node

/**
 * Eligian CLI - Command-line compiler for Eligian DSL
 *
 * Compiles .eligian files to Eligius JSON configuration.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { compile, formatErrors } from '@eligian/language';
import chalk from 'chalk';
import { Command } from 'commander';
import { Effect } from 'effect';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');
const packageJson = JSON.parse(packageContent);

/**
 * Exit codes
 */
// const EXIT_SUCCESS = 0; // Not used - success is implicit (no exit())
const EXIT_COMPILE_ERROR = 1;
// const EXIT_INVALID_ARGS = 2; // Not used - Commander handles this
const EXIT_IO_ERROR = 3;

/**
 * CLI options
 */
interface CompileOptions {
  output?: string;
  check: boolean;
  minify: boolean;
  optimize: boolean;
  verbose: boolean;
  quiet: boolean;
}

/**
 * Compile a single .eligian file
 */
async function compileFile(inputPath: string, options: CompileOptions): Promise<void> {
  try {
    // Read source file
    const sourceCode = await fs.readFile(inputPath, 'utf-8');

    if (options.verbose) {
      console.log(chalk.blue(`Compiling ${inputPath}...`));
    }

    // Run compiler pipeline
    const compileEffect = compile(sourceCode, {
      optimize: options.optimize,
      minify: options.minify,
    });

    const result = await Effect.runPromise(compileEffect).catch(error => {
      // Handle compilation errors
      const formatted = formatErrors([error], sourceCode);
      console.error(chalk.red('\nCompilation failed:\n'));

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

      process.exit(EXIT_COMPILE_ERROR);
    });

    // Check-only mode: don't write output
    if (options.check) {
      if (!options.quiet) {
        console.log(chalk.green(`✓ ${inputPath} is valid`));
      }
      return;
    }

    // Generate output JSON
    const outputJson = options.minify ? JSON.stringify(result) : JSON.stringify(result, null, 2);

    // Determine output path
    const outputPath = options.output || inputPath.replace(/\.eligian$/, '.json');

    // Write output file (or stdout if output is -)
    if (outputPath === '-') {
      console.log(outputJson);
    } else {
      await fs.writeFile(outputPath, outputJson, 'utf-8');

      if (!options.quiet) {
        console.log(chalk.green(`✓ Compiled ${inputPath} → ${outputPath}`));
      }
    }
  } catch (error) {
    // Handle I/O errors (file not found, permission denied, etc.)
    if (error instanceof Error) {
      console.error(chalk.red(`I/O Error: ${error.message}`));
      process.exit(EXIT_IO_ERROR);
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
    .action(async (input: string, cmdOptions: Record<string, unknown>) => {
      const options: CompileOptions = {
        output: cmdOptions.output as string | undefined,
        check: cmdOptions.check as boolean,
        minify: cmdOptions.minify as boolean,
        optimize: cmdOptions.optimize !== false, // --no-optimize sets this to false
        verbose: cmdOptions.verbose as boolean,
        quiet: cmdOptions.quiet as boolean,
      };

      await compileFile(input, options);
    });

  // Parse arguments
  program.parse(process.argv);

  // Show help if no arguments
  if (process.argv.length <= 2) {
    program.outputHelp();
  }
}
