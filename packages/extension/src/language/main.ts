import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  CSS_ERROR_NOTIFICATION,
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  CSS_UPDATED_NOTIFICATION,
  type CSSErrorParams,
  type CSSUpdatedParams,
  createEligianServices,
  extractLabelMetadata,
  findActionBelow,
  generateJSDocContent,
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  HTML_UPDATED_NOTIFICATION,
  type HTMLUpdatedParams,
  LABELS_IMPORTS_DISCOVERED_NOTIFICATION,
  LABELS_UPDATED_NOTIFICATION,
  type LabelsUpdatedParams,
  type Program,
  parseCSS,
  validateLabelsJSON,
} from '@eligian/language';
import { DocumentState } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { URI } from 'vscode-uri';
import type { ImportProcessorConfig } from './import-processor.js';
import { processImports } from './import-processor.js';

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
    // File might be deleted or have errors - clear CSS and trigger re-validation
    const cssRegistry = Eligian.css.CSSRegistry;
    cssRegistry.updateCSSFile(cssFileUri, {
      classes: new Set(),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
          filePath: cssFileUri,
          line: 0,
          column: 0,
        },
      ],
    });

    // Trigger re-validation to show "file not found" or CSS errors
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
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

// Register labels notification handlers
connection.onNotification(LABELS_UPDATED_NOTIFICATION, (params: LabelsUpdatedParams) => {
  const { labelsFileUri, documentUris } = params;

  try {
    // Read labels file content from file system
    const labelsFilePath = URI.parse(labelsFileUri).fsPath;
    const labelsContent = readFileSync(labelsFilePath, 'utf-8');

    // Validate labels JSON schema
    const validationError = validateLabelsJSON(labelsContent, labelsFilePath);

    if (!validationError) {
      // Parse labels JSON to extract label metadata
      const labels = JSON.parse(labelsContent);
      const metadata = extractLabelMetadata(labels);

      // Update the labels registry with parsed metadata
      const labelRegistry = Eligian.labels.LabelRegistry;
      labelRegistry.updateLabelsFile(labelsFileUri, metadata);

      // Trigger re-validation of importing documents
      for (const docUri of documentUris) {
        const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
        if (document) {
          // Force re-validation by invalidating document state
          shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
        }
      }
    }
    // If validation error, we don't update the registry
    // The validator will handle showing the error to the user
  } catch (_error) {
    // File might be deleted - clear labels and trigger re-validation
    const labelRegistry = Eligian.labels.LabelRegistry;
    labelRegistry.updateLabelsFile(labelsFileUri, []); // Clear labels

    // Trigger re-validation to show "file not found" errors
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  }
});

// Register HTML notification handlers
connection.onNotification(HTML_UPDATED_NOTIFICATION, (params: HTMLUpdatedParams) => {
  const { htmlFileUri, documentUris } = params;

  try {
    // Read HTML file content from file system
    const htmlFilePath = URI.parse(htmlFileUri).fsPath;
    const htmlContent = readFileSync(htmlFilePath, 'utf-8');

    // Update the HTML registry with content (no parsing needed for HTML)
    const htmlRegistry = Eligian.html.HTMLRegistry;
    htmlRegistry.updateHTMLFile(htmlFileUri, {
      content: htmlContent,
      errors: [],
    });

    // Trigger re-validation of importing documents
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        // Force re-validation by invalidating document state
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  } catch (error) {
    // File might be deleted - clear HTML and trigger re-validation
    const htmlRegistry = Eligian.html.HTMLRegistry;
    htmlRegistry.updateHTMLFile(htmlFileUri, {
      content: '',
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
          line: 0,
          column: 0,
        },
      ],
    });

    // Trigger re-validation to show "file not found" errors
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  }
});

// CRITICAL: Import files MUST be loaded BEFORE validation phase
// This handler runs during DocumentState.Parsed phase (after parsing, BEFORE validation)
// Synchronization mechanism: Langium awaits this handler completion before proceeding to validation
// Why: Validators (e.g., CSS class validation) require registries to be populated
// This synchronous ordering ensures IDE and compiler validation produce identical results
shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Parsed, async documents => {
  const cssRegistry = Eligian.css.CSSRegistry;
  const labelRegistry = Eligian.labels.LabelRegistry;
  const htmlRegistry = Eligian.html.HTMLRegistry;

  for (const document of documents) {
    // Only process Eligian documents
    if (document.uri.path.endsWith('.eligian')) {
      const documentUri = document.uri.toString();
      const root = document.parseResult.value as Program;
      const docPath = URI.parse(documentUri).fsPath;
      const docDir = path.dirname(docPath);

      // Process CSS imports (one-to-many: document can import multiple CSS files)
      const cssConfig: ImportProcessorConfig<ReturnType<typeof parseCSS>> = {
        importType: 'styles',
        parseFile: (content, filePath) => parseCSS(content, filePath),
        createEmptyMetadata: () => ({
          classes: new Set(),
          ids: new Set(),
          classLocations: new Map(),
          idLocations: new Map(),
          classRules: new Map(),
          idRules: new Map(),
          errors: [],
        }),
        registry: {
          updateFile: (uri, metadata) => cssRegistry.updateCSSFile(uri, metadata),
          registerImports: (docUri, fileUris) =>
            cssRegistry.registerImports(docUri, fileUris as string[]),
        },
        notification: {
          type: CSS_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUris) => ({
            documentUri: docUri,
            cssFileUris: fileUris as string[],
          }),
        },
        cardinality: 'many',
      };

      processImports(documentUri, root, docDir, connection, cssConfig);

      // Process labels imports (one-to-one: document imports single labels file)
      const labelsConfig: ImportProcessorConfig<ReturnType<typeof extractLabelMetadata>> = {
        importType: 'labels',
        parseFile: (content, filePath) => {
          const validationError = validateLabelsJSON(content, filePath);
          if (validationError) {
            return []; // Return empty metadata on validation error
          }
          const labels = JSON.parse(content);
          return extractLabelMetadata(labels);
        },
        createEmptyMetadata: () => [],
        registry: {
          updateFile: (uri, metadata) => labelRegistry.updateLabelsFile(uri, metadata),
          registerImports: (docUri, fileUri) =>
            labelRegistry.registerImports(docUri, fileUri as string),
          hasImport: docUri => labelRegistry.hasImport(docUri),
        },
        notification: {
          type: LABELS_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUri) => ({
            documentUri: docUri,
            labelsFileUri: fileUri as string,
          }),
        },
        cardinality: 'one',
      };

      processImports(documentUri, root, docDir, connection, labelsConfig);

      // Process HTML/layout imports (one-to-one: document imports single HTML file)
      const htmlConfig: ImportProcessorConfig<{
        content: string;
        errors?: Array<{ message: string; line?: number; column?: number }>;
      }> = {
        importType: 'layout',
        parseFile: (content, _filePath) => ({
          content,
          errors: [],
        }),
        createEmptyMetadata: () => ({
          content: '',
          errors: [],
        }),
        registry: {
          updateFile: (uri, metadata) => htmlRegistry.updateHTMLFile(uri, metadata),
          registerImports: (docUri, fileUri) =>
            htmlRegistry.registerImports(docUri, fileUri as string),
          hasImport: docUri => htmlRegistry.hasImport(docUri),
        },
        notification: {
          type: HTML_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUri) => ({
            documentUri: docUri,
            htmlFileUri: fileUri as string,
          }),
        },
        cardinality: 'one',
      };

      processImports(documentUri, root, docDir, connection, htmlConfig);
    }
  }
});

// Register JSDoc generation request handler (Step 2 of JSDoc completion)
// This handler runs AFTER Step 1 inserts /** */ and triggers the command
connection.onRequest('eligian/generateJSDoc', async params => {
  const { textDocument, position } = params;

  // Get the document from the workspace
  const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(textDocument.uri));
  if (!document) {
    return null;
  }

  // Find action definition on the line below the current position
  const actionDef = findActionBelow(document, position);

  // If action found, generate JSDoc content (without delimiters)
  if (actionDef) {
    const content = generateJSDocContent(actionDef);
    return content;
  }

  // No action found, return null (no JSDoc generation)
  return null;
});

// Start the language server with the shared services
startLanguageServer(shared);
