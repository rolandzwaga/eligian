/**
 * The host module of smoke.spec.ts (spec 058 phase 2, FR-033): `bad` forgets to return the
 * operation data, which `eligian smoke` reports as host-operation-returned-non-object.
 */
export const operations = {
  bad(_data: Record<string, unknown>) {
    return undefined;
  },
};
