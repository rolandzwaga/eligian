/**
 * Worker thread that bundles a host module for the preview (audit idea #24).
 *
 * esbuild-wasm's Node API starts its service by spawning `node`, which a VS
 * Code user may not have; its browser build runs the WebAssembly in this
 * process instead. That build expects a browser global (`self`) and has no
 * file system, so it runs here, in a worker of its own (the globals stay out
 * of the shared extension host), with a plugin that resolves and reads files:
 * relative paths with TypeScript / JavaScript extensions, and npm packages
 * through Node's resolution from the importing file.
 *
 * Messages: `{ id, entry }` in, `{ id, code }` or `{ id, errors }` out.
 */
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

(globalThis as Record<string, unknown>).self = globalThis;

type Esbuild = typeof import('esbuild-wasm');

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '/index.ts', '/index.js'];
const LOADERS: Record<string, 'ts' | 'tsx' | 'js' | 'jsx' | 'json' | 'css'> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
};
/** A namespace of our own: the browser build only accepts POSIX paths in 'file'. */
const NAMESPACE = 'eligian-host';

let ready: Promise<Esbuild> | undefined;

function esbuild(): Promise<Esbuild> {
  ready ??= (async () => {
    const api = (await import('esbuild-wasm/lib/browser.js')) as unknown as Esbuild & {
      default?: Esbuild;
    };
    const module = api.default ?? api;
    const wasmModule = await WebAssembly.compile(fs.readFileSync(workerData.wasmPath as string));
    await module.initialize({ wasmModule, worker: false });
    return module;
  })();
  return ready;
}

function resolveFile(base: string): string | undefined {
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return undefined;
}

async function bundle(entry: string): Promise<{ code: string } | { errors: string[] }> {
  const api = await esbuild();
  try {
    const result = await api.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'eligian-host-fs',
          setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
              // From the importer's own path (as returned below): the browser build
              // reports resolveDir POSIX-style ('/C:\\…') on Windows
              const from = args.importer ? path.dirname(args.importer) : path.dirname(entry);
              if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
                const file = resolveFile(path.resolve(from, args.path));
                return file
                  ? { path: file, namespace: NAMESPACE }
                  : { errors: [{ text: `Cannot find '${args.path}' (from ${from})` }] };
              }
              try {
                const file = createRequire(path.join(from, 'index.js')).resolve(args.path);
                return { path: file, namespace: NAMESPACE };
              } catch {
                return { errors: [{ text: `Cannot find package '${args.path}' (from ${from})` }] };
              }
            });
            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, args => ({
              contents: fs.readFileSync(args.path),
              loader: LOADERS[path.extname(args.path).slice(1).toLowerCase()] ?? 'js',
              resolveDir: path.dirname(args.path),
            }));
          },
        },
      ],
    });
    return { code: result.outputFiles?.[0]?.text ?? '' };
  } catch (error) {
    const failure = error as {
      errors?: { text: string; location?: { file: string; line: number } }[];
    };
    return {
      errors: failure.errors?.map(e =>
        e.location
          ? `${e.location.file.replace(`${NAMESPACE}:`, '')}:${e.location.line}: ${e.text}`
          : e.text
      ) ?? [String(error)],
    };
  }
}

parentPort?.on('message', (message: { id: number; entry: string }) => {
  void bundle(message.entry).then(result => parentPort?.postMessage({ id: message.id, ...result }));
});
