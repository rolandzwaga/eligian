// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: bullshit
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
  type IEngineFactoryResult,
  type IEventbus,
  type IEventbusListener,
} from 'eligius';
import $ from 'jquery';
import { createEngineLifecycleQueue } from './engine-lifecycle-queue.js';
import {
  applyCSSLoad,
  applyCSSReload,
  applyCSSRemove,
  renderDebugEvents,
  renderErrorList,
} from './preview-dom.js';

// Make jQuery available globally for Eligius operations
(window as any).$ = $;
(window as any).jQuery = $;

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

// Eligius engine instance (null until initialized)
let engine: IEligiusEngine | null = null;
let factory: EngineFactory | null = null;
let factoryResult: IEngineFactoryResult | null = null;

// Create shared eventbus for controlling playback
const eventbus: IEventbus = new Eventbus();

// Removers for the timeline listeners registered by setupTimelineEventListeners().
// Tracked so that re-initializing the engine does not accumulate duplicate
// listeners (which would multiply every state update / postMessage per re-init).
let timelineListenerRemovers: Array<() => void> = [];

/**
 * Initialize the Eligius engine with the given configuration.
 *
 * Timeline container elements are automatically created by Eligius via the layoutTemplate.
 */
async function initializeEngine(config: IEngineConfiguration): Promise<void> {
  try {
    // Clean up previous engine if exists (Eligius 2.0.0: use factoryResult.destroy())
    if (factoryResult) {
      await factoryResult.destroy();
      factoryResult = null;
      engine = null;
    }

    // Timeline containers are created by Eligius via layoutTemplate
    // (no need to manually create them here)

    // Create engine factory with shared eventbus
    factory = new EngineFactory(new EligiusResourceImporter(), window, {
      eventbus, // Pass our eventbus so we can control playback
    });

    // Create engine from config (Eligius 2.0.0: destructure IEngineFactoryResult)
    const result = factory.createEngine(config);
    factoryResult = result;
    engine = result.engine;

    // Initialize engine
    await engine.init();

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
 * (Eligius 2.0.0: use factoryResult.destroy() to properly disconnect adapters)
 * Implementation is idempotent per FR-007 - safe to call multiple times.
 */
async function destroyEngine(): Promise<void> {
  if (factoryResult) {
    try {
      await factoryResult.destroy();
      factoryResult = null;
      engine = null;
      factory = null;

      vscode.postMessage({ type: 'destroyed' });
    } catch (error) {
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

/**
 * EventBus Debug Viewer - Implements IEventbusListener to monitor all EventBus events
 */
class EventbusDebugViewer implements IEventbusListener {
  private events: Array<{
    timestamp: number;
    eventName: string;
    eventTopic?: string;
    args: any[];
  }> = [];
  private filterText = '';
  private isVisible = false;

  constructor() {
    this.setupUI();
  }

  /**
   * IEventbusListener implementation - called for every EventBus event
   */
  handleEvent(eventName: string, eventTopic: string | undefined, args: any[]): void {
    // Store event in history
    this.events.unshift({
      // Add to front (newest first)
      timestamp: Date.now(),
      eventName,
      eventTopic,
      args: this.serializeArgs(args),
    });

    // Update UI if visible
    if (this.isVisible) {
      this.renderEvents();
    }
  }

  /**
   * Safely serialize arguments for display
   */
  private serializeArgs(args: any[]): any[] {
    try {
      // Use JSON parse/stringify to clone and handle circular references
      return JSON.parse(JSON.stringify(args));
    } catch (error) {
      return [`[Serialization Error: ${error}]`];
    }
  }

  /**
   * Setup UI event handlers
   */
  private setupUI(): void {
    // Toggle button
    const toggleBtn = document.getElementById('debug-toggle-btn')!;
    toggleBtn.addEventListener('click', () => this.toggle());

    // Clear button
    const clearBtn = document.getElementById('debug-clear-btn')!;
    clearBtn.addEventListener('click', () => this.clear());

    // Filter input
    const filterInput = document.getElementById('debug-filter') as HTMLInputElement;
    filterInput.addEventListener('input', () => {
      this.filterText = filterInput.value.toLowerCase();
      this.renderEvents();
    });

    // Make panel draggable
    this.setupDraggable();
  }

  /**
   * Setup draggable behavior for the debug panel
   */
  private setupDraggable(): void {
    const panel = document.getElementById('debug-viewer')!;
    const header = document.getElementById('debug-header')!;
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    header.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  /**
   * Toggle debug viewer visibility
   */
  toggle(): void {
    this.isVisible = !this.isVisible;
    const panel = document.getElementById('debug-viewer')!;
    panel.style.display = this.isVisible ? 'flex' : 'none';

    if (this.isVisible) {
      this.renderEvents();
    }
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.renderEvents();
  }

  /**
   * Render events to the UI
   */
  private renderEvents(): void {
    const container = document.getElementById('debug-events')!;

    // Filter events based on filter text
    const filteredEvents = this.filterText
      ? this.events.filter(
          event =>
            event.eventName.toLowerCase().includes(this.filterText) ||
            event.eventTopic?.toLowerCase().includes(this.filterText)
        )
      : this.events;

    // Built with textContent: event names, topics and args (operation data often
    // holds HTML strings) must show as text, not render as live markup.
    renderDebugEvents(container, filteredEvents);
  }
}

// Create debug viewer instance
const debugViewer = new EventbusDebugViewer();

// Serialize engine lifecycle work: the async message listener below is not
// awaited between events, so overlapping 'initialize' messages would otherwise
// destroy an engine that is still in `await engine.init()`.
const engineQueue = createEngineLifecycleQueue<IEngineConfiguration>({
  initialize: initializeEngine,
  destroy: destroyEngine,
});

// Listen for messages from extension
window.addEventListener('message', async event => {
  const message = event.data;

  switch (message.type) {
    case 'updateConfig': {
      // Prepare the DOM for a (re)compiled config: hide the loading and error
      // views and reveal the Eligius container. This message only updates
      // visibility — the engine itself is (re)initialized by the separate
      // 'initialize' message the extension sends immediately afterwards
      // (see PreviewPanel.compileAndUpdate), so we must NOT init here or the
      // engine would be created twice.
      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('error-container')!.style.display = 'none';

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

      // The playback controls belong to the previous (now stale) engine
      hideControls();

      // Compiler text is rendered with textContent: messages contain source text
      // (paths, string literals, token text) that must not become markup.
      renderErrorList(document.getElementById('error-list')!, message.payload.errors ?? []);

      // Show source file if provided
      if (message.payload.sourceFile) {
        const errorHeader = document.querySelector('#error-container h2')!;
        errorHeader.textContent = `Compilation Errors in ${message.payload.sourceFile}`;
      }

      // Stop the previous timeline: its audio/video would otherwise keep playing
      // behind the error view, driven by the still-visible controls.
      await engineQueue.destroy();
      break;
    }

    case 'showLoading':
      document.getElementById('loading')!.style.display = 'block';
      document.getElementById('error-container')!.style.display = 'none';
      break;

    // Engine commands
    case 'initialize':
      await engineQueue.initialize(message.payload.config);
      break;

    // Playback commands broadcast the corresponding timeline request on the
    // eventbus so Eligius actually changes state. We do NOT echo
    // playbackStarted/Paused/Stopped here: the timeline-* listeners registered
    // in setupTimelineEventListeners() report the real state once Eligius acts,
    // so echoing would send a false confirmation before anything happened.
    case 'play':
      eventbus.broadcast('timeline-play-request', []);
      break;

    case 'pause':
      eventbus.broadcast('timeline-pause-request', []);
      break;

    case 'stop':
      eventbus.broadcast('timeline-stop-request', []);
      break;

    case 'restart':
      // Restart = stop then play (mirrors the restart button handler).
      eventbus.broadcast('timeline-stop-request', []);
      // Small delay to ensure stop completes before play.
      setTimeout(() => {
        eventbus.broadcast('timeline-play-request', []);
      }, 50);
      break;

    case 'destroy':
      await engineQueue.destroy();
      break;

    // CSS injection and hot-reload (Feature 011)
    case 'css-load': {
      const { cssId, content, loadOrder } = message.payload;
      // Creates or updates the stylesheet (textContent, never innerHTML) and
      // keeps it in cascade order, so reordered `styles` imports reorder it.
      applyCSSLoad(document, cssId, content, loadOrder);
      break;
    }

    case 'css-reload': {
      const { cssId, content } = message.payload;
      // Hot-reload: update content (timeline continues). Creates the stylesheet
      // when it is missing (e.g. its initial load failed and was then fixed).
      applyCSSReload(document, cssId, content);
      break;
    }

    case 'css-remove':
      applyCSSRemove(document, message.payload.cssId);
      break;

    case 'css-error': {
      // Keep previous CSS (if any) - no changes to DOM
      break;
    }
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
 * Hide playback controls (after a compile error: no usable engine is running).
 */
function hideControls(): void {
  const controls = document.getElementById('controls')!;
  controls.style.display = 'none';
}

/**
 * Set up event listeners for timeline state changes.
 * These listeners update the UI based on timeline events broadcast by Eligius.
 */
function setupTimelineEventListeners(): void {
  // Remove any listeners registered by a previous engine initialization before
  // re-registering. Without this, every re-init would stack another full set of
  // listeners, causing each timeline event to fire (and postMessage) N times.
  for (const remove of timelineListenerRemovers) {
    remove();
  }
  timelineListenerRemovers = [];

  timelineListenerRemovers.push(
    // Listen for PLAY event - timeline has started
    eventbus.on('timeline-play', () => {
      updateControlStates(true);
      vscode.postMessage({ type: 'playbackStarted' });
    }),

    // Listen for PAUSE event - timeline has paused
    eventbus.on('timeline-pause', () => {
      updateControlStates(false);
      vscode.postMessage({ type: 'playbackPaused' });
    }),

    // Listen for STOP event - timeline has stopped
    eventbus.on('timeline-stop', () => {
      updateControlStates(false);
      vscode.postMessage({ type: 'playbackStopped' });
    }),

    // Listen for COMPLETE event - timeline has finished
    eventbus.on('timeline-complete', () => {
      updateControlStates(false);
      vscode.postMessage({ type: 'playbackStopped' });
    }),

    // Listen for RESTART event - timeline has restarted
    eventbus.on('timeline-restart', () => {
      updateControlStates(true);
      vscode.postMessage({ type: 'playbackStarted' });
    }),

    // Register debug viewer to receive ALL eventbus events
    eventbus.registerEventlistener(debugViewer)
  );
}

// Initialize controls after DOM loads
window.addEventListener('DOMContentLoaded', () => {
  const playBtn = document.getElementById('play-btn')!;
  const pauseBtn = document.getElementById('pause-btn')!;
  const stopBtn = document.getElementById('stop-btn')!;
  const restartBtn = document.getElementById('restart-btn')!;

  // Wire up button click handlers to broadcast timeline control events
  playBtn.addEventListener('click', () => {
    eventbus.broadcast('timeline-play-request', []);
  });

  pauseBtn.addEventListener('click', () => {
    eventbus.broadcast('timeline-pause-request', []);
  });

  stopBtn.addEventListener('click', () => {
    eventbus.broadcast('timeline-stop-request', []);
  });

  restartBtn.addEventListener('click', () => {
    // Restart = stop then play
    eventbus.broadcast('timeline-stop-request', []);
    // Small delay to ensure stop completes before play
    setTimeout(() => {
      eventbus.broadcast('timeline-play-request', []);
    }, 50);
  });

  // Wire up retry button for error handling
  const retryBtn = document.getElementById('retry-button')!;
  retryBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'retry' });
    // Show loading state
    document.getElementById('error-container')!.style.display = 'none';
    document.getElementById('loading')!.style.display = 'block';
  });
});

// Send ready message to extension
vscode.postMessage({ type: 'ready' });
