/**
 * Spec 058 Phase 3 (FR-040): the construct that generated an emitted operation.
 *
 * A runtime list (not only a type), so the CLI's `explain` rule table and its drift test can
 * iterate it.
 */
export const OPERATION_ORIGINS = [
  'source',
  'call',
  'param-binding',
  'erased-save',
  'erased-restore',
  'concat',
  'saved-result',
  'target',
  'with',
  'interaction',
  'lifecycle',
  'loop-control',
  'init-globaldata',
  'sequence',
  'stagger',
  'library-qualified',
] as const;

export type OperationOrigin = (typeof OPERATION_ORIGINS)[number];
