/**
 * EligiusEngineService.ts - Service wrapper for Eligius engine
 *
 * Purpose: Manages Eligius engine lifecycle in webview context via postMessage communication.
 * Provides abstraction over engine initialization, playback controls, and cleanup.
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle VI: Functional Programming (immutable external API)
 * Constitution Principle XIII: Eligius Domain Expert Consultation
 */

import type { IEngineConfiguration } from 'eligius';
import type { HostPayload } from '../../../media/host-registrations.js';

/**
 * Commands that can be sent to the webview to control the Eligius engine.
 */
type EngineCommand =
  | { type: 'initialize'; payload: { config: IEngineConfiguration; host?: HostPayload } }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'restart' }
  | { type: 'destroy' }
  // Audit idea #5: scrubber, timeline picker, language picker, "Preview from here"
  | { type: 'seek'; payload: { position: number } }
  | { type: 'switchTimeline'; payload: { uri: string; position?: number } }
  | { type: 'setLanguage'; payload: { language: string } }
  | { type: 'previewAt'; payload: { timelineUri: string; position: number } };

/**
 * Events that the webview sends back to the extension about engine state.
 */
export type EngineEvent =
  | { type: 'initialized'; payload: { success: boolean } }
  | { type: 'error'; payload: { message: string; error?: unknown } }
  | { type: 'playbackStarted' }
  | { type: 'playbackPaused' }
  | { type: 'playbackStopped' }
  | { type: 'destroyed' };

/**
 * Service that manages Eligius engine lifecycle via webview postMessage.
 *
 * Responsibilities:
 * - Send engine commands to webview (init, play, pause, stop, etc.)
 * - Receive engine events from webview (initialized, error, state changes)
 * - Track engine initialization state
 * - Provide clean API for PreviewPanel to control playback
 *
 * Design Notes:
 * - The actual Eligius engine runs IN the webview (browser context)
 * - This service is a proxy that communicates with the webview via postMessage
 * - The webview has its own engine management code (in preview.js)
 *
 * @example
 * const service = new EligiusEngineService(webview);
 * service.onEvent(event => console.log('Engine event:', event.type));
 * await service.initialize(config);
 * service.play();
 */
export class EligiusEngineService {
  private webview: { postMessage(message: unknown): Thenable<boolean> };
  private eventCallbacks: Array<(event: EngineEvent) => void> = [];
  private isInitialized = false;

  /**
   * Create a new EligiusEngineService.
   *
   * @param webview - VS Code webview to send commands to
   */
  constructor(webview: { postMessage(message: unknown): Thenable<boolean> }) {
    this.webview = webview;
  }

  /**
   * Register a callback to receive engine events from webview.
   *
   * @param callback - Function to call when engine events occur
   */
  public onEvent(callback: (event: EngineEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Handle an engine event received from the webview.
   * Should be called by PreviewPanel when it receives engine events.
   *
   * @param event - Engine event from webview
   */
  public handleEvent(event: EngineEvent): void {
    console.log('[EligiusEngineService] Received event:', event.type);

    // Update internal state
    if (event.type === 'initialized' && event.payload.success) {
      this.isInitialized = true;
    } else if (event.type === 'destroyed') {
      this.isInitialized = false;
    } else if (event.type === 'error') {
      console.error('[EligiusEngineService] Engine error:', event.payload);
    }

    // Notify listeners
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }

  /**
   * Initialize the Eligius engine in the webview with the given configuration.
   *
   * @param config - Eligius engine configuration (compiled from .eligian source)
   * @returns Promise that resolves when initialization command is sent
   */
  public async initialize(config: IEngineConfiguration, host?: HostPayload): Promise<void> {
    console.log('[EligiusEngineService] Initializing engine with config:', config.id);

    const command: EngineCommand = {
      type: 'initialize',
      payload: { config, ...(host ? { host } : {}) },
    };

    await this.webview.postMessage(command);
  }

  /**
   * Start or resume timeline playback.
   */
  public async play(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EligiusEngineService] Cannot play - engine not initialized');
      return;
    }

    console.log('[EligiusEngineService] Sending play command');
    const command: EngineCommand = { type: 'play' };
    await this.webview.postMessage(command);
  }

  /**
   * Pause timeline playback.
   */
  public async pause(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EligiusEngineService] Cannot pause - engine not initialized');
      return;
    }

    console.log('[EligiusEngineService] Sending pause command');
    const command: EngineCommand = { type: 'pause' };
    await this.webview.postMessage(command);
  }

  /**
   * Stop timeline playback and reset to beginning.
   */
  public async stop(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EligiusEngineService] Cannot stop - engine not initialized');
      return;
    }

    console.log('[EligiusEngineService] Sending stop command');
    const command: EngineCommand = { type: 'stop' };
    await this.webview.postMessage(command);
  }

  /**
   * Restart timeline playback from the beginning.
   */
  public async restart(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EligiusEngineService] Cannot restart - engine not initialized');
      return;
    }

    console.log('[EligiusEngineService] Sending restart command');
    const command: EngineCommand = { type: 'restart' };
    await this.webview.postMessage(command);
  }

  /**
   * Go to `position` (seconds) on the timeline with uri `timelineUri` (as in
   * the config the webview runs) and play. Sent before the engine exists, the
   * webview applies it as soon as the engine is initialized.
   */
  public async previewAt(timelineUri: string, position: number): Promise<void> {
    const command: EngineCommand = { type: 'previewAt', payload: { timelineUri, position } };
    await this.webview.postMessage(command);
  }

  /** Seek the current timeline to `position` (seconds). */
  public async seek(position: number): Promise<void> {
    const command: EngineCommand = { type: 'seek', payload: { position } };
    await this.webview.postMessage(command);
  }

  /** Switch to the timeline with uri `uri`, at `position` (default 0s). */
  public async switchTimeline(uri: string, position?: number): Promise<void> {
    const command: EngineCommand = { type: 'switchTimeline', payload: { uri, position } };
    await this.webview.postMessage(command);
  }

  /** Switch the presentation language (broadcasts Eligius' 'language-change'). */
  public async setLanguage(language: string): Promise<void> {
    const command: EngineCommand = { type: 'setLanguage', payload: { language } };
    await this.webview.postMessage(command);
  }

  /**
   * Destroy the engine and clean up resources.
   * Should be called when preview panel is closed.
   */
  public async destroy(): Promise<void> {
    console.log('[EligiusEngineService] Destroying engine');
    const command: EngineCommand = { type: 'destroy' };
    await this.webview.postMessage(command);
    this.isInitialized = false;
  }

  /**
   * Check if the engine has been initialized.
   */
  public get initialized(): boolean {
    return this.isInitialized;
  }
}
