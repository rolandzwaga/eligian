import type { ValidationAcceptor } from 'langium';
import { hostFunctions } from '../compiler/operations/host-operations.js';
import { isBuiltInOperation } from '../compiler/operations/index.js';
import { getController } from '../completion/metadata/controllers.generated.js';
import {
  type ExtensionsImport,
  isExtensionsImport,
  isHostController,
  isHostFunction,
  isHostOperation,
  isStringLiteral,
  type OperationCall,
  type Program,
} from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { BaseValidator } from './base-validator.js';

/** File types esbuild bundles as the host module. */
const MODULE_EXTENSIONS = /\.(m?[jt]s|[jt]sx)$/i;

/**
 * Validates `extensions "./host.ts" { … }` (audit idea #24): the module path,
 * the declarations (no duplicates, no clash with an Eligius operation or
 * controller: Eligius refuses to register a built-in name), and
 * `customFunction("…")` names.
 */
export class ExtensionsValidator extends BaseValidator {
  checkSingleExtensionsImport(program: Program, accept: ValidationAcceptor): void {
    const imports = program.statements.filter(isExtensionsImport);
    for (const extra of imports.slice(1)) {
      accept('error', 'A program has one extensions import; declare everything in the first one', {
        node: extra,
        data: { code: 'duplicate_extensions_import' },
      });
    }
  }

  checkExtensionsImport(node: ExtensionsImport, accept: ValidationAcceptor): void {
    if (node.path !== undefined) {
      if (!node.path.startsWith('./') && !node.path.startsWith('../')) {
        accept('error', `The extensions module path must be relative ("./${node.path}")`, {
          node,
          property: 'path',
          data: { code: 'extensions_path_not_relative' },
        });
      } else if (!MODULE_EXTENSIONS.test(node.path)) {
        accept('error', 'The extensions module must be a .js, .mjs, .ts, .mts, .jsx or .tsx file', {
          node,
          property: 'path',
          data: { code: 'extensions_path_type' },
        });
      }
    }

    const seen = new Map<string, string>();
    for (const declaration of node.declarations) {
      if (!declaration.name) continue;
      const kind = isHostOperation(declaration)
        ? 'operation'
        : isHostController(declaration)
          ? 'controller'
          : 'function';
      const key = `${kind}:${declaration.name}`;
      if (seen.has(key)) {
        accept('error', `Duplicate host ${kind} '${declaration.name}'`, {
          node: declaration,
          property: 'name',
          data: { code: 'duplicate_host_declaration' },
        });
      }
      seen.set(key, kind);
      if (kind === 'operation' && isBuiltInOperation(declaration.name)) {
        accept(
          'error',
          `'${declaration.name}' is an Eligius operation: a host operation needs another name`,
          { node: declaration, property: 'name', data: { code: 'host_operation_builtin' } }
        );
      }
      if (kind === 'controller' && getController(declaration.name)) {
        accept(
          'error',
          `'${declaration.name}' is an Eligius controller: a host controller needs another name`,
          { node: declaration, property: 'name', data: { code: 'host_controller_builtin' } }
        );
      }
      if (!isHostFunction(declaration)) {
        const names = new Set<string>();
        for (const parameter of declaration.parameters) {
          if (names.has(parameter.name)) {
            accept('error', `Duplicate parameter '${parameter.name}'`, {
              node: parameter,
              property: 'name',
              data: { code: 'duplicate_host_parameter' },
            });
          }
          names.add(parameter.name);
        }
      }
    }
  }

  /** `customFunction("name")`: a function the extensions import declares. */
  checkCustomFunctionName(call: OperationCall, accept: ValidationAcceptor): void {
    if (getOperationCallName(call) !== 'customFunction') return;
    const name = call.args[0];
    if (!isStringLiteral(name)) return;
    const functions = hostFunctions(call).map(f => f.name);
    if (functions.includes(name.value)) return;
    accept(
      'warning',
      functions.length > 0
        ? `Unknown function '${name.value}': the extensions import declares ${functions.map(f => `'${f}'`).join(', ')}`
        : `Unknown function '${name.value}': declare it in an extensions import (extensions "./host.ts" { function ${name.value} })`,
      { node: name, data: { code: 'unknown_host_function' } }
    );
  }
}
