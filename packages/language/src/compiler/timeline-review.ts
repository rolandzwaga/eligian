/**
 * The timeline review checks (spec 058 phase 2, FR-050, FR-024; plan A2): five
 * findings about a program's timelines that only need its AST, its layout and
 * the file system. Shared by `eligian check`'s review pass and the MCP server's
 * `assets.problems`, so both report the same. Pure: no services, no workspace.
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { AstUtils, type CstNode, GrammarUtils } from 'langium';
import { parseSelector } from '../css/selector-parser.js';
import { isInteractionStatement, type Program, type Timeline } from '../generated/ast.js';
import { readLayoutHtml, scanLayoutElements } from '../html/layout-elements.js';
import { resolveImportRelativePath } from '../utils/path-utils.js';
import { getTimelines } from '../utils/program-helpers.js';

export const TIMELINE_REVIEW_CODES = [
  'media-file-missing',
  'media-from-duplicate',
  'timeline-container-not-in-layout',
  'media-timeline-first-without-start-gesture',
  'entry-timeline-without-enter',
] as const;
export type TimelineReviewCode = (typeof TIMELINE_REVIEW_CODES)[number];
/** The three FR-024 asset problems among them */
export const ASSET_REVIEW_CODES: readonly TimelineReviewCode[] = TIMELINE_REVIEW_CODES.slice(0, 3);

export interface TimelineFinding {
  readonly code: TimelineReviewCode;
  readonly message: string;
  /** The timeline's source name */
  readonly timeline: string;
  /** 1-based range of the reported property (the `from` string, the `in` selector, or the name) */
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** Media codes: the resolved absolute path */
  readonly path?: string;
}

type ReportedProperty = 'source' | 'containerSelector' | 'name';

const isMedia = (timeline: Timeline): boolean =>
  timeline.provider === 'video' || timeline.provider === 'audio';

/** Case-insensitive on Windows, where the file system is. */
const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** Whether an `on enter` block of `timeline` holds `on click "<sel>" play` or `toggle`. */
const hasStartGesture = (timeline: Timeline): boolean =>
  timeline.lifecycle
    .filter(block => block.kind === 'enter')
    .some(block =>
      AstUtils.streamAllContents(block).some(
        node =>
          isInteractionStatement(node) &&
          node.event === 'click' &&
          (node.verb === 'play' || node.verb === 'toggle')
      )
    );

/** The 1-based range of `property` of `timeline` (the whole timeline when it has no CST for it). */
function rangeOf(
  timeline: Timeline,
  property: ReportedProperty
): Pick<TimelineFinding, 'line' | 'column' | 'endLine' | 'endColumn'> {
  const cst = timeline.$cstNode;
  const node: CstNode | undefined = (cst && GrammarUtils.findNodeForProperty(cst, property)) ?? cst;
  if (!node) return { line: 1, column: 1, endLine: 1, endColumn: 1 };
  const { start, end } = node.range;
  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

/** The five timeline checks of `program`, compiled from or loaded at `file` (absolute). */
export function timelineFindings(
  program: Program,
  file: string,
  options?: { readonly exists?: (absolutePath: string) => boolean }
): TimelineFinding[] {
  const exists = options?.exists ?? existsSync;
  const timelines = getTimelines(program);
  const findings: TimelineFinding[] = [];
  const report = (
    timeline: Timeline,
    code: TimelineReviewCode,
    property: ReportedProperty,
    message: string,
    mediaPath?: string
  ): void => {
    findings.push({
      code,
      message,
      timeline: timeline.name,
      ...rangeOf(timeline, property),
      ...(mediaPath !== undefined ? { path: mediaPath } : {}),
    });
  };

  // media-file-missing, media-from-duplicate
  const firstBySource = new Map<string, Timeline>();
  for (const timeline of timelines) {
    if (!isMedia(timeline) || !timeline.source) continue;
    const mediaPath = resolveImportRelativePath(timeline.source, path.dirname(file));
    if (!exists(mediaPath)) {
      report(
        timeline,
        'media-file-missing',
        'source',
        `The ${timeline.provider} file of timeline "${timeline.name}" does not exist: ${mediaPath}`,
        mediaPath
      );
    }
    const key = comparable(mediaPath);
    const first = firstBySource.get(key);
    if (first) {
      report(
        timeline,
        'media-from-duplicate',
        'source',
        `Timeline "${timeline.name}" plays the same file as timeline "${first.name}": ${mediaPath}`,
        mediaPath
      );
    } else {
      firstBySource.set(key, timeline);
    }
  }

  // timeline-container-not-in-layout (without a layout, the engine generates the containers)
  const html = readLayoutHtml(program);
  if (html !== undefined) {
    const layout = scanLayoutElements(html);
    for (const timeline of timelines) {
      const { classes, ids } = parseSelector(timeline.containerSelector);
      const missing = [
        ...classes.filter(name => !layout.classes.has(name)).map(name => `.${name}`),
        ...ids.filter(name => !layout.ids.has(name)).map(name => `#${name}`),
      ];
      if (missing.length === 0) continue;
      report(
        timeline,
        'timeline-container-not-in-layout',
        'containerSelector',
        `The container "${timeline.containerSelector}" of timeline "${timeline.name}" is not in the layout (missing ${missing.join(', ')}); it must exist when the layout is rendered`
      );
    }
  }

  const entry = timelines[0];
  // media-timeline-first-without-start-gesture
  if (entry && isMedia(entry) && !hasStartGesture(entry)) {
    report(
      entry,
      'media-timeline-first-without-start-gesture',
      'name',
      `The entry timeline "${entry.name}" is a ${entry.provider} timeline, but its 'on enter' holds no 'on click "<selector>" play' or 'toggle': browsers block media playback without a user gesture`
    );
  }

  // entry-timeline-without-enter (Q2: only with two or more timelines)
  if (timelines.length >= 2 && !entry.lifecycle.some(block => block.kind === 'enter')) {
    report(
      entry,
      'entry-timeline-without-enter',
      'name',
      `The entry timeline "${entry.name}" has no 'on enter' block; with ${timelines.length} timelines, the entry usually sets up the navigation or start controls there`
    );
  }

  return findings;
}

/** The source names of the program's timelines, in document (= config) order. */
export function timelineNames(program: Program): string[] {
  return getTimelines(program).map(timeline => timeline.name);
}
