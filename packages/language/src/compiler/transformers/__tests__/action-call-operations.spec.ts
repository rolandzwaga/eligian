/**
 * Regression tests for buildActionCallOperations.
 *
 * C2: a zero-argument custom-action call must still emit an `actionOperationData`
 * object on the startAction/endAction operation. The Eligius runtime does
 * `mergeOperationData(...)` / `Object.keys(actionOperationData)` on it, so omitting
 * it (emitting just `{}`) crashes at runtime with
 * "Cannot convert undefined or null to object".
 * Found by running a compiled presentation in the real engine (zero-arg
 * `clearSpots()` call). See eligius src/operation/start-action.ts + end-action.ts.
 */
import { describe, expect, test } from 'vitest';
import { createSourceLocation } from '../../types/common.js';
import { buildActionCallOperations } from '../action-call-operations.js';

const loc = createSourceLocation(1, 1);

describe('buildActionCallOperations', () => {
  test('C2: zero-arg startAction emits actionOperationData: {} (not an empty operationData)', () => {
    const [request, start] = buildActionCallOperations('clearSpots', undefined, loc, 'startAction');

    expect(request.systemName).toBe('requestAction');
    expect(request.operationData).toEqual({ systemName: 'clearSpots' });

    expect(start.systemName).toBe('startAction');
    // The key must be present with an empty object, NOT missing.
    expect(start.operationData).toEqual({ actionOperationData: {} });
    expect((start.operationData as Record<string, unknown>).actionOperationData).toBeDefined();
  });

  test('C2: zero-arg endAction also emits actionOperationData: {}', () => {
    const [, end] = buildActionCallOperations('teardown', undefined, loc, 'endAction');

    expect(end.systemName).toBe('endAction');
    expect(end.operationData).toEqual({ actionOperationData: {} });
  });

  test('with-args call wraps the mapped data under actionOperationData', () => {
    const [, start] = buildActionCallOperations(
      'narrate',
      { template: 'hello' },
      loc,
      'startAction'
    );

    expect(start.operationData).toEqual({ actionOperationData: { template: 'hello' } });
  });
});
