/**
 * CLI Tests
 *
 * Tests the command-line interface functionality including:
 * - Successful compilation
 * - Error handling and exit codes
 * - Various CLI flags (--check, --verbose, --quiet, --minify, --no-optimize)
 * - Output to file and stdout
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = join(__dirname, '../../bin/cli.js');
const FIXTURES_PATH = join(__dirname, '__fixtures__');
const OUTPUT_DIR = join(__dirname, '__output__');

describe('CLI - Basic Compilation', () => {
  beforeEach(() => {
    // Create output directory
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up output directory
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('should compile valid DSL file successfully', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}"`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('✓');
    expect(existsSync(outputFile)).toBe(true);

    const output = JSON.parse(readFileSync(outputFile, 'utf-8'));
    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('engine');
    expect(output).toHaveProperty('timelines');
    expect(output.timelines).toBeInstanceOf(Array);
  });

  it('should use --check flag to validate without output', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" --check`, { encoding: 'utf-8' });

    expect(result).toContain('is valid');
    expect(existsSync(join(OUTPUT_DIR, 'output.json'))).toBe(false);
  });

  it('should output to stdout when output is "-"', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o -`, { encoding: 'utf-8' });

    // Result should be valid JSON
    expect(() => JSON.parse(result)).not.toThrow();
    const output = JSON.parse(result);
    expect(output).toHaveProperty('timelines');
  });
});

describe('CLI - Error Handling', () => {
  it('should exit with code 1 for compilation errors', () => {
    const inputFile = join(FIXTURES_PATH, 'invalid-syntax.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

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
    const inputFile = join(FIXTURES_PATH, 'invalid-operation.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

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
    const inputFile = join(FIXTURES_PATH, 'nonexistent.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

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
  beforeEach(() => {
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('should support --verbose flag', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --verbose`, {
      encoding: 'utf-8',
    });

    expect(result).toContain('Compiling');
    expect(result).toContain('Compiled');
  });

  it('should support --quiet flag', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

    const result = execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --quiet`, {
      encoding: 'utf-8',
    });

    expect(result.trim()).toBe('');
  });

  it('should support --minify flag', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

    execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --minify`, {
      encoding: 'utf-8',
    });

    const output = readFileSync(outputFile, 'utf-8');
    // Minified output should have no unnecessary whitespace
    expect(output).not.toContain('\n  ');
  });

  it('should support --no-optimize flag', () => {
    const inputFile = join(FIXTURES_PATH, 'valid-simple.eligian');
    const outputFile = join(OUTPUT_DIR, 'output.json');

    execSync(`node "${CLI_PATH}" "${inputFile}" -o "${outputFile}" --no-optimize`, {
      encoding: 'utf-8',
    });

    expect(existsSync(outputFile)).toBe(true);
    const output = JSON.parse(readFileSync(outputFile, 'utf-8'));
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
});
