/**
 * Effect Layer Implementations
 *
 * Provides both Live (production) and Test (mocked) implementations
 * of all Effect services used by the compiler.
 *
 * @module effects/layers
 */

import { constants } from 'node:fs';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { Effect, Layer } from 'effect';
import { FileSystemService, IOError } from './FileSystem.js';
import { LoggerService, type LogLevel } from './Logger.js';

/**
 * Live FileSystem implementation (uses Node.js fs/promises)
 */
export const FileSystemLive = Layer.succeed(FileSystemService, {
  readFile: (path: string) =>
    Effect.tryPromise({
      try: () => readFile(path, 'utf-8'),
      catch: error => new IOError(`Failed to read file: ${path}`, path, error),
    }),

  writeFile: (path: string, content: string) =>
    Effect.tryPromise({
      try: () => writeFile(path, content, 'utf-8'),
      catch: error => new IOError(`Failed to write file: ${path}`, path, error),
    }),

  fileExists: (path: string) =>
    Effect.tryPromise({
      try: async () => {
        await access(path, constants.F_OK);
        return true;
      },
      catch: () => new IOError(`Cannot access file: ${path}`, path),
    }).pipe(Effect.catchAll(() => Effect.succeed(false))),

  readDir: (path: string) =>
    Effect.tryPromise({
      try: () => readdir(path),
      catch: error => new IOError(`Failed to read directory: ${path}`, path, error),
    }),
});

/**
 * Test FileSystem implementation (in-memory mock)
 */
export const FileSystemTest = Layer.succeed(FileSystemService, {
  readFile: (path: string) => Effect.succeed(`// Mock content for ${path}`),

  writeFile: (_path: string, _content: string) => Effect.succeed(undefined),

  fileExists: (_path: string) => Effect.succeed(true),

  readDir: (_path: string) => Effect.succeed([]),
});

/**
 * Live Logger implementation (uses console)
 */
export const LoggerLive = Layer.succeed(LoggerService, {
  debug: (message: string) => Effect.sync(() => console.debug(`[DEBUG] ${message}`)),

  info: (message: string) => Effect.sync(() => console.info(`[INFO] ${message}`)),

  warn: (message: string) => Effect.sync(() => console.warn(`[WARN] ${message}`)),

  error: (message: string) => Effect.sync(() => console.error(`[ERROR] ${message}`)),

  log: (level: LogLevel, message: string) =>
    Effect.sync(() => {
      const prefix = `[${level.toUpperCase()}]`;
      switch (level) {
        case 'debug':
          console.debug(`${prefix} ${message}`);
          break;
        case 'info':
          console.info(`${prefix} ${message}`);
          break;
        case 'warn':
          console.warn(`${prefix} ${message}`);
          break;
        case 'error':
          console.error(`${prefix} ${message}`);
          break;
      }
    }),
});

/**
 * Test Logger implementation (silent - no output)
 */
export const LoggerTest = Layer.succeed(LoggerService, {
  debug: (_message: string) => Effect.succeed(undefined),
  info: (_message: string) => Effect.succeed(undefined),
  warn: (_message: string) => Effect.succeed(undefined),
  error: (_message: string) => Effect.succeed(undefined),
  log: (_level: LogLevel, _message: string) => Effect.succeed(undefined),
});

/**
 * Main production layer (FileSystem + Logger)
 *
 * Use this in production CLI and VS Code extension.
 */
export const MainLayer = Layer.mergeAll(FileSystemLive, LoggerLive);

/**
 * Test layer (Mocked FileSystem + Silent Logger)
 *
 * Use this in unit tests for fast, isolated testing.
 */
export const TestLayer = Layer.mergeAll(FileSystemTest, LoggerTest);
