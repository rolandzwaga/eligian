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
 * Recover the underlying error from an Effect failure Cause.
 *
 * Prefers the typed failure (`Cause.failureOption`); for defects/interruptions
 * it falls back to `Cause.squash`, which surfaces the original thrown value.
 * This replaces the previous manual `toJSON()` -> `_id`/`_tag` unwrapping that
 * relied on FiberFailure's undocumented serialization (pairs with B7/B42).
 */
function causeToError<E>(cause: Cause.Cause<E>): E {
  return Option.getOrElse(Cause.failureOption(cause), () => Cause.squash(cause) as E);
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
        // recovered from the Cause rather than the opaque FiberFailure wrapper
        // that Effect.runPromise rejects with.
        const exit = await Effect.runPromiseExit(
          compile(sourceCode, {
            optimize: true,
            minify: false,
            sourceUri: sourceUri.fsPath,
          })
        );

        if (Exit.isFailure(exit)) {
          const actualError = causeToError(exit.cause) as CompilerError;
          reportCompilationFailure([actualError], sourceCode);
          return;
        }

        const result: IEngineConfiguration = exit.value;

        // Generate output JSON
        const outputJson = JSON.stringify(result, null, 2);

        // Determine output file path
        const inputPath = sourceUri.fsPath;
        const outputPath = inputPath.replace(/\.eligian$/, '.json');

        // Write output file
        try {
          await fs.writeFile(outputPath, outputJson, 'utf-8');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Compilation error: ${message}`);
          return;
        }

        vscode.window.showInformationMessage(`✓ Compiled to ${path.basename(outputPath)}`);

        // Open the output file
        const outputUri = vscode.Uri.file(outputPath);
        const outputDoc = await vscode.workspace.openTextDocument(outputUri);
        await vscode.window.showTextDocument(outputDoc, {
          preview: false,
          viewColumn: vscode.ViewColumn.Beside,
        });
      }
    );
  });
}
