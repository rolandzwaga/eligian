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
  type IEventbus,
  type IEventbusListener,
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

// Eligius engine instance (null until initialized)
let engine: IEligiusEngine | null = null;
let factory: EngineFactory | null = null;

// Create shared eventbus for controlling playback
const eventbus: IEventbus = new Eventbus();

/**
 * Initialize the Eligius engine with the given configuration.
 *
 * Timeline container elements are automatically created by Eligius via the layoutTemplate.
 */
async function initializeEngine(config: IEngineConfiguration): Promise<void> {
  try {
    // Clean up previous engine if exists
    if (engine) {
      await engine.destroy();
      engine = null;
    }

    // Timeline containers are created by Eligius via layoutTemplate
    // (no need to manually create them here)

    // Create engine factory with shared eventbus
    factory = new EngineFactory(new EligiusResourceImporter(), window, {
      eventbus, // Pass our eventbus so we can control playback
    });

    // Create engine from config
    engine = factory.createEngine(config);

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
 */
async function destroyEngine(): Promise<void> {
  if (engine) {
    try {
      await engine.destroy();
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

    // Render events
    container.innerHTML = filteredEvents
      .map(event => {
        const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
        } as Intl.DateTimeFormatOptions);

        const topicHtml = event.eventTopic
          ? `<div class="debug-event-topic">Topic: ${event.eventTopic}</div>`
          : '';

        const argsJson = JSON.stringify(event.args, null, 2);

        return `
          <div class="debug-event">
            <div class="debug-event-header">
              <span class="debug-event-name">${event.eventName}</span>
              <span class="debug-event-time">${time}</span>
            </div>
            ${topicHtml}
            <div class="debug-event-args">${argsJson}</div>
          </div>
        `;
      })
      .join('');

    // Show message if no events
    if (filteredEvents.length === 0) {
      container.innerHTML =
        '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">No events to display</div>';
    }
  }
}

// Create debug viewer instance
const debugViewer = new EventbusDebugViewer();

// Listen for messages from extension
window.addEventListener('message', async event => {
  const message = event.data;

  switch (message.type) {
    case 'updateConfig': {
      // Hide loading, show error container
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
      vscode.postMessage({ type: 'playbackStarted' });
      break;

    case 'pause':
      vscode.postMessage({ type: 'playbackPaused' });
      break;

    case 'stop':
      vscode.postMessage({ type: 'playbackStopped' });
      break;

    case 'restart':
      vscode.postMessage({ type: 'playbackStopped' });
      // Will implement actual restart logic later
      vscode.postMessage({ type: 'playbackStarted' });
      break;

    case 'destroy':
      await destroyEngine();
      break;

    // CSS injection and hot-reload (Feature 011)
    case 'css-load': {
      const { cssId, content, loadOrder } = message.payload;

      let styleTag = document.querySelector(`style[data-css-id="${cssId}"]`) as HTMLStyleElement;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.setAttribute('data-css-id', cssId);
        styleTag.setAttribute('data-load-order', loadOrder.toString());
        document.head.appendChild(styleTag);
      }
      // CRITICAL: Use textContent (NOT innerHTML) for security
      styleTag.textContent = content;
      break;
    }

    case 'css-reload': {
      const { cssId, content } = message.payload;

      const styleTag = document.querySelector(`style[data-css-id="${cssId}"]`) as HTMLStyleElement;
      if (styleTag) {
        // Hot-reload: just update content (timeline continues)
        styleTag.textContent = content;
      }
      break;
    }

    case 'css-remove': {
      const { cssId } = message.payload;

      const styleTag = document.querySelector(`style[data-css-id="${cssId}"]`);
      if (styleTag) {
        styleTag.remove();
      }
      break;
    }

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
 * Hide playback controls (reserved for future use).
 */
// @ts-expect-error - Reserved for future use
function _hideControls(): void {
  const controls = document.getElementById('controls')!;
  controls.style.display = 'none';
}

/**
 * Set up event listeners for timeline state changes.
 * These listeners update the UI based on timeline events broadcast by Eligius.
 */
function setupTimelineEventListeners(): void {
  // Listen for PLAY event - timeline has started
  eventbus.on('timeline-play', () => {
    updateControlStates(true);
    vscode.postMessage({ type: 'playbackStarted' });
  });

  // Listen for PAUSE event - timeline has paused
  eventbus.on('timeline-pause', () => {
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackPaused' });
  });

  // Listen for STOP event - timeline has stopped
  eventbus.on('timeline-stop', () => {
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackStopped' });
  });

  // Listen for COMPLETE event - timeline has finished
  eventbus.on('timeline-complete', () => {
    updateControlStates(false);
    vscode.postMessage({ type: 'playbackStopped' });
  });

  // Listen for RESTART event - timeline has restarted
  eventbus.on('timeline-restart', () => {
    updateControlStates(true);
    vscode.postMessage({ type: 'playbackStarted' });
  });

  // Register debug viewer to receive ALL eventbus events
  eventbus.registerEventlistener(debugViewer);
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
