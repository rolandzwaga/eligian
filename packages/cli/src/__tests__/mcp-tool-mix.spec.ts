/**
 * Spec 058 Phase 5 (FR-022, FR-024; plan D1b): the shared tool mix and heap helper used by
 * `scripts/measure-recycle.ts`, `scripts/measure-heap.ts` and the soak.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { NAME as CHECK } from '../mcp/tools/check.js';
import { NAME as COMPILE } from '../mcp/tools/compile.js';
import { NAME as FMT } from '../mcp/tools/fmt.js';
import { NAME as OPERATIONS } from '../mcp/tools/operations.js';
import { NAME as PROJECT } from '../mcp/tools/project.js';
import { copyProject, heapAfterGc, mixCall, toolMix } from './mcp-tool-mix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const TOUR = path.join(REPO, 'examples', 'eligian-tour');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the FR-022 tool mix', () => {
  it('is check, project, compile summary, fmt without write, operations with path', () => {
    expect(toolMix('tour.eligian')).toEqual([
      { name: CHECK, args: { paths: ['tour.eligian'] } },
      { name: PROJECT, args: { path: 'tour.eligian' } },
      { name: COMPILE, args: { path: 'tour.eligian', view: 'summary' } },
      { name: FMT, args: { paths: ['tour.eligian'], write: false } },
      { name: OPERATIONS, args: { path: 'tour.eligian', names: ['addClass'] } },
    ]);
    expect(toolMix('tour.eligian').map(call => call.name)).toEqual([
      'eligian_check',
      'eligian_project',
      'eligian_compile',
      'eligian_fmt',
      'eligian_operations',
    ]);
  });

  it('rotates by one tool after each recycle', () => {
    const mix = toolMix('x');
    expect(mixCall(mix, 0, 0).name).toBe('eligian_check');
    expect(mixCall(mix, 4, 0).name).toBe('eligian_operations');
    expect(mixCall(mix, 5, 0).name).toBe('eligian_check');
    expect(mixCall(mix, 5, 1).name).toBe('eligian_project');
    expect(mixCall(mix, 9, 2).name).toBe('eligian_project');

    const N = 25;
    const firstAfterRecycle = new Set<string>();
    for (let i = 0; i < 125; i++) {
      const recycles = Math.floor(i / N);
      if (i > 0 && i % N === 0) firstAfterRecycle.add(mixCall(mix, i, recycles).name);
    }
    expect(firstAfterRecycle.size).toBe(4);
  });

  it('copyProject copies without dist and storyboards', () => {
    const dir = copyProject(TOUR);
    tempDirs.push(dir);
    expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
    const entries = fs.readdirSync(dir);
    expect(entries).toContain('tour.eligian');
    expect(entries).toContain('presentation.eligian');
    expect(entries).toContain('layout.html');
    expect(entries).not.toContain('dist');
    expect(entries).not.toContain('storyboards');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('heapAfterGc calls gc three times when the heap is already settled', () => {
    let calls = 0;
    const heap = heapAfterGc(() => {
      calls++;
    });
    expect(calls).toBe(3);
    expect(heap).toBeGreaterThan(0);
  });

  it('heapAfterGc keeps collecting while a GC still frees at least 1 MB', () => {
    const MB = 1024 * 1024;
    // read after the 2nd, 3rd, 4th and 5th GC: garbage the 2nd GC left counted is freed by the 3rd
    const readings = [30 * MB, 8 * MB, 7.2 * MB, 7.1 * MB];
    const usage = process.memoryUsage();
    let gcs = 0;
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => ({
      ...usage,
      heapUsed: readings[gcs - 2],
    }));
    const heap = heapAfterGc(() => {
      gcs++;
    });
    expect(gcs).toBe(4);
    expect(heap).toBe(7.2 * MB);
  });
});
