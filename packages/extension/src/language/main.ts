import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  CSS_ERROR_NOTIFICATION,
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  CSS_UPDATED_NOTIFICATION,
  type CSSErrorParams,
  type CSSImportsDiscoveredParams,
  type CSSUpdatedParams,
  createEligianServices,
  findActionBelow,
  generateJSDocContent,
  isDefaultImport,
  isProgram,
  parseCSS,
} from '@eligian/language';
import { DocumentState } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { URI } from 'vscode-uri';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, Eligian } = createEligianServices({ connection, ...NodeFileSystem });

// Register CSS notification handlers
connection.onNotification(CSS_UPDATED_NOTIFICATION, (params: CSSUpdatedParams) => {
  const { cssFileUri, documentUris } = params;

  try {
    // Read CSS file content from file system
    const cssFilePath = URI.parse(cssFileUri).fsPath;
    const cssContent = readFileSync(cssFilePath, 'utf-8');

    // Parse CSS to extract classes, IDs, and metadata
    const parseResult = parseCSS(cssContent, cssFilePath);

    // Update the CSS registry with parsed metadata
    const cssRegistry = Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile(cssFileUri, parseResult);

    // Trigger re-validation of importing documents
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        // Force re-validation by invalidating document state
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  } catch (error) {
    // Log error but don't fail - CSS loading errors should be handled by CSSErrorParams
    console.error(`Failed to process CSS update for ${cssFileUri}:`, error);
  }
});

connection.onNotification(CSS_ERROR_NOTIFICATION, (params: CSSErrorParams) => {
  const { cssFileUri, errors } = params;

  // Store error metadata in CSS registry with empty classes/IDs
  const cssRegistry = Eligian.css.CSSRegistry;
  cssRegistry.updateCSSFile(cssFileUri, {
    classes: new Set(),
    ids: new Set(),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors,
  });
});

// CRITICAL: CSS files MUST be loaded BEFORE validation phase
// This handler runs during DocumentState.Parsed phase (after parsing, BEFORE validation)
// Synchronization mechanism: Langium awaits this handler completion before proceeding to validation
// Why: Validators (e.g., CSS class validation) require CSS registry to be populated
// This synchronous ordering ensures IDE and compiler validation produce identical results
shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Parsed, async documents => {
  const cssRegistry = Eligian.css.CSSRegistry;

  for (const document of documents) {
    // Only process Eligian documents
    if (document.uri.path.endsWith('.eligian')) {
      const documentUri = document.uri.toString();

      // Extract CSS imports from the AST directly (validator hasn't run yet)
      const cssFiles: string[] = [];
      const root = document.parseResult.value;
      if (isProgram(root)) {
        for (const statement of root.statements) {
          if (isDefaultImport(statement) && statement.type === 'styles') {
            if (!statement.path) {
              continue;
            }
            const cssPath = statement.path.replace(/^["']|["']$/g, ''); // Remove quotes
            cssFiles.push(cssPath);
          }
        }
      }

      // Resolve CSS file paths to absolute URIs for the extension
      const cssFileUris: string[] = [];
      const docPath = URI.parse(documentUri).fsPath;
      const docDir = path.dirname(docPath);

      // Parse each CSS file and load into registry (if not already loaded)
      for (const cssFileRelativePath of cssFiles) {
        try {
          // Convert relative path to absolute file path (cross-platform)
          const cleanPath = cssFileRelativePath.startsWith('./')
            ? cssFileRelativePath.substring(2)
            : cssFileRelativePath;
          const cssFilePath = path.join(docDir, cleanPath);
          const cssFileUri = URI.file(cssFilePath).toString();

          // Track absolute URI for notification
          cssFileUris.push(cssFileUri);

          // Read and parse CSS file
          const cssContent = readFileSync(cssFilePath, 'utf-8');
          const parseResult = parseCSS(cssContent, cssFilePath);

          // Update registry with parsed CSS (use absolute URI as key)
          cssRegistry.updateCSSFile(cssFileUri, parseResult);
        } catch (error) {
          console.error(`Failed to parse CSS file ${cssFileRelativePath}:`, error);
          // Still track the URI even if parsing failed
          const cleanPath = cssFileRelativePath.startsWith('./')
            ? cssFileRelativePath.substring(2)
            : cssFileRelativePath;
          const cssFilePath = path.join(docDir, cleanPath);
          const cssFileUri = URI.file(cssFilePath).toString();
          cssFileUris.push(cssFileUri);

          // Register error in registry
          cssRegistry.updateCSSFile(cssFileUri, {
            classes: new Set(),
            ids: new Set(),
            classLocations: new Map(),
            idLocations: new Map(),
            classRules: new Map(),
            idRules: new Map(),
            errors: [
              {
                message: error instanceof Error ? error.message : 'Unknown error',
                filePath: cssFileRelativePath,
                line: 0,
                column: 0,
              },
            ],
          });
        }
      }

      // Send notification to extension with discovered CSS imports (absolute URIs)
      const params: CSSImportsDiscoveredParams = {
        documentUri,
        cssFileUris: cssFileUris,
      };

      connection.sendNotification(CSS_IMPORTS_DISCOVERED_NOTIFICATION, params);
    }
  }
});

// Register JSDoc generation request handler (Step 2 of JSDoc completion)
// This handler runs AFTER Step 1 inserts /** */ and triggers the command
connection.onRequest('eligian/generateJSDoc', async params => {
  console.log('Language server received eligian/generateJSDoc request:', params);
  const { textDocument, position } = params;

  // Get the document from the workspace
  const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(textDocument.uri));
  if (!document) {
    console.log('Document not found:', textDocument.uri);
    return null;
  }

  // Find action definition on the line below the current position
  const actionDef = findActionBelow(document, position);
  console.log('Action found:', actionDef ? actionDef.name : 'none');

  // If action found, generate JSDoc content (without delimiters)
  if (actionDef) {
    const content = generateJSDocContent(actionDef);
    console.log('Generated JSDoc content:', content);
    return content;
  }

  // No action found, return null (no JSDoc generation)
  console.log('No action found below cursor, returning null');
  return null;
});

// Start the language server with the shared services
startLanguageServer(shared);
