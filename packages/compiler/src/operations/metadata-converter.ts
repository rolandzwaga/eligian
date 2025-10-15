/**
 * Metadata Converter
 *
 * Converts Eligius IOperationMetadata into our OperationSignature format.
 * This provides a clean mapping from Eligius-native metadata to our registry types.
 */

import type {
  metadata
} from 'eligius';

import type {
  OperationSignature,
  OperationParameter,
  DependencyInfo,
  OutputInfo,
  ParameterType,
  ConstantValue,
} from './types.ts';

/**
 * Convert Eligius TParameterTypes to our ParameterType.
 * These should be identical, but we re-map for type safety.
 */
function convertParameterType(eligiusType: metadata.TParameterTypes): ParameterType {
  // Direct mapping - Eligius types match our types exactly
  return eligiusType as ParameterType;
}

/**
 * Convert Eligius TConstantParametersTypes[] to our ConstantValue[].
 */
function convertConstantValues(
  constants: metadata.TConstantParametersTypes[]
): ConstantValue[] {
  return constants.map((c) => ({
    value: c.value,
    isDefault: c.default,
    description: c.description,
  }));
}

/**
 * Check if property metadata is complex (has type field).
 */
function isComplexProperty(
  prop: metadata.TPropertyMetadata
): prop is metadata.TComplexPropertyMetadata {
  return typeof prop === 'object' && 'type' in prop && !('itemType' in prop);
}

/**
 * Check if property metadata is an array type.
 */
function isArrayProperty(
  prop: metadata.TPropertyMetadata
): prop is metadata.TArrayProperyMetadata {
  return typeof prop === 'object' && 'type' in prop && 'itemType' in prop;
}

/**
 * Check if property metadata is a simple ParameterType string.
 */
function isSimpleParameterType(
  prop: metadata.TPropertyMetadata
): prop is metadata.TParameterTypes {
  return typeof prop === 'string';
}

/**
 * Convert a single Eligius property metadata to our OperationParameter.
 */
function convertParameter(
  name: string,
  propertyMetadata: metadata.TPropertyMetadata
): OperationParameter {
  // Case 1: Simple parameter type string (e.g., 'ParameterType:string')
  if (isSimpleParameterType(propertyMetadata)) {
    return {
      name,
      type: convertParameterType(propertyMetadata),
      required: false, // Simple types default to optional
    };
  }

  // Case 2: Array property
  if (isArrayProperty(propertyMetadata)) {
    return {
      name,
      type: 'ParameterType:array',
      required: propertyMetadata.required ?? false,
      description: propertyMetadata.description,
    };
  }

  // Case 3: Complex property with type field
  if (isComplexProperty(propertyMetadata)) {
    const { type, required, defaultValue, description } = propertyMetadata;

    // Check if type is constant values array
    if (Array.isArray(type)) {
      return {
        name,
        type: convertConstantValues(type),
        required: required ?? false,
        defaultValue,
        description,
      };
    }

    // Otherwise it's a single ParameterType
    return {
      name,
      type: convertParameterType(type),
      required: required ?? false,
      defaultValue,
      description,
    };
  }

  // Fallback: treat as optional string (should never reach here)
  console.warn(`Unknown property metadata format for "${name}":`, propertyMetadata);
  return {
    name,
    type: 'ParameterType:string',
    required: false,
  };
}

/**
 * Convert Eligius dependentProperties to our DependencyInfo[].
 *
 * Note: Eligius metadata only provides dependency names, not types.
 * We infer type as 'ParameterType:object' for most dependencies (like selectedElement).
 * This could be enhanced with a manual mapping for known dependency types.
 */
function convertDependencies<T>(
  dependentProperties: (keyof T)[] | undefined
): DependencyInfo[] {
  if (!dependentProperties) return [];

  return dependentProperties.map((name) => ({
    name: String(name),
    // Most dependencies are objects (selectedElement: jQuery, template: object, etc.)
    // This could be enhanced with explicit type mapping if needed
    type: 'ParameterType:object' as ParameterType,
  }));
}

/**
 * Convert Eligius outputProperties to our OutputInfo[].
 */
function convertOutputs<T>(
  outputProperties: metadata.TPropertiesMetadata<T> | undefined
): OutputInfo[] {
  if (!outputProperties) return [];

  const outputs: OutputInfo[] = [];

  for (const [name, propertyMetadata] of Object.entries(outputProperties)) {
    // TPropertiesMetadata allows undefined/null values, skip them
    if (propertyMetadata === undefined || propertyMetadata === null) continue;

    // Type assertion: we've already filtered out undefined/null
    const metadata = propertyMetadata as metadata.TPropertyMetadata;

    // Extract the parameter type from property metadata
    if (isSimpleParameterType(metadata)) {
      outputs.push({
        name,
        type: convertParameterType(metadata),
      });
    } else if (isComplexProperty(metadata)) {
      const { type } = metadata;
      if (!Array.isArray(type)) {
        outputs.push({
          name,
          type: convertParameterType(type),
        });
      }
    } else if (isArrayProperty(metadata)) {
      outputs.push({
        name,
        type: 'ParameterType:array',
      });
    }
  }

  return outputs;
}

/**
 * Convert Eligius IOperationMetadata to our OperationSignature.
 *
 * @param systemName - The operation's system name (e.g., 'addClass')
 * @param operationMetadata - The Eligius metadata object
 * @param category - Optional category for grouping operations
 * @returns OperationSignature for use in the registry
 */
export function convertMetadata<T>(
  systemName: string,
  operationMetadata: metadata.IOperationMetadata<T>,
  category?: string
): OperationSignature {
  const {
    description,
    dependentProperties,
    properties,
    outputProperties,
  } = operationMetadata;

  // Convert parameters from properties object
  const parameters: OperationParameter[] = [];
  if (properties) {
    for (const [name, propertyMetadata] of Object.entries(properties)) {
      // TPropertiesMetadata allows undefined values, skip them
      if (propertyMetadata !== undefined) {
        parameters.push(convertParameter(name, propertyMetadata as metadata.TPropertyMetadata));
      }
    }
  }

  // Convert dependencies
  const dependencies = convertDependencies(dependentProperties);

  // Convert outputs
  const outputs = convertOutputs(outputProperties);

  return {
    systemName,
    description: description.trim(),
    parameters,
    dependencies,
    outputs,
    category,
  };
}
