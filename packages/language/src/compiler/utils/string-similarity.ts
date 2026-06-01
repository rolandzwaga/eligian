/**
 * Shared string-similarity utilities for the compiler.
 *
 * Re-exports the canonical {@link levenshteinDistance} (with its `maxDistance`
 * early-exit optimization) from the CSS module — the single source of truth —
 * and provides a generic {@link findSimilar} used by the action/operation
 * "did you mean?" suggestion helpers.
 */
import { levenshteinDistance } from '../../css/levenshtein.js';

export { levenshteinDistance };

/**
 * Find names similar to `query` by Levenshtein distance.
 *
 * Comparison is case-insensitive. Candidates within `maxDistance` are returned
 * sorted by distance (closest first); ties preserve the input order.
 *
 * @param query - The (possibly mistyped) name to find suggestions for
 * @param candidates - Available names to compare against
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @param maxDistance - Maximum edit distance to consider a match (default: 3)
 * @returns Suggested names, closest first, capped at `maxSuggestions`
 *
 * @example
 * findSimilar('fadIn', ['fadeIn', 'slideIn']) // ['fadeIn']
 */
export function findSimilar(
  query: string,
  candidates: Iterable<string>,
  maxSuggestions = 3,
  maxDistance = 3
): string[] {
  const normalizedQuery = query.toLowerCase();
  const matches: Array<{ name: string; distance: number }> = [];

  for (const name of candidates) {
    const distance = levenshteinDistance(normalizedQuery, name.toLowerCase(), maxDistance);
    if (distance <= maxDistance) {
      matches.push({ name, distance });
    }
  }

  return matches
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(match => match.name);
}
