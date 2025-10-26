import { readFileSync } from 'node:fs';
import {
  CSS_ERROR_NOTIFICATION,
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  CSS_UPDATED_NOTIFICATION,
  type CSSErrorParams,
  type CSSImportsDiscoveredParams,
  type CSSUpdatedParams,
  createEligianServices,
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

// Listen for document updates to parse CSS files BEFORE validation
// This runs after parsing but BEFORE validation, so we can load CSS into registry
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
            const cssPath = statement.path.replace(/^["']|["']$/g, ''); // Remove quotes
            cssFiles.push(cssPath);
          }
        }
      }

      // Parse each CSS file and load into registry (if not already loaded)
      for (const cssFileUri of cssFiles) {
        try {
          // Convert relative path to absolute file path
          const docPath = URI.parse(documentUri).fsPath;
          const docDir = docPath.substring(0, docPath.lastIndexOf('\\'));
          const cssFilePath = cssFileUri.startsWith('./')
            ? `${docDir}\\${cssFileUri.substring(2)}`
            : cssFileUri;

          // Read and parse CSS file
          const cssContent = readFileSync(cssFilePath, 'utf-8');
          const parseResult = parseCSS(cssContent, cssFilePath);

          // Update registry with parsed CSS
          cssRegistry.updateCSSFile(cssFileUri, parseResult);
        } catch (error) {
          console.error(`Failed to parse CSS file ${cssFileUri}:`, error);
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
                filePath: cssFileUri,
                line: 0,
                column: 0,
              },
            ],
          });
        }
      }

      // Send notification to extension with discovered CSS imports
      const params: CSSImportsDiscoveredParams = {
        documentUri,
        cssFileUris: Array.from(cssFiles),
      };

      connection.sendNotification(CSS_IMPORTS_DISCOVERED_NOTIFICATION, params);
    }
  }
});

// Start the language server with the shared services
startLanguageServer(shared);
