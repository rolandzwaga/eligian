import { Effect } from 'effect';
import type { ITimelineActionConfiguration } from 'eligius';
import { describe, expect, test } from 'vitest';
import { optimize } from '../optimizer.js';
import type { EligiusIR } from '../types/eligius-ir.js';

describe('Optimizer', () => {
  /**
   * Helper: Create minimal valid IR (T284: New structure with config + sourceMap)
   */
  function createMinimalIR(): EligiusIR {
    const timelineId = crypto.randomUUID();

    return {
      config: {
        id: crypto.randomUUID(),
        engine: { systemName: 'EligiusEngine' },
        containerSelector: 'body',
        language: 'en-US',
        layoutTemplate: 'default',
        availableLanguages: [{ id: crypto.randomUUID(), languageCode: 'en-US', label: 'English' }],
        labels: [],
        initActions: [],
        actions: [],
        eventActions: [],
        timelines: [
          {
            id: timelineId,
            uri: 'test',
            type: 'animation',
            duration: 0,
            loop: false,
            selector: '',
            timelineActions: [],
          },
        ],
        timelineFlow: undefined,
        timelineProviderSettings: undefined,
      },
      sourceMap: {
        root: { line: 1, column: 1, length: 50 },
        actions: new Map(),
        operations: new Map(),
        timelines: new Map([[timelineId, { line: 1, column: 1, length: 10 }]]),
        timelineActions: new Map(),
      },
      metadata: {
        dslVersion: '1.0.0',
        compilerVersion: '0.0.1',
        compiledAt: new Date().toISOString(),
        sourceFile: undefined,
      },
    };
  }

  /**
   * Helper: Create timeline action with literal times
   */
  function createTimelineAction(
    name: string,
    start: number,
    end: number
  ): ITimelineActionConfiguration {
    return {
      id: crypto.randomUUID(),
      name,
      duration: { start, end },
      startOperations: [],
      endOperations: [],
    };
  }

  describe('Dead code elimination (T065)', () => {
    test('should remove timeline actions with zero duration', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [
        createTimelineAction('valid', 0, 10),
        createTimelineAction('zeroDuration', 5, 5), // end === start
        createTimelineAction('alsoValid', 10, 20),
      ];

      const result = await Effect.runPromise(optimize(ir));

      expect(result.config.timelines[0].timelineActions).toHaveLength(2);
      expect(result.config.timelines[0].timelineActions[0].name).toBe('valid');
      expect(result.config.timelines[0].timelineActions[1].name).toBe('alsoValid');
    });

    test('should remove timeline actions with negative duration', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [
        createTimelineAction('valid', 0, 10),
        createTimelineAction('negativeDuration', 20, 10), // end < start
        createTimelineAction('alsoValid', 10, 20),
      ];

      const result = await Effect.runPromise(optimize(ir));

      expect(result.config.timelines[0].timelineActions).toHaveLength(2);
      expect(result.config.timelines[0].timelineActions[0].name).toBe('valid');
      expect(result.config.timelines[0].timelineActions[1].name).toBe('alsoValid');
    });

    test('should remove timeline actions with negative start time', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [
        createTimelineAction('valid', 0, 10),
        createTimelineAction('negativeStart', -5, 10), // start < 0
        createTimelineAction('alsoValid', 10, 20),
      ];

      const result = await Effect.runPromise(optimize(ir));

      expect(result.config.timelines[0].timelineActions).toHaveLength(2);
      expect(result.config.timelines[0].timelineActions[0].name).toBe('valid');
      expect(result.config.timelines[0].timelineActions[1].name).toBe('alsoValid');
    });

    test('should keep valid timeline actions unchanged', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [
        createTimelineAction('action1', 0, 5),
        createTimelineAction('action2', 5, 10),
        createTimelineAction('action3', 10, 100),
      ];

      const result = await Effect.runPromise(optimize(ir));

      expect(result.config.timelines[0].timelineActions).toHaveLength(3);
      expect(result.config.timelines[0].timelineActions.map(a => a.name)).toEqual([
        'action1',
        'action2',
        'action3',
      ]);
    });
  });

  describe('Optimization passes (T067)', () => {
    test('should preserve IR structure for valid actions', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].uri = 'test.mp4';
      ir.config.timelines[0].timelineActions = [
        createTimelineAction('action1', 0, 10),
        createTimelineAction('action2', 10, 20),
      ];

      const result = await Effect.runPromise(optimize(ir));

      // Timeline should be unchanged
      expect(result.config.timelines[0].uri).toBe('test.mp4');
      // Actions should be present
      expect(result.config.timelines[0].timelineActions).toHaveLength(2);
      // Metadata should be preserved
      expect(result.metadata).toBeDefined();
    });

    test('should handle multiple timelines', async () => {
      const ir = createMinimalIR();

      // Add second timeline
      ir.config.timelines.push({
        id: crypto.randomUUID(),
        uri: 'other.mp4',
        type: 'mediaplayer',
        duration: 100,
        loop: false,
        selector: '',
        timelineActions: [createTimelineAction('secondTimelineAction', 0, 10)],
      });

      const result = await Effect.runPromise(optimize(ir));

      expect(result.config.timelines).toHaveLength(2);
      expect(result.config.timelines[1].timelineActions).toHaveLength(1);
    });
  });

  describe('Performance & immutability (T068)', () => {
    test('should return new IR object (external immutability)', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [createTimelineAction('test', 0, 10)];

      const result = await Effect.runPromise(optimize(ir));

      // Should return a new object reference
      expect(result).not.toBe(ir);
      expect(result.config).not.toBe(ir.config);
      expect(result.config.timelines).not.toBe(ir.config.timelines);
      expect(result.config.timelines[0].timelineActions).not.toBe(
        ir.config.timelines[0].timelineActions
      );
    });

    test('should handle large action lists efficiently', async () => {
      const ir = createMinimalIR();

      // Create 1000 timeline actions
      const actions: ITimelineActionConfiguration[] = [];
      for (let i = 0; i < 1000; i++) {
        actions.push(createTimelineAction(`action${i}`, i * 10, (i + 1) * 10));
      }
      ir.config.timelines[0].timelineActions = actions;

      const startTime = Date.now();
      const result = await Effect.runPromise(optimize(ir));
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (<100ms for 1000 actions)
      expect(duration).toBeLessThan(100);
      expect(result.config.timelines[0].timelineActions).toHaveLength(1000);
    });
  });
});
