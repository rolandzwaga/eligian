/**
 * CLI Utility Functions
 *
 * Provides helper functions for loading and compiling Eligian documents in a CLI context.
 * Follows Langium best practices for multi-document workspace management.
 *
 * Based on: langium/examples/domainmodel/src/cli/cli-util.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Program } from '@eligian/language';
import { createEligianServices } from '@eligian/language';
import type { LangiumDocument, WorkspaceFolder } from 'langium';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';

/**
 * Extract and validate an Eligian document from a file path.
 *
 * This function:
 * 1. Initializes the workspace with the file's directory as root
 * 2. Loads the main document using getOrCreateDocument
 * 3. Discovers and loads library dependencies
 * 4. Builds all documents together to enable cross-reference resolution
 * 5. Validates the main document
 *
 * @param fileName - Path to the .eligian file to load
 * @param extensions - Allowed file extensions (default: ['.eligian'])
 * @returns The validated LangiumDocument
 * @throws Process exits with code 1 if file doesn't exist or has validation errors
 */
export async function extractDocument(
  fileName: string,
  extensions: readonly string[] = ['.eligian']
): Promise<LangiumDocument<Program>> {
  // Validate file extension
  if (!extensions.includes(path.extname(fileName))) {
    console.error(`Please choose a file with one of these extensions: ${extensions.join(', ')}`);
    process.exit(1);
  }

  // Validate file exists
  if (!fs.existsSync(fileName)) {
    console.error(`File ${fileName} doesn't exist.`);
    process.exit(1);
  }

  // Create Eligian services with Node file system
  const services = createEligianServices(NodeFileSystem).Eligian;

  // Initialize workspace with the file's directory as root
  // This enables discovery of library files in the same directory tree
  await setRootFolder(fileName, services);

  // Load the main document - this reads from disk via FileSystemProvider
  const absolutePath = path.resolve(fileName);
  const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
    URI.file(absolutePath)
  );

  // Build the document - this will trigger library discovery and loading
  // The DocumentBuilder will:
  // 1. Parse the main document
  // 2. Discover library imports via our scope provider
  // 3. Load library documents
  // 4. Build all documents together (IndexedContent → Linked → Validated)
  await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

  // Check for validation errors
  const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
  if (validationErrors.length > 0) {
    console.error('Validation errors:');
    for (const error of validationErrors) {
      const line = error.range.start.line + 1;
      const col = error.range.start.column + 1;
      const text = document.textDocument.getText(error.range);
      console.error(`  ${fileName}:${line}:${col}: ${error.message}`);
      if (text) {
        console.error(`    ${text}`);
      }
    }
    process.exit(1);
  }

  return document as LangiumDocument<Program>;
}

/**
 * Extract the AST root node from a document file.
 *
 * Convenience wrapper around extractDocument that returns just the AST.
 *
 * @param fileName - Path to the .eligian file
 * @param extensions - Allowed file extensions
 * @returns The Program AST node
 */
export async function extractAstNode(
  fileName: string,
  extensions: readonly string[] = ['.eligian']
): Promise<Program> {
  const document = await extractDocument(fileName, extensions);
  return document.parseResult.value;
}

/**
 * Initialize workspace with a root folder.
 *
 * This sets up the workspace to discover files in the given directory tree.
 * Essential for multi-file projects with library imports.
 *
 * @param fileName - Reference file path (workspace root will be its directory)
 * @param services - Eligian language services
 * @param root - Optional explicit root directory (defaults to fileName's directory)
 */
async function setRootFolder(
  fileName: string,
  services: ReturnType<typeof createEligianServices>['Eligian'],
  root?: string
): Promise<void> {
  // Default root to file's directory
  if (!root) {
    root = path.dirname(fileName);
  }

  // Ensure absolute path
  if (!path.isAbsolute(root)) {
    root = path.resolve(process.cwd(), root);
  }

  // Create workspace folder descriptor
  const folders: WorkspaceFolder[] = [
    {
      name: path.basename(root),
      uri: URI.file(root).toString(),
    },
  ];

  // Initialize workspace - this enables file discovery
  await services.shared.workspace.WorkspaceManager.initializeWorkspace(folders);
}
