/**
 * MediaResolver regression tests (2026-10-22 audit, low findings #63 / #68):
 *
 * - Any string ending in a media extension was rewritten (label text such as
 *   'Save the image as photo.png' became a webview URI), because the
 *   property-name check never mattered.
 * - Relative paths were resolved against the .eligian file path instead of its
 *   directory ('./video.mp4' -> '<dir>/story.eligian/video.mp4').
 * - The missing-file warning could never fire: existence was never checked.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IEngineConfiguration } from 'eligius';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as vscode from 'vscode';
import { MediaResolver } from '../MediaResolver.js';

const WEBVIEW_PREFIX = 'vscode-webview://test/';

const webview = {
  asWebviewUri: (uri: vscode.Uri) => ({
    toString: () => `${WEBVIEW_PREFIX}${uri.fsPath.replace(/\\/g, '/')}`,
  }),
} as unknown as vscode.Webview;

let tmp: string;
let documentDir: string;

function resolver(): MediaResolver {
  return new MediaResolver(webview, vscode.Uri.file(path.join(documentDir, 'story.eligian')));
}

function touch(relative: string): string {
  const file = path.join(documentDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
}

function webviewPathOf(value: unknown): string {
  expect(typeof value).toBe('string');
  expect(value as string).toMatch(new RegExp(`^${WEBVIEW_PREFIX}`));
  return path.resolve((value as string).slice(WEBVIEW_PREFIX.length));
}

const asConfig = (value: Record<string, unknown>) => value as unknown as IEngineConfiguration;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-media-'));
  documentDir = path.join(tmp, 'project');
  fs.mkdirSync(documentDir);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('MediaResolver.resolveMediaPaths', () => {
  test('resolves a timeline uri relative to the document directory', () => {
    const video = touch('media/clip.mp4');
    const shared = path.join(tmp, 'shared', 'music.mp3');
    fs.mkdirSync(path.dirname(shared));
    fs.writeFileSync(shared, '');

    const media = resolver();
    const result = media.resolveMediaPaths(
      asConfig({
        timelines: [
          { type: 'video', uri: './media/clip.mp4' },
          { type: 'audio', uri: '../shared/music.mp3' },
          { type: 'video', uri: 'media/clip.mp4' },
        ],
      })
    ) as any;

    expect(webviewPathOf(result.timelines[0].uri)).toBe(path.resolve(video));
    expect(webviewPathOf(result.timelines[1].uri)).toBe(path.resolve(shared));
    expect(webviewPathOf(result.timelines[2].uri)).toBe(path.resolve(video));
    expect(media.getMissingFiles()).toEqual([]);
  });

  test('does not rewrite text that merely ends in a media extension', () => {
    touch('photo.png');
    const config = asConfig({
      initActions: [
        {
          startOperations: [
            {
              systemName: 'setElementContent',
              operationData: { template: 'Save the image as photo.png' },
            },
            { systemName: 'selectElement', operationData: { selector: '.photo.png' } },
          ],
        },
      ],
      labels: [{ id: 'l', labels: [{ languageCode: 'en', label: './photo.png' }] }],
    });

    const result = resolver().resolveMediaPaths(config);

    expect(result).toEqual(config);
  });

  test('rewrites media properties: exact names, camelCase suffixes and string arrays', () => {
    const image = touch('img/a.png');
    const poster = touch('img/poster.jpg');
    const clip = touch('clip.webm');

    const result = resolver().resolveMediaPaths(
      asConfig({
        operationData: {
          attributes: { src: './img/a.png', posterSrc: './img/poster.jpg' },
          sources: ['./clip.webm', 'not media'],
          resourcepath: './img/a.png',
        },
      })
    ) as any;

    expect(webviewPathOf(result.operationData.attributes.src)).toBe(path.resolve(image));
    expect(webviewPathOf(result.operationData.attributes.posterSrc)).toBe(path.resolve(poster));
    expect(webviewPathOf(result.operationData.sources[0])).toBe(path.resolve(clip));
    expect(result.operationData.sources[1]).toBe('not media');
    // 'resourcepath' only ends in 'path' without a camelCase boundary
    expect(result.operationData.resourcepath).toBe('./img/a.png');
  });

  test('leaves http(s) and other URLs unchanged', () => {
    const config = asConfig({
      timelines: [
        { uri: 'https://cdn.example.com/video.mp4' },
        { uri: 'http://example.com/a.mp3' },
        { uri: 'data:image/png;base64,AAAA.png' },
        { uri: 'blob:vscode-webview://x/y.png' },
      ],
    });

    const media = resolver();
    expect(media.resolveMediaPaths(config)).toEqual(config);
    expect(media.getMissingFiles()).toEqual([]);
  });

  test('reports media files that do not exist (and still rewrites them)', () => {
    touch('present.mp4');
    const media = resolver();

    const result = media.resolveMediaPaths(
      asConfig({
        timelines: [{ uri: './present.mp4' }, { uri: './missing.mp4' }],
      })
    ) as any;

    expect(media.getMissingFiles()).toEqual(['./missing.mp4']);
    expect(webviewPathOf(result.timelines[1].uri)).toBe(
      path.resolve(path.join(documentDir, 'missing.mp4'))
    );
  });

  test('resets the missing-file list on every call and does not mutate the input', () => {
    const media = resolver();
    const config = asConfig({ timelines: [{ uri: './missing.mp4' }] });

    media.resolveMediaPaths(config);
    expect(media.getMissingFiles()).toEqual(['./missing.mp4']);

    media.resolveMediaPaths(asConfig({ timelines: [] }));
    expect(media.getMissingFiles()).toEqual([]);
    expect(config).toEqual({ timelines: [{ uri: './missing.mp4' }] });
  });

  test('treats an absolute local path as a media path', () => {
    const file = touch('abs.ogg');
    const media = resolver();

    const result = media.resolveMediaPaths(asConfig({ timelines: [{ uri: file }] })) as any;

    expect(webviewPathOf(result.timelines[0].uri)).toBe(path.resolve(file));
    expect(media.getMissingFiles()).toEqual([]);
  });
});
