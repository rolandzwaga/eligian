import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { typeCheck } from '../type-checker.js';
import type { EligiusIR, TimelineConfigIR, TimelineActionIR, OperationConfigIR } from '../types/eligius-ir.js';

describe('Type Checker', () => {
    /**
     * Helper: Create minimal valid IR matching new IEngineConfiguration structure
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
     * Helper: Create TimelineAction with start/end
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

    /**
     * Helper: Create operation
     */
    function createOperation(systemName: string, operationData: any = {}): OperationConfigIR {
        return {
            id: crypto.randomUUID(),
            systemName,
            operationData,
            sourceLocation: { line: 3, column: 1, length: 15 }
        };
    }

    describe('Timeline type checking', () => {
        test('should accept valid timeline with raf provider', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result).toEqual(ir);
        });

        test('should accept timeline with string source', async () => {
            const ir = createMinimalIR();
            ir.timeline.provider = 'video';
            ir.timeline.source = 'video.mp4';

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timeline.source).toBe('video.mp4');
        });

        test('should reject timeline with non-string source (T062)', async () => {
            const ir = createMinimalIR();
            ir.timeline.source = 123 as any; // Invalid: number instead of string

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('source must be a string');
        });

        test('should reject invalid provider', async () => {
            const ir = createMinimalIR();
            ir.timeline.provider = 'invalid' as any;

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Invalid timeline provider');
        });
    });

    describe('Time expression type checking (T060)', () => {
        test('should accept numeric literals', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.events).toHaveLength(1);
        });

        test('should accept variable references', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: { kind: 'variable', name: 'startTime' },
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.events).toHaveLength(1);
        });

        test('should accept binary expressions', async () => {
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

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.events).toHaveLength(1);
        });

        test('should reject non-numeric literal in time expression', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: { kind: 'literal', value: 'invalid' as any }, // Should be number
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('must be a number');
        });

        test('should reject invalid binary operator', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'test',
                start: {
                    kind: 'binary',
                    op: '%' as any, // Invalid operator
                    left: { kind: 'literal', value: 5 },
                    right: { kind: 'literal', value: 3 }
                },
                end: { kind: 'literal', value: 20 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Invalid binary operator');
        });
    });

    describe('Action type checking', () => {
        test('should accept valid target selector (T062)', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'show',
                target: {
                    kind: 'id',
                    value: 'myElement'
                },
                properties: undefined,
                sourceLocation: { line: 3, column: 1, length: 15 }
            }];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.events[0].actions).toHaveLength(1);
        });

        test('should reject invalid selector kind', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'show',
                target: {
                    kind: 'invalid' as any,
                    value: 'test'
                },
                properties: undefined,
                sourceLocation: { line: 3, column: 1, length: 15 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Invalid target selector kind');
        });

        test('should reject non-string selector value', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'show',
                target: {
                    kind: 'id',
                    value: 123 as any // Should be string
                },
                properties: undefined,
                sourceLocation: { line: 3, column: 1, length: 15 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('selector value must be a string');
        });
    });

    describe('Numeric duration checking (T061)', () => {
        test('should accept valid numeric duration', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'animate',
                target: {
                    kind: 'id',
                    value: 'element'
                },
                properties: {
                    animation: 'fadeIn',
                    duration: 500
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            }];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.events[0].actions[0].properties?.duration).toBe(500);
        });

        test('should reject negative duration', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'animate',
                target: {
                    kind: 'id',
                    value: 'element'
                },
                properties: {
                    animation: 'fadeIn',
                    duration: -100 // Negative duration
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('must be non-negative');
        });

        test('should reject non-numeric duration', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'animate',
                target: {
                    kind: 'id',
                    value: 'element'
                },
                properties: {
                    animation: 'fadeIn',
                    duration: 'fast' as any // Should be number
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('duration must be a number');
        });

        test('should validate animation args durations', async () => {
            const ir = createMinimalIR();
            ir.events = [createEvent('test', 0, 10)];
            ir.events[0].actions = [{
                type: 'show',
                target: {
                    kind: 'id',
                    value: 'element'
                },
                properties: {
                    animation: 'fadeIn',
                    animationArgs: [-500, 'left'] // Negative duration
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('must be non-negative');
        });
    });

    describe('Comprehensive type checking (T063)', () => {
        test('should validate complete IR successfully', async () => {
            const ir = createMinimalIR();
            ir.timeline.provider = 'video';
            ir.timeline.source = 'test.mp4';
            ir.events = [
                createEvent('intro', 0, 5),
                createEvent('main', 5, 120)
            ];
            ir.events[0].actions = [{
                type: 'show',
                target: { kind: 'id', value: 'title' },
                properties: { animation: 'fadeIn', duration: 500 },
                sourceLocation: { line: 4, column: 1, length: 20 }
            }];
            ir.events[1].actions = [{
                type: 'hide',
                target: { kind: 'class', value: 'content' },
                properties: undefined,
                sourceLocation: { line: 6, column: 1, length: 15 }
            }];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timeline.provider).toBe('video');
            expect(result.events).toHaveLength(2);
            expect(result.events[0].actions).toHaveLength(1);
        });

        test('should accumulate type errors from multiple events', async () => {
            const ir = createMinimalIR();
            ir.events = [{
                id: 'bad',
                start: { kind: 'literal', value: 'not-a-number' as any },
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 2, column: 1, length: 20 }
            }];

            const result = Effect.runPromise(typeCheck(ir));

            // Should fail on the first type error encountered
            await expect(result).rejects.toThrow();
        });
    });
});
