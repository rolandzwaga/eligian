/**
 * Hot-reload handlers for changed CSS / locales / HTML files.
 *
 * The extension host sends a `*_UPDATED` notification when an imported asset changes on
 * disk. These handlers refresh the matching registry and revalidate the importing documents.
 * They live apart from `main.ts` (which owns the LSP connection and is not importable in
 * tests) and take their collaborators as parameters.
 */

import { readFileSync } from 'node:fs';
import {
  type CSSErrorParams,
  type CSSUpdatedParams,
  type createEligianServices,
  createEmptyCSSMetadata,
  extractTranslationKeys,
  type HTMLUpdatedParams,
  type LabelsUpdatedParams,
  parseCSS,
  validateLocalesJSON,
} from '@eligian/language';
import { URI } from 'vscode-uri';
import type { ImportParseCache } from './import-cache.js';

type EligianServices = ReturnType<typeof createEligianServices>['Eligian'];

export interface AssetUpdateDeps {
  cssRegistry: Pick<EligianServices['css']['CSSRegistry'], 'updateCSSFile' | 'getFilesImporting'>;
  labelRegistry: Pick<EligianServices['labels']['LabelRegistry'], 'updateLabelsFile'>;
  htmlRegistry: Pick<EligianServices['html']['HTMLRegistry'], 'updateHTMLFile'>;
  /** Force a re-validation pass on the given documents. */
  triggerRevalidation: (documentUris: string[]) => void;
  /** Parse caches of the Parsed build phase; entries for refreshed files are dropped. */
  caches?: {
    css?: ImportParseCache<unknown>;
    labels?: ImportParseCache<unknown>;
    html?: ImportParseCache<unknown>;
  };
  /** File reader; defaults to `readFileSync(path, 'utf-8')`. */
  readFile?: (filePath: string) => string;
}

export function createAssetUpdateHandlers(deps: AssetUpdateDeps) {
  const { cssRegistry, labelRegistry, htmlRegistry, triggerRevalidation, caches } = deps;
  const readFile = deps.readFile ?? ((filePath: string) => readFileSync(filePath, 'utf-8'));

  /**
   * Re-parse the registered stylesheets that `@import` a changed CSS file: their metadata
   * merges the imported file's classes/IDs, so it is stale now.
   */
  function reparseImporters(cssFileUri: string): void {
    for (const importerUri of cssRegistry.getFilesImporting(cssFileUri)) {
      const importerPath = URI.parse(importerUri).fsPath;
      try {
        cssRegistry.updateCSSFile(importerUri, parseCSS(readFile(importerPath), importerPath));
      } catch {
        // The importer itself is gone/unreadable: its own watcher event reports that
      }
    }
  }

  function onCssUpdated({ cssFileUri, documentUris }: CSSUpdatedParams): void {
    // Importers merge this sheet's classes, so every cached CSS parse is suspect.
    caches?.css?.clear();
    try {
      const cssFilePath = URI.parse(cssFileUri).fsPath;
      cssRegistry.updateCSSFile(cssFileUri, parseCSS(readFile(cssFilePath), cssFilePath));
      reparseImporters(cssFileUri);
      triggerRevalidation(documentUris);
    } catch (error) {
      // File might be deleted or have errors - clear CSS and trigger re-validation
      cssRegistry.updateCSSFile(
        cssFileUri,
        createEmptyCSSMetadata([
          {
            message: error instanceof Error ? error.message : String(error),
            filePath: cssFileUri,
            line: 0,
            column: 0,
          },
        ])
      );
      reparseImporters(cssFileUri);
      triggerRevalidation(documentUris);
    }
  }

  function onCssError({ cssFileUri, errors }: CSSErrorParams): void {
    // Store error metadata in CSS registry with empty classes/IDs
    cssRegistry.updateCSSFile(cssFileUri, createEmptyCSSMetadata(errors));
  }

  function onLabelsUpdated({ labelsFileUri, documentUris }: LabelsUpdatedParams): void {
    const labelsFilePath = URI.parse(labelsFileUri).fsPath;
    caches?.labels?.invalidate(labelsFilePath);
    try {
      const labelsContent = readFile(labelsFilePath);

      if (validateLocalesJSON(labelsContent, labelsFilePath)) {
        // Syntactically or schema-invalid: register no keys (exactly what a full reparse of an
        // importing document does) and revalidate, so the old keys stop being offered and the
        // validator reports the broken file.
        labelRegistry.updateLabelsFile(labelsFileUri, []);
      } else {
        labelRegistry.updateLabelsFile(
          labelsFileUri,
          extractTranslationKeys(JSON.parse(labelsContent))
        );
      }
      triggerRevalidation(documentUris);
    } catch (_error) {
      // File might be deleted - clear labels and trigger re-validation
      labelRegistry.updateLabelsFile(labelsFileUri, []);
      triggerRevalidation(documentUris);
    }
  }

  function onHtmlUpdated({ htmlFileUri, documentUris }: HTMLUpdatedParams): void {
    const htmlFilePath = URI.parse(htmlFileUri).fsPath;
    caches?.html?.invalidate(htmlFilePath);
    try {
      // No parsing needed for HTML: the registry keeps the raw content
      htmlRegistry.updateHTMLFile(htmlFileUri, { content: readFile(htmlFilePath), errors: [] });
      triggerRevalidation(documentUris);
    } catch (error) {
      // File might be deleted - clear HTML and trigger re-validation
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
      triggerRevalidation(documentUris);
    }
  }

  return { onCssUpdated, onCssError, onLabelsUpdated, onHtmlUpdated };
}
