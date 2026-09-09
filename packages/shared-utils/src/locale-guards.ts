/**
 * Type guard for an external locale reference (`{ $ref: string }`).
 *
 * Inlined from eligius's `isLocaleReference` so that runtime consumers (the
 * compiler, the LSP server, the VS Code extension host, and the Node test
 * suite) don't import the eligius runtime barrel just for this 4-line check.
 *
 * eligius (>= 2.2.2) bundles jquery@4, which throws `jQuery requires a window
 * with a document` the instant it is evaluated in any DOM-less Node context.
 * Importing eligius for *types only* is fine (erased at build); importing this
 * one *value* guard dragged jquery into the CLI, the extension host, and the
 * Node-environment test suite, crashing all of them on load.
 *
 * This is structurally identical to eligius's `ILocaleReference`.
 */
export function isLocaleReference(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as { $ref: unknown }).$ref === 'string'
  );
}
