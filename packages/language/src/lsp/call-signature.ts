/**
 * The parameter list of a call, for signature help and parameter-name inlay
 * hints (audit feature idea #7).
 *
 * Calls are positional, but Eligius operations take named properties. The
 * callee is resolved like the compiler does (name-resolver.ts): an action
 * first, then a built-in operation. `addController("<Controller>", ...)` lists
 * the controller's own parameters after the controller name.
 */
import type { CommentProvider } from 'langium';
import { getOperationSignature } from '../compiler/operations/index.js';
import { getController } from '../completion/metadata/controllers.generated.js';
import { parameterRoles } from '../css/parameter-roles.js';
import {
  type ActionDefinition,
  isActionDefinition,
  isStringLiteral,
  type OperationCall,
} from '../generated/ast.js';
import { translateParameterType } from '../hover/hover-builders.js';
import { extractJSDoc } from '../jsdoc/jsdoc-extractor.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

export interface CallParameter {
  readonly name: string;
  /** Display type (`string`, `number | string`, `"a" | "b"`), when known. */
  readonly type?: string;
  readonly optional: boolean;
  readonly description?: string;
}

export interface CallSignature {
  readonly name: string;
  readonly kind: 'action' | 'operation' | 'controller';
  readonly parameters: readonly CallParameter[];
  readonly documentation?: string;
}

/** `string | number`, or `"a" | "b"` for constant values. */
function displayType(
  type: ReadonlyArray<string | { value: unknown }> | string | undefined
): string | undefined {
  if (type === undefined) return undefined;
  if (typeof type === 'string') return translateParameterType(type);
  if (type.length === 0) return undefined;
  return type
    .map(t => (typeof t === 'object' ? JSON.stringify(t.value) : translateParameterType(t)))
    .join(' | ');
}

function actionSignature(action: ActionDefinition, comments?: CommentProvider): CallSignature {
  const jsdoc = comments ? extractJSDoc(action, comments) : null;
  // Idea #18: parameters that end up as a CSS selector / class name
  const roles = parameterRoles(action);
  const roleNote = (name: string) => {
    const role = roles.get(name);
    return role === 'selector' ? 'CSS selector' : role === 'className' ? 'CSS class name' : '';
  };
  return {
    name: action.name,
    kind: 'action',
    documentation: jsdoc?.description || undefined,
    parameters: action.parameters.map(parameter => {
      const doc = jsdoc?.params.find(p => p.name === parameter.name);
      return {
        name: parameter.name,
        type: parameter.type ?? doc?.type,
        optional: doc?.optional === true,
        description:
          [roleNote(parameter.name), doc?.description ?? ''].filter(Boolean).join(' · ') ||
          undefined,
      };
    }),
  };
}

/** The signature of `call`'s callee, or undefined for an unknown name. */
export function getCallSignature(
  call: OperationCall,
  comments?: CommentProvider
): CallSignature | undefined {
  const callee = call.operationName.ref;
  if (isActionDefinition(callee)) return actionSignature(callee, comments);

  const name = getOperationCallName(call);
  if (name === 'addController') {
    const controllerName = isStringLiteral(call.args[0]) ? call.args[0].value : undefined;
    const controller = controllerName ? getController(controllerName) : undefined;
    return {
      name,
      kind: 'controller',
      documentation: controller?.description ?? 'Attach a controller to the selected element',
      parameters: [
        {
          name: 'controller',
          type: 'string',
          optional: false,
          description: 'Name of the controller, e.g. "LabelController"',
        },
        ...(controller?.parameters ?? []).map(parameter => ({
          name: parameter.name,
          type: displayType(parameter.type),
          optional: !parameter.required,
          description: parameter.description,
        })),
      ],
    };
  }

  const signature = getOperationSignature(name);
  if (!signature) return undefined;
  return {
    name,
    kind: 'operation',
    documentation: signature.description,
    parameters: signature.parameters.map(parameter => ({
      name: parameter.name,
      type: displayType(parameter.type as ReadonlyArray<string | { value: unknown }>),
      optional: !parameter.required,
      description: parameter.description,
    })),
  };
}

/** `name(a: string, b?: number)`, with the character range of each parameter. */
export function formatSignature(signature: CallSignature): {
  label: string;
  parameterRanges: Array<[number, number]>;
} {
  let label = `${signature.name}(`;
  const parameterRanges: Array<[number, number]> = [];
  signature.parameters.forEach((parameter, index) => {
    if (index > 0) label += ', ';
    const text = `${parameter.name}${parameter.optional ? '?' : ''}${parameter.type ? `: ${parameter.type}` : ''}`;
    parameterRanges.push([label.length, label.length + text.length]);
    label += text;
  });
  label += ')';
  return { label, parameterRanges };
}
