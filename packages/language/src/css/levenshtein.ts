/**
 * Calculate Levenshtein distance between two strings.
 *
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, substitutions) needed to transform one string into another.
 *
 * Uses standard dynamic programming algorithm with optional early exit for maxDistance threshold.
 *
 * @param a - First string
 * @param b - Second string
 * @param maxDistance - Optional maximum distance threshold (early exit optimization)
 * @returns Levenshtein distance, or maxDistance + 1 if distance exceeds threshold
 *
 * @example
 * levenshteinDistance('foo', 'foo')      // 0 (exact match)
 * levenshteinDistance('foo', 'foa')      // 1 (one substitution)
 * levenshteinDistance('foo', 'fooo')     // 1 (one insertion)
 * levenshteinDistance('kitten', 'sitting') // 3 (multiple edits)
 */
export function levenshteinDistance(a: string, b: string, maxDistance?: number): number {
  const lenA = a.length;
  const lenB = b.length;

  // Early exit: length difference exceeds max distance
  if (maxDistance !== undefined && Math.abs(lenA - lenB) > maxDistance) {
    return maxDistance + 1;
  }

  // Initialize matrix
  const matrix: number[][] = [];

  // Initialize first column (deletions from a)
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }

  // Initialize first row (insertions into a)
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= lenA; i++) {
    let rowMin = Number.POSITIVE_INFINITY;

    for (let j = 1; j <= lenB; j++) {
      if (a[i - 1] === b[j - 1]) {
        // Characters match - no edit needed
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // Take minimum of:
        // - Substitution: matrix[i-1][j-1] + 1
        // - Deletion: matrix[i-1][j] + 1
        // - Insertion: matrix[i][j-1] + 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substitution
          matrix[i - 1][j] + 1, // Deletion
          matrix[i][j - 1] + 1 // Insertion
        );
      }

      rowMin = Math.min(rowMin, matrix[i][j]);
    }

    // Early exit: if current row minimum exceeds maxDistance, abort
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[lenA][lenB];
}

/**
 * Find similar class names using Levenshtein distance.
 *
 * Returns suggestions for unknown class names by finding classes within
 * the specified edit distance threshold, sorted by distance (closest first),
 * then alphabetically.
 *
 * @param unknownClass - Unknown class name to find suggestions for
 * @param availableClasses - Set of available class names
 * @param maxDistance - Maximum edit distance (default: 2)
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @returns Array of suggested class names, sorted by relevance
 *
 * @example
 * const classes = new Set(['button', 'primary', 'secondary']);
 * findSimilarClasses('primry', classes)  // ['primary'] (distance = 1)
 * findSimilarClasses('buton', classes)   // ['button'] (distance = 1)
 * findSimilarClasses('xyz', classes)     // [] (all distances > 2)
 */
export function findSimilarClasses(
  unknownClass: string,
  availableClasses: Set<string>,
  maxDistance = 2,
  maxSuggestions = 3
): string[] {
  const suggestions: Array<{ name: string; distance: number }> = [];

  for (const className of availableClasses) {
    const distance = levenshteinDistance(unknownClass, className, maxDistance);

    if (distance <= maxDistance) {
      suggestions.push({ name: className, distance });
    }
  }

  // Sort by distance (closest first), then alphabetically
  suggestions.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.name.localeCompare(b.name);
  });

  // Return top N suggestions
  return suggestions.slice(0, maxSuggestions).map(s => s.name);
}
