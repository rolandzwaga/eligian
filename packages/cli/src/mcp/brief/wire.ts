/**
 * Spec 059 Phase 2 (plan P5): the wire schemas of a brief round, shared by `eligian_brief`'s
 * `Success` and the later replies that carry a round. Moved verbatim from `tools/brief.ts`.
 * `GateRefusalSchema` is the `gate` failure's payload; `errors.ts` imports it from here
 * (importing `tools/brief.ts` there would be a cycle).
 */
import { Schema } from 'effect';

const CELL_KINDS = ['text', 'choice', 'yes-no', 'duration', 'view', 'path', 'language'] as const;
const SHAPE_KINDS = [
  'text',
  'choice',
  'set',
  'yes-no',
  'duration',
  'view',
  'path',
  'record',
  'table',
] as const;

/** `tree.ts`'s `Column`. */
export const ColumnSchema = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(CELL_KINDS),
  options: Schema.optionalKey(Schema.Array(Schema.String)),
  dash: Schema.optionalKey(Schema.Literal(true)),
  none: Schema.optionalKey(Schema.Literal(true)),
});

/** `tree.ts`'s `Shape`. */
export const ShapeSchema = Schema.Struct({
  kind: Schema.Literals(SHAPE_KINDS),
  options: Schema.optionalKey(Schema.Array(Schema.String)),
  columns: Schema.optionalKey(Schema.Array(ColumnSchema)),
  none: Schema.optionalKey(Schema.Literal(true)),
  alternatives: Schema.optionalKey(Schema.Array(Schema.String)),
  rows: Schema.optionalKey(Schema.Literal('one-per-view')),
});

/** `engine.ts`'s `RoundItem`. */
export const RoundItemSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  ask: Schema.String,
  shape: ShapeSchema,
  docs: Schema.Array(Schema.String),
  facts: Schema.Array(Schema.String),
  previous: Schema.optionalKey(Schema.Unknown),
  reason: Schema.optionalKey(Schema.String),
});

/** The six gate codes (FR-017). */
export const GATE_CODES = [
  'brief-required',
  'brief-incomplete',
  'brief-not-confirmed',
  'storyboard-not-approved',
  'brief-changed',
  'addition-not-briefed',
] as const;

const GateCodeSchema = Schema.Literals(GATE_CODES);

/** `engine.ts`'s `AdditionKind` with the addition's name: an addition scope (FR-037). */
const AdditionScopeSchema = Schema.Struct({
  addition: Schema.Literals(['view', 'language', 'host-module']),
  name: Schema.String,
});

/** The payload of a `gate` failure (FR-017; plan §12). */
export const GateRefusalSchema = Schema.Struct({
  code: GateCodeSchema,
  program: Schema.String,
  refused: Schema.Array(Schema.Struct({ program: Schema.String, code: GateCodeSchema })),
  brief: Schema.String,
  directory: Schema.String,
  state: Schema.Literals(['none', 'open', 'complete', 'confirmed', 'approved']),
  round: Schema.Array(RoundItemSchema),
  scope: Schema.optionalKey(AdditionScopeSchema),
  additions: Schema.optionalKey(Schema.Array(AdditionScopeSchema)),
  changed: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, value: Schema.Unknown }))
  ),
  next: Schema.String,
});
export type GateRefusal = typeof GateRefusalSchema.Type;
