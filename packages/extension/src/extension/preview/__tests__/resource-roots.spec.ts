/**
 * Unit tests for the preview localResourceRoots helpers (audit #44).
 */

import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  computeInitialRootDirectories,
  createRecordingWebview,
  findUncoveredDirectories,
  isPathWithin,
} from '../resource-roots.js';

const base = path.resolve('/eligian-roots');
const p = (...parts: string[]) => path.join(base, ...parts);

describe('isPathWithin', () => {
  test('a directory is within itself and its ancestors', () => {
    expect(isPathWithin(p('a'), p('a'))).toBe(true);
    expect(isPathWithin(p('a', 'b', 'c.png'), p('a'))).toBe(true);
  });

  test('siblings, parents and look-alike prefixes are not within', () => {
    expect(isPathWithin(p('b'), p('a'))).toBe(false);
    expect(isPathWithin(base, p('a'))).toBe(false);
    expect(isPathWithin(p('ab', 'x.png'), p('a'))).toBe(false);
    expect(isPathWithin(p('..foo', 'x.png'), base)).toBe(true);
  });
});

describe('findUncoveredDirectories', () => {
  test('returns nothing when every file is under a root', () => {
    expect(
      findUncoveredDirectories([p('ws')], [p('ws', 'img', 'a.png'), p('ws', 'b.css')])
    ).toEqual([]);
  });

  test('returns the directories of files outside every root, without nested duplicates', () => {
    const result = findUncoveredDirectories(
      [p('ws')],
      [p('shared', 'deep', 'b.png'), p('shared', 'a.png'), p('fonts', 'x.woff2')]
    );
    expect(result.sort()).toEqual([p('fonts'), p('shared')].sort());
  });

  test('normalizes forward-slash paths', () => {
    const forward = p('shared', 'a.png').replace(/\\/g, '/');
    expect(findUncoveredDirectories([p('ws')], [forward])).toEqual([p('shared')]);
  });
});

describe('computeInitialRootDirectories', () => {
  test('adds the document directory when no workspace folder is open', () => {
    expect(computeInitialRootDirectories([], p('loose', 'story.eligian'))).toEqual([p('loose')]);
  });

  test('adds the document directory when it is outside the workspace folders', () => {
    expect(computeInitialRootDirectories([p('ws')], p('other', 'story.eligian'))).toEqual([
      p('ws'),
      p('other'),
    ]);
  });

  test('does not duplicate a document directory inside a workspace folder', () => {
    expect(computeInitialRootDirectories([p('ws')], p('ws', 'src', 'story.eligian'))).toEqual([
      p('ws'),
    ]);
  });
});

describe('createRecordingWebview', () => {
  test('records file URIs passed to asWebviewUri and forwards everything else', async () => {
    const recorded: string[] = [];
    const posted: unknown[] = [];
    const webview = {
      cspSource: 'csp',
      asWebviewUri: (uri: { scheme: string; fsPath: string }) => ({ converted: uri.fsPath }),
      postMessage(message: unknown) {
        posted.push(message);
        return Promise.resolve(true);
      },
    };

    const recording = createRecordingWebview(webview as any, fsPath => recorded.push(fsPath));

    expect(recording.asWebviewUri({ scheme: 'file', fsPath: p('a.png') } as any)).toEqual({
      converted: p('a.png'),
    });
    recording.asWebviewUri({ scheme: 'https', fsPath: '/remote.png' } as any);
    await recording.postMessage({ type: 'x' });

    expect(recorded).toEqual([p('a.png')]);
    expect(posted).toEqual([{ type: 'x' }]);
    expect(recording.cspSource).toBe('csp');
  });
});
