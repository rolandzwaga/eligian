import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';
import {
  compile,
  compileString,
  compileToIR,
  compileToJSON,
  compileWithDefaults,
  getCompilerVersion,
  parseSource,
  validateAST,
} from '../pipeline.js';

describe('Pipeline', () => {
  describe('parseSource (T076)', () => {
    test('should parse valid DSL source', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..5s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(parseSource(source));

      expect(result).toBeDefined();
      expect(result.$type).toBe('Program');
      expect(result.statements).toBeDefined();
      expect(result.statements.length).toBeGreaterThan(0);
    });

    test('should fail on lexer error', async () => {
      // Invalid character that lexer cannot handle
      const source = 'timeline "test" in ".test-container" using raf \u0000';

      const result = Effect.runPromise(parseSource(source));

      await expect(result).rejects.toThrow();
    });

    test('should fail on parser error', async () => {
      // Missing timeline definition
      const source = `action test [
                selectElement("#title")
            ]`;

      const result = Effect.runPromise(parseSource(source));

      await expect(result).rejects.toThrow();
    });

    test('should fail on semantic validation error', async () => {
      // Invalid timeline provider
      const source = `timeline "test" in ".test-container" using invalidProvider {
                at 0s..5s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = Effect.runPromise(parseSource(source));

      await expect(result).rejects.toThrow('invalidProvider');
    });
  });

  describe('validateAST (T077)', () => {
    test('should pass through AST unchanged', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..5s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const program = await Effect.runPromise(parseSource(source));
      const validated = await Effect.runPromise(validateAST(program));

      expect(validated).toBe(program);
    });
  });

  describe('compile (T078)', () => {
    test('should compile simple timeline to IEngineConfiguration', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      expect(result).toBeDefined();
      expect(result.id).toBeDefined(); // UUID
      expect(result.engine.systemName).toBe('EligiusEngine');
      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0].type).toBe('animation');
      expect(result.timelines[0].timelineActions).toHaveLength(1);
      expect(result.timelines[0].timelineActions[0].duration).toEqual({ start: 0, end: 10 });
      expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(1);
      expect(result.timelines[0].timelineActions[0].startOperations[0].systemName).toBe(
        'selectElement'
      );
    });

    test('should compile video timeline with source', async () => {
      const source = `timeline "test" in ".test-container" using video from "test.mp4" {
                at 0s..5s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      expect(result.timelines[0].type).toBe('mediaplayer');
      expect(result.timelines[0].uri).toBe('test.mp4');
    });

    test('should compile multiple events', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..5s [
                    selectElement("#title")
                    addClass("visible")
                ] [
                    selectElement("#title")
                    removeClass("visible")
                ]

                at 5s..10s [
                    selectElement(".content")
                    addClass("visible")
                ] [
                    selectElement(".content")
                    removeClass("visible")
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      expect(result.timelines[0].timelineActions).toHaveLength(2);
      expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(2);
      expect(result.timelines[0].timelineActions[1].startOperations).toHaveLength(2);
    });

    test('should apply optimizations by default', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]

                at 5s..5s [
                    selectElement("#subtitle")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      // Dead action should be removed (zero duration)
      expect(result.timelines[0].timelineActions).toHaveLength(1);
    });

    test('should skip optimizations when disabled', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]

                at 5s..5s [
                    selectElement("#subtitle")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source, { optimize: false }));

      // Dead action should NOT be removed
      expect(result.timelines[0].timelineActions).toHaveLength(2);
    });

    test('should not include metadata in IEngineConfiguration output', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      // T282: compile() returns IEngineConfiguration which doesn't have metadata
      // Use compileToIR() if you need metadata
      expect(result.metadata).toBeUndefined();
    });

    test('should fail on invalid DSL', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at "invalid"..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = Effect.runPromise(compile(source));

      await expect(result).rejects.toThrow();
    });
  });

  describe('compileString (T080)', () => {
    test('should be an alias for compile', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result1 = await Effect.runPromise(compile(source));
      const result2 = await Effect.runPromise(compileString(source));

      // Should produce same structure (excluding random UUIDs)
      // Compare key properties but not IDs
      expect(result1.engine).toEqual(result2.engine);
      expect(result1.timelines[0].type).toEqual(result2.timelines[0].type);
      expect(result1.timelines[0].timelineActions.length).toEqual(
        result2.timelines[0].timelineActions.length
      );
      expect(result1.actions).toEqual(result2.actions);
      expect(result1.initActions).toEqual(result2.initActions);
      expect(result1.eventActions).toEqual(result2.eventActions);
    });
  });

  describe('compileToJSON (T081)', () => {
    test('should compile to pretty JSON by default', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compileToJSON(source));

      expect(typeof result).toBe('string');
      expect(result).toContain('\n'); // Pretty-printed
      expect(result).toContain('"type": "animation"');

      // Validate it's valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.timelines[0].type).toBe('animation');
    });

    test('should compile to minified JSON when requested', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compileToJSON(source, { minify: true }));

      expect(typeof result).toBe('string');
      expect(result).not.toContain('\n'); // Minified

      // Validate it's valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.timelines[0].type).toBe('animation');
    });
  });

  describe('compileToIR (T082)', () => {
    test('should return intermediate representation', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compileToIR(source));

      // Should be complete IEngineConfiguration IR
      expect(result).toBeDefined();
      expect(result.config.timelines).toBeDefined();
      expect(result.config.timelines[0].timelineActions).toBeDefined();
      expect(result.metadata).toBeDefined();

      // IR durations should be numbers
      expect(result.config.timelines[0].timelineActions[0].duration.start).toBe(0);
    });

    test('should apply optimizations to IR', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]

                at 5s..5s [
                    selectElement("#subtitle")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compileToIR(source));

      // Dead action should be removed
      expect(result.config.timelines[0].timelineActions).toHaveLength(1);
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
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compileWithDefaults(source));

      expect(result).toBeDefined();
      expect(result.timelines[0].type).toBe('animation');
    });
  });

  describe('Integration: Complex DSL programs', () => {
    test('should compile video annotation example', async () => {
      const source = `timeline "presentation" in ".presentation-container" using video from "presentation.mp4" {
                at 0s..3s [
                    selectElement("#title")
                    addClass("visible")
                    selectElement("#subtitle")
                    addClass("visible")
                ] [
                    selectElement("#subtitle")
                    removeClass("visible")
                ]

                at 3s..120s [
                    selectElement("#content")
                    addClass("visible")
                    selectElement("#title")
                    removeClass("visible")
                ] [
                    selectElement("#content")
                    removeClass("visible")
                ]

                at 120s..123s [
                    selectElement("#content")
                    removeClass("visible")
                    selectElement("#credits")
                    addClass("visible")
                ] [
                    selectElement("#credits")
                    removeClass("visible")
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      expect(result.timelines[0].type).toBe('mediaplayer');
      expect(result.timelines[0].uri).toBe('presentation.mp4');
      expect(result.timelines[0].timelineActions).toHaveLength(3);

      // Validate intro action
      expect(result.timelines[0].timelineActions[0].startOperations).toHaveLength(4);

      // Validate main action
      expect(result.timelines[0].timelineActions[1].startOperations).toHaveLength(4);

      // Validate outro action
      expect(result.timelines[0].timelineActions[2].startOperations).toHaveLength(4);
    });

    test('should compile interactive infographic example', async () => {
      const source = `timeline "infographic" in ".infographic-container" using raf {
                at 0s..5s [
                    selectElement(".chart")
                    addClass("visible")
                ] [
                    selectElement(".chart")
                    removeClass("visible")
                ]

                at 5s..10s [
                    selectElement(".details")
                    addClass("visible")
                ] [
                    selectElement(".details")
                    removeClass("visible")
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      expect(result.timelines[0].type).toBe('animation');
      expect(result.timelines[0].timelineActions).toHaveLength(2);
    });

    test('should handle computed time expressions', async () => {
      const source = `timeline "test" in ".test-container" using raf {
                at 0s..10s [
                    selectElement("#title")
                ] [
                ]

                at 10s + 5s..30s [
                    selectElement("#content")
                ] [
                ]
            }`;

      const result = await Effect.runPromise(compile(source));

      // Constant folding in AST transformer should evaluate 10 + 5 to 15
      expect(result.timelines[0].timelineActions[1].duration.start).toBe(15);
    });
  });
});
