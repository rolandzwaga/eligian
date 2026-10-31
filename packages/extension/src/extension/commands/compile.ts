/**
 * compile.ts - Command handler for "Eligian: Compile"
 *
 * Purpose: Registers and handles the compile command. Compiles the active
 * .eligian document to an Eligius JSON configuration, writes it next to the
 * source, and opens the result. Compilation failures are formatted into the
 * shared "Eligian Compiler" output channel.
 *
 * Constitution Principle I: Simplicity & Documentation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type CompilerError, compile, formatErrors } from '@eligian/language';
import { Cause, Effect, Exit, Option } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import * as vscode from 'vscode';

// B49: created once and reused/disposed via context.subscriptions instead of a
// fresh channel allocated on every failed compile.
let compilerOutputChannel: vscode.OutputChannel | null = null;

function getCompilerOutputChannel(): vscode.OutputChannel {
  if (!compilerOutputChannel) {
    compilerOutputChannel = vscode.window.createOutputChannel('Eligian Compiler');
  }
  return compilerOutputChannel;
}

/**
 * Dispose the shared compiler output channel if it was ever created.
 * Wired into `context.subscriptions` by the extension entry point.
 */
export function disposeCompilerOutputChannel(): void {
  compilerOutputChannel?.dispose();
  compilerOutputChannel = null;
}

/**
 * Recover the typed compiler error from an Effect failure Cause.
 *
 * Returns the typed failure (`Cause.findErrorOption`) when it is a tagged
 * CompilerError. Defects (a transformer throwing a TypeError) and interruptions
 * have no tagged error, so they yield `undefined` and are reported as internal
 * errors instead of being mangled into `Unknown Error: {}`.
 */
export function causeToCompilerError<E>(cause: Cause.Cause<E>): CompilerError | undefined {
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error)) {
    const value = error.value as { _tag?: unknown } | null;
    if (typeof value === 'object' && value !== null && typeof value._tag === 'string') {
      return value as unknown as CompilerError;
    }
  }
  return undefined;
}

/**
 * Report a defect or interruption: the full rendered Cause (message + stack) goes
 * to the shared output channel so the user can report or diagnose it.
 */
function reportInternalFailure(cause: Cause.Cause<unknown>): void {
  const outputChannel = getCompilerOutputChannel();
  outputChannel.clear();
  outputChannel.appendLine('Internal compiler error:\n');
  outputChannel.appendLine(Cause.pretty(cause));
  outputChannel.show();
}

/**
 * Render formatted compilation errors into the shared output channel.
 */
function reportCompilationFailure(errors: CompilerError[], sourceCode: string): void {
  const formatted = formatErrors(errors, sourceCode);

  const outputChannel = getCompilerOutputChannel();
  outputChannel.clear();
  outputChannel.appendLine('Compilation failed:\n');

  for (const err of formatted) {
    outputChannel.appendLine(err.message);

    if (err.codeSnippet) {
      outputChannel.appendLine(`\n${err.codeSnippet}`);
    }

    if (err.hint) {
      outputChannel.appendLine(`\n💡 ${err.hint}`);
    }

    outputChannel.appendLine(''); // blank line
  }

  outputChannel.show();
}

/**
 * Compute the output path for a compiled source file: same directory, same base
 * name, `.json` extension (whatever the case of the original extension).
 *
 * Returns `undefined` when the result would be the source file itself (e.g. a
 * source named `x.json` that was switched to the Eligian language mode), so the
 * caller can refuse instead of overwriting the user's source.
 */
export function resolveCompileOutputPath(inputPath: string): string | undefined {
  const parsed = path.parse(inputPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}.json`);
  const normalize = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(outputPath) === normalize(inputPath) ? undefined : outputPath;
}

/**
 * Register the compile command.
 *
 * @returns Disposable for the registered command
 */
export function registerCompileCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('eligian.compile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    const document = editor.document;
    if (document.languageId !== 'eligian') {
      vscode.window.showErrorMessage('Not an Eligian file');
      return;
    }

    // The output is written next to the source, so the document must live on disk.
    if (document.uri.scheme !== 'file') {
      vscode.window.showErrorMessage('Save the file to disk before compiling it');
      return;
    }

    const outputPath = resolveCompileOutputPath(document.uri.fsPath);
    if (!outputPath) {
      vscode.window.showErrorMessage(
        'Cannot compile: the output file would overwrite the source file. Rename the source file.'
      );
      return;
    }

    // Show compilation in progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Compiling Eligian file...',
        cancellable: false,
      },
      async (_progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        const sourceCode = document.getText();
        const sourceUri = document.uri;

        // Compile the document. Use runPromiseExit so the typed CompileError is
        // recovered from the Cause and defects/interruptions are handled too.
        const exit = await Effect.runPromiseExit(
          compile(sourceCode, {
            optimize: true,
            minify: false,
            sourceUri: sourceUri.fsPath,
          })
        );

        if (Exit.isFailure(exit)) {
          const compilerError = causeToCompilerError(exit.cause);
          if (compilerError) {
            reportCompilationFailure([compilerError], sourceCode);
          } else {
            reportInternalFailure(exit.cause);
            vscode.window.showErrorMessage(
              'Compilation failed with an internal error. See the "Eligian Compiler" output.'
            );
          }
          return;
        }

        const result: IEngineConfiguration = exit.value;

        // Generate output JSON
        const outputJson = JSON.stringify(result, null, 2);

        // Write output file
        try {
          await fs.writeFile(outputPath, outputJson, 'utf-8');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Compilation error: ${message}`);
          return;
        }

        vscode.window.showInformationMessage(`✓ Compiled to ${path.basename(outputPath)}`);

        // Open the output file. The compile already succeeded, so a failure here is
        // only a warning, not a command failure.
        try {
          const outputUri = vscode.Uri.file(outputPath);
          const outputDoc = await vscode.workspace.openTextDocument(outputUri);
          await vscode.window.showTextDocument(outputDoc, {
            preview: false,
            viewColumn: vscode.ViewColumn.Beside,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showWarningMessage(
            `Compiled to ${path.basename(outputPath)}, but could not open it: ${message}`
          );
        }
      }
    );
  });
}
