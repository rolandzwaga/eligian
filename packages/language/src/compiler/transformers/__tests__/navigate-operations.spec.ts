/**
 * Unit tests for the `navigate` sugar helpers.
 *
 * `on click "#sel" navigate "Target" [at <time>]` expands to a DOM click
 * listener plus a synthetic broadcast action that switches the timeline. The
 * synthetic action name must be derived purely from (target, position) so the
 * call-site expansion (operation-transformer) and the central action generator
 * (ast-transformer) agree without sharing state.
 */
import { describe, expect, test } from 'vitest';
import { createSourceLocation } from '../../types/common.js';
import {
  buildNavigateOperations,
  buildNavTargetAction,
  syntheticNavActionName,
} from '../navigate-operations.js';

const loc = createSourceLocation(1, 1);

describe('syntheticNavActionName', () => {
  test('slugifies the target and appends a hash of the exact target', () => {
    expect(syntheticNavActionName('Timeline & Time', 0)).toBe('__nav__timeline_time_096a5465');
    expect(syntheticNavActionName('Hub', 0)).toBe('__nav__hub_4717fc8c');
  });

  test('is stable for the same inputs', () => {
    expect(syntheticNavActionName('Chapter One', 0)).toBe(syntheticNavActionName('Chapter One', 0));
  });

  test('distinct positions produce distinct names', () => {
    expect(syntheticNavActionName('Chapter One', 0)).toBe('__nav__chapter_one_c4beeafe');
    expect(syntheticNavActionName('Chapter One', 5)).toBe('__nav__chapter_one_c4beeafe__5');
    expect(syntheticNavActionName('Chapter One', 5)).not.toBe(
      syntheticNavActionName('Chapter One', 0)
    );
  });

  test('falls back to a non-empty slug for symbol-only targets', () => {
    expect(syntheticNavActionName('!!!', 0)).toBe('__nav__timeline_2d53a722');
  });

  // Audit (low): the slug folds case and punctuation, so distinct targets used
  // to share one name — and one broadcast action — sending clicks to the wrong
  // timeline.
  test('targets that differ only in case or punctuation get distinct names', () => {
    const names = ['Chapter 1', 'chapter-1', 'CHAPTER_1', 'chapter 1'].map(t =>
      syntheticNavActionName(t, 0)
    );
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^__nav__chapter_1_[0-9a-f]{8}$/);
    }
  });

  test('fractional, negative and exponent positions do not collide', () => {
    const positions = [1.5, -1.5, 15, 1e21, 1e-21, 0.15];
    const names = positions.map(p => syntheticNavActionName('Hub', p));
    expect(new Set(names).size).toBe(positions.length);
    expect(syntheticNavActionName('Hub', 1.5)).toBe('__nav__hub_4717fc8c__1p5');
    expect(syntheticNavActionName('Hub', -1.5)).toBe('__nav__hub_4717fc8c__m1p5');
  });
});

describe('buildNavigateOperations', () => {
  test('expands to selectElement + getControllerInstance + addControllerToElement', () => {
    const ops = buildNavigateOperations('#card-ch1', '__nav__chapter_one', loc);

    expect(ops.map(o => o.systemName)).toEqual([
      'selectElement',
      'getControllerInstance',
      'addControllerToElement',
    ]);
    expect(ops[0].operationData).toEqual({ selector: '#card-ch1' });
    expect(ops[1].operationData).toEqual({ systemName: 'DOMEventListenerController' });
    expect(ops[2].operationData).toEqual({
      eventName: 'click',
      actions: ['__nav__chapter_one'],
    });
  });
});

describe('buildNavTargetAction', () => {
  test('emits a broadcastEvent action for request-timeline-uri', () => {
    const action = buildNavTargetAction('Chapter One', 5, loc);

    expect(action.name).toBe(syntheticNavActionName('Chapter One', 5));
    expect(action.endOperations).toEqual([]);
    expect(action.startOperations).toHaveLength(1);
    const [op] = action.startOperations;
    expect(op.systemName).toBe('broadcastEvent');
    expect(op.operationData).toEqual({
      eventName: 'request-timeline-uri',
      eventArgs: ['Chapter One', 5],
    });
  });
});
