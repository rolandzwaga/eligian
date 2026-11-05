/**
 * resetServices (spec 058 phase 3, FR-060 / SC-015(2) language half): dropping the
 * shared Langium singleton so that the next getOrCreateServices() builds a fresh,
 * Vitest-seeded set.
 */

import { describe, expect, it } from 'vitest';
import { getOrCreateServices, resetServices } from '../pipeline/services.js';

const SEEDED_URIS = ['file:///styles.css', 'file:///memory/styles.css'];

describe('resetServices', () => {
  it('the next getOrCreateServices is a fresh, seeded set', () => {
    const a = getOrCreateServices();
    a.Eligian.css.CSSRegistry.updateCSSFile('file:///stale.css', {
      classes: new Set(['stale-class']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    resetServices();
    const b = getOrCreateServices();

    expect(b).not.toBe(a);
    expect(getOrCreateServices()).toBe(b);

    const registry = b.Eligian.css.CSSRegistry;
    expect(registry).not.toBe(a.Eligian.css.CSSRegistry);
    expect(registry.getMetadata('file:///stale.css')).toBeUndefined();
    for (const uri of SEEDED_URIS) {
      const metadata = registry.getMetadata(uri);
      expect(metadata?.classes.has('test-container')).toBe(true);
      expect(metadata?.ids.has('title')).toBe(true);
    }
  });

  it('is exported from the package root', async () => {
    const root = await import('../index.js');
    expect(typeof root.resetServices).toBe('function');
    expect(root.resetServices).toBe(resetServices);
    expect(root.getOrCreateServices).toBe(getOrCreateServices);
  });
});
