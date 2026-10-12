# AGENTS.md — VS Code extension

Local context for the extension package. Root rules in [`../../AGENTS.md`](../../AGENTS.md) still apply.

VS Code extension: LSP client + webview preview, plus on-the-fly compile, CSS/HTML/label hot-reload, and locale editing.

## Layout (`src/`)
- `language/` — LSP language server entry (`main.ts`), `import-processor.ts`, `test-helpers.ts`, `__tests__/`. Wraps `@eligian/language` services.
- `extension/` — extension host + UI:
  - `main.ts` — activation entry point. `commands/` — registered commands (`compile`, `preview`, `locale`, `jsdoc`).
  - Watchers/hot-reload: `base-watcher-manager.ts`, `css-watcher.ts`, `css-loader.ts`, `html-watcher.ts`, `labels-watcher.ts`, `debounce-util.ts`.
  - Webview/preview: `preview/` (`PreviewManager`, `PreviewPanel`, `CompilationService`, `EligiusEngineService`, `FileWatcher`, `MediaResolver`, `templates/`), `webview-css-injector.ts`, `webview-uri-converter.ts`, `decorations/` (block-label decorations).
  - Locales/labels: `locale-editor/` (custom editor provider, file watcher, usage tracker, validation, serializer, `templates/`), `locale-link-provider.ts`, `label-entry-creator.ts`, `label-file-creator.ts`.
- Tests: `extension/__tests__/`, `extension/locale-editor/__tests__/`, `language/__tests__/` (`*.spec.ts`) — there is no `src/__tests__/`.

## Gotchas
- CSS/HTML/label changes hot-reload into the preview without restarting the timeline — preserve that when touching watchers.
- Bundled with esbuild. Build/test via root `pnpm` scripts; do not introduce a separate bundler.
