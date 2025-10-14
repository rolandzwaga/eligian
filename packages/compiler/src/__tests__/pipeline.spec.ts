import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
    compile,
    compileString,
    compileToJSON,
    compileToIR,
    parseSource,
    validateAST,
    getCompilerVersion,
    compileWithDefaults
} from '../pipeline.js';
import type { CompileOptions } from '../pipeline.js';

describe('Pipeline', () => {
    describe('parseSource (T076)', () => {
        test('should parse valid DSL source', async () => {
            // Use minimal whitespace to avoid lexer issues
            const source = `timeline raf\nevent intro at 0..5 { show #title }`;

            const result = await Effect.runPromise(parseSource(source));

            expect(result).toBeDefined();
            expect(result.$type).toBe('Program');
            expect(result.elements).toBeDefined();
            expect(result.elements.length).toBeGreaterThan(0);
        });

        test('should fail on lexer error', async () => {
            // Invalid character that lexer cannot handle
            const source = 'timeline raf \u0000';

            const result = Effect.runPromise(parseSource(source));

            await expect(result).rejects.toThrow();
        });

        test('should fail on parser error', async () => {
            // Missing timeline definition
            const source = `
                event intro at 0..5 {
                    show #title
                }
            `;

            const result = Effect.runPromise(parseSource(source));

            await expect(result).rejects.toThrow();
        });

        test('should fail on semantic validation error', async () => {
            // Invalid timeline provider
            const source = `
                timeline invalidProvider

                event intro at 0..5 {
                    show #title
                }
            `;

            const result = Effect.runPromise(parseSource(source));

            await expect(result).rejects.toThrow('invalidProvider');
        });
    });

    describe('validateAST (T077)', () => {
        test('should pass through AST unchanged', async () => {
            const source = `
                timeline raf

                event intro at 0..5 {
                    show #title
                }
            `;

            const program = await Effect.runPromise(parseSource(source));
            const validated = await Effect.runPromise(validateAST(program));

            expect(validated).toBe(program);
        });
    });

    describe('compile (T078)', () => {
        test('should compile simple timeline', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result).toBeDefined();
            expect(result.timeline).toEqual({ provider: 'raf' });
            expect(result.events).toHaveLength(1);
            expect(result.events[0].id).toBe('intro');
            expect(result.events[0].start).toBe(0);
            expect(result.events[0].end).toBe(10);
            expect(result.events[0].actions).toHaveLength(1);
            expect(result.events[0].actions[0].type).toBe('show');
            expect(result.events[0].actions[0].target).toBe('#title');
        });

        test('should compile video timeline with source', async () => {
            const source = `
                timeline video from "test.mp4"

                event intro at 0..5 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result.timeline.provider).toBe('video');
            expect(result.timeline.source).toBe('test.mp4');
        });

        test('should compile multiple events', async () => {
            const source = `
                timeline raf

                event intro at 0..5 {
                    show #title with animation: "fadeIn", duration: 500
                }

                event main at 5..10 {
                    hide .content
                    animate div with animation: "slideIn", duration: 300
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result.events).toHaveLength(2);
            expect(result.events[0].id).toBe('intro');
            expect(result.events[1].id).toBe('main');
            expect(result.events[1].actions).toHaveLength(2);
        });

        test('should apply optimizations by default', async () => {
            const source = `
                timeline raf

                event valid at 0..10 {
                    show #title
                }

                event dead at 5..5 {
                    show #subtitle
                }
            `;

            const result = await Effect.runPromise(compile(source));

            // Dead event should be removed (zero duration)
            expect(result.events).toHaveLength(1);
            expect(result.events[0].id).toBe('valid');
        });

        test('should skip optimizations when disabled', async () => {
            const source = `
                timeline raf

                event valid at 0..10 {
                    show #title
                }

                event dead at 5..5 {
                    show #subtitle
                }
            `;

            const result = await Effect.runPromise(compile(source, { optimize: false }));

            // Dead event should NOT be removed
            expect(result.events).toHaveLength(2);
        });

        test('should include metadata in output', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result.metadata).toBeDefined();
            expect(result.metadata?.generatedBy).toContain('Eligian DSL Compiler');
        });

        test('should fail on invalid DSL', async () => {
            const source = `
                timeline raf

                event intro at "invalid"..10 {
                    show #title
                }
            `;

            const result = Effect.runPromise(compile(source));

            await expect(result).rejects.toThrow();
        });
    });

    describe('compileString (T080)', () => {
        test('should be an alias for compile', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result1 = await Effect.runPromise(compile(source));
            const result2 = await Effect.runPromise(compileString(source));

            expect(result1).toEqual(result2);
        });
    });

    describe('compileToJSON (T081)', () => {
        test('should compile to pretty JSON by default', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compileToJSON(source));

            expect(typeof result).toBe('string');
            expect(result).toContain('\n'); // Pretty-printed
            expect(result).toContain('"provider": "raf"');

            // Validate it's valid JSON
            const parsed = JSON.parse(result);
            expect(parsed.timeline.provider).toBe('raf');
        });

        test('should compile to minified JSON when requested', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compileToJSON(source, { minify: true }));

            expect(typeof result).toBe('string');
            expect(result).not.toContain('\n'); // Minified

            // Validate it's valid JSON
            const parsed = JSON.parse(result);
            expect(parsed.timeline.provider).toBe('raf');
        });
    });

    describe('compileToIR (T082)', () => {
        test('should return intermediate representation', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compileToIR(source));

            // Should be IR, not final JSON
            expect(result).toBeDefined();
            expect(result.timeline).toBeDefined();
            expect(result.events).toBeDefined();
            expect(result.metadata).toBeDefined();

            // IR events should have TimeExpression objects, not numbers
            expect(result.events[0].start).toHaveProperty('kind');
        });

        test('should apply optimizations to IR', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }

                event dead at 5..5 {
                    show #subtitle
                }
            `;

            const result = await Effect.runPromise(compileToIR(source));

            // Dead event should be removed
            expect(result.events).toHaveLength(1);
        });
    });

    describe('getCompilerVersion (T083)', () => {
        test('should return version information', () => {
            const version = getCompilerVersion();

            expect(version).toHaveProperty('compiler');
            expect(version).toHaveProperty('eligius');
            expect(typeof version.compiler).toBe('string');
            expect(typeof version.eligius).toBe('string');
        });
    });

    describe('compileWithDefaults (T084)', () => {
        test('should compile with default options', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }
            `;

            const result = await Effect.runPromise(compileWithDefaults(source));

            expect(result).toBeDefined();
            expect(result.timeline.provider).toBe('raf');
        });
    });

    describe('Integration: Complex DSL programs', () => {
        test('should compile video annotation example', async () => {
            const source = `
                timeline video from "presentation.mp4"

                event intro at 0..3 {
                    show #title with animation: "fadeIn", duration: 1000
                    show #subtitle with animation: "fadeIn", duration: 1000
                }

                event main at 3..120 {
                    show #content
                    hide #title
                }

                event outro at 120..123 {
                    hide #content with animation: "fadeOut", duration: 1000
                    show #credits with animation: "fadeIn", duration: 1000
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result.timeline.provider).toBe('video');
            expect(result.timeline.source).toBe('presentation.mp4');
            expect(result.events).toHaveLength(3);

            // Validate intro event
            expect(result.events[0].id).toBe('intro');
            expect(result.events[0].actions).toHaveLength(2);
            expect(result.events[0].actions[0].animation).toBe('fadeIn');

            // Validate main event
            expect(result.events[1].id).toBe('main');
            expect(result.events[1].actions).toHaveLength(2);

            // Validate outro event
            expect(result.events[2].id).toBe('outro');
            expect(result.events[2].actions).toHaveLength(2);
        });

        test('should compile interactive infographic example', async () => {
            const source = `
                timeline raf

                event chart at 0..5 {
                    animate .chart with animation: "slideIn", duration: 800
                }

                event details at 5..10 {
                    show .details with animation: "fadeIn", duration: 500
                }
            `;

            const result = await Effect.runPromise(compile(source));

            expect(result.timeline.provider).toBe('raf');
            expect(result.events).toHaveLength(2);
        });

        test('should handle computed time expressions', async () => {
            const source = `
                timeline raf

                event intro at 0..10 {
                    show #title
                }

                event main at 10 + 5..30 {
                    show #content
                }
            `;

            const result = await Effect.runPromise(compile(source));

            // Constant folding should evaluate 10 + 5 to 15
            expect(result.events[1].start).toBe(15);
        });
    });
});
