/**
 * Runtime Bundler Module
 *
 * Bundles the Eligius runtime library with the compiled configuration
 * into a single browser-compatible JavaScript file using esbuild.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import * as esbuild from 'esbuild';
import {
  type RuntimeBundleConfig,
  RuntimeBundleError,
  type TimelineProviderType,
} from './types.js';

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

/**
 * Extract used timeline providers from configuration
 *
 * Detects which providers are needed based on timelineProviderSettings.
 */
export function extractUsedProviders(config: IEngineConfiguration): TimelineProviderType[] {
  const providers = new Set<TimelineProviderType>();

  const settings = config.timelineProviderSettings;
  if (settings) {
    for (const type of Object.keys(settings)) {
      if (['video', 'animationFrame', 'audio', 'lottie'].includes(type)) {
        providers.add(type as TimelineProviderType);
      }
    }
  }

  return [...providers];
}

/**
 * Extract non-operation system entries the engine resolves at runtime.
 *
 * The engine's resource importer is asked for more than operations:
 * - timeline **position sources** / providers, named in `timelineProviderSettings`
 *   (e.g. `RafPositionSource` for `using raf`);
 * - **controllers**, named as the `systemName` in `getControllerInstance` operation
 *   data (e.g. `DOMEventListenerController`, which `navigate`/`addController` emit).
 *
 * Each is a named `eligius` export keyed by its systemName, so the bundle must
 * import it and register it in the importer map — otherwise the engine throws
 * `Unknown systemName: …` at init/runtime. (These were previously omitted, so any
 * bundle using a provider or controller rendered blank / crashed.)
 */
export function extractUsedSystemEntries(config: IEngineConfiguration): string[] {
  const entries = new Set<string>();

  // Timeline provider position sources / container providers / playlists.
  const settings = config.timelineProviderSettings as
    | Record<string, Record<string, { systemName?: string } | undefined>>
    | undefined;
  if (settings) {
    for (const setting of Object.values(settings)) {
      if (!setting) continue;
      for (const key of ['positionSource', 'containerProvider', 'playlist']) {
        const systemName = setting[key]?.systemName;
        if (systemName) entries.add(systemName);
      }
    }
  }

  // Controllers, referenced by getControllerInstance(operationData.systemName).
  function walkControllers(
    ops: Array<{ systemName?: string; operationData?: { systemName?: string } }> | undefined
  ) {
    if (!ops) return;
    for (const op of ops) {
      if (op.systemName === 'getControllerInstance' && op.operationData?.systemName) {
        entries.add(op.operationData.systemName);
      }
    }
  }
  for (const action of config.initActions ?? []) {
    walkControllers(action.startOperations);
    walkControllers(action.endOperations);
  }
  for (const action of config.actions ?? []) {
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

  return [...entries];
}

/**
 * Generate the entry point JavaScript content
 *
 * Creates a self-contained entry point that:
 * - Imports required operations statically
 * - Imports timeline providers if needed
 * - Embeds the configuration
 * - Sets up initialization on DOMContentLoaded
 */
export function generateEntryPoint(
  config: IEngineConfiguration,
  operations: string[],
  providers: TimelineProviderType[]
): string {
  const lines: string[] = [];

  // Header comment
  lines.push('// Auto-generated Eligius bundle entry point');
  lines.push('');

  // Core Eligius imports
  lines.push("import { EngineFactory, EligiusEngine } from 'eligius';");
  lines.push("import $ from 'jquery';");
  lines.push('');

  // Operation imports
  if (operations.length > 0) {
    lines.push('// Operation imports');
    for (const op of operations) {
      lines.push(`import { ${op} } from 'eligius';`);
    }
    lines.push('');
  }

  // Provider imports
  if (providers.includes('video')) {
    lines.push('// Video provider');
    lines.push("import { VideoTimelineProvider } from 'eligius';");
    lines.push("import videojs from 'video.js';");
    lines.push('');
  }

  if (providers.includes('lottie')) {
    lines.push('// Lottie provider');
    lines.push("import { LottieTimelineProvider } from 'eligius';");
    lines.push("import lottie from 'lottie-web';");
    lines.push('');
  }

  // System entries (timeline position sources, controllers) — resolved by the
  // engine via the importer map, so they must be imported and registered too.
  const systemEntries = extractUsedSystemEntries(config).filter(e => !operations.includes(e));
  if (systemEntries.length > 0) {
    lines.push('// System entries (position sources, controllers)');
    for (const entry of systemEntries) {
      lines.push(`import { ${entry} } from 'eligius';`);
    }
    lines.push('');
  }

  // Embedded configuration
  lines.push('// Embedded configuration');
  lines.push(`const CONFIG = ${JSON.stringify(config, null, 2)};`);
  lines.push('');

  // Build imports map for resource importer
  lines.push('// Resource imports map');
  lines.push('const imports = {');
  for (const op of operations) {
    lines.push(`  ${op}: { ${op} },`);
  }
  lines.push('  EligiusEngine: { EligiusEngine },');
  if (providers.includes('video')) {
    lines.push('  VideoTimelineProvider: { VideoTimelineProvider },');
  }
  if (providers.includes('lottie')) {
    lines.push('  LottieTimelineProvider: { LottieTimelineProvider },');
  }
  for (const entry of systemEntries) {
    lines.push(`  ${entry}: { ${entry} },`);
  }
  lines.push('};');
  lines.push('');

  // BundledResourceImporter class
  lines.push('// Bundled resource importer');
  lines.push('class BundledResourceImporter {');
  lines.push('  import(name) {');
  lines.push('    if (imports.hasOwnProperty(name)) {');
  lines.push('      return imports[name];');
  lines.push('    }');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: This is generated code that should contain the template literal
  lines.push('    throw new Error(`Unknown systemName: ${name}`);');
  lines.push('  }');
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
  lines.push('// Initialization');
  lines.push('function init(containerOrSelector) {');
  lines.push('  const factory = new EngineFactory(new BundledResourceImporter(), window);');
  lines.push('  const { engine } = factory.createEngine(CONFIG);');
  lines.push('  return engine.init().then(() => engine.start()).then(() => engine);');
  lines.push('}');
  lines.push('');

  // Auto-init on DOMContentLoaded
  lines.push('// Auto-init on DOMContentLoaded');
  lines.push("document.addEventListener('DOMContentLoaded', () => {");
  lines.push('  const container = document.querySelector(CONFIG.containerSelector);');
  lines.push('  if (container) {');
  lines.push('    init(container).catch(console.error);');
  lines.push('  }');
  lines.push('});');
  lines.push('');

  // Export for manual initialization
  lines.push('// Export for manual initialization');
  lines.push('window.EligiusBundled = { init, CONFIG };');
  lines.push('');

  return lines.join('\n');
}

/**
 * Bundle Eligius runtime with embedded configuration
 *
 * Creates a browser-compatible JavaScript bundle containing:
 * - Eligius runtime
 * - Required operations
 * - Timeline providers (if needed)
 * - Embedded configuration
 * - Auto-initialization code
 */
export function bundleRuntime(
  config: RuntimeBundleConfig
): Effect.Effect<string, RuntimeBundleError> {
  return Effect.gen(function* () {
    const { eligiusConfig, usedOperations, usedProviders, minify, sourcemap, tempDir, nodePaths } =
      config;

    // Generate entry point content
    const entryPointContent = generateEntryPoint(eligiusConfig, usedOperations, usedProviders);

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
        }),
      catch: error => {
        const esbuildError = error as esbuild.BuildFailure;
        const messages = esbuildError.errors?.map(e => e.text) ?? [];
        return new RuntimeBundleError(`esbuild bundling failed: ${error}`, messages);
      },
    });

    // Clean up temporary entry point file (non-fatal: warn but don't abort)
    yield* Effect.tryPromise({
      try: () => fs.unlink(entryPointPath),
      catch: () => new RuntimeBundleError('Failed to clean up temp file'),
    }).pipe(
      Effect.catchAll(e => Effect.sync(() => console.warn(`⚠ Cleanup failed: ${e.message}`)))
    );

    // Get bundled content
    if (!result.outputFiles || result.outputFiles.length === 0) {
      return yield* Effect.fail(new RuntimeBundleError('esbuild produced no output'));
    }

    const bundledContent = result.outputFiles[0].text;

    return bundledContent;
  });
}
