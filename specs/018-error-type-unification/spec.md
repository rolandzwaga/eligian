# Feature Specification: Error Type Unification

**Feature Branch**: `018-error-type-unification`
**Created**: 2025-01-28
**Status**: Draft
**Input**: User description: "Error Type Unification - Consolidate 5 different error type hierarchies across packages into a single unified error namespace in @eligian/language package, eliminating 200-300 lines of duplicate error definitions and ensuring consistent error messages across CLI, compiler, language server, and VS Code extension."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Error Messages Across All Tools (Priority: P1)

As a developer using the Eligian toolchain, when I encounter an error in any tool (CLI, VS Code extension, or language server), I receive consistent, clear error messages that use the same terminology and format, so I can understand and fix issues quickly regardless of which tool I'm using.

**Why this priority**: This is the most user-facing impact of error unification. Inconsistent error messages confuse developers and reduce trust in the toolchain. Consistent messages improve developer experience immediately.

**Independent Test**: Can be fully tested by triggering the same error condition (e.g., file not found, invalid CSS syntax) across different tools and verifying that error messages match in format, terminology, and actionability. Delivers immediate value by eliminating confusion caused by inconsistent error messages.

**Acceptance Scenarios**:

1. **Given** I have an Eligian file with a missing imported CSS file, **When** I compile via CLI and open the same file in VS Code, **Then** both tools show identical error messages about the missing file (same wording, same hint about checking the path)
2. **Given** I have a syntax error in my Eligian code, **When** the language server validates it and I compile it via CLI, **Then** both show the same parse error message with identical line/column information and hints
3. **Given** I have a CSS file with invalid syntax, **When** I reference it from an Eligian file in VS Code and compile via CLI, **Then** both show identical CSS syntax error messages with the same line/column information

---

### User Story 2 - Unified Error Type Checking (Priority: P2)

As a developer building tools or extensions on top of the Eligian ecosystem, I can check error types programmatically and handle different error categories appropriately, so I don't need to learn multiple error type systems or write duplicate error handling code.

**Why this priority**: This improves the maintainability and extensibility of the Eligian ecosystem. While less visible to end users, it enables faster development of tooling and reduces bugs in error handling code.

**Independent Test**: Can be fully tested by writing a small tool that consumes the unified error types, checks error categories, and handles each category appropriately. Delivers value by making the Eligian codebase more extensible and easier to integrate with other tools.

**Acceptance Scenarios**:

1. **Given** I'm writing a custom Eligian tool, **When** I import error types from the unified error namespace, **Then** I can check error categories programmatically and handle each case specifically with full type information
2. **Given** I receive an error from any Eligian package, **When** I check its error category, **Then** the development environment provides autocomplete suggestions for category-specific error properties
3. **Given** I'm handling compilation errors, **When** I check error types in my code, **Then** the development environment ensures I've handled all possible error categories (exhaustiveness checking)

---

### User Story 3 - Single Source of Truth for Error Definitions (Priority: P3)

As a maintainer of the Eligian codebase, when I need to add a new error type or modify an existing error message, I make the change in one location (@eligian/language/errors), and all packages automatically use the updated definition, so I don't need to update multiple files or risk inconsistencies.

**Why this priority**: This is an internal developer experience improvement. While critical for long-term maintainability, it has lower priority because it doesn't immediately affect end users. It's foundational for preventing future error definition drift.

**Independent Test**: Can be fully tested by adding a new error type to the unified error namespace, then verifying that all packages (language, extension, CLI) can import and use it without additional changes. Delivers value by reducing maintenance burden and preventing future inconsistencies.

**Acceptance Scenarios**:

1. **Given** I need to add a new validation error type, **When** I add it to @eligian/language/errors, **Then** all packages (language, extension, CLI) can immediately import and use it without duplicating definitions
2. **Given** I need to change an error message, **When** I update it in the unified error namespace, **Then** all tools that throw this error automatically use the new message
3. **Given** I'm reviewing error-related code, **When** I search for error definitions, **Then** I find exactly one canonical definition in @eligian/language/errors (no duplicates in other packages)

---

### Edge Cases

- What happens when an error type is deprecated but still referenced by older code?
- How does the system handle errors that are specific to one package (e.g., VS Code-specific webview errors)?
- What happens when error messages need to be localized for different languages?
- How are errors serialized when sent over LSP (language server protocol)?
- What happens when multiple errors occur simultaneously (e.g., multiple validation failures)?
- How does error context (stack traces, source locations) get preserved when errors cross package boundaries?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST consolidate all error type definitions from 5 different locations across packages into a single unified error namespace in the language package
- **FR-002**: System MUST provide programmatic error category checking for each major error type (compiler errors, file I/O errors, asset validation errors)
- **FR-003**: System MUST ensure all error types include a category identifier field for programmatic error handling
- **FR-004**: System MUST preserve all existing error information (message, location, hint, severity) when migrating to unified types
- **FR-005**: System MUST maintain backward compatibility for packages that currently report errors (errors can be gradually migrated)
- **FR-006**: System MUST define clear error hierarchies with base error types and specialized subtypes organized by concern area
- **FR-007**: System MUST provide error formatting utilities that work with all error types (basic formatting and formatting with source code snippets)
- **FR-008**: All packages (language, extension, CLI) MUST import error types from the unified error namespace (no duplicate definitions)
- **FR-009**: System MUST document error handling patterns and migration guides for existing code
- **FR-010**: System MUST ensure error messages use consistent terminology across all error types

### Key Entities

- **BaseError**: The root error type containing common fields (message, location, hint). All specific error types extend this base type.
- **CompilerError**: Union type representing compilation-related errors (ParseError, ValidationError, TypeError, TransformError). Used for errors during DSL compilation pipeline.
- **IOError**: Union type representing file I/O errors (FileNotFoundError, PermissionError, ReadError). Used for errors during file system operations.
- **AssetError**: Union type combining IOError and validation errors for assets (HtmlValidationError, CssValidationError). Used when loading external resources like CSS or HTML files.
- **ErrorContext**: Additional contextual information attached to errors (stack trace, related files, suggestion hints).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All error messages shown to developers are identical across CLI, VS Code extension, and language server for the same error condition (100% message consistency)
- **SC-002**: Code size reduction of 200-300 lines by eliminating duplicate error type definitions across packages
- **SC-003**: All error types can be checked programmatically with full type information available to development tools (100% type safety without workarounds)
- **SC-004**: New error types can be added to the unified namespace in under 10 minutes without requiring changes to multiple packages
- **SC-005**: All existing tests continue to pass after migration (zero regressions in error handling behavior)
- **SC-006**: Error type definitions consolidate from 5+ locations to 1 single location in the language package

## Dependencies

- **Phase 1 (Feature 016 - Shared Utilities)**: Complete - Provides foundational IOError types for file operations
- **Phase 2 (Feature 017 - CSS Consolidation)**: Complete - Provides CSS-related error types to consolidate

## Assumptions

- Error messages are currently in English only (localization can be added later)
- Error communication between tools uses structured data format (text-based serialization)
- Stack traces are preserved using standard runtime error mechanisms
- Error hints are optional text fields providing additional guidance (not complex structured data)
- Backward compatibility means existing error-reporting code continues to work during gradual migration (no breaking changes to public APIs)
- Error types use category tags for programmatic identification, following existing patterns in the codebase

## Out of Scope

- Error reporting telemetry or analytics
- Error recovery strategies or automatic error fixing
- Internationalization/localization of error messages
- Error documentation website or interactive error explorer
- Performance profiling of error handling code
- Custom error rendering in VS Code (beyond standard diagnostics)
