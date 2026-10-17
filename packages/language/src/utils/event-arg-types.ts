/**
 * Event argument type mapping
 *
 * Eligius event metadata describes event arguments with TypeScript types
 * (`number`, `TLanguageCode`, `string[]`, `(position: number) => void`, ...).
 * The Eligian grammar only knows five type annotations. This module maps an
 * Eligius argument type to the DSL annotation that describes it, and is shared
 * by the event action validator (type compatibility check) and the event action
 * completion skeleton (generated parameter list) so both agree.
 */

/**
 * The type annotations accepted by the grammar's `TypeAnnotation` rule.
 */
export type DslTypeAnnotation = 'string' | 'number' | 'boolean' | 'object' | 'array';

export const DSL_TYPE_ANNOTATIONS: ReadonlySet<string> = new Set<DslTypeAnnotation>([
  'string',
  'number',
  'boolean',
  'object',
  'array',
]);

/**
 * Map an Eligius event argument type to its DSL type annotation.
 *
 * - `string`, `number`, `boolean`, `object`, `array` → unchanged
 * - `TLanguageCode` (a template-literal string type) → `string`
 * - `T[]`, `Array<T>`, `ReadonlyArray<T>` → `array`
 * - `Record<...>` and object literal types → `object`
 * - `any`, `unknown`, callbacks and other types → `undefined` (no DSL annotation;
 *   such parameters must stay untyped)
 *
 * @param eligiusType - Type string from event metadata
 * @returns The matching DSL annotation, or undefined when none exists
 */
export function eligiusTypeToDslAnnotation(eligiusType: string): DslTypeAnnotation | undefined {
  const type = eligiusType.trim();

  if (DSL_TYPE_ANNOTATIONS.has(type)) {
    return type as DslTypeAnnotation;
  }
  if (type === 'TLanguageCode') {
    return 'string';
  }
  if (/^[^()|]+\[\]$/.test(type) || /^(Readonly)?Array<.+>$/.test(type)) {
    return 'array';
  }
  if (/^Record<.+>$/.test(type) || /^\{.*\}$/s.test(type)) {
    return 'object';
  }
  return undefined;
}
