/**
 * Usage Tracking Tests (Feature 045, Phase 4F)
 *
 * Tests for tracking translation key usage across .eligian files.
 * Tests cover:
 * - T057: Scanning .eligian files for translation key references
 * - T058: Usage count calculation per key
 * - T059: Usage file list per key
 */

import { beforeEach, describe, expect, it } from 'vitest';

// Types for usage tracking
interface KeyUsage {
  count: number;
  files: UsageLocation[];
}

interface UsageLocation {
  filePath: string;
  line: number;
  column: number;
}

interface UsageTrackingResult {
  usageByKey: Map<string, KeyUsage>;
  totalUsages: number;
  filesScanned: number;
}

// Mock implementation for testing
function createUsageTracker() {
  const usageByKey = new Map<string, KeyUsage>();

  return {
    /**
     * Record a translation key usage
     */
    recordUsage(key: string, filePath: string, line: number, column: number): void {
      const existing = usageByKey.get(key) || { count: 0, files: [] };
      existing.count++;
      existing.files.push({ filePath, line, column });
      usageByKey.set(key, existing);
    },

    /**
     * Get usage for a specific key
     */
    getKeyUsage(key: string): KeyUsage | undefined {
      return usageByKey.get(key);
    },

    /**
     * Get all usages
     */
    getAllUsages(): UsageTrackingResult {
      let totalUsages = 0;
      const filesSet = new Set<string>();

      for (const usage of usageByKey.values()) {
        totalUsages += usage.count;
        for (const loc of usage.files) {
          filesSet.add(loc.filePath);
        }
      }

      return {
        usageByKey,
        totalUsages,
        filesScanned: filesSet.size,
      };
    },

    /**
     * Clear all usage data
     */
    clear(): void {
      usageByKey.clear();
    },
  };
}

// Utility to extract translation keys from .eligian content
function extractTranslationKeyUsages(
  content: string,
  _filePath: string
): Array<{ key: string; line: number; column: number }> {
  const usages: Array<{ key: string; line: number; column: number }> = [];

  // Pattern matches LabelController with translationKey parameter
  // Example: addController("LabelController", "nav.home", {...})
  const labelControllerPattern = /addController\s*\(\s*"LabelController"\s*,\s*"([^"]+)"/g;

  const lines = content.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let match: RegExpExecArray | null;

    // Reset lastIndex for global regex
    labelControllerPattern.lastIndex = 0;

    while ((match = labelControllerPattern.exec(line)) !== null) {
      usages.push({
        key: match[1],
        line: lineIdx + 1, // 1-indexed
        column: match.index + match[0].indexOf(match[1]) + 1, // Position of key
      });
    }
  }

  return usages;
}

describe('Usage Tracking (Feature 045, Phase 4F)', () => {
  let tracker: ReturnType<typeof createUsageTracker>;

  beforeEach(() => {
    tracker = createUsageTracker();
  });

  describe('T057: extractTranslationKeyUsages()', () => {
    it('should extract single translation key from LabelController call', () => {
      const content = `
timeline "Demo" at 0s {
  at 0s selectElement("#title") {
    addController("LabelController", "nav.home", { selector: "#title" })
  }
}`;
      const usages = extractTranslationKeyUsages(content, 'demo.eligian');

      expect(usages).toHaveLength(1);
      expect(usages[0].key).toBe('nav.home');
      expect(usages[0].line).toBe(4);
    });

    it('should extract multiple translation keys', () => {
      const content = `
at 0s selectElement("#a") { addController("LabelController", "nav.home", {}) }
at 1s selectElement("#b") { addController("LabelController", "nav.about", {}) }
at 2s selectElement("#c") { addController("LabelController", "footer.copyright", {}) }
`;
      const usages = extractTranslationKeyUsages(content, 'demo.eligian');

      expect(usages).toHaveLength(3);
      expect(usages.map(u => u.key)).toEqual(['nav.home', 'nav.about', 'footer.copyright']);
    });

    it('should handle nested keys correctly', () => {
      const content = `addController("LabelController", "app.ui.buttons.submit", {})`;
      const usages = extractTranslationKeyUsages(content, 'demo.eligian');

      expect(usages).toHaveLength(1);
      expect(usages[0].key).toBe('app.ui.buttons.submit');
    });

    it('should return empty array for content without LabelController', () => {
      const content = `
timeline "Demo" at 0s {
  at 0s selectElement("#box") {
    addClass("active")
  }
}`;
      const usages = extractTranslationKeyUsages(content, 'demo.eligian');

      expect(usages).toHaveLength(0);
    });

    it('should handle whitespace variations', () => {
      const content = `addController(  "LabelController"  ,  "nav.home"  , {})`;
      const usages = extractTranslationKeyUsages(content, 'demo.eligian');

      expect(usages).toHaveLength(1);
      expect(usages[0].key).toBe('nav.home');
    });
  });

  describe('T058: Usage count tracking', () => {
    it('should track single usage per key', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);

      const usage = tracker.getKeyUsage('nav.home');
      expect(usage?.count).toBe(1);
    });

    it('should track multiple usages of same key', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.home', 'file2.eligian', 20, 10);
      tracker.recordUsage('nav.home', 'file1.eligian', 15, 5);

      const usage = tracker.getKeyUsage('nav.home');
      expect(usage?.count).toBe(3);
    });

    it('should track usages independently per key', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.about', 'file1.eligian', 11, 5);
      tracker.recordUsage('nav.home', 'file2.eligian', 20, 10);

      expect(tracker.getKeyUsage('nav.home')?.count).toBe(2);
      expect(tracker.getKeyUsage('nav.about')?.count).toBe(1);
    });

    it('should return undefined for unused keys', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);

      expect(tracker.getKeyUsage('nav.unused')).toBeUndefined();
    });

    it('should calculate total usages correctly', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.about', 'file1.eligian', 11, 5);
      tracker.recordUsage('nav.home', 'file2.eligian', 20, 10);

      const result = tracker.getAllUsages();
      expect(result.totalUsages).toBe(3);
    });
  });

  describe('T059: Usage file list', () => {
    it('should record file locations for key usage', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.home', 'file2.eligian', 20, 10);

      const usage = tracker.getKeyUsage('nav.home');
      expect(usage?.files).toHaveLength(2);
      expect(usage?.files[0]).toEqual({ filePath: 'file1.eligian', line: 10, column: 5 });
      expect(usage?.files[1]).toEqual({ filePath: 'file2.eligian', line: 20, column: 10 });
    });

    it('should count unique files scanned', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.about', 'file1.eligian', 11, 5);
      tracker.recordUsage('nav.home', 'file2.eligian', 20, 10);
      tracker.recordUsage('footer.text', 'file3.eligian', 5, 5);

      const result = tracker.getAllUsages();
      expect(result.filesScanned).toBe(3);
    });

    it('should preserve file location order (chronological)', () => {
      tracker.recordUsage('nav.home', 'a.eligian', 1, 1);
      tracker.recordUsage('nav.home', 'b.eligian', 2, 2);
      tracker.recordUsage('nav.home', 'c.eligian', 3, 3);

      const usage = tracker.getKeyUsage('nav.home');
      expect(usage?.files.map(f => f.filePath)).toEqual(['a.eligian', 'b.eligian', 'c.eligian']);
    });
  });

  describe('Usage tracker lifecycle', () => {
    it('should clear all usage data', () => {
      tracker.recordUsage('nav.home', 'file1.eligian', 10, 5);
      tracker.recordUsage('nav.about', 'file1.eligian', 11, 5);

      tracker.clear();

      expect(tracker.getKeyUsage('nav.home')).toBeUndefined();
      expect(tracker.getKeyUsage('nav.about')).toBeUndefined();
      expect(tracker.getAllUsages().totalUsages).toBe(0);
    });
  });
});

describe('Webview usage display', () => {
  it('should format usage count as badge text', () => {
    const formatUsageCount = (count: number): string => {
      if (count === 0) return '';
      if (count > 99) return '99+';
      return count.toString();
    };

    expect(formatUsageCount(0)).toBe('');
    expect(formatUsageCount(1)).toBe('1');
    expect(formatUsageCount(50)).toBe('50');
    expect(formatUsageCount(99)).toBe('99');
    expect(formatUsageCount(100)).toBe('99+');
    expect(formatUsageCount(1000)).toBe('99+');
  });

  it('should format usage tooltip', () => {
    const formatUsageTooltip = (usage: KeyUsage | undefined): string => {
      if (!usage || usage.count === 0) {
        return 'Not used in any .eligian files';
      }
      const fileCount = new Set(usage.files.map(f => f.filePath)).size;
      if (usage.count === 1) {
        return `Used 1 time in ${usage.files[0].filePath}`;
      }
      return `Used ${usage.count} times across ${fileCount} file${fileCount > 1 ? 's' : ''}`;
    };

    expect(formatUsageTooltip(undefined)).toBe('Not used in any .eligian files');
    expect(formatUsageTooltip({ count: 0, files: [] })).toBe('Not used in any .eligian files');
    expect(
      formatUsageTooltip({
        count: 1,
        files: [{ filePath: 'demo.eligian', line: 10, column: 5 }],
      })
    ).toBe('Used 1 time in demo.eligian');
    expect(
      formatUsageTooltip({
        count: 3,
        files: [
          { filePath: 'a.eligian', line: 1, column: 1 },
          { filePath: 'b.eligian', line: 2, column: 2 },
          { filePath: 'a.eligian', line: 3, column: 3 },
        ],
      })
    ).toBe('Used 3 times across 2 files');
  });
});
