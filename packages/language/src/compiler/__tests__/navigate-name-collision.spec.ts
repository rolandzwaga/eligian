/**
 * Regression (2026-10-22 audit, low): synthetic navigate action names used to
 * be a lossy slug of the target, so two timelines whose names differ only in
 * case or punctuation ("Chapter 1" / "chapter-1") shared one broadcast action
 * and both buttons navigated to the first target.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('navigate — distinct targets with the same slug', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  test('each exact target gets its own broadcast action, referenced by its own call site', async () => {
    const document = await parse(`languages { * "en-US" "English" }
timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#one" navigate "Chapter 1"
    on click "#two" navigate "chapter-1"
  ] []
}
timeline "Chapter 1" in "#stage" using raf {
  at 0s..1s [ selectElement("#x") ] []
}
timeline "chapter-1" in "#stage" using raf {
  at 0s..1s [ selectElement("#y") ] []
}`);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const ir = await Effect.runPromise(transformAST(document.parseResult.value));

    const navActions = ir.config.actions.filter(a => a.name.startsWith('__nav__'));
    expect(navActions).toHaveLength(2);

    // The click listener of each button names the action broadcasting its own target
    const hubOps = ir.config.timelines[0].timelineActions[0].startOperations;
    const listenerActions = hubOps
      .filter(op => op.systemName === 'addControllerToElement')
      .map(op => (op.operationData as { actions: string[] }).actions[0]);
    expect(listenerActions).toHaveLength(2);
    expect(listenerActions[0]).not.toBe(listenerActions[1]);

    const broadcastTarget = (name: string) => {
      const action = navActions.find(a => a.name === name);
      expect(action).toBeDefined();
      const data = action?.startOperations[0].operationData as { eventArgs: unknown[] } | undefined;
      return data?.eventArgs[0];
    };
    expect(broadcastTarget(listenerActions[0])).toBe('Chapter 1');
    expect(broadcastTarget(listenerActions[1])).toBe('chapter-1');
  });
});
