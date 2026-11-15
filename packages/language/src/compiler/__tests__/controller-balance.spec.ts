/**
 * The controller / class walker lifted from tour-controllers.spec.ts (spec 058, FR-028, C8):
 * `$operationdata` resolution, the selection / controller / class events of an operation list
 * (following requestAction + startAction), and the per-timeline lifecycle balance.
 */

import type { IEngineConfiguration } from 'eligius';
import { describe, expect, it } from 'vitest';
import {
  type ActionBody,
  controllerBalance,
  resolveOperationData,
  type WalkedOperation,
  walkOperations,
} from '../controller-balance.js';

const op = (systemName: string, operationData?: Record<string, unknown>): WalkedOperation =>
  operationData === undefined ? { systemName } : { systemName, operationData };

const call = (name: string, actionOperationData?: Record<string, unknown>): WalkedOperation[] => [
  op('requestAction', { systemName: name }),
  op('startAction', actionOperationData === undefined ? {} : { actionOperationData }),
];

describe('resolveOperationData', () => {
  it('resolves $operationdata references deeply', () => {
    expect(
      resolveOperationData(
        { a: '$operationdata.x', b: ['$operationdata.y'], c: 'plain', d: 3 },
        { x: 1, y: 'z' }
      )
    ).toEqual({ a: 1, b: ['z'], c: 'plain', d: 3 });
  });
});

describe('walkOperations', () => {
  it('tracks selection, controllers and classes', () => {
    const result = walkOperations(
      [
        op('selectElement', { selector: '#x' }),
        op('getControllerInstance', { systemName: 'KeyboardController' }),
        op('addControllerToElement'),
        op('addClass', { className: 'a' }),
        op('removeClass', { className: 'b' }),
        op('toggleClass', { className: 'c' }),
        op('removeControllerFromElement', { controllerName: 'KeyboardController' }),
      ],
      new Map()
    );
    expect(result.events).toEqual([
      {
        kind: 'controller-added',
        selector: '#x',
        controller: 'KeyboardController',
        data: {},
        at: 2,
      },
      { kind: 'class-added', selector: '#x', className: 'a', at: 3 },
      { kind: 'class-removed', selector: '#x', className: 'b', at: 4 },
      { kind: 'class-toggled', selector: '#x', className: 'c', at: 5 },
      { kind: 'controller-removed', selector: '#x', controller: 'KeyboardController', at: 6 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('substitutes arguments', () => {
    const actions = new Map<string, ActionBody>([
      [
        'attach',
        {
          startOperations: [
            op('setOperationData', { properties: { leaked: 'yes' } }),
            op('selectElement', { selector: '$operationdata.view' }),
            op('getControllerInstance', { systemName: 'ProgressbarController' }),
            op('addControllerToElement'),
          ],
        },
      ],
    ]);
    const result = walkOperations(
      [
        op('setOperationData', { properties: { kept: 'k' } }),
        ...call('attach', { view: '#a' }),
        op('selectElement', { selector: '#b' }),
        op('addClass', { className: '$operationdata.leaked' }),
        op('removeClass', { className: '$operationdata.kept' }),
      ],
      actions
    );
    expect(result.events).toEqual([
      {
        kind: 'controller-added',
        selector: '#a',
        controller: 'ProgressbarController',
        data: {},
        at: 2,
      },
      { kind: 'class-added', selector: '#b', className: undefined, at: 4 },
      { kind: 'class-removed', selector: '#b', className: 'k', at: 5 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('controller-added carries the resolved operation data', () => {
    const actions = new Map<string, ActionBody>([
      [
        'listen',
        {
          startOperations: [
            op('selectElement', { selector: '$operationdata.target' }),
            op('getControllerInstance', { systemName: 'DOMEventListenerController' }),
            op('addControllerToElement', {
              eventName: '$operationdata.event',
              actions: ['$operationdata.handler'],
            }),
          ],
        },
      ],
    ]);
    const result = walkOperations(
      [...call('listen', { target: '#go', event: 'click', handler: '__on__play' })],
      actions
    );
    const added = result.events.find(event => event.kind === 'controller-added');
    expect(added).toEqual({
      kind: 'controller-added',
      selector: '#go',
      controller: 'DOMEventListenerController',
      data: { eventName: 'click', actions: ['__on__play'] },
      at: 1,
    });
    const data = added?.kind === 'controller-added' ? added.data : undefined;
    expect(data?.eventName).toBe('click');
    expect(data?.actions).toEqual(['__on__play']);
    expect(result.unresolved).toEqual([]);
  });

  it('an operation without its own property reads the parameter of that name from the data', () => {
    // `action unclick(selector) [ selectElement(selector) … ]` and `removeClass(className)`
    // compile to operationData null: the argument reaches them by name, through the data
    const actions = new Map<string, ActionBody>([
      [
        'unclick',
        {
          startOperations: [
            op('selectElement'),
            op('removeControllerFromElement', { controllerName: 'DOMEventListenerController' }),
          ],
        },
      ],
      ['unmark', { startOperations: [op('selectElement', { selector: '#b' }), op('removeClass')] }],
    ]);
    const result = walkOperations(
      [...call('unclick', { selector: '#a' }), ...call('unmark', { className: 'on' })],
      actions
    );
    expect(result.events).toEqual([
      {
        kind: 'controller-removed',
        selector: '#a',
        controller: 'DOMEventListenerController',
        at: 1,
      },
      { kind: 'class-removed', selector: '#b', className: 'on', at: 3 },
    ]);
  });

  it('follows endAction into the end operations', () => {
    const actions = new Map<string, ActionBody>([
      [
        'light',
        {
          startOperations: [op('addClass', { className: 'lit' })],
          endOperations: [op('removeClass', { className: '$operationdata.name' })],
        },
      ],
    ]);
    const result = walkOperations(
      [
        op('selectElement', { selector: '#box' }),
        op('requestAction', { systemName: 'light' }),
        op('endAction', { actionOperationData: { name: 'lit' } }),
      ],
      actions
    );
    expect(result.events).toEqual([
      { kind: 'class-removed', selector: '#box', className: 'lit', at: 2 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('records unresolved calls', () => {
    const actions = new Map<string, ActionBody>([
      ['again', { startOperations: [op('addClass', { className: 'loop' }), ...call('again')] }],
    ]);
    const walked = () =>
      walkOperations(
        [...call('missing'), ...call('again'), op('addClass', { className: 'after' })],
        actions
      );
    expect(walked).not.toThrow();
    const result = walked();
    expect([...result.unresolved].sort()).toEqual(['again', 'missing']);
    expect(result.events[result.events.length - 1]).toEqual({
      kind: 'class-added',
      selector: undefined,
      className: 'after',
      at: 4,
    });
  });
});

describe('controllerBalance', () => {
  const lifecycle = (startOperations: WalkedOperation[], endOperations: WalkedOperation[]) => ({
    id: 'lifecycle',
    name: 'timeline-lifecycle',
    duration: { start: 0 },
    startOperations,
    endOperations,
  });
  const config = {
    actions: [
      {
        id: 'leave',
        name: 'detach',
        startOperations: [
          op('selectElement', { selector: '$operationdata.view' }),
          op('removeControllerFromElement', { controllerName: 'ProgressbarController' }),
        ],
      },
    ],
    timelines: [
      {
        uri: 'Hub',
        timelineActions: [
          lifecycle(
            [
              op('selectElement', { selector: '#stage' }),
              op('getControllerInstance', { systemName: 'KeyboardController' }),
              op('addControllerToElement'),
              op('selectElement', { selector: '#bar' }),
              op('getControllerInstance', { systemName: 'ProgressbarController' }),
              op('addControllerToElement'),
            ],
            [
              op('selectElement', { selector: '#stage' }),
              op('removeControllerFromElement', { controllerName: 'KeyboardController' }),
              ...call('detach', { view: '#bar' }),
            ]
          ),
        ],
      },
      { uri: 'Plain', timelineActions: [] },
    ],
  } as unknown as IEngineConfiguration;

  it('lifecycle adds and removes per timeline', () => {
    expect(controllerBalance(config)[0]).toEqual({
      timeline: 'Hub',
      added: ['#bar ProgressbarController', '#stage KeyboardController'],
      removed: ['#bar ProgressbarController', '#stage KeyboardController'],
      unresolved: [],
    });
  });

  it('a timeline without lifecycle gets empty lists', () => {
    expect(controllerBalance(config)[1]).toEqual({
      timeline: 'Plain',
      added: [],
      removed: [],
      unresolved: [],
    });
  });
});
