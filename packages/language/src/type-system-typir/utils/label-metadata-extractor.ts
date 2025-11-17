/**
 * Label Metadata Extractor
 *
 * Extracts label group metadata from ILanguageLabel[] for registry population.
 *
 * @module type-system-typir/utils/label-metadata-extractor
 */

import type { ILanguageLabel } from 'eligius';
import type { LabelGroupMetadata } from './label-registry.js';

/**
 * Extract label group metadata from labels JSON
 *
 * Converts ILanguageLabel[] (from Eligius) to LabelGroupMetadata[] for the registry.
 *
 * @param labels - Array of label groups from labels JSON
 * @returns Array of label group metadata
 *
 * @example
 * ```typescript
 * const labels: ILanguageLabel[] = [
 *   {id: 'welcome-title', labels: [{languageCode: 'en-US', ...}, {languageCode: 'nl-NL', ...}]}
 * ];
 * const metadata = extractLabelMetadata(labels);
 * // Returns: [{id: 'welcome-title', translationCount: 2, languageCodes: ['en-US', 'nl-NL']}]
 * ```
 */
export function extractLabelMetadata(labels: ILanguageLabel[]): LabelGroupMetadata[] {
  return labels.map(labelGroup => ({
    id: labelGroup.id,
    translationCount: labelGroup.labels.length,
    languageCodes: labelGroup.labels.map(label => label.languageCode),
  }));
}
