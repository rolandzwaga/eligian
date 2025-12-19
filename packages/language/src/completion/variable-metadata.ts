/**
 * Variable Metadata
 *
 * Metadata for system scope variables (@@) available in Eligian DSL.
 * These correspond to properties from the IOperationScope interface in Eligius.
 */

interface VariableMetadata {
  name: string;
  type: string;
  description: string;
  availableIn: 'loop' | 'action' | 'always';
}

/**
 * All available system scope variables
 *
 * These variables are accessible via @@ syntax in Eligian DSL
 * and map to IOperationScope properties from Eligius.
 */
const SYSTEM_VARIABLES: VariableMetadata[] = [
  {
    name: 'loopIndex',
    type: 'number',
    description: 'Current iteration index in a for loop (0-based)',
    availableIn: 'loop',
  },
  {
    name: 'loopLength',
    type: 'number',
    description: 'Total number of iterations in a for loop',
    availableIn: 'loop',
  },
  {
    name: 'loopStartIndex',
    type: 'number',
    description: 'Starting index of the loop',
    availableIn: 'loop',
  },
  {
    name: 'loopEndIndex',
    type: 'number',
    description: 'Ending index of the loop',
    availableIn: 'loop',
  },
  {
    name: 'currentIndex',
    type: 'number',
    description: 'Current execution index in the operation sequence',
    availableIn: 'always',
  },
  {
    name: 'currentItem',
    type: 'any',
    description: 'Current item being processed in a for loop',
    availableIn: 'loop',
  },
  {
    name: 'newIndex',
    type: 'number',
    description: 'New index after a loop iteration change',
    availableIn: 'loop',
  },
  {
    name: 'whenEvaluation',
    type: 'boolean',
    description: 'Result of the last when condition evaluation',
    availableIn: 'action',
  },
  {
    name: 'eventbus',
    type: 'IEventbus',
    description: 'Event bus instance for dispatching and listening to events',
    availableIn: 'always',
  },
  {
    name: 'operations',
    type: 'IResolvedOperation[]',
    description: 'Array of resolved operations in the current scope',
    availableIn: 'always',
  },
  {
    name: 'owner',
    type: 'any',
    description: 'Owner context object',
    availableIn: 'always',
  },
  {
    name: 'parent',
    type: 'IOperationScope',
    description: 'Parent operation scope',
    availableIn: 'always',
  },
  {
    name: 'variables',
    type: 'Record<string, unknown>',
    description: 'Custom variables defined in the current scope',
    availableIn: 'always',
  },
];

/**
 * Get variables available in the current context
 *
 * Filters system variables based on cursor context (inside loop, action, etc.)
 *
 * @param isInsideLoop - Whether cursor is inside a for loop
 * @returns Array of available variable metadata
 */
export function getAvailableVariables(isInsideLoop: boolean): VariableMetadata[] {
  return SYSTEM_VARIABLES.filter(variable => {
    if (variable.availableIn === 'always') {
      return true;
    }
    if (variable.availableIn === 'loop') {
      return isInsideLoop;
    }
    // 'action' context - always available in actions
    return true;
  });
}
