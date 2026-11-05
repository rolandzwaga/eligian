/**
 * The host module of review.spec.ts (spec 058 phase 2, FR-050): declares the
 * operation that host-operation-in-block-without-select looks at.
 */
type Bag = Record<string, unknown>;

export const operations = {
  stamp(operationData: Bag): Bag {
    return operationData;
  },
};
