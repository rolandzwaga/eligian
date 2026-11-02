/**
 * Scrubber, time readout, timeline picker and language picker of the preview
 * (audit feature idea #5). Pure helpers plus the DOM updates, kept out of
 * preview.ts so they can be tested without the engine.
 */
import type { PlayheadTimeline } from './playhead.js';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

/** The parts of a compiled configuration the controls show. */
export interface ControlsConfig {
  readonly timelines?: ReadonlyArray<{ readonly uri: string; readonly duration?: number }>;
  readonly availableLanguages?: ReadonlyArray<{
    readonly languageCode: string;
    readonly label: string;
  }>;
  readonly language?: string;
}

/** `12.3s`, or `1:02.3` from one minute on. */
export function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (value < 60) return `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** `12.3s / 45.0s`, or just the position when the duration is unknown. */
export function timeReadout(position: number, duration: number | undefined): string {
  return duration !== undefined && Number.isFinite(duration) && duration > 0
    ? `${formatTime(position)} / ${formatTime(duration)}`
    : formatTime(position);
}

/** The configuration's timelines, by uri, with their compiled durations. */
export function timelinesOf(config: ControlsConfig): PlayheadTimeline[] {
  return (config.timelines ?? []).map(({ uri, duration }) => ({ uri, duration }));
}

/** Timeline picker entries: the timeline uri (its name for raf timelines). */
export function timelineOptions(config: ControlsConfig): PickerOption[] {
  return (config.timelines ?? []).map(({ uri }) => ({ value: uri, label: uri }));
}

/** Language picker entries from `availableLanguages`. */
export function languageOptions(config: ControlsConfig): PickerOption[] {
  return (config.availableLanguages ?? []).map(({ languageCode, label }) => ({
    value: languageCode,
    label: label ? `${label} (${languageCode})` : languageCode,
  }));
}

/**
 * The language to show after a (re)compile: the one picked before when the
 * configuration still has it, else the configuration's default.
 */
export function initialLanguage(
  config: ControlsConfig,
  picked: string | undefined
): string | undefined {
  const codes = (config.availableLanguages ?? []).map(language => language.languageCode);
  return picked !== undefined && codes.includes(picked) ? picked : config.language;
}

/**
 * Fill `select` with `options` (as text, never markup) and select `value`.
 * A picker with fewer than two options has nothing to pick and is hidden.
 */
export function fillPicker(
  select: HTMLSelectElement,
  options: readonly PickerOption[],
  value: string | undefined
): void {
  select.replaceChildren(
    ...options.map(option => {
      const element = select.ownerDocument.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      return element;
    })
  );
  if (value !== undefined) select.value = value;
  select.style.display = options.length > 1 ? '' : 'none';
}

/** Show `position` of `duration` on the scrubber and the readout. */
export function showPlayhead(
  scrubber: HTMLInputElement,
  readout: HTMLElement,
  position: number,
  duration: number | undefined
): void {
  const known = duration !== undefined && Number.isFinite(duration) && duration > 0;
  scrubber.max = String(known ? duration : 0);
  scrubber.disabled = !known;
  scrubber.value = String(Math.max(0, known ? Math.min(position, duration) : position));
  readout.textContent = timeReadout(position, duration);
}

/** Webview state key of the language picked in the preview. */
export const LANGUAGE_STATE_KEY = 'previewLanguage';

export function pickedLanguage(state: unknown): string | undefined {
  const value = (state as Record<string, unknown> | undefined)?.[LANGUAGE_STATE_KEY];
  return typeof value === 'string' ? value : undefined;
}

/** `state` with the picked language set, keeping its other keys. */
export function withPickedLanguage(state: unknown, language: string): Record<string, unknown> {
  const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return { ...base, [LANGUAGE_STATE_KEY]: language };
}
