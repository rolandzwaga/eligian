/**
 * CLI Library Error Tests (Feature 032 - User Story 2, T026-T027)
 *
 * Integration tests: Verify CLI shows clear error messages for library failures.
 *
 * Test Coverage:
 * - T026: Missing library file error (FileNotFound)
 * - T027: Library syntax error (ParseError)
 *
 * Constitution Principle II: Tests must verify actual behavior, not placeholders.
 */

import { execSync } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const FIXTURES_PATH = path.join(__dirname, '__fixtures__');
const LIBRARY_TEST_DIR = path.join(FIXTURES_PATH, 'library-error-tests');

describe('CLI Library Error Handling (T026-T027)', () => {
  beforeEach(async () => {
    await fsp.mkdir(LIBRARY_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsp.rm(LIBRARY_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('T026: Missing library file error', () => {
    it('should show helpful error when library file not found', async () => {
      // ARRANGE: Create CSS file
      await fsp.writeFile(
        path.join(LIBRARY_TEST_DIR, 'test.css'),
        `.container { display: block; }`
      );

      // Create main program importing non-existent library
      const mainContent = `styles "./test.css"
import { fadeIn } from "./nonexistent.eligian"

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

      // ACT & ASSERT: Run CLI and expect failure
      try {
        execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const execError = error as { status: number; stderr?: string; stdout?: string };
        expect(execError.status).toBe(1);

        const output = execError.stderr?.toString() || execError.stdout?.toString() || '';
        // Should mention the missing file
        expect(output.toLowerCase()).toMatch(/failed|not found|no such file|enoent/i);
      }
    });

    it('should show error for deeply nested missing library', async () => {
      // ARRANGE: Create a library that imports a non-existent library
      const libsDir = path.join(LIBRARY_TEST_DIR, 'libs');
      await fsp.mkdir(libsDir, { recursive: true });

      const brokenLibrary = `library broken

import { helper } from "./missing-helper.eligian"

action usesHelper() [
  helper("#element")
]
`;
      await fsp.writeFile(path.join(libsDir, 'broken.eligian'), brokenLibrary);

      // Create CSS file
      await fsp.writeFile(
        path.join(LIBRARY_TEST_DIR, 'test.css'),
        `.container { display: block; }`
      );

      // Create main program importing the broken library
      const mainContent = `styles "./test.css"
import { usesHelper } from "./libs/broken.eligian"

timeline "test" in ".container" using raf {
  at 0s..1s usesHelper()
}
`;
      const mainPath = path.join(LIBRARY_TEST_DIR, 'main.eligian');
      await fsp.writeFile(mainPath, mainContent);

      const outputPath = path.join(LIBRARY_TEST_DIR, 'output.json');

      // ACT & ASSERT
      try {
        execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const execError = error as { status: number; stderr?: string; stdout?: string };
        expect(execError.status).toBe(1);

        const output = execError.stderr?.toString() || execError.stdout?.toString() || '';
        // Should mention the missing file
        expect(output.toLowerCase()).toMatch(/failed|not found|no such file|enoent/i);
      }
    });
  });

  describe('T027: Library syntax error', () => {
    it('should show library filename and error location for parse errors', async () => {
      // ARRANGE: Create library with syntax error
      const brokenLibrary = `library broken

action fadeIn(selector: string, duration: number) [
  selectElement(selector)
  animate({opacity: 1  // Missing closing brace - syntax error
]
`;
      await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'broken.eligian'), brokenLibrary);

      // Create CSS file
      await fsp.writeFile(
        path.join(LIBRARY_TEST_DIR, 'test.css'),
        `.container { display: block; }`
      );

      // Create main program importing broken library
      const mainContent = `styles "./test.css"
import { fadeIn } from "./broken.eligian"

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

      // ACT & ASSERT
      try {
        execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const execError = error as { status: number; stderr?: string; stdout?: string };
        expect(execError.status).toBe(1);

        const output = execError.stderr?.toString() || execError.stdout?.toString() || '';
        // Should mention parse/syntax error
        expect(output.toLowerCase()).toMatch(/parse|syntax|expecting|error/i);
      }
    });

    it('should show semantic errors in library files', async () => {
      // ARRANGE: Create library with semantic error (unknown operation)
      const brokenLibrary = `library broken

action fadeIn(selector: string) [
  selectElement(selector)
  nonExistentOperation("something")
]
`;
      await fsp.writeFile(path.join(LIBRARY_TEST_DIR, 'broken.eligian'), brokenLibrary);

      // Create CSS file
      await fsp.writeFile(
        path.join(LIBRARY_TEST_DIR, 'test.css'),
        `.container { display: block; }`
      );

      // Create main program importing broken library
      const mainContent = `styles "./test.css"
import { fadeIn } from "./broken.eligian"

action init() [
  fadeIn("#element")
]

timeline "test" in ".container" using raf {
  at 0s..1s init()
}
`;
      const mainPath = path.join(LIBRARY_TEST_DIR, 'main.eligian');
      await fsp.writeFile(mainPath, mainContent);

      const outputPath = path.join(LIBRARY_TEST_DIR, 'output.json');

      // ACT & ASSERT
      try {
        execSync(`node "${CLI_PATH}" "${mainPath}" -o "${outputPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const execError = error as { status: number; stderr?: string; stdout?: string };
        expect(execError.status).toBe(1);

        const output = execError.stderr?.toString() || execError.stdout?.toString() || '';
        // Should mention unknown operation
        expect(output.toLowerCase()).toMatch(/unknown|operation|error/i);
      }
    });
  });
});
