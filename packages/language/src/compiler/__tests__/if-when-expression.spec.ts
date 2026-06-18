/**
 * Regression tests for C3 — `if` → `when` expression serialization.
 *
 * The engine's `when` operation reads `operationData.expression`, a formatted
 * string `LEFT<op>RIGHT` (no spaces) that it parses by splitting on a single
 * comparison operator (`== != >= <= > <`); each side is a number, a
 * single-quoted string, or a property chain ($operationdata/$globaldata/$scope).
 *
 * The compiler previously emitted `operationData.condition` (wrong key) holding a
 * constant-folded boolean or a parenthesized/JSON-quoted string — neither of
 * which `when` can parse, so every `if`/`else` crashed at runtime. Found by
 * running a compiled chapter in the real engine (jsdom). See eligius
 * `src/operation/when.ts`.
 */
import { Effect, Exit } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('if → when expression (C3)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function whenOpFor(body: string) {
    const code = `action f(count, name) [
${body}
]
timeline "t" in "#root" using raf {}`;
    const document = await parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(document.parseResult.parserErrors.map(e => e.message).join(', '));
    }
    const ir = await Effect.runPromise(transformAST(document.parseResult.value));
    return ir.config.actions[0].startOperations.find(o => o.systemName === 'when');
  }

  test('emits `expression` (not `condition`) in the engine format', async () => {
    const when = await whenOpFor(`  if (count > 0) { selectElement("#x") }`);
    expect(when).toBeDefined();
    // Must use the key the engine reads, and must NOT use the old buggy key.
    expect(when!.operationData).toHaveProperty('expression');
    expect(when!.operationData).not.toHaveProperty('condition');
    expect((when!.operationData as Record<string, unknown>).expression).toBe(
      '$operationdata.count>0'
    );
  });

  test('serializes a string comparison with single-quoted right side', async () => {
    const when = await whenOpFor(`  if (name == "ready") { selectElement("#x") }`);
    expect((when!.operationData as Record<string, unknown>).expression).toBe(
      "$operationdata.name=='ready'"
    );
  });

  test('constant-foldable condition folds to the taken branch (no when emitted)', async () => {
    const code = `action f() [
  const count = 2
  if (@count > 0) { selectElement("#yes") } else { selectElement("#no") }
]
timeline "t" in "#root" using raf {}`;
    const document = await parse(code);
    const ops = (await Effect.runPromise(transformAST(document.parseResult.value))).config
      .actions[0].startOperations;
    // No when/otherwise/endWhen — the true branch is inlined directly.
    expect(ops.map(o => o.systemName)).toEqual(['selectElement']);
    expect((ops[0].operationData as Record<string, unknown>).selector).toBe('#yes');
  });

  test('literal `if (true)` folds to the then-branch', async () => {
    const code = `action f() [
  if (true) { selectElement("#t") } else { selectElement("#e") }
]
timeline "t" in "#root" using raf {}`;
    const document = await parse(code);
    const ops = (await Effect.runPromise(transformAST(document.parseResult.value))).config
      .actions[0].startOperations;
    expect(ops.map(o => o.systemName)).toEqual(['selectElement']);
    expect((ops[0].operationData as Record<string, unknown>).selector).toBe('#t');
  });

  test('whole if/else still produces when / otherwise / endWhen', async () => {
    const code = `action f(count) [
  if (count > 0) { selectElement("#a") } else { selectElement("#b") }
]
timeline "t" in "#root" using raf {}`;
    const document = await parse(code);
    const ir = await Effect.runPromise(transformAST(document.parseResult.value));
    const names = ir.config.actions[0].startOperations.map(o => o.systemName);
    expect(names).toEqual(['when', 'selectElement', 'otherwise', 'selectElement', 'endWhen']);
  });

  // Forms the engine's `when` cannot evaluate must be a clear compile error,
  // never silently-malformed operationData.
  const unsupported: Array<[string, string]> = [
    ['logical &&', `  if (count > 0 && count < 9) { selectElement("#x") }`],
    ['logical ||', `  if (count == 1 || count == 2) { selectElement("#x") }`],
    ['bare boolean', `  if (count) { selectElement("#x") }`],
    ['arithmetic operand', `  if (count + 1 > 0) { selectElement("#x") }`],
  ];
  for (const [label, body] of unsupported) {
    test(`rejects ${label} condition with a compile error`, async () => {
      const code = `action f(count) [
${body}
]
timeline "t" in "#root" using raf {}`;
      const document = await parse(code);
      const exit = await Effect.runPromiseExit(transformAST(document.parseResult.value));
      expect(Exit.isFailure(exit)).toBe(true);
    });
  }
});
