/**
 * Parse cache for imported asset files.
 *
 * The Parsed build phase re-runs for every `.eligian` rebuild (including each reparse
 * triggered by typing), and used to read and parse every imported CSS / locales / layout file
 * synchronously each time even though the files had not changed. This cache keys the parsed
 * metadata by file path and validates it with the file's `mtimeMs` and `size`; a `stat` is far
 * cheaper than a PostCSS parse.
 *
 * Hot reload keeps working because the hot-reload handlers invalidate the entries they
 * refresh (the cache also self-invalidates when the file's mtime or size changes).
 */

import { statSync } from 'node:fs';

/** Cheap file fingerprint; `undefined` when the file cannot be stat'ed (missing, unreadable). */
export type FileStamp = string | undefined;

export class ImportParseCache<TMetadata> {
  private readonly entries = new Map<string, { stamp: string; metadata: TMetadata }>();

  /**
   * Fingerprint of the file as it is right now. Take it BEFORE reading the file, so a write
   * landing between the read and the `set` can only make the entry look stale, never fresh.
   */
  stamp(filePath: string): FileStamp {
    try {
      const stats = statSync(filePath);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return undefined;
    }
  }

  /** Cached metadata when the file is unchanged since it was stored. */
  get(filePath: string, stamp: FileStamp): TMetadata | undefined {
    if (stamp === undefined) {
      this.entries.delete(filePath);
      return undefined;
    }
    const entry = this.entries.get(filePath);
    if (entry && entry.stamp === stamp) {
      return entry.metadata;
    }
    return undefined;
  }

  set(filePath: string, stamp: FileStamp, metadata: TMetadata): void {
    if (stamp !== undefined) {
      this.entries.set(filePath, { stamp, metadata });
    }
  }

  /** Forget one file (the file changed or was removed). */
  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  /**
   * Forget everything. CSS metadata merges the classes of `@import`ed sheets, so a change to
   * one sheet makes the cached metadata of its importers stale as well.
   */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
