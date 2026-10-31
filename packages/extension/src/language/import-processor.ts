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
import type { Program } from '@eligian/language';
import {
  isCssImport,
  isDefaultImport,
  isProgram,
  resolveImportRelativePath,
} from '@eligian/language';
import { URI } from 'vscode-uri';

/**
 * Connection interface for sending notifications
 */
interface Connection {
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
  importType: 'styles' | 'locales' | 'layout';

  /**
   * Also process named imports that resolve to CSS (`import theme from "./x.css"`).
   * Only meaningful for `importType: 'styles'`: the compiler bundles those into
   * `config.cssFiles`, so their classes must be registered for validation too.
   */
  includeNamedCssImports?: boolean;

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
    hasImport?: (docUri: string) => boolean; // Optional: legacy loop prevention in one-to-one

    /**
     * Optional: URIs previously registered for the document (empty when none).
     * Read BEFORE registering, so a retargeted or removed import can be announced.
     * When supplied it supersedes `hasImport` for change detection.
     */
    getImports?: (docUri: string) => string[];

    /**
     * Optional: drop the document's registration when its import is removed
     * (one-to-one registries cannot be "re-registered" with nothing).
     */
    clearImports?: (docUri: string) => void;
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
   * - 'one': one-to-one (labels, HTML) - notifies when the imported file changed
   *   (new, retargeted or removed); removal sends an empty URI
   * - 'many': one-to-many (CSS) - always notifies when imports exist, and sends an
   *   empty list when the last import was removed
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

  // Snapshot what was registered BEFORE this pass so changes can be detected.
  const previousImports = config.registry.getImports?.(documentUri);
  const hadPreviousImport =
    previousImports !== undefined
      ? previousImports.length > 0
      : (config.registry.hasImport?.(documentUri) ?? false);

  // Collect file URIs for notification
  const fileUris: string[] = [];

  // Process each import statement
  for (const statement of root.statements) {
    const matches =
      (isDefaultImport(statement) && statement.type === config.importType) ||
      (config.includeNamedCssImports === true && isCssImport(statement));
    if (!matches || !('path' in statement)) {
      continue;
    }

    if (!statement.path) {
      continue;
    }

    // Resolve to absolute path (D4: shared resolution, path.join handles ./, ., ../)
    const absolutePath = resolveImportRelativePath(statement.path, docDir);
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

  // For one-to-one imports, only a single file is meaningful. A well-formed
  // document has exactly one (duplicates are flagged as errors by the
  // validator), but if several slip through, register/notify the FIRST
  // occurrence and warn rather than silently dropping all but the last.
  if (config.cardinality === 'one' && fileUris.length > 1) {
    console.warn(
      `Multiple '${config.importType}' imports found in ${documentUri}; ` +
        `using the first ('${fileUris[0]}') and ignoring ${fileUris.length - 1} other(s).`
    );
  }

  // Register imports with registry
  if (fileUris.length > 0) {
    if (config.cardinality === 'one') {
      // One-to-one: register the first file URI
      config.registry.registerImports(documentUri, fileUris[0]);
    } else {
      // One-to-many: register all file URIs
      config.registry.registerImports(documentUri, fileUris);
    }
  } else if (hadPreviousImport) {
    // The import was removed: drop the stale registration.
    if (config.cardinality === 'many') {
      config.registry.registerImports(documentUri, []);
    } else {
      config.registry.clearImports?.(documentUri);
    }
  }

  // Decide whether the extension must be told about this document's imports.
  let shouldNotify: boolean;
  if (fileUris.length === 0) {
    // Only announce removal (the extension drops its mapping); nothing to say otherwise.
    shouldNotify = hadPreviousImport;
  } else if (config.cardinality === 'many') {
    shouldNotify = true;
  } else if (previousImports !== undefined) {
    // Loop prevention: notify only when the file is new or was retargeted.
    shouldNotify = previousImports[0] !== fileUris[0];
  } else {
    shouldNotify = !hadPreviousImport;
  }

  if (shouldNotify) {
    const params =
      config.cardinality === 'one'
        ? config.notification.createParams(documentUri, fileUris[0] ?? '')
        : config.notification.createParams(documentUri, fileUris);

    connection.sendNotification(config.notification.type, params);
  }
}
