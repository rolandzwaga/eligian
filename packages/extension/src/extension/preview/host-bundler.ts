/**
 * Bundles a program's host module for the preview (audit idea #24), in a
 * worker thread with esbuild-wasm (host-bundler-worker.ts). The code is
 * written to a content-addressed temporary file, so a changed module gets a
 * new URL and the webview's module cache never serves an old one.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

export type HostBundle = { file: string } | { errors: string[] };

type Reply = { id: number; code?: string; errors?: string[] };

export class HostBundler {
  private worker: Worker | undefined;
  private nextId = 0;
  private readonly waiting = new Map<number, (reply: Reply) => void>();

  /**
   * @param extensionPath - The extension's folder: `out/extension/preview/host-bundler-worker.cjs`
   *   and `out/esbuild.wasm` are there
   * @param outputDir - Where the bundled modules are written
   */
  constructor(
    private readonly extensionPath: string,
    private readonly outputDir = path.join(os.tmpdir(), 'eligian-preview-host')
  ) {}

  async bundle(entry: string): Promise<HostBundle> {
    const reply = await this.request(entry);
    if (reply.errors) return { errors: reply.errors };
    const code = reply.code ?? '';
    const file = path.join(
      this.outputDir,
      `host-${createHash('sha1').update(code).digest('hex').slice(0, 16)}.js`
    );
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(file, code, 'utf-8');
    return { file };
  }

  dispose(): void {
    void this.worker?.terminate();
    this.worker = undefined;
    for (const resolve of this.waiting.values())
      resolve({ id: -1, errors: ['The preview closed'] });
    this.waiting.clear();
  }

  private request(entry: string): Promise<Reply> {
    const worker = this.start();
    const id = ++this.nextId;
    return new Promise(resolve => {
      this.waiting.set(id, resolve);
      worker.postMessage({ id, entry });
    });
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      path.join(this.extensionPath, 'out', 'extension', 'preview', 'host-bundler-worker.cjs'),
      {
        workerData: { wasmPath: path.join(this.extensionPath, 'out', 'esbuild.wasm') },
      }
    );
    worker.on('message', (reply: Reply) => {
      this.waiting.get(reply.id)?.(reply);
      this.waiting.delete(reply.id);
    });
    worker.on('error', error => {
      const message = error instanceof Error ? error.message : String(error);
      for (const resolve of this.waiting.values()) resolve({ id: -1, errors: [message] });
      this.waiting.clear();
      this.worker = undefined;
    });
    worker.unref();
    this.worker = worker;
    return worker;
  }
}
