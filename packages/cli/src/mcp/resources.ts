/**
 * Spec 058 Phase 4 (FR-021–FR-024, I-6; plan C2): the generated docs as MCP resources.
 *
 * One static resource per `index.json` entry, `eligian://docs/<id>`, `text/markdown`, its card as
 * the description. The layer does no I/O (P18): the entries come from `loadIndex`, awaited by
 * `makeServerLayer` before any layer is built. A body is read on its first `resources/read`
 * through the cached `loadKnowledge` (shared with `eligian_docs`); a missing body fails that read
 * only, with a `ToolInternal` naming the id (P8: `effect/ai` answers it as an internal error).
 *
 * `McpServer.resource` is `@stability unstable` (roadmap decision 1: `effect` is pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Array as Arr, Effect, Layer } from 'effect';
import type { McpServer } from 'effect/ai';
import { ToolInternal } from './errors.js';
import { loadKnowledge } from './knowledge/load.js';
import type { IndexEntry } from './knowledge/types.js';
import type { EffectAi } from './paths.js';

/** The resource URI of a docs chunk. */
export const resourceUri = (id: string): string => `eligian://docs/${id}`;

/**
 * One static resource per index entry; `Layer.empty` when `entries` is empty. No I/O at build.
 * Requires `McpServer` (effect 4.1: registrations declare it), provided by `layerStdio`.
 */
export const docsResources = (
  ai: EffectAi,
  docsRoot: URL | string,
  entries: readonly IndexEntry[]
): Layer.Layer<never, never, McpServer.McpServer> => {
  const directory = path.resolve(typeof docsRoot === 'string' ? docsRoot : fileURLToPath(docsRoot));
  const layers = entries.map(entry =>
    ai.McpServer.resource({
      uri: resourceUri(entry.id),
      name: entry.id,
      description: entry.card,
      mimeType: 'text/markdown',
      content: loadKnowledge(docsRoot).pipe(
        Effect.flatMap(knowledge => {
          const body = knowledge.body(entry.id);
          return body === undefined
            ? Effect.fail(
                new ToolInternal({
                  message: `no body for Eligian doc '${entry.id}'`,
                  path: directory,
                })
              )
            : Effect.succeed(`# ${entry.title}\n\n${body}`);
        })
      ),
    })
  );
  return Arr.isArrayNonEmpty(layers) ? Layer.mergeAll(...layers) : Layer.empty;
};
