/**
 * The knowledge base the MCP server reads: the docs index, the chunk bodies
 * and the diagnostic overlays (spec 058 phase 1, plan C7).
 */

export type ChunkKind =
  | 'orientation'
  | 'mapping'
  | 'runtime'
  | 'workflow'
  | 'reference'
  | 'operation'
  | 'starter';

/** One entry of the generated `index.json`. */
export interface IndexEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: ChunkKind;
  readonly use_cases: readonly string[];
  readonly words: number;
  readonly see: readonly string[];
  readonly card: string;
}

/** The docs pointer and the fix text that `eligian_check` adds to a diagnostic. */
export interface Overlay {
  readonly docs: string;
  readonly fix: string;
}

/** Overlays by diagnostic code, and the generic one of each diagnostic source. */
export interface Overlays {
  readonly byCode: Readonly<Record<string, Overlay>>;
  readonly bySource: Readonly<Record<string, Overlay>>;
}

export interface Knowledge {
  readonly index: readonly IndexEntry[];
  /** The chunk body without its frontmatter */
  readonly body: (id: string) => string | undefined;
  /** The `##` headings of a chunk */
  readonly headings: (id: string) => readonly string[];
  readonly overlays: Overlays;
}
