/**
 * Eligius' lint in the language server: each program is linted LINT_DELAY ms
 * after its last validation, on the server's own documents (libraries
 * included), never when it has errors or the setting is off.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createEligianServices, type EligiusLintParams, parseCSS } from '@eligian/language';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LINT_DELAY, registerEligiusLint } from '../eligius-lint.js';

const CSS = '#stage {}\n#a {}\n';
/** scrollToElement's block 'nowhere' is not one of its allowed values (line 5) */
const BAD = `styles "./s.css"
timeline "t" in "#stage" using raf {
  at 0s..1s [
    selectElement("#a")
    scrollToElement(200, "nowhere")
  ]
}`;

let tmp: string;
const uriOf = (name: string) => URI.file(path.join(tmp, name)).toString();

function setup() {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const sent: EligiusLintParams[] = [];
  const registration = registerEligiusLint(services, params => sent.push(params));
  const documents = services.shared.workspace.LangiumDocuments;
  const builder = services.shared.workspace.DocumentBuilder;
  // The CSS the language server registers when it parses a program (main.ts)
  const cssUri = uriOf('s.css');
  services.css.CSSRegistry.updateCSSFile(cssUri, parseCSS(CSS, path.join(tmp, 's.css')));
  const add = (name: string, text: string): LangiumDocument => {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
      text,
      URI.parse(uriOf(name))
    );
    documents.addDocument(document);
    services.css.CSSRegistry.registerImports(document.uri.toString(), [cssUri]);
    return document;
  };
  const build = (docs: LangiumDocument[]) => builder.build(docs, { validation: true });
  const change = async (document: LangiumDocument, text: string) => {
    documents.deleteDocument(document.uri);
    const changed = add(path.basename(document.uri.fsPath), text);
    await build([changed]);
    return changed;
  };
  return { services, sent, registration, add, build, change, builder };
}

describe('registerEligiusLint (the language server)', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligius-lint-'));
    // The compile loads the program's assets from disk
    fs.writeFileSync(path.join(tmp, 's.css'), CSS);
    // Only the debounce: Langium's builds yield with setImmediate
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('lints a program LINT_DELAY ms after its validation, once', async () => {
    const { sent, add, build, change } = setup();
    const program = add('main.eligian', BAD);
    await build([program]);
    await vi.advanceTimersByTimeAsync(LINT_DELAY - 1);
    expect(sent).toEqual([]);
    // A new validation before the delay restarts it
    await change(program, `${BAD}\n`);
    await vi.advanceTimersByTimeAsync(LINT_DELAY - 1);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([
      {
        programUri: uriOf('main.eligian'),
        files: [
          {
            uri: uriOf('main.eligian'),
            diagnostics: [
              {
                severity: 1,
                source: 'Eligius lint',
                code: 'E120',
                // The whole call: scrollToElement(200, "nowhere")
                range: { start: { line: 4, character: 4 }, end: { line: 4, character: 35 } },
                message: expect.stringMatching(
                  /^scrollToElement: 'block' must be one of .* \(at timelines\[0\]\.timelineActions\[0\]\.startOperations\[\d+\]\.operationData\.block in the compiled JSON\)$/
                ),
              },
            ],
          },
        ],
      },
    ]);
  });

  test("a finding in a library action is the library's", async () => {
    const { sent, add, build } = setup();
    const library = add(
      'lib.eligian',
      `library helpers
action jump() [
  selectElement("#a")
  scrollToElement(200, "nowhere")
]`
    );
    const program = add(
      'main.eligian',
      `styles "./s.css"
import { jump } from "./lib.eligian"
timeline "t" in "#stage" using raf {
  at 0s..1s jump()
}`
    );
    await build([library, program]);
    await vi.advanceTimersByTimeAsync(LINT_DELAY);
    // The library itself is not linted, only through the programs that use it
    expect(sent).toEqual([
      {
        programUri: uriOf('main.eligian'),
        files: [
          {
            uri: uriOf('lib.eligian'),
            diagnostics: [
              expect.objectContaining({
                code: 'E120',
                range: expect.objectContaining({ start: { line: 3, character: 2 } }),
              }),
            ],
          },
        ],
      },
    ]);
  });

  test('a program with errors is not linted: its findings are cleared', async () => {
    const { sent, add, build } = setup();
    const program = add('main.eligian', BAD.replace('"#a"', '"#missing"'));
    await build([program]);
    expect(program.diagnostics?.some(d => d.severity === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(LINT_DELAY);
    expect(sent).toEqual([{ programUri: uriOf('main.eligian'), files: [] }]);
  });

  test('eligian.validation.eligiusLint off: no findings', async () => {
    const { services, sent, add, build } = setup();
    services.validation.Settings.apply({ eligiusLint: false });
    await build([add('main.eligian', BAD)]);
    await vi.advanceTimersByTimeAsync(LINT_DELAY);
    expect(sent).toEqual([{ programUri: uriOf('main.eligian'), files: [] }]);
  });

  test('a deleted program clears its findings; dispose stops the lint', async () => {
    const { sent, add, build, builder, registration } = setup();
    const program = add('main.eligian', BAD);
    await build([program]);
    await builder.update([], [program.uri]);
    expect(sent).toEqual([{ programUri: uriOf('main.eligian'), files: [] }]);
    // Its pending lint was cancelled
    await vi.advanceTimersByTimeAsync(LINT_DELAY);
    expect(sent).toHaveLength(1);

    registration.dispose();
    await build([add('other.eligian', BAD)]);
    await vi.advanceTimersByTimeAsync(LINT_DELAY);
    expect(sent).toHaveLength(1);
  });
});
