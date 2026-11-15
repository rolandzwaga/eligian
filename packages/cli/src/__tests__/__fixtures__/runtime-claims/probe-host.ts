/**
 * The probe host module of mcp-runtime-claims.spec.ts (spec 058, plan B1):
 * `recordBag` logs the keys of the operationData it receives, so a probe can
 * observe what the engine hands an operation. The log lives on `globalThis`
 * because `eligian smoke` bundles this module into a module instance of its own.
 */
type Bag = Record<string, unknown>;

export interface Recorded {
  readonly label: string;
  readonly keys: readonly string[];
  readonly value: unknown;
}

const log = (): Recorded[] =>
  ((globalThis as { __eligianProbe?: Recorded[] }).__eligianProbe ??= []);

export const operations = {
  recordBag(operationData: Bag): Bag {
    log().push({
      label: String(operationData.label),
      keys: Object.keys(operationData),
      value: operationData.value,
    });
    return operationData;
  },
  returnUndefined(): undefined {
    return undefined;
  },
};
