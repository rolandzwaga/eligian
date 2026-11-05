/**
 * Text cards for operations, controllers and timeline events (spec 058 phase 1,
 * FR-020, FR-021, FR-036, FR-037; plan C7, C9). Shared by `eligian_operations`
 * and the docs generator, which runs under tsx: no Effect, no `effect/ai`.
 */
import { isConstantValueArray, type OperationSignature } from '@eligian/language';
import {
  type ControllerMetadata,
  eligiusTypeToDslAnnotation,
  SELF_RESOLVED,
  type TimelineEventMetadata,
} from '@eligian/language/mcp';

interface Positional {
  readonly name: string;
  readonly required: boolean;
}

/** Controllers with a status line (FR-037); the others carry none until the Phase 2 overlays. */
export const CONTROLLER_STATUS: Readonly<Record<string, 'do-not-use' | 'constrained'>> = {
  RoutingController: 'do-not-use',
  LottieController: 'constrained',
};

const STATUS_REASON: Readonly<Record<string, string>> = {
  RoutingController: 'its Eligius metadata says it is a work in progress',
  LottieController: 'lottie-web is a dependency of the VS Code extension only',
};

function typeName(type: string): string {
  return type.replace(/^ParameterType:/, '');
}

function enumOf(values: readonly { readonly value: string }[]): string {
  return values.map(constant => `'${constant.value}'`).join(' | ');
}

function names(items: readonly { readonly name: string }[]): string {
  return items.length === 0 ? 'none' : items.map(item => item.name).join(', ');
}

function argumentList(parameters: readonly Positional[]): string[] {
  return parameters.map(parameter => `${parameter.name}${parameter.required ? '' : '?'}`);
}

function parameterLines(parameters: readonly string[]): string[] {
  return parameters.length === 0 ? ['PARAMETERS: none'] : ['PARAMETERS:', ...parameters];
}

function parameterLine(index: number, name: string, facts: readonly string[]): string {
  return `  ${index + 1}. ${name}: ${facts.join(' · ')}`;
}

function resolvesChains(systemName: string): string {
  const resolved = SELF_RESOLVED[systemName];
  if (resolved === undefined) return 'none';
  return resolved === '*' ? 'all fields' : [...resolved].join(', ');
}

/**
 * An operation card: NEEDS / PROVIDES / ERASES first, then the fields the operation
 * resolves chains in, the positional parameters, the call form and the description.
 */
export function operationCard(
  signature: OperationSignature,
  options?: { readonly host?: boolean }
): string {
  const host = options?.host === true;
  const erased = [
    ...signature.parameters.filter(parameter => parameter.erased),
    ...signature.outputs.filter(output => output.erased),
  ];
  const parameters = signature.parameters.map((parameter, index) => {
    const types = parameter.type;
    const constants = isConstantValueArray(types) ? types : undefined;
    const facts = [
      isConstantValueArray(types) ? enumOf(types) : types.map(typeName).join(' | '),
      parameter.required ? 'required' : 'optional',
    ];
    const fallback = parameter.defaultValue ?? constants?.find(c => c.isDefault)?.value;
    if (fallback !== undefined) facts.push(`default ${JSON.stringify(fallback)}`);
    if (parameter.erased) facts.push('erased');
    if (parameter.description) facts.push(parameter.description);
    return parameterLine(index, parameter.name, facts);
  });
  const category = signature.category ? ` (${signature.category})` : '';
  return [
    host
      ? 'NEEDS: none declared (host operations declare no needs)'
      : `NEEDS: ${names(signature.dependencies)}`,
    host ? 'PROVIDES: none declared' : `PROVIDES: ${names(signature.outputs)}`,
    `ERASES: ${names(erased)}`,
    `RESOLVES CHAINS IN: ${resolvesChains(signature.systemName)}`,
    `OPERATION: ${signature.systemName}${category}`,
    ...parameterLines(parameters),
    `CALL: ${signature.systemName}(${argumentList(signature.parameters).join(', ')})`,
    '',
    signature.description,
  ].join('\n');
}

/** A controller card: the FR-037 status line first when it has one. */
export function controllerCard(metadata: ControllerMetadata): string {
  const status = CONTROLLER_STATUS[metadata.name];
  const parameters = metadata.parameters.map((parameter, index) => {
    const facts = [
      typeof parameter.type === 'string' ? typeName(parameter.type) : enumOf(parameter.type),
      parameter.required ? 'required' : 'optional',
    ];
    if (parameter.defaultValue !== undefined && parameter.defaultValue !== null) {
      facts.push(`default ${JSON.stringify(parameter.defaultValue)}`);
    }
    if (parameter.description) facts.push(parameter.description);
    return parameterLine(index, parameter.name, facts);
  });
  const args = [`"${metadata.name}"`, ...argumentList(metadata.parameters)];
  return [
    ...(status ? [`STATUS: ${status} (${STATUS_REASON[metadata.name]})`] : []),
    `CONTROLLER: ${metadata.name}`,
    `NEEDS: ${metadata.dependencies.length === 0 ? 'none' : metadata.dependencies.join(', ')}`,
    ...parameterLines(parameters),
    `CALL: addController(${args.join(', ')})`,
    '',
    metadata.description,
  ].join('\n');
}

/** The event name: the first line of `name` (some generated names carry their description, C9). */
export function eventName(event: TimelineEventMetadata): string {
  return event.name.split(/\r?\n/, 1)[0].trim();
}

/** One line per event: its name, category and arguments with their DSL type annotations. */
export function eventLine(event: TimelineEventMetadata): string {
  const args = (event.args ?? []).map(arg => {
    const name = `${arg.name}${arg.optional ? '?' : ''}`;
    const annotation = eligiusTypeToDslAnnotation(arg.type);
    return annotation ? `${name}: ${annotation}` : `${name} (untyped: ${arg.type})`;
  });
  const parts = [eventName(event)];
  if (event.category) parts.push(event.category);
  parts.push(args.length === 0 ? 'no args' : args.join(', '));
  return parts.join(' · ').replace(/\s*\r?\n\s*/g, ' ');
}
