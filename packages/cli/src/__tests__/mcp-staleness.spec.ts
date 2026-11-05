/**
 * Spec 058 Phase 2 (FR-085; SC-015): the tools see edits between calls.
 *
 * One in-process server per file kind (`startInMemoryServer`), over a temp copy of
 * `__fixtures__/mcp/staleness/`. Each test calls a tool, edits one file with
 * `fs.writeFileSync`, and calls the tool again on the same server: the second result must
 * reflect the edit. The caches this guards: the CSS registry (registered per document,
 * `parser.ts` `loadCssImports`), the layout scan cache (keyed by HTML text,
 * `selector-sources.ts`), the label registry (updated by the validators) and the library
 * documents kept in the shared workspace.
 *
 * The fixture starts with one finding per kind (see its `main.eligian`); the library test
 * first writes the fixed CSS, layout and locales so the program compiles.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { McpDiagnostic } from '../mcp/diagnostics.js';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { NAME as COMPILE } from '../mcp/tools/compile.js';
import { NAME as PROJECT } from '../mcp/tools/project.js';
import { type InMemoryServer, startInMemoryServer } from './mcp-test-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '__fixtures__', 'mcp', 'staleness');

const STYLES_FIXED = `${fs.readFileSync(path.join(FIXTURE, 'styles.css'), 'utf8')}
.fresh {
  color: green;
}
`;
const LAYOUT_FIXED = '<div id="stage" class="frame"></div>\n<div id="later"></div>\n';
const LOCALES_FIXED = `${JSON.stringify(
  { 'en-US': { greeting: 'Hello', farewell: 'Goodbye' } },
  null,
  2
)}\n`;
/** Version 1: `pulse` takes the two arguments main.eligian passes. */
const LIBRARY_V1 = `library a

action pulse(target, cls) [
  selectElement(target)
  addClass(cls)
]
`;
/** Version 2: `pulse` also removes a class and calls `glow` from lib/b. */
const LIBRARY_V2 = `library a

import { glow } from "./b.eligian"

action pulse(target, cls) [
  selectElement(target)
  removeClass("frame")
  addClass(cls)
  glow(target)
]
`;

let docsRoot: string;
const tempDirs: string[] = [];
const servers: InMemoryServer[] = [];

beforeAll(() => {
  // A minimal knowledge dir (no chunks, no overlays): these tests compare results only
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-staleness-docs-'));
  tempDirs.push(docsRoot);
  fs.writeFileSync(path.join(docsRoot, 'index.json'), '[]');
  fs.writeFileSync(path.join(docsRoot, 'overlays.json'), '{"byCode":{},"bySource":{}}');
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh copy of the fixture and a server rooted in it. */
async function setup(): Promise<{
  server: InMemoryServer;
  write: (file: string, text: string) => void;
  at: (file: string) => string;
}> {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mcp-staleness-')));
  tempDirs.push(project);
  fs.cpSync(FIXTURE, project, { recursive: true });
  const server = await startInMemoryServer({ cwd: project, docsRoot });
  servers.push(server);
  const at = (file: string): string => path.join(project, file);
  return { server, at, write: (file, text) => fs.writeFileSync(at(file), text) };
}

async function call(server: InMemoryServer, tool: string, args: unknown): Promise<any> {
  const result = await server.callTool(tool, args);
  expect(result.isError, JSON.stringify(result.payload)).toBe(false);
  return result.payload;
}

const check = async (server: InMemoryServer): Promise<McpDiagnostic[]> =>
  (await call(server, CHECK, { paths: ['main.eligian'] })).diagnostics;

const codes = (diagnostics: readonly McpDiagnostic[]): string[] =>
  diagnostics.map(diagnostic => diagnostic.code);

/** The one program section of `eligian_project` on main.eligian. */
const project = async (server: InMemoryServer) => {
  const payload = await call(server, PROJECT, { path: 'main.eligian' });
  expect(payload.programs).toHaveLength(1);
  return payload.programs[0];
};

/** The operation names of the compiled `pulse` action (start operations). */
const pulseOperations = async (server: InMemoryServer): Promise<string[]> => {
  const payload = await call(server, COMPILE, {
    path: 'main.eligian',
    select: { action: 'pulse' },
  });
  expect(payload.ok, JSON.stringify(payload.diagnostics)).toBe(true);
  return payload.fragment.actions.pulse.startOperations.map(
    (operation: { systemName: string }) => operation.systemName
  );
};

describe('between calls', () => {
  it('CSS: check unknown_css_class disappears; project css.classes changes', async () => {
    const { server, write } = await setup();

    const before = await check(server);
    const classesBefore = (await project(server)).css.classes;
    write('styles.css', STYLES_FIXED);
    const after = await check(server);
    const classesAfter = (await project(server)).css.classes;

    expect(
      before
        .filter(d => d.code === 'unknown_css_class')
        .map(d => d.message)
        .join('\n')
    ).toContain('fresh');
    expect(codes(after)).not.toContain('unknown_css_class');
    expect(classesBefore).not.toContain('fresh');
    expect(classesAfter).toContain('fresh');
  });

  it('layout: check selector_not_in_layout disappears; project layout.ids changes', async () => {
    const { server, write } = await setup();

    const before = await check(server);
    const idsBefore = (await project(server)).layout.ids;
    write('layout.html', LAYOUT_FIXED);
    const after = await check(server);
    const idsAfter = (await project(server)).layout.ids;

    expect(
      before
        .filter(d => d.code === 'selector_not_in_layout')
        .map(d => d.message)
        .join('\n')
    ).toContain('later');
    expect(codes(after)).not.toContain('selector_not_in_layout');
    expect(idsBefore).toEqual(['stage']);
    expect(idsAfter).toEqual(['later', 'stage']);
  });

  it('locales: project locales.keys changes; check label-ID diagnostic disappears', async () => {
    const { server, write } = await setup();

    const keysBefore = (await project(server)).locales.keys;
    const before = await check(server);
    write('locales.json', LOCALES_FIXED);
    const keysAfter = (await project(server)).locales.keys;
    const after = await check(server);

    expect(keysBefore).toEqual(['greeting']);
    expect([...keysAfter].sort()).toEqual(['farewell', 'greeting']);
    expect(
      before
        .filter(d => d.code === 'unknown_label_id')
        .map(d => d.message)
        .join('\n')
    ).toContain('farewell');
    expect(codes(after)).not.toContain('unknown_label_id');
  });

  it('library: compile operations change; check diagnostic disappears (one parameter → two); project files gains lib/b after lib/a imports it', async () => {
    const { server, write, at } = await setup();
    write('styles.css', STYLES_FIXED);
    write('layout.html', LAYOUT_FIXED);
    write('locales.json', LOCALES_FIXED);

    // check: lib/a v0 declares one parameter, main.eligian passes two
    const v0 = await check(server);
    write('lib/a.eligian', LIBRARY_V1);
    const v1 = await check(server);

    // compile and project: v1, then v2 (one more operation, and an import of lib/b)
    const operationsV1 = await pulseOperations(server);
    const filesV1 = (await project(server)).files.map((file: { path: string }) => file.path);
    write('lib/a.eligian', LIBRARY_V2);
    const operationsV2 = await pulseOperations(server);
    const filesV2 = (await project(server)).files.map((file: { path: string }) => file.path);

    // `pulse("#stage", "lit")`, line 36 of main.eligian, against `pulse(target)`
    expect(v0.map(d => [d.code, d.line])).toEqual([['invalid_parameter_count', 36]]);
    expect(v1).toEqual([]);
    // setOperationData: `cls` is saved across selectElement, which erases operation data
    expect(operationsV1).toEqual(['selectElement', 'setOperationData', 'addClass']);
    expect(operationsV2).toEqual([
      'selectElement',
      'removeClass',
      'setOperationData',
      'addClass',
      'requestAction',
      'startAction',
    ]);
    expect(filesV1).toContain(at('lib/a.eligian'));
    expect(filesV1).not.toContain(at('lib/b.eligian'));
    expect(filesV2).toContain(at('lib/b.eligian'));
  });
});
