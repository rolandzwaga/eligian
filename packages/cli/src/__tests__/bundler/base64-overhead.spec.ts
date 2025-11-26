/**
 * Base64 Overhead Validation Tests (IMP5)
 *
 * Tests for SC-006: Image inlining reduces the number of HTTP requests by
 * converting small images to data URIs without increasing total bundle size
 * by more than 33% (base64 overhead).
 *
 * Tests the calculateInlineOverhead() pure function.
 */

import { describe, expect, test } from 'vitest';
import { calculateInlineOverhead } from '../../bundler/inline-overhead.js';
import type { AssetEntry } from '../../bundler/types.js';

/**
 * Create a minimal asset entry for testing
 */
function createAssetEntry(overrides: Partial<AssetEntry> = {}): AssetEntry {
  return {
    originalRef: './image.png',
    sourcePath: '/test/images/image.png',
    outputPath: 'assets/image.png',
    size: 1024,
    inline: false,
    mimeType: 'image/png',
    sources: [],
    ...overrides,
  };
}

describe('Base64 Overhead Calculation (IMP5)', () => {
  describe('calculateInlineOverhead', () => {
    test('should return zeros when no assets are inlined', () => {
      const assets = new Map<string, AssetEntry>([
        ['/path/to/image.png', createAssetEntry({ inline: false })],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(0);
      expect(result.inlinedEncodedSize).toBe(0);
      expect(result.inlineOverheadPercent).toBe(0);
    });

    test('should return zeros when asset map is empty', () => {
      const assets = new Map<string, AssetEntry>();

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(0);
      expect(result.inlinedEncodedSize).toBe(0);
      expect(result.inlineOverheadPercent).toBe(0);
    });

    test('should calculate overhead for single inlined asset', () => {
      // A 1000-byte file becomes ~1370 bytes when base64 encoded (+37% typical)
      const originalSize = 1000;
      const dataUri = `data:image/png;base64,${'A'.repeat(1370)}`; // Simulate ~1370 byte data URI

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: originalSize,
            dataUri,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(originalSize);
      expect(result.inlinedEncodedSize).toBe(dataUri.length);
      // Overhead = (1392 - 1000) / 1000 * 100 = 39.2%
      expect(result.inlineOverheadPercent).toBeGreaterThan(30);
    });

    test('should calculate overhead for multiple inlined assets', () => {
      const dataUri1 = `data:image/png;base64,${'A'.repeat(1370)}`; // ~1392 bytes
      const dataUri2 = `data:image/png;base64,${'B'.repeat(685)}`; // ~707 bytes

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image1.png',
          createAssetEntry({
            inline: true,
            size: 1000,
            dataUri: dataUri1,
          }),
        ],
        [
          '/path/to/image2.png',
          createAssetEntry({
            inline: true,
            size: 500,
            dataUri: dataUri2,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(1500); // 1000 + 500
      expect(result.inlinedEncodedSize).toBe(dataUri1.length + dataUri2.length);
      // Should be around 37-40% for typical base64
      expect(result.inlineOverheadPercent).toBeGreaterThan(30);
    });

    test('should exclude non-inlined assets from overhead calculation', () => {
      const dataUri = `data:image/png;base64,${'A'.repeat(1370)}`;

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/inlined.png',
          createAssetEntry({
            inline: true,
            size: 1000,
            dataUri,
          }),
        ],
        [
          '/path/to/copied.png',
          createAssetEntry({
            inline: false,
            size: 50000, // Large file, not inlined
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      // Only the inlined asset should count
      expect(result.inlinedOriginalSize).toBe(1000);
      expect(result.inlinedEncodedSize).toBe(dataUri.length);
    });

    test('should handle inlined asset with missing dataUri gracefully', () => {
      // Edge case: asset marked inline but dataUri not generated (error scenario)
      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: 1000,
            dataUri: undefined, // Missing
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      // Should treat missing dataUri as 0 encoded size
      expect(result.inlinedOriginalSize).toBe(1000);
      expect(result.inlinedEncodedSize).toBe(0);
      // Overhead would be negative, but should handle gracefully
      expect(result.inlineOverheadPercent).toBeLessThan(0);
    });

    test('should calculate exact 33% overhead correctly', () => {
      // Original: 1000 bytes, Encoded: 1330 bytes = exactly 33% overhead
      const originalSize = 1000;
      const encodedSize = 1330;
      const dataUri = `data:image/png;base64,${'A'.repeat(encodedSize - 22)}`; // -22 for prefix length

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: originalSize,
            dataUri,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(originalSize);
      expect(result.inlinedEncodedSize).toBe(encodedSize);
      expect(result.inlineOverheadPercent).toBe(33);
    });

    test('should calculate typical base64 overhead (~37%)', () => {
      // Base64 increases size by 4/3 = ~33.33% for raw data
      // With data URI prefix (data:image/xxx;base64,) it's slightly more
      // Typical total overhead is around 37%
      const originalSize = 1000;
      const base64Content = Buffer.alloc(originalSize).toString('base64'); // 1333 chars for 1000 bytes
      const dataUri = `data:image/png;base64,${base64Content}`;

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: originalSize,
            dataUri,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlinedOriginalSize).toBe(originalSize);
      // data:image/png;base64, = 22 chars + 1333 base64 chars = 1355 total
      expect(result.inlinedEncodedSize).toBe(dataUri.length);
      // Overhead = (1355 - 1000) / 1000 * 100 = 35.5%
      expect(result.inlineOverheadPercent).toBeCloseTo(35.5, 0);
    });
  });

  describe('overhead threshold checks', () => {
    test('should identify when overhead exceeds 33% threshold', () => {
      // 40% overhead - exceeds threshold
      const originalSize = 1000;
      const encodedSize = 1400; // 40% overhead
      const dataUri = `data:image/png;base64,${'A'.repeat(encodedSize - 22)}`;

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: originalSize,
            dataUri,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlineOverheadPercent).toBeGreaterThan(33);
    });

    test('should identify when overhead is within 33% threshold', () => {
      // 30% overhead - within threshold
      const originalSize = 1000;
      const encodedSize = 1300; // 30% overhead
      const dataUri = `data:image/png;base64,${'A'.repeat(encodedSize - 22)}`;

      const assets = new Map<string, AssetEntry>([
        [
          '/path/to/image.png',
          createAssetEntry({
            inline: true,
            size: originalSize,
            dataUri,
          }),
        ],
      ]);

      const result = calculateInlineOverhead(assets);

      expect(result.inlineOverheadPercent).toBeLessThanOrEqual(33);
    });
  });
});
