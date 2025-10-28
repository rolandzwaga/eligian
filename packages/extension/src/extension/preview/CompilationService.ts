/**
 * CompilationService.ts - Wrapper for Eligian compiler
 *
 * Purpose: Provides a simplified interface for compiling .eligian files
 * within the VS Code extension context. Handles file reading, compilation,
 * and error conversion to VS Code-friendly format.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (pure compilation wrapper)
 */

import { type CompileError, compileString, type IEngineConfiguration } from '@eligian/language';
import { Effect } from 'effect';
import * as vscode from 'vscode';

/**
 * Represents a single compilation error.
 */
export interface CompilationError {
  message: string;
  line?: number;
  column?: number;
  length?: number;
  code?: string;
  severity: 'error' | 'warning';
}

/**
 * Result of compiling an .eligian file.
 */
export interface CompilationResult {
  success: boolean;
  config: IEngineConfiguration | null;
  errors: CompilationError[];
  timestamp: number;
}

/**
 * Service for compiling .eligian files.
 *
 * Responsibilities:
 * - Read file content from disk
 * - Invoke Eligian compiler
 * - Convert compiler errors to VS Code-friendly format
 * - Provide timeout protection for long compilations
 *
 * @example
 * const service = new CompilationService();
 * const result = await service.compile(documentUri);
 * if (result.success) {
 *   console.log('Config:', result.config);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 */
export class CompilationService {
  /**
   * Compile an .eligian file.
   *
   * @param documentUri - URI of the .eligian file to compile
   * @param timeout - Compilation timeout in milliseconds (default: 5000)
   * @returns Compilation result with config or errors
   */
  public async compile(documentUri: vscode.Uri, timeout = 5000): Promise<CompilationResult> {
    const timestamp = Date.now();

    try {
      // Read file content
      const fileContent = await this.readFile(documentUri);

      // Compile with timeout protection (pass URI for asset resolution)
      const compilationPromise = this.compileSource(fileContent, documentUri);
      const timeoutPromise = this.createTimeout(timeout);

      const result = await Promise.race([compilationPromise, timeoutPromise]);

      if ('timeout' in result) {
        return {
          success: false,
          config: null,
          errors: [
            {
              message: `Compilation timed out after ${timeout}ms`,
              severity: 'error',
              code: 'TIMEOUT',
            },
          ],
          timestamp,
        };
      }

      return {
        ...result,
        timestamp,
      };
    } catch (error) {
      // Handle unexpected errors
      return {
        success: false,
        config: null,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
            severity: 'error',
            code: 'UNEXPECTED_ERROR',
          },
        ],
        timestamp,
      };
    }
  }

  /**
   * Read file content from disk.
   */
  private async readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Compile source text to Eligius configuration.
   */
  private async compileSource(
    source: string,
    documentUri: vscode.Uri
  ): Promise<Omit<CompilationResult, 'timestamp'>> {
    try {
      // Use the Eligian compiler with sourceUri for asset resolution (Feature 010)
      const config = await Effect.runPromise(
        compileString(source, {
          sourceUri: documentUri.fsPath,
        })
      );

      return {
        success: true,
        config,
        errors: [],
      };
    } catch (error) {
      // Convert compiler errors to our format
      const errors = this.convertCompilerError(error);

      return {
        success: false,
        config: null,
        errors,
      };
    }
  }

  /**
   * Convert compiler error to CompilationError format.
   */
  private convertCompilerError(error: unknown): CompilationError[] {
    console.log('[CompilationService] Converting compiler error:', error);
    console.log('[CompilationService] Error type:', typeof error);
    console.log('[CompilationService] Has _tag:', error && typeof error === 'object' && '_tag' in error);

    // Handle Effect-style errors (from compiler)
    if (error && typeof error === 'object' && '_tag' in error) {
      const compileError = error as CompileError;

      console.log('[CompilationService] CompileError details:', {
        _tag: compileError._tag,
        message: compileError.message,
        hasLocation: 'location' in compileError,
        location: 'location' in compileError ? compileError.location : undefined,
      });

      const converted = [
        {
          message: compileError.message || 'Compilation failed',
          line: 'location' in compileError ? compileError.location?.line : undefined,
          column: 'location' in compileError ? compileError.location?.column : undefined,
          code: compileError._tag,
          severity: 'error' as const,
        },
      ];

      console.log('[CompilationService] Converted error:', converted);
      return converted;
    }

    // Handle generic errors
    console.log('[CompilationService] Converting as generic error');
    return [
      {
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
        code: 'UNKNOWN_ERROR',
      },
    ];
  }

  /**
   * Create a timeout promise.
   */
  private createTimeout(ms: number): Promise<{ timeout: true }> {
    return new Promise(resolve => {
      setTimeout(() => resolve({ timeout: true }), ms);
    });
  }
}
