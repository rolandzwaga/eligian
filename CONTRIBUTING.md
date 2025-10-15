# Contributing to Eligian

Thank you for your interest in contributing to Eligian! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Submitting Changes](#submitting-changes)
- [Coding Guidelines](#coding-guidelines)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/eligian.git
   cd eligian
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/original/eligian.git
   ```

## Development Setup

### Prerequisites

- **Node.js**: v18 or higher
- **pnpm**: v8 or higher (install with `npm install -g pnpm`)
- **Git**: Latest version

### Installation

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

### Project Structure

This is a monorepo with multiple packages:

```
packages/
├── language/     # Langium grammar, compiler, operation registry
├── cli/          # Command-line interface
└── extension/    # VS Code extension
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

Follow the [Coding Guidelines](#coding-guidelines) below.

### 3. Run Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode (during development)
cd packages/language
pnpm run test -- --watch
```

### 4. Code Quality Checks

```bash
# Format and lint code (with auto-fix)
pnpm run check

# Just lint (no auto-fix)
pnpm run lint

# Just format
pnpm run format
```

### 5. Build

```bash
pnpm run build
```

### 6. Commit

Write clear, concise commit messages:

```bash
git commit -m "feat: add support for custom operations"
git commit -m "fix: resolve type error in transformer"
git commit -m "docs: update README with new examples"
```

**Commit Message Format:**
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `test:` adding or updating tests
- `refactor:` code refactoring
- `chore:` maintenance tasks

## Testing

### Running Tests

```bash
# All tests
pnpm run test

# Specific package
cd packages/language
pnpm test
```

### Writing Tests

- Place tests in `__tests__/` directories
- Use `.spec.ts` file extension
- Follow existing test patterns
- Aim for high coverage (especially for compiler stages)

Example test structure:

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = ...;

    // Act
    const result = ...;

    // Assert
    expect(result).toBe(...);
  });
});
```

## Code Quality

This project uses **Biome** for formatting and linting.

### Running Biome

```bash
# Format and lint with auto-fix
pnpm run check

# Check without modifying files (CI mode)
pnpm run ci
```

### Biome Rules

- 2-space indentation
- Single quotes
- Semicolons required
- 100 character line width
- See `biome.json` for full configuration

### Before Committing

**Always run:**
```bash
pnpm run check
pnpm run build
pnpm run test
```

All three must pass before submitting a pull request.

## Submitting Changes

### Pull Request Process

1. **Update your branch:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push to your fork:**
   ```bash
   git push origin your-branch-name
   ```

3. **Create a Pull Request** on GitHub

4. **Fill out the PR template** with:
   - Description of changes
   - Related issues
   - Testing performed
   - Screenshots (if UI changes)

5. **Wait for review** - maintainers will review and provide feedback

### PR Requirements

- [ ] All tests pass
- [ ] Code follows style guidelines (Biome passes)
- [ ] New features have tests
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly documented)

## Coding Guidelines

### General Principles

Follow the project constitution (`.specify/memory/constitution.md`):

1. **Simplicity First**: Keep it simple and readable
2. **Comprehensive Testing**: Test all code paths
3. **Functional Programming**: Prefer immutability and pure functions
4. **Effect-ts Usage**: Use Effect for side effects in compiler
5. **Type Safety**: Leverage TypeScript's type system

### TypeScript Guidelines

- Use `const` over `let` when possible
- Prefer type inference over explicit types (when clear)
- Use `readonly` for arrays and objects that shouldn't be mutated
- Avoid `any` - use `unknown` if type is truly unknown
- Export types with `export type` not `export interface` (when possible)

### Compiler Code

- Use Effect-ts for all side effects
- Make transformations pure functions
- Include source locations in all IR nodes
- Document complex transformations
- Test both success and error paths

### Example

```typescript
// Good
export const transformExpression = (
  expr: Expression
): Effect.Effect<JsonValue, TransformError> => {
  switch (expr.$type) {
    case 'NumberLiteral':
      return Effect.succeed(expr.value);
    default:
      return Effect.fail({
        _tag: 'TransformError',
        kind: 'InvalidExpression',
        message: `Unknown expression type: ${expr.$type}`,
        location: getSourceLocation(expr),
      });
  }
};

// Bad
export function transformExpression(expr: any) {
  if (expr.$type === 'NumberLiteral') {
    return expr.value;
  }
  throw new Error('Unknown expression'); // Don't throw!
}
```

### Documentation

- Add JSDoc comments to public APIs
- Document complex algorithms
- Include examples in documentation
- Keep README files up to date

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to Eligian!
