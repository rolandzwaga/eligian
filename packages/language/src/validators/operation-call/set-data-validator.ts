import type { ValidationAcceptor } from 'langium';
import { isActionDefinition, isObjectLiteral, type OperationCall } from '../../generated/ast.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { BaseValidator } from '../base-validator.js';

/** Diagnostic code for a setData key whose target Eligius does not recognise. */
export const INVALID_SET_DATA_TARGET_CODE = 'invalid_setdata_target';

/** Data on an {@link INVALID_SET_DATA_TARGET_CODE} diagnostic that the quick fix can apply. */
export interface InvalidSetDataTargetData {
  readonly code: typeof INVALID_SET_DATA_TARGET_CODE;
  /** The key with the missing `$` added, when that is the only problem. */
  readonly fixedKey?: string;
}

/** The targets Eligius's setData accepts (eligius set-data.ts `knownTargets`). */
const TARGETS = ['operationdata', 'globaldata', 'scope'];

/**
 * Validates the keys of `setData({ "$operationdata.name": value, ... })`.
 *
 * Eligius reads each key's target as its first segment minus the first
 * character, so `"operationdata.name"` becomes target `perationdata` and throws
 * "Unrecognized target" at runtime. A key must be `$operationdata.<path>`,
 * `$globaldata.<path>` or `$scope.<path>` (the target is case-insensitive).
 */
export class SetDataValidator extends BaseValidator {
  checkSetDataTargets(call: OperationCall, accept: ValidationAcceptor): void {
    if (getOperationCallName(call) !== 'setData' || isActionDefinition(call.operationName.ref)) {
      return;
    }
    const [properties] = call.args;
    if (!isObjectLiteral(properties)) return;

    for (const property of properties.properties) {
      const key = String(property.key);
      const [head, ...path] = key.split('.');
      const target = head.toLowerCase();

      if (target.startsWith('$') && TARGETS.includes(target.slice(1)) && path.length > 0) {
        continue;
      }

      const missingDollar = TARGETS.includes(target) && path.length > 0;
      const data: InvalidSetDataTargetData = missingDollar
        ? { code: INVALID_SET_DATA_TARGET_CODE, fixedKey: `$${key}` }
        : { code: INVALID_SET_DATA_TARGET_CODE };
      const message = missingDollar
        ? `setData target '${key}' needs a '$' prefix: '$${key}'. Eligius rejects '${key}' at runtime`
        : `setData target '${key}' is not recognised. Use '$operationdata.<name>', '$globaldata.<name>' or '$scope.<name>'`;

      accept('error', message, { node: property, property: 'key', data });
    }
  }
}
