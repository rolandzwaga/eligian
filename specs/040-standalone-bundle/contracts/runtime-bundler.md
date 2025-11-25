# Contract: Runtime Bundler

**Module**: `packages/cli/src/bundler/runtime-bundler.ts`

## Purpose

Bundles the Eligius runtime library with the compiled configuration into a single browser-compatible JavaScript file using esbuild.

## Public API

```typescript
import { Effect } from 'effect';

/**
 * Bundle Eligius runtime with embedded configuration
 *
 * @param config - Runtime bundle configuration
 * @returns Effect that resolves to bundled JavaScript content
 */
export function bundleRuntime(
  config: RuntimeBundleConfig
): Effect.Effect<string, RuntimeBundleError>;

/**
 * Configuration for runtime bundling
 */
export interface RuntimeBundleConfig {
  /**
   * The compiled Eligius configuration object
   */
  eligiusConfig: IEngineConfiguration;

  /**
   * Operations used in the configuration
   * Used to generate static imports
   */
  usedOperations: string[];

  /**
   * Timeline provider types used
   * Determines which provider libraries to include
   */
  usedProviders: TimelineProviderType[];

  /**
   * Whether to minify the output
   */
  minify: boolean;

  /**
   * Whether to generate source maps
   */
  sourcemap: boolean;

  /**
   * Temporary directory for generated files
   */
  tempDir: string;
}

/**
 * Error during runtime bundling
 */
export class RuntimeBundleError extends Error {
  constructor(
    message: string,
    public readonly esbuildErrors?: string[]
  ) {
    super(message);
    this.name = 'RuntimeBundleError';
  }
}
```

## Behavior

### Bundle Generation Flow

1. **Generate Entry Point**: Create temporary TypeScript file with:
   - Static imports for used operations
   - Static imports for timeline providers
   - Embedded configuration
   - Initialization code

2. **Run esbuild**: Bundle with browser-compatible settings

3. **Return Content**: Return the bundled JavaScript string

### Generated Entry Point Template

```typescript
// Auto-generated Eligius bundle entry point
import { EngineFactory, EligiusEngine } from 'eligius';
import $ from 'jquery';

// Static operation imports (generated from usedOperations)
import { selectElement } from 'eligius';
import { addClass } from 'eligius';
// ... more operations

// Timeline provider imports (conditional)
import { VideoTimelineProvider } from 'eligius';
import videojs from 'video.js';

// Embedded configuration
const CONFIG = {/* stringified eligiusConfig */};

// Resource importer with static imports
const imports = {
  selectElement: { selectElement },
  addClass: { addClass },
  // ... more operations
  EligiusEngine: { EligiusEngine },
  VideoTimelineProvider: { VideoTimelineProvider },
};

class BundledResourceImporter {
  import(name) {
    if (imports.hasOwnProperty(name)) {
      return imports[name];
    }
    throw new Error(`Unknown systemName: ${name}`);
  }
}

// Initialization
function init(containerOrSelector) {
  const factory = new EngineFactory(new BundledResourceImporter(), window);
  const engine = factory.createEngine(CONFIG);
  return engine.init();
}

// Auto-init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector(CONFIG.containerSelector);
  if (container) {
    init(container).catch(console.error);
  }
});

// Export for manual initialization
window.EligiusBundled = { init, CONFIG };
```

### esbuild Configuration

```typescript
const result = await esbuild.build({
  entryPoints: [entryPointPath],
  bundle: true,
  format: 'iife',
  globalName: 'EligiusBundled',
  platform: 'browser',
  target: 'ES2020',
  minify: config.minify,
  sourcemap: config.sourcemap ? 'inline' : false,
  write: false,  // Return content, don't write file
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: [],  // Bundle everything
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
});
```

### Operation Detection

Extract used operations from configuration:

```typescript
function extractUsedOperations(config: IEngineConfiguration): string[] {
  const operations = new Set<string>();

  function walkOperations(ops: IOperationConfiguration[]) {
    for (const op of ops) {
      operations.add(op.systemName);
    }
  }

  // Walk all action configurations
  walkOperations(config.initActions.flatMap(a => a.startOperations));
  walkOperations(config.initActions.flatMap(a => (a as any).endOperations ?? []));
  walkOperations(config.actions.flatMap(a => a.startOperations));
  // ... similar for timelines, eventActions

  return [...operations];
}
```

### Provider Detection

Detect which timeline providers are needed:

```typescript
function extractUsedProviders(config: IEngineConfiguration): TimelineProviderType[] {
  const providers = new Set<TimelineProviderType>();

  if (config.timelineProviderSettings) {
    for (const type of Object.keys(config.timelineProviderSettings)) {
      providers.add(type as TimelineProviderType);
    }
  }

  return [...providers];
}
```

### Dependency Handling

| Provider | Additional Dependencies |
|----------|------------------------|
| `video` | `video.js` bundled |
| `lottie` | `lottie-web` bundled |
| `animationFrame` | None (built-in) |
| `audio` | None (built-in) |

jQuery is always bundled as it's required by Eligius core.

## Error Handling

| Error | Condition | Recovery |
|-------|-----------|----------|
| `RuntimeBundleError` | esbuild fails | Report esbuild error messages |
| `RuntimeBundleError` | Missing operation | Report which operation isn't found |
| `RuntimeBundleError` | Temp file creation fails | Report file system error |

## Example Usage

```typescript
import { Effect } from 'effect';
import { bundleRuntime } from './runtime-bundler';

const bundleJS = await Effect.runPromise(
  bundleRuntime({
    eligiusConfig: compiledConfig,
    usedOperations: ['selectElement', 'addClass', 'animate'],
    usedProviders: ['video'],
    minify: true,
    sourcemap: false,
    tempDir: '/tmp/eligius-bundle'
  })
);

// Write to output
await fs.writeFile('output/bundle.js', bundleJS);
```

## Dependencies

- `esbuild` - JavaScript bundling
- `node:fs/promises` - File operations
- `node:path` - Path handling
- `node:os` - Temp directory

## Test Cases

1. **Minimal config** - Single timeline, few operations
2. **Full config** - Multiple timelines, all operation types
3. **Video provider** - Include video.js
4. **Lottie provider** - Include lottie-web
5. **Minified output** - Verify minification works
6. **Source maps** - Verify inline source maps
7. **Invalid operation** - Error on unknown systemName
8. **Empty config** - Handles edge case gracefully
9. **Bundle size** - Verify tree-shaking reduces size
10. **Browser compatibility** - Output works in ES2020 browsers
