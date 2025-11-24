/**
 * Generic Import Processor
 *
 * Unified import processing logic for CSS, labels, and HTML imports.
 * Eliminates ~150 lines of duplicated code by using a configuration-driven approach.
 *
 * Key Features:
 * - Handles both one-to-many (CSS) and one-to-one (labels, HTML) relationships
 * - Always registers imports even when files don't exist (enables hot-reload)
 * - Uses hasImport() for loop prevention in one-to-one imports
 * - Error handling with empty metadata registration
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Program } from '@eligian/language';
import { isDefaultImport, isProgram } from '@eligian/language';
import { URI } from 'vscode-uri';

/**
 * Connection interface for sending notifications
 */
export interface Connection {
  sendNotification(type: string, params: unknown): void;
}

/**
 * Import processor configuration
 *
 * Generic configuration that adapts to different import types:
 * - CSS (one-to-many): Document can import multiple CSS files
 * - Labels (one-to-one): Document imports single labels file
 * - HTML (one-to-one): Document imports single HTML/layout file
 */
export interface ImportProcessorConfig<TMetadata> {
  /**
   * Import type to process (matches DefaultImport.type in AST)
   */
  importType: 'styles' | 'labels' | 'layout';

  /**
   * Parse file content into metadata
   * Should throw on error (empty metadata will be registered instead)
   */
  parseFile: (content: string, filePath: string) => TMetadata;

  /**
   * Create empty metadata for error cases
   */
  createEmptyMetadata: () => TMetadata;

  /**
   * Registry to update with parsed metadata
   */
  registry: {
    updateFile: (uri: string, metadata: TMetadata) => void;
    registerImports: (docUri: string, fileUri: string | string[]) => void;
    hasImport?: (docUri: string) => boolean; // Optional: for loop prevention in one-to-one
  };

  /**
   * Notification configuration
   */
  notification: {
    type: string;
    createParams: (documentUri: string, fileUris: string | string[]) => unknown;
  };

  /**
   * Import cardinality:
   * - 'one': one-to-one (labels, HTML) - uses hasImport() for loop prevention
   * - 'many': one-to-many (CSS) - always sends notification
   */
  cardinality: 'one' | 'many';
}

/**
 * Generic import processor
 *
 * Processes imports from an Eligian document AST and:
 * 1. Extracts imports matching config.importType
 * 2. Resolves relative paths to absolute URIs
 * 3. Parses files using config.parseFile()
 * 4. Registers metadata with config.registry
 * 5. Sends notification to extension (with loop prevention for one-to-one)
 *
 * @param documentUri - URI of the Eligian document being processed
 * @param root - Parsed AST Program node
 * @param docDir - Directory containing the document (for path resolution)
 * @param connection - LSP connection for sending notifications
 * @param config - Import processor configuration
 */
export function processImports<TMetadata>(
  documentUri: string,
  root: Program,
  docDir: string,
  connection: Connection,
  config: ImportProcessorConfig<TMetadata>
): void {
  if (!isProgram(root)) {
    return;
  }

  // Check if this is a new import (for one-to-one cardinality only)
  const isNewImport =
    config.cardinality === 'one' && config.registry.hasImport
      ? !config.registry.hasImport(documentUri)
      : true; // For one-to-many, always treat as new

  // Collect file URIs for notification
  const fileUris: string[] = [];

  // Process each import statement
  for (const statement of root.statements) {
    if (!isDefaultImport(statement) || statement.type !== config.importType) {
      continue;
    }

    if (!statement.path) {
      continue;
    }

    // Remove quotes from path
    const importPath = statement.path.replace(/^["']|["']$/g, '');

    // Resolve to absolute path
    const cleanPath = importPath.startsWith('./') ? importPath.substring(2) : importPath;
    const absolutePath = path.join(docDir, cleanPath);
    const fileUri = URI.file(absolutePath).toString();

    // Track URI for notification
    fileUris.push(fileUri);

    // Parse and register file
    try {
      // Read and parse file
      const content = readFileSync(absolutePath, 'utf-8');
      const metadata = config.parseFile(content, absolutePath);

      // Update registry with parsed metadata
      config.registry.updateFile(fileUri, metadata);
    } catch (_error) {
      // File doesn't exist or parsing failed
      // Register with empty metadata so hot-reload watcher is still set up
      const emptyMetadata = config.createEmptyMetadata();
      config.registry.updateFile(fileUri, emptyMetadata);
    }
  }

  // Register imports with registry
  if (fileUris.length > 0) {
    if (config.cardinality === 'one') {
      // One-to-one: register single file URI (take last one if multiple)
      config.registry.registerImports(documentUri, fileUris[fileUris.length - 1]);
    } else {
      // One-to-many: register all file URIs
      config.registry.registerImports(documentUri, fileUris);
    }
  }

  // Send notification to extension (with loop prevention for one-to-one)
  if (fileUris.length > 0 && isNewImport) {
    const params =
      config.cardinality === 'one'
        ? config.notification.createParams(documentUri, fileUris[fileUris.length - 1])
        : config.notification.createParams(documentUri, fileUris);

    connection.sendNotification(config.notification.type, params);
  }
}
