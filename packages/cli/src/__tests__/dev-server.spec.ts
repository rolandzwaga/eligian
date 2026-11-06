/**
 * `eligian dev` (audit idea #23): serves the bundle with the dev client and
 * tells the browser how to apply a change (swap the CSS, reload, show the
 * build error).
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compileFile } from '../compile-file.js';
import { type DevServer, startDevServer, styleOf, withClient } from '../dev/dev-server.js';
import { MAX_BODY_BYTES } from '../dev/runtime-reports.js';
import { stubMissingBrowserApis } from '../smoke/dom-environment.js';
import { inFile, selectorLocation } from '../smoke/engine-error-format.js';
import { createFakeEventSource } from './fake-event-source.js';

/**
 * The dev-errors.json writer observed through a pass-through module mock (spec 058 phase 4,
 * SC-008 (7)): the dev code imports `* as fs from 'node:fs/promises'`, whose ESM bindings a
 * `vi.spyOn(fs.promises, …)` would not change.
 */
const io = vi.hoisted(() => ({ calls: [] as string[], inFlight: 0, maxInFlight: 0 }));
vi.mock('node:fs/promises', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    writeFile: vi.fn(async (p: Parameters<typeof real.writeFile>[0], ...a: unknown[]) => {
      io.calls.push(`write ${p}`);
      return (real.writeFile as (...args: unknown[]) => Promise<void>)(p, ...a);
    }),
    rename: vi.fn(async (from: string, to: string) => {
      io.calls.push(`rename ${from} ${to}`);
      io.inFlight++;
      io.maxInFlight = Math.max(io.maxInFlight, io.inFlight);
      try {
        return await real.rename(from, to);
      } finally {
        io.inFlight--;
      }
    }),
  };
});

const PROGRAM = `layout "./layout.html"
styles "./styles.css"
timeline "t" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") addClass("on") ] [ selectElement("#a") removeClass("on") ]
}
`;

/**
 * Every line the dev servers below log, prefixed with the describe name. With
 * `ELIGIAN_DEV_LOG_OUT` set, the lines (times and temp paths normalised) are
 * written to that file, so a run can be compared with an earlier one.
 */
const logLines: string[] = [];
const collect = (prefix: string) => (line: string) => {
  logLines.push(`[${prefix}] ${line}`);
};

afterAll(() => {
  const out = process.env.ELIGIAN_DEV_LOG_OUT;
  if (!out) return;
  const normalised = logLines.map(l =>
    l
      .replace(/\d+ms/g, '<n>ms')
      .replace(/[A-Za-z]:\\[^ \n]*|\/[^ \n]*eligian-dev-[^ \n]*/g, '<tmp>')
  );
  fs.writeFileSync(out, `${normalised.join('\n')}\n`);
});

describe('eligian dev', () => {
  let dir: string;
  let server: DevServer;
  const events: { event: string; data: unknown }[] = [];
  let stream: http.ClientRequest;

  const get = (url: string) =>
    new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
      http
        .get(url, response => {
          let body = '';
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              type: String(response.headers['content-type']),
              body,
            })
          );
        })
        .on('error', reject);
    });

  const write = (file: string, content: string) => fs.writeFileSync(path.join(dir, file), content);

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-dev-'));
    write('layout.html', '<div id="stage"><div id="a"></div></div>\n');
    write('styles.css', '#stage {}\n#a {}\n.on { color: red; }\n');
    write('main.eligian', PROGRAM);
    server = await startDevServer(path.join(dir, 'main.eligian'), {
      port: 0,
      debounceMs: 50,
      log: collect('eligian dev'),
    });
    // Listen to the events like the browser does
    await new Promise<void>(resolve => {
      stream = http.get(`${server.url}__eligian/events`, response => {
        let buffer = '';
        response.on('data', chunk => {
          buffer += chunk;
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event) events.push({ event, data: data ? JSON.parse(data) : undefined });
          }
        });
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    stream?.destroy();
    await server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const next = async (event: string) => {
    const from = events.length;
    return async () => {
      await vi.waitFor(() => expect(events.slice(from).map(e => e.event)).toContain(event), {
        timeout: 15000,
        interval: 50,
      });
      return events.slice(from).find(e => e.event === event)!;
    };
  };

  it('serves the bundle with the dev client', async () => {
    const page = await get(server.url);
    expect(page.status).toBe(200);
    expect(page.body).toContain('<script type="module" src="bundle.js"></script>');
    expect(page.body).toMatch(
      /<script src="\/__eligian\/client\.js" data-build-id="[0-9a-f-]{36}"><\/script>/
    );
    const client = await get(`${server.url}__eligian/client.js`);
    expect(client.type).toContain('text/javascript');
    expect(client.body).toContain("new EventSource('/__eligian/events')");
    expect((await get(`${server.url}bundle.js`)).status).toBe(200);
    expect((await get(`${server.url}missing.png`)).status).toBe(404);
  });

  it('a stylesheet change swaps the styles in place', async () => {
    const wait = await next('css');
    write('styles.css', '#stage {}\n#a {}\n.on { color: blue; }\n');
    const { data } = await wait();
    expect((data as { css: string }).css).toContain('color: blue');
  }, 20000);

  it('a program change reloads; a build error shows; the fix reloads', async () => {
    let wait = await next('reload');
    write('main.eligian', PROGRAM.replace('0s..1s', '0s..2s'));
    await wait();

    wait = await next('build-error');
    write('main.eligian', `${PROGRAM}action loop() [ ]\n`);
    const { data } = await wait();
    expect((data as { message: string }).message).toContain("'loop' is a keyword");

    wait = await next('reload');
    write('main.eligian', PROGRAM);
    await wait();
  }, 40000);

  it('writing .eligian/ triggers no rebuild', async () => {
    const from = events.length;
    const lines = logLines.length;
    fs.mkdirSync(path.join(dir, '.eligian'), { recursive: true });
    try {
      write('.eligian/dev-errors.json', '{"buildId":"x","errors":[]}\n');
      write('.eligian/.gitignore', '*\n');
      // The describe's debounceMs (50) + 500
      await new Promise(resolve => setTimeout(resolve, 50 + 500));
      expect(events.slice(from).filter(e => e.event === 'reload' || e.event === 'css')).toEqual([]);
      expect(logLines.length).toBe(lines);
    } finally {
      fs.rmSync(path.join(dir, '.eligian'), { recursive: true, force: true });
    }
  }, 10000);

  it('helpers: the client goes before </body>, the CSS comes from the <style>', () => {
    expect(withClient('<html><body><p></p></body></html>')).toBe(
      '<html><body><p></p>  <script src="/__eligian/client.js"></script>\n</body></html>'
    );
    expect(styleOf('<head>\n  <style>\n.a { color: red; }\n  </style>\n</head>')).toBe(
      '.a { color: red; }'
    );
  });

  it('withClient carries the buildId as a data attribute', () => {
    expect(withClient('<html><body><p></p></body></html>', 'b1')).toBe(
      '<html><body><p></p>  <script src="/__eligian/client.js" data-build-id="b1"></script>\n</body></html>'
    );
  });

  it('logs no runtime line when the page reports nothing', () => {
    const runtime =
      /runtime error:|console error:|console warning:|page error:|unhandled rejection:|matched no element/;
    expect(logLines.filter(l => runtime.test(l))).toEqual([]);
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A dev server over a fresh temp project, with an SSE listener and the served
 * build identity (spec 058 phase 4, FR-033 / SC-019).
 */
function devProject(name: string, files: Record<string, string>) {
  const project = {
    dir: '',
    server: undefined as DevServer | undefined,
    events: [] as { event: string; data: unknown }[],
    stream: undefined as http.ClientRequest | undefined,
    /** This server's log lines, unprefixed (also collected into `logLines`). */
    lines: [] as string[],
  };

  const get = (url: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(url, response => {
          let body = '';
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        })
        .on('error', reject);
    });

  const write = (file: string, content: string) =>
    fs.writeFileSync(path.join(project.dir, file), content);

  beforeAll(async () => {
    project.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-dev-'));
    for (const [file, content] of Object.entries(files)) write(file, content);
    const server = await startDevServer(path.join(project.dir, 'main.eligian'), {
      port: 0,
      debounceMs: 50,
      log: line => {
        project.lines.push(line);
        collect(name)(line);
      },
    });
    project.server = server;
    await new Promise<void>(resolve => {
      project.stream = http.get(`${server.url}__eligian/events`, response => {
        let buffer = '';
        response.on('data', chunk => {
          buffer += chunk;
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event) project.events.push({ event, data: data ? JSON.parse(data) : undefined });
          }
        });
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    project.stream?.destroy();
    await project.server?.close();
    fs.rmSync(project.dir, { recursive: true, force: true });
  });

  const next = (event: string) => {
    const from = project.events.length;
    return async () => {
      await vi.waitFor(
        () => expect(project.events.slice(from).map(e => e.event)).toContain(event),
        { timeout: 15000, interval: 50 }
      );
      return project.events.slice(from).find(e => e.event === event)!;
    };
  };

  const buildIdOf = async () =>
    /data-build-id="([^"]+)"/.exec((await get(project.server!.url)).body)?.[1];

  const post = (body: unknown) => postRuntime(project.server!.url, body);
  const file = () => readDevErrors(project.dir);
  const fileBytes = () => fs.readFileSync(path.join(project.dir, '.eligian', 'dev-errors.json'));

  /** The timeline actions of the served bundle's CONFIG (evaluated, not started). */
  const servedActions = async (): Promise<ConfigAction[]> => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    try {
      stubMissingBrowserApis(dom.window as unknown as Window & typeof globalThis);
      dom.window.eval((await get(`${project.server!.url}bundle.js`)).body);
      const config = (
        dom.window as unknown as {
          EligiusBundled: { CONFIG: { timelines: { timelineActions: ConfigAction[] }[] } };
        }
      ).EligiusBundled.CONFIG;
      return config.timelines.flatMap(t => t.timelineActions);
    } finally {
      dom.window.close();
    }
  };

  return { project, write, next, buildIdOf, post, file, fileBytes, servedActions };
}

/**
 * An engine-error report for the `addClass("on")` start operation of PROGRAM's one event,
 * with the action id of the given served build.
 */
function addClassError(actions: readonly ConfigAction[], buildId: string, message: string) {
  const action = actions.find(a => a.startOperations.some(op => op.systemName === 'addClass'))!;
  const index = action.startOperations.findIndex(op => op.systemName === 'addClass');
  return {
    kind: 'engine-error',
    buildId,
    message,
    actionId: action.id,
    phase: 'start',
    operationSystemName: 'addClass',
    operationIndex: index,
    operationPath: [{ systemName: 'addClass', index }],
  };
}

/** 1-based line and column of the `addClass("on")` call in PROGRAM. */
const ADD_CLASS_AT = (() => {
  const before = PROGRAM.slice(0, PROGRAM.indexOf('addClass("on")')).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
})();

describe('eligian dev build identity', () => {
  const { project, write, next, buildIdOf, post, file, fileBytes, servedActions } = devProject(
    'eligian dev build identity',
    {
      'layout.html': '<div id="stage"><div id="a"></div></div>\n',
      'styles.css': '#stage {}\n#a {}\n.on { color: red; }\n',
      'main.eligian': PROGRAM,
    }
  );

  // Ruling of 2026-11-06: a CSS-only build rewrites bundle.js with new action ids, so a fresh
  // page load gets a new buildId; a page still running the old bundle keeps its own (live)
  it('a CSS-only change serves a new buildId (no reload)', async () => {
    const b1 = await buildIdOf();
    expect(b1).toMatch(UUID);
    const from = project.events.length;
    const wait = next('css');
    write('styles.css', '#stage {}\n#a {}\n.on { color: blue; }\n');
    await wait();
    expect(project.events.slice(from).map(e => e.event)).not.toContain('reload');
    const b2 = await buildIdOf();
    expect(b2).toMatch(UUID);
    expect(b2).not.toBe(b1);
  }, 20000);

  it('a program change mints a new buildId', async () => {
    const b1 = await buildIdOf();
    const wait = next('reload');
    write('main.eligian', PROGRAM.replace('0s..1s', '0s..2s'));
    await wait();
    const b2 = await buildIdOf();
    expect(b2).toMatch(UUID);
    expect(b2).not.toBe(b1);
  }, 20000);

  it('a failed build then a fixed one mints a new buildId', async () => {
    const before = await buildIdOf();
    let wait = next('build-error');
    write('main.eligian', `${PROGRAM}action loop() [ ]\n`);
    await wait();
    wait = next('reload');
    write('main.eligian', PROGRAM);
    await wait();
    const after = await buildIdOf();
    expect(after).toMatch(UUID);
    expect(after).not.toBe(before);
  }, 40000);

  /** The runtime-error lines located at PROGRAM's addClass call. */
  const addClassLines = () =>
    project.lines.filter(
      l =>
        l.startsWith('runtime error: ') &&
        l.includes(`main.eligian:${ADD_CLASS_AT.line}:${ADD_CLASS_AT.column}`)
    );

  /**
   * The action ids of the page loaded from B1. A CSS-only build rewrites bundle.js with fresh
   * ids, so the page that keeps running across it is modelled by the ids read before it.
   */
  let pageActions: ConfigAction[] = [];
  /** The buildId of that page (still live after the CSS-only build) */
  let pageBuildId = '';

  it('reports survive a CSS-only build and are located with the kept map', async () => {
    const b1 = (await buildIdOf())!;
    pageActions = await servedActions();
    pageBuildId = b1;
    const report = addClassError(pageActions, b1, 'kept');
    let from = project.lines.length;
    expect(await post(report)).toBe(204);
    expect(project.lines.slice(from)).toHaveLength(1);
    const before = file();
    expect(before.buildId).toBe(b1);
    const bytes = fileBytes();

    const wait = next('css');
    write('styles.css', '#stage {}\n#a {}\n.on { color: green; }\n');
    await wait();
    await project.server!.idle();
    const b2 = (await buildIdOf())!;
    expect(b2).not.toBe(b1);
    // The CSS build itself does not touch the file: buildId, entries and updated unchanged
    expect(fileBytes()).toEqual(bytes);
    expect(file()).toMatchObject({ buildId: b1, updated: before.updated, errors: before.errors });

    // SC-023 (4): the repeat after the CSS swap is counted, not printed
    from = project.lines.length;
    expect(await post(report)).toBe(204);
    expect(project.lines.slice(from)).toEqual([]);
    const stored = file().errors.filter(
      e => e.kind === 'engine-error' && e.message.endsWith('kept')
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      file: path.join(project.dir, 'main.eligian'),
      line: ADD_CLASS_AT.line,
      column: ADD_CLASS_AT.column,
      exact: true,
      count: 2,
    });
    expect(addClassLines().filter(l => l.includes('kept'))).toHaveLength(1);

    // A page loaded after the CSS build runs the new ids: located with the new build's map, so
    // the same report merges into the same entry (count 3) and prints nothing new
    from = project.lines.length;
    expect(await post(addClassError(await servedActions(), b2, 'kept'))).toBe(204);
    expect(project.lines.slice(from)).toEqual([]);
    const merged = file().errors.filter(
      e => e.kind === 'engine-error' && e.message.endsWith('kept')
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ line: ADD_CLASS_AT.line, exact: true, count: 3 });
  }, 30000);

  it('a reload build resets the file, drops the old buildId and prints a key again', async () => {
    const b1 = (await buildIdOf())!;
    const oldReport = addClassError(pageActions, pageBuildId, 'again');
    expect(await post(oldReport)).toBe(204);
    expect(addClassLines().filter(l => l.includes('again'))).toHaveLength(1);

    const wait = next('reload');
    write('main.eligian', PROGRAM.replace('0s..1s', '0s..3s'));
    await wait();
    await project.server!.idle();
    const b2 = (await buildIdOf())!;
    expect(b2).toMatch(UUID);
    expect(b2).not.toBe(b1);
    expect(file()).toMatchObject({ buildId: b2, errors: [] });

    const bytes = fileBytes();
    const count = project.lines.length;
    expect(await post(oldReport)).toBe(204);
    expect(fileBytes()).toEqual(bytes);
    expect(project.lines.length).toBe(count);

    // SC-023 (3): the same report from the reloaded page prints once again
    expect(await post(addClassError(await servedActions(), b2, 'again'))).toBe(204);
    expect(project.lines.slice(count)).toHaveLength(1);
    expect(addClassLines().filter(l => l.includes('again'))).toHaveLength(2);
    expect(file().errors).toEqual([
      expect.objectContaining({
        kind: 'engine-error',
        line: ADD_CLASS_AT.line,
        column: ADD_CLASS_AT.column,
        exact: true,
        count: 1,
      }),
    ]);
  }, 30000);

  it('a failed then fixed build resets the file with the new buildId', async () => {
    const before = (await buildIdOf())!;
    expect(file().errors.length).toBeGreaterThan(0);
    let wait = next('build-error');
    write('main.eligian', `${PROGRAM}action loop() [ ]\n`);
    await wait();
    await project.server!.idle();
    expect(file().errors).toEqual([expect.objectContaining({ kind: 'build-error' })]);

    wait = next('reload');
    write('main.eligian', PROGRAM);
    await wait();
    await project.server!.idle();
    const after = (await buildIdOf())!;
    expect(after).toMatch(UUID);
    expect(after).not.toBe(before);
    expect(file()).toMatchObject({ buildId: after, errors: [] });
  }, 40000);
});

describe('eligian dev build identity without a stylesheet', () => {
  const { project, write, next, buildIdOf, post, file, fileBytes } = devProject(
    'eligian dev build identity without a stylesheet',
    {
      'layout.html': '<div id="stage"><div id="a"></div></div>\n',
      'stray.css': '.on { color: red; }\n',
      // No `styles` import, so no CSS class operations either
      'main.eligian': `layout "./layout.html"
timeline "t" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") ] [ selectElement("#a") ]
}
`,
    }
  );

  // SC-019 (5), ruling of 2026-11-06 (option b): the bundler always emits a <style> block, so
  // an empty one means the program imports no stylesheet; a stray .css change then reloads
  it('a stray .css change reloads (not css) and mints a new buildId', async () => {
    const before = await buildIdOf();
    expect(before).toMatch(UUID);
    const from = project.events.length;
    const wait = next('reload');
    write('stray.css', '.on { color: blue; }\n');
    await wait();
    expect(project.events.slice(from).map(e => e.event)).not.toContain('css');
    const after = await buildIdOf();
    expect(after).toMatch(UUID);
    expect(after).not.toBe(before);
  }, 20000);

  it('after a stray .css reload the old buildId is dropped and the new one accepted', async () => {
    const before = (await buildIdOf())!;
    expect(await post({ kind: 'console-error', buildId: before, message: 'first' })).toBe(204);
    expect(file()).toMatchObject({ buildId: before, errors: [{ message: 'first' }] });

    const wait = next('reload');
    write('stray.css', '.on { color: green; }\n');
    await wait();
    await project.server!.idle();
    const after = (await buildIdOf())!;
    expect(after).not.toBe(before);
    expect(file()).toMatchObject({ buildId: after, errors: [] });

    const bytes = fileBytes();
    let count = project.lines.length;
    expect(await post({ kind: 'console-error', buildId: before, message: 'stale' })).toBe(204);
    expect(fileBytes()).toEqual(bytes);
    expect(project.lines.length).toBe(count);

    count = project.lines.length;
    expect(await post({ kind: 'console-error', buildId: after, message: 'fresh' })).toBe(204);
    expect(project.lines.slice(count)).toEqual(['console error: fresh']);
    expect(file()).toMatchObject({ buildId: after, errors: [{ message: 'fresh', count: 1 }] });
  }, 20000);
});

/** D-L2 (spec 058 FR-065): `dev` serves the bundler output, `loadJson` files included. */
describe('eligian dev on the lottie probe', () => {
  const probe = path.join(__dirname, '__fixtures__', 'lottie-probe', 'main.eligian');
  let server: DevServer;

  const get = (url: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(url, response => {
          let body = '';
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        })
        .on('error', reject);
    });

  beforeAll(async () => {
    server = await startDevServer(probe, {
      port: 0,
      debounceMs: 50,
      log: collect('eligian dev on the lottie probe'),
    });
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  it('dev serves the loadJson file with 200', async () => {
    const bundle = await get(`${server.url}bundle.js`);
    expect(bundle.status).toBe(200);
    const url = /"?url"?:\s*"([^"]*anim\.json)"/.exec(bundle.body)?.[1];
    expect(url).toBe('assets/anim.json');
    const json = await get(`${server.url}${url}`);
    expect(json.status).toBe(200);
    expect(JSON.parse(json.body).nm).toBe('probe');
  });
});

/** POST a runtime report to a dev server; resolves with the status code. */
function postRuntime(
  serverUrl: string,
  body: unknown,
  { origin, method = 'POST', raw }: { origin?: string; method?: string; raw?: string } = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      `${serverUrl}__eligian/runtime`,
      {
        method,
        headers: {
          'Content-Type': 'text/plain',
          ...(origin !== undefined ? { Origin: origin } : {}),
        },
      },
      response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      }
    );
    request.on('error', reject);
    if (method === 'GET') request.end();
    else request.end(raw ?? JSON.stringify(body));
  });
}

interface StoredError {
  readonly kind: string;
  readonly message: string;
  readonly count: number;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly exact?: boolean;
  readonly [key: string]: unknown;
}

/** `<dir>/.eligian/dev-errors.json`, parsed. */
const readDevErrors = (dir: string): { buildId: string; errors: StoredError[] } =>
  JSON.parse(fs.readFileSync(path.join(dir, '.eligian', 'dev-errors.json'), 'utf8'));

interface ConfigAction {
  readonly id: string;
  readonly startOperations: readonly { systemName: string }[];
}

/**
 * Spec 058 phase 4 (FR-014, FR-017, FR-018, FR-037, FR-038, FR-040): `POST /__eligian/runtime`,
 * the located terminal lines and `.eligian/dev-errors.json`.
 */
describe('eligian dev runtime reports', () => {
  const fixture = path.join(__dirname, '__fixtures__', 'dev-runtime-error');
  let dir: string;
  let entry: string;
  let server: DevServer;
  let origin: string;
  let buildId: string;
  let source: string;
  let onEnter: ConfigAction;
  let boomIndex: number;
  let boomAt: { line: number; column: number };
  const lines: string[] = [];
  const events: string[] = [];
  let stream: http.ClientRequest | undefined;

  const get = (url: string) =>
    new Promise<string>((resolve, reject) => {
      http
        .get(url, response => {
          let body = '';
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () => resolve(body));
        })
        .on('error', reject);
    });
  const buildIdOf = async () => /data-build-id="([^"]+)"/.exec(await get(server.url))?.[1] ?? '';
  const post = (body: unknown, options?: { origin?: string; method?: string; raw?: string }) =>
    postRuntime(server.url, body, options);
  const file = () => readDevErrors(dir);
  const eligianDir = () => path.join(dir, '.eligian');
  const next = (event: string) => {
    const from = events.length;
    return () =>
      vi.waitFor(() => expect(events.slice(from)).toContain(event), {
        timeout: 15000,
        interval: 50,
      });
  };
  const engineError = (overrides: Record<string, unknown> = {}) => ({
    kind: 'engine-error',
    buildId,
    message: 'boom',
    actionId: onEnter.id,
    phase: 'start',
    operationSystemName: onEnter.startOperations[boomIndex].systemName,
    operationIndex: boomIndex,
    operationPath: [
      { systemName: onEnter.startOperations[boomIndex].systemName, index: boomIndex },
    ],
    timelineUri: 'Intro',
    position: 0,
    ...overrides,
  });

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-dev-runtime-'));
    fs.cpSync(fixture, dir, { recursive: true });
    // The user's own root .gitignore (SC-022 (3)), present before the server starts
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    entry = path.join(dir, 'main.eligian');
    source = fs.readFileSync(entry, 'utf8');
    // The call in the enter block, not the `extensions` declaration
    const call = source.indexOf('boom()', source.indexOf('on enter'));
    const before = source.slice(0, call).split('\n');
    boomAt = { line: before.length, column: before[before.length - 1].length + 1 };

    server = await startDevServer(entry, {
      port: 0,
      debounceMs: 50,
      log: line => lines.push(line),
    });
    origin = server.url.replace(/\/$/, '');
    buildId = await buildIdOf();
    await new Promise<void>(resolve => {
      stream = http.get(`${server.url}__eligian/events`, response => {
        let buffer = '';
        response.on('data', chunk => {
          buffer += chunk;
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = /^event: (.+)$/m.exec(block)?.[1];
            if (event) events.push(event);
          }
        });
        resolve();
      });
    });

    // The served build's own CONFIG: the bundle evaluated in a fresh window, not started
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    stubMissingBrowserApis(dom.window as unknown as Window & typeof globalThis);
    dom.window.eval(await get(`${server.url}bundle.js`));
    const config = (
      dom.window as unknown as {
        EligiusBundled: { CONFIG: { timelines: { timelineActions: ConfigAction[] }[] } };
      }
    ).EligiusBundled.CONFIG;
    const actions = config.timelines.flatMap(t => t.timelineActions);
    onEnter = actions.find(a => a.startOperations.some(op => op.systemName === 'boom'))!;
    boomIndex = onEnter.startOperations.findIndex(op => op.systemName === 'boom');
    dom.window.close();
  }, 60000);

  afterAll(async () => {
    stream?.destroy();
    await server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('status codes: 403 foreign origin, 400 malformed, 204 accepted', async () => {
    expect(buildId).toMatch(UUID);
    const valid = { kind: 'console-error', buildId, message: 'origin ok' };
    expect(await post(valid, { origin: 'http://evil.example' })).toBe(403);
    expect(fs.existsSync(eligianDir())).toBe(false);

    expect(await post(undefined, { method: 'GET', origin })).toBe(400);
    const empty = JSON.stringify({ kind: 'console-error', buildId, message: '' });
    const oversized = JSON.stringify({
      kind: 'console-error',
      buildId,
      message: 'x'.repeat(MAX_BODY_BYTES + 1 - empty.length),
    });
    expect(Buffer.byteLength(oversized)).toBe(MAX_BODY_BYTES + 1);
    expect(await post(undefined, { raw: oversized, origin })).toBe(400);
    expect(await post(undefined, { raw: '{', origin })).toBe(400);
    expect(await post({ kind: 'nope', buildId, message: 'x' }, { origin })).toBe(400);
    expect(await post({ kind: 'console-error', message: 'x' }, { origin })).toBe(400);
    expect(fs.existsSync(eligianDir())).toBe(false);
    expect(lines.filter(l => l.startsWith('console error:'))).toEqual([]);

    expect(await post(valid, { origin })).toBe(204);
    expect(await post({ ...valid, message: 'no origin' })).toBe(204);
    expect(file().errors.map(e => e.message)).toEqual(['origin ok', 'no origin']);
  });

  it('the first accepted report creates the self-ignoring .eligian/', () => {
    expect(fs.readFileSync(path.join(eligianDir(), '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('a stale buildId gets 204 and changes nothing', async () => {
    const bytes = fs.readFileSync(path.join(eligianDir(), 'dev-errors.json'));
    const count = lines.length;
    expect(await post(engineError({ buildId: 'old' }), { origin })).toBe(204);
    expect(await post({ kind: 'console-error', buildId: 'old', message: 'stale' })).toBe(204);
    expect(fs.readFileSync(path.join(eligianDir(), 'dev-errors.json'))).toEqual(bytes);
    expect(lines.length).toBe(count);
  });

  it('an engine error is located at the boom() call', async () => {
    const from = lines.length;
    expect(await post(engineError(), { origin })).toBe(204);
    const added = lines.slice(from);
    expect(added).toHaveLength(1);
    expect(added[0]).toContain('runtime error: ');
    expect(added[0]).toContain('boom');
    expect(added[0]).toContain(`main.eligian:${boomAt.line}:${boomAt.column}`);
    expect(added[0].endsWith('(timeline Intro at 0s)')).toBe(true);
    const stored = file().errors.filter(e => e.kind === 'engine-error');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      file: path.join(dir, 'main.eligian'),
      line: boomAt.line,
      column: boomAt.column,
      exact: true,
      count: 1,
    });
    expect(stored[0]).not.toHaveProperty('endLine');
    expect(stored[0]).not.toHaveProperty('endColumn');
  });

  it('an unknown action has no source location', async () => {
    const from = lines.length;
    const {
      timelineUri: _uri,
      position: _position,
      ...report
    } = engineError({
      actionId: 'not-an-id',
      message: 'lost',
    });
    expect(await post(report, { origin })).toBe(204);
    const added = lines.slice(from);
    expect(added).toHaveLength(1);
    expect(added[0].startsWith('runtime error: ')).toBe(true);
    expect(added[0].endsWith('(no source location)')).toBe(true);
  });

  it('page kinds print their prefix and are stored without a location', async () => {
    const from = lines.length;
    const reports = [
      { kind: 'console-error', message: 'x', line: 'console error: x' },
      { kind: 'console-warn', message: 'w', line: 'console warning: w' },
      { kind: 'window-error', message: 'pe', line: 'page error: pe' },
      { kind: 'unhandled-rejection', message: 'ur', line: 'unhandled rejection: ur' },
    ];
    for (const { kind, message } of reports) {
      expect(await post({ kind, buildId, message }, { origin })).toBe(204);
    }
    expect(lines.slice(from)).toEqual(reports.map(r => r.line));
    for (const { kind, message } of reports) {
      const stored = file().errors.filter(e => e.kind === kind && e.message === message);
      expect(stored).toHaveLength(1);
      expect(stored[0]).not.toHaveProperty('file');
      expect(stored[0]).not.toHaveProperty('line');
      expect(stored[0]).not.toHaveProperty('column');
    }
  });

  it('a selector miss is located at the selectElement smoke reports', async () => {
    const compiled = await compileFile(entry);
    const at = inFile(selectorLocation(compiled.config, compiled.map, '#a'), compiled.map);
    expect(at).toBeDefined();
    const miss = (selector: string) => ({
      kind: 'selector-miss',
      buildId,
      selector,
      message: `selector '${selector}' wasn't found!`,
    });
    let from = lines.length;
    expect(await post(miss('#a'), { origin })).toBe(204);
    expect(lines.slice(from)).toHaveLength(1);
    expect(lines[from]).toContain('selectElement("#a") matched no element');
    expect(lines[from]).toContain(`main.eligian:${at?.line}:${at?.column}`);
    expect(file().errors.filter(e => e.kind === 'selector-miss')).toEqual([
      expect.objectContaining({ file: at?.file, line: at?.line, column: at?.column }),
    ]);

    from = lines.length;
    expect(await post(miss('#nowhere'), { origin })).toBe(204);
    expect(lines.slice(from)).toEqual(['selectElement("#nowhere") matched no element']);
    expect(file().errors.filter(e => e.kind === 'selector-miss')[1]).not.toHaveProperty('file');
  });

  it('repeats print once and are counted', async () => {
    let from = lines.length;
    const repeat = engineError({ message: 'repeat' });
    for (let i = 0; i < 20; i++) expect(await post(repeat, { origin })).toBe(204);
    expect(lines.slice(from)).toHaveLength(1);
    const [stored] = file().errors.filter(
      e => e.kind === 'engine-error' && e.message.endsWith('repeat') && e.exact === true
    );
    expect(stored.count).toBe(20);

    // The same message at another location
    from = lines.length;
    const elsewhere = engineError({
      message: 'repeat',
      operationIndex: boomIndex + 1,
      operationPath: [{ systemName: 'boom', index: boomIndex + 1 }],
    });
    expect(await post(elsewhere, { origin })).toBe(204);
    expect(lines.slice(from)).toHaveLength(1);

    // The same message with another kind
    from = lines.length;
    const sameMessage = { kind: 'console-error', buildId, message: stored.message };
    expect(await post(sameMessage, { origin })).toBe(204);
    expect(lines.slice(from)).toEqual([`console error: ${stored.message}`]);

    // Past the client's cap of 50
    from = lines.length;
    for (let i = 0; i < 120; i++) {
      expect(await post({ kind: 'console-error', buildId, message: 'many' }, { origin })).toBe(204);
    }
    expect(lines.slice(from)).toEqual(['console error: many']);
    const many = file().errors.filter(e => e.message === 'many');
    expect(many).toHaveLength(1);
    expect(many[0].count).toBe(120);
  }, 60000);

  it('bursts are serialized, atomic and capped at 100 entries', async () => {
    io.calls.length = 0;
    io.maxInFlight = 0;
    const target = path.join(eligianDir(), 'dev-errors.json');
    const parseErrors: unknown[] = [];
    let reads = 0;
    const reader = setInterval(() => {
      try {
        JSON.parse(fs.readFileSync(target, 'utf8'));
        reads++;
      } catch (error) {
        if (error instanceof SyntaxError) parseErrors.push(error);
      }
    }, 5);
    try {
      const same = { kind: 'console-error', buildId, message: 'burst' };
      const identical = await Promise.all(Array.from({ length: 20 }, () => post(same, { origin })));
      expect(identical).toEqual(Array(20).fill(204));
      const burst = file().errors.filter(e => e.message === 'burst');
      expect(burst).toHaveLength(1);
      expect(burst[0].count).toBe(20);

      const before = file().errors.length;
      const distinct = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          post({ kind: 'console-error', buildId, message: `distinct ${i}` }, { origin })
        )
      );
      expect(distinct).toEqual(Array(20).fill(204));
      expect(file().errors.length).toBe(Math.min(100, before + 20));
      expect(file().errors.filter(e => e.message.startsWith('distinct '))).toHaveLength(20);

      const capped = await Promise.all(
        Array.from({ length: 120 }, (_, i) =>
          post({ kind: 'console-error', buildId, message: `cap ${i}` }, { origin })
        )
      );
      expect(capped).toEqual(Array(120).fill(204));
      const errors = file().errors;
      expect(errors).toHaveLength(100);
      // Every older entry and the first 20 of the 120 were dropped
      expect(errors.every(e => e.message.startsWith('cap '))).toBe(true);
    } finally {
      clearInterval(reader);
    }
    expect(parseErrors).toEqual([]);
    expect(reads).toBeGreaterThan(0);

    const renames = io.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.startsWith('rename ') && call.endsWith(` ${target}`));
    expect(renames.length).toBeGreaterThanOrEqual(20);
    for (const { call, index } of renames) {
      const from = call.slice('rename '.length, call.length - ` ${target}`.length);
      expect(path.dirname(from)).toBe(eligianDir());
      expect(from.endsWith('.tmp')).toBe(true);
      expect(io.calls.slice(0, index)).toContain(`write ${from}`);
    }
    expect(io.maxInFlight).toBe(1);
  }, 60000);

  it('an existing .eligian/.gitignore and the root .gitignore stay byte-identical', async () => {
    fs.rmSync(eligianDir(), { recursive: true, force: true });
    fs.mkdirSync(eligianDir());
    fs.writeFileSync(path.join(eligianDir(), '.gitignore'), 'keep\n');
    expect(await post({ kind: 'console-error', buildId, message: 'kept' }, { origin })).toBe(204);
    expect(fs.existsSync(path.join(eligianDir(), 'dev-errors.json'))).toBe(true);
    expect(fs.readFileSync(path.join(eligianDir(), '.gitignore'), 'utf8')).toBe('keep\n');
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n');
  });

  it('a rebuild resets the file; a failed build holds the build error', async () => {
    expect(file().errors.length).toBeGreaterThan(0);
    let wait = next('reload');
    fs.writeFileSync(entry, source.replace('0s..1s', '0s..2s'));
    await wait();
    await server.idle();
    const b2 = await buildIdOf();
    expect(b2).not.toBe(buildId);
    expect(file()).toMatchObject({ buildId: b2, errors: [] });

    wait = next('build-error');
    fs.writeFileSync(entry, `${source}action loop() [ ]\n`);
    await wait();
    await server.idle();
    const broken = file();
    expect(broken.errors).toHaveLength(1);
    expect(broken.errors[0]).toMatchObject({ kind: 'build-error' });
    expect(broken.errors[0].message).toContain("'loop' is a keyword");
    const bytes = fs.readFileSync(path.join(eligianDir(), 'dev-errors.json'));
    const count = lines.length;
    const whileBroken = { kind: 'console-error', buildId: b2, message: 'broken' };
    expect(await post(whileBroken, { origin })).toBe(204);
    expect(fs.readFileSync(path.join(eligianDir(), 'dev-errors.json'))).toEqual(bytes);
    expect(lines.length).toBe(count);

    wait = next('reload');
    fs.writeFileSync(entry, source);
    await wait();
    await server.idle();
    const b3 = await buildIdOf();
    expect(b3).not.toBe(b2);
    expect(file()).toMatchObject({ buildId: b3, errors: [] });
  }, 60000);

  it('end to end: the real engine, hook and client report boom located', async () => {
    const indexHtml = await get(server.url);
    const clientText = await get(`${server.url}__eligian/client.js`);
    const bundleText = await get(`${server.url}bundle.js`);
    const from = lines.length;
    const beacons: string[] = [];
    const dom = new JSDOM(indexHtml, {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: server.url,
    });
    try {
      const window = dom.window as unknown as Window & typeof globalThis;
      // jsdom fires its own DOMContentLoaded after construction; the bundle is evaluated
      // after it so the manual dispatch below runs `init` once (as bundle-dev-hook.spec.ts)
      if (window.document.readyState === 'loading') {
        await new Promise(resolve =>
          window.document.addEventListener('DOMContentLoaded', resolve, { once: true })
        );
      }
      stubMissingBrowserApis(window);
      (dom.window as unknown as { EventSource: unknown }).EventSource =
        createFakeEventSource().FakeEventSource;
      (
        dom.window.navigator as unknown as { sendBeacon: (url: unknown, body: unknown) => boolean }
      ).sendBeacon = (url, body) => {
        beacons.push(new URL(String(url), server.url).pathname);
        void postRuntime(server.url, undefined, {
          raw: String(body),
          origin: new URL(server.url).origin,
        });
        return true;
      };
      expect(() => dom.window.eval(clientText)).not.toThrow();
      dom.window.eval(bundleText);
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

      const at = `main.eligian:${boomAt.line}:${boomAt.column}`;
      await vi.waitFor(
        () => expect(lines.slice(from).some(l => l.includes('boom') && l.includes(at))).toBe(true),
        { timeout: 15000 }
      );
      // the line is printed before the queued dev-errors.json write lands (dev-server.ts accept)
      await server.idle();
      expect(new Set(beacons)).toEqual(new Set(['/__eligian/runtime']));
      expect(file().errors.filter(e => e.kind === 'engine-error')).toContainEqual(
        expect.objectContaining({
          file: path.join(dir, 'main.eligian'),
          line: boomAt.line,
          column: boomAt.column,
          exact: true,
        })
      );
    } finally {
      dom.window.close();
    }
  }, 60000);
});
