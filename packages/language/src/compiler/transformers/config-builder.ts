/**
 * Configuration builders and IR→Eligius converters.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS). Pure functions that build default configuration values,
 * generate layout/provider settings, build the source map, and strip/convert IR
 * types into their Eligius equivalents.
 */
import selectorParser from 'postcss-selector-parser';
import type { LanguagesBlock } from '../../generated/ast.js';
import type { SourceLocation } from '../types/common.js';
import type {
  EndableActionIR,
  EventActionIR,
  IEndableActionConfiguration,
  IEngineInfo,
  ILabel,
  IOperationConfiguration,
  ITimelineActionConfiguration,
  ITimelineConfiguration,
  OperationConfigIR,
  SourceMap,
  TimelineActionIR,
  TimelineConfigIR,
  TimelineProviderSettingIR,
  TimelineProviderSettingsIR,
  TLanguageCode,
  TOperationData,
} from '../types/eligius-ir.js';
import { evaluateTimeExpression } from './time-transformer.js';

/**
 * Transform LanguagesBlock AST to Eligius language configuration
 *
 * Extracts language declarations and converts them to:
 * - `language: TLanguageCode` - Default language code
 * - `availableLanguages: ILabel[]` - Array of available languages
 *
 * Rules:
 * - Single language (1 entry): First entry becomes default (implicit)
 * - Multiple languages (2+ entries): Entry with isDefault=true becomes default (explicit * marker)
 * - Each ILabel gets a UUID v4 via crypto.randomUUID()
 *
 * @param block - LanguagesBlock AST node (if present)
 * @returns Object with language and availableLanguages properties
 *
 * Feature 037: Languages Declaration Syntax
 * Research Decision: RT-005 (Default language behavior)
 * Task: T006 (Stub), T011 (Full implementation)
 */
export function transformLanguagesBlock(block: LanguagesBlock | undefined): {
  language: TLanguageCode;
  availableLanguages: ILabel[];
} {
  // T013: Backward compatibility - if no languages block, default to en-US
  if (!block || block.entries.length === 0) {
    return {
      language: 'en-US',
      availableLanguages: [{ id: crypto.randomUUID(), languageCode: 'en-US', label: 'English' }],
    };
  }

  // T011: Full implementation for single language case
  // Single language (1 entry): First entry becomes default (implicit)
  // Multiple languages (2+ entries): Entry with isDefault=true becomes default (explicit * marker)

  // Find default language
  let defaultLanguageCode: string;
  if (block.entries.length === 1) {
    // Single language - implicit default (first entry)
    defaultLanguageCode = block.entries[0].code;
  } else {
    // Multiple languages - explicit default (entry with isDefault=true)
    const defaultEntry = block.entries.find(entry => entry.isDefault);
    defaultLanguageCode = defaultEntry!.code; // Validator ensures exactly one * marker
  }

  // T011: Map all entries to ILabel array with UUID v4 generation
  const availableLanguages: ILabel[] = block.entries.map(entry => ({
    id: crypto.randomUUID(), // UUID v4 for globally unique IDs
    languageCode: entry.code as TLanguageCode,
    label: entry.label,
  }));

  return {
    language: defaultLanguageCode as TLanguageCode,
    availableLanguages,
  };
}

/**
 * Create default configuration values for required Eligius fields
 *
 * Constitution VII: Uses crypto.randomUUID() for globally unique configuration ID.
 * UUIDs ensure no conflicts when merging configs or running concurrently.
 */
export function createDefaultConfiguration() {
  return {
    // Constitution VII: UUID v4 for globally unique configuration ID
    id: crypto.randomUUID(),
    engine: {
      systemName: 'EligiusEngine',
    } as IEngineInfo,
    containerSelector: '#eligius-container',
    language: 'en-US' as TLanguageCode,
    layoutTemplate: 'default',
    // T275: ILabel requires id property
    // T278: TLanguageCode format is `${Lowercase}-${Uppercase}` (e.g., 'en-US')
    availableLanguages: [
      { id: crypto.randomUUID(), languageCode: 'en-US' as TLanguageCode, label: 'English' },
    ] as ILabel[],
  };
}

/** One element of a generated layout: a compound selector made concrete. */
interface LayoutElement {
  readonly tag: string;
  readonly id: string | undefined;
  readonly classes: readonly string[];
  readonly attributes: ReadonlyArray<readonly [string, string]>;
  /** Canonical identity, so equal compounds at the same position merge. */
  readonly key: string;
}

interface LayoutTreeNode {
  readonly element: LayoutElement;
  readonly children: LayoutTreeNode[];
}

type LayoutEntry =
  | { readonly kind: 'element'; readonly node: LayoutTreeNode }
  | { readonly kind: 'comment'; readonly text: string };

/** HTML elements that cannot have content (so cannot contain a nested container). */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const TAG_NAME = /^[a-z][a-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A selector as an HTML comment (comments must not contain `--`). */
function layoutComment(selector: string, reason: string): string {
  const text = `eligian: no container generated for selector "${selector}" (${reason})`;
  return `<!-- ${text.replace(/-{2,}/g, match => match.split('').join(' ')).replace(/>/g, '&gt;')} -->`;
}

/**
 * Turn a selector into the chain of elements (outermost first) that matches it,
 * or a reason it cannot be represented as plain markup. Descendant and child
 * combinators nest; compounds keep their tag, id, classes and attributes.
 */
function selectorToElementPath(selector: string): LayoutElement[] | string {
  let root: selectorParser.Root;
  try {
    root = selectorParser().astSync(selector);
  } catch {
    return 'invalid selector';
  }
  if (root.nodes.length !== 1) {
    return root.nodes.length === 0 ? 'empty selector' : 'selector lists are not supported';
  }

  const path: LayoutElement[] = [];
  let tag: string | undefined;
  let id: string | undefined;
  let classes: string[] = [];
  let attributes: Array<[string, string]> = [];
  let compoundIsEmpty = true;

  const finishCompound = (): string | undefined => {
    if (compoundIsEmpty) {
      return 'dangling combinator';
    }
    const element: LayoutElement = {
      tag: tag ?? 'div',
      id,
      classes,
      attributes,
      key: JSON.stringify([
        tag ?? 'div',
        id ?? null,
        [...classes].sort(),
        [...attributes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ]),
    };
    path.push(element);
    tag = undefined;
    id = undefined;
    classes = [];
    attributes = [];
    compoundIsEmpty = true;
    return undefined;
  };

  for (const node of root.nodes[0].nodes) {
    switch (node.type) {
      case 'tag': {
        const name = node.value.toLowerCase();
        if (!TAG_NAME.test(name) || node.namespace) {
          return `unsupported tag '${node.value}'`;
        }
        tag = name;
        compoundIsEmpty = false;
        break;
      }
      case 'universal':
        compoundIsEmpty = false;
        break;
      case 'id':
        if (id !== undefined && id !== node.value) {
          return 'an element cannot have two ids';
        }
        id = node.value;
        compoundIsEmpty = false;
        break;
      case 'class':
        if (!classes.includes(node.value)) {
          classes.push(node.value);
        }
        compoundIsEmpty = false;
        break;
      case 'attribute': {
        const name = node.attribute;
        if (!ATTRIBUTE_NAME.test(name) || name === 'id' || name === 'class' || node.namespace) {
          return `unsupported attribute '${name}'`;
        }
        if (node.operator !== undefined && node.operator !== '=') {
          return `unsupported attribute operator '${node.operator}'`;
        }
        attributes.push([name, node.operator === '=' ? (node.value ?? '') : '']);
        compoundIsEmpty = false;
        break;
      }
      case 'combinator': {
        if (node.value.trim() !== '' && node.value.trim() !== '>') {
          return `unsupported combinator '${node.value.trim()}'`;
        }
        const error = finishCompound();
        if (error) {
          return error;
        }
        break;
      }
      case 'comment':
        break;
      default:
        return `unsupported ${node.type} '${String(node)}'`;
    }
  }
  const error = finishCompound();
  if (error) {
    return error;
  }

  for (let i = 0; i < path.length - 1; i++) {
    if (VOID_ELEMENTS.has(path[i].tag)) {
      return `<${path[i].tag}> cannot contain elements`;
    }
  }
  return path;
}

function renderLayoutNode(node: LayoutTreeNode): string {
  const { tag, id, classes, attributes } = node.element;
  let attrs = '';
  if (id !== undefined) {
    attrs += ` id="${escapeHtmlAttribute(id)}"`;
  }
  if (classes.length > 0) {
    attrs += ` class="${escapeHtmlAttribute(classes.join(' '))}"`;
  }
  for (const [name, value] of attributes) {
    attrs += ` ${name}="${escapeHtmlAttribute(value)}"`;
  }
  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`;
  }
  return `<${tag}${attrs}>${node.children.map(renderLayoutNode).join('')}</${tag}>`;
}

/**
 * Generate HTML layout template with container elements for all timeline selectors.
 *
 * Eligius sets containerSelector.html(layoutTemplate) during initialization,
 * so we need to provide HTML that includes an element for every timeline selector.
 *
 * - Each compound selector becomes one element carrying all of its parts
 *   (`div#z.a.b` → `<div id="z" class="a b"></div>`).
 * - Descendant / child combinators nest (`.p > .q` → `.p` containing `.q`).
 * - Selectors are merged into one tree, so timelines sharing a container (or
 *   an ancestor) share its element and no id is emitted twice.
 * - Selectors that plain markup cannot express (pseudo-classes, sibling
 *   combinators, selector lists, conflicting ids, ...) produce an HTML comment
 *   naming the selector instead of a non-matching element.
 *
 * @param timelines - All timeline configurations
 * @returns HTML string with container elements
 *
 * @example
 * Input: [{ selector: '.timeline1' }, { selector: '#timeline2' }]
 * Output: '<div class="timeline1"></div><div id="timeline2"></div>'
 */
export function generateLayoutTemplate(timelines: TimelineConfigIR[]): string {
  const entries: LayoutEntry[] = [];
  const topLevel: LayoutTreeNode[] = [];
  const nodesById = new Map<string, LayoutTreeNode>();
  const seenSelectors = new Set<string>();

  for (const { selector } of timelines) {
    if (seenSelectors.has(selector)) {
      continue;
    }
    seenSelectors.add(selector);

    const path = selectorToElementPath(selector);
    if (typeof path === 'string') {
      entries.push({ kind: 'comment', text: layoutComment(selector, path) });
      continue;
    }

    // Resolve the path against the tree first, so a conflict changes nothing.
    let siblings = topLevel;
    let depth = 0;
    let parent: LayoutTreeNode | undefined;
    for (; depth < path.length; depth++) {
      const existing = siblings.find(n => n.element.key === path[depth].key);
      if (!existing) {
        break;
      }
      parent = existing;
      siblings = existing.children;
    }
    const toCreate = path.slice(depth);
    const newIds = toCreate.map(e => e.id).filter((i): i is string => i !== undefined);
    const conflict = newIds.find((i, index) => nodesById.has(i) || newIds.indexOf(i) !== index);
    if (conflict !== undefined) {
      entries.push({
        kind: 'comment',
        text: layoutComment(selector, `id '${conflict}' is already used by another container`),
      });
      continue;
    }
    if (parent && VOID_ELEMENTS.has(parent.element.tag) && toCreate.length > 0) {
      entries.push({
        kind: 'comment',
        text: layoutComment(selector, `<${parent.element.tag}> cannot contain elements`),
      });
      continue;
    }

    for (const element of toCreate) {
      const node: LayoutTreeNode = { element, children: [] };
      if (element.id !== undefined) {
        nodesById.set(element.id, node);
      }
      if (siblings === topLevel) {
        entries.push({ kind: 'element', node });
      }
      siblings.push(node);
      siblings = node.children;
    }
  }

  // Return only the timeline containers
  // UI controls are kept separate in the webview HTML (outside #eligius-container)
  return entries
    .map(entry => (entry.kind === 'comment' ? entry.text : renderLayoutNode(entry.node)))
    .join('');
}

/**
 * T280: Build SourceMap - parallel structure tracking source locations
 *
 * Maps entity IDs to their source locations for error reporting.
 * This allows us to strip sourceLocation from Eligius types while maintaining traceability.
 */
export function buildSourceMap(
  rootLocation: SourceLocation,
  initActions: EndableActionIR[],
  actions: EndableActionIR[],
  eventActions: EventActionIR[],
  timelines: TimelineConfigIR[]
): SourceMap {
  const actionMap = new Map<string, SourceLocation>();
  const operationMap = new Map<string, SourceLocation>();
  const timelineMap = new Map<string, SourceLocation>();
  const timelineActionMap = new Map<string, SourceLocation>();

  // Map init actions
  for (const action of initActions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
    for (const op of action.endOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map actions
  for (const action of actions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
    for (const op of action.endOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map event actions
  for (const action of eventActions) {
    actionMap.set(action.id, action.sourceLocation);
    for (const op of action.startOperations) {
      operationMap.set(op.id, op.sourceLocation);
    }
  }

  // Map timelines and timeline actions
  for (const timeline of timelines) {
    timelineMap.set(timeline.id, timeline.sourceLocation);
    for (const timelineAction of timeline.timelineActions) {
      timelineActionMap.set(timelineAction.id, timelineAction.sourceLocation);
      for (const op of timelineAction.startOperations) {
        operationMap.set(op.id, op.sourceLocation);
      }
      for (const op of timelineAction.endOperations) {
        operationMap.set(op.id, op.sourceLocation);
      }
    }
  }

  return {
    root: rootLocation,
    actions: actionMap,
    operations: operationMap,
    timelines: timelineMap,
    timelineActions: timelineActionMap,
  };
}

/**
 * T281: Strip sourceLocation from EndableActionIR → IEndableActionConfiguration
 */
export function stripSourceLocation(action: EndableActionIR): IEndableActionConfiguration {
  return {
    id: action.id,
    name: action.name,
    startOperations: action.startOperations.map(stripOperationSourceLocation),
    endOperations: action.endOperations.map(stripOperationSourceLocation),
  };
}

/**
 * T281: Strip sourceLocation from OperationConfigIR → IOperationConfiguration
 */
export function stripOperationSourceLocation(
  op: OperationConfigIR
): IOperationConfiguration<TOperationData> {
  return {
    id: op.id,
    systemName: op.systemName,
    operationData: op.operationData,
  };
}

/**
 * T281: Convert TimelineConfigIR → ITimelineConfiguration
 */
export function convertTimelineConfigToEligius(timeline: TimelineConfigIR): ITimelineConfiguration {
  return {
    id: timeline.id,
    uri: timeline.uri,
    type: timeline.type,
    duration: timeline.duration,
    loop: timeline.loop,
    selector: timeline.selector,
    ...(timeline.positionSource ? { positionSource: timeline.positionSource } : {}),
    timelineActions: timeline.timelineActions.map(convertTimelineActionToEligius),
  };
}

/**
 * T281: Convert TimelineActionIR → ITimelineActionConfiguration
 */
export function convertTimelineActionToEligius(
  action: TimelineActionIR
): ITimelineActionConfiguration {
  // Convert DurationIR to IDuration (evaluate TimeExpression to numbers)
  const start =
    typeof action.duration.start === 'number'
      ? action.duration.start
      : evaluateTimeExpression(action.duration.start);
  const end =
    typeof action.duration.end === 'number'
      ? action.duration.end
      : evaluateTimeExpression(action.duration.end);

  return {
    id: action.id,
    name: action.name,
    startOperations: action.startOperations.map(stripOperationSourceLocation),
    endOperations: action.endOperations.map(stripOperationSourceLocation),
    duration: { start, end },
  };
}

/**
 * T271: Map DSL provider name to Eligius timeline type
 * T278: Returns only Eligius TimelineTypes ('animation' | 'mediaplayer')
 *
 * DSL uses provider names (raf, video, audio) while Eligius uses type names.
 * Mapping:
 * - raf → animation (requestAnimationFrame-based timeline)
 * - video → mediaplayer (HTML5 video timeline)
 * - audio → mediaplayer (HTML5 audio timeline)
 */
export function mapProviderToTimelineType(provider: string): 'animation' | 'mediaplayer' {
  switch (provider) {
    case 'raf':
      return 'animation';
    case 'video':
    case 'audio':
      return 'mediaplayer';
    default:
      return 'animation'; // Default to animation for unknown providers
  }
}

/** MIME types of common media file extensions (lowercase, without the dot). */
const MEDIA_MIME_TYPES: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  m3u8: 'application/x-mpegURL',
  mpd: 'application/dash+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  oga: 'audio/ogg',
  flac: 'audio/flac',
};

/**
 * MIME type of a media source, from its file extension. Unknown extensions fall back
 * to `video/<ext>` / `audio/<ext>` according to the timeline provider.
 */
export function mediaMimeType(src: string, provider: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(src)?.[1]?.toLowerCase() ?? '';
  const known = Object.keys(MEDIA_MIME_TYPES).includes(ext) ? MEDIA_MIME_TYPES[ext] : undefined;
  if (known) return known;
  const kind = provider === 'audio' ? 'audio' : 'video';
  return ext ? `${kind}/${ext}` : `${kind}/mp4`;
}

/**
 * Per-timeline `VideoPositionSource` settings for a media timeline: the player renders
 * into the timeline's container and plays the `from "..."` source. Returns `undefined`
 * for non-media timelines and for media timelines without a source.
 */
export function mediaPositionSource(
  provider: string,
  source: string | undefined,
  selector: string
): TimelineConfigIR['positionSource'] {
  if (mapProviderToTimelineType(provider) !== 'mediaplayer' || !source) {
    return undefined;
  }
  return { selector, sources: [{ src: source, type: mediaMimeType(source, provider) }] };
}

/**
 * T273: Generate timelineProviderSettings based on timeline types used
 *
 * Creates provider settings for each unique timeline type in the program.
 * Eligius 2.0.0 API: Uses positionSource configuration with systemName
 * - animation: RafPositionSource
 * - mediaplayer: VideoPositionSource (for video/audio)
 *
 * Each provider setting includes:
 * - positionSource.systemName: Eligius position source class name
 * - positionSource.selector: CSS selector (only for mediaplayer)
 */
export function generateTimelineProviderSettings(
  timelines: TimelineConfigIR[]
): TimelineProviderSettingsIR {
  const settings: Record<string, TimelineProviderSettingIR> = {};

  // Collect unique timeline types
  const timelineTypes = new Set<string>();
  for (const timeline of timelines) {
    // Only include 'animation' and 'mediaplayer' (not legacy types)
    if (timeline.type === 'animation' || timeline.type === 'mediaplayer') {
      timelineTypes.add(timeline.type);
    }
  }

  // Generate provider settings for each type (Eligius 2.0.0 API)
  for (const type of timelineTypes) {
    if (type === 'animation') {
      settings.animation = {
        positionSource: {
          systemName: 'RafPositionSource',
        },
      };
    } else if (type === 'mediaplayer') {
      settings.mediaplayer = {
        positionSource: {
          systemName: 'VideoPositionSource',
          // Each media timeline sets its own selector and sources (see mediaPositionSource)
          selector: '',
        },
      };
    }
  }

  return settings as TimelineProviderSettingsIR;
}
