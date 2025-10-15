import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { emitJSON } from '../emitter.js';
import type { EligiusIR, TimelineActionIR, OperationConfigIR } from '../types/eligius-ir.js';

describe('Emitter', () => {
    /**
     * Helper: Create minimal valid IR
     */
    function createMinimalIR(): EligiusIR {
        return {
            id: '12345678-1234-4234-8234-123456789012',
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
                id: '87654321-4321-4321-4321-210987654321',
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
                compiledAt: '2025-01-01T00:00:00.000Z',
                sourceFile: undefined
            },
            sourceLocation: { line: 1, column: 1, length: 50 }
        };
    }

    describe('emitJSON (SA004)', () => {
        test('should emit minimal IEngineConfiguration', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.id).toBe('12345678-1234-4234-8234-123456789012');
            expect(result.engine.systemName).toBe('Eligius');
            expect(result.containerSelector).toBe('body');
            expect(result.language).toBe('en');
            expect(result.layoutTemplate).toBe('default');
            expect(result.availableLanguages).toEqual([{ code: 'en', label: 'English' }]);
            expect(result.timelines).toHaveLength(1);
        });

        test('should emit timeline configuration', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].uri = 'video.mp4';
            ir.timelines[0].type = 'video';
            ir.timelines[0].duration = 100;
            ir.timelines[0].loop = true;

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.timelines[0].uri).toBe('video.mp4');
            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].duration).toBe(100);
            expect(result.timelines[0].loop).toBe(true);
        });

        test('should emit timeline actions with operations', async () => {
            const ir = createMinimalIR();

            const action: TimelineActionIR = {
                id: 'action-id',
                name: 'testAction',
                duration: { start: 0, end: 10 },
                startOperations: [{
                    id: 'op-id',
                    systemName: 'showElement',
                    operationData: { selector: '#test' },
                    sourceLocation: { line: 3, column: 1, length: 10 }
                }],
                endOperations: [],
                sourceLocation: { line: 2, column: 1, length: 20 }
            };

            ir.timelines[0].timelineActions = [action];

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(1);
            expect(result.timelines[0].timelineActions[0].id).toBe('action-id');
            expect(result.timelines[0].timelineActions[0].name).toBe('testAction');
            expect(result.timelines[0].timelineActions[0].duration).toEqual({ start: 0, end: 10 });
            expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
            expect(result.timelines[0].timelineActions[0].startOperations[0].systemName).toBe('showElement');
        });

        test('should emit metadata if present', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.metadata).toBeDefined();
            expect(result.metadata?.version).toBe('1.0.0');
            expect(result.metadata?.generatedBy).toContain('Eligian DSL Compiler');
        });

        test('should emit action layers', async () => {
            const ir = createMinimalIR();

            ir.initActions = [{
                id: 'init-1',
                name: 'initAction',
                startOperations: [],
                endOperations: [],
                sourceLocation: { line: 1, column: 1, length: 10 }
            }];

            ir.eventActions = [{
                id: 'event-1',
                name: 'eventAction',
                eventName: 'click',
                startOperations: [],
                sourceLocation: { line: 2, column: 1, length: 15 }
            }];

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.initActions).toHaveLength(1);
            expect(result.eventActions).toHaveLength(1);
            expect(result.eventActions[0].eventName).toBe('click');
        });

        test('should preserve UUIDs in output', async () => {
            const ir = createMinimalIR();
            const actionId = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
            const opId = 'ffff1111-2222-4333-8444-555555555555';

            ir.timelines[0].timelineActions = [{
                id: actionId,
                name: 'test',
                duration: { start: 0, end: 5 },
                startOperations: [{
                    id: opId,
                    systemName: 'test',
                    operationData: {},
                    sourceLocation: { line: 1, column: 1, length: 5 }
                }],
                endOperations: [],
                sourceLocation: { line: 1, column: 1, length: 10 }
            }];

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.timelines[0].timelineActions[0].id).toBe(actionId);
            expect(result.timelines[0].timelineActions[0].startOperations[0].id).toBe(opId);
        });

        test('should handle multiple timelines', async () => {
            const ir = createMinimalIR();

            ir.timelines.push({
                id: '11111111-2222-4333-8444-555555555555',
                uri: 'other.mp4',
                type: 'video',
                duration: 50,
                loop: false,
                selector: '',
                timelineActions: [],
                sourceLocation: { line: 5, column: 1, length: 20 }
            });

            const result = await Effect.runPromise(emitJSON(ir));

            expect(result.timelines).toHaveLength(2);
            expect(result.timelines[1].uri).toBe('other.mp4');
        });
    });
});
