/**
 * CLI Tests
 *
 * Tests the command-line interface functionality including:
 * - Successful compilation
 * - Error handling and exit codes
 * - Various CLI flags (--check, --verbose, --quiet, --minify, --no-optimize)
 * - Output to file and stdout
 *
 * Uses OS temp directory for test isolation per Vitest best practices:
 * @see https://sdorra.dev/posts/2024-02-12-vitest-tmpdir
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const FIXTURES_PATH = path.join(__dirname, '__fixtures__');

/**
 * Creates a unique temporary directory for test isolation
 */
async function createTempDir(): Promise<string> {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'eligian-cli-test-');
  return await fsp.mkdtemp(tmpdir);
}

describe('CLI - Basic Compilation', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  afterEach(async () => {
    try {
      await fsp.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should compile valid DSL file successfully', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}"`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('✓');
    expect(fs.existsSync(outputFile)).toBe(true);

    const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('engine');
    expect(output).toHaveProperty('timelines');
    expect(output.timelines).toBeInstanceOf(Array);
  });

  it('should use --check flag to validate without output', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" --check`, { encoding: 'utf-8' });

    expect(result).toContain('is valid');
    expect(fs.existsSync(path.join(tmpdir, 'output.json'))).toBe(false);
  });

  it('should output to stdout when output is "-"', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o -`, { encoding: 'utf-8' });

    // Result should be valid JSON
    expect(() => JSON.parse(result)).not.toThrow();
    const output = JSON.parse(result);
    expect(output).toHaveProperty('timelines');
  });
});

describe('CLI - Error Handling', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  afterEach(async () => {
    try {
      await fsp.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should exit with code 1 for compilation errors', () => {
    const inputFile = path.join(FIXTURES_PATH, 'invalid-syntax.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    try {
      execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(1);
      // Error output goes to stderr
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('failed'); // Can be "Parse failed" or "Compilation failed"
    }
  });

  it('should exit with code 1 for unknown operations', () => {
    const inputFile = path.join(FIXTURES_PATH, 'invalid-operation.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    try {
      execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(1);
      // Error output goes to stderr
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('Unknown operation');
    }
  });

  it('should exit with code 3 for missing input file', () => {
    const inputFile = path.join(FIXTURES_PATH, 'nonexistent.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    try {
      execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(3);
    }
  });
});

describe('CLI - Flags and Options', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  afterEach(async () => {
    try {
      await fsp.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should support --verbose flag', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --verbose`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('Compiling');
    expect(result).toContain('Compiled');
  });

  it('should support --quiet flag', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --quiet`, {
      encoding: 'utf-8',
    });

    expect(result.trim()).toBe('');
  });

  it('should support --minify flag', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --minify`, {
      encoding: 'utf-8',
    });

    const output = fs.readFileSync(outputFile, 'utf-8');
    // Minified output should have no unnecessary whitespace
    expect(output).not.toContain('\n  ');
  });

  it('should support --no-optimize flag', () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = path.join(tmpdir, 'output.json');

    execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --no-optimize`, {
      encoding: 'utf-8',
    });

    expect(fs.existsSync(outputFile)).toBe(true);
    const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(output).toHaveProperty('timelines');
  });
});

describe('CLI - Version and Help', () => {
  it('should display version with --version', () => {
    const result = execSync(`node "${CLI_PATH}" --version`, {
      encoding: 'utf-8',
    });

    expect(result).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should display help with --help', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('Usage:');
    expect(result).toContain('Options:');
    expect(result).toContain('--check');
    expect(result).toContain('--verbose');
    expect(result).toContain('--minify');
  });

  it('should display bundle options in help', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('--bundle');
    expect(result).toContain('--inline-threshold');
    expect(result).toContain('--sourcemap');
    expect(result).toContain('--force');
  });
});

// Phase 6: Bundle CLI Options Tests
// NOTE: These tests verify CLI argument parsing for bundle options.
// Full integration tests for bundle creation are in bundler-index.spec.ts
describe('CLI - Bundle Options (Feature 040, Phase 6)', () => {
  let tmpdir: string;

  beforeEach(async () => {
    tmpdir = await createTempDir();
  });

  afterEach(async () => {
    try {
      await fsp.rm(tmpdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Test that --bundle flag is recognized and parsed correctly
  it('should recognize --bundle flag in help output', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('--bundle');
    expect(result).toContain('standalone bundle');
  });

  // Test that -o/--output option works with --bundle
  it('should recognize -o option for bundle output directory', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('-o, --output');
  });

  // Test --inline-threshold option parsing
  it('should recognize --inline-threshold option', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('--inline-threshold');
    expect(result).toContain('bytes');
  });

  // Test --sourcemap option parsing
  it('should recognize --sourcemap option', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('--sourcemap');
    expect(result).toContain('source map');
  });

  // Test --force option parsing
  it('should recognize --force option', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('--force');
    expect(result).toContain('overwrite');
  });

  // Test that bundle fails gracefully for invalid input
  it('should fail with error for bundle with non-existent input', () => {
    const inputFile = path.join(FIXTURES_PATH, 'nonexistent.eligian');
    const outputDir = path.join(tmpdir, 'bundle-output');

    try {
      execSync(`node "${CLI_PATH}" "${inputFile}" --bundle -o "${outputDir}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      // Should exit with error code (1 or 3 depending on when error is caught)
      expect(error.status).toBeGreaterThan(0);
    }
  });

  // Test that bundle fails gracefully when output exists without --force
  it('should fail when output directory exists without --force', async () => {
    const inputFile = path.join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputDir = path.join(tmpdir, 'existing-output');

    // Create existing output directory
    await fsp.mkdir(outputDir, { recursive: true });

    try {
      execSync(`node "${CLI_PATH}" "${inputFile}" --bundle -o "${outputDir}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(1);
      const output = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(output).toContain('exists');
    }
  });
});
