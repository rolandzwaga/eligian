/**
 * Regression tests for the low-severity import-validator findings of the
 * 2026-10-22 codebase audit (#11, #13, #17).
 */

import { Cause, Effect, Exit, Option } from 'effect';
import type { LangiumDocument } from 'langium';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { parseSource } from '../compiler/pipeline/parser.js';
import { isSyntheticDocumentUri } from '../validators/program/asset-import-validator.js';
import {
  createTestContextWithMockFS,
  DiagnosticSeverity,
  setupCSSRegistry,
  setupDocuments,
  type TestContext,
} from './test-helpers.js';

let uriCounter = 0;
/** A fresh directory per test so documents never leak between tests. */
function freshDir(): string {
  uriCounter += 1;
  return `file:///import-audit/t${uriCounter}`;
}

describe('Import validators (audit low findings)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContextWithMockFS();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', { classes: [], ids: [] });
  });

  describe('#11: library import with a missing path (partial AST while typing)', () => {
    test('validation does not crash on `import { a } from` without a path', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/main.eligian`,
          content: `import { a } from
action fadeIn() [
  selectElement("#box")
]
timeline "T" in "#app" using raf {
  at 0s..1s fadeIn()
}
`,
        },
      ]);
      const document = docs.get(`${dir}/main.eligian`)!;
      // The parse error is the user-facing diagnostic...
      expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
      // ...and no validator or linker throws on the undefined path.
      const crashes = (document.diagnostics ?? []).filter(d =>
        /An error occurred (during validation|while resolving reference)/.test(d.message)
      );
      expect(crashes.map(d => d.message)).toEqual([]);
    });

    test('a library with an import missing its path does not crash validation', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/lib.eligian`,
          content: `library lib
import { a } from
action fadeIn() [
  selectElement("#box")
]
`,
        },
      ]);
      const document = docs.get(`${dir}/lib.eligian`)!;
      const crashes = (document.diagnostics ?? []).filter(d =>
        /An error occurred (during validation|while resolving reference)/.test(d.message)
      );
      expect(crashes.map(d => d.message)).toEqual([]);
    });

    test('the compiler reports the parse error instead of crashing on the missing path', async () => {
      const exit = await Effect.runPromiseExit(
        parseSource(
          'import { a } from\naction f() [\n  selectElement("#a")\n]\n',
          `${freshDir()}/main.eligian`
        )
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        // A typed failure (ParseError), not a TypeError defect
        const error = Cause.findErrorOption(exit.cause);
        expect(Option.isSome(error)).toBe(true);
        expect(Option.getOrThrow(error)._tag).toBe('ParseError');
      }
    });
  });

  describe('#13: circular library imports', () => {
    const cycleErrors = (doc: LangiumDocument) =>
      (doc.diagnostics ?? []).filter(
        d => d.code === 'circular_library_import' && d.severity === DiagnosticSeverity.Error
      );

    test('two libraries importing each other both report the cycle', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/a.eligian`,
          content: `library a
import { y } from "./b.eligian"
action x() [
  selectElement("#a")
]
`,
        },
        {
          uri: `${dir}/b.eligian`,
          content: `library b
import { x } from "./a.eligian"
action y() [
  selectElement("#b")
]
`,
        },
      ]);
      const aErrors = cycleErrors(docs.get(`${dir}/a.eligian`)!);
      const bErrors = cycleErrors(docs.get(`${dir}/b.eligian`)!);
      expect(aErrors).toHaveLength(1);
      expect(aErrors[0].message).toContain(
        'Circular library import: a.eligian → b.eligian → a.eligian'
      );
      expect(aErrors[0].range.start.line).toBe(1); // On the import, not the library header
      expect(bErrors).toHaveLength(1);
      expect(bErrors[0].message).toContain('b.eligian → a.eligian → b.eligian');
    });

    test('a library importing itself reports the cycle', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/self.eligian`,
          content: `library self
import { y } from "./self.eligian"
action x() [
  selectElement("#a")
]
action y() [
  selectElement("#b")
]
`,
        },
      ]);
      const errors = cycleErrors(docs.get(`${dir}/self.eligian`)!);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('self.eligian → self.eligian');
    });

    test('a three-library cycle is reported once per member; upstream libraries stay clean', async () => {
      const dir = freshDir();
      const lib = (name: string, imports: string, action: string) => ({
        uri: `${dir}/${name}.eligian`,
        content: `library ${name}
${imports}
action ${action}() [
  selectElement("#${action}")
]
`,
      });
      const docs = await setupDocuments(ctx, [
        lib('up', 'import { a1 } from "./a.eligian"', 'u1'),
        lib('a', 'import { b1 } from "./b.eligian"', 'a1'),
        lib('b', 'import { c1 } from "./c.eligian"', 'b1'),
        lib('c', 'import { a1 } from "./a.eligian"', 'c1'),
      ]);
      expect(cycleErrors(docs.get(`${dir}/up.eligian`)!)).toHaveLength(0);
      for (const name of ['a', 'b', 'c']) {
        expect(cycleErrors(docs.get(`${dir}/${name}.eligian`)!)).toHaveLength(1);
      }
      expect(cycleErrors(docs.get(`${dir}/a.eligian`)!)[0].message).toContain(
        'a.eligian → b.eligian → c.eligian → a.eligian'
      );
    });

    test('a program importing a library that is part of a cycle reports it on the import', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/a.eligian`,
          content: `library a
import { y } from "./b.eligian"
action x() [
  selectElement("#a")
]
`,
        },
        {
          uri: `${dir}/b.eligian`,
          content: `library b
import { x } from "./a.eligian"
action y() [
  selectElement("#b")
]
`,
        },
        {
          uri: `${dir}/main.eligian`,
          content: `styles "./styles.css"
import { x } from "./a.eligian"
timeline "T" in "#app" using raf {
  at 0s..1s x()
}
`,
        },
      ]);
      const errors = cycleErrors(docs.get(`${dir}/main.eligian`)!);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain(
        "Imported library './a.eligian' has a circular import: a.eligian → b.eligian → a.eligian"
      );
    });

    test('breaking a cycle clears the error on a program that only imports a cycle member', async () => {
      const dir = freshDir();
      const bUri = `${dir}/b.eligian`;
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/a.eligian`,
          content: `library a
import { y } from "./b.eligian"
action x() [
  selectElement("#a")
]
`,
        },
        {
          uri: bUri,
          content: `library b
import { x } from "./a.eligian"
action y() [
  selectElement("#b")
]
`,
        },
        {
          uri: `${dir}/main.eligian`,
          content: `styles "./styles.css"
import { x } from "./a.eligian"
timeline "T" in "#app" using raf {
  at 0s..1s x()
}
`,
        },
      ]);
      const mainUri = `${dir}/main.eligian`;
      expect(cycleErrors(docs.get(mainUri)!)).toHaveLength(1);

      // b drops its import of a: main only references a's actions, not b's
      ctx.mockFs!.writeFile(bUri, 'library b\naction y() [\n  selectElement("#b")\n]\n');
      const workspace = ctx.services.shared.workspace;
      await workspace.DocumentBuilder.update([URI.parse(bUri)], []);

      const main = workspace.LangiumDocuments.getDocument(URI.parse(mainUri))!;
      expect(cycleErrors(main)).toHaveLength(0);
    });

    test('breaking a three-library cycle clears the error on every member', async () => {
      const dir = freshDir();
      const lib = (name: string, imports: string, action: string) => ({
        uri: `${dir}/${name}.eligian`,
        content: `library ${name}
${imports}
action ${action}() [
  selectElement("#${action}")
]
`,
      });
      await setupDocuments(ctx, [
        lib('a', 'import { b1 } from "./b.eligian"', 'a1'),
        lib('b', 'import { c1 } from "./c.eligian"', 'b1'),
        lib('c', 'import { a1 } from "./a.eligian"', 'c1'),
      ]);
      const workspace = ctx.services.shared.workspace;
      const get = (name: string) =>
        workspace.LangiumDocuments.getDocument(URI.parse(`${dir}/${name}.eligian`))!;
      expect(cycleErrors(get('a'))).toHaveLength(1);

      const fixedC = lib('c', '', 'c1');
      ctx.mockFs!.writeFile(fixedC.uri, fixedC.content);
      await workspace.DocumentBuilder.update([URI.parse(fixedC.uri)], []);

      for (const name of ['a', 'b', 'c']) {
        expect(cycleErrors(get(name))).toHaveLength(0);
      }
    });

    test('acyclic and diamond-shaped library imports are not reported', async () => {
      const dir = freshDir();
      const docs = await setupDocuments(ctx, [
        {
          uri: `${dir}/base.eligian`,
          content: `library base
action b0() [
  selectElement("#a")
]
`,
        },
        {
          uri: `${dir}/left.eligian`,
          content: `library left
import { b0 } from "./base.eligian"
action l0() [
  b0()
]
`,
        },
        {
          uri: `${dir}/right.eligian`,
          content: `library right
import { b0 } from "./base.eligian"
action r0() [
  b0()
]
`,
        },
        {
          uri: `${dir}/top.eligian`,
          content: `library top
import { l0 } from "./left.eligian"
import { r0 } from "./right.eligian"
action t0() [
  l0()
  r0()
]
`,
        },
      ]);
      for (const doc of docs.values()) {
        expect(cycleErrors(doc)).toHaveLength(0);
      }
    });
  });

  describe('#17: asset validation is skipped only for synthetic document URIs', () => {
    test.each([
      ['file:///memory/source-3.eligian', true],
      ['file:///7.eligian', true],
      ['file:///c%3A/work/memory/talk/main.eligian', false],
      ['file:///home/u/memory/main.eligian', false],
      ['file:///c%3A/talk/chapters/01.eligian', false],
      ['file:///memory/nested/main.eligian', false],
    ])('isSyntheticDocumentUri(%s) === %s', (uri, expected) => {
      expect(isSyntheticDocumentUri(uri)).toBe(expected);
    });
  });
});
