/**
 * `eligian dev <entry> [--port] [--open]` (audit idea #23): the presentation
 * in a real browser, rebuilt when its files change.
 *
 * - Builds with the regular bundler (createBundle) into a temporary
 *   directory, and again (debounced) when a file under the entry's directory
 *   changes: the program, libraries, layout, styles, locales, media.
 * - Serves that directory over node:http, with the dev client
 *   (client-runtime.ts) added to index.html and server-sent events at
 *   `/__eligian/events`: `reload` (the page reloads and resumes at its
 *   timeline and position), `css` (only stylesheets changed: swapped in
 *   place), `build-error` (an overlay with the message), `ok`.
 * - Media files are served with Range support, so video can seek.
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, type FSWatcher, watch } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { type EligianMap, locateEngineError } from '@eligian/language';
import { Cause, Effect, Exit, Option } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { BundleCompileError, type BundleResult, createBundle } from '../bundler/index.js';
import { AssetError, CompilationError, ParseError } from '../compile-file.js';
import { engineErrorText, inFile, selectorLocation } from '../smoke/engine-error-format.js';
import { DEV_CLIENT_SCRIPT } from './client-runtime.js';
import {
  addError,
  type DevError,
  type DevErrorsFile,
  ensureEligianDir,
  MAX_BODY_BYTES,
  mergeKey,
  type PageErrorReport,
  parseRuntimeReport,
  type RuntimeReport,
  writeDevErrors,
} from './runtime-reports.js';

export interface DevServerOptions {
  /** First port to try (the next ones are tried when it is taken) */
  readonly port: number;
  /** Open the presentation in the default browser */
  readonly open?: boolean;
  /** Progress lines (rebuilds, errors) */
  readonly log?: (line: string) => void;
  /** Wait this long after the last change before rebuilding (ms) */
  readonly debounceMs?: number;
}

export interface DevServer {
  readonly url: string;
  /** Wait for the build in progress (tests) */
  readonly idle: () => Promise<void>;
  readonly close: () => Promise<void>;
}

const CLIENT_PATH = '/__eligian/client.js';
const EVENTS_PATH = '/__eligian/events';
/** The dev client posts its runtime reports here (FR-014) */
const RUNTIME_PATH = '/__eligian/runtime';
/** The most builds kept for locating reports between two reloads (CSS-only builds) */
const MAX_LIVE_BUILDS = 20;

/** The build the browsers run: its identity, and the map and config its reports are located with */
interface CurrentBuild {
  readonly buildId: string;
  readonly map: EligianMap;
  readonly config: IEngineConfiguration;
}

type NewDevError = Omit<DevError, 'count' | 'first' | 'last'>;

/** The terminal prefixes of the page kinds (FR-017, FR-040) */
const PAGE_PREFIX: Record<PageErrorReport['kind'], string> = {
  'console-error': 'console error: ',
  'console-warn': 'console warning: ',
  'window-error': 'page error: ',
  'unhandled-rejection': 'unhandled rejection: ',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Directories whose changes never affect the presentation. */
const IGNORED = /(^|[\\/])(node_modules|\.git|\.eligian|[^\\/]+\.bundle)([\\/]|$)|~$|\.swp$/;

export async function startDevServer(entry: string, options: DevServerOptions): Promise<DevServer> {
  const log = options.log ?? (() => {});
  const input = path.resolve(entry);
  const root = path.dirname(input);
  const outputDir = path.join(
    os.tmpdir(),
    `eligian-dev-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
  );
  const clients = new Set<http.ServerResponse>();
  let lastError: string | undefined;
  let building: Promise<void> = Promise.resolve();
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The build a fresh page load gets (FR-033): undefined while the last build failed. */
  let current: CurrentBuild | undefined;
  /**
   * Every build a page may still be running, by buildId: the last reload build plus the CSS-only
   * builds after it (ruling of 2026-11-06). A CSS-only build rewrites bundle.js with new action
   * ids, so a page loaded before it keeps the old ids and one loaded after it gets the new ones;
   * each report is located with the map of its own build. Cleared by a reload build or a failure.
   */
  const live = new Map<string, CurrentBuild>();
  /** The last identity minted; served while no build is current. */
  let lastBuildId = randomUUID();
  /** Merge keys of the runtime lines printed for the current build (FR-038). */
  const printed = new Set<string>();
  /** What `.eligian/dev-errors.json` holds (FR-018); undefined until written. */
  let devErrors: DevErrorsFile | undefined;
  const devErrorsPath = path.join(root, '.eligian', 'dev-errors.json');
  /** The write queue (FR-018); opened once the server listens, so the file has its url. */
  let openWrites: () => void = () => {};
  let writes = new Promise<void>(resolve => {
    openWrites = resolve;
  });

  const emptyFile = (buildId: string): DevErrorsFile => ({
    version: 1,
    entry: input,
    url,
    buildId,
    updated: new Date().toISOString(),
    errors: [],
  });

  /**
   * Queue a read-merge-write of dev-errors.json: each update sees the previous one's result, and
   * no two writes overlap. With `onlyIfExists`, a missing file stays missing (P12).
   */
  const enqueue = (
    update: (file: DevErrorsFile | undefined) => DevErrorsFile,
    onlyIfExists = false
  ): Promise<void> => {
    writes = writes
      .then(async () => {
        if (onlyIfExists && !existsSync(devErrorsPath)) {
          devErrors = undefined;
          return;
        }
        const dir = await ensureEligianDir(root);
        const next = update(devErrors);
        // In memory first: a write that fails (a Windows rename onto a file another process holds,
        // see writeDevErrors) loses nothing, the next write carries it
        devErrors = next;
        await writeDevErrors(dir, next);
      })
      .catch(error =>
        log(
          `cannot write .eligian/dev-errors.json: ${error instanceof Error ? error.message : error}`
        )
      );
    return writes;
  };

  /** Serve a new identity; pages still running the earlier live builds keep theirs. */
  const serve = (result: BundleResult) => {
    const buildId = randomUUID();
    lastBuildId = buildId;
    current = { buildId, map: result.map, config: result.config };
    live.set(buildId, current);
    // Only CSS-only builds accumulate between reloads; keep the most recent ones
    if (live.size > MAX_LIVE_BUILDS) live.delete(live.keys().next().value as string);
  };

  /** A new identity for a build the browsers will load (the first one, or a reload). */
  const adopt = (result: BundleResult) => {
    live.clear();
    serve(result);
    printed.clear();
    const { buildId } = current!;
    // FR-018: reset an existing file only; the directory appears with the first error (P12)
    void enqueue(() => emptyFile(buildId), true);
  };

  /** Print a report's line (first occurrence per build, FR-038) and merge it into the file. */
  const accept = (report: RuntimeReport, build: CurrentBuild): Promise<void> => {
    const { line, error } = describeReport(report, build, root);
    const key = mergeKey(error);
    if (!printed.has(key)) {
      printed.add(key);
      log(line);
    }
    return enqueue(file =>
      addError(file ?? emptyFile(build.buildId), error, new Date().toISOString())
    );
  };

  const send = (event: string, data: unknown = {}) => {
    for (const client of clients)
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  /** Build; on success tell the browsers how to apply it (unless this is the first build). */
  const build = async (changed: readonly string[], first = false) => {
    const started = Date.now();
    const exit = await Effect.runPromiseExit(
      createBundle(input, { outputDir, force: true, sourcemap: true })
    );
    const time = `${Date.now() - started}ms`;
    const what =
      changed.length > 0 ? `${changed.map(f => path.relative(root, f)).join(', ')} changed → ` : '';
    if (Exit.isFailure(exit)) {
      // P13: no page runs this build, so runtime reports are dropped until the next success
      current = undefined;
      live.clear();
      const message = describeFailure(exit.cause);
      lastError = message;
      const buildId = lastBuildId;
      void enqueue(() => {
        const now = new Date().toISOString();
        const buildError: DevError = {
          kind: 'build-error',
          message,
          count: 1,
          first: now,
          last: now,
        };
        return { ...emptyFile(buildId), updated: now, errors: [buildError] };
      });
      log(`${what}build failed (${time}):\n${indent(lastError)}`);
      send('build-error', { message: lastError });
      return;
    }
    const recovered = lastError !== undefined;
    lastError = undefined;
    if (first) {
      adopt(exit.value);
      log(`built in ${time}`);
      return;
    }
    const cssOnly = !recovered && changed.length > 0 && changed.every(f => f.endsWith('.css'));
    if (cssOnly) {
      const css = styleOf(await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8'));
      // The bundle always has a <style>; an empty one means the program imports no stylesheet
      if (css !== undefined && css.trim() !== '') {
        // A fresh page load gets the new bundle and its ids; the file and printed lines stay
        serve(exit.value);
        log(`${what}rebuilt in ${time}, styles swapped`);
        send('css', { css });
        return;
      }
    }
    log(
      `${what}rebuilt in ${time}, reloading ${clients.size} page${clients.size === 1 ? '' : 's'}`
    );
    adopt(exit.value);
    send('reload');
  };

  const schedule = (file: string) => {
    pending.add(file);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // Editors and sed write short-lived temp files (`sedgFM5aS`, no extension): not changes
      const changed = [...pending].filter(file => existsSync(file) || path.extname(file) !== '');
      pending = new Set();
      if (changed.length === 0) return;
      // A crash in one rebuild must not stop the later ones
      building = building
        .then(() => build(changed))
        .catch(error => log(`rebuild failed: ${error instanceof Error ? error.message : error}`));
    }, options.debounceMs ?? 120);
  };

  building = build([], true);
  await building;

  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(root, { recursive: true }, (_event, file) => {
      if (!file || IGNORED.test(file)) return;
      schedule(path.join(root, file.toString()));
    });
  } catch (error) {
    log(`cannot watch ${root}: ${error instanceof Error ? error.message : error}`);
  }

  const server = http.createServer((request, response) => {
    void handle(request, response).catch(error => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });

  const handle = async (request: http.IncomingMessage, response: http.ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === EVENTS_PATH) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.write('retry: 1000\n\n');
      clients.add(response);
      if (lastError !== undefined) {
        response.write(`event: build-error\ndata: ${JSON.stringify({ message: lastError })}\n\n`);
      }
      request.on('close', () => clients.delete(response));
      return;
    }
    if (url.pathname === RUNTIME_PATH) {
      response.writeHead(await runtimeStatus(request)).end();
      return;
    }
    if (url.pathname === CLIENT_PATH) {
      response.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      response.end(DEV_CLIENT_SCRIPT);
      return;
    }
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(outputDir, `.${pathname}`);
    if (file !== outputDir && !file.startsWith(outputDir + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (pathname === '/index.html') {
      const html = await fs
        .readFile(file, 'utf-8')
        .catch(
          () => '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>'
        );
      response.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      response.end(withClient(html, current?.buildId ?? lastBuildId));
      return;
    }
    await serveFile(file, request, response);
  };

  /**
   * `POST /__eligian/runtime` (FR-014): 403 for a foreign origin, 400 for anything malformed,
   * 204 for a report of another build (dropped) and, once written (P17), for an accepted one.
   */
  const runtimeStatus = async (request: http.IncomingMessage): Promise<number> => {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== `http://localhost:${port}`) return 403;
    if (request.method !== 'POST') return 400;
    const body = await readBody(request, MAX_BODY_BYTES);
    const report = body === undefined ? undefined : parseRuntimeReport(parseJson(body));
    if (report === undefined) return 400;
    const build = live.get(report.buildId);
    if (build === undefined) return 204;
    await accept(report, build);
    return 204;
  };

  const port = await listen(server, options.port);
  const url = `http://localhost:${port}/`;
  openWrites();
  const keepAlive = setInterval(() => {
    for (const client of clients) client.write(': keep-alive\n\n');
  }, 15000);
  if (options.open) openBrowser(url);

  return {
    url,
    idle: async () => {
      // A change may still be waiting for the debounce
      while (timer && pending.size > 0) await new Promise(r => setTimeout(r, 20));
      await building;
      await writes;
    },
    close: async () => {
      clearInterval(keepAlive);
      if (timer) clearTimeout(timer);
      watcher?.close();
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await building;
      await writes;
    },
  };
}

/** The bundle's index.html with the dev client before </body>, carrying the build's id when given. */
export function withClient(html: string, buildId?: string): string {
  const id = buildId === undefined ? '' : ` data-build-id="${buildId}"`;
  const tag = `<script src="${CLIENT_PATH}"${id}></script>`;
  return html.includes('</body>') ? html.replace('</body>', `  ${tag}\n</body>`) : `${html}${tag}`;
}

/** The CSS of the bundle's index.html (its <style> element). */
export function styleOf(html: string): string | undefined {
  return /<style>\n?([\s\S]*?)\n?\s*<\/style>/.exec(html)?.[1];
}

/** A build failure as plain text: messages, code snippets and hints. */
export function describeFailure(cause: Cause.Cause<unknown>): string {
  const failure = Cause.findErrorOption(cause);
  if (Option.isNone(failure)) return Cause.pretty(cause);
  const error =
    failure.value instanceof BundleCompileError ? failure.value.compileError : failure.value;
  if (error instanceof ParseError || error instanceof CompilationError) {
    return error.formatted
      .map(e =>
        [e.message, e.codeSnippet, e.hint ? `Hint: ${e.hint}` : undefined]
          .filter(Boolean)
          .join('\n\n')
      )
      .join('\n\n');
  }
  if (error instanceof AssetError) {
    return error.errors
      .map(
        e =>
          `${e.message}\n  ${e.sourceLocation.file}:${e.sourceLocation.line}:${e.sourceLocation.column}`
      )
      .join('\n');
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * A runtime report's terminal line and dev-errors.json entry (FR-017, FR-040): engine errors in
 * smoke's words, located with the build's map; selector misses at their `selectElement`; the
 * page kinds with their prefix and no location. The line has paths relative to `root`, the
 * entry absolute ones.
 */
function describeReport(
  report: RuntimeReport,
  build: CurrentBuild,
  root: string
): { line: string; error: NewDevError } {
  const at = (location: { file: string; line: number; column: number } | undefined) =>
    location ? ` at ${path.relative(root, location.file)}:${location.line}:${location.column}` : '';
  if (report.kind === 'engine-error') {
    const located = locateEngineError(build.map, {
      actionId: report.actionId,
      phase: report.phase,
      operationSystemName: report.operationSystemName,
      operationIndex: report.operationIndex,
      operationPath: report.operationPath,
    });
    const location = inFile(located?.location, build.map);
    const message = engineErrorText(
      {
        message: report.message,
        phase: report.phase,
        operationSystemName: report.operationSystemName,
      },
      located,
      build.map
    );
    const timeline =
      report.timelineUri !== undefined && report.position !== undefined
        ? ` (timeline ${report.timelineUri} at ${report.position}s)`
        : '';
    const alternatives = located?.alternatives.flatMap(alternative => {
      const where = inFile(alternative.operation.location, build.map);
      return where
        ? [{ file: where.file, line: where.line, column: where.column, via: alternative.via }]
        : [];
    });
    return {
      line: `runtime error: ${message}${location ? at(location) : ' (no source location)'}${timeline}`,
      error: {
        kind: 'engine-error',
        message,
        file: location?.file,
        line: location?.line,
        column: location?.column,
        timeline: report.timelineUri,
        position: report.position,
        action: located?.action.name ?? report.actionName,
        operation: located?.operation?.systemName ?? report.operationSystemName,
        via: located?.via,
        exact: located?.exact,
        alternatives: alternatives && alternatives.length > 0 ? alternatives : undefined,
      },
    };
  }
  if (report.kind === 'selector-miss') {
    const location = inFile(selectorLocation(build.config, build.map, report.selector), build.map);
    const message = `selectElement("${report.selector}") matched no element`;
    return {
      line: `${message}${at(location)}`,
      error: {
        kind: 'selector-miss',
        message,
        file: location?.file,
        line: location?.line,
        column: location?.column,
      },
    };
  }
  return {
    line: `${PAGE_PREFIX[report.kind]}${report.message}`,
    error: { kind: report.kind, message: report.message },
  };
}

/** A request body as text, or undefined once it passes `limit` bytes (the rest is discarded). */
function readBody(request: http.IncomingMessage, limit: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        request.off('data', onData);
        request.resume();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    };
    request.on('data', onData);
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function serveFile(
  file: string,
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) {
    response.writeHead(404, { 'Content-Type': MIME['.txt'] }).end('Not found');
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  const handle = await fs.open(file);
  try {
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      const buffer = Buffer.alloc(end - start + 1);
      await handle.read(buffer, 0, buffer.length, start);
      response.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
      });
      response.end(buffer);
      return;
    }
    response.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    response.end(await handle.readFile());
  } finally {
    await handle.close();
  }
}

/** Listen on `port`, or the next free one (up to 10 further). */
function listen(server: http.Server, port: number, attempts = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (candidate: number, left: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        if (error.code === 'EADDRINUSE' && left > 0) tryPort(candidate + 1, left - 1);
        else reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : candidate);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(candidate, 'localhost');
    };
    tryPort(port, attempts);
  });
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

const indent = (text: string) =>
  text
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
