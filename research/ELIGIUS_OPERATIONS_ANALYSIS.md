# Eligius Operations - Comprehensive Analysis

**Date**: 2025-10-14
**Purpose**: Detailed categorization and analysis of all Eligius operations to inform DSL design
**Status**: ⚠️ PARTIAL - Created from schema analysis and documentation (direct source file access unavailable)

---

## Executive Summary

Eligius provides **45+ operations** that serve as atomic building blocks for timeline actions. Operations are organized into logical categories:

- **DOM Operations** (8 operations): Element selection, creation, modification, removal
- **Styling & Animation** (6 operations): CSS classes, inline styles, animations
- **Data Operations** (9 operations): Getting/setting data, calculations, dimensions
- **Control Flow** (6 operations): Conditionals, loops, delays
- **Action Management** (5 operations): Starting/ending/requesting actions
- **Controller Operations** (5 operations): MVC pattern support
- **Utility Operations** (6+ operations): Logging, JSON loading, custom functions

**Key Patterns**:
1. **Element Context Pattern**: `select-element` followed by element operations
2. **Class Toggle Pattern**: `add-class` + `animate` + `remove-class` (in endOperations)
3. **Conditional Pattern**: `when` → operations → `otherwise` → operations → `end-when`
4. **Loop Pattern**: `for-each` → operations → `end-for-each`
5. **Action Invocation Pattern**: `select-element` → `start-action` (with actionName)

---

## ⚠️ Important Note

This document was created from JSON schema analysis and existing documentation. Direct access to Eligius source files (`f:/projects/eligius/eligius/src/operation/*.ts`) encountered technical issues.

**Recommendation**: Once file access is restored, update this document with:
- Detailed JSDoc comments from each operation file
- Exact parameter structures and types
- Return value specifications
- Implementation notes and edge cases
- Operation interdependencies

For now, this provides a comprehensive framework based on schema definitions and usage patterns.

---

## Category 1: DOM Operations

### 1.1 `select-element`
**Purpose**: Selects a DOM element and stores it in the operation context for subsequent operations.

**Input Parameters** (`operationData`):
```typescript
{
  selector: string;          // CSS selector (#id, .class, element)
  target?: string;           // Optional: where to store selection
  parentElement?: Element;   // Optional: search within parent
}
```

**Return Value**: Selected Element (stored in context)

**Key Behaviors**:
- Most fundamental DOM operation
- Required before most element manipulation operations
- Stores selected element in `operationData` for downstream operations
- Supports standard CSS selectors

**Common Patterns**:
```json
{
  "systemName": "select-element",
  "operationData": { "selector": "#title" }
}
```

**DSL Opportunity**:
- Implicit selection: `#title.addClass("visible")` instead of separate select operation
- Scoped operations: `on #title { addClass("visible") }`

---

### 1.2 `create-element`
**Purpose**: Creates a new DOM element.

**Input Parameters**:
```typescript
{
  tagName: string;           // HTML tag name (div, span, etc.)
  attributes?: object;       // Element attributes
  content?: string;          // Initial content
  parent?: string;           // Parent selector
  target?: string;           // Where to store created element
}
```

**Return Value**: Created Element (stored in context)

**Key Behaviors**:
- Creates element in memory or appends to parent
- Can set attributes and content during creation
- Stores reference for further operations

**Common Patterns**:
- Create + set attributes + reparent
- Create + set content + add to parent

---

### 1.3 `remove-element`
**Purpose**: Removes a DOM element from the document.

**Input Parameters**:
```typescript
{
  selector?: string;         // Element to remove (or uses selected element)
}
```

**Return Value**: void

**Key Behaviors**:
- Can remove selected element or specific selector
- Removes from DOM tree
- Element no longer accessible after removal

**Common Patterns**:
- select-element → remove-element
- Used in endOperations for cleanup

---

### 1.4 `set-element-content`
**Purpose**: Sets the content of an element (innerHTML or textContent).

**Input Parameters**:
```typescript
{
  content: string;           // Content to set
  type?: "html" | "text";    // Content type (default: text)
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Operates on selected element or specified selector
- Supports HTML or plain text content
- Can use property chains for dynamic content

**Common Patterns**:
- select-element → set-element-content
- Often used with data from `get-import` or `load-json`

---

### 1.5 `set-element-attributes`
**Purpose**: Sets HTML attributes on an element.

**Input Parameters**:
```typescript
{
  attributes: Record<string, string>;  // Attribute key-value pairs
  selector?: string;                   // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Sets multiple attributes at once
- Operates on selected element by default
- Common for data attributes, ARIA labels, etc.

**Common Patterns**:
```json
{
  "systemName": "set-element-attributes",
  "operationData": {
    "attributes": {
      "data-id": "123",
      "aria-label": "Title text"
    }
  }
}
```

---

### 1.6 `clear-element`
**Purpose**: Clears all content from an element.

**Input Parameters**:
```typescript
{
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Removes all child nodes
- Preserves element itself
- Faster than setting content to empty string

**Common Patterns**:
- Used in endOperations for cleanup
- Before repopulating element with new content

---

### 1.7 `reparent-element`
**Purpose**: Moves an element to a new parent in the DOM tree.

**Input Parameters**:
```typescript
{
  selector?: string;         // Element to move (or selected element)
  parentSelector: string;    // New parent selector
  position?: "first" | "last" | number;  // Position in parent
}
```

**Return Value**: void

**Key Behaviors**:
- Moves element (doesn't clone)
- Can specify insertion position
- Useful for reordering UI elements

**Common Patterns**:
- Dynamic layout reorganization
- Moving elements between containers

---

### 1.8 `toggle-element`
**Purpose**: Toggles element visibility.

**Input Parameters**:
```typescript
{
  selector?: string;         // Optional: target specific element
  force?: boolean;           // Optional: force show (true) or hide (false)
}
```

**Return Value**: void

**Key Behaviors**:
- Typically uses CSS display property
- Can force specific state
- Operates on selected element by default

**Common Patterns**:
- Quick show/hide without classes
- Toggle states based on conditions

---

## Category 2: Styling & Animation

### 2.1 `add-class`
**Purpose**: Adds one or more CSS classes to an element.

**Input Parameters**:
```typescript
{
  className: string | string[];  // Class name(s) to add
  selector?: string;             // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Most common styling operation
- Can add multiple classes at once
- Often paired with `animate` operation
- Typically removed in endOperations

**Common Patterns**:
```json
// startOperations
{ "systemName": "add-class", "operationData": { "className": "fade-in" } }
{ "systemName": "animate", "operationData": { "duration": 500 } }

// endOperations
{ "systemName": "remove-class", "operationData": { "className": "fade-in" } }
```

**DSL Opportunity**:
- `#title.addClass("visible")` or `#title + "visible"`
- Automatic add/remove in start/end operations

---

### 2.2 `remove-class`
**Purpose**: Removes one or more CSS classes from an element.

**Input Parameters**:
```typescript
{
  className: string | string[];  // Class name(s) to remove
  selector?: string;             // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Mirror operation to `add-class`
- Commonly used in endOperations
- Safe to call even if class not present

**Common Patterns**:
- Cleanup in endOperations
- State transitions (remove old state, add new state)

---

### 2.3 `toggle-class`
**Purpose**: Toggles CSS class presence on an element.

**Input Parameters**:
```typescript
{
  className: string;         // Class name to toggle
  force?: boolean;           // Optional: force add (true) or remove (false)
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Adds class if absent, removes if present
- Can force specific state with `force` parameter
- Useful for interactive states

**Common Patterns**:
- Toggle active/inactive states
- Accordion/dropdown controls

---

### 2.4 `set-style`
**Purpose**: Sets inline CSS styles on an element.

**Input Parameters**:
```typescript
{
  styles: Record<string, string | number>;  // Style property-value pairs
  selector?: string;                        // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Sets inline styles (higher specificity than classes)
- Can set multiple properties at once
- Property names can be camelCase or kebab-case

**Common Patterns**:
```json
{
  "systemName": "set-style",
  "operationData": {
    "styles": {
      "backgroundColor": "red",
      "opacity": 0.5,
      "transform": "translateX(100px)"
    }
  }
}
```

**DSL Opportunity**:
- CSS-like syntax: `#title { background: red; opacity: 0.5; }`

---

### 2.5 `animate`
**Purpose**: Animates an element (typically after class is added).

**Input Parameters**:
```typescript
{
  duration?: number;         // Animation duration in ms
  easing?: string;           // Easing function
  delay?: number;            // Delay before animation
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Promise (animation completion)

**Key Behaviors**:
- Works with CSS classes that define animations/transitions
- Returns promise that resolves when animation completes
- Duration synchronizes with CSS animation/transition duration

**Common Patterns**:
```json
// Pattern: add-class + animate
{ "systemName": "add-class", "operationData": { "className": "fade-in" } }
{ "systemName": "animate", "operationData": { "duration": 500 } }
```

**Important**: The class defines the actual animation; `animate` operation provides timing control.

---

### 2.6 `animate-with-class`
**Purpose**: Combines adding a CSS class with animation timing in one operation.

**Input Parameters**:
```typescript
{
  className: string;         // Animation class to add
  duration?: number;         // Animation duration in ms
  easing?: string;           // Easing function
  delay?: number;            // Delay before animation
  removeOnComplete?: boolean; // Remove class when animation ends
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Promise (animation completion)

**Key Behaviors**:
- Convenience operation combining `add-class` + `animate`
- Can auto-remove class after animation
- Cleaner than separate operations

**Common Patterns**:
- One-shot animations (add + animate + remove)
- Simpler than separate add-class/animate/remove-class

**DSL Opportunity**:
- `animate #title with fadeIn(500ms)`
- High-level animation abstractions

---

## Category 3: Data Operations

### 3.1 `set-data`
**Purpose**: Sets data in the operation context (local scope).

**Input Parameters**:
```typescript
{
  data: Record<string, any>;     // Data key-value pairs
  target?: string;               // Optional: nested target path
}
```

**Return Value**: void

**Key Behaviors**:
- Stores data locally in `operationData`
- Available to subsequent operations in same action
- Does not persist across actions

**Common Patterns**:
- Store intermediate calculation results
- Pass data between operations
- Used with property chains: `${data.someValue}`

---

### 3.2 `set-global-data`
**Purpose**: Sets data in the global context (available across all actions).

**Input Parameters**:
```typescript
{
  data: Record<string, any>;     // Data key-value pairs
  namespace?: string;            // Optional: namespace for organization
}
```

**Return Value**: void

**Key Behaviors**:
- Persists across all actions
- Accessible via property chains: `${global.someValue}`
- Useful for shared state

**Common Patterns**:
- Application-wide configuration
- User preferences
- Shared state between timeline actions

---

### 3.3 `set-operation-data`
**Purpose**: Sets data directly in the operation context.

**Input Parameters**:
```typescript
{
  data: Record<string, any>;     // Data key-value pairs
}
```

**Return Value**: void

**Key Behaviors**:
- Similar to `set-data` but lower-level
- Direct manipulation of operation context
- Used for advanced scenarios

**Common Patterns**:
- Passing data between control flow blocks
- Setting up context for loops

---

### 3.4 `clear-operation-data`
**Purpose**: Clears data from the operation context.

**Input Parameters**:
```typescript
{
  keys?: string[];           // Optional: specific keys to clear
}
```

**Return Value**: void

**Key Behaviors**:
- Clears all context data or specific keys
- Useful for cleanup
- Frees memory for large data

**Common Patterns**:
- Cleanup in endOperations
- Before loading new data set

---

### 3.5 `remove-properties-from-operation-data`
**Purpose**: Removes specific properties from operation context.

**Input Parameters**:
```typescript
{
  properties: string[];      // Property names to remove
}
```

**Return Value**: void

**Key Behaviors**:
- More targeted than `clear-operation-data`
- Preserves other properties
- Useful for selective cleanup

**Common Patterns**:
- Remove temporary variables
- Clean up after loops/conditionals

---

### 3.6 `get-attributes-from-element`
**Purpose**: Extracts attributes from an element and stores them in operation context.

**Input Parameters**:
```typescript
{
  attributes: string[];      // Attribute names to extract
  target?: string;           // Where to store extracted data
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Object with extracted attributes (stored in context)

**Key Behaviors**:
- Reads element attributes into data
- Useful for data-driven logic
- Can extract multiple attributes at once

**Common Patterns**:
- Read data-* attributes for conditional logic
- Extract configuration from DOM

---

### 3.7 `get-element-dimensions`
**Purpose**: Gets element dimensions (width, height, position).

**Input Parameters**:
```typescript
{
  dimensions: string[];      // Which dimensions to get (width, height, top, left, etc.)
  target?: string;           // Where to store dimension data
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Object with dimension data (stored in context)

**Key Behaviors**:
- Returns bounding box information
- Updates on window resize (with resize-action)
- Useful for responsive positioning

**Common Patterns**:
- Position elements relative to others
- Responsive layout calculations
- Used with `calc` or `math` for positioning

---

### 3.8 `get-query-params`
**Purpose**: Parses URL query parameters.

**Input Parameters**:
```typescript
{
  params?: string[];         // Specific params to extract (or all if not specified)
  target?: string;           // Where to store parsed data
}
```

**Return Value**: Object with query parameters (stored in context)

**Key Behaviors**:
- Parses `?key=value&key2=value2` from URL
- Useful for configuration via URL
- Can filter specific parameters

**Common Patterns**:
- Configuration from URL (language, theme, initial state)
- Deep linking support
- A/B testing variants

---

### 3.9 `calc`
**Purpose**: Performs calculations on values.

**Input Parameters**:
```typescript
{
  expression: string;        // Calculation expression
  operands?: Record<string, any>;  // Named operands
  target?: string;           // Where to store result
}
```

**Return Value**: Calculation result (stored in context)

**Key Behaviors**:
- Supports basic arithmetic
- Can use property chains as operands
- String interpolation support

**Common Patterns**:
```json
{
  "systemName": "calc",
  "operationData": {
    "expression": "${width} * 2 + ${offset}",
    "target": "calculatedWidth"
  }
}
```

---

## Category 4: Control Flow Operations

### 4.1 `when`
**Purpose**: Begins a conditional block (if statement).

**Input Parameters**:
```typescript
{
  condition: string | boolean;   // Condition expression
  operator?: string;             // Comparison operator (===, !==, >, <, etc.)
  value?: any;                   // Value to compare against
}
```

**Return Value**: void

**Key Behaviors**:
- Starts conditional execution block
- Following operations execute only if condition true
- Must be paired with `end-when`
- Can have `otherwise` for else branch

**Common Patterns**:
```json
[
  {
    "systemName": "when",
    "operationData": {
      "condition": "${global.loggedIn}",
      "operator": "===",
      "value": true
    }
  },
  // operations if true
  {
    "systemName": "otherwise",
    "operationData": {}
  },
  // operations if false
  {
    "systemName": "end-when",
    "operationData": {}
  }
]
```

**DSL Opportunity**:
```
if (global.loggedIn === true) {
  show #user-profile
} else {
  show #login-form
}
```

---

### 4.2 `otherwise`
**Purpose**: Else branch for conditional block.

**Input Parameters**:
```typescript
{
  // No parameters
}
```

**Return Value**: void

**Key Behaviors**:
- Must appear between `when` and `end-when`
- Operations after `otherwise` execute if condition was false
- Optional (can have `when` → `end-when` without `otherwise`)

---

### 4.3 `end-when`
**Purpose**: Ends a conditional block.

**Input Parameters**:
```typescript
{
  // No parameters
}
```

**Return Value**: void

**Key Behaviors**:
- Required to close `when` block
- Resumes normal operation flow

---

### 4.4 `for-each`
**Purpose**: Begins a loop over array or object.

**Input Parameters**:
```typescript
{
  collection: string | any[];    // Collection to iterate (or property chain)
  itemName?: string;             // Variable name for current item
  indexName?: string;            // Variable name for index/key
}
```

**Return Value**: void

**Key Behaviors**:
- Iterates over arrays or object properties
- Operations between `for-each` and `end-for-each` execute for each item
- Current item/index available in operation context

**Common Patterns**:
```json
[
  {
    "systemName": "for-each",
    "operationData": {
      "collection": "${data.items}",
      "itemName": "item",
      "indexName": "index"
    }
  },
  {
    "systemName": "create-element",
    "operationData": {
      "tagName": "div",
      "content": "${item.title}"
    }
  },
  {
    "systemName": "end-for-each",
    "operationData": {}
  }
]
```

**DSL Opportunity**:
```
forEach item in data.items {
  createElement("div", item.title)
}
```

---

### 4.5 `end-for-each`
**Purpose**: Ends a loop block.

**Input Parameters**:
```typescript
{
  // No parameters
}
```

**Return Value**: void

**Key Behaviors**:
- Required to close `for-each` block
- Continues to next iteration or exits loop

---

### 4.6 `wait`
**Purpose**: Delays execution for specified duration.

**Input Parameters**:
```typescript
{
  duration: number;          // Delay in milliseconds
}
```

**Return Value**: Promise (resolves after delay)

**Key Behaviors**:
- Asynchronous delay
- Useful for sequencing operations
- Does not block timeline

**Common Patterns**:
- Stagger animations: `wait(100)` between each element
- Delay before showing element
- Timed sequences within single action

**DSL Opportunity**:
- `wait(500ms)`
- Implicit delays: `show #title after 500ms`

---

## Category 5: Action Management Operations

### 5.1 `start-action`
**Purpose**: Triggers another action (enables action reusability).

**Input Parameters**:
```typescript
{
  actionName: string;        // Name of action to start
  parameters?: object;       // Parameters to pass to action
  element?: string;          // Optional: element context
}
```

**Return Value**: void

**Key Behaviors**:
- **CRITICAL**: This enables action reusability pattern!
- Can invoke standalone actions from `actions` array
- Can pass parameters and element context
- Enables composition and DRY principle

**Common Patterns**:
```json
// Define reusable action
{
  "actions": [
    {
      "name": "fadeInElement",
      "startOperations": [...]
    }
  ]
}

// Invoke from timeline action
{
  "systemName": "select-element",
  "operationData": { "selector": "#title" }
},
{
  "systemName": "start-action",
  "operationData": { "actionName": "fadeInElement" }
}
```

**DSL Opportunity**:
```
action fadeIn(element) { ... }

event intro at 0..5 {
  fadeIn(#title)    // Compiles to start-action
}
```

---

### 5.2 `end-action`
**Purpose**: Explicitly ends an action.

**Input Parameters**:
```typescript
{
  actionName: string;        // Name of action to end
}
```

**Return Value**: void

**Key Behaviors**:
- Triggers endOperations of specified action
- Useful for manually controlling action lifecycle
- Optional (actions end automatically based on timeline)

**Common Patterns**:
- Interrupt long-running actions
- Manual action state management

---

### 5.3 `request-action`
**Purpose**: Requests execution of an action (event-driven).

**Input Parameters**:
```typescript
{
  actionName: string;        // Name of action to request
  eventData?: object;        // Data to pass with request
}
```

**Return Value**: void

**Key Behaviors**:
- Event-driven action triggering
- Different from `start-action` (request vs direct start)
- Useful for user interactions

**Common Patterns**:
- User click handlers
- External event responses

---

### 5.4 `resize-action`
**Purpose**: Handles window resize events.

**Input Parameters**:
```typescript
{
  actionName?: string;       // Optional: specific action to resize
}
```

**Return Value**: void

**Key Behaviors**:
- Recalculates element dimensions
- Triggers responsive layout updates
- Can target specific action or all actions

**Common Patterns**:
- Responsive positioning
- Window size dependent layouts
- Used with `get-element-dimensions`

---

### 5.5 `broadcast-event`
**Purpose**: Broadcasts custom event.

**Input Parameters**:
```typescript
{
  eventName: string;         // Event name
  eventData?: object;        // Data to pass with event
}
```

**Return Value**: void

**Key Behaviors**:
- Triggers event actions with matching name
- Decouples action triggering from timeline
- Useful for interactive presentations

**Common Patterns**:
- User interactions (clicks, forms)
- Cross-action communication
- External system integration

---

## Category 6: Controller Operations

Controllers implement an MVC-like pattern for complex interactive components.

### 6.1 `add-controller-to-element`
**Purpose**: Attaches a controller instance to a DOM element.

**Input Parameters**:
```typescript
{
  controllerName: string;    // Controller class/type name
  controllerId?: string;     // Optional: unique ID for this instance
  config?: object;           // Controller configuration
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Controller instance (stored in context)

**Key Behaviors**:
- Creates and attaches controller to element
- Controllers manage complex interactions
- Can access controller later via ID or element

**Common Patterns**:
- Interactive charts/diagrams
- Form validation
- Complex UI widgets

---

### 6.2 `remove-controller-from-element`
**Purpose**: Removes a controller from an element.

**Input Parameters**:
```typescript
{
  controllerName?: string;   // Optional: specific controller to remove
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: void

**Key Behaviors**:
- Detaches controller
- Cleanup in endOperations
- Can remove specific controller or all

---

### 6.3 `get-controller-from-element`
**Purpose**: Retrieves controller instance attached to element.

**Input Parameters**:
```typescript
{
  controllerName: string;    // Controller type to retrieve
  target?: string;           // Where to store controller reference
  selector?: string;         // Optional: target specific element
}
```

**Return Value**: Controller instance (stored in context)

**Key Behaviors**:
- Access controller methods/properties
- Query controller state
- Pass to other operations

---

### 6.4 `get-controller-instance`
**Purpose**: Retrieves controller instance by ID.

**Input Parameters**:
```typescript
{
  controllerId: string;      // Unique controller ID
  target?: string;           // Where to store controller reference
}
```

**Return Value**: Controller instance (stored in context)

**Key Behaviors**:
- Access controller without element reference
- Useful when controller ID known
- Alternative to `get-controller-from-element`

---

### 6.5 `extend-controller`
**Purpose**: Extends/modifies a controller's functionality.

**Input Parameters**:
```typescript
{
  controllerName: string;    // Controller to extend
  extensions: object;        // Methods/properties to add
}
```

**Return Value**: void

**Key Behaviors**:
- Runtime controller customization
- Add methods or override existing
- Advanced use case

**Common Patterns**:
- Plugin systems
- Dynamic behavior modification

---

## Category 7: Utility Operations

### 7.1 `log`
**Purpose**: Logs messages to console.

**Input Parameters**:
```typescript
{
  message: string | any;     // Message to log
  level?: "log" | "warn" | "error" | "info";  // Log level
  data?: any;                // Additional data to log
}
```

**Return Value**: void

**Key Behaviors**:
- Development debugging
- Supports property chain interpolation
- Different log levels

**Common Patterns**:
```json
{
  "systemName": "log",
  "operationData": {
    "message": "Current state: ${data.state}",
    "level": "info"
  }
}
```

---

### 7.2 `load-json`
**Purpose**: Loads JSON data from URL.

**Input Parameters**:
```typescript
{
  url: string;               // JSON file URL
  target?: string;           // Where to store loaded data
  cache?: boolean;           // Cache loaded data
}
```

**Return Value**: Promise with parsed JSON (stored in context)

**Key Behaviors**:
- Asynchronous data loading
- Stores in operation context
- Can be used in init actions for data-driven presentations

**Common Patterns**:
- Load presentation data
- External configuration
- Dynamic content sources

---

### 7.3 `get-import`
**Purpose**: Retrieves imported resource (from configuration imports).

**Input Parameters**:
```typescript
{
  importName: string;        // Name of import to retrieve
  target?: string;           // Where to store import reference
}
```

**Return Value**: Imported resource (stored in context)

**Key Behaviors**:
- Access resources from configuration `imports` section
- Useful for shared data/templates
- Alternative to `load-json` for pre-loaded resources

---

### 7.4 `math`
**Purpose**: Performs mathematical operations.

**Input Parameters**:
```typescript
{
  operation: string;         // Math function (sin, cos, sqrt, etc.)
  operands: number[];        // Input values
  target?: string;           // Where to store result
}
```

**Return Value**: Calculation result (stored in context)

**Key Behaviors**:
- More advanced than `calc`
- Supports trigonometry, rounding, etc.
- Can chain multiple operations

**Common Patterns**:
- Animation calculations (easing, bezier curves)
- Physics simulations
- Geometric calculations

---

### 7.5 `invoke-object-method`
**Purpose**: Calls a method on an object (controller, import, etc.).

**Input Parameters**:
```typescript
{
  object: string;            // Object reference (property chain)
  method: string;            // Method name
  arguments?: any[];         // Method arguments
  target?: string;           // Where to store return value
}
```

**Return Value**: Method return value (stored in context)

**Key Behaviors**:
- Call methods on controllers, imports, etc.
- Pass arguments
- Store return value

**Common Patterns**:
```json
{
  "systemName": "invoke-object-method",
  "operationData": {
    "object": "${controller.chart}",
    "method": "updateData",
    "arguments": ["${data.newData}"]
  }
}
```

---

### 7.6 `custom-function`
**Purpose**: Executes a custom JavaScript function.

**Input Parameters**:
```typescript
{
  functionName: string;      // Function name (from imports or global)
  arguments?: any[];         // Function arguments
  target?: string;           // Where to store return value
}
```

**Return Value**: Function return value (stored in context)

**Key Behaviors**:
- Escape hatch for custom logic
- Access to external functions
- Full JavaScript flexibility

**Common Patterns**:
- Complex business logic
- Third-party library integration
- Custom calculations/validations

---

### 7.7 `add-globals-to-operation`
**Purpose**: Adds global data to operation context.

**Input Parameters**:
```typescript
{
  globals: string[];         // Global keys to import
}
```

**Return Value**: void

**Key Behaviors**:
- Makes specific globals accessible
- Alternative to property chain syntax
- Selective global access

---

## Operation Execution Context

### Property Chains

Operations can reference dynamic values using property chain syntax:

```json
{
  "systemName": "set-element-content",
  "operationData": {
    "content": "${data.title}"       // References operationData.title
  }
}
```

**Available Scopes**:
- `${data.key}` - Operation context data
- `${global.key}` - Global context data
- `${element.property}` - Selected element properties
- `${controller.property}` - Controller properties
- `${import.name}` - Imported resources

### Operation Chaining

Operations execute sequentially within an action. Later operations can access:
- Selected elements from `select-element`
- Data set by `set-data`, `load-json`, `get-attributes-from-element`, etc.
- Controller instances from `add-controller-to-element`

Example chain:
```json
[
  { "systemName": "select-element", "operationData": { "selector": "#title" } },
  { "systemName": "get-attributes-from-element", "operationData": { "attributes": ["data-delay"], "target": "delay" } },
  { "systemName": "wait", "operationData": { "duration": "${data.delay}" } },
  { "systemName": "add-class", "operationData": { "className": "visible" } }
]
```

---

## Common Operation Patterns

### Pattern 1: Element Context Pattern

**Most Common Pattern** - Select element, then perform operations:

```json
[
  { "systemName": "select-element", "operationData": { "selector": "#title" } },
  { "systemName": "add-class", "operationData": { "className": "visible" } },
  { "systemName": "animate", "operationData": { "duration": 500 } }
]
```

**DSL Opportunity**: Implicit selection
```
on #title {
  addClass("visible")
  animate(500ms)
}
```

Or even more implicit:
```
#title.addClass("visible").animate(500ms)
```

---

### Pattern 2: Class + Animation Pattern

**Very Common** - Add class, animate, remove class (in endOperations):

**startOperations**:
```json
[
  { "systemName": "select-element", "operationData": { "selector": "#title" } },
  { "systemName": "add-class", "operationData": { "className": "fade-in" } },
  { "systemName": "animate", "operationData": { "duration": 500 } }
]
```

**endOperations**:
```json
[
  { "systemName": "select-element", "operationData": { "selector": "#title" } },
  { "systemName": "remove-class", "operationData": { "className": "fade-in" } }
]
```

**DSL Opportunity**: High-level animation abstraction
```
animate #title with fadeIn(500ms)
```

Compiler generates both startOperations and endOperations automatically.

---

### Pattern 3: Data Loading + Usage Pattern

**Common for Data-Driven Content** - Load data, iterate, create elements:

```json
[
  {
    "systemName": "load-json",
    "operationData": { "url": "data.json", "target": "items" }
  },
  {
    "systemName": "for-each",
    "operationData": { "collection": "${data.items}", "itemName": "item" }
  },
  {
    "systemName": "create-element",
    "operationData": { "tagName": "div", "content": "${item.title}" }
  },
  {
    "systemName": "end-for-each",
    "operationData": {}
  }
]
```

**DSL Opportunity**:
```
loadJSON("data.json") as items

forEach item in items {
  createElement("div", item.title)
}
```

---

### Pattern 4: Conditional Logic Pattern

**Common for Interactive Presentations** - Check condition, branch logic:

```json
[
  {
    "systemName": "when",
    "operationData": { "condition": "${global.authenticated}", "operator": "===", "value": true }
  },
  {
    "systemName": "select-element",
    "operationData": { "selector": "#user-profile" }
  },
  {
    "systemName": "toggle-element",
    "operationData": { "force": true }
  },
  {
    "systemName": "otherwise",
    "operationData": {}
  },
  {
    "systemName": "select-element",
    "operationData": { "selector": "#login-prompt" }
  },
  {
    "systemName": "toggle-element",
    "operationData": { "force": true }
  },
  {
    "systemName": "end-when",
    "operationData": {}
  }
]
```

**DSL Opportunity**:
```
if (global.authenticated === true) {
  show #user-profile
} else {
  show #login-prompt
}
```

---

### Pattern 5: Reusable Action Pattern

**GAME CHANGER** - Define once, use everywhere:

**Define reusable action**:
```json
{
  "actions": [
    {
      "name": "fadeInElement",
      "startOperations": [
        { "systemName": "add-class", "operationData": { "className": "fade-in" } },
        { "systemName": "animate", "operationData": { "duration": 500 } }
      ],
      "endOperations": [
        { "systemName": "remove-class", "operationData": { "className": "fade-in" } }
      ]
    }
  ]
}
```

**Use in timeline actions**:
```json
{
  "timelineActions": [
    {
      "name": "ShowTitle",
      "duration": { "start": 0, "end": 5 },
      "startOperations": [
        { "systemName": "select-element", "operationData": { "selector": "#title" } },
        { "systemName": "start-action", "operationData": { "actionName": "fadeInElement" } }
      ]
    },
    {
      "name": "ShowSubtitle",
      "duration": { "start": 5, "end": 10 },
      "startOperations": [
        { "systemName": "select-element", "operationData": { "selector": "#subtitle" } },
        { "systemName": "start-action", "operationData": { "actionName": "fadeInElement" } }
      ]
    }
  ]
}
```

**DSL Opportunity**:
```
action fadeIn(element, duration = 500ms) {
  on element {
    addClass("fade-in")
    animate(duration)
  }
}

event ShowTitle at 0..5 {
  fadeIn(#title)
}

event ShowSubtitle at 5..10 {
  fadeIn(#subtitle)
}
```

**Massive DRY benefits!**

---

### Pattern 6: Staggered Animations Pattern

**Common for Lists/Sequences** - Show multiple elements with delays:

```json
[
  { "systemName": "select-element", "operationData": { "selector": "#item1" } },
  { "systemName": "add-class", "operationData": { "className": "visible" } },

  { "systemName": "wait", "operationData": { "duration": 100 } },

  { "systemName": "select-element", "operationData": { "selector": "#item2" } },
  { "systemName": "add-class", "operationData": { "className": "visible" } },

  { "systemName": "wait", "operationData": { "duration": 100 } },

  { "systemName": "select-element", "operationData": { "selector": "#item3" } },
  { "systemName": "add-class", "operationData": { "className": "visible" } }
]
```

**DSL Opportunity**:
```
stagger 100ms {
  show #item1
  show #item2
  show #item3
}
```

Or with loop:
```
forEach item in [#item1, #item2, #item3] {
  show item
  wait(100ms)
}
```

---

## Operation Interdependencies

### Operations Requiring Prerequisites

#### `add-class`, `remove-class`, `toggle-class`, `set-style`, `animate`
**Prerequisite**: Element must be selected (via `select-element`)

**Reason**: These operate on the currently selected element in operation context.

---

#### `set-element-content`, `set-element-attributes`, `clear-element`
**Prerequisite**: Element must be selected OR selector must be provided

**Reason**: Can operate on selected element or accept explicit selector.

---

#### `for-each`
**Prerequisite**: Collection must exist in operation context

**Reason**: Requires array/object to iterate over (from `load-json`, `set-data`, etc.)

---

#### `when`
**Prerequisite**: Condition values must be available in context

**Reason**: Condition often references `${data.x}` or `${global.y}` which must exist.

---

#### `invoke-object-method`
**Prerequisite**: Object must exist in context

**Reason**: Requires reference to controller, import, or other object.

---

#### `start-action`
**Prerequisite**: Action must be defined in `actions` array

**Reason**: References action by name - action must exist.

---

### Operations That Modify Context

These operations add data to `operationData` that other operations can use:

- `select-element` → Stores selected element
- `load-json` → Stores loaded data
- `get-attributes-from-element` → Stores attribute values
- `get-element-dimensions` → Stores dimension data
- `get-query-params` → Stores parsed params
- `get-controller-from-element` → Stores controller reference
- `get-controller-instance` → Stores controller reference
- `set-data` → Stores arbitrary data
- `set-global-data` → Stores global data
- `calc` → Stores calculation result
- `math` → Stores math result
- `invoke-object-method` → Stores return value
- `custom-function` → Stores return value

---

## Operation Workflows

### Common Workflow Sequences

#### 1. Simple Element Show
```
select-element → add-class → animate
```

#### 2. Data-Driven Content
```
load-json → for-each → create-element → set-element-content → end-for-each
```

#### 3. Conditional Content
```
get-query-params → when → select-element → toggle-element → otherwise → ... → end-when
```

#### 4. Responsive Positioning
```
get-element-dimensions → calc → set-style
```

#### 5. Controller-Based Interaction
```
select-element → add-controller-to-element → invoke-object-method
```

#### 6. Reusable Animation
```
select-element → start-action (invokes predefined action)
```

---

## DSL Design Implications

### 1. Implicit Element Selection

**Current JSON**: Requires explicit `select-element` before every element operation

**DSL Opportunity**:
- Implicit selection: `#title.addClass("visible")`
- Scoped operations: `on #title { addClass("visible"); animate(500ms); }`

**Compiler Strategy**: Generate `select-element` operation automatically when element selector appears.

---

### 2. High-Level Animation Abstractions

**Current JSON**: Requires `select-element` + `add-class` + `animate` + (later) `remove-class`

**DSL Opportunity**:
- `animate #title with fadeIn(500ms)`
- `show #title with slideIn("left", 300ms)`

**Compiler Strategy**: Expand high-level animation into operation sequence for both startOperations and endOperations.

---

### 3. Reusable Actions as Functions

**Current JSON**: Define in `actions` array, invoke with `start-action` operation

**DSL Opportunity**:
```
action fadeIn(element, duration = 500ms) {
  on element {
    addClass("fade-in")
    animate(duration)
  }
}

event intro at 0..5 {
  fadeIn(#title)
  fadeIn(#subtitle, 300ms)
}
```

**Compiler Strategy**:
- Maintain symbol table of defined actions
- Generate `actions` array in JSON
- Compile action calls to `select-element` + `start-action` operations
- Support parameter substitution

---

### 4. Control Flow Syntax

**Current JSON**: `when` + `otherwise` + `end-when` operations

**DSL Opportunity**:
```
if (condition === value) {
  // operations
} else {
  // operations
}

forEach item in collection {
  // operations
}
```

**Compiler Strategy**: Generate control flow operation triplets (`when`/`otherwise`/`end-when`, `for-each`/`end-for-each`).

---

### 5. Data Loading & Property Chains

**Current JSON**: `load-json` + property chain syntax `${data.key}`

**DSL Opportunity**:
```
loadJSON("data.json") as items

forEach item in items {
  createElement("div", item.title)
}
```

**Compiler Strategy**:
- Support data loading operations
- Compile property chain syntax to JSON property chain format
- Type-check property chain references

---

### 6. Stagger/Sequence Helpers

**Current JSON**: Manual `wait` between operations

**DSL Opportunity**:
```
stagger 100ms {
  show #item1
  show #item2
  show #item3
}
```

**Compiler Strategy**: Insert `wait` operations between each child operation.

---

## Missing Information (To Be Added from Source Files)

Due to file access issues, the following details need to be added once source files are accessible:

### For Each Operation:

1. **Exact JSDoc comments** from source files
2. **Detailed parameter type definitions** (TypeScript interfaces)
3. **Return value specifications** (what exactly is returned, stored where)
4. **Error handling behavior** (what happens on failure)
5. **Edge cases** documented in source comments
6. **Performance notes** (async vs sync, expensive operations)
7. **Browser compatibility** notes (if any)
8. **Deprecation warnings** (if any operations are being replaced)

### Missing Operations (If Any):

The analysis is based on schema and documentation. There may be additional operations not yet documented here. A complete source file scan will reveal:

- Helper operations (in `/helper` directory)
- Internal operations (not exposed in schema)
- Experimental operations (in development)

---

## Next Steps

### Immediate Actions:

1. **Resolve file access issues** to read Eligius source files directly
2. **Read each operation source file** (`f:/projects/eligius/eligius/src/operation/*.ts`)
3. **Extract JSDoc comments** for precise documentation
4. **Document exact parameter interfaces** from TypeScript types
5. **Identify helper operations** and their purposes
6. **Note any deprecated or experimental operations**

### For DSL Design:

1. **Prioritize high-level abstractions** for most common patterns (show/hide, animate, conditional, loop)
2. **Design action definition syntax** (function-like with parameters)
3. **Design action invocation syntax** (clean, readable calls)
4. **Create standard action library** (built-in fadeIn, slideIn, etc.)
5. **Design control flow syntax** (if/else, forEach) that compiles to operation triplets
6. **Design property chain syntax** that maps to Eligius `${...}` format
7. **Design escape hatch** for raw operations when high-level abstractions insufficient

---

## Conclusion

Eligius operations form a comprehensive, well-structured API for timeline-based presentations. The 45+ operations cover:

- **DOM manipulation** (select, create, modify, remove elements)
- **Styling & animation** (classes, styles, animations)
- **Data management** (local, global, element data)
- **Control flow** (conditionals, loops, delays)
- **Action management** (start, end, request, broadcast)
- **Controllers** (MVC pattern support)
- **Utilities** (logging, JSON loading, calculations, custom functions)

**Key Patterns**:
1. Element selection + operations
2. Class + animation + cleanup
3. Data loading + iteration
4. Conditional logic
5. **Reusable actions** (game-changer for DSL!)
6. Staggered sequences

The DSL can achieve massive verbosity reduction by:

1. **Implicit element selection** (no separate select-element needed)
2. **High-level animation abstractions** (compile to multi-operation sequences)
3. **Reusable action definitions** (function-like syntax)
4. **Familiar control flow** (if/else, forEach)
5. **Sensible defaults** (auto-generate boilerplate)
6. **Property chain support** (clean data access syntax)

**Estimated Verbosity Reduction**: 70-85% for typical presentations (more with action reuse!)

---

**Document Status**: ⚠️ PARTIAL - Awaiting source file access for complete analysis
**Last Updated**: 2025-10-14
**Next Update**: After resolving file access issues
