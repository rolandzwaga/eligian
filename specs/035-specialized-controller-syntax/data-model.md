# Data Model: Specialized Controller Syntax

**Feature**: 035-specialized-controller-syntax
**Date**: 2025-11-17
**Status**: Phase 1 Design

## Overview

This document defines the data entities and their relationships for the specialized controller syntax feature. The feature introduces type-safe controller addition with parameter validation based on Eligius controller metadata.

---

## Entity Definitions

### 1. ControllerMetadata

Represents metadata for a single Eligius controller type, imported from Eligius ctrlmetadata.

**Source**: Generated from `eligius` npm package via `generate-metadata.ts`

**Fields**:
```typescript
interface ControllerMetadata {
  // Controller identifier (e.g., "LabelController", "NavigationController")
  name: string;

  // Human-readable description from controller metadata
  description: string;

  // Array of parameter metadata in order
  parameters: ControllerParameterMetadata[];

  // Array of dependency parameter names (e.g., ["selectedElement"])
  dependencies: string[];
}
```

**Validation Rules**:
- `name`: Required, non-empty string, must match Eligius controller class name
- `description`: Required string (may be empty for some controllers)
- `parameters`: Required array (may be empty for controllers without parameters)
- `dependencies`: Required array (may be empty for controllers without dependencies)

**Relationships**:
- **Has Many** → ControllerParameterMetadata (ordered list)
- **Used By** → ControllerValidator (for validation)
- **Used By** → ASTTransformer (for parameter mapping)
- **Used By** → CompletionProvider (for autocomplete)
- **Used By** → HoverProvider (for documentation)

**Lifecycle**:
- **Creation**: Generated at build time by `generate-metadata.ts` script
- **Storage**: Compiled into `packages/language/src/completion/metadata/controllers.generated.ts`
- **Access**: Imported as constant `CONTROLLERS` array at runtime
- **Updates**: Regenerated when Eligius package is updated or `pnpm run langium:generate` is executed

**Example Instances**:
```typescript
// LabelController
{
  name: "LabelController",
  description: "This controller attaches to the given selected element and renders the text associated with the given label id in it.\n\nThe controller also listen for the `LANGUAGE_CHANGE` event and re-renders the text with the new language after such an event.",
  parameters: [
    { name: "labelId", type: "ParameterType:labelId", required: true, description: undefined },
    { name: "attributeName", type: "ParameterType:string", required: false, description: undefined }
  ],
  dependencies: ["selectedElement"]
}

// NavigationController
{
  name: "NavigationController",
  description: "",
  parameters: [
    { name: "json", type: "ParameterType:object", required: true, description: undefined }
  ],
  dependencies: ["selectedElement"]
}

// LottieController
{
  name: "LottieController",
  description: "This controller renders a [lottie-web](https://github.com/airbnb/lottie-web) animation inside the given selected element.\n\nThe url may encode freeze and end positions like this: my-url/filename[freeze=10,end=21].json",
  parameters: [
    { name: "url", type: "ParameterType:url", required: true, description: undefined }
  ],
  dependencies: []
}
```

---

### 2. ControllerParameterMetadata

Represents metadata for a single parameter of a controller.

**Source**: Extracted from Eligius controller metadata `properties` field

**Fields**:
```typescript
interface ControllerParameterMetadata {
  // Parameter identifier (e.g., "labelId", "url", "json")
  name: string;

  // Parameter type string (e.g., "ParameterType:labelId", "ParameterType:string")
  type: string | Array<{ value: string }>;

  // Whether parameter is required (true) or optional (false)
  required: boolean;

  // Default value if parameter is optional (may be undefined)
  defaultValue?: unknown;

  // Human-readable parameter description (may be undefined)
  description?: string;
}
```

**Validation Rules**:
- `name`: Required, non-empty string, must be valid JavaScript identifier
- `type`: Required, must be valid ParameterType string or enum array
- `required`: Required boolean
- `defaultValue`: Optional, type must match `type` field
- `description`: Optional string

**Type Catalog**:
The `type` field uses the following ParameterType values:
- `"ParameterType:labelId"` - Label ID reference (validated against label files)
- `"ParameterType:string"` - String literal or variable
- `"ParameterType:number"` - Numeric value
- `"ParameterType:boolean"` - Boolean value
- `"ParameterType:object"` - Object literal
- `"ParameterType:array"` - Array literal
- `"ParameterType:url"` - URL string

**Relationships**:
- **Belongs To** → ControllerMetadata (parent controller)
- **Used By** → ControllerValidator (for parameter validation)
- **Used By** → ASTTransformer (for argument-to-parameter mapping)

**Lifecycle**:
- **Creation**: Generated at build time from Eligius controller metadata
- **Storage**: Embedded in ControllerMetadata instances
- **Access**: Via parent ControllerMetadata instance
- **Updates**: Regenerated when parent controller metadata updates

---

### 3. AddControllerCall (AST Node)

Represents an `addController` operation call in the Eligian DSL Abstract Syntax Tree.

**Source**: Parsed from DSL source code by Langium parser

**Fields**:
```typescript
interface AddControllerCall extends OperationCall {
  // AST node type discriminator
  $type: "OperationCall";

  // Operation name - must be a recognized controller name
  systemName: string;

  // Array of argument expressions (positional)
  args: Expression[];

  // Source location information (for error reporting)
  $cstNode?: CstNode;
}
```

**Validation Rules**:
- `systemName`: Must match a controller name in CONTROLLERS array
- `args`: Argument count must match controller's required + optional parameter count
- `args[i]`: Each argument type must be compatible with corresponding parameter type
- Special case: If parameter type is `ParameterType:labelId`, argument must be validated against label registry

**Relationships**:
- **References** → ControllerMetadata (via systemName lookup)
- **Contains** → Expression[] (arguments)
- **Validated By** → ControllerValidator
- **Transformed By** → ASTTransformer

**Lifecycle**:
- **Creation**: Parsed from DSL source by Langium
- **Validation**: Checked by ControllerValidator during validation phase
- **Transformation**: Converted to Eligius JSON by ASTTransformer during compilation

**State Transitions**:
```
[DSL Source]
    ↓ (Langium parse)
[AddControllerCall AST Node]
    ↓ (Validation)
[Validated AddControllerCall] (with diagnostics if errors)
    ↓ (Transformation)
[Eligius JSON Operations] (getControllerInstance + addControllerToElement)
```

**Example Instances**:
```typescript
// DSL: addController('LabelController', "mainTitle")
{
  $type: "OperationCall",
  systemName: "addController",  // Will be looked up as "LabelController" from args[0]
  args: [
    { $type: "StringLiteral", value: "LabelController" },
    { $type: "StringLiteral", value: "mainTitle" }
  ]
}

// DSL: addController('NavigationController', navConfig)
{
  $type: "OperationCall",
  systemName: "addController",
  args: [
    { $type: "StringLiteral", value: "NavigationController" },
    { $type: "VariableRef", name: "navConfig" }
  ]
}
```

---

### 4. ValidationError (Controller-Specific)

Represents a validation error specific to controller syntax validation.

**Source**: Created by ControllerValidator during validation phase

**Fields**:
```typescript
interface ControllerValidationError {
  // Error code for programmatic handling
  code:
    | 'unknown_controller'
    | 'missing_required_parameter'
    | 'too_many_parameters'
    | 'parameter_type_mismatch'
    | 'invalid_label_id';

  // Human-readable error message
  message: string;

  // AST node where error occurred
  node: AstNode;

  // Suggested fixes (optional)
  suggestions?: string[];

  // Related controller metadata (if available)
  controllerMeta?: ControllerMetadata;
}
```

**Validation Rules**:
- `code`: Required, must be one of the defined error codes
- `message`: Required, non-empty, must be clear and actionable
- `node`: Required, must point to problematic AST node
- `suggestions`: Optional array, each suggestion must be valid controller/parameter name

**Error Types**:

1. **Unknown Controller** (`unknown_controller`):
   - Trigger: `systemName` not found in CONTROLLERS array
   - Message: `"Unknown controller: '{name}' (Did you mean: '{suggestions}'?)"`
   - Suggestions: Levenshtein distance ≤2 from valid controller names

2. **Missing Required Parameter** (`missing_required_parameter`):
   - Trigger: Required parameter not provided in args
   - Message: `"Missing required parameter '{paramName}' for controller '{controllerName}'"`
   - Suggestions: None (fix is unambiguous)

3. **Too Many Parameters** (`too_many_parameters`):
   - Trigger: More args than controller parameters
   - Message: `"Too many parameters for controller '{controllerName}' (expected {expected}, got {actual})"`
   - Suggestions: None (fix is removing excess args)

4. **Parameter Type Mismatch** (`parameter_type_mismatch`):
   - Trigger: Argument type incompatible with parameter type
   - Message: `"Parameter '{paramName}' expects type '{expectedType}', got '{actualType}'"`
   - Suggestions: None (fix is type correction)

5. **Invalid Label ID** (`invalid_label_id`):
   - Trigger: labelId parameter references non-existent label
   - Message: `"Unknown label ID: '{labelId}' (Did you mean: '{suggestions}'?)"`
   - Suggestions: Levenshtein distance ≤2 from valid label IDs

**Relationships**:
- **Created By** → ControllerValidator
- **Attached To** → AddControllerCall AST node
- **Consumed By** → LSP (Language Server Protocol) for diagnostic reporting
- **Displayed In** → VS Code Problems panel

---

### 5. TransformedOperation (Output)

Represents the transformed Eligius JSON operations generated from an `addController` call.

**Source**: Created by ASTTransformer during compilation

**Fields**:
```typescript
interface TransformedControllerOperations {
  // First operation: getControllerInstance
  getControllerInstance: {
    systemName: "getControllerInstance";
    operationData: {
      systemName: string;  // Controller class name
    };
  };

  // Second operation: addControllerToElement
  addControllerToElement: {
    systemName: "addControllerToElement";
    operationData: Record<string, unknown>;  // Parameter name → value mapping
  };
}
```

**Transformation Rules**:
1. Extract controller name from first argument (must be string literal)
2. Map remaining arguments to parameter names using controller metadata order
3. Generate `getControllerInstance` operation with controller systemName
4. Generate `addControllerToElement` operation with parameter object
5. Preserve source location for debugging

**Mapping Algorithm**:
```typescript
// Given: addController('LabelController', "mainTitle", "data-label")
// Controller metadata parameters: ["labelId", "attributeName"]
// Result:
{
  getControllerInstance: {
    systemName: "getControllerInstance",
    operationData: { systemName: "LabelController" }
  },
  addControllerToElement: {
    systemName: "addControllerToElement",
    operationData: {
      labelId: "mainTitle",
      attributeName: "data-label"
    }
  }
}
```

**Relationships**:
- **Generated From** → AddControllerCall AST node
- **Uses** → ControllerMetadata (for parameter name mapping)
- **Output To** → Eligius JSON configuration

---

## Entity Relationship Diagram

```
┌─────────────────────────┐
│ CONTROLLERS Array       │
│ (Generated Constant)    │
└───────────┬─────────────┘
            │ contains
            ↓
┌─────────────────────────┐         ┌──────────────────────────┐
│ ControllerMetadata      │ 1    * │ ControllerParameter      │
│ ─────────────────────── │◄────┬──│ Metadata                 │
│ + name: string          │     │  │ ────────────────────────│
│ + description: string   │     │  │ + name: string           │
│ + parameters: []        │─────┘  │ + type: string           │
│ + dependencies: []      │        │ + required: boolean      │
└───────────┬─────────────┘        │ + defaultValue?: unknown │
            │                      │ + description?: string   │
            │ validates            └──────────────────────────┘
            ↓
┌─────────────────────────┐
│ AddControllerCall       │
│ (AST Node)              │
│ ─────────────────────── │
│ + systemName: string    │
│ + args: Expression[]    │
└───────────┬─────────────┘
            │
            ├─── validates ──→ ┌──────────────────────────┐
            │                  │ ValidationError          │
            │                  │ ────────────────────────│
            │                  │ + code: string           │
            │                  │ + message: string        │
            │                  │ + suggestions: []        │
            │                  └──────────────────────────┘
            │
            └─ transforms ──→ ┌──────────────────────────┐
                              │ TransformedOperations    │
                              │ ────────────────────────│
                              │ + getControllerInstance  │
                              │ + addControllerToElement │
                              └──────────────────────────┘
```

---

## Data Flow

### 1. Build-Time Flow (Metadata Generation)

```
Eligius NPM Package
    │ (import ctrlmetadata)
    ↓
generate-metadata.ts Script
    │ (extract controller metadata)
    ↓
controllers.generated.ts
    │ (export CONTROLLERS constant)
    ↓
Language Server / Validator / Transformer
    (compile-time access to metadata)
```

### 2. Compile-Time Flow (Validation)

```
DSL Source Code
    │ (Langium parse)
    ↓
AddControllerCall AST Node
    │ (lookup in CONTROLLERS)
    ↓
ControllerMetadata
    │ (validate args against parameters)
    ↓
ValidationError[] (if any)
    │
    └──→ LSP Diagnostics → VS Code Problems Panel
```

### 3. Compile-Time Flow (Transformation)

```
Validated AddControllerCall
    │ (extract controller name from args[0])
    ↓
ControllerMetadata Lookup
    │ (map args[1..n] to parameter names)
    ↓
Parameter Mapping
    │ (generate operations)
    ↓
TransformedOperations
    │ (serialize to JSON)
    ↓
Eligius JSON Configuration
```

### 4. Runtime Flow (Label ID Validation - Special Case)

```
AddControllerCall with labelId parameter
    │ (check parameter type)
    ↓
ParameterType:labelId detected
    │ (delegate to LabelRegistryService)
    ↓
LabelRegistryService.validateLabelID()
    │ (check against imported labels)
    ↓
Valid? → Continue compilation
Invalid? → Generate ValidationError with Levenshtein suggestions
```

---

## State Management

### Controller Metadata State

**Immutable**: Controller metadata is generated at build time and never modified at runtime.

**Storage**: In-memory constant array (CONTROLLERS) loaded once per language server session.

**Updates**: Only via regeneration (manual or triggered by Eligius package update).

### Validation State

**Per-Document**: Each document maintains its own validation state via Langium DocumentBuilder.

**Lifecycle**:
1. Document parsed → AST created
2. Validation triggered → Validators run
3. Diagnostics generated → LSP sends to client
4. Document modified → Re-validation triggered

**State Transitions**:
```
[No Diagnostics] ←→ [Has Diagnostics]
       ↑                    ↓
   (validation)         (fix applied)
```

### Label Registry State (Integration with Feature 034)

**Per-Document**: Label registry tracks which labels are available per document URI.

**Lifecycle**:
1. Document imports labels → LabelRegistryService.registerImports()
2. addController validated → LabelRegistryService.validateLabelID()
3. Label file updated → Re-validation triggered
4. Document closed → LabelRegistryService.clearDocument()

---

## Indexing and Lookup Strategies

### Controller Name Lookup

**Data Structure**: Map<string, ControllerMetadata>

**Index Creation**:
```typescript
const CONTROLLER_MAP = new Map(
  CONTROLLERS.map(ctrl => [ctrl.name, ctrl])
);
```

**Lookup Performance**: O(1) for controller name validation

**Levenshtein Suggestions**:
- Compute distance for all controller names: O(n * m) where n = CONTROLLERS.length, m = avg controller name length
- Filter distance ≤ 2: O(n)
- Sort by distance: O(n log n)
- Return top 3: O(1)
- **Total**: O(n * m + n log n) ≈ O(n) for small controller count (8 controllers)

### Parameter Position Mapping

**Data Structure**: Array (controller.parameters[])

**Mapping Algorithm**:
```typescript
function mapArgumentsToParameters(
  args: Expression[],
  parameters: ControllerParameterMetadata[]
): Record<string, Expression> {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    result[parameters[i].name] = args[i];
  }
  return result;
}
```

**Performance**: O(n) where n = parameter count (typically 1-3)

---

## Constraints and Invariants

### Invariants

1. **Controller Uniqueness**: No two controllers in CONTROLLERS array have the same name
2. **Parameter Order**: Parameter array order must match Eligius controller property order
3. **Required Before Optional**: All required parameters must appear before optional parameters
4. **Type Consistency**: Parameter type must be valid ParameterType enum value
5. **Label ID Single Type**: Only one parameter per controller can have type `ParameterType:labelId`

### Constraints

1. **Controller Count**: Maximum 100 controllers (current: 8, plenty of headroom)
2. **Parameter Count**: Maximum 10 parameters per controller (current max: 2)
3. **String Literal Only**: Controller name (first argument) must be string literal (no variables)
4. **Type Safety**: Argument expressions must be type-compatible with parameter types

---

## Migration and Versioning

### Backwards Compatibility

**Requirement** (from spec): Existing operation-based controller syntax must continue working (FR-012)

**Strategy**: `addController` is purely additive syntax sugar. Old syntax remains valid:
```eligian
// Old syntax (still works)
{
  "systemName": "getControllerInstance",
  "operationData": {"systemName": "LabelController"}
}
{
  "systemName": "addControllerToElement",
  "operationData": {"labelId": "mainTitle"}
}

// New syntax (sugar for above)
addController('LabelController', "mainTitle")
```

### Metadata Version Compatibility

**Eligius Version Tracking**: Not currently implemented, but recommended for future:
- Add `eligiusVersion` field to generated metadata
- Validate at language server startup that Eligius version matches
- Warn if version mismatch detected

---

## Performance Characteristics

### Memory Usage

- **CONTROLLERS array**: ~5KB for 8 controllers (negligible)
- **CONTROLLER_MAP**: ~5KB additional (O(n) space)
- **Per-document state**: ~1KB per document (AST nodes only)

**Total**: <50KB for typical project with 10 documents

### Validation Performance

- **Controller name lookup**: O(1) via Map
- **Parameter count check**: O(1) comparison
- **Parameter type check**: O(n) where n = parameter count (typically ≤3)
- **Label ID validation**: O(1) via LabelRegistryService Map lookup
- **Levenshtein suggestions**: O(n * m) where n = candidates, m = string length (typically <100ms)

**Total per validation**: <10ms for typical addController call

### Build-Time Performance

- **Metadata generation**: <500ms (one-time per build)
- **Metadata loading**: <50ms (one-time per language server session)

---

## Example Scenarios

### Scenario 1: Valid LabelController with Required Parameter

**DSL**:
```eligian
labels "./labels.json"

timeline "Demo" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', "mainTitle")
  }
}
```

**Data Flow**:
1. Parse → AddControllerCall { systemName: "addController", args: ["LabelController", "mainTitle"] }
2. Lookup → ControllerMetadata { name: "LabelController", parameters: [{name: "labelId", type: "ParameterType:labelId", required: true}] }
3. Validate → args[1] count matches required (1), type is string
4. Special validation → LabelRegistryService.validateLabelID("mainTitle") → valid
5. Transform → { getControllerInstance: {...}, addControllerToElement: { labelId: "mainTitle" } }

### Scenario 2: Unknown Controller Name

**DSL**:
```eligian
addController('LablController', "mainTitle")  // Typo: Labl instead of Label
```

**Data Flow**:
1. Parse → AddControllerCall { args: ["LablController", "mainTitle"] }
2. Lookup → Not found in CONTROLLERS
3. Levenshtein → distance("LablController", "LabelController") = 1 ≤ 2 → suggest
4. Error → ValidationError { code: 'unknown_controller', message: "Unknown controller: 'LablController' (Did you mean: 'LabelController'?)" }

### Scenario 3: Missing Required Parameter

**DSL**:
```eligian
addController('LabelController')  // Missing labelId
```

**Data Flow**:
1. Parse → AddControllerCall { args: ["LabelController"] }
2. Lookup → ControllerMetadata (requires labelId)
3. Validate → args.length (1) < required parameters (1) + controller name (1) = expected 2
4. Error → ValidationError { code: 'missing_required_parameter', message: "Missing required parameter 'labelId' for controller 'LabelController'" }

---

## Summary

This data model defines the core entities for specialized controller syntax:

1. **ControllerMetadata**: Build-time generated metadata from Eligius
2. **ControllerParameterMetadata**: Parameter specifications with types and validation rules
3. **AddControllerCall**: AST representation of controller addition syntax
4. **ValidationError**: Compile-time error reporting with suggestions
5. **TransformedOperations**: Eligius JSON output from transformation

The model supports:
- ✅ All 8 Eligius controllers
- ✅ Parameter count and type validation
- ✅ Label ID special validation (Feature 034 integration)
- ✅ Levenshtein suggestions for typos
- ✅ IDE support (autocomplete, hover)
- ✅ Backwards compatibility
- ✅ <300ms performance targets
