/**
 * Contract: Controller Metadata Generator API
 *
 * Defines the structure of generated controller metadata and the generator interface.
 * This metadata is extracted from Eligius ctrlmetadata at build time and used for
 * validation, transformation, and IDE support.
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US1 (P1), US2 (P2), US3 (P3)
 */

/**
 * Controller Metadata
 *
 * Represents complete metadata for a single Eligius controller type.
 * Generated from `import { ctrlmetadata } from 'eligius'` at build time.
 */
export interface ControllerMetadata {
  /** Controller class name (e.g., "LabelController", "NavigationController") */
  name: string;

  /** Human-readable description from controller metadata */
  description: string;

  /** Array of parameter metadata in order (positional mapping) */
  parameters: ControllerParameterMetadata[];

  /** Array of dependency parameter names (e.g., ["selectedElement"]) */
  dependencies: string[];
}

/**
 * Controller Parameter Metadata
 *
 * Represents metadata for a single parameter of a controller.
 * Extracted from Eligius controller metadata `properties` field.
 */
export interface ControllerParameterMetadata {
  /** Parameter identifier (e.g., "labelId", "url", "json") */
  name: string;

  /** Parameter type string or enum (e.g., "ParameterType:labelId") */
  type: string | Array<{ value: string }>;

  /** Whether parameter is required (true) or optional (false) */
  required: boolean;

  /** Default value if parameter is optional */
  defaultValue?: unknown;

  /** Human-readable parameter description */
  description?: string;
}

/**
 * Metadata Generator Service
 *
 * Generates controller metadata from Eligius ctrlmetadata at build time.
 */
export interface IMetadataGenerator {
  /**
   * Generate controllers.generated.ts from Eligius ctrlmetadata
   *
   * Workflow:
   * 1. Import ctrlmetadata from 'eligius' npm package
   * 2. Loop through exported controller metadata functions
   * 3. Call each function to get metadata object
   * 4. Extract properties, dependencies, description
   * 5. Convert to ControllerMetadata structure
   * 6. Generate TypeScript module with CONTROLLERS constant
   *
   * Output file: packages/language/src/completion/metadata/controllers.generated.ts
   *
   * @returns Number of controllers generated
   *
   * @example
   * // CLI usage: tsx src/completion/generate-metadata.ts
   * const count = generateControllersMetadata(ctrlmetadata);
   * console.log(`Generated metadata for ${count} controllers`);
   * // → "Generated metadata for 8 controllers"
   */
  generateControllersMetadata(ctrlmetadataModule: unknown): number;

  /**
   * Convert Eligius controller metadata to simplified structure
   *
   * @param name - Controller class name
   * @param metadataFn - Metadata function from ctrlmetadata export
   * @returns Simplified ControllerMetadata object
   *
   * @example
   * convertMetadata('LabelController', ctrlmetadata.LabelController)
   * // → {
   * //   name: "LabelController",
   * //   description: "This controller attaches to...",
   * //   parameters: [
   * //     { name: "labelId", type: "ParameterType:labelId", required: true },
   * //     { name: "attributeName", type: "ParameterType:string", required: false }
   * //   ],
   * //   dependencies: ["selectedElement"]
   * // }
   */
  convertMetadata(name: string, metadataFn: () => unknown): ControllerMetadata;
}

/**
 * Generated Metadata Module Structure
 *
 * The structure of the generated controllers.generated.ts file.
 */
export interface IGeneratedControllersModule {
  /** Array of all controller metadata (alphabetically sorted) */
  CONTROLLERS: ControllerMetadata[];

  /** Type guard to check if a name is a valid controller */
  isController(name: string): boolean;

  /** Get controller metadata by name (O(1) lookup) */
  getController(name: string): ControllerMetadata | undefined;
}

/**
 * Parameter Type Catalog
 *
 * All possible ParameterType values from Eligius.
 * Used for type validation and IDE support.
 */
export enum ParameterType {
  /** Label ID reference (validated against label files - Feature 034) */
  LABEL_ID = 'ParameterType:labelId',

  /** String literal or variable */
  STRING = 'ParameterType:string',

  /** Numeric value */
  NUMBER = 'ParameterType:number',

  /** Boolean value */
  BOOLEAN = 'ParameterType:boolean',

  /** Object literal */
  OBJECT = 'ParameterType:object',

  /** Array literal */
  ARRAY = 'ParameterType:array',

  /** URL string */
  URL = 'ParameterType:url',
}
