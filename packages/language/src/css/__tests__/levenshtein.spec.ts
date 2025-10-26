import { describe, expect, it } from 'vitest';
import { findSimilarClasses, levenshteinDistance } from '../levenshtein.js';

describe('Levenshtein Distance', () => {
  describe('Basic distance calculation', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('button', 'button')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('a', 'a')).toBe(0);
    });

    it('should calculate single substitution distance', () => {
      expect(levenshteinDistance('button', 'buttan')).toBe(1);
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
      expect(levenshteinDistance('sit', 'sat')).toBe(1);
    });

    it('should calculate single insertion distance', () => {
      expect(levenshteinDistance('button', 'buttons')).toBe(1);
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
      expect(levenshteinDistance('', 'a')).toBe(1);
    });

    it('should calculate single deletion distance', () => {
      expect(levenshteinDistance('buttons', 'button')).toBe(1);
      expect(levenshteinDistance('cats', 'cat')).toBe(1);
      expect(levenshteinDistance('a', '')).toBe(1);
    });

    it('should calculate distance with multiple edits', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3); // Classic example
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
      expect(levenshteinDistance('button', 'btn')).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
      expect(levenshteinDistance('button', '')).toBe(6);
      expect(levenshteinDistance('', 'button')).toBe(6);
    });

    it('should be case-sensitive', () => {
      expect(levenshteinDistance('Button', 'button')).toBe(1);
      expect(levenshteinDistance('PRIMARY', 'primary')).toBe(7);
    });
  });

  describe('Distance with maxDistance threshold', () => {
    it('should return exact distance when below threshold', () => {
      expect(levenshteinDistance('button', 'buttan', 2)).toBe(1);
      expect(levenshteinDistance('cat', 'bat', 2)).toBe(1);
    });

    it('should early exit when distance exceeds threshold', () => {
      const result = levenshteinDistance('button', 'primary', 2);
      expect(result).toBeGreaterThan(2); // Should be > maxDistance
    });

    it('should optimize for length difference exceeding maxDistance', () => {
      // 'button' (6 chars) vs 'a' (1 char) = length diff of 5
      const result = levenshteinDistance('button', 'a', 2);
      expect(result).toBeGreaterThan(2); // Early exit due to length diff
    });

    it('should handle threshold of 0', () => {
      expect(levenshteinDistance('button', 'button', 0)).toBe(0);
      const result = levenshteinDistance('button', 'buttan', 0);
      expect(result).toBeGreaterThan(0);
    });

    it('should handle very large threshold', () => {
      expect(levenshteinDistance('button', 'primary', 100)).toBe(7);
      expect(levenshteinDistance('a', 'z', 100)).toBe(1);
    });
  });

  describe('Real-world CSS class name scenarios', () => {
    it('should detect common typos', () => {
      // Missing letter
      expect(levenshteinDistance('button', 'buton')).toBe(1);

      // Extra letter
      expect(levenshteinDistance('button', 'buttton')).toBe(1);

      // Transposed letters
      expect(levenshteinDistance('button', 'buttno')).toBe(2);

      // Wrong letter
      expect(levenshteinDistance('primary', 'primery')).toBe(1);
    });

    it('should work with BEM notation', () => {
      expect(levenshteinDistance('block__element', 'block__elemnt')).toBe(1);
      expect(levenshteinDistance('block--modifier', 'block--modifer')).toBe(1);
    });

    it('should work with utility classes', () => {
      expect(levenshteinDistance('mt-4', 'mt-5')).toBe(1);
      expect(levenshteinDistance('px-2', 'py-2')).toBe(1);
      expect(levenshteinDistance('text-center', 'text-centre')).toBe(2); // 're' → 'er' requires 2 edits
    });

    it('should handle camelCase and kebab-case', () => {
      expect(levenshteinDistance('primaryButton', 'primaryButon')).toBe(1);
      expect(levenshteinDistance('primary-button', 'primary-buton')).toBe(1);
    });
  });
});

describe('Find Similar Classes', () => {
  describe('Basic functionality', () => {
    it('should find exact match', () => {
      const available = new Set(['button', 'primary', 'secondary']);
      const suggestions = findSimilarClasses('button', available, 2, 3);

      expect(suggestions).toContain('button');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should find classes within distance threshold', () => {
      const available = new Set(['button', 'buttons', 'bottom']);
      const suggestions = findSimilarClasses('buton', available, 2, 3);

      expect(suggestions).toContain('button'); // distance 1
      expect(suggestions).toContain('buttons'); // distance 2
      // 'buton' → 'bottom' is distance 3, so excluded with maxDistance=2
    });

    it('should exclude classes exceeding distance threshold', () => {
      const available = new Set(['button', 'primary', 'secondary']);
      const suggestions = findSimilarClasses('btn', available, 2, 3);

      expect(suggestions).not.toContain('primary'); // distance > 2
      expect(suggestions).not.toContain('secondary'); // distance > 2
    });

    it('should return empty array when no matches within threshold', () => {
      const available = new Set(['button', 'primary', 'secondary']);
      const suggestions = findSimilarClasses('xyz', available, 2, 3);

      expect(suggestions).toEqual([]);
    });

    it('should handle empty available set', () => {
      const available = new Set<string>();
      const suggestions = findSimilarClasses('button', available, 2, 3);

      expect(suggestions).toEqual([]);
    });
  });

  describe('Sorting behavior', () => {
    it('should sort by distance first, then alphabetically', () => {
      const available = new Set(['zebra', 'buttons', 'button', 'bottom', 'buttery']);
      const suggestions = findSimilarClasses('buton', available);

      // Distance 1: button
      // Distance 2: buttons, buttery
      // Distance 3: bottom (excluded by default maxDistance=2)
      // Default maxSuggestions=3, so we get: button, buttons, buttery
      expect(suggestions.length).toBeLessThanOrEqual(3);
      expect(suggestions[0]).toBe('button'); // distance 1
      expect(suggestions[1]).toBe('buttons'); // distance 2, alphabetically first
      // Third suggestion could be buttery, depending on exact implementation
    });

    it('should prioritize closer matches', () => {
      const available = new Set(['button', 'buttons', 'buttonize']);
      const suggestions = findSimilarClasses('butto', available);

      // 'button' has distance 1 (add 'n')
      // 'buttons' has distance 2 (add 'n' and 's')
      expect(suggestions[0]).toBe('button');
    });

    it('should sort alphabetically for same distance', () => {
      const available = new Set(['zebra', 'apple', 'banana']);
      // 'apqle', 'banaqa', 'zeqra' all distance 1 from these
      const suggestions = findSimilarClasses('applf', available, 2, 10);

      // All should have similar distances, check alphabetical ordering
      expect(suggestions).toContain('apple');
      if (suggestions.length > 1) {
        // Verify they're alphabetically sorted within same distance
        for (let i = 1; i < suggestions.length; i++) {
          const dist1 = levenshteinDistance('applf', suggestions[i - 1]);
          const dist2 = levenshteinDistance('applf', suggestions[i]);

          if (dist1 === dist2) {
            expect(suggestions[i - 1].localeCompare(suggestions[i])).toBeLessThan(0);
          }
        }
      }
    });
  });

  describe('Limit behavior', () => {
    it('should respect maxSuggestions limit', () => {
      const available = new Set(['button', 'buttons', 'bottom', 'buttery', 'battery']);
      const suggestions = findSimilarClasses('buton', available, 2, 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should return fewer than maxSuggestions if fewer matches exist', () => {
      const available = new Set(['button']);
      const suggestions = findSimilarClasses('buton', available, 2, 5);

      expect(suggestions.length).toBe(1);
    });

    it('should use default maxSuggestions of 3', () => {
      const available = new Set(['button', 'buttons', 'bottom', 'buttery', 'battery']);
      const suggestions = findSimilarClasses('buton', available);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should handle maxSuggestions of 1', () => {
      const available = new Set(['button', 'buttons', 'bottom']);
      const suggestions = findSimilarClasses('buton', available, 2, 1);

      expect(suggestions.length).toBe(1);
      expect(suggestions[0]).toBe('button'); // Closest match
    });

    it('should handle maxSuggestions of 0', () => {
      const available = new Set(['button', 'buttons']);
      const suggestions = findSimilarClasses('buton', available, 2, 0);

      expect(suggestions).toEqual([]);
    });
  });

  describe('Real-world suggestion scenarios', () => {
    it('should suggest for common typo: missing letter', () => {
      const available = new Set(['primary', 'secondary', 'tertiary']);
      const suggestions = findSimilarClasses('primry', available, 2, 3);

      expect(suggestions).toContain('primary');
    });

    it('should suggest for common typo: extra letter', () => {
      const available = new Set(['button', 'input', 'label']);
      const suggestions = findSimilarClasses('buttton', available, 2, 3);

      expect(suggestions).toContain('button');
    });

    it('should suggest for common typo: wrong letter', () => {
      const available = new Set(['header', 'footer', 'sidebar']);
      const suggestions = findSimilarClasses('heador', available, 2, 3);

      expect(suggestions).toContain('header');
    });

    it('should suggest multiple similar classes', () => {
      const available = new Set(['btn', 'button', 'btn-primary', 'btn-secondary']);
      const suggestions = findSimilarClasses('bttn', available, 2, 3);

      // 'btn' distance 2, 'button' distance 2
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('btn'))).toBe(true);
    });

    it('should handle BEM notation suggestions', () => {
      const available = new Set(['block__element', 'block__element--modifier', 'block']);
      const suggestions = findSimilarClasses('block__elemnt', available, 2, 3);

      expect(suggestions).toContain('block__element');
    });

    it('should suggest utility class alternatives', () => {
      const available = new Set(['mt-1', 'mt-2', 'mt-3', 'mt-4', 'mb-4']);
      const suggestions = findSimilarClasses('mt-5', available, 1, 3);

      // mt-1, mt-2, mt-3, mt-4 all have distance 1
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every(s => s.startsWith('mt-'))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long class names', () => {
      const available = new Set(['super-long-class-name-with-many-parts']);
      const suggestions = findSimilarClasses(
        'super-long-class-name-with-many-part',
        available,
        2,
        3
      );

      expect(suggestions).toContain('super-long-class-name-with-many-parts');
    });

    it('should handle special characters in class names', () => {
      const available = new Set(['class-name_123', 'class-name_124', 'class-name_125']);
      const suggestions = findSimilarClasses('class-name_12', available, 1, 3);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle numeric suffixes', () => {
      const available = new Set(['btn-1', 'btn-2', 'btn-3']);
      const suggestions = findSimilarClasses('btn-4', available, 1, 3);

      expect(suggestions).toContain('btn-1');
      expect(suggestions).toContain('btn-2');
      expect(suggestions).toContain('btn-3');
    });

    it('should handle single character class names', () => {
      const available = new Set(['a', 'b', 'c']);
      const suggestions = findSimilarClasses('d', available, 1, 3);

      // Each is distance 1 (substitution), so all should be included
      expect(suggestions.length).toBe(3);
      expect(suggestions).toContain('a');
      expect(suggestions).toContain('b');
      expect(suggestions).toContain('c');
    });

    it('should correctly handle single character substitution', () => {
      const available = new Set(['a', 'b', 'c']);
      const suggestions = findSimilarClasses('x', available, 1, 3);

      // Each is distance 1 (substitution)
      expect(suggestions.length).toBe(3);
    });
  });

  describe('Default parameter values', () => {
    it('should use default maxDistance of 2', () => {
      const available = new Set(['button', 'primary']);
      const suggestions = findSimilarClasses('btn', available); // distance 3 to 'button'

      // With default maxDistance=2, 'button' (distance 3) should be excluded
      expect(suggestions).not.toContain('primary'); // distance > 2
    });

    it('should use default maxSuggestions of 3', () => {
      const available = new Set(['a', 'b', 'c', 'd', 'e']);
      const suggestions = findSimilarClasses('x', available);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });
});
