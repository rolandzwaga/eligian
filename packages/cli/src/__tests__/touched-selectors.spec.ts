/**
 * Spec 058 Phase 3 (plan B7): the literal selectors an operation list selects or acts on, used by
 * the determinism check's location (B2) and the storyboard's `beatsCovered` (D1).
 */
import type { ActionBody, WalkedOperation } from '@eligian/language/mcp';
import { describe, expect, it } from 'vitest';
import { touchedSelectors } from '../smoke/touched-selectors.js';

const op = (systemName: string, operationData?: Record<string, unknown>): WalkedOperation =>
  operationData === undefined ? { systemName } : { systemName, operationData };

const call = (name: string, actionOperationData: Record<string, unknown>): WalkedOperation[] => [
  op('requestAction', { systemName: name }),
  op('startAction', { actionOperationData }),
];

const NO_ACTIONS: ReadonlyMap<string, ActionBody> = new Map();

describe('touchedSelectors', () => {
  it('collects selectElement selectors', () => {
    const touched = touchedSelectors(
      [op('selectElement', { selector: '#a' }), op('addClass', { className: 'x' })],
      NO_ACTIONS
    );
    expect(touched).toEqual(new Set(['#a']));
  });

  it('follows requestAction + startAction into the called action, with operation-data substitution', () => {
    const actions: ReadonlyMap<string, ActionBody> = new Map([
      ['show', { startOperations: [op('selectElement', { selector: '$operationdata.sel' })] }],
    ]);
    const touched = touchedSelectors(call('show', { sel: '#b' }), actions);
    expect(touched.has('#b')).toBe(true);
    expect(touched.has('$operationdata.sel')).toBe(false);
  });

  it('follows requestAction + endAction into the end operations', () => {
    const actions: ReadonlyMap<string, ActionBody> = new Map([
      [
        'pulse',
        {
          startOperations: [],
          endOperations: [op('selectElement', { selector: '$operationdata.sel' })],
        },
      ],
    ]);
    const touched = touchedSelectors(
      [
        op('requestAction', { systemName: 'pulse' }),
        op('endAction', { actionOperationData: { sel: '#end' } }),
      ],
      actions
    );
    expect(touched).toEqual(new Set(['#end']));
  });

  it('includes controller-effect selectors from walkOperations', () => {
    const actions: ReadonlyMap<string, ActionBody> = new Map([
      [
        'attach',
        {
          startOperations: [
            op('getControllerInstance', { systemName: 'LabelController' }),
            op('addControllerToElement', { labelId: 'title' }),
          ],
        },
      ],
    ]);
    const touched = touchedSelectors(
      [
        op('setOperationData', { properties: { view: '#c' } }),
        op('selectElement', { selector: '$operationdata.view' }),
        ...call('attach', {}),
      ],
      actions
    );
    expect(touched).toEqual(new Set(['#c']));
  });

  it('includes a class-effect selector that reached the operation through the data', () => {
    const actions: ReadonlyMap<string, ActionBody> = new Map([
      ['mark', { startOperations: [op('selectElement'), op('addClass', { className: 'on' })] }],
    ]);
    const touched = touchedSelectors(call('mark', { selector: '#d' }), actions);
    expect(touched).toEqual(new Set(['#d']));
  });

  it('ignores a selector that is not a string literal after resolution', () => {
    const touched = touchedSelectors(
      [
        op('selectElement', { selector: '$operationdata.missing' }),
        op('addClass', { className: 'x' }),
        op('selectElement', { selector: 42 }),
        op('selectElement', { selector: '' }),
      ],
      NO_ACTIONS
    );
    expect(touched.size).toBe(0);
  });
});
