/**
 * Operation Registry Generator
 *
 * This script generates the operation registry by importing all Eligius metadata
 * functions and converting them to our OperationSignature format.
 *
 * Run with: npm run generate:registry
 *
 * Output: packages/compiler/src/operations/registry.generated.ts
 */

import { metadata } from 'eligius';
import { convertMetadata } from './metadata-converter.js';
import type { OperationRegistry } from './types.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Operation categories for grouping related operations.
 * This helps with IDE organization and documentation.
 */
const OPERATION_CATEGORIES: Record<string, string> = {
  // DOM Selection & Manipulation
  'selectElement': 'DOM',
  'createElement': 'DOM',
  'removeElement': 'DOM',
  'clearElement': 'DOM',
  'reparentElement': 'DOM',
  'toggleElement': 'DOM',

  // CSS Classes
  'addClass': 'CSS',
  'removeClass': 'CSS',
  'toggleClass': 'CSS',

  // Element Content & Attributes
  'setElementContent': 'Content',
  'setElementAttributes': 'Attributes',
  'getAttributesFromElement': 'Attributes',

  // Styling
  'setStyle': 'Styling',
  'animate': 'Animation',
  'animateWithClass': 'Animation',

  // Actions
  'startAction': 'Actions',
  'endAction': 'Actions',
  'requestAction': 'Actions',
  'resizeAction': 'Actions',

  // Controllers
  'addControllerToElement': 'Controllers',
  'removeControllerFromElement': 'Controllers',
  'getControllerFromElement': 'Controllers',
  'getControllerInstance': 'Controllers',
  'extendController': 'Controllers',

  // Data Management
  'setData': 'Data',
  'setGlobalData': 'Data',
  'setOperationData': 'Data',
  'clearOperationData': 'Data',
  'removePropertiesFromOperationData': 'Data',
  'addGlobalsToOperation': 'Data',
  'getElementDimensions': 'Data',
  'getQueryParams': 'Data',
  'getImport': 'Data',
  'loadJson': 'Data',

  // Control Flow
  'when': 'Control Flow',
  'otherwise': 'Control Flow',
  'endWhen': 'Control Flow',
  'forEach': 'Control Flow',
  'endForEach': 'Control Flow',

  // Events
  'broadcastEvent': 'Events',

  // Utilities
  'calc': 'Utilities',
  'math': 'Utilities',
  'log': 'Utilities',
  'wait': 'Utilities',
  'customFunction': 'Utilities',
  'invokeObjectMethod': 'Utilities',
};

/**
 * Mapping of metadata function names to operation system names.
 * Most are camelCase → camelCase, but this allows for exceptions.
 */
const OPERATION_SYSTEM_NAMES: Record<string, string> = {
  addClass: 'addClass',
  addControllerToElement: 'addControllerToElement',
  addGlobalsToOperation: 'addGlobalsToOperation',
  animate: 'animate',
  animateWithClass: 'animateWithClass',
  broadcastEvent: 'broadcastEvent',
  calc: 'calc',
  clearElement: 'clearElement',
  clearOperationData: 'clearOperationData',
  createElement: 'createElement',
  customFunction: 'customFunction',
  endAction: 'endAction',
  endForEach: 'endForEach',
  endWhen: 'endWhen',
  extendController: 'extendController',
  forEach: 'forEach',
  getAttributesFromElement: 'getAttributesFromElement',
  getControllerFromElement: 'getControllerFromElement',
  getControllerInstance: 'getControllerInstance',
  getElementDimensions: 'getElementDimensions',
  getImport: 'getImport',
  getQueryParams: 'getQueryParams',
  invokeObjectMethod: 'invokeObjectMethod',
  loadJson: 'loadJson',
  log: 'log',
  math: 'math',
  otherwise: 'otherwise',
  removeClass: 'removeClass',
  removeControllerFromElement: 'removeControllerFromElement',
  removeElement: 'removeElement',
  removePropertiesFromOperationData: 'removePropertiesFromOperationData',
  reparentElement: 'reparentElement',
  requestAction: 'requestAction',
  resizeAction: 'resizeAction',
  selectElement: 'selectElement',
  setData: 'setData',
  setElementAttributes: 'setElementAttributes',
  setElementContent: 'setElementContent',
  setGlobalData: 'setGlobalData',
  setOperationData: 'setOperationData',
  setStyle: 'setStyle',
  startAction: 'startAction',
  toggleClass: 'toggleClass',
  toggleElement: 'toggleElement',
  wait: 'wait',
  when: 'when',
};

/**
 * Generate the operation registry by converting all Eligius metadata.
 */
function generateRegistry(): OperationRegistry {
  const registry: OperationRegistry = {};

  // Iterate through all exported metadata functions
  for (const [functionName, metadataFunction] of Object.entries(metadata)) {
    // Skip non-function exports (like types)
    if (typeof metadataFunction !== 'function') continue;

    // Get the system name for this operation
    const systemName = OPERATION_SYSTEM_NAMES[functionName];
    if (!systemName) {
      console.warn(`No system name mapping for metadata function: ${functionName}`);
      continue;
    }

    // Call the metadata function to get IOperationMetadata
    const operationMetadata = metadataFunction();

    // Get category if available
    const category = OPERATION_CATEGORIES[systemName];

    // Convert to our OperationSignature format
    const signature = convertMetadata(systemName, operationMetadata, category);

    // Add to registry
    registry[systemName] = signature;
  }

  return registry;
}

/**
 * Generate TypeScript code for the registry file.
 */
function generateRegistryCode(registry: OperationRegistry): string {
  const registryJson = JSON.stringify(registry, null, 2);

  return `/**
 * Generated Operation Registry
 *
 * This file is auto-generated by generate-registry.ts
 * DO NOT EDIT MANUALLY - changes will be overwritten
 *
 * Generated: ${new Date().toISOString()}
 * Total operations: ${Object.keys(registry).length}
 */

import type { OperationRegistry } from './types.js';

export const OPERATION_REGISTRY: OperationRegistry = ${registryJson};
`;
}

/**
 * Main entry point - generate and write the registry file.
 */
function main() {
  console.log('🔨 Generating operation registry...');

  // Generate registry from Eligius metadata
  const registry = generateRegistry();

  console.log(`✅ Generated ${Object.keys(registry).length} operation signatures`);

  // Generate TypeScript code
  const code = generateRegistryCode(registry);

  // Write to output file
  const outputPath = join(__dirname, 'registry.generated.ts');
  writeFileSync(outputPath, code, 'utf-8');

  console.log(`📝 Written to: ${outputPath}`);

  // Print summary by category
  const categoryCounts: Record<string, number> = {};
  for (const signature of Object.values(registry)) {
    const category = signature.category ?? 'Uncategorized';
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  console.log('\n📊 Operations by category:');
  for (const [category, count] of Object.entries(categoryCounts).sort()) {
    console.log(`  ${category}: ${count}`);
  }
}

// Run main function
main();
