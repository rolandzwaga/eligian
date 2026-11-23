/**
 * Spec 058 Phase 1 (FR-006; plan C2, C3): the MCP tool errors.
 *
 * Handlers fail with the tagged errors below. The tool boundary maps them with
 * `toToolFailure` to the plain declared-failure object `{ header, error }`: McpServer
 * answers a declared failure that is an `Error` as a plain-text item, which would break
 * FR-005's `{"header":…}` text. `catchDefects` turns a defect into `ToolInternal` (logged
 * to the server's stderr logger) so a bug still answers in that shape; interruption passes.
 */
import { Data, Effect, Schema } from 'effect';
import { type GateRefusal, GateRefusalSchema } from './brief/wire.js';

export type ToolErrorKind = 'not-found' | 'io' | 'timeout' | 'cancelled' | 'internal' | 'gate';

export class ToolNotFound extends Data.TaggedError('ToolNotFound')<{
  readonly message: string;
  readonly path?: string;
}> {}

export class ToolIoError extends Data.TaggedError('ToolIoError')<{
  readonly message: string;
  readonly path?: string;
}> {}

export class ToolInternal extends Data.TaggedError('ToolInternal')<{
  readonly message: string;
  readonly path?: string;
}> {}

/** Spec 059 Phase 2 (FR-016, FR-017): a gated tool refused its programs; `gate` is the payload. */
export class ToolGateRefused extends Data.TaggedError('ToolGateRefused')<{
  readonly message: string;
  readonly path?: string;
  readonly gate: GateRefusal;
}> {}

export type ToolError = ToolNotFound | ToolIoError | ToolInternal | ToolGateRefused;

const TOOL_ERROR_KINDS = ['not-found', 'io', 'timeout', 'cancelled', 'internal', 'gate'] as const;

/** The declared failure on the wire (a plain object, C2). */
export const ToolFailure = Schema.Struct({
  header: Schema.String,
  error: Schema.Struct({
    kind: Schema.Literals(TOOL_ERROR_KINDS),
    message: Schema.String,
    path: Schema.optionalKey(Schema.String),
    gate: Schema.optionalKey(GateRefusalSchema),
  }),
});
export type ToolFailure = typeof ToolFailure.Type;

const KIND_OF_TAG: Record<ToolError['_tag'], ToolErrorKind> = {
  ToolNotFound: 'not-found',
  ToolIoError: 'io',
  ToolInternal: 'internal',
  ToolGateRefused: 'gate',
};

export const toToolFailure =
  (header: string) =>
  (error: ToolError): ToolFailure => ({
    header,
    error: {
      kind: KIND_OF_TAG[error._tag],
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
      ...(error._tag === 'ToolGateRefused' ? { gate: error.gate } : {}),
    },
  });

/** The `Error` message, or the value as a string. */
const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const stringProperty = (cause: unknown, key: 'code' | 'path'): string | undefined => {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const value: unknown = Reflect.get(cause, key);
  return typeof value === 'string' ? value : undefined;
};

/**
 * A rejection or throw → a tagged error. 'read' (a tool input): ENOENT → ToolNotFound, any other
 * fs errno → ToolIoError. 'write': every fs errno → ToolIoError. No errno `code` → ToolInternal.
 * `path` = the given one, else the fs error's own `path`.
 */
export const toToolError =
  (op: 'read' | 'write', path?: string) =>
  (cause: unknown): ToolError => {
    const code = stringProperty(cause, 'code');
    const resolvedPath = path ?? stringProperty(cause, 'path');
    const fields = {
      message: describe(cause),
      ...(resolvedPath === undefined ? {} : { path: resolvedPath }),
    };
    if (code === undefined) return new ToolInternal(fields);
    if (op === 'read' && code === 'ENOENT') return new ToolNotFound(fields);
    return new ToolIoError(fields);
  };

/** The tool boundary: a defect is logged (Effect.logError) and becomes ToolInternal; interruption passes. */
export const catchDefects = <A, R>(
  self: Effect.Effect<A, ToolError, R>
): Effect.Effect<A, ToolError, R> =>
  Effect.catchDefect(self, defect =>
    Effect.logError('eligian mcp: tool defect', defect).pipe(
      Effect.andThen(
        Effect.fail(new ToolInternal({ message: `internal error: ${describe(defect)}` }))
      )
    )
  );
