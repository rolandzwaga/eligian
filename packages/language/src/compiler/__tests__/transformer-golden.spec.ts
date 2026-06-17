/**
 * Golden snapshot coverage for the AST transformer.
 *
 * This suite locks the structural output of {@link transformAST} across every
 * major DSL construct (timelines, regular/endable actions, event actions,
 * sequence/stagger blocks, control flow, variables/constants, languages block,
 * unified action calls, controllers). It exists specifically to guard the
 * behavior-preserving decomposition of `ast-transformer.ts` (CODE_ANALYSIS W2):
 * the emitted IR must remain byte-identical after the module is split into
 * `transformers/`.
 *
 * UUIDs (crypto.randomUUID) and the `compiledAt` timestamp are non-deterministic,
 * so they are normalized to stable, encounter-ordered tokens before snapshotting.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Replace non-deterministic values (UUIDs, compiledAt) with stable tokens so the
 * snapshot reflects structure only. UUIDs are mapped in encounter order so that
 * referential identity between two occurrences of the same id is preserved.
 */
function normalize(value: unknown): unknown {
  const uuidTokens = new Map<string, string>();
  let counter = 0;

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (UUID_RE.test(node)) {
        let token = uuidTokens.get(node);
        if (!token) {
          token = `<uuid-${++counter}>`;
          uuidTokens.set(node, token);
        }
        return token;
      }
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node)) {
        if (key === 'compiledAt') {
          out[key] = '<compiledAt>';
        } else {
          out[key] = walk(val);
        }
      }
      return out;
    }
    return node;
  };

  return walk(value);
}

describe('AST Transformer — golden output (W2 decomposition guard)', () => {
  let services: ReturnType<typeof createEligianServices>;
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function compile(code: string): Promise<unknown> {
    const document = await parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    const result = await Effect.runPromise(transformAST(document.parseResult.value));
    return normalize(result.config);
  }

  test('regular + endable actions with parameters and references', async () => {
    const code = `
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({ opacity: 1 }, duration)
      ]

      endable action highlight(target: string) [
        selectElement(target)
        addClass("on")
      ] [
        selectElement(target)
        removeClass("on")
      ]

      timeline "t" in "#root" using raf {
        at 0s..5s fadeIn("#a", 500)
        at 5s..10s highlight("#b")
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });

  test('control flow: if/else, for loop, break/continue', async () => {
    const code = `
      action loopit(items: array) [
        for (item in items) {
          if (@@item == "skip") {
            continue
          }
          selectElement(@@item)
          if (@@item == "stop") {
            break
          }
        }
      ]

      timeline "t" in "#root" using raf {
        at 0s..1s loopit(["a", "b"])
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });

  test('sequence and stagger blocks', async () => {
    const code = `
      action intro() [ selectElement("#x") ]
      action main() [ selectElement("#y") ]

      timeline "t" in "#root" using raf {
        sequence {
          intro() for 5s
          main() for 10s
        }
        stagger 200ms [".one", ".two", ".three"] with intro() for 2s
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });

  test('global variables / constant folding and binary expressions', async () => {
    const code = `
      const base = 100

      action compute() [
        selectElement("#x")
        setData({ "operationdata.total": @base + 50 })
      ]

      timeline "t" in "#root" using raf {
        at 0s..1s compute()
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });

  test('event actions with parameters', async () => {
    const code = `
      on event "click" action handleClick(target, value) [
        selectElement(target)
        setData({ "operationdata.v": value })
      ]

      timeline "t" in "#root" using raf {
        at 0s..1s [ selectElement("#x") ] [ ]
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });

  test('languages block and controllers', async () => {
    const code = `
      languages {
        * "en-US" "English"
        "nl-NL" "Nederlands"
      }

      action setup() [
        selectElement("#nav")
        addController("LabelController", "nav.home")
      ]

      timeline "t" in "#root" using raf {
        at 0s..1s setup()
      }
    `;
    expect(await compile(code)).toMatchSnapshot();
  });
});
