// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
/**
 * PreviewPanel.ts - Manages webview panel lifecycle
 *
 * Purpose: Encapsulates a single webview panel instance for previewing an .eligian file.
 * Handles panel creation, HTML loading, and cleanup.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type EligianMap,
  type EngineErrorCandidate,
  type HostModule,
  locateEngineError,
  type SourceLocation,
} from '@eligian/language';
import * as vscode from 'vscode';
import type { HostPayload } from '../../../media/host-registrations.js';
import { collectCSSImporters, extractCSSFiles } from '../css-loader.js';
import { CSSWatcherManager } from '../css-watcher.js';
import { PlayheadDecorator } from '../decorations/playhead-decoration-provider.js';
import { WebviewCSSInjector } from '../webview-css-injector.js';
import { CompilationService } from './CompilationService.js';
import { EligiusEngineService, type EngineEvent } from './EligiusEngineService.js';
import { FileWatcher } from './FileWatcher.js';
import { HostBundler } from './host-bundler.js';
import { MediaResolver } from './MediaResolver.js';
import { firePreviewPlayhead } from './playhead-events.js';
import {
  computeInitialRootDirectories,
  createRecordingWebview,
  findUncoveredDirectories,
} from './resource-roots.js';
import { findTimelineHeader } from './timeline-location.js';

/** What the webview reports about an engine error (idea #14). */
interface RuntimeErrorPayload {
  readonly message?: string;
  readonly actionId?: string;
  readonly phase?: 'start' | 'end';
  readonly operationSystemName?: string;
  readonly operationIndex?: number;
  readonly timelineUri?: string;
  readonly position?: number;
}

/**
 * Manages the lifecycle of a single preview webview panel.
 *
 * Responsibilities:
 * - Create and configure webview panel
 * - Load HTML template into webview
 * - Handle panel disposal and cleanup
 * - Notify listeners when panel is disposed
 *
 * @example
 * const panel = new PreviewPanel(documentUri, extensionUri);
 * panel.onDispose(() => console.log('Panel closed'));
 */
export class PreviewPanel {
  private static diagnostics: vscode.DiagnosticCollection | null = null;
  /** Idea #14: errors the engine reports while the preview runs (source 'eligius-runtime') */
  private static runtimeDiagnostics: vscode.DiagnosticCollection | null = null;

  private panel: vscode.WebviewPanel;
  private documentUri: vscode.Uri;
  private extensionUri: vscode.Uri;
  private isDisposed = false;
  private disposables: vscode.Disposable[] = [];
  private disposeCallbacks: Array<() => void> = [];
  private compilationService: CompilationService;
  private fileWatcher: FileWatcher;
  private engineService: EligiusEngineService;
  private cssInjector: WebviewCSSInjector;
  private cssWatcher: CSSWatcherManager;
  private workspaceRoot: string;
  /** Local directories the webview may load files from (besides the extension) */
  private resourceRootDirs: string[];
  /** Absolute paths of the CSS files referenced by the latest successful compile */
  private currentCSSFiles = new Set<string>();
  /** Stylesheet pulled in through `@import` → the injected CSS files that import it. */
  private cssImporters = new Map<string, Set<string>>();
  /** The CSS files injected into the preview (resolved paths), without the imported sheets. */
  private injectedCSSFiles = new Set<string>();
  /**
   * Incremented by every compileAndUpdate run; a run whose id is no longer the
   * latest stops applying its results (a newer compile supersedes it).
   */
  private compileSeq = 0;
  /** Set by the webview's first 'ready'; any later 'ready' is a reload. */
  private webviewLoadedOnce = false;
  /**
   * Compiled timeline uri → the uri in the config the webview runs, from the
   * latest successful compile (MediaResolver rewrites video/audio sources to
   * webview URIs). Undefined until the first successful compile.
   */
  private timelineUris: Map<string, string> | undefined;
  /** A "Preview from here" request waiting for the first successful compile */
  private pendingPreviewAt: { timelineUri: string; seconds: number } | undefined;
  /** Idea #14: compiled JSON → source locations, from the latest successful compile */
  private eligianMap: EligianMap | undefined;
  /** Files this panel reported runtime errors for (cleared on recompile and close) */
  private runtimeErrorUris = new Map<string, vscode.Uri>();
  /** Idea #24: bundles the host module (created on first use) and the one being watched */
  private hostBundler: HostBundler | undefined;
  private watchedHost: vscode.Uri | undefined;
  private static untrustedHostNoticeShown = false;

  /** Idea #14: marks the running events in the editor; created on the first playhead */
  private playheadDecorator: PlayheadDecorator | undefined;

  /**
   * Initialize the static diagnostics collection (called once per extension activation).
   */
  public static initializeDiagnostics(): vscode.DiagnosticCollection {
    if (!PreviewPanel.diagnostics) {
      PreviewPanel.diagnostics = vscode.languages.createDiagnosticCollection('eligian-preview');
    }
    if (!PreviewPanel.runtimeDiagnostics) {
      PreviewPanel.runtimeDiagnostics =
        vscode.languages.createDiagnosticCollection('eligius-runtime');
    }
    return PreviewPanel.diagnostics;
  }

  /**
   * Dispose the static diagnostics collection (called on extension deactivation).
   */
  public static disposeDiagnostics(): void {
    if (PreviewPanel.diagnostics) {
      PreviewPanel.diagnostics.dispose();
      PreviewPanel.diagnostics = null;
    }
    PreviewPanel.runtimeDiagnostics?.dispose();
    PreviewPanel.runtimeDiagnostics = null;
  }

  /**
   * Create a new preview panel.
   *
   * @param documentUri - URI of the .eligian file being previewed
   * @param extensionUri - URI of the extension root (for loading resources)
   */
  constructor(documentUri: vscode.Uri, extensionUri: vscode.Uri) {
    this.documentUri = documentUri;
    this.extensionUri = extensionUri;
    this.compilationService = new CompilationService();

    // Workspace folders plus the document's own directory (loose files opened
    // without a folder, or files outside every open folder).
    this.resourceRootDirs = computeInitialRootDirectories(
      vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [],
      documentUri.fsPath
    );

    // Create webview panel
    this.panel = this.createWebviewPanel();

    // Set initial HTML
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle panel disposal
    this.panel.onDidDispose(() => this.handleDispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      message => this.handleWebviewMessage(message),
      null,
      this.disposables
    );

    // Set up Eligius engine service
    this.engineService = new EligiusEngineService(this.panel.webview);
    this.engineService.onEvent(event => this.handleEngineEvent(event));

    // Idea #24: once the workspace is trusted, the host module runs: recompile
    if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
      this.disposables.push(
        vscode.workspace.onDidGrantWorkspaceTrust(() => void this.compileAndUpdate())
      );
    }

    // Set up CSS injector for hot-reload (Feature 011)
    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(documentUri.fsPath);
    this.cssInjector = new WebviewCSSInjector(this.panel.webview, this.workspaceRoot);

    // Set up CSS watcher for hot-reload (Feature 011 - User Story 2)
    this.cssWatcher = new CSSWatcherManager(filePath => this.handleCSSFileChange(filePath));

    // Set up file watching for auto-recompilation
    this.fileWatcher = new FileWatcher();
    this.fileWatcher.watch(this.documentUri, () => this.compileAndUpdate());

    // Trigger initial compilation
    this.compileAndUpdate();
  }

  /**
   * Create and configure the webview panel.
   */
  private createWebviewPanel(): vscode.WebviewPanel {
    const filename = path.basename(this.documentUri.fsPath);

    return vscode.window.createWebviewPanel(
      'eligianPreview', // ViewType
      `Preview: ${filename}`, // Title
      vscode.ViewColumn.Beside, // Show beside editor
      {
        enableScripts: true, // Allow JavaScript
        retainContextWhenHidden: true, // Keep state when hidden
        localResourceRoots: this.buildLocalResourceRoots(),
      }
    );
  }

  /**
   * localResourceRoots: the extension plus every allowed local directory.
   */
  private buildLocalResourceRoots(): vscode.Uri[] {
    return [this.extensionUri, ...this.resourceRootDirs.map(dir => vscode.Uri.file(dir))];
  }

  /**
   * Make sure the webview may load every given local file.
   *
   * Media and CSS url() assets may live outside the workspace folders and the
   * document directory (e.g. `../shared/bg.png`). Their directories are added
   * to localResourceRoots. Assigning webview options reloads the webview
   * document, so this must run before the compiled config and CSS are posted
   * (VS Code queues messages until the reloaded document is ready).
   *
   * @param filePaths - Absolute paths of local files the preview will load
   */
  private ensureResourceRoots(filePaths: Iterable<string>): void {
    const missing = findUncoveredDirectories(this.resourceRootDirs, filePaths);
    if (missing.length === 0) {
      return;
    }

    console.log('[Preview] Extending localResourceRoots with:', missing);
    this.resourceRootDirs = [...this.resourceRootDirs, ...missing];
    this.panel.webview.options = {
      ...this.panel.webview.options,
      localResourceRoots: this.buildLocalResourceRoots(),
    };
  }

  /**
   * Get HTML content for the webview.
   * Loads template from templates/preview.html and replaces placeholders.
   */
  private getHtmlForWebview(): string {
    const templatePath = path.join(
      this.extensionUri.fsPath,
      'src',
      'extension',
      'preview',
      'templates',
      'preview.html'
    );

    // Read template file
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Replace CSP source placeholder
    const cspSource = this.panel.webview.cspSource;
    html = html.replace(/\$\{cspSource\}/g, cspSource);

    // Replace extension URI placeholder (for future resource loading)
    const extensionUri = this.panel.webview.asWebviewUri(this.extensionUri).toString();
    html = html.replace(/\$\{extensionUri\}/g, extensionUri);

    // Generate script URI for bundled webview script (in out/media after build)
    const scriptPath = vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'preview.js');
    const scriptUri = this.panel.webview.asWebviewUri(scriptPath).toString();
    html = html.replace(/\$\{scriptUri\}/g, scriptUri);

    return html;
  }

  /**
   * Reveal the panel (bring to front).
   */
  public reveal(): void {
    this.panel.reveal();
  }

  /**
   * Show the timeline with compiled uri `timelineUri` from `seconds` and play
   * ("▶ Preview from 22s", audit idea #5). Before the first successful compile
   * the request waits for it.
   */
  public previewAt(timelineUri: string, seconds: number): void {
    if (!this.timelineUris) {
      this.pendingPreviewAt = { timelineUri, seconds };
      return;
    }
    void this.engineService.previewAt(this.timelineUris.get(timelineUri) ?? timelineUri, seconds);
  }

  /**
   * Register a callback to be invoked when the panel is disposed.
   *
   * @param callback - Function to call on disposal
   */
  public onDispose(callback: () => void): void {
    this.disposeCallbacks.push(callback);
  }

  /**
   * Handle panel disposal.
   */
  private handleDispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Nothing recompiles this document's preview any more, so its
    // 'Eligian Preview' entries would otherwise stay in Problems until reload.
    // (In-flight compiles stop applying results once isDisposed is set.)
    PreviewPanel.diagnostics?.delete(this.documentUri);
    this.clearRuntimeErrors();
    this.playheadDecorator?.dispose();
    this.hostBundler?.dispose();
    firePreviewPlayhead({ documentUri: this.documentUri.toString(), playhead: null });

    // Destroy Eligius engine
    this.engineService.destroy();

    // Stop watching file
    this.fileWatcher.dispose();

    // Stop watching CSS files (Feature 011 - US2)
    this.cssWatcher.dispose();

    // Notify listeners
    for (const callback of this.disposeCallbacks) {
      callback();
    }

    // Clean up disposables
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Dispose the panel manually.
   */
  public dispose(): void {
    if (!this.isDisposed) {
      this.panel.dispose();
    }
  }

  /**
   * Compile the document and update the preview.
   */
  private async compileAndUpdate(): Promise<void> {
    // Save, retry and the initial compile can overlap. Only the latest run may
    // apply its results; an older run that finishes late must not overwrite a
    // newer config (or re-initialize the engine with stale data).
    const runId = ++this.compileSeq;
    const isStale = (): boolean => this.isDisposed || runId !== this.compileSeq;

    console.log('[Preview] Starting compilation for:', this.documentUri.fsPath);

    try {
      // Show loading state
      console.log('[Preview] Sending showLoading message');
      await this.panel.webview.postMessage({ type: 'showLoading' });
      if (isStale()) {
        return;
      }

      // Compile the document
      console.log('[Preview] Calling compilation service...');
      const result = await this.compilationService.compile(this.documentUri);
      if (isStale()) {
        console.log('[Preview] Discarding superseded compilation result');
        return;
      }
      console.log('[Preview] Compilation result:', {
        success: result.success,
        errorCount: result.errors.length,
      });

      if (result.success && result.config) {
        // Resolve media paths to webview URIs, recording every local file the
        // preview will load so localResourceRoots can be extended to cover it.
        console.log('[Preview] Resolving media paths...');
        const referencedFiles = new Set<string>();
        const recordingWebview = createRecordingWebview(this.panel.webview, filePath =>
          referencedFiles.add(filePath)
        );
        const mediaResolver = new MediaResolver(recordingWebview, this.documentUri);
        const resolvedConfig = mediaResolver.resolveMediaPaths(result.config);

        // Check for missing media files
        const missingFiles = mediaResolver.getMissingFiles();
        if (missingFiles.length > 0) {
          console.warn('[Preview] Missing media files:', missingFiles);
          vscode.window.showWarningMessage(
            `Preview: ${missingFiles.length} media file(s) not found: ${missingFiles.join(', ')}`
          );
        }

        // Load and rewrite the CSS files (Feature 011 - US1). Not posted yet:
        // their url() assets must be covered by localResourceRoots first.
        // CSS file paths are relative to the .eligian file's directory, not workspace root
        const sourceFileDir = path.dirname(this.documentUri.fsPath);
        const absoluteCSSFiles = extractCSSFiles(resolvedConfig).map(file =>
          path.isAbsolute(file) ? file : path.resolve(sourceFileDir, file)
        );
        const preparedCSS = await this.cssInjector.prepareCSS(absoluteCSSFiles);
        if (isStale()) {
          return;
        }
        for (const filePath of preparedCSS.referencedLocalPaths) {
          referencedFiles.add(filePath);
        }

        // Idea #24: the host module, bundled (trusted workspace) or stubbed
        const host = await this.prepareHost(result.host);
        if (isStale()) {
          return;
        }
        if (host === 'failed') {
          return;
        }
        if (host?.file) {
          referencedFiles.add(host.file);
        }

        // Must happen before anything below is posted (it may reload the webview)
        this.ensureResourceRoots(referencedFiles);

        // Send successful compilation result to webview
        console.log('[Preview] Sending updateConfig message with resolved config');
        await this.panel.webview.postMessage({
          type: 'updateConfig',
          payload: {
            config: resolvedConfig,
          },
        });
        if (isStale()) {
          return;
        }

        // Clear diagnostics on successful compilation
        if (PreviewPanel.diagnostics) {
          PreviewPanel.diagnostics.set(this.documentUri, []);
        }

        // Initialize Eligius engine with the compiled config
        console.log('[Preview] Initializing Eligius engine');
        await this.engineService.initialize(
          resolvedConfig,
          host
            ? {
                ...host.payload,
                ...(host.file
                  ? { url: this.panel.webview.asWebviewUri(vscode.Uri.file(host.file)).toString() }
                  : {}),
              }
            : undefined
        );
        if (isStale()) {
          return;
        }

        // Map compiled timeline uris to the resolved ones, then send a waiting
        // "Preview from here" (the webview applies it once the engine is up)
        // Idea #14: a new engine runs, so earlier runtime errors are stale
        this.eligianMap = result.map;
        this.clearRuntimeErrors();

        const resolvedTimelines = resolvedConfig.timelines ?? [];
        this.timelineUris = new Map(
          (result.config.timelines ?? []).map((timeline, index) => [
            timeline.uri,
            resolvedTimelines[index]?.uri ?? timeline.uri,
          ])
        );
        const pending = this.pendingPreviewAt;
        this.pendingPreviewAt = undefined;
        if (pending) {
          this.previewAt(pending.timelineUri, pending.seconds);
        }

        // Replace the injected CSS with exactly this compile's set: stylesheets
        // whose `styles` import was removed from the source are taken out, even
        // when the new set is empty.
        console.log(
          `[Preview] Injecting ${absoluteCSSFiles.length} CSS file(s):`,
          absoluteCSSFiles
        );
        await this.cssInjector.applyCSS(preparedCSS);
        if (isStale()) {
          return;
        }

        // Watch exactly the current CSS files for hot-reload (Feature 011 - US2)
        this.updateCSSWatching(absoluteCSSFiles);

        console.log(`[Preview] ✓ Successfully compiled ${path.basename(this.documentUri.fsPath)}`);
      } else {
        // Add diagnostics to Problems panel
        if (PreviewPanel.diagnostics) {
          const vsDiagnostics = result.errors.map(error => {
            const line = (error.line || 1) - 1; // VS Code uses 0-based line numbers
            const column = (error.column || 1) - 1; // VS Code uses 0-based column numbers
            const length = error.length || 1;

            const range = new vscode.Range(line, column, line, column + length);

            const diagnostic = new vscode.Diagnostic(
              range,
              error.message,
              error.severity === 'warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Error
            );

            if (error.code) {
              diagnostic.code = error.code;
            }
            diagnostic.source = 'Eligian Preview';

            return diagnostic;
          });

          PreviewPanel.diagnostics.set(this.documentUri, vsDiagnostics);
        }

        // Send errors to webview
        console.log('[Preview] Sending showError message with errors:', result.errors);
        await this.panel.webview.postMessage({
          type: 'showError',
          payload: {
            errors: result.errors,
            sourceFile: path.basename(this.documentUri.fsPath),
          },
        });

        console.error(
          `[Preview] ✗ Compilation failed for ${path.basename(this.documentUri.fsPath)}:`,
          result.errors
        );
      }
    } catch (error) {
      // Handle unexpected errors
      console.error('[Preview] ✗ Unexpected compilation error:', error);
      console.error('[Preview] Error stack:', error instanceof Error ? error.stack : 'No stack');

      if (isStale()) {
        return; // A newer run owns the preview (or the panel is gone)
      }

      await this.panel.webview.postMessage({
        type: 'showError',
        payload: {
          errors: [
            {
              message: error instanceof Error ? error.message : String(error),
              severity: 'error',
            },
          ],
          sourceFile: path.basename(this.documentUri.fsPath),
        },
      });
    }
  }

  /**
   * Handle messages received from the webview.
   */
  /** Diagnostic code of runtime scroll container problems (Feature 049). */
  private static readonly SCROLL_CONTAINER_CODE = 'scroll_container_runtime';

  /**
   * Show (or clear) a runtime scroll container problem as a warning on the
   * timeline's header, next to the preview's other diagnostics.
   */
  private async reportScrollContainer(
    timelineUri: string | undefined,
    problem: string | undefined
  ): Promise<void> {
    const diagnostics = PreviewPanel.diagnostics;
    if (!diagnostics) return;
    const others = (diagnostics.get(this.documentUri) ?? []).filter(
      d => d.code !== PreviewPanel.SCROLL_CONTAINER_CODE
    );
    if (!problem || !timelineUri) {
      diagnostics.set(this.documentUri, others);
      return;
    }
    let text = '';
    try {
      text = (await vscode.workspace.openTextDocument(this.documentUri)).getText();
    } catch {
      // The document is gone: nothing to annotate
    }
    const header = findTimelineHeader(text, timelineUri);
    const range = header
      ? new vscode.Range(header.line, header.startCharacter, header.line, header.endCharacter)
      : new vscode.Range(0, 0, 0, 1);
    const diagnostic = new vscode.Diagnostic(range, problem, vscode.DiagnosticSeverity.Warning);
    diagnostic.code = PreviewPanel.SCROLL_CONTAINER_CODE;
    diagnostic.source = 'Eligian Preview';
    diagnostics.set(this.documentUri, [...others, diagnostic]);
  }

  private handleWebviewMessage(message: any): void {
    switch (message.type) {
      case 'ready':
        // The webview posts 'ready' every time its document loads. The first
        // load is served by the constructor's compile (VS Code queues messages
        // until then). A later 'ready' means the document was reloaded
        // ('Developer: Reload Webviews', the host re-creating it, or new
        // localResourceRoots): it starts on the template's loading view with no
        // config, engine or CSS, so replay everything.
        if (!this.webviewLoadedOnce) {
          this.webviewLoadedOnce = true;
          console.log('[Preview] Webview ready');
        } else {
          console.log('[Preview] Webview reloaded, replaying preview state');
          this.compileAndUpdate();
        }
        break;

      case 'retry':
        // User clicked retry button - recompile
        console.log('[Preview] Retry requested by user');
        this.compileAndUpdate();
        break;

      case 'scrollContainer':
        // Feature 049: the webview checked the scroll timeline's container in
        // the rendered layout; show a problem on the timeline header
        void this.reportScrollContainer(message.payload?.timelineUri, message.payload?.problem);
        break;

      case 'runtimeError':
        // Runtime error from Eligius engine
        console.error('[Preview] Runtime error from Eligius:', message.payload?.message);
        // Idea #14: located in the source through the Eligian map
        this.reportRuntimeError(message.payload ?? {});
        break;

      case 'playhead':
        // Idea #14: mark the events running at the playhead in the editor
        this.playheadDecorator ??= new PlayheadDecorator(this.documentUri);
        {
          const playhead = message.payload
            ? {
                timelineUri: this.compiledTimelineUri(message.payload.timelineUri),
                position: message.payload.position,
              }
            : null;
          this.playheadDecorator.update(this.eligianMap, playhead);
          // Idea #20: the timeline view draws the playhead too
          firePreviewPlayhead({ documentUri: this.documentUri.toString(), playhead });
        }
        break;

      // Route engine events to engine service
      case 'initialized':
      case 'error':
      case 'playbackStarted':
      case 'playbackPaused':
      case 'playbackStopped':
      case 'destroyed':
        this.engineService.handleEvent(message as EngineEvent);
        break;

      default:
        console.log('[Preview] Unknown message type:', message.type);
    }
  }

  /** The compiled uri of a timeline the webview names by its resolved (webview) uri. */
  private compiledTimelineUri(resolved: string): string {
    for (const [compiled, webviewUri] of this.timelineUris ?? []) {
      if (webviewUri === resolved) return compiled;
    }
    return resolved;
  }

  /**
   * Idea #24: the program's host module for the preview. In a trusted workspace
   * it is bundled (esbuild-wasm, in a worker) into a file the webview imports;
   * a bundling error is shown like a compile error ('failed'). In an untrusted
   * workspace the names get stand-ins (once said in a notification). The
   * module is watched: saving it recompiles.
   */
  private async prepareHost(
    host: HostModule | undefined
  ): Promise<{ payload: HostPayload; file?: string } | 'failed' | undefined> {
    if (this.watchedHost) {
      this.fileWatcher.unwatch(this.watchedHost);
      this.watchedHost = undefined;
    }
    if (!host) return undefined;
    const absolute = path.resolve(path.dirname(this.documentUri.fsPath), host.path);
    this.watchedHost = vscode.Uri.file(absolute);
    this.fileWatcher.watch(this.watchedHost, () => this.compileAndUpdate());
    const payload: HostPayload = {
      path: host.path,
      operations: host.operations,
      controllers: host.controllers,
      functions: host.functions,
    };
    if (!vscode.workspace.isTrusted) {
      if (!PreviewPanel.untrustedHostNoticeShown) {
        PreviewPanel.untrustedHostNoticeShown = true;
        void vscode.window.showWarningMessage(
          `Eligian preview: the workspace is not trusted, so the host code of ${host.path} does not run (its operations do nothing). Trust the workspace to run it.`
        );
      }
      return { payload: { ...payload, stub: true } };
    }
    this.hostBundler ??= new HostBundler(this.extensionUri.fsPath);
    const bundle = await this.hostBundler.bundle(absolute);
    if ('errors' in bundle) {
      await this.panel.webview.postMessage({
        type: 'showError',
        payload: {
          sourceFile: path.basename(absolute),
          errors: bundle.errors.map(message => ({ message, severity: 'error' })),
        },
      });
      return 'failed';
    }
    return { payload, file: bundle.file };
  }

  /**
   * Idea #14: show an engine error with where it happens in the source: a
   * notification with 'Go to Source', and an Error diagnostic (source
   * 'eligius-runtime') on the failing operation, in the program or in the
   * library that defines the action.
   */
  private reportRuntimeError(payload: RuntimeErrorPayload): void {
    const located =
      this.eligianMap && payload.actionId
        ? locateEngineError(this.eligianMap, {
            actionId: payload.actionId,
            phase: payload.phase ?? 'start',
            operationSystemName: payload.operationSystemName,
            operationIndex: payload.operationIndex,
          })
        : undefined;
    const location = located?.location;
    const uri = location?.file ? vscode.Uri.file(location.file) : this.documentUri;
    const alternatives = located?.alternatives ?? [];
    const others =
      alternatives.length === 0
        ? ''
        : ` or ${alternatives.length} other place${alternatives.length === 1 ? '' : 's'}`;
    const where = location
      ? ` (${path.basename(uri.fsPath)}:${location.line}:${location.column}${others})`
      : '';
    const text = `Eligian Preview Runtime Error: ${payload.message ?? 'unknown error'}${where}`;

    if (!location) {
      vscode.window.showErrorMessage(text);
      return;
    }
    void Promise.resolve(vscode.window.showErrorMessage(text, 'Go to Source')).then(choice => {
      if (choice === 'Go to Source') void this.revealLocation(uri, location);
    });
    void this.addRuntimeDiagnostic(uri, location, payload, located?.via ?? [], alternatives);
  }

  private async addRuntimeDiagnostic(
    uri: vscode.Uri,
    location: SourceLocation,
    payload: RuntimeErrorPayload,
    via: readonly string[],
    alternatives: readonly EngineErrorCandidate[] = []
  ): Promise<void> {
    const diagnostics = PreviewPanel.runtimeDiagnostics;
    if (!diagnostics || this.isDisposed) return;
    const range = await this.rangeOf(uri, location);
    const at =
      payload.position !== undefined
        ? ` at ${Math.round(payload.position * 10) / 10}s of '${this.compiledTimelineUri(payload.timelineUri ?? '')}'`
        : '';
    const through = PreviewPanel.through(via);
    const diagnostic = new vscode.Diagnostic(
      range,
      `Runtime error${at}${through}: ${payload.message ?? 'unknown error'}`,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'eligius-runtime';
    diagnostic.code = 'runtime_error';
    // Eligius names only the innermost operation (name and index): the same
    // operation at the same index elsewhere in the call chain matches as well
    const related: vscode.DiagnosticRelatedInformation[] = [];
    for (const alternative of alternatives) {
      const at = alternative.operation.location;
      if (!at) continue;
      const otherUri = at.file ? vscode.Uri.file(at.file) : this.documentUri;
      related.push(
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(otherUri, await this.rangeOf(otherUri, at)),
          `Or here${PreviewPanel.through(alternative.via)}: Eligius reports only the operation's name and index, which match here too`
        )
      );
    }
    if (related.length > 0) diagnostic.relatedInformation = related;
    const existing = diagnostics.get(uri) ?? [];
    // The same failure repeats (every loop, every replay): report it once per place
    if (
      existing.some(
        d =>
          d.range.start.line === range.start.line &&
          d.range.start.character === range.start.character &&
          d.message === diagnostic.message
      )
    ) {
      return;
    }
    diagnostics.set(uri, [...existing, diagnostic]);
    this.runtimeErrorUris.set(uri.toString(), uri);
  }

  /** ` (in 'a' → 'b')`: the actions called on the way to an operation. */
  private static through(via: readonly string[]): string {
    return via.length > 0 ? ` (in ${via.map(name => `'${name}'`).join(' → ')})` : '';
  }

  private clearRuntimeErrors(): void {
    for (const uri of this.runtimeErrorUris.values()) {
      PreviewPanel.runtimeDiagnostics?.delete(uri);
    }
    this.runtimeErrorUris.clear();
  }

  /** The range of `location` (1-based line and column, offset length) in `uri`. */
  private async rangeOf(uri: vscode.Uri, location: SourceLocation): Promise<vscode.Range> {
    const line = Math.max(0, location.line - 1);
    const character = Math.max(0, location.column - 1);
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const start = new vscode.Position(line, character);
      const end = document.positionAt(document.offsetAt(start) + (location.length ?? 1));
      return new vscode.Range(start, end);
    } catch {
      return new vscode.Range(line, character, line, character + 1);
    }
  }

  private async revealLocation(uri: vscode.Uri, location: SourceLocation): Promise<void> {
    const range = await this.rangeOf(uri, location);
    const editor = await vscode.window.showTextDocument(uri, {
      viewColumn: vscode.ViewColumn.One,
      selection: range,
    });
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /**
   * Handle engine events from the webview.
   */
  private handleEngineEvent(event: EngineEvent): void {
    console.log('[Preview] Engine event received:', event.type);

    // Log engine state changes for debugging
    switch (event.type) {
      case 'initialized':
        if (event.payload.success) {
          console.log('[Preview] ✓ Eligius engine initialized successfully');
        } else {
          console.error('[Preview] ✗ Eligius engine initialization failed');
        }
        break;

      case 'error':
        console.error('[Preview] ✗ Engine error:', event.payload.message);
        // Show error notification to user
        vscode.window.showErrorMessage(`Eligian Preview: ${event.payload.message}`);
        break;

      case 'playbackStarted':
        console.log('[Preview] ▶ Playback started');
        break;

      case 'playbackPaused':
        console.log('[Preview] ⏸ Playback paused');
        break;

      case 'playbackStopped':
        console.log('[Preview] ⏹ Playback stopped');
        break;

      case 'destroyed':
        console.log('[Preview] Engine destroyed');
        break;
    }
  }

  /**
   * Watch exactly `cssFiles` (plus the sheets they `@import`) for hot-reload.
   *
   * CSSWatcherManager only ever adds tracked files, so when a compile drops a
   * CSS file the watcher is reset first; otherwise edits to a no-longer
   * imported file would keep hot-reloading it into the preview.
   */
  private updateCSSWatching(cssFiles: readonly string[]): void {
    // Also watch the sheets they `@import`: an edit to one reloads its importers.
    this.cssImporters = collectCSSImporters(cssFiles);
    this.injectedCSSFiles = new Set(cssFiles.map(file => path.resolve(file)));
    const next = new Set([...cssFiles, ...this.cssImporters.keys()]);
    const removedAny = [...this.currentCSSFiles].some(file => !next.has(file));
    this.currentCSSFiles = next;

    if (removedAny) {
      this.cssWatcher.dispose();
    }
    this.cssWatcher.startWatching([...next], this.workspaceRoot);
  }

  /**
   * Handle CSS file change events from the watcher (hot-reload)
   */
  private async handleCSSFileChange(filePath: string): Promise<void> {
    console.log('[Preview] CSS file changed, reloading:', filePath);

    // An @import-ed sheet is not injected itself: reload the injected files importing it.
    const resolved = path.resolve(filePath);
    const importers = this.cssImporters.get(resolved);
    const targets = new Set(importers ?? []);
    if (!importers || this.injectedCSSFiles.has(resolved)) {
      targets.add(filePath);
    }

    try {
      for (const target of targets) {
        await this.cssInjector.reloadCSS(target);
      }
      console.log('[Preview] ✓ CSS hot-reloaded successfully');
    } catch (error) {
      console.error('[Preview] ✗ CSS hot-reload failed:', error);
    }
  }
}
