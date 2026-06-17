/**
 * Scope context for AST transformation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS). Tracks how references are resolved during transformation and
 * carries the per-compilation constant maps.
 */
import type { ConstantMap } from '../types/constant-folding.js';

/**
 * Scope Context - Track transformation context for reference resolution
 *
 * Used to determine how to resolve references:
 * - Bare identifiers → action parameters (when inActionBody=true)
 * - @@identifier → system context properties (with loop variable aliasing)
 * - @identifier → user variables (context.variables.*)
 *
 * Also tracks action-scoped constants for inlining optimization.
 */
export interface ScopeContext {
  /** Are we currently inside an action body? */
  inActionBody: boolean;
  /** Available action parameters (for bare identifier resolution) */
  actionParameters: string[];
  /** Current loop variable name (for aliasing @@varName → @@currentItem) */
  loopVariableName?: string;
  /** Action-scoped constants (for inlining within the current scope) */
  scopedConstants: ConstantMap;
  /**
   * Program-level constants for the compilation in progress (B3).
   *
   * Carried on the scope — rather than a module-level singleton — so that
   * concurrent `transformAST` calls (e.g. overlapping language-server
   * compilations) never clobber each other's constant maps. Every derived
   * scope copies this reference from its parent; root scopes receive the map
   * built once per `transformAST` invocation.
   */
  programConstants: ConstantMap;
  /** Event action parameter indices (Feature 028 - T019) */
  eventActionParameters?: Map<string, number>;
}

/**
 * Create an empty scope context.
 *
 * @param programConstants - Program-level constant map for this compilation
 *   (B3). Defaults to an empty map for the rare call sites that transform
 *   expressions with no enclosing program (and for tests).
 */
export function createEmptyScope(programConstants: ConstantMap = new Map()): ScopeContext {
  return {
    inActionBody: false,
    actionParameters: [],
    loopVariableName: undefined,
    scopedConstants: new Map(),
    programConstants,
  };
}

/**
 * Event Action Parameter Context (Feature 028 - T017)
 *
 * Maps parameter names to their indices in the eventArgs array.
 * Used during event action transformation to resolve parameter references.
 */
export interface EventActionContext {
  parameters: Map<string, number>;
}

/**
 * Create Parameter Context (Feature 028 - T017)
 *
 * Builds a parameter index map from an array of parameter names.
 * Each parameter is assigned its zero-based index in the array.
 *
 * @param params - Array of parameter names
 * @returns EventActionContext with parameter→index mapping
 */
export function createParameterContext(params: string[]): EventActionContext {
  const parameters = new Map<string, number>();
  params.forEach((name, index) => {
    parameters.set(name, index);
  });
  return { parameters };
}
