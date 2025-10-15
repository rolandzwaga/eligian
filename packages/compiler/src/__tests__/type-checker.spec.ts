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
        test('should accept valid timeline with raf type', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result).toEqual(ir);
        });

        test('should accept timeline with string uri', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].type = 'video';
            ir.timelines[0].uri = 'video.mp4';

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timelines[0].uri).toBe('video.mp4');
        });

        test('should reject timeline with non-string uri (T062)', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].uri = 123 as any; // Invalid: number instead of string

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('uri must be a string');
        });

        test('should reject invalid timeline type', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].type = 'invalid' as any;

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Invalid timeline type');
        });
    });

    describe('Duration type checking (T060)', () => {
        test('should accept numeric durations', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [createTimelineAction('test', 0, 10)];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timelines[0].timelineActions).toHaveLength(1);
        });

        test('should reject non-numeric duration start', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('test', 0, 10);
            action.duration.start = 'invalid' as any; // Should be number
            ir.timelines[0].timelineActions = [action];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Duration start must be a number');
        });

        test('should reject non-numeric duration end', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('test', 0, 10);
            action.duration.end = 'invalid' as any; // Should be number
            ir.timelines[0].timelineActions = [action];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('Duration end must be a number');
        });

        test('should reject duration where end < start', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].timelineActions = [createTimelineAction('test', 10, 5)]; // end < start

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('end must be >= start');
        });
    });

    describe('Operation type checking', () => {
        test('should accept valid operations', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('test', 0, 10);
            action.startOperations = [createOperation('showElement', { selector: '#myElement' })];
            ir.timelines[0].timelineActions = [action];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
        });

        test('should reject operation with non-string systemName', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('test', 0, 10);
            const op = createOperation('showElement');
            op.systemName = 123 as any; // Should be string
            action.startOperations = [op];
            ir.timelines[0].timelineActions = [action];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('systemName must be a non-empty string');
        });

        test('should reject operation with non-object operationData', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('test', 0, 10);
            const op = createOperation('showElement');
            op.operationData = 'invalid' as any; // Should be object
            action.startOperations = [op];
            ir.timelines[0].timelineActions = [action];

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('operationData must be an object');
        });
    });

    describe('Configuration type checking', () => {
        test('should validate required configuration fields', async () => {
            const ir = createMinimalIR();

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.id).toBeDefined();
            expect(result.engine.systemName).toBe('Eligius');
            expect(result.containerSelector).toBe('body');
            expect(result.language).toBe('en');
        });

        test('should reject empty configuration id', async () => {
            const ir = createMinimalIR();
            ir.id = ''; // Empty string

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('id must be a non-empty string');
        });

        test('should reject non-string containerSelector', async () => {
            const ir = createMinimalIR();
            ir.containerSelector = 123 as any; // Should be string

            const result = Effect.runPromise(typeCheck(ir));

            await expect(result).rejects.toThrow('containerSelector must be a string');
        });
    });

    describe('Comprehensive type checking (T063)', () => {
        test('should validate complete IR successfully', async () => {
            const ir = createMinimalIR();
            ir.timelines[0].type = 'video';
            ir.timelines[0].uri = 'test.mp4';

            const intro = createTimelineAction('intro', 0, 5);
            intro.startOperations = [createOperation('showElement', { selector: '#title' })];

            const main = createTimelineAction('main', 5, 120);
            main.startOperations = [createOperation('hideElement', { selector: '.content' })];

            ir.timelines[0].timelineActions = [intro, main];

            const result = await Effect.runPromise(typeCheck(ir));

            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].timelineActions).toHaveLength(2);
            expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
        });

        test('should fail on invalid duration in timeline action', async () => {
            const ir = createMinimalIR();
            const action = createTimelineAction('bad', 0, 10);
            action.duration.start = 'not-a-number' as any;
            ir.timelines[0].timelineActions = [action];

            const result = Effect.runPromise(typeCheck(ir));

            // Should fail on the first type error encountered
            await expect(result).rejects.toThrow('Duration start must be a number');
        });
    });
});
