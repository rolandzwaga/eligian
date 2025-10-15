import { describe, test, expect, beforeAll } from 'vitest';
import { Effect } from 'effect';
import { transformAST } from '../ast-transformer.js';
import type { Program } from '../../generated/ast.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from '../../eligian-module.js';
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
            const code = `
                timeline "test" using video from "test.mp4" {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines).toHaveLength(1);
            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].uri).toBe('test.mp4');
            expect(result.timelines[0].sourceLocation).toBeDefined();
            expect(result.timelines[0].sourceLocation.line).toBeGreaterThan(0);
        });

        test('should transform raf timeline without source', async () => {
            const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines).toHaveLength(1);
            expect(result.timelines[0].type).toBe('raf');
            expect(result.timelines[0].uri).toBeUndefined();
        });
    });

    describe('Timeline Event transformation (T051)', () => {
        test('should transform inline endable action to TimelineAction', async () => {
            const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#title")
                        addClass("visible")
                    ] [
                        removeClass("visible")
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].timelineActions).toHaveLength(1);
            const action = result.timelines[0].timelineActions[0];
            expect(action.duration.start).toBe(0);
            expect(action.duration.end).toBe(5);
            expect(action.startOperations).toHaveLength(2);
            expect(action.endOperations).toHaveLength(1);
            expect(action.sourceLocation).toBeDefined();
        });

        test('should handle named action invocation', async () => {
            const code = `
                endable action fadeIn [
                    selectElement(".target")
                    addClass("visible")
                ] [
                    removeClass("visible")
                ]

                timeline "test" using raf {
                    at 10s..20s {
                        fadeIn()
                    }
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const action = result.timelines[0].timelineActions[0];
            expect(action.duration.start).toBe(10);
            expect(action.duration.end).toBe(20);
            // Named action invocations emit startAction operation
            expect(action.startOperations).toHaveLength(1);
            expect(action.startOperations[0].systemName).toBe('startAction');
        });
    });

    describe('Action Definition transformation', () => {
        test('should transform endable action definition', async () => {
            const code = `
                endable action showHide [
                    selectElement("#box")
                    addClass("visible")
                ] [
                    removeClass("visible")
                ]

                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.actions).toHaveLength(1);
            expect(result.actions[0].name).toBe('showHide');
            expect(result.actions[0].startOperations).toHaveLength(2);
            expect(result.actions[0].endOperations).toHaveLength(1);
        });

        test('should transform regular action definition', async () => {
            const code = `
                action highlight [
                    selectElement(".target")
                    addClass("highlight")
                ]

                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.actions).toHaveLength(1);
            expect(result.actions[0].name).toBe('highlight');
            expect(result.actions[0].startOperations).toHaveLength(2);
            expect(result.actions[0].endOperations).toHaveLength(0);
        });
    });

    describe('Operation Call transformation (T053)', () => {
        test('should transform operation with string argument', async () => {
            const code = `
                action test [
                    selectElement("#myId")
                ]
                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.actions[0].startOperations[0];
            expect(operation.systemName).toBe('selectElement');
            expect(operation.operationData?.args).toEqual(["#myId"]);
        });

        test('should transform operation with object literal', async () => {
            const code = `
                action test [
                    setStyle({ opacity: 0, color: "red" })
                ]
                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.actions[0].startOperations[0];
            expect(operation.systemName).toBe('setStyle');
            expect(operation.operationData?.opacity).toBe(0);
            expect(operation.operationData?.color).toBe("red");
        });

        test('should transform operation with multiple arguments', async () => {
            const code = `
                action test [
                    animate({ opacity: 1 }, 500, "ease")
                ]
                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.actions[0].startOperations[0];
            expect(operation.systemName).toBe('animate');
            expect(operation.operationData?.args).toBeDefined();
            expect(operation.operationData?.args).toHaveLength(3);
        });
    });

    describe('Expression transformation', () => {
        test('should transform property chain references', async () => {
            const code = `
                action test [
                    setData({ "operationdata.name": $context.currentItem })
                ]
                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.actions[0].startOperations[0];
            expect(operation.operationData?.["operationdata.name"]).toBe("context.currentItem");
        });

        test('should evaluate binary expressions with numbers', async () => {
            const code = `
                action test [
                    wait(10)
                ]
                timeline "test" using raf {}
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const operation = result.actions[0].startOperations[0];
            expect(operation.systemName).toBe('wait');
            expect(operation.operationData?.args).toEqual([10]);
        });
    });

    describe('Time expression transformation (T054)', () => {
        test('should transform number literals in duration', async () => {
            const code = `
                timeline "test" using raf {
                    at 42s..100s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            const action = result.timelines[0].timelineActions[0];
            expect(action.duration.start).toBe(42);
            expect(action.duration.end).toBe(100);
        });
    });

    describe('transformAST (T055) - Full program transformation', () => {
        test('should transform simple program to complete IEngineConfiguration IR', async () => {
            const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            // Check required IEngineConfiguration fields (Constitution VII: UUIDs)
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

            // Check action layers
            expect(result.initActions).toEqual([]);
            expect(result.actions).toEqual([]);
            expect(result.eventActions).toEqual([]);

            // Check metadata
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.dslVersion).toBe('1.0.0');
        });

        test('should transform complex program with multiple events', async () => {
            const code = `
                endable action intro [
                    selectElement("#title")
                    addClass("visible")
                ] [
                    removeClass("visible")
                ]

                timeline "main" using video from "test.mp4" {
                    at 0s..5s {
                        intro()
                    }

                    at 5s..10s [
                        selectElement("#content")
                        addClass("visible")
                    ] [
                        removeClass("visible")
                    ]

                    at 10s..15s [
                        selectElement("#footer")
                    ] [
                    ]
                }
            `;
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].type).toBe('video');
            expect(result.timelines[0].uri).toBe('test.mp4');
            expect(result.timelines[0].timelineActions).toHaveLength(3);
            expect(result.actions).toHaveLength(1); // intro action definition
        });

        test('should include source locations (T057)', async () => {
            const code = `
                timeline "test" using raf {
                    at 0s..5s [
                        selectElement("#el")
                    ] [
                    ]
                }
            `;
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
            const code = 'timeline "test" using raf {}';
            const program = await parseDSL(code);

            const result = await Effect.runPromise(transformAST(program));

            expect(result.timelines[0].type).toBe('raf');
            expect(result.timelines[0].timelineActions).toHaveLength(0);
        });
    });

    describe('Error handling (T056)', () => {
        test('should fail when timeline is missing', async () => {
            const code = `
                endable action test [
                    selectElement("#el")
                ] [
                ]
            `;
            const program = await parseDSL(code);

            const result = Effect.runPromise(transformAST(program));

            // Effect wraps errors in FiberFailure, so check the message
            await expect(result).rejects.toThrow('InvalidTimeline');
        });

        test('should include error location in transform errors', async () => {
            const code = `
                action test [
                    selectElement("#el")
                ]
            `;
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
