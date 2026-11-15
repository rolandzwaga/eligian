/**
 * Versions injected at build time (spec 058, FR-013 to FR-015).
 *
 * The CLI build defines `__ELIGIAN_VERSION__` and `__ELIGIUS_VERSION__` through esbuild's `define`.
 * Every other build (vitest, the language package's own dist, the extension) leaves them undefined,
 * so each read is `typeof`-guarded and falls back to `DEVELOPMENT_VERSION`.
 */
declare const __ELIGIAN_VERSION__: string | undefined;
declare const __ELIGIUS_VERSION__: string | undefined;

export const DEVELOPMENT_VERSION = '0.0.0-development';

export const ELIGIAN_VERSION: string =
  typeof __ELIGIAN_VERSION__ === 'string' ? __ELIGIAN_VERSION__ : DEVELOPMENT_VERSION;

export const ELIGIUS_VERSION: string =
  typeof __ELIGIUS_VERSION__ === 'string' ? __ELIGIUS_VERSION__ : DEVELOPMENT_VERSION;
