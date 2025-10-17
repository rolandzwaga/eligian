import { Effect } from 'effect';
import type { ITimelineActionConfiguration } from 'eligius';
import { describe, expect, test } from 'vitest';
import { emitJSON } from '../emitter.js';
import type { EligiusIR } from '../types/eligius-ir.js';

describe('Emitter', () => {
  /**
   * Helper: Create minimal valid IR (T282: New structure with config + sourceMap)
   */
  function createMinimalIR(): EligiusIR {
    const timelineId = '87654321-4321-4321-4321-210987654321';

    return {
      config: {
        id: '12345678-1234-4234-8234-123456789012',
        engine: { systemName: 'EligiusEngine' },
        containerSelector: 'body',
        language: 'en-US',
        layoutTemplate: 'default',
        availableLanguages: [
          { id: 'aaaa-bbbb-cccc-dddd', languageCode: 'en-US', label: 'English' },
        ],
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
        compiledAt: '2025-01-01T00:00:00.000Z',
        sourceFile: undefined,
      },
    };
  }

  describe('emitJSON (SA004)', () => {
    test('should emit minimal IEngineConfiguration', async () => {
      const ir = createMinimalIR();

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.id).toBe('12345678-1234-4234-8234-123456789012');
      expect(result.engine.systemName).toBe('EligiusEngine');
      expect(result.containerSelector).toBe('body');
      expect(result.language).toBe('en-US');
      expect(result.layoutTemplate).toBe('default');
      expect(result.availableLanguages).toHaveLength(1);
      expect(result.availableLanguages[0].languageCode).toBe('en-US');
      expect(result.availableLanguages[0].label).toBe('English');
      expect(result.timelines).toHaveLength(1);
    });

    test('should include $schema property for JSON Schema validation', async () => {
      const ir = createMinimalIR();

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result).toHaveProperty('$schema');
      expect(result.$schema).toBe(
        'https://rolandzwaga.github.io/eligius/jsonschema/eligius-configuration.json'
      );
    });

    test('should emit timeline configuration', async () => {
      const ir = createMinimalIR();
      ir.config.timelines[0].uri = 'video.mp4';
      ir.config.timelines[0].type = 'mediaplayer';
      ir.config.timelines[0].duration = 100;
      ir.config.timelines[0].loop = true;

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.timelines[0].uri).toBe('video.mp4');
      expect(result.timelines[0].type).toBe('mediaplayer');
      expect(result.timelines[0].duration).toBe(100);
      expect(result.timelines[0].loop).toBe(true);
    });

    test('should emit timeline actions with operations', async () => {
      const ir = createMinimalIR();

      const action: ITimelineActionConfiguration = {
        id: 'action-id',
        name: 'testAction',
        duration: { start: 0, end: 10 },
        startOperations: [
          {
            id: 'op-id',
            systemName: 'showElement',
            operationData: { selector: '#test' },
          },
        ],
        endOperations: [],
      };

      ir.config.timelines[0].timelineActions = [action];

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.timelines[0].timelineActions).toHaveLength(1);
      expect(result.timelines[0].timelineActions[0].id).toBe('action-id');
      expect(result.timelines[0].timelineActions[0].name).toBe('testAction');
      expect(result.timelines[0].timelineActions[0].duration).toEqual({ start: 0, end: 10 });
      expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
      expect(result.timelines[0].timelineActions[0].startOperations[0].systemName).toBe(
        'showElement'
      );
    });

    test('should not include metadata in emitted output', async () => {
      const ir = createMinimalIR();

      const result = await Effect.runPromise(emitJSON(ir));

      // T282: Metadata is stored in ir.metadata, not in the emitted config
      // IEngineConfiguration doesn't have a metadata field
      expect(result.metadata).toBeUndefined();
    });

    test('should emit action layers', async () => {
      const ir = createMinimalIR();

      ir.config.initActions = [
        {
          id: 'init-1',
          name: 'initAction',
          startOperations: [],
          endOperations: [],
        },
      ];

      ir.config.eventActions = [
        {
          id: 'event-1',
          name: 'eventAction',
          eventName: 'click',
          startOperations: [],
        },
      ];

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.initActions).toHaveLength(1);
      expect(result.eventActions).toHaveLength(1);
      expect(result.eventActions[0].eventName).toBe('click');
    });

    test('should preserve UUIDs in output', async () => {
      const ir = createMinimalIR();
      const actionId = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
      const opId = 'ffff1111-2222-4333-8444-555555555555';

      ir.config.timelines[0].timelineActions = [
        {
          id: actionId,
          name: 'test',
          duration: { start: 0, end: 5 },
          startOperations: [
            {
              id: opId,
              systemName: 'test',
              operationData: {},
            },
          ],
          endOperations: [],
        },
      ];

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.timelines[0].timelineActions[0].id).toBe(actionId);
      expect(result.timelines[0].timelineActions[0].startOperations[0].id).toBe(opId);
    });

    test('should handle multiple timelines', async () => {
      const ir = createMinimalIR();

      ir.config.timelines.push({
        id: '11111111-2222-4333-8444-555555555555',
        uri: 'other.mp4',
        type: 'mediaplayer',
        duration: 50,
        loop: false,
        selector: '',
        timelineActions: [],
      });

      const result = await Effect.runPromise(emitJSON(ir));

      expect(result.timelines).toHaveLength(2);
      expect(result.timelines[1].uri).toBe('other.mp4');
    });
  });
});
