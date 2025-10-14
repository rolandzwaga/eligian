import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { optimize } from '../optimizer.js';
import type { EligiusIR, EventIR } from '../types/eligius-ir.js';

describe('Optimizer', () => {
    /**
     * Helper: Create minimal valid IR
     */
    function createMinimalIR(): EligiusIR {
        return {
            timeline: {
                provider: 'raf',
                source: undefined,
                options: undefined,
                sourceLocation: { line: 1, column: 1, length: 10 }
            },
            events: [],
            actions: undefined,
            providers: undefined,
            metadata: {
                dslVersion: '1.0.0',
                compilerVersion: '0.0.1',
                compiledAt: new Date().toISOString()
            },
            sourceLocation: { line: 1, column: 1, length: 50 }
        };
    }

    /**
     * Helper: Create event with literal times
     */
    function createEvent(id: string, start: number, end: number): EventIR {
        return {
            id,
            start: { kind: 'literal', value: start },
            end: { kind: 'literal', value: end },
            actions: [],
            conditions: undefined,
            metadata: undefined,
            sourceLocation: { line: 2, column: 1, length: 20 }
        };
    }

    describe('Dead code elimination (T065)', () => {
        test('should remove events with zero duration', async () => {
            const ir = createMinimalIR();
            ir.events = [
                createEvent('valid', 0, 10),
                createEvent('zeroDuration', 5, 5), // end === start
                createEvent('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events).toHaveLength(2);
            expect(result.events[0].id).toBe('valid');
            expect(result.events[1].id).toBe('alsoValid');
        });

        test('should remove events with negative duration', async () => {
            const ir = createMinimalIR();
            ir.events = [
                createEvent('valid', 0, 10),
                createEvent('negativeDuration', 20, 10), // end < start
                createEvent('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events).toHaveLength(2);
            expect(result.events[0].id).toBe('valid');
            expect(result.events[1].id).toBe('alsoValid');
        });

        test('should remove events with negative start time', async () => {
            const ir = createMinimalIR();
            ir.events = [
                createEvent('valid', 0, 10),
                createEvent('negativeStart', -5, 10), // start < 0
                createEvent('alsoValid', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events).toHaveLength(2);
            expect(result.events[0].id).toBe('valid');
            expect(result.events[1].id).toBe('alsoValid');
        });

        test('should keep events with non-evaluable time expressions', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'withVariable',
                start: { kind: 'variable', name: 'startTime' },
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            // Should keep event since we can't evaluate at compile time
            expect(result.events).toHaveLength(1);
            expect(result.events[0].id).toBe('withVariable');
        });

        test('should keep valid events unchanged', async () => {
            const ir = createMinimalIR();
            ir.events = [
                createEvent('event1', 0, 5),
                createEvent('event2', 5, 10),
                createEvent('event3', 10, 100)
            ];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events).toHaveLength(3);
            expect(result.events.map(e => e.id)).toEqual(['event1', 'event2', 'event3']);
        });
    });

    describe('Constant folding (T066)', () => {
        test('should fold binary addition', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '+',
                    left: { kind: 'literal', value: 5 },
                    right: { kind: 'literal', value: 3 }
                },
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events).toHaveLength(1);
            expect(result.events[0].start).toEqual({ kind: 'literal', value: 8 });
        });

        test('should fold binary subtraction', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '-',
                    left: { kind: 'literal', value: 10 },
                    right: { kind: 'literal', value: 3 }
                },
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events[0].start).toEqual({ kind: 'literal', value: 7 });
        });

        test('should fold binary multiplication', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '*',
                    left: { kind: 'literal', value: 4 },
                    right: { kind: 'literal', value: 5 }
                },
                end: { kind: 'literal', value: 30 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events[0].start).toEqual({ kind: 'literal', value: 20 });
        });

        test('should fold binary division', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '/',
                    left: { kind: 'literal', value: 20 },
                    right: { kind: 'literal', value: 4 }
                },
                end: { kind: 'literal', value: 30 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            expect(result.events[0].start).toEqual({ kind: 'literal', value: 5 });
        });

        test('should handle division by zero', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '/',
                    left: { kind: 'literal', value: 10 },
                    right: { kind: 'literal', value: 0 }
                },
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            // Division by zero should result in 0
            expect(result.events[0].start).toEqual({ kind: 'literal', value: 0 });
        });

        test('should not fold expressions with variables', async () => {
            const ir = createMinimalIR();
            const originalStart = {
                kind: 'binary' as const,
                op: '+' as const,
                left: { kind: 'variable' as const, name: 'x' },
                right: { kind: 'literal' as const, value: 5 }
            };

            ir.events = [{
                id: 'test',
                start: originalStart,
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            // Should keep expression since it contains a variable
            expect(result.events[0].start).toHaveProperty('kind', 'binary');
        });

        test('should fold nested binary expressions', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '+',
                    left: {
                        kind: 'binary',
                        op: '*',
                        left: { kind: 'literal', value: 2 },
                        right: { kind: 'literal', value: 3 }
                    },
                    right: { kind: 'literal', value: 4 }
                },
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(optimize(ir));

            // (2 * 3) + 4 = 6 + 4 = 10
            expect(result.events[0].start).toEqual({ kind: 'literal', value: 10 });
        });
    });

    describe('Combined optimizations (T067)', () => {
        test('should apply constant folding then dead code elimination', async () => {
            const ir = createMinimalIR();
            ir.events = [
                {
                    id: 'validEvent',
                    start: { kind: 'literal', value: 0 },
                    end: { kind: 'literal', value: 10 },
                    actions: [],
                    conditions: undefined,
                    metadata: undefined,
                    sourceLocation: { line: 2, column: 1, length: 20 }
                },
                {
                    id: 'deadAfterFolding',
                    start: {
                        kind: 'binary',
                        op: '+',
                        left: { kind: 'literal', value: 10 },
                        right: { kind: 'literal', value: 5 }
                    },
                    end: {
                        kind: 'binary',
                        op: '+',
                        left: { kind: 'literal', value: 10 },
                        right: { kind: 'literal', value: 5 }
                    },
                    actions: [],
                    conditions: undefined,
                    metadata: undefined,
                    sourceLocation: { line: 3, column: 1, length: 20 }
                }
            ];

            const result = await Effect.runPromise(optimize(ir));

            // After folding: start=15, end=15 (zero duration)
            // After dead code elimination: event removed
            expect(result.events).toHaveLength(1);
            expect(result.events[0].id).toBe('validEvent');
        });

        test('should preserve IR structure for valid events', async () => {
            const ir = createMinimalIR();
            ir.timeline.source = 'test.mp4';
            ir.events = [
                createEvent('event1', 0, 10),
                createEvent('event2', 10, 20)
            ];

            const result = await Effect.runPromise(optimize(ir));

            // Timeline should be unchanged
            expect(result.timeline.source).toBe('test.mp4');
            // Events should be present
            expect(result.events).toHaveLength(2);
            // Metadata should be preserved
            expect(result.metadata).toBeDefined();
        });
    });

    describe('Performance & immutability (T068)', () => {
        test('should return new IR object (external immutability)', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];

            const result = await Effect.runPromise(optimize(ir));

            // Should return a new object reference
            expect(result).not.toBe(ir);
            expect(result.events).not.toBe(ir.events);
        });

        test('should handle large event lists efficiently', async () => {
            const ir = createMinimalIR();

            // Create 1000 events
            for (let i = 0; i < 1000; i++) {
                ir.events.push(createEvent(`event${i}`, i * 10, (i + 1) * 10));
            }

            const startTime = Date.now();
            const result = await Effect.runPromise(optimize(ir));
            const duration = Date.now() - startTime;

            // Should complete in reasonable time (<100ms for 1000 events)
            expect(duration).toBeLessThan(100);
            expect(result.events).toHaveLength(1000);
        });
    });
});
