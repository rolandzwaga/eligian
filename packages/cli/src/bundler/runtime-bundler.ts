/**
 * Runtime Bundler Module
 *
 * Bundles the Eligius runtime library with the compiled configuration
 * into a single browser-compatible JavaScript file using esbuild.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HostModule } from '@eligian/language';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import * as esbuild from 'esbuild';
import { type RuntimeBundleConfig, RuntimeBundleError } from './types.js';

/**
 * Extract used operations from an Eligius configuration
 *
 * Walks through all actions, init actions, and timeline events
 * to collect unique operation system names.
 */
export function extractUsedOperations(config: IEngineConfiguration): string[] {
  const operations = new Set<string>();

  function walkOperations(ops: Array<{ systemName?: string }> | undefined) {
    if (!ops) return;
    for (const op of ops) {
      if (op.systemName) {
        operations.add(op.systemName);
      }
    }
  }

  // Walk init actions
  for (const action of config.initActions ?? []) {
    walkOperations(action.startOperations);
    walkOperations(action.endOperations);
  }

  // Walk actions
  for (const action of config.actions ?? []) {
    walkOperations(action.startOperations);
    walkOperations(action.endOperations);
  }

  // Walk event actions (at config level)
  // Note: IEventActionConfiguration only has startOperations (no endOperations)
  for (const eventAction of config.eventActions ?? []) {
    walkOperations(eventAction.startOperations);
  }

  // Walk timelines
  for (const timeline of config.timelines ?? []) {
    for (const timelineAction of timeline.timelineActions ?? []) {
      walkOperations(timelineAction.startOperations);
      walkOperations(timelineAction.endOperations);
    }
  }

  return [...operations];
}

/** The classes the engine resolves by name besides operations. */
export interface UsedSystemEntries {
  /** Position sources, container providers and playlists */
  readonly providers: readonly string[];
  /** Controllers named by getControllerInstance */
  readonly controllers: readonly string[];
}

/**
 * Extract the non-operation system entries the engine resolves at runtime.
 *
 * - **Providers**: the position source, container provider and playlist of
 *   each `timelineProviderSettings` entry (e.g. `RafPositionSource` for
 *   `using raf`), and a timeline's own `positionSource` / `containerProvider`
 *   override (`ScrollPositionSource` for `using scroll`).
 * - **Controllers**: the `systemName` in `getControllerInstance` operation data
 *   (e.g. `DOMEventListenerController`, which interactions and `addController`
 *   emit).
 *
 * They stay apart because `createImporter` checks each map's shape (a
 * position source is not a controller).
 */
export function extractUsedSystemEntries(config: IEngineConfiguration): UsedSystemEntries {
  const providers = new Set<string>();
  const controllers = new Set<string>();
  const addProvider = (entry: unknown) => {
    const systemName = (entry as { systemName?: unknown } | undefined)?.systemName;
    if (typeof systemName === 'string' && systemName) providers.add(systemName);
  };

  const settings = config.timelineProviderSettings as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;
  for (const setting of Object.values(settings ?? {})) {
    for (const key of ['positionSource', 'container', 'playlist']) {
      addProvider(setting?.[key]);
    }
  }
  for (const timeline of config.timelines ?? []) {
    const overrides = timeline as { positionSource?: unknown; containerProvider?: unknown };
    addProvider(overrides.positionSource);
    addProvider(overrides.containerProvider);
  }

  function walkControllers(
    ops: Array<{ systemName?: string; operationData?: { systemName?: string } }> | undefined
  ) {
    for (const op of ops ?? []) {
      if (op.systemName === 'getControllerInstance' && op.operationData?.systemName) {
        controllers.add(op.operationData.systemName);
      }
    }
  }
  for (const action of [...(config.initActions ?? []), ...(config.actions ?? [])]) {
    walkControllers(action.startOperations);
    walkControllers(action.endOperations);
  }
  for (const eventAction of config.eventActions ?? []) {
    walkControllers(eventAction.startOperations);
  }
  for (const timeline of config.timelines ?? []) {
    for (const timelineAction of timeline.timelineActions ?? []) {
      walkControllers(timelineAction.startOperations);
      walkControllers(timelineAction.endOperations);
    }
  }

  return { providers: [...providers], controllers: [...controllers] };
}

/** `{ a, b }`, or `{}` for none: shorthand entries of a generated object literal. */
const shorthand = (names: readonly string[]) =>
  names.length === 0 ? '{}' : `{ ${names.join(', ')} }`;

/**
 * Generate the entry point JavaScript content
 *
 * Creates a self-contained entry point that:
 * - Imports the operations, position sources and controllers the configuration
 *   names from `eligius/runtime` (without the fluent API and
 *   `EligiusResourceImporter`, which reference every operation and controller,
 *   so the bundle keeps only what is used)
 * - Registers them, and the host module's exports, with `createImporter`
 * - Embeds the configuration
 * - Sets up initialization on DOMContentLoaded
 */
export function generateEntryPoint(
  config: IEngineConfiguration,
  allOperations: string[],
  host?: HostModule
): string {
  // Idea #24: host operations and controllers come from the extensions module, not eligius
  const hostOperations = host?.operations ?? [];
  const hostControllers = host?.controllers ?? [];
  const hostFunctions = host?.functions ?? [];
  const operations = allOperations.filter(op => !hostOperations.includes(op));
  const used = extractUsedSystemEntries(config);
  const controllers = used.controllers.filter(name => !hostControllers.includes(name));
  const providers = used.providers;
  const lines: string[] = [];

  // Header comment
  lines.push('// Auto-generated Eligius bundle entry point');
  lines.push('');

  // Core Eligius imports
  lines.push("import { createImporter, EngineFactory } from 'eligius/runtime';");
  lines.push("import $ from 'jquery';");
  lines.push('');

  for (const [comment, names] of [
    ['// Operations', operations],
    ['// Position sources, container providers, playlists', providers],
    ['// Controllers', controllers],
  ] as const) {
    if (names.length === 0) continue;
    lines.push(comment);
    lines.push(`import { ${names.join(', ')} } from 'eligius/runtime';`);
    lines.push('');
  }

  // Host module (idea #24): its operations, controllers and functions
  if (host) {
    lines.push('// Host module (extensions import)');
    lines.push(`import * as host from ${JSON.stringify(host.path.split(path.sep).join('/'))};`);
    lines.push('');
  }

  // Embedded configuration
  lines.push('// Embedded configuration');
  lines.push(`const CONFIG = ${JSON.stringify(config, null, 2)};`);
  lines.push('');

  // The importer: exactly the resources the configuration names. A declared
  // host name the module does not export fails here, at init, with
  // createImporter's message (`resources.operations.<name> must be a function`).
  const hostEntries = (kind: string, names: readonly string[]) =>
    names.map(name => `    ${JSON.stringify(name)}: host.${kind}?.[${JSON.stringify(name)}],`);
  const map = (kind: string, builtIn: readonly string[], hostNames: readonly string[]) => {
    if (hostNames.length === 0) return [`  ${kind}: ${shorthand(builtIn)},`];
    return [
      `  ${kind}: {`,
      ...(builtIn.length > 0 ? [`    ${builtIn.join(', ')},`] : []),
      ...hostEntries(kind, hostNames),
      '  },',
    ];
  };
  lines.push('// Resource importer');
  lines.push('function createBundleImporter() {');
  lines.push('  return createImporter({');
  for (const line of [
    ...map('operations', operations, hostOperations),
    ...map('controllers', controllers, hostControllers),
    `  providers: ${shorthand(providers)},`,
    ...map('functions', [], hostFunctions),
  ]) {
    lines.push(`  ${line}`);
  }
  lines.push('  });');
  lines.push('}');
  lines.push('');

  // Initialization function
  //
  // A standalone bundle exists to be viewed, so it must START playback, not just
  // init(): engine.init() only sets up the position source (it stays INACTIVE),
  // so the timeline clock never advances and the position-0 actions (e.g. the
  // first timeline's view setup) never fire — the page would render blank.
  // engine.start() activates the provider, which emits position 0 immediately and
  // begins ticking. Returns the engine so callers can drive it (pause/seek/etc.).
  // The importer is created here, so its errors reject `ready` instead of
  // stopping the module before window.EligiusBundled exists.
  lines.push('// Initialization');
  lines.push('function init(containerOrSelector) {');
  lines.push('  return Promise.resolve().then(() => {');
  lines.push('    const factory = new EngineFactory(createBundleImporter(), window);');
  lines.push('    const { engine } = factory.createEngine(CONFIG);');
  lines.push('    return engine.init().then(() => engine.start()).then(() => engine);');
  lines.push('  });');
  lines.push('}');
  lines.push('');

  // Auto-init on DOMContentLoaded
  lines.push('// Auto-init on DOMContentLoaded');
  // `ready` resolves with the auto-started engine (eligian dev resumes the
  // playhead through it after a reload)
  lines.push("document.addEventListener('DOMContentLoaded', () => {");
  lines.push('  const container = document.querySelector(CONFIG.containerSelector);');
  lines.push('  if (container) {');
  lines.push('    window.EligiusBundled.ready = init(container);');
  lines.push('    window.EligiusBundled.ready.catch(console.error);');
  lines.push('  }');
  lines.push('});');
  lines.push('');

  // Export for manual initialization
  lines.push('// Export for manual initialization');
  lines.push('window.EligiusBundled = { init, CONFIG, ready: undefined };');
  lines.push('');

  return lines.join('\n');
}

/**
 * Bundle Eligius runtime with embedded configuration
 *
 * Creates a browser-compatible JavaScript bundle containing:
 * - Eligius runtime
 * - Required operations
 * - Position sources, container providers, playlists and controllers
 * - Embedded configuration
 * - Auto-initialization code
 */
export function bundleRuntime(
  config: RuntimeBundleConfig
): Effect.Effect<string, RuntimeBundleError> {
  return Effect.gen(function* () {
    const { eligiusConfig, usedOperations, minify, sourcemap, tempDir, nodePaths, host } = config;

    // Generate entry point content
    const entryPointContent = generateEntryPoint(eligiusConfig, usedOperations, host);

    // Create temporary entry point file
    const entryPointPath = path.join(tempDir, `entry-${Date.now()}.js`);

    yield* Effect.tryPromise({
      try: () => fs.writeFile(entryPointPath, entryPointContent, 'utf-8'),
      catch: error => new RuntimeBundleError(`Failed to write entry point: ${error}`),
    });

    // Run esbuild
    // Using ESM format for modern browsers (94.58% global support per caniuse.com)
    // Benefits: smaller bundles, code splitting support, top-level await, native browser optimization
    const result = yield* Effect.tryPromise({
      try: () =>
        esbuild.build({
          entryPoints: [entryPointPath],
          bundle: true,
          // ESM format for modern browsers - loaded via <script type="module">
          format: 'esm',
          platform: 'browser',
          target: 'ES2020',
          minify,
          sourcemap: sourcemap ? 'inline' : false,
          write: false,
          define: {
            'process.env.NODE_ENV': '"production"',
          },
          // Exclude Node.js built-ins that eligius includes but doesn't need for browser runtime
          // These are used by eligius utility functions that will be deprecated
          external: ['node:fs', 'node:path'],
          loader: {
            '.js': 'js',
          },
          // Additional paths to search for node_modules (like NODE_PATH env var)
          nodePaths: nodePaths ?? [],
          // Errors are returned in RuntimeBundleError and warnings printed below;
          // esbuild's own console output would report each of them twice
          logLevel: 'silent',
        }),
      catch: error => {
        const esbuildError = error as esbuild.BuildFailure;
        const messages = esbuildError.errors?.map(e => e.text) ?? [];
        return new RuntimeBundleError(`esbuild bundling failed: ${error}`, messages);
      },
    }).pipe(
      // Always remove the entry point (it embeds the full config), also when
      // esbuild fails. Cleanup failure is non-fatal: warn but don't abort.
      Effect.ensuring(
        Effect.promise(() =>
          fs
            .unlink(entryPointPath)
            .catch(e => console.warn(`⚠ Cleanup failed: ${e instanceof Error ? e.message : e}`))
        )
      )
    );

    // Get bundled content
    if (!result.outputFiles || result.outputFiles.length === 0) {
      return yield* Effect.fail(new RuntimeBundleError('esbuild produced no output'));
    }

    for (const warning of result.warnings) {
      console.warn(`⚠ esbuild: ${warning.text}`);
    }

    const bundledContent = result.outputFiles[0].text;

    return bundledContent;
  });
}
