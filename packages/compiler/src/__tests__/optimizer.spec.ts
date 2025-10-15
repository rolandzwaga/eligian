import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { optimize } from '../optimizer.js';
import type { EligiusIR, TimelineConfigIR, TimelineActionIR } from '../types/eligius-ir.js';

describe('Optimizer', () => {
    /**
     * Helper: Create minimal valid IR
     */
    function createMinimalIR(): EligiusIR {
        return {
            id: crypto.randomUUID(),
            engine: { systemName: 'Eligius' },
            containerSelector: 'body',
            language: 'en',
            layoutTemplate: 'default',
            availableLanguages: [{ code: 'en', label: 'English' }],
            labels: [],
            initActions: [],
            actions: [],
            eventActions: [],
            timelines: [{
                id: crypto.randomUUID(),
                uri: undefined,
                type: 'raf',
                duration: 0,
                loop: false,
                selector: '',
                timelineActions: [],
                sourceLocation: { line: 1, column: 1, length: 10 }
            }],
            timelineFlow: undefined,
            timelineProviderSettings: undefined,
            metadata: {
                dslVersion: '1.0.0',
                compilerVersion: '0.0.1',
                compiledAt: new Date().toISOString(),
                sourceFile: undefined
            },
            sourceLocation: { line: 1, column: 1, length: 50 }
        };
    }

    /**
     * Helper: Create timeline action with literal times
     */
    function createTimelineAction(name: string, start: number, end: number): TimelineActionIR {
        return {
            id: crypto.randomUUID(),
            name,
            duration: { start, end },
            startOperations: [],
            endOperations: [],
            sourceLocation: { line: 2, column: 1, length: 20 }
        };
    }

    describe('Dead code elimination (T065)', () => {
        test('should remove timeline actions with zero duration', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [
                createTimelineAction('valid', 0, 10),
                createTimelineAction('zeroDuration', 5, 5), // end === start
                createTimelineAction('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(2);
            expect(result.timelines[0].timelineActions[0].name).toBe('valid');
            expect(result.timelines[0].timelineActions[1].name).toBe('alsoValid');
        });

        test('should remove timeline actions with negative duration', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [
                createTimelineAction('valid', 0, 10),
                createTimelineAction('negativeDuration', 20, 10), // end < start
                createTimelineAction('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(2);
            expect(result.timelines[0].timelineActions[0].name).toBe('valid');
            expect(result.timelines[0].timelineActions[1].name).toBe('alsoValid');
        });

        test('should remove timeline actions with negative start time', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [
                createTimelineAction('valid', 0, 10),
                createTimelineAction('negativeStart', -5, 10), // start < 0
                createTimelineAction('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(2);
            expect(result.timelines[0].timelineActions[0].name).toBe('valid');
            expect(result.timelines[0].timelineActions[1].name).toBe('alsoValid');
        });

        test('should keep valid timeline actions unchanged', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [
                createTimelineAction('action1', 0, 5),
                createTimelineAction('action2', 5, 10),
                createTimelineAction('action3', 10, 100)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(3);
            expect(result.timelines[0].timelineActions.map(a => a.name)).toEqual(['action1', 'action2', 'action3']);
        });
    });

    describe('Optimization passes (T067)', () => {
        test('should preserve IR structure for valid actions', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].uri = 'test.mp4';
            ir.timelines[0].timelineActions = [
                createTimelineAction('action1', 0, 10),
                createTimelineAction('action2', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            // Timeline should be unchanged
            expect(result.timelines[0].uri).toBe('test.mp4');
            // Actions should be present
            expect(result.timelines[0].timelineActions).toHaveLength(2);
            // Metadata should be preserved
            expect(result.metadata).toBeDefined();
        });

        test('should handle multiple timelines', async () => {
            const ir = createMinimalIR();

            // Add second timeline
            ir.timelines.push({
                id: crypto.randomUUID(),
                uri: 'other.mp4',
                type: 'video',
                duration: 100,
                loop: false,
                selector: '',
                timelineActions: [
                    createTimelineAction('secondTimelineAction', 0, 10)
                ],
                sourceLocation: { line: 5, column: 1, length: 20 }
            });

            const result = await Effect.runPromise(optimize(ir));

            expect(result.timelines).toHaveLength(2);
            expect(result.timelines[1].timelineActions).toHaveLength(1);
        });
    });

    describe('Performance & immutability (T068)', () => {
        test('should return new IR object (external immutability)', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [createTimelineAction('test', 0, 10)];

            const result = await Effect.runPromise(optimize(ir));

            // Should return a new object reference
            expect(result).not.toBe(ir);
            expect(result.timelines).not.toBe(ir.timelines);
            expect(result.timelines[0].timelineActions).not.toBe(ir.timelines[0].timelineActions);
        });

        test('should handle large action lists efficiently', async () => {
            const ir = createMinimalIR();

            // Create 1000 timeline actions
            const actions: TimelineActionIR[] = [];
            for (let i = 0; i < 1000; i++) {
                actions.push(createTimelineAction(`action${i}`, i * 10, (i + 1) * 10));
            }
            ir.timelines[0].timelineActions = actions;

            const startTime = Date.now();
            const result = await Effect.runPromise(optimize(ir));
            const duration = Date.now() - startTime;

            // Should complete in reasonable time (<100ms for 1000 actions)
            expect(duration).toBeLessThan(100);
            expect(result.timelines[0].timelineActions).toHaveLength(1000);
        });
    });
});
