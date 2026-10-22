/**
 * Library action scoping in the compiler (Feature 023 FR-010, Feature 032 US3)
 *
 * Regression tests for two audit findings:
 * - Library actions could not call sibling or private helper actions: the
 *   compiler only knew the actions the *program* imported, so a call to a
 *   helper failed with `Unknown operation: "helper"`.
 * - Library files could not call the actions they import from other libraries
 *   by alias, and every action of a nested library leaked into the program's
 *   call scope (private helpers included).
 *
 * Each library action body is compiled against its OWN library's scope (all of
 * its own actions, private ones included, plus the actions it imports). The
 * program only sees its local actions and the actions it imports itself.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Effect } from 'effect';
import { URI } from 'langium';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { parseSource } from '../pipeline.js';
import type { EligiusIR } from '../types/eligius-ir.js';

type EmittedAction = EligiusIR['config']['actions'][number];

/** systemNames of the requestAction operations an emitted action performs, in order. */
function requestedActions(action: EmittedAction | undefined): string[] {
  return (action?.startOperations ?? [])
    .filter(op => op.systemName === 'requestAction')
    .map(op => String((op.operationData as Record<string, unknown>).systemName));
}

function actionNamed(ir: EligiusIR, name: string): EmittedAction | undefined {
  return ir.config.actions.find(a => a.name === name);
}

describe('Library action scoping (compiler)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    // Library with a private helper and a public sibling, both called by `pub`
    await createLibraryDocument(
      ctx,
      `
        library priv

        private action helper(selector: string) [
          selectElement(selector)
        ]

        action sibling(selector: string) [
          selectElement(selector)
          addClass("sibling")
        ]

        action pub(selector: string) [
          selectElement(selector)
          helper(selector)
          sibling(selector)
          addClass("x")
        ]

        action unused(selector: string) [
          selectElement(selector)
        ]
      `,
      'file:///scoping/priv.eligian'
    );

    // Bottom of a nested chain
    await createLibraryDocument(
      ctx,
      `
        library animations

        private action prep(selector: string) [
          selectElement(selector)
        ]

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          prep(selector)
          animate({opacity: 1}, duration)
        ]
      `,
      'file:///scoping/animations.eligian'
    );

    // Middle of the chain: imports fadeIn under an alias and calls it
    await createLibraryDocument(
      ctx,
      `
        library transitions

        import { fadeIn as fi } from "./animations.eligian"

        action slideAndFade(selector: string) [
          selectElement(selector)
          fi(selector, 500)
        ]
      `,
      'file:///scoping/transitions.eligian'
    );
  });

  async function parseProgram(code: string, documentUri: string): Promise<Program> {
    const document = await ctx.parse(code, { documentUri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return document.parseResult.value;
  }

  test('a public library action can call a private helper and a public sibling', async () => {
    const program = await parseProgram(
      `
        import { pub } from "./priv.eligian"

        timeline "T" in ".container" using raf {
          at 0s..1s pub("#a")
        }
      `,
      'file:///scoping/main-private.eligian'
    );

    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toContain('pub');
    // Helpers the program does not import are emitted under library-qualified names
    expect(names).toContain('priv.helper');
    expect(names).toContain('priv.sibling');
    expect(names).not.toContain('helper');
    // Unreachable library actions are not emitted
    expect(names).not.toContain('unused');
    expect(names).not.toContain('priv.unused');
    // pub's body requests its helpers by their emitted names
    expect(requestedActions(actionNamed(ir, 'pub'))).toEqual(['priv.helper', 'priv.sibling']);
  });

  test('an aliased import still lets the library action call its siblings', async () => {
    const program = await parseProgram(
      `
        import { pub as publish } from "./priv.eligian"

        timeline "T" in ".container" using raf {
          at 0s..1s publish("#a")
        }
      `,
      'file:///scoping/main-alias.eligian'
    );

    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toContain('publish');
    expect(names).not.toContain('pub');
    expect(names).toContain('priv.helper');
    expect(requestedActions(actionNamed(ir, 'publish'))).toEqual(['priv.helper', 'priv.sibling']);
  });

  test('a library action can call an action it imports, under its alias', async () => {
    const program = await parseProgram(
      `
        import { slideAndFade } from "./transitions.eligian"

        timeline "T" in ".container" using raf {
          at 0s..1s slideAndFade("#a")
        }
      `,
      'file:///scoping/main-nested.eligian'
    );

    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toContain('slideAndFade');
    // The nested action is emitted under its defining library's qualified name
    expect(names).toContain('animations.fadeIn');
    expect(names).toContain('animations.prep');
    expect(names).not.toContain('fi');
    expect(requestedActions(actionNamed(ir, 'slideAndFade'))).toEqual(['animations.fadeIn']);
    expect(requestedActions(actionNamed(ir, 'animations.fadeIn'))).toEqual(['animations.prep']);
  });

  test('a private library helper is not callable from the consuming program', async () => {
    const program = await parseProgram(
      `
        import { pub } from "./priv.eligian"

        action local(selector: string) [
          helper(selector)
        ]

        timeline "T" in ".container" using raf {
          at 0s..1s local("#a")
        }
      `,
      'file:///scoping/main-leak.eligian'
    );

    const result = await Effect.runPromise(Effect.result(transformAST(program)));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure.message).toContain('helper');
    }
  });

  test('actions of a transitively imported library are not callable from the program', async () => {
    const program = await parseProgram(
      `
        import { slideAndFade } from "./transitions.eligian"

        action local(selector: string) [
          fadeIn(selector, 100)
        ]

        timeline "T" in ".container" using raf {
          at 0s..1s local("#a")
          at 1s..2s slideAndFade("#a")
        }
      `,
      'file:///scoping/main-transitive.eligian'
    );

    const result = await Effect.runPromise(Effect.result(transformAST(program)));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure.message).toContain('fadeIn');
    }
  });

  test('a program action that shares a name with a reachable private library helper compiles', async () => {
    const program = await parseProgram(
      `
        import { pub } from "./priv.eligian"

        action helper(selector: string) [
          selectElement(selector)
        ]

        timeline "T" in ".container" using raf {
          at 0s..1s pub("#a")
          at 1s..2s helper("#a")
        }
      `,
      'file:///scoping/main-conflict.eligian'
    );

    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    // The program's helper keeps its name; the library's is qualified
    expect(names).toEqual(expect.arrayContaining(['pub', 'helper', 'priv.helper']));
    expect(new Set(names).size).toBe(names.length);
    expect(requestedActions(actionNamed(ir, 'pub'))).toEqual(['priv.helper', 'priv.sibling']);
    const helperStart = ir.config.timelines[0].timelineActions.find(ta =>
      ta.startOperations.some(
        op =>
          op.systemName === 'requestAction' &&
          (op.operationData as Record<string, unknown>).systemName === 'helper'
      )
    );
    expect(helperStart).toBeDefined();
  });

  test('a library action the program imports keeps the program name when a sibling calls it', async () => {
    const program = await parseProgram(
      `
        import { pub, sibling as sib } from "./priv.eligian"

        timeline "T" in ".container" using raf {
          at 0s..1s pub("#a")
          at 1s..2s sib("#a")
        }
      `,
      'file:///scoping/main-shared.eligian'
    );

    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    // sibling is emitted once, under the program's alias, and pub requests it by that name
    expect(names).toContain('sib');
    expect(names).not.toContain('priv.sibling');
    expect(names).not.toContain('sibling');
    expect(requestedActions(actionNamed(ir, 'pub'))).toEqual(['priv.helper', 'sib']);
  });
});

/**
 * Same scenarios through the real compiler pipeline (`parseSource` loads the
 * libraries from disk into the shared compiler services). Nested library
 * documents are linked before the libraries they import are loaded, so their
 * import references are unresolved and must be resolved by path + name.
 */
describe('Library action scoping (real pipeline, files on disk)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligian-lib-scope-'));
    await fs.mkdir(path.join(tmpdir, 'libs'), { recursive: true });
    await fs.writeFile(path.join(tmpdir, 'test.css'), '.container {} .marked {} #a {}');
    await fs.writeFile(
      path.join(tmpdir, 'libs', 'base.eligian'),
      `library base

private action prep(selector: string) [
  selectElement(selector)
]

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  prep(selector)
  animate({opacity: 1}, duration)
]
`
    );
    await fs.writeFile(
      path.join(tmpdir, 'libs', 'mid.eligian'),
      `library mid

import { fadeIn as fi } from "./base.eligian"

private action mark(selector: string) [
  selectElement(selector)
  addClass("marked")
]

action slideAndFade(selector: string) [
  mark(selector)
  fi(selector, 500)
]
`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('nested library actions resolve their own private helpers and aliased imports', async () => {
    const mainPath = path.join(tmpdir, 'main.eligian');
    const source = `styles "./test.css"
import { slideAndFade } from "./libs/mid.eligian"

timeline "T" in ".container" using raf {
  at 0s..1s slideAndFade("#a")
}
`;
    await fs.writeFile(mainPath, source);

    const program = await Effect.runPromise(parseSource(source, URI.file(mainPath).toString()));
    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toEqual(
      expect.arrayContaining(['slideAndFade', 'mid.mark', 'base.fadeIn', 'base.prep'])
    );
    expect(names).not.toContain('fadeIn');
    expect(names).not.toContain('fi');
    expect(requestedActions(actionNamed(ir, 'slideAndFade'))).toEqual(['mid.mark', 'base.fadeIn']);
    expect(requestedActions(actionNamed(ir, 'base.fadeIn'))).toEqual(['base.prep']);
  });

  // Audit regression (spec 023 US3 scenario 5): two libraries that each have a
  // private `helper` failed with "Action name 'helper' is used by two different
  // actions", pointing at the main program.
  test('two libraries with a private helper of the same name can be used together', async () => {
    for (const lib of ['libA', 'libB']) {
      const suffix = lib.slice(-1);
      await fs.writeFile(
        path.join(tmpdir, 'libs', `${lib}.eligian`),
        `library ${lib}

private action helper(selector: string) [
  selectElement(selector)
  addClass("marked")
]

action fade${suffix}(selector: string) [
  helper(selector)
]
`
      );
    }
    const mainPath = path.join(tmpdir, 'main-two.eligian');
    const source = `styles "./test.css"
import { fadeA } from "./libs/libA.eligian"
import { fadeB } from "./libs/libB.eligian"

action helper(selector: string) [
  selectElement(selector)
]

timeline "T" in ".container" using raf {
  at 0s..1s fadeA("#a")
  at 1s..2s fadeB("#a")
  at 2s..3s helper("#a")
}
`;
    await fs.writeFile(mainPath, source);

    const program = await Effect.runPromise(parseSource(source, URI.file(mainPath).toString()));
    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toEqual(
      expect.arrayContaining(['fadeA', 'fadeB', 'helper', 'libA.helper', 'libB.helper'])
    );
    expect(new Set(names).size).toBe(names.length);
    expect(requestedActions(actionNamed(ir, 'fadeA'))).toEqual(['libA.helper']);
    expect(requestedActions(actionNamed(ir, 'fadeB'))).toEqual(['libB.helper']);
  });

  test('libraries that share a library name still get distinct qualified names', async () => {
    await fs.mkdir(path.join(tmpdir, 'libs', 'other'), { recursive: true });
    for (const [file, action] of [
      ['libs/one.eligian', 'fadeOne'],
      ['libs/other/one.eligian', 'fadeTwo'],
    ]) {
      await fs.writeFile(
        path.join(tmpdir, file),
        `library utils

private action helper(selector: string) [
  selectElement(selector)
]

action ${action}(selector: string) [
  helper(selector)
]
`
      );
    }
    const mainPath = path.join(tmpdir, 'main-same-name.eligian');
    const source = `styles "./test.css"
import { fadeOne } from "./libs/one.eligian"
import { fadeTwo } from "./libs/other/one.eligian"

timeline "T" in ".container" using raf {
  at 0s..1s fadeOne("#a")
  at 1s..2s fadeTwo("#a")
}
`;
    await fs.writeFile(mainPath, source);

    const program = await Effect.runPromise(parseSource(source, URI.file(mainPath).toString()));
    const ir = await Effect.runPromise(transformAST(program));
    const names = ir.config.actions.map(a => a.name);

    expect(names).toEqual(expect.arrayContaining(['utils.helper', 'utils2.helper']));
    expect(new Set(names).size).toBe(names.length);
    expect(requestedActions(actionNamed(ir, 'fadeOne'))).toEqual(['utils.helper']);
    expect(requestedActions(actionNamed(ir, 'fadeTwo'))).toEqual(['utils2.helper']);
  });

  // Audit regression: a library defining AND importing `fade` compiled its own
  // calls to the imported action. Its own action now wins (and the IDE reports
  // the collision in the library).
  test("a library's own action wins over an import of the same name", async () => {
    await fs.writeFile(
      path.join(tmpdir, 'libs', 'm.eligian'),
      `library mlib

action fade(selector: string) [
  selectElement(selector)
  addClass("fromM")
]
`
    );
    await fs.writeFile(
      path.join(tmpdir, 'libs', 'l.eligian'),
      `library llib

import { fade } from "./m.eligian"

action fade(selector: string) [
  selectElement(selector)
  addClass("fromL")
]

action pub(selector: string) [
  fade(selector)
]
`
    );
    const mainPath = path.join(tmpdir, 'main-shadow.eligian');
    const source = `styles "./test.css"
import { pub } from "./libs/l.eligian"

timeline "T" in ".container" using raf {
  at 0s..1s pub("#a")
}
`;
    await fs.writeFile(mainPath, source);

    const program = await Effect.runPromise(parseSource(source, URI.file(mainPath).toString()));
    const ir = await Effect.runPromise(transformAST(program));

    expect(requestedActions(actionNamed(ir, 'pub'))).toEqual(['llib.fade']);
    const fade = actionNamed(ir, 'llib.fade');
    const addClass = fade?.startOperations.find(op => op.systemName === 'addClass');
    expect(JSON.stringify(addClass?.operationData)).toContain('fromL');
    expect(ir.config.actions.map(a => a.name)).not.toContain('mlib.fade');
  });
});
