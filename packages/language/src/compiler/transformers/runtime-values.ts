/**
 * Lowering of runtime values in operation data to Eligius operations.
 *
 * Eligius resolves property chains (`$operationdata.x`, `$globaldata.x`,
 * `$scope.x`) only inside the few operations that resolve their own inputs
 * (selectElement, calc, setOperationData, ...). Every other operation receives
 * the chain as a literal string: `setElementContent(label)` inside an action
 * would insert the text `$operationdata.label`. Two lowerings fix this:
 *
 * 1. Materialization. An operation property whose value contains a property
 *    chain, on an operation that does not resolve that property itself, is
 *    moved into a preceding `setOperationData`, which resolves chains
 *    (recursively, inside objects and arrays) and merges the result into the
 *    operation data the next operation reads:
 *
 *        setOperationData({ properties: { template: "$operationdata.label" } })
 *        setElementContent()
 *
 * 2. Runtime string concatenation. The expression transformer replaces each
 *    `"#" + id` with a placeholder and records its parts here. Before the
 *    operation that uses it, the parts are resolved and joined:
 *
 *        setOperationData({ properties: { strings: ["#", "$operationdata.id"] } })
 *        concatenateStrings()                   // → $operationdata.result
 *        selectElement({ selector: "$operationdata.result" })
 *
 *    With more than one concatenation in an operation, each result is copied to
 *    a private key (`__eligianConcat0`, ...) that is removed afterwards. When the
 *    surrounding code uses `$operationdata.result` itself, its value is saved and
 *    restored around the concatenations.
 */
import { Effect } from 'effect';
import { type AstNode, AstUtils } from 'langium';
import {
  isActionDefinition,
  isOperationCall,
  isPropertyChainReference,
  isTimeline,
} from '../../generated/ast.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import type { JsonValue, OperationConfigIR } from '../types/eligius-ir.js';
import type { ScopeContext } from './scope.js';

/** One runtime concatenation found while transforming a statement. */
export interface RuntimeConcat {
  /** Operands in order: constant strings and property-chain strings. */
  readonly parts: readonly JsonValue[];
}

/**
 * Collects the runtime concatenations of one statement. The expression
 * transformer only lowers a concatenation when a collector is in scope; the
 * statement transformer that created it lowers the collected entries.
 */
export interface RuntimeConcatCollector {
  readonly concats: RuntimeConcat[];
}

export const createRuntimeConcatCollector = (): RuntimeConcatCollector => ({ concats: [] });

/**
 * Placeholders are not property chains (so materialization ignores them until
 * they are replaced) and cannot be written in Eligian source (NUL characters).
 */
const PLACEHOLDER_PREFIX = '\u0000eligian-concat:';
const PLACEHOLDER_SUFFIX = '\u0000';

/** Record a concatenation and return the placeholder that stands for its result. */
export function registerRuntimeConcat(
  collector: RuntimeConcatCollector,
  parts: readonly JsonValue[]
): string {
  const index = collector.concats.push({ parts }) - 1;
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
}

function placeholderIndex(value: string): number | undefined {
  if (!value.startsWith(PLACEHOLDER_PREFIX) || !value.endsWith(PLACEHOLDER_SUFFIX)) {
    return undefined;
  }
  const index = Number(value.slice(PLACEHOLDER_PREFIX.length, -PLACEHOLDER_SUFFIX.length));
  return Number.isInteger(index) ? index : undefined;
}

/** Private operation-data key a concatenation result is copied to. */
export const concatTempKey = (index: number): string => `__eligianConcat${index}`;

/** Private operation-data key `$operationdata.result` is saved to. */
export const SAVED_RESULT_KEY = '__eligianSavedResult';

/**
 * Properties that operations resolve themselves, so their chains must be left
 * in place. `'*'` means the operation's data must never be rewritten: its
 * strings are expressions or targets, not values (`when`, `setData` keys), or it
 * is the resolving operation itself (`setOperationData`).
 *
 * Kept in sync with the Eligius operations that call resolvePropertyValues /
 * resolveExternalPropertyChain (eligius src/operation).
 */
const SELF_RESOLVED: Readonly<Record<string, ReadonlySet<string> | '*'>> = {
  broadcastEvent: new Set(['eventArgs']),
  calc: new Set(['left', 'right', 'operator']),
  createElement: new Set(['elementName', 'attributes', 'text']),
  forEach: new Set(['collection']),
  math: new Set(['args', 'functionName']),
  selectElement: new Set(['selector']),
  setStyle: new Set(['properties']),
  setData: '*',
  setOperationData: '*',
  when: '*',
  otherwise: '*',
};

function resolvesItself(systemName: string, property: string): boolean {
  const resolved = SELF_RESOLVED[systemName];
  return resolved === '*' || (resolved?.has(property) ?? false);
}

const CHAIN_PREFIXES = ['$operationdata.', '$globaldata.', '$scope.'];

/** Same test as Eligius's isExternalProperty (case-insensitive prefix). */
export function isPropertyChainString(value: string): boolean {
  const lower = value.toLowerCase();
  return CHAIN_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/** True when `value` is, or contains (in objects and arrays), a property-chain string. */
export function containsPropertyChain(value: JsonValue | undefined): boolean {
  if (typeof value === 'string') return isPropertyChainString(value);
  if (Array.isArray(value)) return value.some(containsPropertyChain);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsPropertyChain);
  }
  return false;
}

function collectPlaceholders(value: JsonValue | undefined, found: Set<number>): void {
  if (typeof value === 'string') {
    const index = placeholderIndex(value);
    if (index !== undefined) found.add(index);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, found);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectPlaceholders(item, found);
  }
}

function replacePlaceholders(value: JsonValue, replacement: (index: number) => string): JsonValue {
  if (typeof value === 'string') {
    const index = placeholderIndex(value);
    return index === undefined ? value : replacement(index);
  }
  if (Array.isArray(value)) return value.map(item => replacePlaceholders(item, replacement));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, replacement)])
    );
  }
  return value;
}

/**
 * True when the action (or timeline) around `node` uses `$operationdata.result`
 * itself: it reads the chain, or calls an operation that writes `result`. Its
 * value must then survive the concatenations, which also write `result`.
 */
export function usesOperationDataResult(node: AstNode): boolean {
  const owner =
    AstUtils.getContainerOfType(node, isActionDefinition) ??
    AstUtils.getContainerOfType(node, isTimeline) ??
    AstUtils.findRootNode(node);
  return AstUtils.streamAst(owner).some(
    n =>
      (isPropertyChainReference(n) &&
        n.scope.toLowerCase() === 'operationdata' &&
        n.properties[0] === 'result') ||
      (isOperationCall(n) && RESULT_WRITERS.has(getOperationCallName(n)))
  );
}

/** Eligius operations whose output property is `result`. */
const RESULT_WRITERS = new Set(['concatenateStrings', 'replaceString']);

export interface LowerOptions {
  /** Save and restore `$operationdata.result` around concatenations. */
  readonly preserveResult: boolean;
}

/**
 * Lower the runtime concatenations and unresolved property chains of a
 * statement's operations (see the module comment). Operations without either
 * are returned unchanged, so programs that use neither compile as before.
 */
export function lowerRuntimeValues(
  operations: readonly OperationConfigIR[],
  collector: RuntimeConcatCollector,
  options: LowerOptions
): OperationConfigIR[] {
  return operations.flatMap(op => lowerOperation(op, collector, options));
}

function lowerOperation(
  op: OperationConfigIR,
  collector: RuntimeConcatCollector,
  options: LowerOptions
): OperationConfigIR[] {
  const data = (op.operationData ?? {}) as Record<string, JsonValue>;
  const used = new Set<number>();
  collectPlaceholders(data, used);
  const concatIndices = [...used].sort((a, b) => a - b);

  // A single concatenation can be read from `$operationdata.result` directly:
  // the operation that resolves it (the materializing setOperationData, or the
  // operation itself) runs right after concatenateStrings. Several need private
  // keys, since each concatenateStrings overwrites `result`.
  const single = concatIndices.length === 1 && !options.preserveResult;
  const resultChain = (index: number) =>
    single ? '$operationdata.result' : `$operationdata.${concatTempKey(index)}`;

  const resolvedData: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(data)) {
    resolvedData[key] = replacePlaceholders(value, resultChain);
  }

  const materialized: Record<string, JsonValue> = {};
  const remaining: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(resolvedData)) {
    if (containsPropertyChain(value) && !resolvesItself(op.systemName, key)) {
      materialized[key] = value;
    } else {
      remaining[key] = value;
    }
  }

  if (concatIndices.length === 0 && Object.keys(materialized).length === 0) {
    return [op];
  }

  const sourceLocation = op.sourceLocation;
  const helper = (systemName: string, operationData: Record<string, JsonValue>) =>
    ({
      id: crypto.randomUUID(),
      systemName,
      operationData,
      sourceLocation,
    }) as OperationConfigIR;
  const setOperationData = (properties: Record<string, JsonValue>) =>
    helper('setOperationData', { properties });

  const before: OperationConfigIR[] = [];
  const cleanup: string[] = [];

  if (concatIndices.length > 0) {
    if (options.preserveResult) {
      before.push(setOperationData({ [SAVED_RESULT_KEY]: '$operationdata.result' }));
      cleanup.push(SAVED_RESULT_KEY);
    }
    for (const index of concatIndices) {
      const concat = collector.concats[index];
      before.push(setOperationData({ strings: [...concat.parts] }));
      before.push(helper('concatenateStrings', {}));
      if (!single) {
        before.push(setOperationData({ [concatTempKey(index)]: '$operationdata.result' }));
        cleanup.push(concatTempKey(index));
      }
    }
    if (options.preserveResult) {
      before.push(setOperationData({ result: `$operationdata.${SAVED_RESULT_KEY}` }));
    } else if (!single) {
      // `result` was only ever written by the concatenations
      cleanup.push('result');
    }
  }

  if (Object.keys(materialized).length > 0) {
    before.push(setOperationData(materialized));
  }

  const lowered: OperationConfigIR = {
    ...op,
    operationData: Object.keys(remaining).length > 0 ? remaining : undefined,
  } as OperationConfigIR;

  const after =
    cleanup.length > 0
      ? [helper('removePropertiesFromOperationData', { propertyNames: cleanup })]
      : [];

  return [...before, lowered, ...after];
}

/**
 * Transform one statement with a fresh concatenation collector in scope, then
 * lower its runtime concatenations and unresolved property chains.
 */
export const withRuntimeValueLowering = <E>(
  node: AstNode,
  scope: ScopeContext,
  build: (scope: ScopeContext) => Effect.Effect<OperationConfigIR[], E>
): Effect.Effect<OperationConfigIR[], E> => {
  const collector = createRuntimeConcatCollector();
  return Effect.map(build({ ...scope, runtimeConcats: collector }), operations =>
    lowerNodeOperations(node, collector, operations)
  );
};

/** {@link lowerRuntimeValues} for the operations of one source node. */
export function lowerNodeOperations(
  node: AstNode,
  collector: RuntimeConcatCollector,
  operations: readonly OperationConfigIR[]
): OperationConfigIR[] {
  return lowerRuntimeValues(operations, collector, {
    preserveResult: collector.concats.length > 0 && usesOperationDataResult(node),
  });
}
