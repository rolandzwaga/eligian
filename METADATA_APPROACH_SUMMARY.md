# Using Eligius Metadata for Operation Registry

**Decision**: Use `../eligius/src/operation/metadata/*.ts` files instead of JSON schemas

---

## Why Metadata > JSON Schemas

1. ✅ **Rich ParameterTypes**: `ParameterType:className` (can validate actual CSS), not just `"string"`
2. ✅ **23 rich types available**: className, selector, eventTopic, actionName, controllerName, url, etc.
3. ✅ **Explicit dependencies**: `dependentProperties: ['selectedElement']`
4. ✅ **Explicit outputs**: `outputProperties: { selectedElement: ... }`
5. ✅ **Constant value constraints**: Enum-like values (e.g., "overwrite" | "append" | "prepend")
6. ✅ **TypeScript native**: Direct import, type-safe
7. ✅ **48 metadata files**: One per operation, already maintained

---

## Metadata Structure Example

```typescript
// From: ../eligius/src/operation/metadata/add-class.ts
export function addClass(): IOperationMetadata<IAddClassOperationData> {
  return {
    description: `This operation adds the specified class name to the specified selected element.`,
    dependentProperties: ['selectedElement'],  // Needs selectedElement from previous operation
    properties: {
      className: {
        type: 'ParameterType:className',  // Rich type - can validate CSS class names!
        required: true,
      }
    },
  };
}

// From: ../eligius/src/operation/metadata/select-element.ts
export function selectElement(): IOperationMetadata<ISelectElementOperationData> {
  return {
    description: `This operation selects one or more elements using the specified selector...`,
    properties: {
      selector: {
        type: 'ParameterType:selector',  // Can validate CSS selectors!
        required: true,
      },
      useSelectedElementAsRoot: {
        type: 'ParameterType:boolean',
      }
    },
    outputProperties: {
      selectedElement: {
        type: 'ParameterType:object',  // Produces output!
      }
    }
  };
}

// From: ../eligius/src/operation/metadata/set-element-content.ts
export function setElementContent(): IOperationMetadata<ISetElementContentOperationData> {
  return {
    description: `This operation sets the specified content...`,
    dependentProperties: ['selectedElement', 'template'],
    properties: {
      insertionType: {
        type: [
          { value: 'overwrite' },  // Constant value constraints!
          { value: 'append' },
          { value: 'prepend' }
        ],
      }
    },
  };
}
```

---

## Rich Parameter Types (23 types)

From `../eligius/src/operation/metadata/types.ts`:

```typescript
export type TParameterTypes =
  | 'ParameterType:htmlElementName'     // HTML tag names
  | 'ParameterType:className'           // CSS class names (can validate against CSS file!)
  | 'ParameterType:selector'            // CSS selectors
  | 'ParameterType:string'
  | 'ParameterType:number'
  | 'ParameterType:object'
  | 'ParameterType:boolean'
  | 'ParameterType:array'
  | 'ParameterType:eventTopic'          // Event topics (can validate exist!)
  | 'ParameterType:eventName'           // Event names
  | 'ParameterType:systemName'          // Operation system names
  | 'ParameterType:actionName'          // Action names (can validate exist!)
  | 'ParameterType:controllerName'      // Controller names
  | 'ParameterType:dimensions'
  | 'ParameterType:dimensionsModifier'
  | 'ParameterType:url'                 // URLs
  | 'ParameterType:htmlContent'         // HTML content
  | 'ParameterType:labelId'             // Label IDs
  | 'ParameterType:ImagePath'           // Image paths
  | 'ParameterType:QuadrantPosition'
  | 'ParameterType:jQuery'              // jQuery objects
  | 'ParameterType:expression';         // Expressions
```

**This enables advanced validation**:
- Check CSS class names exist in referenced CSS files
- Validate selectors are syntactically correct
- Check action names reference defined actions
- Validate event topics exist in event bus
- And much more!

---

## Implementation Approach

### Step 1: Import metadata functions

```typescript
// packages/compiler/src/operations/registry-generator.ts

// Import all metadata functions
import { addClass } from '../../../eligius/src/operation/metadata/add-class.ts';
import { removeClass } from '../../../eligius/src/operation/metadata/remove-class.ts';
import { selectElement } from '../../../eligius/src/operation/metadata/select-element.ts';
import { animate } from '../../../eligius/src/operation/metadata/animate.ts';
// ... import all 47 functions

const METADATA_FUNCTIONS = {
  addClass,
  removeClass,
  selectElement,
  animate,
  // ... all 47
};
```

### Step 2: Convert to our format

```typescript
function convertMetadata(
  systemName: string,
  metadata: IOperationMetadata<any>,
  category: string
): OperationSignature {
  // Extract parameters from metadata.properties
  const parameters: OperationParameter[] = [];
  if (metadata.properties) {
    for (const [name, prop] of Object.entries(metadata.properties)) {
      if (typeof prop === 'string') {
        // Simple: 'ParameterType:string'
        parameters.push({ name, type: prop, required: false });
      } else if (Array.isArray(prop.type)) {
        // Constants: [{ value: 'overwrite' }, ...]
        parameters.push({ name, type: prop.type, required: prop.required || false });
      } else {
        // Complex: { type: '...', required: true }
        parameters.push({ name, type: prop.type, required: prop.required || false });
      }
    }
  }

  // Extract dependencies from metadata.dependentProperties
  const dependencies = (metadata.dependentProperties || []).map(name => ({
    name: name as string,
    type: 'ParameterType:object'
  }));

  // Extract outputs from metadata.outputProperties
  const outputs: OutputInfo[] = [];
  if (metadata.outputProperties) {
    for (const [name, prop] of Object.entries(metadata.outputProperties)) {
      const type = typeof prop === 'string' ? prop : prop.type;
      outputs.push({ name, type: Array.isArray(type) ? 'ParameterType:object' : type });
    }
  }

  return { systemName, description: metadata.description, parameters, dependencies, outputs, category };
}
```

### Step 3: Generate registry

```typescript
export function generateRegistry(): OperationRegistry {
  const registry: OperationRegistry = {};

  for (const [name, metadataFn] of Object.entries(METADATA_FUNCTIONS)) {
    const metadata = metadataFn();
    const category = inferCategory(name); // Simple category inference
    registry[name] = convertMetadata(name, metadata, category);
  }

  return registry;
}

// Write to file
const registry = generateRegistry();
writeFileSync(
  './packages/compiler/src/operations/registry.generated.ts',
  `export const OPERATION_REGISTRY = ${JSON.stringify(registry, null, 2)} as const;`,
  'utf-8'
);
```

---

## Generated Output Example

```typescript
// packages/compiler/src/operations/registry.generated.ts
export const OPERATION_REGISTRY = {
  addClass: {
    systemName: 'addClass',
    description: 'This operation adds the specified class name...',
    category: 'CSS',
    parameters: [
      {
        name: 'className',
        type: 'ParameterType:className',  // RICH TYPE!
        required: true
      }
    ],
    dependencies: [
      { name: 'selectedElement', type: 'ParameterType:object' }
    ],
    outputs: []
  },

  selectElement: {
    systemName: 'selectElement',
    description: 'This operation selects one or more elements...',
    category: 'DOM',
    parameters: [
      {
        name: 'selector',
        type: 'ParameterType:selector',  // RICH TYPE!
        required: true
      },
      {
        name: 'useSelectedElementAsRoot',
        type: 'ParameterType:boolean',
        required: false
      }
    ],
    dependencies: [],
    outputs: [
      { name: 'selectedElement', type: 'ParameterType:object' }
    ]
  },

  setElementContent: {
    systemName: 'setElementContent',
    description: 'This operation sets the specified content...',
    category: 'DOM',
    parameters: [
      {
        name: 'insertionType',
        type: [
          { value: 'overwrite' },  // CONSTANT VALUES!
          { value: 'append' },
          { value: 'prepend' }
        ],
        required: false
      }
    ],
    dependencies: [
      { name: 'selectedElement', type: 'ParameterType:object' },
      { name: 'template', type: 'ParameterType:object' }
    ],
    outputs: []
  }

  // ... all 47 operations
} as const;
```

---

## Advanced Validation Examples

With rich types, we can implement sophisticated validation:

```typescript
// Validate CSS class name format AND existence
case 'ParameterType:className':
  if (isStringLiteral(value)) {
    const className = value.value;
    // Check format
    if (!/^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/.test(className)) {
      errors.push({ message: `Invalid CSS class name: "${className}"` });
    }
    // Check if class exists in CSS file (optional but powerful!)
    if (context.cssFile && !context.cssFile.hasClass(className)) {
      errors.push({
        message: `Class "${className}" not found in CSS`,
        hint: `Available: ${context.cssFile.getClasses().join(', ')}`
      });
    }
  }
  break;

// Validate action name references existing action
case 'ParameterType:actionName':
  if (isStringLiteral(value) && !context.actions.has(value.value)) {
    errors.push({
      message: `Unknown action: "${value.value}"`,
      hint: `Define it with: endable action ${value.value} [...] [...]`
    });
  }
  break;

// Validate constant values
if (Array.isArray(param.type)) {
  const allowedValues = param.type.map(c => c.value);
  if (isStringLiteral(value) && !allowedValues.includes(value.value)) {
    errors.push({
      message: `Invalid value for ${param.name}`,
      hint: `Must be one of: ${allowedValues.join(' | ')}`
    });
  }
}
```

---

## Benefits Summary

### Compared to JSON Schemas:

| Feature | JSON Schema | Metadata |
|---------|-------------|----------|
| Parameter types | Basic (string, number) | **Rich (ParameterType:className, etc.)** |
| Dependencies | ❌ Not included | ✅ `dependentProperties` |
| Outputs | ❌ Not included | ✅ `outputProperties` |
| Constants | ❌ Manual enum | ✅ Array of values |
| Validation | Basic type checking | **Advanced (CSS classes, action names, etc.)** |
| Maintenance | Separate from code | **Part of Eligius codebase** |
| Type safety | JSON parsing | **TypeScript imports** |

### Compared to Manual Documentation:

- **No manual work**: Import functions directly
- **Always accurate**: Source of truth is Eligius code
- **Type-safe**: TypeScript compilation catches errors
- **Auto-updates**: Regenerate when Eligius updates

---

## Estimated Effort

- **Original plan (JSON schemas)**: 1-2 days
- **Updated plan (metadata)**: **0.5-1 day**
  - Write converter function: 2-3 hours
  - Write generator script: 1-2 hours
  - Test with all 47 operations: 1-2 hours
  - Wire into validator: 1-2 hours

**This is the best approach!** 🎯
