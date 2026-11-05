/**
 * The knowledge base the MCP server reads: the docs index, the chunk bodies
 * and the overlays (spec 058 phase 1, plan C7; phase 2 plan F1: the `example`
 * kind and the operation and controller overlays).
 */

export type ChunkKind =
  | 'orientation'
  | 'mapping'
  | 'runtime'
  | 'workflow'
  | 'reference'
  | 'operation'
  | 'starter'
  | 'example';

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

/** The card of `curriculum/operations/<name>.md`, appended to the operation card (FR-073). */
export interface OperationOverlay {
  readonly card: string;
}

/** A controller's status (FR-074): the overlays are its single source. */
export type ControllerStatus = 'recommended' | 'constrained' | 'do-not-use';

/** The status and card of `curriculum/controllers/<name>.md` (FR-074). */
export interface ControllerOverlay {
  readonly status: ControllerStatus;
  readonly card: string;
}

/**
 * `overlays.json`: diagnostic overlays by code and the generic one of each diagnostic
 * source; operation and controller overlays by name (absent in a docs dir without them).
 */
export interface Overlays {
  readonly byCode: Readonly<Record<string, Overlay>>;
  readonly bySource: Readonly<Record<string, Overlay>>;
  readonly operations?: Readonly<Record<string, OperationOverlay>>;
  readonly controllers?: Readonly<Record<string, ControllerOverlay>>;
}

export interface Knowledge {
  readonly index: readonly IndexEntry[];
  /** The chunk body without its frontmatter */
  readonly body: (id: string) => string | undefined;
  /** The `##` headings of a chunk */
  readonly headings: (id: string) => readonly string[];
  /** Every overlay map present; `loadKnowledge` fills a missing one with `{}` */
  readonly overlays: Required<Overlays>;
}
