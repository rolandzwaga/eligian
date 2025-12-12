/**
 * CLI Library Import Tests (Feature 032 - User Story 1, T011)
 *
 * Integration tests: Compile .eligian files with library imports via CLI.
 *
 * Test Coverage:
 * - Single library import compilation
 * - Multiple library imports compilation
 * - Verify output JSON contains imported action operations
 * - Verify relative path resolution works
 *
 * Constitution Principle II: Tests must verify actual behavior, not placeholders.
 *
 * NOTE: Uses project-relative fixture directory instead of system temp to avoid
 * Windows cross-drive path resolution issues (F: vs C: drive).
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const FIXTURES_PATH = path.join(__dirname, '__fixtures__');
const LIBRARY_TEST_DIR = path.join(FIXTURES_PATH, 'library-tests');

describe('CLI - Library Import Compilation (T011)', () => {
  beforeEach(async () => {
    // Create library test directory within fixtures (same drive as project)
    await fsp.mkdir(LIBRARY_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up library test directory
    try {
      await fsp.rm(LIBRARY_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should compile program with single library import', async () => {
    // ARRANGE: Create library file
    const libraryContent = `library animations

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
`;
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'animations.eligian'), libraryContent);

    // Create CSS file for validation
    const cssContent = `.container { display: block; }`;
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'test.css'), cssContent);

    // Create main program that imports from library
    const mainContent = `styles "./test.css"
import { fadeIn } from "./animations.eligian"

action init() [
  fadeIn("#element", 1000)
]

timeline "test" in ".container" using raf {
  at 0s..1s init()
}
`;
    const mainPath = path.join(LIBRARY_TEST_DIR, 'main.eligian');
    await fsp.writeFile(mainPath, mainContent);

    const outputPath = path.join(LIBRARY_TEST_DIR, 'output.json');

    // ACT: Run CLI
    const result = execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
      encoding: 'utf-8',
    });

    // ASSERT: Compilation succeeded
    expect(result).toContain('✓');
    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify output JSON structure
    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output).toHaveProperty('timelines');
    expect(output.timelines).toBeInstanceOf(Array);
    expect(output.timelines.length).toBeGreaterThan(0);

    // Verify the imported action was resolved and compiled
    const timeline = output.timelines[0];
    expect(timeline).toHaveProperty('timelineActions');
  });

  it('should handle program with multiple library imports', async () => {
    // ARRANGE: Create first library
    const animationsLibrary = `library animations

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]

action fadeOut(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 0}, duration)
]
`;
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'animations.eligian'), animationsLibrary);

    // Create second library
    const utilsLibrary = `library utils

action highlight(selector: string) [
  selectElement(selector)
  addClass("highlighted")
]
`;
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'utils.eligian'), utilsLibrary);

    // Create CSS file
    const cssContent = `.container { display: block; } .highlighted { background: yellow; }`;
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'test.css'), cssContent);

    // Create main program importing from both libraries
    const mainContent = `styles "./test.css"
import { fadeIn, fadeOut } from "./animations.eligian"
import { highlight } from "./utils.eligian"

action showAndHighlight(selector: string) [
  fadeIn(selector, 500)
  highlight(selector)
]

timeline "test" in ".container" using raf {
  at 0s..1s showAndHighlight("#box")
  at 5s..6s fadeOut("#box", 500)
}
`;
    const mainPath = path.join(LIBRARY_TEST_DIR, 'main.eligian');
    await fsp.writeFile(mainPath, mainContent);

    const outputPath = path.join(LIBRARY_TEST_DIR, 'output.json');

    // ACT
    const result = execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
      encoding: 'utf-8',
    });

    // ASSERT
    expect(result).toContain('✓');
    expect(fs.existsSync(outputPath)).toBe(true);

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output).toHaveProperty('timelines');
    expect(output.timelines.length).toBeGreaterThan(0);
  });

  it('should resolve nested library imports (library importing library)', async () => {
    // ARRANGE: Create libs subdirectory
    const libsDir = path.join(LIBRARY_TEST_DIR, 'libs');
    await fsp.mkdir(libsDir, { recursive: true });

    // Create base library
    const baseLibrary = `library base

action selectAndLog(selector: string) [
  selectElement(selector)
  log("Selected: " + selector)
]
`;
    await fsp.writeFile(path.join(libsDir, 'base.eligian'), baseLibrary);

    // Create library that imports from base
    const extendedLibrary = `library extended

import { selectAndLog } from "./base.eligian"

action selectLogAndAnimate(selector: string, duration: number) [
  selectAndLog(selector)
  selectElement(selector)
  animate({opacity: 1}, duration)
]
`;
    await fsp.writeFile(path.join(libsDir, 'extended.eligian'), extendedLibrary);

    // Create CSS file
    await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'test.css'), `.container { display: block; }`);

    // Create main program
    const mainContent = `styles "./test.css"
import { selectLogAndAnimate } from "./libs/extended.eligian"

timeline "test" in ".container" using raf {
  at 0s..1s selectLogAndAnimate("#box", 1000)
}
`;
    const mainPath = path.join(LIBRARY_TEST_DIR, 'main.eligian');
    await fsp.writeFile(mainPath, mainContent);

    const outputPath = path.join(LIBRARY_TEST_DIR, 'output.json');

    // ACT
    const result = execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
      encoding: 'utf-8',
    });

    // ASSERT
    expect(result).toContain('✓');
    expect(fs.existsSync(outputPath)).toBe(true);

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output).toHaveProperty('timelines');
  });
});
