/**
 * preview.ts - Webview script for Eligian preview
 *
 * This script runs in the webview context (browser environment) and:
 * - Handles postMessage communication with the extension
 * - Manages the Eligius engine lifecycle
 * - Controls timeline playback
 *
 * Constitution Principle I: Simplicity & Documentation
 * Constitution Principle XIII: Eligius Domain Expert Consultation
 */

import {
  EligiusResourceImporter,
  EngineFactory,
  Eventbus,
  type IEligiusEngine,
  type IEngineConfiguration,
  type IEventbus,
  TimelineEventNames,
} from 'eligius';
import 'jquery';
import lottie from 'lottie-web';
import 'video.js';

// Make lottie available globally for Eligius operations
(window as any).lottie = lottie;

// VS Code API (injected by webview)
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
console.log('[Webview] Script loaded, vscode API acquired');

// Eligius engine instance (null until initialized)
let engine: IEligiusEngine | null = null;
let factory: EngineFactory | null = null;

// Create shared eventbus for controlling playback
const eventbus: IEventbus = new Eventbus();
console.log('[Webview] Shared eventbus created');

/**
 * Initialize the Eligius engine with the given configuration.
 *
 * Timeline container elements are automatically created by Eligius via the layoutTemplate.
 */
async function initializeEngine(config: IEngineConfiguration): Promise<void> {
  console.log('[Webview] Initializing Eligius engine with config:', config.id);

  try {
    // Clean up previous engine if exists
    if (engine) {
      console.log('[Webview] Destroying previous engine instance');
      await engine.destroy();
      engine = null;
    }

    // Timeline containers are created by Eligius via layoutTemplate
    // (no need to manually create them here)

    // Create engine factory with shared eventbus
    factory = new EngineFactory(new EligiusResourceImporter(), window, {
      eventbus, // Pass our eventbus so we can control playback
    });
    console.log('[Webview] Engine factory created with shared eventbus');

    // Create engine from config
    engine = factory.createEngine(config);
    console.log('[Webview] Engine instance created');

    // Initialize engine
    await engine.init();
    console.log('[Webview] ✓ Engine initialized successfully');

    // Set up timeline event listeners for UI state updates
    setupTimelineEventListeners();

    // Show playback controls
    showControls();

    // Notify extension of successful initialization
    vscode.postMessage({
      type: 'initialized',
      payload: { success: true },
    });
  } catch (error) {
    console.error('[Webview] ✗ Engine initialization failed:', error);

    // Notify extension of initialization failure
    vscode.postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        error,
      },
    });

    // Also notify as failed initialization
    vscode.postMessage({
      type: 'initialized',
      payload: { success: false },
    });
  }
}

/**
 * Destroy the Eligius engine and clean up resources.
 */
async function destroyEngine(): Promise<void> {
  if (engine) {
    console.log('[Webview] Destroying engine');
    try {
      await engine.destroy();
      engine = null;
      factory = null;

      vscode.postMessage({ type: 'destroyed' });
    } catch (error) {
      console.error('[Webview] ✗ Engine destruction failed:', error);
      vscode.postMessage({
        type: 'error',
        payload: {
          message: error instanceof Error ? error.message : String(error),
          error,
        },
      });
    }
  }
}

// Listen for messages from extension
window.addEventListener('message', async event => {
  const message = event.data;
  console.log('[Webview] Received message:', message.type, message);

  switch (message.type) {
    case 'updateConfig': {
      // Hide loading, show error container
      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('error-container')!.style.display = 'none';

      // Log config for debugging
      console.log('Received config:', message.payload);

      // Show eligius container (don't clear innerHTML - timeline containers will be created during init)
      const container = document.getElementById('eligius-container')!;
      container.style.display = 'block';
      break;
    }

    case 'showError': {
      // Hide loading, show errors
      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('eligius-container')!.style.display = 'none';
      document.getElementById('error-container')!.style.display = 'block';

      // Display errors with enhanced formatting
      const errorList = document.getElementById('error-list')!;
      errorList.innerHTML = message.payload.errors
        .map(
          (error: any) =>
            `<div class="error-item ${error.severity || 'error'}">
          <div class="error-severity">${error.severity === 'warning' ? '⚠️ Warning' : '❌ Error'}</div>
          <div class="error-message">${error.message}</div>
          ${error.line ? `<div class="error-location">Line ${error.line}${error.column ? `, Column ${error.column}` : ''}</div>` : ''}
          ${error.code ? `<div class="error-code">[${error.code}]</div>` : ''}
        </div>`
        )
        .join('');

      // Show source file if provided
      if (message.payload.sourceFile) {
        const errorHeader = document.querySelector('#error-container h2')!;
        errorHeader.textContent = `Compilation Errors in ${message.payload.sourceFile}`;
      }
      break;
    }

    case 'showLoading':
      document.getElementById('loading')!.style.display = 'block';
      document.getElementById('error-container')!.style.display = 'none';
      break;

    // Engine commands
    case 'initialize':
      await initializeEngine(message.payload.config);
      break;

    case 'play':
      console.log('[Webview] Play command received');
      vscode.postMessage({ type: 'playbackStarted' });
      break;

    case 'pause':
      console.log('[Webview] Pause command received');
      vscode.postMessage({ type: 'playbackPaused' });
      break;

    case 'stop':
      console.log('[Webview] Stop command received');
      vscode.postMessage({ type: 'playbackStopped' });
      break;

    case 'restart':
      console.log('[Webview] Restart command received');
      vscode.postMessage({ type: 'playbackStopped' });
      // Will implement actual restart logic later
      vscode.postMessage({ type: 'playbackStarted' });
      break;

    case 'destroy':
      await destroyEngine();
      break;
  }
});

/**
 * Update control button states based on playback state.
 */
function updateControlStates(isPlaying: boolean): void {
  const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;

  if (isPlaying) {
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    restartBtn.disabled = false;
  } else {
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    restartBtn.disabled = false;
  }
}

/**
 * Show playback controls after engine initialization.
 */
function showControls(): void {
  const controls = document.getElementById('controls')!;
  controls.style.display = 'block';
  updateControlStates(false); // Initially not playing
}

/**
 * Hide playback controls (reserved for future use).
 */
function _hideControls(): void {
  const controls = document.getElementById('controls')!;
  controls.style.display = 'none';
}

/**
 * Set up event listeners for timeline state changes.
 * These listeners update the UI based on timeline events broadcast by Eligius.
 */
function setupTimelineEventListeners(): void {
  console.log('[Webview] Setting up timeline event listeners');

  // Listen for PLAY event - timeline has started
  eventbus.on(TimelineEventNames.PLAY, () => {
    console.log('[Webview] Timeline PLAY event received');
    updateControlStates(true);
    vscode.postMessage({ type: 'playbackStarted' });
  });

  // Listen for PAUSE event - timeline has paused
  eventbus.on(TimelineEventNames.PAUSE, () => {
    console.log('[Webview] Timeline PAUSE event received');
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackPaused' });
  });

  // Listen for STOP event - timeline has stopped
  eventbus.on(TimelineEventNames.STOP, () => {
    console.log('[Webview] Timeline STOP event received');
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackStopped' });
  });

  // Listen for COMPLETE event - timeline has finished
  eventbus.on(TimelineEventNames.COMPLETE, () => {
    console.log('[Webview] Timeline COMPLETE event received');
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackStopped' });
  });

  // Listen for RESTART event - timeline has restarted
  eventbus.on(TimelineEventNames.RESTART, () => {
    console.log('[Webview] Timeline RESTART event received');
    updateControlStates(true);
    vscode.postMessage({ type: 'playbackStarted' });
  });
}

// Initialize controls after DOM loads
window.addEventListener('DOMContentLoaded', () => {
  const playBtn = document.getElementById('play-btn')!;
  const pauseBtn = document.getElementById('pause-btn')!;
  const stopBtn = document.getElementById('stop-btn')!;
  const restartBtn = document.getElementById('restart-btn')!;

  // Wire up button click handlers to broadcast timeline control events
  playBtn.addEventListener('click', () => {
    console.log('[Webview] Play button clicked - broadcasting PLAY_REQUEST');
    eventbus.broadcast(TimelineEventNames.PLAY_REQUEST, []);
  });

  pauseBtn.addEventListener('click', () => {
    console.log('[Webview] Pause button clicked - broadcasting PAUSE_REQUEST');
    eventbus.broadcast(TimelineEventNames.PAUSE_REQUEST, []);
  });

  stopBtn.addEventListener('click', () => {
    console.log('[Webview] Stop button clicked - broadcasting STOP_REQUEST');
    eventbus.broadcast(TimelineEventNames.STOP_REQUEST, []);
  });

  restartBtn.addEventListener('click', () => {
    console.log('[Webview] Restart button clicked - broadcasting STOP then PLAY');
    // Restart = stop then play
    eventbus.broadcast(TimelineEventNames.STOP_REQUEST, []);
    // Small delay to ensure stop completes before play
    setTimeout(() => {
      eventbus.broadcast(TimelineEventNames.PLAY_REQUEST, []);
    }, 50);
  });

  // Wire up retry button for error handling
  const retryBtn = document.getElementById('retry-button')!;
  retryBtn.addEventListener('click', () => {
    console.log('[Webview] Retry button clicked');
    vscode.postMessage({ type: 'retry' });
    // Show loading state
    document.getElementById('error-container')!.style.display = 'none';
    document.getElementById('loading')!.style.display = 'block';
  });
});

// Send ready message to extension
console.log('[Webview] Sending ready message to extension');
vscode.postMessage({ type: 'ready' });
