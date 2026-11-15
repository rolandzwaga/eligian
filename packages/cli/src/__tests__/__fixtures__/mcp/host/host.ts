/**
 * The host module of mcp-operations.spec.ts (spec 058, SC-010): the `extensions`
 * import of main.eligian declares `score`, so `eligian_operations({ path })`
 * returns its host operation card.
 */
type Bag = Record<string, unknown>;

export const operations = {
  score(operationData: Bag): Bag {
    return { ...operationData, correct: operationData.answer === '42' };
  },
};
