import * as path from 'node:path';
import {
  BLOCK_LABELS_REQUEST,
  type BlockLabelsParams,
  CSS_ERROR_NOTIFICATION,
  CSS_IMPORTS_DISCOVERED_NOTIFICATION,
  CSS_REFERENCE_LENSES_REQUEST,
  CSS_REFERENCES_REQUEST,
  CSS_UPDATED_NOTIFICATION,
  type CSSErrorParams,
  type CSSUpdatedParams,
  type CssReferencesParams,
  createEligianServices,
  createEmptyCSSMetadata,
  cssReferenceLenses,
  cssReferences,
  extractBlockLabels,
  extractTranslationKeys,
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
  TIMELINE_GANTT_REQUEST,
  type TimelineGanttParams,
  timelineGantt,
  validateLocalesJSON,
} from '@eligian/language';
import { DocumentState } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { URI } from 'vscode-uri';
import { createAssetUpdateHandlers } from './asset-update-handlers.js';
import { ImportParseCache } from './import-cache.js';
import type { ImportProcessorConfig } from './import-processor.js';
import { processImports } from './import-processor.js';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, Eligian } = createEligianServices({ connection, ...NodeFileSystem });

/**
 * Force a re-validation pass on every document that imports a changed asset file.
 *
 * Shared by the CSS/labels/HTML update handlers (success and error paths alike),
 * which each invalidate the build state of the importing documents so diagnostics
 * refresh. Each URI is parsed exactly once per document (previously parsed twice
 * per iteration).
 */
function triggerRevalidation(documentUris: string[]): void {
  for (const docUri of documentUris) {
    const uri = URI.parse(docUri);
    if (shared.workspace.LangiumDocuments.getDocument(uri)) {
      // Force re-validation by invalidating document state
      shared.workspace.DocumentBuilder.update([uri], []);
    }
  }
}

/**
 * The CSS files to watch for a document: its imported files plus every stylesheet they
 * `@import` (from the registry), so an edit to an imported sheet re-validates the document.
 */
function withImportedStylesheets(cssFileUris: string[]): string[] {
  const cssRegistry = Eligian.css.CSSRegistry;
  const all = new Set(cssFileUris);
  for (const uri of cssFileUris) {
    for (const imported of cssRegistry.getMetadata(uri)?.importedFileUris ?? []) {
      all.add(imported);
    }
  }
  return [...all];
}

// Parsed-phase parse caches: the imports of a document are re-read on every rebuild, so
// unchanged files (same mtime and size) reuse their parsed metadata. The hot-reload handlers
// below invalidate the entries they refresh.
const cssParseCache = new ImportParseCache<ReturnType<typeof parseCSS>>();
const labelsParseCache = new ImportParseCache<ReturnType<typeof extractTranslationKeys>>();
const htmlParseCache = new ImportParseCache<{
  content: string;
  errors?: Array<{ message: string; line?: number; column?: number }>;
}>();

const assetHandlers = createAssetUpdateHandlers({
  cssRegistry: Eligian.css.CSSRegistry,
  labelRegistry: Eligian.labels.LabelRegistry,
  htmlRegistry: Eligian.html.HTMLRegistry,
  triggerRevalidation,
  caches: { css: cssParseCache, labels: labelsParseCache, html: htmlParseCache },
});

connection.onNotification(CSS_UPDATED_NOTIFICATION, (params: CSSUpdatedParams) =>
  assetHandlers.onCssUpdated(params)
);
connection.onNotification(CSS_ERROR_NOTIFICATION, (params: CSSErrorParams) =>
  assetHandlers.onCssError(params)
);
connection.onNotification(LABELS_UPDATED_NOTIFICATION, (params: LabelsUpdatedParams) =>
  assetHandlers.onLabelsUpdated(params)
);
connection.onNotification(HTML_UPDATED_NOTIFICATION, (params: HTMLUpdatedParams) =>
  assetHandlers.onHtmlUpdated(params)
);

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
        includeNamedCssImports: true,
        parseFile: (content, filePath) => parseCSS(content, filePath),
        createEmptyMetadata: () => createEmptyCSSMetadata(),
        registry: {
          updateFile: (uri, metadata) => cssRegistry.updateCSSFile(uri, metadata),
          registerImports: (docUri, fileUris) =>
            cssRegistry.registerImports(docUri, fileUris as string[]),
          getImports: docUri => Array.from(cssRegistry.getDocumentImports(docUri)),
        },
        notification: {
          type: CSS_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUris) => ({
            documentUri: docUri,
            cssFileUris: withImportedStylesheets(fileUris as string[]),
          }),
        },
        cardinality: 'many',
        cache: cssParseCache,
      };

      processImports(documentUri, root, docDir, connection, cssConfig);

      // Process labels imports (one-to-one: document imports single labels file)
      const labelsConfig: ImportProcessorConfig<ReturnType<typeof extractTranslationKeys>> = {
        importType: 'locales',
        parseFile: (content, filePath) => {
          const validationError = validateLocalesJSON(content, filePath);
          if (validationError) {
            return []; // Return empty metadata on validation error
          }
          const labels = JSON.parse(content);
          return extractTranslationKeys(labels);
        },
        createEmptyMetadata: () => [],
        registry: {
          updateFile: (uri, metadata) => labelRegistry.updateLabelsFile(uri, metadata),
          registerImports: (docUri, fileUri) =>
            labelRegistry.registerImports(docUri, fileUri as string),
          hasImport: docUri => labelRegistry.hasImport(docUri),
          getImports: docUri => {
            const file = labelRegistry.getLabelsFileUri(docUri);
            return file ? [file] : [];
          },
          clearImports: docUri => labelRegistry.clearDocument(docUri),
        },
        notification: {
          type: LABELS_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUri) => ({
            documentUri: docUri,
            labelsFileUri: fileUri as string,
          }),
        },
        cardinality: 'one',
        cache: labelsParseCache,
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
          getImports: docUri => {
            const file = htmlRegistry.getHTMLFileURI(docUri);
            return file ? [file] : [];
          },
          clearImports: docUri => htmlRegistry.clearDocument(docUri),
        },
        notification: {
          type: HTML_IMPORTS_DISCOVERED_NOTIFICATION,
          createParams: (docUri, fileUri) => ({
            documentUri: docUri,
            htmlFileUri: fileUri as string,
          }),
        },
        cardinality: 'one',
        cache: htmlParseCache,
      };

      processImports(documentUri, root, docDir, connection, htmlConfig);
    }
  }
});

// Drop the HTML registry state of documents that were deleted from the workspace
shared.workspace.DocumentBuilder.onUpdate((_changed, deleted) => {
  for (const uri of deleted) {
    Eligian.html.HTMLRegistry.clearDocument(uri.toString());
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

// Block-label decoration positions (B47)
// The extension host requests bracket positions instead of re-parsing the
// document itself: the server reuses the already-built, cached AST.
connection.onRequest(BLOCK_LABELS_REQUEST, (params: BlockLabelsParams) => {
  const document = shared.workspace.LangiumDocuments.getDocument(
    URI.parse(params.textDocument.uri)
  );
  if (!document) {
    return [];
  }
  return extractBlockLabels(document.parseResult.value as Program);
});

// Timeline view (idea #20 phase 2): the timelines and their bars, from the built AST
connection.onRequest(TIMELINE_GANTT_REQUEST, (params: TimelineGanttParams) => {
  const document = shared.workspace.LangiumDocuments.getDocument(
    URI.parse(params.textDocument.uri)
  );
  const root = document?.parseResult.value;
  return root && root.$type === 'Program' ? timelineGantt(root as Program) : [];
});

// Idea #22: from a CSS / HTML file to the .eligian strings that use its classes and ids
connection.onRequest(CSS_REFERENCES_REQUEST, (params: CssReferencesParams) =>
  cssReferences(Eligian, params)
);
connection.onRequest(CSS_REFERENCE_LENSES_REQUEST, (params: { uri: string }) =>
  cssReferenceLenses(Eligian, params.uri)
);

// Start the language server with the shared services
startLanguageServer(shared);
