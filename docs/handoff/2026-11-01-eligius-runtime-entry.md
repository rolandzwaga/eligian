# Hand-off: `eligius/runtime` and `createImporter` for the Eligian bundler

Date: 2026-11-01
From: Eligius, branch `feat/aot-compiler-phase-0` (spec 007, Phase 2, commit `39a15da1`)
Status in Eligius: implemented and tested, unreleased. Eligian pins `eligius@4.0.0`; the changes ship in the next minor release.

## What Eligius now offers

1. **`eligius/runtime`** entry. Everything `eligius` exports except the fluent `ConfigurationFactory` and `EligiusResourceImporter`. Those two reference every operation and controller by name, so any bundle that loads the main entry keeps all of them alive.
2. **`createImporter(resources)`** (exported from both entries). Builds an `IResourceImporter` from explicit maps:

   ```ts
   import {createImporter, EngineFactory, selectElement, addClass,
           RafPositionSource, DOMEventListenerController} from 'eligius/runtime';

   const importer = createImporter({
     operations: {selectElement, addClass},
     controllers: {DOMEventListenerController},
     providers: {RafPositionSource},
     functions: {greet: () => 'hi'},     // customFunction targets
     // engines defaults to {EligiusEngine}
   });
   const {engine} = new EngineFactory(importer, window).createEngine(config);
   ```

   It implements `getOperationNames`, `getControllerNames`, `getProviderNames` and `getFunctionNames`, so the resolver's "did you mean" hints and its "this is a controller, not an operation" messages work inside a bundle. Unknown names throw `createImporter: unknown system name '<name>'. Did you mean '<closest>'?` (or `... Check the spelling, or add it to the resources passed to createImporter.`).
3. **`"sideEffects": false`** in package.json. Verified safe for the fluent `...ByType` methods under Vite 8, webpack 5 and esbuild.

Measured in Eligius on a 15-operation sample deck, minified and gzipped, jQuery external:

| Importer and entry | esbuild | Vite 8 | webpack 5 |
|---|---|---|---|
| `EligiusResourceImporter` from `eligius` | 60.0 KB | 59.2 KB | 58.9 KB |
| `createImporter` from `eligius` | 49.0 KB | 28.1 KB | 28.3 KB |
| `createImporter` from `eligius/runtime` | 29.0 KB | 28.1 KB | 28.3 KB |

The esbuild column matters here: Eligian bundles with esbuild, and esbuild does not redirect re-exports past a side-effect-free module. Only the `eligius/runtime` entry reaches the floor there.

## Why this concerns Eligian

The runtime bundler (`packages/cli/src/bundler/runtime-bundler.ts`, `generateEntryPoint`) already imports operations by name, but from `'eligius'`, and hands them to a hand-rolled `BundledResourceImporter` class. With esbuild that import path keeps the namespace objects of `dist/index.mjs` alive, so the bundle still carries operations the presentation never names. Switching the import specifier is the whole fix for the size problem; `createImporter` additionally replaces the hand-rolled class and brings the resolver's name hints along.

For reference, `examples/eligian-tour/dist/bundle.js` is 705,928 bytes, 148,202 bytes gzipped, with jQuery bundled in (about 30 KB gzipped of that is jQuery itself). Expect the Eligius share to drop by roughly 20 to 30 KB gzipped; measure before and after with the same `eligian build` flags.

## Proposed change in Eligian

Do this once Eligian's `eligius` pin moves to the release that contains the entry. All of it is in `runtime-bundler.ts` plus its specs.

1. **Import from `eligius/runtime`** in `generateEntryPoint`: `EngineFactory`, every operation and every system entry. `EligiusEngine` no longer needs importing; `createImporter` supplies it.
2. **Split `extractUsedSystemEntries`** into providers and controllers. It already knows the difference while collecting (names under `timelineProviderSettings.*.positionSource|containerProvider|playlist` are providers; `getControllerInstance.operationData.systemName` names are controllers) but returns one flat list. `createImporter` checks shapes per map: a position source in `controllers` fails with `must implement IController: it has no 'attach' method`, so the two must stay apart. Timeline-level `positionSource` / `containerProvider` overrides (`timelines[].positionSource.systemName`) also name providers; the current walker does not look there.
3. **Replace the `imports` map and `BundledResourceImporter`** with one `createImporter({...})` call. Host-module (idea #24) exports go into the matching maps: `operations`, `controllers`, `functions`.
   - Today a missing host export becomes `{name: undefined}` in the map and the engine fails later. `createImporter` validates eagerly and throws `createImporter: resources.operations.<name> must be a function, got undefined.` at bundle load time. Either keep that (it is a clearer failure) or filter missing exports out and keep the smoke runner's "the extensions module does not export X" report as the user-facing message.
   - A host operation that is also a built-in name no longer needs the `override` concept; the generated code simply does not import the built-in. The current filter `allOperations.filter(op => !hostNames.has(op))` already does this.
4. **Specs** that match on generated text: `runtime-bundler.spec.ts` lines 324 to 346 (`import { RafPositionSource } from 'eligius';`, the `BundledResourceImporter` class) and `host-module.spec.ts` lines 80 to 82 (`from 'eligius'` assertions). Any test that matches the old `Unknown systemName: <name>` message must switch to the `createImporter: unknown system name '<name>'` text.
5. **Smoke runner** (`packages/cli/src/smoke/smoke-runner.ts`) can stay on `EligiusResourceImporter(registrations)`; it runs in Node, not in a bundle, so size does not matter there. Switching it to `createImporter` would require listing every operation the config names, which `extractUsedOperations` already provides, but there is no gain.

Estimated effort: one to two hours including the spec updates and a before/after measurement of the tour example.

## Things to keep in mind

- `eligius/runtime` and `eligius` share one copy of every module (same tsdown build, common chunks). A page that loads both still has one global data store and one engine count. `npm run test:published` in Eligius guards that.
- `eligius/metadata` and `eligius/configuration-api` are unchanged. The language package's generated registry and completion metadata keep working as they are.
- Type names added: `IImporterResources`, `TEngineClass`, `TProviderClass`.
- Phase 3 of spec 007 (same branch, same release) adds `eligius/lint`: `lintConfiguration(configuration, {customOperations, customControllers, customProviders, customFunctions, templates, json})` returns `{code, severity, path, message}` diagnostics in plain Node. It runs the real `ConfigurationResolver` (so every `createEngine` error appears as `E001` with its JSON path) and then checks every operation list: blocks that do not nest (`E101`, the fuzzer's root-scope-pop case), missing required properties (`E111`), `when` expressions that do not parse (`E130`/`E131`), forbidden chain segments (`E140`), unknown `requestAction` names (`E310`), dependencies and reads that nothing provides (`W110`, `W151`), chains in fields the operation never resolves (`W150`). `eligian check` can run it over the compiled configuration and map the JSON paths back to source through the eligian map, the way the smoke runner maps engine errors. The host module's declared operations, controllers and functions go into the options so their names are accepted. See the Eligius README section "Linting configurations".

## Where to look in Eligius

- `src/importer/create-importer.ts`, `src/importer/registration-shape.ts`
- `src/runtime.ts`, `tsdown.config.ts` (the comment on the shared build)
- README section "Smaller bundles (`eligius/runtime` and `createImporter`)"
- `specs/007-aot-compiler/phase-2/` (measurement script and results), `specs/007-aot-compiler/measurements.md` section 7
- CHANGELOG "Unreleased"
