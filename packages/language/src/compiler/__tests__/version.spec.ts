import { describe, expect, it } from 'vitest';
import { VERSION } from '../index.js';
import { getCompilerVersion } from '../pipeline.js';
import { DEVELOPMENT_VERSION } from '../version.js';

describe('compiler version', () => {
  it('reports the development version without define', () => {
    expect(getCompilerVersion()).toEqual({
      compiler: DEVELOPMENT_VERSION,
      eligius: DEVELOPMENT_VERSION,
    });
    expect(VERSION).toBe(DEVELOPMENT_VERSION);
  });
});
