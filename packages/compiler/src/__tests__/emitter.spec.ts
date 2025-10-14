import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { emitJSON, emitTimeline, emitEvent, emitAction } from '../emitter.js';
import type { EligiusIR, TimelineIR, EventIR, ActionIR } from '../types/eligius-ir.js';

describe('Emitter', () => {
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
                compiledAt: '2025-10-14T00:00:00.000Z'
            },
            sourceLocation: { line: 1, column: 1, length: 50 }
        };
    }

    describe('emitTimeline (T070)', () => {
        test('should emit raf timeline without source', async () => {
            const timeline: TimelineIR = {
                provider: 'raf',
                source: undefined,
                options: undefined,
                sourceLocation: { line: 1, column: 1, length: 10 }
            };

            const result = await Effect.runPromise(emitTimeline(timeline));

            expect(result).toEqual({
                provider: 'raf'
            });
        });

        test('should emit video timeline with source', async () => {
            const timeline: TimelineIR = {
                provider: 'video',
                source: 'video.mp4',
                options: undefined,
                sourceLocation: { line: 1, column: 1, length: 10 }
            };

            const result = await Effect.runPromise(emitTimeline(timeline));

            expect(result).toEqual({
                provider: 'video',
                source: 'video.mp4'
            });
        });

        test('should include timeline options if present', async () => {
            const timeline: TimelineIR = {
                provider: 'custom',
                source: undefined,
                options: {
                    customOption: 'value',
                    anotherOption: 42
                },
                sourceLocation: { line: 1, column: 1, length: 10 }
            };

            const result = await Effect.runPromise(emitTimeline(timeline));

            expect(result.provider).toBe('custom');
            expect(result.customOption).toBe('value');
            expect(result.anotherOption).toBe(42);
        });
    });

    describe('emitAction (T072)', () => {
        test('should emit show action with target', async () => {
            const action: ActionIR = {
                type: 'show',
                target: { kind: 'id', value: 'myElement' },
                properties: undefined,
                sourceLocation: { line: 3, column: 1, length: 15 }
            };

            const result = await Effect.runPromise(emitAction(action));

            expect(result).toEqual({
                type: 'show',
                target: '#myElement'
            });
        });

        test('should emit hide action with class selector', async () => {
            const action: ActionIR = {
                type: 'hide',
                target: { kind: 'class', value: 'myClass' },
                properties: undefined,
                sourceLocation: { line: 3, column: 1, length: 15 }
            };

            const result = await Effect.runPromise(emitAction(action));

            expect(result).toEqual({
                type: 'hide',
                target: '.myClass'
            });
        });

        test('should emit animate action with properties', async () => {
            const action: ActionIR = {
                type: 'animate',
                target: { kind: 'element', value: 'div' },
                properties: {
                    animation: 'fadeIn',
                    duration: 500
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            };

            const result = await Effect.runPromise(emitAction(action));

            expect(result).toEqual({
                type: 'animate',
                target: 'div',
                animation: 'fadeIn',
                duration: 500
            });
        });

        test('should emit trigger action', async () => {
            const action: ActionIR = {
                type: 'trigger',
                target: { kind: 'id', value: 'button' },
                properties: {
                    actionName: 'onClick'
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            };

            const result = await Effect.runPromise(emitAction(action));

            expect(result).toEqual({
                type: 'trigger',
                target: '#button',
                actionName: 'onClick'
            });
        });

        test('should emit custom action with properties', async () => {
            const action: ActionIR = {
                type: 'custom',
                target: undefined,
                properties: {
                    customProp: 'value',
                    anotherProp: 123
                },
                sourceLocation: { line: 3, column: 1, length: 20 }
            };

            const result = await Effect.runPromise(emitAction(action));

            expect(result).toEqual({
                type: 'custom',
                customProp: 'value',
                anotherProp: 123
            });
        });
    });

    describe('emitEvent (T071)', () => {
        test('should emit event with literal times', async () => {
            const event: EventIR = {
                id: 'testEvent',
                start: { kind: 'literal', value: 0 },
                end: { kind: 'literal', value: 10 },
                actions: [{
                    type: 'show',
                    target: { kind: 'id', value: 'element' },
                    properties: undefined,
                    sourceLocation: { line: 4, column: 1, length: 15 }
                }],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 3, column: 1, length: 50 }
            };

            const result = await Effect.runPromise(emitEvent(event));

            expect(result).toEqual({
                id: 'testEvent',
                start: 0,
                end: 10,
                actions: [{
                    type: 'show',
                    target: '#element'
                }]
            });
        });

        test('should emit event with computed times', async () => {
            const event: EventIR = {
                id: 'computed',
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
                sourceLocation: { line: 3, column: 1, length: 30 }
            };

            const result = await Effect.runPromise(emitEvent(event));

            expect(result.start).toBe(8); // 5 + 3
            expect(result.end).toBe(20);
        });

        test('should include conditions if present', async () => {
            const event: EventIR = {
                id: 'conditional',
                start: { kind: 'literal', value: 0 },
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: [{
                    kind: 'expression',
                    expression: 'x > 5',
                    sourceLocation: { line: 3, column: 20, length: 10 }
                }],
                metadata: undefined,
                sourceLocation: { line: 3, column: 1, length: 40 }
            };

            const result = await Effect.runPromise(emitEvent(event));

            expect(result.conditions).toEqual(['x > 5']);
        });

        test('should fail for non-evaluable time expressions', async () => {
            const event: EventIR = {
                id: 'badEvent',
                start: { kind: 'variable', name: 'unknownVar' },
                end: { kind: 'literal', value: 10 },
                actions: [],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 3, column: 1, length: 30 }
            };

            const result = Effect.runPromise(emitEvent(event));

            await expect(result).rejects.toThrow('non-evaluable time expressions');
        });
    });

    describe('emitJSON (T073) - Complete emission', () => {
        test('should emit complete minimal IR', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result).toHaveProperty('timeline');
            expect(result.timeline.provider).toBe('raf');
            expect(result.events).toEqual([]);
        });

        test('should emit complete IR with events and metadata (T074)', async () => {
            const ir = createMinimalIR();
            ir.timeline.provider = 'video';
            ir.timeline.source = 'test.mp4';
            ir.events = [{
                id: 'intro',
                start: { kind: 'literal', value: 0 },
                end: { kind: 'literal', value: 5 },
                actions: [{
                    type: 'show',
                    target: { kind: 'id', value: 'title' },
                    properties: {
                        animation: 'fadeIn',
                        duration: 500
                    },
                    sourceLocation: { line: 4, column: 1, length: 20 }
                }],
                conditions: undefined,
                metadata: undefined,
                sourceLocation: { line: 3, column: 1, length: 50 }
            }];

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.timeline).toEqual({
                provider: 'video',
                source: 'test.mp4'
            });

            expect(result.events).toHaveLength(1);
            expect(result.events[0]).toEqual({
                id: 'intro',
                start: 0,
                end: 5,
                actions: [{
                    type: 'show',
                    target: '#title',
                    animation: 'fadeIn',
                    duration: 500
                }]
            });

            // Check metadata (T074)
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.generatedBy).toContain('Eligian DSL Compiler');
        });

        test('should emit valid Eligius JSON structure', async () => {
            const ir = createMinimalIR();
            ir.events = [
                {
                    id: 'event1',
                    start: { kind: 'literal', value: 0 },
                    end: { kind: 'literal', value: 10 },
                    actions: [{
                        type: 'show',
                        target: { kind: 'id', value: 'el1' },
                        properties: undefined,
                        sourceLocation: { line: 4, column: 1, length: 15 }
                    }],
                    conditions: undefined,
                    metadata: undefined,
                    sourceLocation: { line: 3, column: 1, length: 30 }
                },
                {
                    id: 'event2',
                    start: { kind: 'literal', value: 10 },
                    end: { kind: 'literal', value: 20 },
                    actions: [{
                        type: 'hide',
                        target: { kind: 'class', value: 'el2' },
                        properties: undefined,
                        sourceLocation: { line: 7, column: 1, length: 15 }
                    }],
                    conditions: undefined,
                    metadata: undefined,
                    sourceLocation: { line: 6, column: 1, length: 30 }
                }
            ];

            const result = await Effect.runPromise(emitJSON(ir));

            // Validate structure
            expect(result).toHaveProperty('timeline');
            expect(result).toHaveProperty('events');
            expect(Array.isArray(result.events)).toBe(true);

            // Validate events
            expect(result.events[0].id).toBe('event1');
            expect(result.events[0].start).toBe(0);
            expect(result.events[0].end).toBe(10);
            expect(result.events[0].actions[0].target).toBe('#el1');

            expect(result.events[1].id).toBe('event2');
            expect(result.events[1].start).toBe(10);
            expect(result.events[1].end).toBe(20);
            expect(result.events[1].actions[0].target).toBe('.el2');
        });
    });
});
