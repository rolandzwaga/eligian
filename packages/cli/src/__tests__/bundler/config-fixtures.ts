/**
 * Shared fixture builder for bundler tests.
 *
 * Tests describe configs with only the fields the bundler actually reads. This
 * helper completes them into a fully typed `IEngineConfiguration` (ids, engine
 * info, language, ...) so specs stay type-correct without repeating boilerplate.
 */

import type { IEngineConfiguration, TLanguageCode } from 'eligius';

export interface LooseOperation {
  systemName: string;
  operationData?: Record<string, unknown>;
}

export interface LooseAction {
  name: string;
  startOperations: LooseOperation[];
  endOperations?: LooseOperation[];
}

export interface LooseTimelineAction {
  startTime?: number;
  endTime?: number;
  startOperations: LooseOperation[];
  endOperations?: LooseOperation[];
}

export interface LooseTimeline {
  uri: string;
  timelineActions: LooseTimelineAction[];
  /** Other timeline fields (type, selector, positionSource, ...) */
  [key: string]: unknown;
}

export interface LooseConfigInput {
  containerSelector: string;
  /**
   * Provider settings keyed by provider type. The bundler reads these loosely at
   * runtime (`src`, `selector`, `positionSource`, ...), so tests may use keys that
   * are not part of the public `TimelineTypes` union (e.g. `video`, `lottie`).
   */
  timelineProviderSettings?: Record<string, Record<string, unknown>>;
  initActions: LooseAction[];
  actions: LooseAction[];
  timelines: LooseTimeline[];
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function toOperations(ops: LooseOperation[] | undefined) {
  return (ops ?? []).map(op => ({
    id: nextId('op'),
    systemName: op.systemName,
    ...(op.operationData ? { operationData: op.operationData } : {}),
  }));
}

function toAction(action: LooseAction) {
  return {
    id: nextId('action'),
    name: action.name,
    startOperations: toOperations(action.startOperations),
    endOperations: toOperations(action.endOperations),
  };
}

/** Complete a loose test config into a full, correctly typed engine configuration. */
export function buildConfig(input: LooseConfigInput): IEngineConfiguration {
  return {
    id: 'test-config',
    engine: { systemName: 'EligiusEngine' },
    containerSelector: input.containerSelector,
    cssFiles: [],
    language: 'en-US' satisfies TLanguageCode,
    layoutTemplate: '',
    availableLanguages: [],
    ...(input.timelineProviderSettings
      ? {
          // Loose by design: see LooseConfigInput.timelineProviderSettings.
          timelineProviderSettings:
            input.timelineProviderSettings as IEngineConfiguration['timelineProviderSettings'],
        }
      : {}),
    initActions: input.initActions.map(toAction),
    actions: input.actions.map(toAction),
    timelines: input.timelines.map(timeline => ({
      id: nextId('timeline'),
      uri: timeline.uri,
      type: 'animation' as const,
      duration: 0,
      loop: false,
      selector: '',
      timelineActions: timeline.timelineActions.map(action => ({
        ...toAction({ name: '', ...action }),
        duration: { start: action.startTime ?? 0, end: action.endTime },
      })),
    })),
  };
}

/** Return a copy of `config` with loosely-typed provider settings (see {@link LooseConfigInput}). */
export function withProviderSettings(
  config: IEngineConfiguration,
  timelineProviderSettings: Record<string, Record<string, unknown>>
): IEngineConfiguration {
  return {
    ...config,
    timelineProviderSettings:
      timelineProviderSettings as IEngineConfiguration['timelineProviderSettings'],
  };
}
