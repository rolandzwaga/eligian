/**
 * The host module of the dev-runtime-error fixture (spec 058 phase 4, SC-004 /
 * SC-009): `boom` throws, so the timeline's enter block fails at runtime.
 */
type Bag = Record<string, unknown>;

export const operations = {
  boom(_operationData: Bag): Bag {
    throw new Error('boom');
  },
};
