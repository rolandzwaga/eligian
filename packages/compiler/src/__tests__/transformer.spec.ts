import { describe, test, expect, beforeAll } from 'vitest';
import { Effect } from 'effect';
import { transformAST } from '../ast-transformer.js';
import type { Program } from '../../../language/src/generated/ast.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../../../language/src/eligian-module.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AST Transformer', () => {
    let services: ReturnType<typeof createEligianServices>;
    let parse: ReturnType<typeof parseHelper<Program>>;

    beforeAll(async () => {
        services = createEligianServices(EmptyFileSystem);
        parse = parseHelper<Program>(services.Eligian);
    });

    /**
     * Helper: Parse DSL code
     */
    async function parseDSL(code: string): Promise<Program> {
        const document = await parse(code);
        if (document.parseResult.parserErrors.length > 0) {
            throw new Error(`Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`);
        }
        return document.parseResult.value;
    }

    /**
     * Helper: Load fixture file
     */
    function loadFixture(filename: string): string {
        const path = join(__dirname, '__fixtures__', filename);
        return readFileSync(path, 'utf-8');
    }

    describe('Timeline transformation (T050)', () => {
        test('should transform video timeline with source', async () => {
            const code = 'timeline video from "test.mp4"\nevent test at 0..5 { show #el }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines).toHaveLength(1);
            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].uri).toBe('test.mp4');
            expect(result.timelines[0].sourceLocation).toBeDefined();
            expect(result.timelines[0].sourceLocation.line).toBeGreaterThan(0);
        });

        test('should transform raf timeline without source', async () => {
            const code = 'timeline raf\nevent test at 0..5 { show #el }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines).toHaveLength(1);
            expect(result.timelines[0].type).toBe('raf');
            expect(result.timelines[0].uri).toBeUndefined();
        });
    });

    describe('Event transformation (T051)', () => {
        test('should transform event to TimelineAction with time range and operations', async () => {
            const code = 'timeline raf\nevent intro at 0..5 { show #title\nhide #subtitle }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].timelineActions).toHaveLength(1);
            const action = result.timelines[0].timelineActions[0];
            expect(action.name).toBe('intro');
            expect(action.duration.start).toBe(0);
            expect(action.duration.end).toBe(5);
            expect(action.startOperations).toHaveLength(2);
            expect(action.sourceLocation).toBeDefined();
        });

        test('should handle single action', async () => {
            const code = 'timeline raf\nevent test at 10..20 { show #element }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const action = result.timelines[0].timelineActions[0];
            expect(action.name).toBe('test');
            expect(action.startOperations).toHaveLength(1);
            expect(action.startOperations[0].systemName).toBe('showElement');
        });
    });

    describe('Selector transformation (T053)', () => {
        test('should transform ID selector in operation data', async () => {
            const code = 'timeline raf\nevent test at 0..5 { show #myId }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.timelines[0].timelineActions[0].startOperations[0];
            expect(operation.systemName).toBe('showElement');
            expect(operation.operationData?.selector).toBe('#myId');
        });

        test('should transform class selector in operation data', async () => {
            const code = 'timeline raf\nevent test at 0..5 { show .myClass }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.timelines[0].timelineActions[0].startOperations[0];
            expect(operation.operationData?.selector).toBe('.myClass');
        });

        test('should transform element selector in operation data', async () => {
            const code = 'timeline raf\nevent test at 0..5 { show div }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.timelines[0].timelineActions[0].startOperations[0];
            expect(operation.operationData?.selector).toBe('div');
        });
    });

    describe('Time expression transformation (T054)', () => {
        test('should transform number literals in duration', async () => {
            const code = 'timeline raf\nevent test at 42..100 { show #el }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const action = result.timelines[0].timelineActions[0];
            expect(action.duration.start).toBe(42);
            expect(action.duration.end).toBe(100);
        });
    });

    describe('transformAST (T055) - Full program transformation', () => {
        test('should transform simple program to complete IEngineConfiguration IR', async () => {
            const code = loadFixture('simple.eligian');
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            // Check required IEngineConfiguration fields
            expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
            expect(result.engine.systemName).toBe('Eligius');
            expect(result.containerSelector).toBe('body');
            expect(result.language).toBe('en');
            expect(result.layoutTemplate).toBe('default');
            expect(result.availableLanguages).toEqual([{ code: 'en', label: 'English' }]);

            // Check timelines
            expect(result.timelines).toHaveLength(1);
            expect(result.timelines[0].type).toBe('raf');
            expect(result.timelines[0].timelineActions).toHaveLength(1);
            expect(result.timelines[0].timelineActions[0].name).toBe('test');

            // Check action layers
            expect(result.initActions).toEqual([]);
            expect(result.actions).toEqual([]);
            expect(result.eventActions).toEqual([]);

            // Check metadata
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.dslVersion).toBe('1.0.0');
        });

        test('should transform complex program with multiple events', async () => {
            const code = loadFixture('complex.eligian');
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].uri).toBe('test.mp4');
            expect(result.timelines[0].timelineActions).toHaveLength(3);
            expect(result.timelines[0].timelineActions[0].name).toBe('intro');
            expect(result.timelines[0].timelineActions[1].name).toBe('main');
            expect(result.timelines[0].timelineActions[2].name).toBe('outro');
        });

        test('should include source locations (T057)', async () => {
            const code = 'timeline raf\nevent test at 0..5 { show #el }';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            // Check that source locations are included
            expect(result.sourceLocation).toBeDefined();
            expect(result.sourceLocation.line).toBeGreaterThan(0);
            expect(result.timelines[0].sourceLocation).toBeDefined();
            expect(result.timelines[0].timelineActions[0].sourceLocation).toBeDefined();
            expect(result.timelines[0].timelineActions[0].startOperations[0].sourceLocation).toBeDefined();
        });

        test('should handle programs with no events gracefully', async () => {
            const code = 'timeline raf';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].type).toBe('raf');
            expect(result.timelines[0].timelineActions).toHaveLength(0);
        });
    });

    describe('Error handling (T056)', () => {
        test('should fail when timeline is missing', async () => {
            const code = 'event test at 0..5 { show #el }';
            const program = await parseDSL(code);

            const result = Effect.runPromise(transformAST(program));

            // Effect wraps errors in FiberFailure, so check the message
            await expect(result).rejects.toThrow('InvalidTimeline');
        });

        test('should include error location in transform errors', async () => {
            const code = 'event badEvent at 0..5 { show #el }';
            const program = await parseDSL(code);

            try {
                await Effect.runPromise(transformAST(program));
                fail('Should have thrown');
            } catch (error: any) {
                // Effect wraps errors, check the message contains our error
                expect(error.message).toContain('TransformError');
                expect(error.message).toContain('InvalidTimeline');
            }
        });
    });
});
