/**
 * Spec 058 Phase 1 (FR-019; plan C7): reads the generated docs once per `docsRoot`.
 *
 * `index.json` is the list of chunks; `overlays.json` the diagnostic overlays and (Phase 2
 * FR-073, FR-074) the operation and controller overlays, a missing map read as `{}`; every
 * `.md` file under `docsRoot` whose frontmatter has an `id` is a chunk body (overlay files
 * carry `code` / `source` / `operation` / `controller` instead and are skipped). Bodies are
 * kept without their frontmatter, with their `##` headings. Any failure is `ToolInternal` naming `docsRoot`: the docs ship
 * with the CLI, so a missing or broken file is a packaging bug, not a user input error.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { ToolInternal, toToolError } from '../errors.js';
import type { IndexEntry, Knowledge, Overlays } from './types.js';

const cache = new Map<string, Knowledge>();

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^## +(.+?)\s*$/;

const toDirectory = (docsRoot: URL | string): string =>
  path.resolve(typeof docsRoot === 'string' ? docsRoot : fileURLToPath(docsRoot));

/** The frontmatter `id` (bare or quoted) and the body after the frontmatter. */
const splitChunk = (text: string): { readonly id?: string; readonly body: string } => {
  const match = FRONTMATTER.exec(text);
  if (match === null) return { body: text };
  const id = /^id:[ \t]*(.+?)[ \t]*$/m.exec(match[1] ?? '')?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
  return { ...(id === undefined ? {} : { id }), body: text.slice(match[0].length).trim() };
};

/** The `##` headings of a body, outside fenced blocks. */
const headingsOf = (body: string): string[] => {
  const headings: string[] = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced) {
      const heading = HEADING.exec(line)?.[1];
      if (heading !== undefined) headings.push(heading);
    }
  }
  return headings;
};

/** The failure, text reader and JSON parser over one resolved docs directory. */
const readers = (docsRoot: string) => {
  const failure = (cause: unknown): ToolInternal =>
    new ToolInternal({
      message: `cannot read the Eligian docs in ${docsRoot}: ${toToolError('read')(cause).message}`,
      path: docsRoot,
    });

  const readText = (file: string) =>
    Effect.tryPromise({ try: () => fs.readFile(file, 'utf8'), catch: failure });

  const parseJson = (file: string) =>
    readText(path.join(docsRoot, file)).pipe(
      Effect.flatMap(text => Effect.try({ try: (): unknown => JSON.parse(text), catch: failure }))
    );

  return { failure, readText, parseJson };
};

/** `index.json` under the resolved `docsRoot`, checked to be an array (shared by `read` and `loadIndex`). */
const readIndex = (docsRoot: string): Effect.Effect<IndexEntry[], ToolInternal> => {
  const { failure, parseJson } = readers(docsRoot);
  return parseJson('index.json').pipe(
    Effect.flatMap(index =>
      Array.isArray(index)
        ? Effect.succeed(index as IndexEntry[])
        : Effect.fail(failure(new Error('index.json is not an array')))
    )
  );
};

const read = (docsRoot: string) => {
  const { failure, readText, parseJson } = readers(docsRoot);

  return Effect.gen(function* () {
    const index = yield* readIndex(docsRoot);
    const parsed = (yield* parseJson('overlays.json')) as Overlays;
    const overlays: Required<Overlays> = { operations: {}, controllers: {}, ...parsed };
    const files = yield* Effect.tryPromise({
      try: () => fs.readdir(docsRoot, { recursive: true }),
      catch: failure,
    });

    const bodies = new Map<string, string>();
    const headings = new Map<string, readonly string[]>();
    for (const file of files.filter(name => name.endsWith('.md')).sort()) {
      const { id, body } = splitChunk(yield* readText(path.join(docsRoot, file)));
      if (id === undefined) continue;
      bodies.set(id, body);
      headings.set(id, headingsOf(body));
    }

    const knowledge: Knowledge = {
      index,
      body: id => bodies.get(id),
      headings: id => headings.get(id) ?? [],
      overlays,
    };
    return knowledge;
  });
};

/** The docs under `docsRoot`, read once and cached per resolved directory. */
export const loadKnowledge = (docsRoot: URL | string): Effect.Effect<Knowledge, ToolInternal> =>
  Effect.suspend(() => {
    const directory = toDirectory(docsRoot);
    const cached = cache.get(directory);
    if (cached !== undefined) return Effect.succeed(cached);
    return read(directory).pipe(
      Effect.tap(knowledge => Effect.sync(() => cache.set(directory, knowledge)))
    );
  });

/** `index.json` only (no bodies, no overlays, not cached); `ToolInternal` naming `docsRoot` on any failure. */
export const loadIndex = (
  docsRoot: URL | string
): Effect.Effect<readonly IndexEntry[], ToolInternal> =>
  Effect.suspend(() => readIndex(toDirectory(docsRoot)));
