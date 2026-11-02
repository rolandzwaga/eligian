/**
 * Eligius' configuration lint over a compiled program (lintCompiledConfig):
 * findings at their source, W111 left out, host names accepted.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { buildEligianMap } from '../eligian-map.js';
import { lintCompiledConfig } from '../eligius-lint.js';
import { emitJSON, optimize, typeCheck } from '../pipeline.js';

const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);

async function lint(source: string, host?: Parameters<typeof lintCompiledConfig>[2]) {
  const document = await parse(source);
  const ir = await Effect.runPromise(
    transformAST(document.parseResult.value).pipe(
      Effect.flatMap(typeCheck),
      Effect.flatMap(optimize)
    )
  );
  const config = await Effect.runPromise(emitJSON(ir));
  return lintCompiledConfig(config, buildEligianMap(ir), host);
}

describe('lintCompiledConfig (eligius/lint)', () => {
  test('a literal outside the allowed values is an error at its operation', async () => {
    const findings = await lint(`timeline "t" in "#stage" using raf {
  at 0s..1s [
    selectElement("#a")
    scrollToElement(200, "nowhere")
  ]
}`);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        rule: 'E120',
        path: expect.stringMatching(
          /^timelines\[0\]\.timelineActions\[0\]\.startOperations\[\d+\]/
        ),
        location: expect.objectContaining({ line: 4, column: 5 }),
      }),
    ]);
  });

  test('W111 (an action parameter the caller passes) is left out', async () => {
    expect(
      await lint(`action highlight(selector) [ selectElement(selector) ]
timeline "t" in "#stage" using raf { at 0s..1s highlight("#a") }`)
    ).toEqual([]);
  });

  test("the host module's declared operations are known names", async () => {
    const source = `extensions "./host.ts" { operation track(name: string) }
timeline "t" in "#stage" using raf { at 0s..1s [ track("x") ] }`;
    const host = { path: './host.ts', operations: ['track'], controllers: [], functions: [] };
    expect(await lint(source, host)).toEqual([]);
    expect((await lint(source)).map(f => f.rule)).toContain('E001');
  });
});
