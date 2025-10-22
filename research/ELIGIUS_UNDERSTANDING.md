# Eligius Library - Technical Analysis & Understanding

**Date**: 2025-10-14
**Purpose**: Comprehensive analysis of the Eligius Story Telling Engine to inform DSL design

---

## Executive Summary

**Eligius** is a JavaScript Story Telling Engine that triggers arbitrary functionality based on timeline providers (video, audio, RequestAnimationFrame). It's designed for:
- Video annotations
- Presentation software
- Interactive infographics

**Key Problem**: The engine is configured via verbose JSON that is "overwhelming and time consuming" to write by hand.

**Our Solution**: Create a DSL that reduces JSON verbosity by 70-80% while maintaining full Eligius compatibility.

---

## 🚀 MAJOR INSIGHT: Action Reusability Pattern

**This is the key to massive DSL code reduction beyond simple syntax improvements!**

Eligius supports **standalone actions** (declared in the `actions` array) that can be invoked from any other action using the `start-action` operation. This creates a **powerful subroutine/template system**.

### The Pattern in JSON

**Standalone Action Definition**:
```json
{
  "actions": [
    {
      "name": "FadeInElement",
      "startOperations": [
        {
          "systemName": "addClass",
          "operationData": { "className": "fade-in" }
        },
        {
          "systemName": "animate",
          "operationData": { "duration": 500 }
        }
      ],
      "endOperations": [
        {
          "systemName": "removeClass",
          "operationData": { "className": "fade-in" }
        }
      ]
    }
  ]
}
```

**Invoking from Timeline Action**:
```json
{
  "timelineActions": [
    {
      "name": "ShowTitle",
      "duration": { "start": 0, "end": 5 },
      "startOperations": [
        {
          "systemName": "selectElement",
          "operationData": { "selector": "#title" }
        },
        {
          "systemName": "startAction",
          "operationData": { "actionName": "FadeInElement" }
        }
      ]
    }
  ]
}
```

### DSL Opportunity: Function-Like Actions

This maps **perfectly** to a function-like DSL syntax:

```
// Define reusable action (like a function)
action fadeIn(element, duration = 500ms) {
  on element {
    addClass("fade-in")
    animate(duration)
  }
}

// Use in timeline events (like calling a function)
event ShowTitle at 0..5 {
  fadeIn(#title)
  fadeIn(#subtitle, 300ms)
}
```

### Massive Benefits for DSL

1. **DRY Principle**: Define once, use everywhere
2. **Parameterization**: Actions can accept element selectors and config
3. **Library Pattern**: Create reusable action libraries for common patterns
4. **Composition**: Complex behaviors from simple building blocks
5. **Code Reduction**: Instead of repeating operation sequences, call named actions

### Real-World Example

**Without Reuse** (Verbose, repetitive):
```json
// Event 1: Show title
{
  "startOperations": [
    { "systemName": "selectElement", "operationData": { "selector": "#title" }},
    { "systemName": "addClass", "operationData": { "className": "fade-in" }},
    { "systemName": "animate", "operationData": { "duration": 500 }}
  ]
}

// Event 2: Show subtitle (SAME PATTERN!)
{
  "startOperations": [
    { "systemName": "selectElement", "operationData": { "selector": "#subtitle" }},
    { "systemName": "addClass", "operationData": { "className": "fade-in" }},
    { "systemName": "animate", "operationData": { "duration": 500 }}
  ]
}

// Event 3: Show content (SAME PATTERN AGAIN!)
{
  "startOperations": [
    { "systemName": "selectElement", "operationData": { "selector": "#content" }},
    { "systemName": "addClass", "operationData": { "className": "fade-in" }},
    { "systemName": "animate", "operationData": { "duration": 500 }}
  ]
}
```

**With Reuse** (DRY, maintainable):
```
action fadeIn(element, duration = 500ms) {
  on element {
    addClass("fade-in")
    animate(duration)
  }
}

event intro at 0..3 {
  fadeIn(#title)
}

event main at 3..10 {
  fadeIn(#subtitle)
}

event content at 10..20 {
  fadeIn(#content)
}
```

**Verbosity Reduction**: ~85% (48 lines → 7 lines for the events alone!)

### DSL Design Implications

1. **Action Definitions**:
   - First-class DSL construct
   - Support parameters (element selectors, durations, etc.)
   - Support default parameter values
   - Compiled to Eligius `actions` array

2. **Action Invocation**:
   - Function-call-like syntax
   - Pass selectors and parameters
   - Compiled to `start-action` operation

3. **Standard Library**:
   - Ship DSL with built-in action library (fadeIn, slideIn, etc.)
   - Users can define custom actions
   - Encourage action sharing/reuse

4. **Compiler Strategy**:
   - Track action definitions in symbol table
   - Validate action calls (exists, correct parameters)
   - Generate proper `start-action` operations
   - Emit standalone actions to `actions` array in JSON

### This Enables

**Action Libraries** - Like a standard library:
```
// built-in.eli (standard library)
action fadeIn(element, duration = 500ms) { ... }
action slideIn(element, direction = "left", duration = 300ms) { ... }
action pulse(element, intensity = 1.0) { ... }
action shake(element) { ... }

// user-code.eli
import "built-in.eli"

event intro at 0..5 {
  fadeIn(#title)
  slideIn(#subtitle, "bottom", 400ms)
}
```

**Component-Like Reuse**:
```
action showCard(card, delay = 0ms) {
  wait(delay)
  fadeIn(card)
  slideIn(card, "bottom", 300ms)
}

event showCards at 0..10 {
  showCard(#card1, 0ms)
  showCard(#card2, 500ms)
  showCard(#card3, 1000ms)
}
```

**Conditional/Parameterized Behavior**:
```
action highlight(element, color = "yellow") {
  on element {
    setStyle("background", color)
    addClass("highlighted")
  }
}

event checkAnswer at 5..10 {
  highlight(#correct-answer, "green")
  highlight(#wrong-answer, "red")
}
```

### Conclusion

This reusability pattern is **the missing piece** that transforms our DSL from "syntactic sugar over JSON" to **"a proper programming language for Eligius"**. It enables:
- Massive code reduction (beyond just syntax)
- Better maintainability
- Action libraries and sharing
- Composition and abstraction

This should be a **core DSL feature from day one**, not a future enhancement.

---

## Core Concepts

### 1. Timeline Providers

Timelines are the central concept - they can be:
- **Video/Audio** (`mediaplayer` type): Uses `MediaElementTimelineProvider` (currently disabled)
- **Animation** (`animation` type): Uses `RequestAnimationFrameTimelineProvider`
- **Custom**: User-defined timeline providers

**Timeline Properties**:
```json
{
  "type": "animation",
  "uri": "animation-01",
  "duration": 45,
  "loop": true,
  "selector": ".timeline-div",
  "timelineActions": [...]
}
```

**Key Insight**: Timelines are the primary organizational unit. DSL should make timeline declaration simple and prominent.

---

### 2. Actions

Actions are triggered at specific timeline positions. Three types exist:

#### a) Timeline Actions (most common)
- Associated with specific timeline positions
- Have `start` and `end` times (duration)
- Execute `startOperations` when triggered, `endOperations` when ending
- Structure:
```json
{
  "name": "ShowSomething",
  "duration": {
    "start": 7,
    "end": 32
  },
  "startOperations": [...],
  "endOperations": [...]
}
```

#### b) Init Actions
- Run during engine initialization (startOperations) and teardown (endOperations)
- Used for setup/cleanup (load data, render global UI, etc.)

#### c) Event Actions
- Triggered by event broadcasts
- Only have `startOperations` (no teardown phase)

#### d) Standalone Actions (Reusable Templates)
- Declared in the `actions` array (not associated with timeline/init/events)
- Can be invoked from other actions using `start-action` operation
- Act as **reusable subroutines** or **action templates**

**CRITICAL INSIGHT**: This is a **game-changer for DSL design**!

**Key Insight**: Timeline actions are the bulk of configurations. Start/end duality is core to Eligius design. **Standalone actions enable powerful code reuse**.

---

### 3. Operations

Operations are **atomic functions** that compose into actions. They are the building blocks.

**36+ Available Operations** (from schema analysis):

**DOM Manipulation**:
- `select-element` - Select DOM element
- `create-element` - Create new element
- `remove-element` - Remove element
- `set-element-content` - Set element content
- `set-element-attributes` - Set attributes
- `clear-element` - Clear element content
- `reparent-element` - Move element to new parent
- `toggle-element` - Toggle element visibility

**Styling & Animation**:
- `add-class` - Add CSS class
- `remove-class` - Remove CSS class
- `toggle-class` - Toggle CSS class
- `set-style` - Set inline styles
- `animate` - Animate element
- `animate-with-class` - Animate using CSS class

**Controllers** (Eligius component system):
- `add-controller-to-element` - Attach controller
- `remove-controller-from-element` - Detach controller
- `get-controller-from-element` - Get controller instance
- `get-controller-instance` - Get controller by ID
- `extend-controller` - Extend controller functionality

**Data & State**:
- `set-data` - Set local data
- `set-global-data` - Set global data
- `set-operation-data` - Set operation context data
- `clear-operation-data` - Clear context data
- `remove-properties-from-operation-data` - Remove specific properties
- `get-attributes-from-element` - Extract element attributes
- `get-element-dimensions` - Get element size/position
- `get-query-params` - Parse URL query params

**Control Flow**:
- `when` / `end-when` - Conditional execution
- `otherwise` - Else branch
- `for-each` / `end-for-each` - Loop over items
- `wait` - Delay execution

**Actions & Events**:
- `start-action` - Trigger another action
- `end-action` - End an action
- `request-action` - Request action execution
- `resize-action` - Handle resize events
- `broadcast-event` - Emit event

**Utilities**:
- `load-json` - Load JSON data
- `get-import` - Get imported resource
- `log` - Console logging
- `calc` - Calculate values
- `math` - Math operations
- `invoke-object-method` - Call method on object
- `custom-function` - Execute custom function

**Key Insight**: Operations are very granular. DSL should provide high-level abstractions for common patterns while allowing escape hatch to raw operations.

---

## JSON Configuration Structure

### Top-Level Schema

Required properties:
```json
{
  "id": "uuid",
  "engine": { "systemName": "EligiusEngine" },
  "containerSelector": "#eligius-container",
  "timelineProviderSettings": {...},
  "language": "en-US",
  "layoutTemplate": "<div>...</div>",
  "availableLanguages": [{...}],
  "timelines": [{...}]
}
```

Optional properties:
- `initActions`: Setup/teardown actions
- `actions`: Reusable action templates
- `eventActions`: Event-triggered actions
- `labels`: Multilingual text labels

**Key Insight**: Most properties are boilerplate that could have sensible defaults in DSL.

---

## Verbosity Analysis

### Example: Simple "Show Title" Action

**Current JSON** (23 lines):
```json
{
  "name": "ShowTitle",
  "duration": {
    "start": 0,
    "end": 5
  },
  "startOperations": [
    {
      "systemName": "selectElement",
      "operationData": {
        "selector": "#title"
      }
    },
    {
      "systemName": "addClass",
      "operationData": {
        "className": "visible"
      }
    }
  ],
  "endOperations": [
    {
      "systemName": "removeClass",
      "operationData": {
        "className": "visible"
      }
    }
  ]
}
```

**Proposed DSL** (3-4 lines):
```
event ShowTitle at 0..5 {
  show #title with fadeIn(500ms)
}
```

**Verbosity Reduction**: ~83% (23 lines → 4 lines)

---

## Pain Points Identified

### 1. Deep Nesting
- Actions contain operations arrays
- Operations contain operationData objects
- 3-4 levels of nesting common

### 2. Repetitive Structure
- Every operation needs `systemName` + `operationData`
- Selector pattern repeated frequently
- Start/end operations often mirror each other

### 3. Boilerplate Properties
- `id`, `engine`, `containerSelector`, `language` rarely change
- Timeline provider settings verbose
- Layout template is raw HTML string

### 4. No Syntactic Sugar
- Common patterns (show/hide, add/remove class) require multiple operations
- Time ranges verbose: `{"start": 0, "end": 5}` vs `0..5`
- Element selection always needs full operation

### 5. Poor Readability
- Hard to see timeline flow at a glance
- Event names buried in structure
- Time relationships not obvious

---

## DSL Design Goals (Based on Analysis)

### 1. Timeline-First Syntax
```
timeline video from "presentation.mp4"
timeline audio from "narration.mp3"
timeline raf
```

### 2. Concise Event Declaration
```
event intro at 0..5 {
  // actions here
}
```

### 3. High-Level Action Abstractions
```
show #title with fadeIn(500ms)
hide #subtitle with fadeOut(300ms)
animate #logo with spin(1s)
trigger startAnimation on #diagram
```

### 4. Sensible Defaults
- Auto-generate UUIDs
- Default container selector
- Default language settings
- Default engine configuration

### 5. CSS-Like Selectors
```
#id           → select by ID
.class        → select by class
element       → select by tag
[attr=value]  → select by attribute (future)
```

### 6. Familiar Time Syntax
```
at 0..5       → range syntax
at 10         → single point (future)
```

---

## DSL-to-JSON Mapping Examples

### Timeline Declaration

**DSL**:
```
timeline video from "video.mp4"
```

**JSON**:
```json
{
  "timelines": [{
    "type": "mediaplayer",
    "uri": "video.mp4",
    "duration": null,
    "selector": "#video-element",
    "timelineActions": []
  }]
}
```

### Event with Actions

**DSL**:
```
event intro at 0..5 {
  show #title with fadeIn(500ms)
  show #subtitle with slideIn(300ms, "left")
}
```

**JSON**:
```json
{
  "name": "intro",
  "duration": { "start": 0, "end": 5 },
  "startOperations": [
    {
      "systemName": "selectElement",
      "operationData": { "selector": "#title" }
    },
    {
      "systemName": "addClass",
      "operationData": { "className": "fade-in" }
    },
    {
      "systemName": "animate",
      "operationData": { "duration": 500 }
    },
    {
      "systemName": "selectElement",
      "operationData": { "selector": "#subtitle" }
    },
    {
      "systemName": "addClass",
      "operationData": { "className": "slide-in-left" }
    },
    {
      "systemName": "animate",
      "operationData": { "duration": 300 }
    }
  ],
  "endOperations": [
    {
      "systemName": "selectElement",
      "operationData": { "selector": "#title" }
    },
    {
      "systemName": "removeClass",
      "operationData": { "className": "fade-in" }
    },
    {
      "systemName": "selectElement",
      "operationData": { "selector": "#subtitle" }
    },
    {
      "systemName": "removeClass",
      "operationData": { "className": "slide-in-left" }
    }
  ]
}
```

---

## Compiler Design Implications

### 1. Action Definitions & Symbol Table
**CRITICAL**: The compiler must maintain a symbol table of defined actions:

- Track action names, parameters, and their operation sequences
- Validate action calls (does action exist? correct parameter count/types?)
- Generate `actions` array in Eligius JSON
- Handle parameter substitution when generating operations
- Support default parameter values

**Example**:
```
action fadeIn(element, duration = 500ms) { ... }
```
→ Symbol table entry: `fadeIn(selector, number) → operations`

### 2. Action Invocation Translation
When compiling action calls:

```
fadeIn(#title, 300ms)
```
→ Generates:
```json
{
  "systemName": "startAction",
  "operationData": {
    "actionName": "fadeIn",
    "parameters": {
      "element": "#title",
      "duration": 300
    }
  }
}
```

### 3. Built-in Action Abstractions
The DSL must translate high-level built-in actions into operation sequences:

- `show #element` → `selectElement` + `addClass("visible")` / `removeClass("visible")`
- `hide #element` → `selectElement` + `removeClass("visible")` / `addClass("visible")`
- `animate #element with X` → `selectElement` + `animate` with parameters
- `trigger action on #element` → `selectElement` + `broadcastEvent` or `startAction`

**OR** these could be **pre-defined actions in a standard library** rather than compiler built-ins!

### 4. Context Management
Operations share context via `operationData`. Compiler must:
- Track selected element across operations
- Generate proper operation sequences
- Manage start vs end operation generation
- Handle parameter passing to action operations

### 5. Type Checking
Compiler should validate:
- Timeline types (video, audio, raf)
- Time ranges (start < end, non-negative)
- Selector syntax validity
- Action parameter types (selector vs number vs string)
- **Action existence** (undefined action calls)
- **Parameter arity** (correct number of arguments)

### 6. Optimization Opportunities
- Merge adjacent `selectElement` operations
- Deduplicate identical operations
- Remove unreachable events (start > timeline duration)
- **Inline small/frequently-called actions** (optional - for performance)
- **Dead action elimination** (actions defined but never called)

---

## Next Steps for DSL Implementation

### Phase 1: Core Grammar (MVP)
- Timeline declarations
- Event declarations with time ranges
- **🚀 PRIORITY: Reusable action definitions** (function-like syntax)
- **🚀 PRIORITY: Action invocation** (call actions from events)
- Basic actions: show, hide, animate, trigger
- Selector syntax: #id, .class, element
- Parameter support for actions (selectors, durations, etc.)

### Phase 2: Advanced Features
- **Standard action library** (built-in fadeIn, slideIn, etc.)
- Import/module system for action libraries
- Custom operations escape hatch
- Init actions
- Event actions
- Conditional logic
- Action parameters with defaults

### Phase 3: Optimization
- Smart operation merging
- Dead code elimination
- Context optimization
- Inline frequently-called actions (optional optimization)

---

## Questions & Decisions Needed

### Q1: Should DSL support all 36+ operations?
**Decision**: Start with high-level abstractions (show, hide, animate, trigger). Provide escape hatch for raw operations.

### Q2: How to handle complex operation sequences?
**Decision**: DSL provides common patterns. For complex logic, allow inline operation blocks:
```
event complex at 0..10 {
  operations {
    // raw Eligius operations
  }
}
```

### Q3: How to handle multilingual labels?
**Decision**: Phase 2 feature. For MVP, focus on timeline + events.

### Q4: Default values strategy?
**Decision**: Provide sensible defaults for:
- Container selector: "#eligius-root"
- Language: "en-US"
- Engine: Auto-configured
- UUIDs: Auto-generated

---

## Conclusion

Eligius is a well-structured engine with clear concepts (timelines, actions, operations). The JSON verbosity stems from:
1. Deep nesting (3-4 levels)
2. Repetitive boilerplate (`systemName`, `operationData`)
3. Lack of syntactic sugar for common patterns

Our DSL can achieve the 70-80% verbosity reduction goal by:
1. Timeline-first declarative syntax
2. High-level action abstractions
3. CSS-like selectors
4. Range syntax for times
5. Sensible defaults for boilerplate

The compiler will be straightforward: parse DSL → generate operation sequences → emit JSON. The main complexity is in operation sequence generation for each high-level action.

---

**Status**: Research phase complete ✅
**Next**: Design concrete DSL syntax examples and grammar rules
