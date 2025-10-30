# Feature Specification: Enhanced Typir Integration for IDE Support

**Feature Branch**: `021-enhanced-typir-integration`
**Created**: 2025-10-30
**Status**: Draft
**Input**: User description: "Enhanced Typir integration for import statements, constants, timeline events, and control flow validation with rich IDE support"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import Statement Type Checking (Priority: P1)

As a DSL developer, I want immediate feedback when I make mistakes in import statements (duplicate imports, wrong file types, missing files) so I can fix issues before running the timeline.

**Why this priority**: Import errors are critical blockers that prevent timelines from running. Early detection saves debugging time and improves the development experience. This is the highest-value, lowest-complexity enhancement from the research.

**Independent Test**: Can be fully tested by writing various import statements (default and named) and verifying that hover, validation errors, and type inference work correctly without requiring any other feature to be implemented.

**Acceptance Scenarios**:

1. **Given** a user writes `styles './main.css'`, **When** they hover over the import statement, **Then** they see "Import<css>" type information
2. **Given** a user writes two `layout` imports, **When** the document is validated, **Then** they see an error "Duplicate 'layout' import"
3. **Given** a user writes `import video from './intro.mp4' as html`, **When** the document is validated, **Then** they see a warning about type mismatch
4. **Given** a user writes `import data from './file.json' as css`, **When** they hover over the import, **Then** they see "Import<css>" showing the explicit override
5. **Given** a user references an imported asset name, **When** they use code completion, **Then** they see the asset name with its type

---

### User Story 2 - Enhanced Constant Validation (Priority: P1)

As a DSL developer, I want to be warned when I declare constants with reserved keywords so I avoid subtle runtime errors.

**Why this priority**: This is a quick win (2-hour implementation) that prevents common mistakes. Reserved keyword collisions can cause confusing errors, and catching them early improves developer experience. Type inference from constant values is already implemented in Phase 3 US1 (existing Typir integration).

**Existing Work**: Variable type inference (`VariableDeclaration` → inferred type from value) is already implemented in `eligian-type-system.ts:205-211`. This story ONLY adds reserved keyword validation.

**Independent Test**: Can be fully tested by declaring constants with reserved keywords and verifying validation errors appear correctly.

**Acceptance Scenarios**:

1. **Given** a user writes `const if = 5`, **When** the document is validated, **Then** they see an error "'if' is a reserved keyword"
2. **Given** a user writes `const timeline = "test"`, **When** the document is validated, **Then** they see an error "'timeline' is a reserved keyword"
3. **Given** a user writes `const name = "value"`, **When** they hover over the constant name, **Then** they see the inferred type "string" (✅ Already works - existing Typir integration)
4. **Given** a user writes `const count = 42`, **When** they hover over the constant name, **Then** they see the inferred type "number" (✅ Already works - existing Typir integration)
5. **Given** a user references a constant, **When** type checking runs, **Then** the constant's inferred type is used for validation (✅ Already works - existing Typir integration)

---

### User Story 3 - Timeline Event Validation (Priority: P2)

As a DSL developer, I want to see validation errors for timeline events with invalid time ranges or incorrect durations so I can create correct timelines before testing them.

**Why this priority**: Timeline events are complex and error-prone. Validating time ranges and durations prevents runtime issues and improves the authoring experience. This is medium-complexity but high-value.

**Independent Test**: Can be fully tested by creating timelines with various event configurations (invalid ranges, negative times, negative durations) and verifying validation works correctly.

**Acceptance Scenarios**:

1. **Given** a user writes `at -1s..5s fadeIn()`, **When** the document is validated, **Then** they see an error "Start time cannot be negative"
2. **Given** a user writes `at 5s..2s fadeIn()`, **When** the document is validated, **Then** they see an error "End time must be greater than start time"
3. **Given** a user writes `sequence [...] for -2s`, **When** the document is validated, **Then** they see an error "Sequence duration must be positive"
4. **Given** a user writes `stagger 0s items with action() for 1s`, **When** the document is validated, **Then** they see an error "Stagger delay must be positive"
5. **Given** a user hovers over a timed event, **When** the hover appears, **Then** they see "TimedEvent: 0s → 5s" with timing details

**Note**: Overlapping timeline events are intentionally **allowed** and **essential** for proper timeline composition. For example, a header may be shown from 10s-50s while text is shown from 10s-30s and other text from 30s-50s. Overlap detection is NOT included in this feature.

---

### User Story 4 - Control Flow Type Checking (Priority: P3)

As a DSL developer, I want validation errors when I use wrong types in if conditions or for loop collections so I catch type errors early.

**Why this priority**: This adds polish and catches common type errors, but control flow already works well without it. This is lower priority because it's less critical than the other enhancements.

**Existing Work**: Action function types (RegularActionDefinition, EndableActionDefinition) are already implemented in `eligian-type-system.ts:246-346` with full type checking. This story ONLY adds control flow validation (IfStatement, ForStatement).

**Independent Test**: Can be fully tested by writing control flow statements with various condition/collection types and verifying type validation works.

**Acceptance Scenarios**:

1. **Given** a user writes `if ("string") { ... }`, **When** the document is validated, **Then** they see a warning "Condition should evaluate to boolean"
2. **Given** a user writes `for (item in "string") { ... }`, **When** the document is validated, **Then** they see an error "For loop collection must be an array"
3. **Given** a user writes `for (item in $operationdata.items) { ... }` where items is an array, **When** type checking runs, **Then** no error appears
4. **Given** a user writes `if ($operationdata.count > 5) { ... }`, **When** type checking runs, **Then** the comparison is validated
5. **Given** a user writes an empty if branch, **When** the document is validated, **Then** they see a warning "Empty if branch"

---

### User Story 5 - Timeline Configuration Validation (Priority: P3)

As a DSL developer, I want validation errors when my timeline configuration is inconsistent (e.g., video provider without source) so I catch configuration mistakes early.

**Why this priority**: Timeline configuration errors are caught during runtime, but early validation improves the experience. This is lower priority because it's less common and current validation already handles most cases.

**Independent Test**: Can be fully tested by creating timelines with various provider/source combinations and verifying validation works.

**Acceptance Scenarios**:

1. **Given** a user writes `timeline "test" in "#app" using video { ... }` without a source, **When** the document is validated, **Then** they see an error "Video provider requires a source file"
2. **Given** a user writes `timeline "test" in "#app" using raf from "./video.mp4" { ... }`, **When** the document is validated, **Then** they see a warning "RAF provider does not use a source file"
3. **Given** a user writes `timeline "test" in ".invalid[selector" using video from "./vid.mp4" { ... }`, **When** the document is validated, **Then** they see an error "Invalid CSS selector"
4. **Given** a user hovers over a timeline, **When** the hover appears, **Then** they see "Timeline<video>" with configuration details
5. **Given** a user writes a timeline with no events, **When** the document is validated, **Then** they see a warning "Timeline has no events"

---

### Edge Cases

- What happens when a user imports the same file twice with different asset types (e.g., `import a from './file' as html` and `import b from './file' as css`)?
- How does the system handle circular type dependencies in custom Typir types?
- What happens when Typir validation runs on a document with unresolved cross-references (e.g., action not yet defined)?
- How does validation behave when a CSS file imported via `styles` statement doesn't exist?
- What happens when timeline events have identical start/end times (0s..0s)?
- How does Typir handle type inference when an expression contains errors?
- What happens when a constant is declared but never used?
- How does validation handle timeline events with extremely large time values (e.g., 999999s)?

## Requirements *(mandatory)*

### Functional Requirements

#### Import Statement Type System (US1)

- **FR-001**: System MUST infer asset types for import statements based on keywords (`layout`, `styles`, `provider`) and file extensions
- **FR-002**: System MUST create a custom Typir type `ImportType` with properties: assetType ('html' | 'css' | 'media'), path (string), isDefault (boolean)
- **FR-003**: System MUST display inferred import type on hover (e.g., "Import<css>") in the IDE
- **FR-004**: System MUST validate that default imports are not duplicated (only one `layout`, one `styles`, one `provider` per document)
- **FR-005**: System MUST warn when explicit asset type (`as` clause) conflicts with file extension
- **FR-005a**: Warning message format: "Asset type '<explicit>' conflicts with inferred type '<inferred>' from file extension (path: '<path>')"
- **FR-006**: System MUST validate that import paths are syntactically valid (relative paths only)
- **FR-007**: System MUST provide validation errors at the import statement location (not at usage sites)

#### Reserved Keyword Validation for Constants (US2)

- **FR-008**: System MUST validate that constant names do not collide with reserved keywords (`if`, `else`, `for`, `in`, `break`, `continue`, `const`, `action`, `endable`, `timeline`, `at`, `sequence`, `stagger`)
- **FR-009**: ✅ **ALREADY IMPLEMENTED** (Phase 3 US1): System infers constant types from their initial values (string, number, boolean, object, array) - see `eligian-type-system.ts:205-211`
- **FR-010**: ✅ **ALREADY IMPLEMENTED** (Phase 3 US1): System displays inferred constant type on hover in the IDE (automatic via Typir-Langium binding)
- **FR-011**: System MUST provide validation error when a constant name is a reserved keyword (error message: "'<keyword>' is a reserved keyword")
- **FR-012**: ~~System MUST validate that constants are not assigned void/undefined values (if void type is modeled)~~ **REMOVED** - Void type not modeled in Eligian grammar (constants always have values)

#### Timeline Event Validation (US3)

- **FR-013**: System MUST create custom Typir type `TimelineEventType` with properties: eventKind ('timed' | 'sequence' | 'stagger'), startTime (number), endTime (optional number), duration (optional number)
- **FR-014**: System MUST validate that timed event start times are non-negative (≥ 0s)
- **FR-015**: System MUST validate that timed event end times are greater than start times
- **FR-016**: ~~System MUST detect overlapping timed events within the same timeline and display warnings.~~ **REMOVED**: Overlapping events are intentionally allowed and essential for timeline composition (e.g., header 10s-50s + text 10s-30s).
- **FR-017**: System MUST validate that sequence durations are positive (> 0s)
- **FR-018**: System MUST validate that stagger delays are positive (> 0s)
- **FR-019**: System MUST display event timing details on hover (e.g., "TimedEvent: 0s → 5s")
- **FR-020**: System MUST validate that stagger items expression has array type
- **FR-021**: System MUST warn when sequence or stagger blocks have no operations

#### Control Flow Type Checking (US4)

**Note**: Action function types already implemented in Phase 3 US1. This section covers ONLY IfStatement and ForStatement validation.

- **FR-022**: System MUST validate that if statement conditions evaluate to boolean type (validation always enabled - no feature flag)
- **FR-023**: System MUST validate that for loop collection expressions have array type
- **FR-024**: System MUST display inferred types for conditions and collections on hover (automatic via Typir-Langium binding)
- **FR-025**: System MUST warn when if/else branches or for loop bodies are empty
- **FR-025a**: ✅ **ALREADY IMPLEMENTED** (Phase 3 US1): Action function types created for RegularActionDefinition and EndableActionDefinition with full call site validation - see `eligian-type-system.ts:246-346`

#### Timeline Configuration Validation (US5)

- **FR-026**: System MUST create custom Typir type `TimelineType` with properties: provider ('video' | 'audio' | 'raf' | 'custom'), containerSelector (string), source (optional string), events (array of TimelineEventType)
- **FR-027**: System MUST validate that video/audio providers have a source file specified
- **FR-028**: System MUST warn when raf/custom providers have a source file specified (not used)
- **FR-029**: System MUST validate that container selectors are syntactically valid CSS selectors
- **FR-030**: System MUST display timeline configuration details on hover (e.g., "Timeline<video>")
- **FR-031**: System MUST warn when timelines have no events

#### General Requirements

- **FR-032**: System MUST maintain backward compatibility with existing Langium validators during Typir integration
- **FR-033**: System MUST run Typir validation as part of Langium's document validation phase
- **FR-034**: System MUST ensure Typir validation overhead is less than 50ms for typical documents (< 500 lines)
- **FR-035**: System MUST provide validation errors compatible with VS Code's Problems panel
- **FR-036**: System MUST NOT break existing operation/action type inference when adding new validation (backward compatibility requirement - all 1323+ existing tests must continue to pass)
- **FR-037**: System MUST handle gracefully when Typir cannot infer a type (fallback to unknown type)

### Key Entities

- **ImportType**: Represents an imported asset with asset type (html/css/media), file path, and default/named flag. Used for import statement validation and hover information.
- **TimelineEventType**: Represents a timeline event with event kind (timed/sequence/stagger), timing information (start, end, duration), and validation state. Used for time range and duration validation.
- **TimelineType**: Represents a timeline configuration with provider type, container selector, optional source file, and list of events. Used for configuration validation.
- **ConstantDeclaration**: Represents a program or action-scoped constant with inferred type from initial value. Used for reserved keyword validation and type inference.
- **ControlFlowNode**: Represents if statements and for loops with condition/collection type validation requirements.

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### Import Statement Type System (US1)

- **SC-001**: Developers see import type information on hover 100% of the time for valid import statements
- **SC-002**: Duplicate default import errors are detected and displayed within 100ms of document change
- **SC-003**: 95% of asset type mismatches (file extension vs explicit type) are caught with warnings
- **SC-004**: Import validation adds less than 10ms overhead to document validation time

#### Enhanced Constant Validation (US2)

- **SC-005**: 100% of reserved keyword collisions in constant declarations are caught with errors
- **SC-006**: Developers see inferred constant types on hover 100% of the time
- **SC-007**: Constant validation adds less than 5ms overhead to document validation time

#### Timeline Event Validation (US3)

- **SC-008**: 100% of negative start times are caught with errors
- **SC-009**: 100% of invalid time ranges (end < start) are caught with errors
- **SC-010**: ~~90% of overlapping events are detected and warned within the same timeline~~ **REMOVED**: Overlap detection not included
- **SC-011**: Developers see event timing details on hover 100% of the time for timed events
- **SC-012**: Timeline event validation adds less than 20ms overhead to document validation time
- **SC-013**: ~~Overlapping event detection completes in under 50ms for timelines with up to 100 events~~ **REMOVED**: Overlap detection not included

#### Control Flow Type Checking (US4)

- **SC-014**: 90% of non-boolean conditions in if statements are caught with warnings
- **SC-015**: 95% of non-array collections in for loops are caught with errors
- **SC-016**: Control flow validation adds less than 10ms overhead to document validation time

#### Timeline Configuration Validation (US5)

- **SC-017**: 100% of video/audio providers without source files are caught with errors
- **SC-018**: 100% of invalid CSS selectors in container specifications are caught with errors
- **SC-019**: Timeline configuration validation adds less than 5ms overhead to document validation time

#### Overall System Performance

- **SC-020**: Total Typir validation overhead remains under 50ms for documents with 500 lines
- **SC-021**: Total Typir validation overhead remains under 200ms for documents with 2000 lines
- **SC-022**: All existing tests (1323+ tests) continue to pass after Typir integration
- **SC-023**: No new false-positive validation errors are introduced (< 1% false positive rate)

#### Developer Experience

- **SC-024**: Developers find and fix import/constant/timeline errors 40% faster compared to runtime debugging
- **SC-025**: 90% of type-related errors are caught during editing (before running timeline)
- **SC-026**: Hover information provides useful type details 95% of the time (measured by developer survey)

## Assumptions *(optional)*

### Technical Assumptions

1. **Typir Framework Stability**: Assumes Typir v1.x API remains stable and backward-compatible
2. **Langium Integration**: Assumes Typir-Langium binding correctly hooks into Langium's document validation phase
3. **Optional Parameters**: Assumes Typir will NOT support optional parameters in this release (operations remain validated by Langium)
4. **Custom Type Complexity**: Assumes CustomKind API supports all required property types (primitives, types, arrays, maps)
5. **Performance Profile**: Assumes Typir's type inference is O(n) where n = AST nodes, validation is O(n × r) where r = rules per node type

### User Behavior Assumptions

1. **Hover Usage**: Assumes developers hover over code elements to see type information as part of their workflow
2. **Validation Attention**: Assumes developers check the Problems panel regularly during development
3. **Document Size**: Assumes typical Eligian documents are 100-500 lines, with outliers up to 2000 lines
4. **Import Patterns**: Assumes most documents have 1-5 import statements
5. **Timeline Complexity**: Assumes most timelines have 5-20 events, with outliers up to 100 events

### Integration Assumptions

1. **Langium Validator Coexistence**: Assumes Langium validators and Typir validators can run in parallel during migration phase
2. **Error Message Format**: Assumes Typir validation errors follow Langium's DiagnosticInfo format
3. **Cross-Reference Resolution**: Assumes Typir validation runs after Langium's linking phase (cross-references resolved)
4. **Document Lifecycle**: Assumes Typir's onNewAstNode() is called for each AST node during document build
5. **IDE Compatibility**: Assumes VS Code's LSP implementation correctly displays Typir hover information

### Scope Assumptions

1. **Priority Scope**: This specification covers Priority 1 stories (US1+US2 - "Quick Wins") and Priority 2 stories (US3 - "Timeline Events"). Priority 3 stories (US4+US5 - "Advanced Features") may be deferred based on feedback.

   **Terminology Note**: Avoid confusion between "Specification Priorities" (P1/P2/P3 stories) and "Task Phases" (Phase 1=Setup, Phase 2=Foundation, Phase 3=US1, etc.). This document uses "Priority" for user stories and "Phase" for task organization.
2. **No Operation Validation**: Operations remain validated by Langium due to optional parameter limitations
3. **No Completion Enhancement**: Code completion enhancements are out of scope (future feature)
4. **No Custom Error Formatters**: Uses default Typir error message formatting (customization is future enhancement)

## Dependencies *(optional)*

### External Dependencies

1. **Typir Core Library** (v1.0+): Required for type system infrastructure
   - Dependency: npm package `typir`
   - Usage: CustomKind, type factories, validation services
   - Risk: API breaking changes in major version updates

2. **Typir-Langium Binding** (v1.0+): Required for Langium integration
   - Dependency: npm package `typir-langium`
   - Usage: LangiumTypeSystemDefinition, TypirLangiumServices
   - Risk: Binding issues with Langium version compatibility

3. **Langium Framework** (v3.0+): Required for language server infrastructure
   - Dependency: npm package `langium`
   - Usage: Document lifecycle, validation registry, AST utilities
   - Risk: None (already in use)

### Internal Dependencies

1. **Current Typir Integration** (Phase 3 Complete - US1):
   - Location: `packages/language/src/type-system-typir/`
   - Required: Primitive types, action function types, basic inference
   - Risk: None (foundation already exists)

2. **Operation Registry** (Feature 009):
   - Location: `packages/language/src/compiler/operations/registry.generated.ts`
   - Required: Operation metadata for excluding from validation
   - Risk: None (already in use)

3. **Eligian Grammar** (Core):
   - Location: `packages/language/src/eligian.langium`
   - Required: AST node types for Typir inference rules
   - Risk: Breaking changes to grammar would require Typir rule updates

### Feature Dependencies

1. **Asset Loading System** (Feature 010): Optional dependency for import path validation
   - If available: Can validate import paths against actual file system
   - If unavailable: Syntactic validation only

2. **CSS Class Validation** (Feature 013): Optional dependency for selector validation
   - If available: Can reuse CSS selector parsing logic
   - If unavailable: Use simpler regex-based validation

## Out of Scope *(optional)*

### Explicitly Excluded

1. **Operation Validation**: Operations with optional parameters remain validated by Langium (Typir limitation)
2. **Code Completion Enhancement**: Using Typir type information for smarter completions (future feature)
3. **Custom Hover Formatting**: Rich HTML hover tooltips with examples (future feature)
4. **Type-Aware Refactoring**: Rename/extract refactorings that preserve types (future feature)
5. **Gradual Typing Enforcement**: Enforcing type annotations on all constructs (remains optional)

### Deferred Features

1. **Timeline Visualization**: Graphical timeline view showing events (separate feature)
2. **~~Event Conflict Resolution~~**: ~~Automatic fixes for overlapping events~~ **REMOVED**: Overlapping events are intentionally allowed
3. **Import Auto-Discovery**: Suggesting imports based on usage (language service enhancement)
4. **Type Documentation**: Generating type documentation from Typir types (tooling feature)

### Known Limitations

1. **Optional Parameters**: Cannot validate operations with optional parameters via Typir (framework limitation)
2. **Dynamic Types**: Cannot infer types for dynamically constructed expressions (e.g., string concatenation building selectors)
3. **Cross-Document Types**: Type inference limited to single document (no cross-file type propagation)
4. **Runtime Type Checking**: Typir provides compile-time validation only (no runtime type guards)

## Non-Functional Requirements *(optional)*

### Performance Requirements

- **NFR-001**: Typir initialization MUST complete within 500ms during language server startup
- **NFR-002**: Type inference for a single node MUST complete within 1ms on average
- **NFR-003**: Document validation with Typir MUST complete within 200ms for 95% of documents
- **NFR-004**: Memory usage MUST not increase by more than 10MB after Typir integration
- **NFR-005**: Hover information MUST appear within 100ms of hover trigger

### Maintainability Requirements

- **NFR-006**: All Typir custom types MUST be documented with JSDoc comments explaining properties
- **NFR-007**: Typir inference rules MUST have examples in comments showing matching AST nodes
- **NFR-008**: Typir validation rules MUST reference corresponding functional requirements in comments
- **NFR-009**: Test coverage for Typir integration MUST be at least 80%
- **NFR-010**: All Typir-related code MUST pass Biome linting with zero warnings

### Compatibility Requirements

- **NFR-011**: Typir integration MUST NOT break any existing validation behavior
- **NFR-012**: Existing Langium validators MUST continue to work alongside Typir validators
- **NFR-013**: VS Code extension MUST work with VS Code versions 1.80+
- **NFR-014**: Node.js version compatibility MUST be maintained (currently Node 18+)

### Error Handling Requirements

- **NFR-015**: Typir validation errors MUST NOT crash the language server
- **NFR-016**: Invalid Typir types MUST fallback gracefully to `unknown` type
- **NFR-017**: Typir inference failures MUST be logged for debugging (not shown to users)
- **NFR-018**: Validation error messages MUST be clear and actionable (no internal details)

## Security/Privacy Considerations *(optional)*

### Security Considerations

- **SEC-001**: Import path validation MUST prevent directory traversal attacks (e.g., `../../etc/passwd`)
- **SEC-002**: CSS selector validation MUST prevent injection attacks via malformed selectors
- **SEC-003**: File path handling MUST use secure path resolution (no shell command injection)
- **SEC-004**: Validation error messages MUST NOT leak sensitive file system paths

### Privacy Considerations

- **PRIV-001**: Typir validation MUST NOT collect or transmit user code to external services
- **PRIV-002**: Error logging MUST NOT include user-identifiable information
- **PRIV-003**: Hover information MUST NOT expose internal implementation details unnecessarily

## Migration/Rollout Strategy *(optional)*

### Phase 1: Foundation & Quick Wins (Weeks 1-2)

**Goal**: Prove Typir value with minimal risk

**Rollout Steps**:

1. **Week 1: Enhanced Constant Validation (US2)**
   - Implement reserved keyword validation in Typir
   - Add void type check
   - Write 10 test cases
   - Keep existing Langium validator as backup
   - **Rollback Plan**: Remove Typir rules, keep Langium validator

2. **Week 2: Import Statement Type System (US1)**
   - Create `ImportType` custom type
   - Implement inference rules for default/named imports
   - Add validation rules for duplicates and type mismatches
   - Write 25 test cases
   - **Rollback Plan**: Disable Typir import rules, use Langium validators

3. **Validation Phase**: Run both Typir and Langium validators in parallel, compare results

**Success Criteria for Phase 1**:
- All existing tests pass (1323 tests)
- New Typir validation adds 35+ test cases
- Hover shows import types in IDE
- No performance degradation (< 50ms validation overhead)

**Go/No-Go Decision**: If performance targets missed or false positives > 1%, defer Phase 2

---

### Phase 2: Timeline Event System (Weeks 3-4)

**Goal**: Add rich IDE support for timeline events

**Rollout Steps**:

1. **Week 3-4: Timeline Event Custom Types (US3)**
   - Define `TimelineEventType` hierarchy
   - Create factory and inference rules
   - Add validation (time ranges, durations, non-negative times)
   - Write 20+ test cases

**Success Criteria for Phase 2**:
- Event types inferred correctly (100% accuracy)
- Time range validation catches invalid ranges (100% accuracy)
- Duration validation catches negative/zero durations (100% accuracy)
- 20+ new test cases pass
- IDE shows event timing on hover
- Validation overhead remains under 20ms

**Go/No-Go Decision**: If complexity too high or performance issues, defer Phase 3

---

### Phase 3: Advanced Features (Weeks 5-6, Optional)

**Goal**: Complete Typir integration for all major constructs

**Rollout Steps**:

1. **Week 5: Control Flow Type Checking (US4)**
   - Add condition/collection type validation
   - Write 20 test cases

2. **Week 6: Timeline Configuration Validation (US5)**
   - Create `TimelineType` custom type
   - Add provider-specific validation
   - Write 15 test cases

**Success Criteria for Phase 3**:
- All constructs covered by Typir
- < 50ms validation overhead maintained
- 35+ new test cases pass

**Rollback Plan**: If Phase 3 causes issues, revert to Phase 2 state (US1-3 only)

---

### Migration Strategy

**Incremental Approach** (NOT Big Bang):

1. **Keep Langium Validators**: Don't remove existing validators immediately
2. **Run in Parallel**: Both Typir and Langium validation active during transition
3. **Compare Results**: Automated tests verify both produce same errors
4. **Gradual Removal**: Remove Langium validators only after Typir proven stable (Phase 1 complete)
5. **Backward Compatibility**: Maintain existing validation behavior for external tools

**Feature Flag Approach**:
- Optional: Add configuration flag `eligian.typir.enabled` to disable Typir validation if needed
- Default: Enabled after Phase 1 success
- Allows users to opt-out if issues arise

---

### User Communication

**Documentation Updates**:
- Update `LANGUAGE_SPEC.md` with new validation behaviors
- Update `type-system-typir/README.md` with new features
- Create migration guide for users upgrading from older versions

**Release Notes**:
- Phase 1: "Enhanced validation for imports and constants"
- Phase 2: "Timeline event validation for time ranges and durations"
- Phase 3: "Complete type checking for all DSL constructs"

**Breaking Changes**: None (all changes are enhancements, not breaking changes)
