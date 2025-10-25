/**
 * Name Resolution for Unified Action/Operation Call Syntax
 *
 * This module provides name resolution functionality to distinguish between
 * custom action calls and built-in operation calls when both use identical syntax.
 */

import type { ActionDefinition, Program } from '../generated/ast.js';
import { getElements } from '../utils/program-helpers.js';
import { hasOperation, OPERATION_REGISTRY } from './operations/index.js';

/**
 * Name registry tracking both actions and operations
 */
export interface NameRegistry {
  operations: Set<string>;
  actions: Map<string, ActionDefinition>;
}

/**
 * Result of resolving a call name
 */
export type CallResolutionResult =
  | { resolved: true; type: 'action'; target: ActionDefinition }
  | { resolved: true; type: 'operation' }
  | { resolved: false; suggestions: string[] };

/**
 * Build name registry from a program
 * T036: Name registry builder with T037 (operations) and T038 (actions)
 */
export function buildNameRegistry(program: Program): NameRegistry {
  const operations = new Set<string>();
  const actions = new Map<string, ActionDefinition>();

  // T037: Populate operations from OPERATION_REGISTRY (48 operations)
  for (const opName of Object.keys(OPERATION_REGISTRY)) {
    operations.add(opName);
  }

  // T038: Populate actions from program's ActionDefinition nodes
  for (const element of getElements(program)) {
    if (
      element.$type === 'RegularActionDefinition' ||
      element.$type === 'EndableActionDefinition'
    ) {
      actions.set(element.name, element);
    }
  }

  return { operations, actions };
}

/**
 * Find action by name in a program
 * T018: Helper function for action lookup
 */
export function findActionByName(name: string, program: Program): ActionDefinition | undefined {
  for (const element of getElements(program)) {
    if (
      (element.$type === 'RegularActionDefinition' ||
        element.$type === 'EndableActionDefinition') &&
      element.name === name
    ) {
      return element;
    }
  }
  return undefined;
}

/**
 * Resolve a call name to action or operation
 * T019: Call resolution function
 */
export function resolveCallName(callName: string, registry: NameRegistry): CallResolutionResult {
  // Check actions first (more specific - user-defined)
  const action = registry.actions.get(callName);
  if (action) {
    return { resolved: true, type: 'action', target: action };
  }

  // Check operations (built-in)
  if (hasOperation(callName)) {
    return { resolved: true, type: 'operation' };
  }

  // Not found - provide suggestions
  const suggestions = suggestSimilarNames(callName, registry);
  return { resolved: false, suggestions };
}

/**
 * Suggest similar names when a call cannot be resolved
 * Uses simple prefix matching and edit distance
 */
function suggestSimilarNames(query: string, registry: NameRegistry, maxSuggestions = 3): string[] {
  const candidates: Array<{ name: string; score: number }> = [];

  // Add action names
  for (const actionName of registry.actions.keys()) {
    const score = similarity(query, actionName);
    if (score > 0) {
      candidates.push({ name: actionName, score });
    }
  }

  // Note: For operations, we'd need to iterate the registry which is expensive
  // For now, we'll suggest only from actions. Operation suggestions can be added later.

  // Sort by score (higher is better) and return top N
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(c => c.name);
}

/**
 * Suggest similar action names using Levenshtein distance (T063)
 *
 * @param unknownName - The unknown action name to find suggestions for
 * @param availableActions - Array of available action names
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @param maxDistance - Maximum Levenshtein distance for suggestions (default: 3)
 * @returns Array of similar action names, sorted by distance
 *
 * @example
 * const suggestions = suggestSimilarActions('fadIn', ['fadeIn', 'fadeOut', 'slideIn']);
 * // ['fadeIn']
 */
export function suggestSimilarActions(
  unknownName: string,
  availableActions: string[],
  maxSuggestions: number = 3,
  maxDistance: number = 3
): string[] {
  // Calculate Levenshtein distance for each action name
  const distances = availableActions.map(name => ({
    name,
    distance: levenshteinDistance(unknownName.toLowerCase(), name.toLowerCase()),
  }));

  // Filter by distance threshold, sort by distance (closest first), and return top N
  return distances
    .filter(item => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(item => item.name);
}

/**
 * Calculate Levenshtein distance between two strings
 * (Edit distance - minimum number of single-character edits needed)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Simple similarity metric (prefix matching + case-insensitive)
 */
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Exact match (case-insensitive)
  if (aLower === bLower) return 100;

  // Prefix match
  if (bLower.startsWith(aLower)) return 50;
  if (aLower.startsWith(bLower)) return 40;

  // Contains
  if (bLower.includes(aLower)) return 20;
  if (aLower.includes(bLower)) return 15;

  return 0;
}
