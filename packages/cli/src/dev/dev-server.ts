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
import { createHash } from 'node:crypto';
import { existsSync, type FSWatcher, watch } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { Cause, Effect, Exit, Option } from 'effect';
import { BundleCompileError, createBundle } from '../bundler/index.js';
import { AssetError, CompilationError, ParseError } from '../compile-file.js';
import { DEV_CLIENT_SCRIPT } from './client-runtime.js';

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
const IGNORED = /(^|[\\/])(node_modules|\.git|[^\\/]+\.bundle)([\\/]|$)|~$|\.swp$/;

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
      lastError = describeFailure(exit.cause);
      log(`${what}build failed (${time}):\n${indent(lastError)}`);
      send('build-error', { message: lastError });
      return;
    }
    const recovered = lastError !== undefined;
    lastError = undefined;
    if (first) {
      log(`built in ${time}`);
      return;
    }
    const cssOnly = !recovered && changed.length > 0 && changed.every(f => f.endsWith('.css'));
    if (cssOnly) {
      const css = styleOf(await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8'));
      if (css !== undefined) {
        log(`${what}rebuilt in ${time}, styles swapped`);
        send('css', { css });
        return;
      }
    }
    log(
      `${what}rebuilt in ${time}, reloading ${clients.size} page${clients.size === 1 ? '' : 's'}`
    );
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
      response.end(withClient(html));
      return;
    }
    await serveFile(file, request, response);
  };

  const port = await listen(server, options.port);
  const url = `http://localhost:${port}/`;
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
    },
    close: async () => {
      clearInterval(keepAlive);
      if (timer) clearTimeout(timer);
      watcher?.close();
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await building;
    },
  };
}

/** The bundle's index.html with the dev client before </body>. */
export function withClient(html: string): string {
  const tag = `<script src="${CLIENT_PATH}"></script>`;
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
