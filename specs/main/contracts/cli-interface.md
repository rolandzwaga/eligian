# CLI Interface Contract

**Date**: 2025-10-14
**Component**: Command-Line Compiler

## Overview

The CLI provides command-line access to the Eligius DSL compiler. It follows standard Unix conventions for arguments, exit codes, and output formatting.

## Command Structure

```bash
eligius-dsl <command> [options] [arguments]
```

## Commands

### `compile`

Compiles DSL source file(s) to Eligius JSON configuration.

**Usage**:
```bash
eligius-dsl compile <input> [options]
eligius-dsl compile <input> -o <output>
eligius-dsl compile src/*.eli -o dist/
```

**Arguments**:
- `<input>`: Path to DSL file(s). Supports glob patterns.

**Options**:
| Flag | Long Form | Description | Default |
|------|-----------|-------------|---------|
| `-o` | `--output` | Output file or directory | stdout |
| `-w` | `--watch` | Watch mode (recompile on changes) | false |
| `-m` | `--minify` | Minify JSON output | false |
| `-s` | `--sourcemap` | Generate source maps | false |
| `-c` | `--config` | Config file path | `eligius.config.json` |
| `-v` | `--verbose` | Verbose logging | false |
| `-q` | `--quiet` | Suppress non-error output | false |
| | `--no-optimize` | Skip optimization passes | false |
| | `--check` | Check syntax without compilation | false |

**Examples**:
```bash
# Compile single file to stdout
eligius-dsl compile presentation.eli

# Compile to file
eligius-dsl compile presentation.eli -o dist/config.json

# Compile multiple files
eligius-dsl compile src/*.eli -o dist/

# Watch mode
eligius-dsl compile src/main.eli -o dist/config.json --watch

# Check syntax only
eligius-dsl compile src/main.eli --check
```

**Exit Codes**:
- `0`: Success
- `1`: Compilation error
- `2`: Invalid arguments
- `3`: File I/O error

**Output Format**:

**Success** (stdout or file):
```json
{
  "timeline": { ... },
  "events": [ ... ]
}
```

**Error** (stderr):
```
Error: Type error at line 15, column 10
  event intro at 0..5 {
                  ^
  Expected number, got string

Hint: Time values must be numeric. Use 5 instead of "5".
```

### `version`

Displays compiler version and build information.

**Usage**:
```bash
eligius-dsl version
eligius-dsl --version
eligius-dsl -V
```

**Output**:
```
Eligius DSL Compiler v1.0.0
Build: 2025-10-14T12:00:00Z
Commit: abc123def
Node: v20.10.0
```

**Exit Code**: `0`

### `help`

Displays help information.

**Usage**:
```bash
eligius-dsl help
eligius-dsl help compile
eligius-dsl --help
eligius-dsl -h
```

**Output**:
```
Eligius DSL Compiler - Compile declarative DSL to Eligius JSON

Usage: eligius-dsl <command> [options]

Commands:
  compile <input>  Compile DSL file(s) to JSON
  version          Show version information
  help [command]   Show help for command

Options:
  -h, --help     Show help
  -V, --version  Show version

For more information, visit: https://github.com/rolandzwaga/eligius-dsl-spec
```

**Exit Code**: `0`

## Configuration File

Optional `eligius.config.json` for project-level settings.

**Location**: Project root or specified via `--config`

**Format**:
```json
{
  "compilerOptions": {
    "minify": false,
    "sourcemap": true,
    "optimize": true,
    "target": "eligius-1.0"
  },
  "include": ["src/**/*.eli"],
  "exclude": ["**/*.test.eli"],
  "output": "dist/"
}
```

**Schema**:
```typescript
type Config = {
  compilerOptions?: {
    minify?: boolean
    sourcemap?: boolean
    optimize?: boolean
    target?: "eligius-1.0" | string
  }
  include?: string[]
  exclude?: string[]
  output?: string
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ELIGIUS_DSL_CONFIG` | Path to config file | `eligius.config.json` |
| `ELIGIUS_DSL_LOG_LEVEL` | Log level (error, warn, info, debug) | `info` |
| `ELIGIUS_DSL_NO_COLOR` | Disable colored output | `false` |

## Error Handling

All errors are printed to stderr with:
1. Error type (ParseError, TypeError, etc.)
2. Source location (file, line, column)
3. Error message
4. Code snippet (if available)
5. Hint (if available)

**Example**:
```
ValidationError: Duplicate event ID 'intro' at presentation.eli:20:7

  event intro at 10..15 {
        ^^^^^

Hint: Event IDs must be unique. The ID 'intro' was already defined at line 5.

Related:
  presentation.eli:5:7 - First definition of 'intro'
```

## Logging

With `--verbose`:
```
[INFO] Loading configuration from eligius.config.json
[INFO] Compiling presentation.eli
[DEBUG] Phase: Parse (12ms)
[DEBUG] Phase: Validate (5ms)
[DEBUG] Phase: Type Check (8ms)
[DEBUG] Phase: Transform (15ms)
[DEBUG] Phase: Optimize (3ms)
[DEBUG] Phase: Emit (2ms)
[INFO] Compiled successfully (45ms)
[INFO] Output written to dist/config.json (2.1 KB)
```

With `--quiet`:
```
(no output on success, errors only on stderr)
```

## Performance Expectations

Per technical context:
- **Typical files (<1000 lines)**: <500ms compilation time
- **Large files (5000 lines)**: <2s compilation time
- **Watch mode**: Incremental recompilation <200ms

## Testing

CLI must have integration tests covering:
1. Successful compilation
2. Error handling (all error types)
3. Multiple input files
4. Watch mode
5. Configuration file loading
6. Exit codes
7. Output formatting

---

**Contract Version**: 1.0.0
**Status**: Defined
**Next**: Implement in `src/cli/`
