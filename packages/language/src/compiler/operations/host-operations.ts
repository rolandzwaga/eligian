/**
 * Host operations, controllers and functions (audit idea #24): the
 * declarations of a program's `extensions "./host.ts" { … }` import.
 *
 * Eligian learns their signatures from the declarations, so a host operation
 * is validated, completed and compiled like a built-in one. The lookups
 * (getOperationSignature, hasOperation, …) take an AST node as context: the
 * declarations of its program apply.
 */
import { type AstNode, AstUtils } from 'langium';
import {
  type ControllerMetadata,
  getController,
} from '../../completion/metadata/controllers.generated.js';
import {
  type ExtensionsImport,
  type HostController,
  type HostFunction,
  type HostOperation,
  type HostParameter,
  isExtensionsImport,
  isHostController,
  isHostFunction,
  isHostOperation,
  isProgram,
  type Program,
} from '../../generated/ast.js';
import type { OperationParameter, OperationSignature, ParameterType } from './types.js';

/** The extensions import of the program containing `context`, if any. */
export function extensionsImportOf(context: AstNode | undefined): ExtensionsImport | undefined {
  const program = context && AstUtils.getContainerOfType(context, isProgram);
  return program ? extensionsImportOfProgram(program) : undefined;
}

export function extensionsImportOfProgram(program: Program): ExtensionsImport | undefined {
  return program.statements.find(isExtensionsImport);
}

export function hostOperations(context: AstNode | undefined): HostOperation[] {
  return (extensionsImportOf(context)?.declarations ?? []).filter(isHostOperation);
}

export function hostControllers(context: AstNode | undefined): HostController[] {
  return (extensionsImportOf(context)?.declarations ?? []).filter(isHostController);
}

export function hostFunctions(context: AstNode | undefined): HostFunction[] {
  return (extensionsImportOf(context)?.declarations ?? []).filter(isHostFunction);
}

const TYPES: Record<string, ParameterType> = {
  string: 'ParameterType:string',
  number: 'ParameterType:number',
  boolean: 'ParameterType:boolean',
  object: 'ParameterType:object',
  array: 'ParameterType:array',
};

function parameter(declaration: HostParameter): OperationParameter {
  return {
    name: declaration.name,
    // Untyped: any of the basic types (an empty list would accept nothing)
    type: declaration.type ? [TYPES[declaration.type]] : Object.values(TYPES),
    required: !declaration.optional,
    description: undefined,
  };
}

const signatures = new WeakMap<HostOperation | HostController, OperationSignature>();

/** A host operation or controller declaration as an operation signature. */
export function hostSignature(declaration: HostOperation | HostController): OperationSignature {
  let signature = signatures.get(declaration);
  if (!signature) {
    const module = AstUtils.getContainerOfType(declaration, isExtensionsImport)?.path ?? '?';
    signature = {
      systemName: declaration.name,
      description: `${isHostOperation(declaration) ? 'Host operation' : 'Host controller'} from ${module}`,
      parameters: declaration.parameters.map(parameter),
      dependencies: [],
      outputs: [],
      category: 'Host',
    };
    signatures.set(declaration, signature);
  }
  return signature;
}

/** The host operation called `name` in the program of `context`. */
export function findHostOperation(
  name: string,
  context: AstNode | undefined
): HostOperation | undefined {
  return hostOperations(context).find(operation => operation.name === name);
}

/** The host controller called `name` in the program of `context`. */
export function findHostController(
  name: string,
  context: AstNode | undefined
): HostController | undefined {
  return hostControllers(context).find(controller => controller.name === name);
}

/** What the bundler and the preview need: the module and the declared names. */
export interface HostModule {
  /** The import path as written (relative to the program) */
  readonly path: string;
  readonly operations: readonly string[];
  readonly controllers: readonly string[];
  readonly functions: readonly string[];
}

export function hostModuleOf(program: Program): HostModule | undefined {
  const extensions = extensionsImportOfProgram(program);
  if (!extensions?.path) return undefined;
  const names = (kind: (d: unknown) => boolean) =>
    extensions.declarations.filter(kind).map(d => (d as { name: string }).name);
  return {
    path: extensions.path,
    operations: names(isHostOperation),
    controllers: names(isHostController),
    functions: names(isHostFunction),
  };
}

/**
 * The metadata of the controller `name`: an Eligius one, else a host
 * controller of the program of `context`.
 */
export function controllerMetadata(
  name: string,
  context: AstNode | undefined
): ControllerMetadata | undefined {
  const builtIn = getController(name);
  if (builtIn) return builtIn;
  const host = findHostController(name, context);
  if (!host) return undefined;
  const signature = hostSignature(host);
  return {
    name: host.name,
    description: signature.description,
    parameters: signature.parameters.map(p => ({
      name: p.name,
      type: typeof p.type[0] === 'string' ? p.type[0] : 'ParameterType:any',
      required: p.required,
    })),
    dependencies: ['selectedElement'],
  };
}

/** Whether `name` is an Eligius controller or a host controller of the program of `context`. */
export function isKnownController(name: string, context: AstNode | undefined): boolean {
  return controllerMetadata(name, context) !== undefined;
}
