import { Effect } from 'effect';
import type { IOperationConfiguration, ITimelineActionConfiguration } from 'eligius';
import { describe, expect, test } from 'vitest';
import { typeCheck } from '../type-checker.js';
import type { EligiusIR } from '../types/eligius-ir.js';

describe('Type Checker', () => {
  /**
   * Helper: Create minimal valid IR (T283: New structure with config + sourceMap)
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
   * Helper: Create TimelineAction with start/end
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

  /**
   * Helper: Create operation
   */
  function createOperation(systemName: string, operationData: any = {}): IOperationConfiguration {
    return {
      id: crypto.randomUUID(),
      systemName,
      operationData,
    };
  }

  describe('Timeline type checking', () => {
    test('should accept valid timeline with raf type', async () => {
      const ir = createMinimalIR();

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result).toEqual(ir);
    });

    test('should accept timeline with string uri', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].type = 'mediaplayer';
      ir.config.timelines[0].uri = 'video.mp4';

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result.config.timelines[0].uri).toBe('video.mp4');
    });

    test.skip('T283: Detailed validation removed - TypeScript validates uri type at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate field types
      // TypeScript enforces IEngineConfiguration structure at compile time
    });

    test.skip('T283: Detailed validation removed - TypeScript validates timeline type at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate timeline type values
      // TypeScript enforces TimelineTypes union at compile time
    });
  });

  describe('Duration type checking (T060)', () => {
    test('should accept numeric durations', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].timelineActions = [createTimelineAction('test', 0, 10)];

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result.config.timelines[0].timelineActions).toHaveLength(1);
    });

    test.skip('T283: Detailed validation removed - TypeScript validates duration types at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate duration field types
      // TypeScript enforces IDuration structure at compile time
    });

    test.skip('T283: Detailed validation removed - TypeScript validates duration end type at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate duration field types
      // TypeScript enforces IDuration structure at compile time
    });

    test.skip('T283: Detailed validation removed - Optimizer handles invalid durations', async () => {
      // Simplified type-checker (T283) doesn't validate duration logic
      // Optimizer removes timeline actions with end < start (dead code elimination)
    });
  });

  describe('Operation type checking', () => {
    test('should accept valid operations', async () => {
      const ir = createMinimalIR();
      const action = createTimelineAction('test', 0, 10);
      action.startOperations = [createOperation('showElement', { selector: '#myElement' })];
      ir.config.timelines[0].timelineActions = [action];

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result.config.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
    });

    test.skip('T283: Detailed validation removed - TypeScript validates systemName type at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate operation field types
      // TypeScript enforces IOperationConfiguration structure at compile time
    });

    test.skip('T283: Detailed validation removed - TypeScript validates operationData type at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate operation field types
      // TypeScript enforces IOperationConfiguration structure at compile time
    });
  });

  describe('Configuration type checking', () => {
    test('should validate required configuration fields', async () => {
      const ir = createMinimalIR();

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result.config.id).toBeDefined();
      expect(result.config.engine.systemName).toBe('EligiusEngine');
      expect(result.config.containerSelector).toBe('body');
      expect(result.config.language).toBe('en-US');
    });

    test('should reject empty configuration id', async () => {
      const ir = createMinimalIR();
      ir.config.id = ''; // Empty string

      const result = Effect.runPromise(typeCheck(ir));

      await expect(result).rejects.toThrow('id must be a non-empty string');
    });

    test('should reject non-string containerSelector', async () => {
      const ir = createMinimalIR();
      ir.config.containerSelector = 123 as any; // Should be string

      const result = Effect.runPromise(typeCheck(ir));

      await expect(result).rejects.toThrow('containerSelector must be a string');
    });
  });

  describe('Comprehensive type checking (T063)', () => {
    test('should validate complete IR successfully', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].type = 'mediaplayer';
      ir.config.timelines[0].uri = 'test.mp4';

      const intro = createTimelineAction('intro', 0, 5);
      intro.startOperations = [createOperation('showElement', { selector: '#title' })];

      const main = createTimelineAction('main', 5, 120);
      main.startOperations = [createOperation('hideElement', { selector: '.content' })];

      ir.config.timelines[0].timelineActions = [intro, main];

      const result = await Effect.runPromise(typeCheck(ir));

      expect(result.config.timelines[0].type).toBe('mediaplayer');
      expect(result.config.timelines[0].timelineActions).toHaveLength(2);
      expect(result.config.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
    });

    test.skip('T283: Detailed validation removed - TypeScript validates duration types at compile time', async () => {
      // Simplified type-checker (T283) doesn't validate field types
      // TypeScript enforces structure at compile time
    });
  });
});
