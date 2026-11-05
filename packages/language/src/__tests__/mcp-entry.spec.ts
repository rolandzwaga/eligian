import { describe, expect, it } from 'vitest';
import type {
  ActionBody,
  ControllerBalance,
  ControllerMetadata,
  HTMLAttributeMetadata,
  LayoutElements,
  LifecycleInsertionPoint,
  ParameterRole,
  PlaybackVerb,
  SelectorNames,
  TimelineEventMetadata,
  TimelineSymbol,
  WalkEvent,
  WalkedOperation,
  WalkResult,
} from '../mcp.js';
// Loaded at collection time: the entry pulls in the whole language service graph (seconds)
import * as mcp from '../mcp.js';

describe('@eligian/language/mcp', () => {
  it('exports exactly the list', () => {
    expect(Object.keys(mcp).sort()).toEqual([
      'ASSET_REVIEW_CODES',
      'COMMON_HTML_ATTRIBUTES',
      'CONTROLLERS',
      'DOM_EVENTS',
      'EligianDocumentSymbolProvider',
      'HTMLRegistryService',
      'HTML_ELEMENT_NAMES',
      'KEY_COMPLETIONS',
      'SELF_RESOLVED',
      'TIMELINE_EVENTS',
      'TIMELINE_REVIEW_CODES',
      'argumentRole',
      'calledAction',
      'controllerBalance',
      'eligiusTypeToDslAnnotation',
      'getController',
      'getElementAttributes',
      'getOrCreateServices',
      'hostControllers',
      'hostFunctions',
      'interactionActionName',
      'layoutElementsOf',
      'lifecycleInsertionPoints',
      'navigatesTo',
      'parameterRoles',
      'readLayoutHtml',
      'resolveOperationData',
      'scanLayoutElements',
      'selectorNames',
      'similarTimelineNames',
      'timelineFindings',
      'timelineNamed',
      'timelineNames',
      'timelineSymbolAt',
      'walkOperations',
    ]);
  });

  it('types', () => {
    const layout: LayoutElements = mcp.scanLayoutElements('<div id="a" class="b"></div>');
    const role: ParameterRole = 'selector';
    const controller: ControllerMetadata | undefined = mcp.getController('LabelController');
    const events: readonly TimelineEventMetadata[] = mcp.TIMELINE_EVENTS;
    const operations: readonly WalkedOperation[] = [];
    const actions = new Map<string, ActionBody>();
    const walk: WalkResult = mcp.walkOperations(operations, actions);
    const walkEvents: readonly WalkEvent[] = walk.events;
    const balances: readonly ControllerBalance[] = [];
    const points: readonly LifecycleInsertionPoint[] = [];
    const names = undefined as SelectorNames | undefined;
    const symbol = undefined as TimelineSymbol | undefined;
    const attributes: readonly HTMLAttributeMetadata[] = mcp.getElementAttributes('a');
    const verb: PlaybackVerb = 'pause';

    expect(layout.ids.has('a')).toBe(true);
    expect(role).toBe('selector');
    expect(controller?.name).toBe('LabelController');
    expect(events.length).toBeGreaterThan(0);
    expect(walkEvents).toEqual([]);
    expect(walk.unresolved).toEqual([]);
    expect([balances, points, names, symbol]).toEqual([[], [], undefined, undefined]);
    expect(attributes.some(attribute => attribute.name === 'href')).toBe(true);
    expect(mcp.COMMON_HTML_ATTRIBUTES.some(attribute => attribute.name === 'id')).toBe(true);
    expect(mcp.HTML_ELEMENT_NAMES).toContain('div');
    expect(mcp.interactionActionName(verb, undefined, 0)).toBe('__on__pause');
  });

  it('SELF_RESOLVED marks broadcastEvent eventArgs', () => {
    const broadcast = mcp.SELF_RESOLVED.broadcastEvent;
    expect(broadcast).not.toBe('*');
    expect(broadcast instanceof Set && broadcast.has('eventArgs')).toBe(true);
  });
});
