# Eligian Language Specification

**Version**: 1.0.0
**Last Updated**: 2025-10-21
**Status**: Living Document - Updated with every language feature change

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Lexical Structure](#2-lexical-structure)
3. [Program Structure](#3-program-structure)
4. [Actions](#4-actions)
5. [Timelines](#5-timelines)
6. [Expressions](#6-expressions)
7. [Statements](#7-statements)
8. [Type System](#8-type-system)
9. [Scoping and References](#9-scoping-and-references)
10. [Compilation Model](#10-compilation-model)

---

## 1. Introduction

### 1.1 Purpose

Eligian is a domain-specific language (DSL) for creating timeline-based interactive presentations using the Eligius Story Telling Engine. It provides a concise, declarative syntax that compiles to Eligius JSON configuration.

### 1.2 Design Goals

- **Concise**: 70-80% reduction in verbosity compared to raw JSON
- **Type-safe**: Compile-time type checking with optional annotations
- **Timeline-first**: Syntax optimized for timeline-based thinking
- **Familiar**: Borrows conventions from JavaScript/TypeScript
- **IDE-friendly**: Full autocomplete and validation support

### 1.3 File Extension

Eligian source files use the `.eligian` extension.

---

## 2. Lexical Structure

### 2.1 Comments

```eligian
// Single-line comment

/* Multi-line
   comment */
```

### 2.2 Identifiers

Identifiers start with a letter or underscore, followed by letters, digits, or underscores:

```
ID := [_a-zA-Z][\w_]*
```

**Examples**: `fadeIn`, `_private`, `myAction2`, `VIDEO_TIMELINE`

### 2.3 Literals

#### String Literals

```eligian
"double quoted string"
'single quoted string'
"escaped quote: \"hello\""
```

#### Number Literals

```eligian
42          // Integer
3.14        // Decimal
0.5         // Decimal starting with zero
```

**Note**: Numbers are always parsed as JavaScript `number` type (IEEE 754 double-precision).

#### Boolean Literals

```eligian
true
false
```

#### Null Literal

```eligian
null
```

### 2.4 Keywords

Reserved keywords that cannot be used as identifiers:

```
action      endable     timeline    using       from
at          sequence    stagger     for         if
else        break       continue    const       in
true        false       null        with
```

### 2.5 Time Units

```eligian
ms          // Milliseconds
s           // Seconds
m           // Minutes
h           // Hours
```

**Default**: If no unit is specified, value is treated as milliseconds.

---

## 3. Program Structure

### 3.1 Program Elements

An Eligian program consists of zero or more program elements:

```eligian
Program := (ActionDefinition | Timeline | VariableDeclaration)*
```

**Example**:

```eligian
// Global variable
const duration = 1000

// Action definition
action fadeIn(selector: string) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, duration)
]

// Timeline
timeline "main" in "#app" using raf {
  at 0s..2s { fadeIn("#title") }
}
```

### 3.2 Execution Model

1. **Global variables** are evaluated first and added to `$globaldata` scope
2. **Actions** are registered (not executed until called)
3. **Timelines** define event schedules (executed by Eligius runtime)

---

## 4. Actions

### 4.1 Regular Actions

Regular actions contain a sequence of operations:

```eligian
action <name> [
  <operation>*
]

action <name>(<parameters>) [
  <operation>*
]
```

**Example**:

```eligian
action showElement [
  selectElement("#box")
  addClass("visible")
]

action fadeIn(selector: string, duration: number) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]
```

### 4.2 Endable Actions

Endable actions have separate start and end operation sequences:

```eligian
endable action <name> [
  <start-operations>*
] [
  <end-operations>*
]

endable action <name>(<parameters>) [
  <start-operations>*
] [
  <end-operations>*
]
```

**Example**:

```eligian
endable action showThenHide [
  selectElement(".overlay")
  addClass("visible")
] [
  removeClass("visible")
]
```

**Compilation**: Start operations execute at event start time, end operations at event end time.

### 4.3 Parameters

#### Syntax

```eligian
Parameter := <name> | <name> : <type>
```

#### Parameter Types

- `string` - String literals, selectors
- `number` - Numeric values (durations, coordinates, etc.)
- `boolean` - Boolean values
- `object` - Object literals
- `array` - Array literals

**Example**:

```eligian
action animateElement(
  selector: string,
  duration: number,
  easing: string
) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration, $operationdata.easing)
]
```

#### Parameter Access

Inside action bodies, parameters are accessed via `$operationdata.<paramName>`:

```eligian
action demo(value: number) [
  // ✅ Correct
  wait($operationdata.value)

  // ❌ Wrong - bare identifier is cross-reference
  wait(value)  // Tries to reference parameter named 'value'
]
```

---

## 5. Timelines

### 5.1 Timeline Declaration

```eligian
timeline <name> in <containerSelector> using <provider> [from <source>] {
  <events>*
}
```

**Parameters**:
- `name`: String literal - timeline identifier
- `containerSelector`: String literal - CSS selector for container element
- `provider`: Timeline provider type
- `source`: (Optional) Source file for video/audio providers

**Providers**:
- `video` - Video element (requires `from` source)
- `audio` - Audio element (requires `from` source)
- `raf` - RequestAnimationFrame loop (no source)
- `custom` - Custom provider (no source)

**Example**:

```eligian
timeline "presentation" in ".slide-container" using video from "slides.mp4" {
  at 0s..5s { showTitle() }
  at 5s..10s { showContent() }
}

timeline "animation" in "#canvas" using raf {
  at 0s..2s { fadeIn("#box") }
}
```

### 5.2 Timeline Events

#### Timed Events

```eligian
at <start>..<end> { <actionCall> }
at <start>..<end> [ <start-ops>* ] [ <end-ops>* ]
```

**Examples**:

```eligian
// Named action call
at 0s..5s { fadeIn("#title") }

// Inline endable action
at 5s..10s [
  selectElement("#content")
  addClass("visible")
] [
  removeClass("visible")
]
```

#### Sequence Blocks

Sequential events with automatic time calculation:

```eligian
sequence {
  <actionCall> for <duration>
  <actionCall> for <duration>
  ...
}
```

**Example**:

```eligian
sequence {
  intro() for 5s
  main() for 10s
  outro() for 3s
}

// Compiles to:
// at 0s..5s { intro() }
// at 5s..15s { main() }
// at 15s..18s { outro() }
```

#### Stagger Blocks

Staggered events with incremental start times:

```eligian
stagger <delay> <items> with <action> for <duration>

stagger <delay> <items> for <duration> [
  <start-ops>*
] [
  <end-ops>*
]
```

**Example**:

```eligian
stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s

// Compiles to:
// at 0s..2s { fadeIn(".item-1") }
// at 0.2s..2.2s { fadeIn(".item-2") }
// at 0.4s..2.4s { fadeIn(".item-3") }
```

### 5.3 Time Expressions

#### Time Literals

```eligian
42          // 42 milliseconds (default unit)
500ms       // 500 milliseconds
2s          // 2 seconds
1.5m        // 1.5 minutes
0.5h        // 0.5 hours
```

#### Relative Time Literals

```eligian
+2s         // 2 seconds after previous event ends
+500ms      // 500 milliseconds after previous event ends
+0s         // Immediately after previous event ends
```

#### Time Arithmetic

```eligian
5s + 2s     // 7 seconds
10s - 3s    // 7 seconds
2s * 3      // 6 seconds
10s / 2     // 5 seconds
```

#### Time Ranges

```eligian
at 0s..5s        // From 0s to 5s
at 1s..1s+2s     // From 1s to 3s (using arithmetic)
at +0s..+2s      // Relative timing
```

---

## 6. Expressions

### 6.1 Literals

```eligian
42                          // Number
"hello"                     // String
true, false                 // Boolean
null                        // Null
{opacity: 1, scale: 2}      // Object
[1, 2, 3]                   // Array
```

### 6.2 Object Literals

```eligian
{ <key>: <value>, ... }
```

Keys can be identifiers or strings:

```eligian
{opacity: 1, color: "red"}
{"font-size": "16px", margin: 10}
```

### 6.3 Array Literals

```eligian
[ <value>, <value>, ... ]
```

**Example**:

```eligian
[1, 2, 3]
["red", "green", "blue"]
[$scope.item1, $scope.item2]
```

### 6.4 Binary Expressions

#### Arithmetic

```eligian
+ - * / % **
```

#### Comparison

```eligian
< <= > >= == !=
```

#### Logical

```eligian
&& ||
```

**Example**:

```eligian
if ($operationdata.count > 5 && $operationdata.enabled) {
  addClass("active")
}
```

### 6.5 Unary Expressions

```eligian
-<expr>     // Negation
!<expr>     // Logical NOT
```

---

## 7. Statements

### 7.1 Operation Calls

```eligian
<operationName>(<arg1>, <arg2>, ...)
```

**Examples**:

```eligian
selectElement("#box")
animate({opacity: 1}, 500)
addClass("visible")
setStyle({color: "red", fontSize: "16px"})
```

**Note**: The grammar is operation-agnostic. Valid operations are defined by the Eligius operation registry.

### 7.2 Variable Declarations

```eligian
const <name> = <expression>
```

**Scope**:
- **Global scope** (top-level): Added to `$globaldata.<name>`
- **Action scope**: Added to `$scope.variables.<name>`, accessed via `@<name>`

**Examples**:

```eligian
// Global variable
const duration = 1000

// Action-scoped variable
action demo() [
  const speed = 500
  wait(@speed)  // Access via @speed
]
```

### 7.3 If/Else Statements

```eligian
if (<condition>) {
  <operations>*
}

if (<condition>) {
  <operations>*
} else {
  <operations>*
}
```

**Example**:

```eligian
if ($operationdata.enabled) {
  addClass("active")
} else {
  removeClass("active")
}
```

**Compilation**: Compiles to `when()` / `otherwise()` / `endWhen()` operations.

### 7.4 For Loops

```eligian
for (<itemName> in <collection>) {
  <operations>*
}
```

**Example**:

```eligian
for (item in $operationdata.items) {
  selectElement(".template")
  setElementContent(@@currentItem)
}
```

**Compilation**: Compiles to `forEach()` / `endForEach()` operations.

**Iterator Access**: Inside loop, use `@@currentItem`, `@@loopIndex`, `@@loopLength` system properties.

### 7.5 Break/Continue Statements

```eligian
break       // Exit loop immediately
continue    // Skip to next iteration
```

**Example**:

```eligian
for (item in items) {
  if (@@currentItem.skip) {
    continue
  }
  if (@@currentItem.stop) {
    break
  }
  processItem(@@currentItem)
}
```

**Compilation**: `break` → `breakForEach()`, `continue` → `continueForEach()`

**Validation**: Can only be used inside `for` loops.

---

## 8. Type System

### 8.1 Type Annotations

Type annotations are **optional** and used for compile-time type checking:

```eligian
action demo(selector: string, duration: number) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]
```

### 8.2 Supported Types

| Type | Description | Examples |
|------|-------------|----------|
| `string` | String literals, selectors | `"hello"`, `"#box"` |
| `number` | Numeric values | `42`, `3.14`, `500` |
| `boolean` | Boolean values | `true`, `false` |
| `object` | Object literals | `{opacity: 1}` |
| `array` | Array literals | `[1, 2, 3]` |

### 8.3 Type Checking

Type checking occurs at:

1. **Operation calls**: Arguments validated against operation parameter types
2. **Action calls**: Arguments validated against action parameter types
3. **Variable assignments**: (Future feature - not yet implemented)

**Example**:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]

timeline "test" in "#app" using raf {
  at 0s..1s { fadeIn("#box", 500) }          // ✅ Correct
  at 1s..2s { fadeIn(123, "slow") }          // ❌ ERROR: Both args wrong type
  at 2s..3s { fadeIn("#box", "slow") }       // ❌ ERROR: duration expects number
}
```

### 8.4 Type Inference

**Current**: Parameters without type annotations remain untyped (no validation).

**Future (User Story 3)**: Types will be inferred from usage patterns:

```eligian
action autoInfer(selector, duration) [
  selectElement($operationdata.selector)  // selector inferred as string
  animate({opacity: 1}, $operationdata.duration)  // duration inferred as number
]
```

### 8.5 Gradual Typing

Type checking is **opt-in**. Untyped code works unchanged:

```eligian
// ✅ No type annotations - no type checking
action oldStyle(selector, duration) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]

// ✅ Mixed typed/untyped parameters
action mixed(selector: string, duration) [
  selectElement($operationdata.selector)  // selector type-checked
  animate({opacity: 1}, $operationdata.duration)  // duration not checked
]
```

---

## 9. Scoping and References

### 9.1 Scopes

Eligian has three runtime scopes (mapped to Eligius scopes):

| Syntax | Eligius Scope | Purpose |
|--------|---------------|---------|
| `$globaldata.<name>` | `globaldata` | Global variables (`const` at top-level) |
| `$operationdata.<name>` | `operationdata` | Action parameters |
| `$scope.<property>` | `scope` | Runtime state (loop iterators, etc.) |

### 9.2 Property Chain References

Access runtime data with `$` prefix:

```eligian
$globaldata.theme
$operationdata.selector
$scope.currentItem
$scope.currentItem.name
```

**Compilation**: Compiles to property chain strings for Eligius runtime.

### 9.3 System Property References

Access system scope properties with `@@` prefix:

```eligian
@@currentItem       // $scope.currentItem
@@loopIndex         // $scope.loopIndex
@@loopLength        // $scope.loopLength
```

**Available in**: `for` loops

### 9.4 Variable References

Access action-scoped variables with `@` prefix:

```eligian
action demo() [
  const speed = 500
  wait(@speed)           // ✅ Correct
  wait($scope.variables.speed)  // ✅ Also correct (explicit)
]
```

**Compilation**: `@name` → `$scope.variables.name`

### 9.5 Parameter References

**Inside action bodies**: Parameters are accessed via `$operationdata.<name>`:

```eligian
action fadeIn(selector: string, duration: number) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, $operationdata.duration)
]
```

**NOT** as bare identifiers (bare identifiers are cross-references to parameter declarations).

---

## 10. Compilation Model

### 10.1 Compilation Pipeline

1. **Parse**: Langium parses `.eligian` source to AST
2. **Validate**: Semantic validation (scoping, name resolution)
3. **Type Check**: Typir validates type annotations (if present)
4. **Transform**: AST → Eligius JSON configuration
5. **Optimize**: Dead code elimination, constant folding
6. **Emit**: Output JSON file

### 10.2 Output Format

Eligian compiles to Eligius JSON configuration:

**Input** (Eligian):

```eligian
action fadeIn(selector: string) [
  selectElement($operationdata.selector)
  animate({opacity: 1}, 1000)
]

timeline "main" in "#app" using raf {
  at 0s..2s { fadeIn("#title") }
}
```

**Output** (Eligius JSON):

```json
{
  "actions": {
    "fadeIn": {
      "operations": [
        {
          "type": "selectElement",
          "parameters": ["$operationdata.selector"]
        },
        {
          "type": "animate",
          "parameters": [{"opacity": 1}, 1000]
        }
      ]
    }
  },
  "timeline": {
    "name": "main",
    "container": "#app",
    "provider": "raf",
    "events": [
      {
        "start": 0,
        "end": 2000,
        "action": "fadeIn",
        "parameters": {"selector": "#title"}
      }
    ]
  }
}
```

### 10.3 Syntactic Sugar Transformations

| Eligian Syntax | Compiles To |
|----------------|-------------|
| `if (cond) { ops }` | `when(cond)`, ops, `endWhen()` |
| `if (cond) { a } else { b }` | `when(cond)`, a, `otherwise()`, b, `endWhen()` |
| `for (item in list) { ops }` | `forEach(list)`, ops, `endForEach()` |
| `break` | `breakForEach()` |
| `continue` | `continueForEach()` |
| `@@currentItem` | `"$scope.currentItem"` (string) |
| `@varName` | `"$scope.variables.varName"` (string) |

---

## Appendix A: Grammar Summary

```
Program         := (ActionDefinition | Timeline | VariableDeclaration)*

ActionDefinition := RegularActionDefinition | EndableActionDefinition
RegularActionDefinition := 'action' ID '(' Parameters? ')' '[' Operations ']'
EndableActionDefinition := 'endable' 'action' ID '(' Parameters? ')'
                          '[' Operations ']' '[' Operations ']'

Parameter       := ID (':' TypeAnnotation)?
TypeAnnotation  := 'string' | 'number' | 'boolean' | 'object' | 'array'

Timeline        := 'timeline' STRING 'in' STRING 'using' Provider ('from' STRING)?
                   '{' TimelineEvent* '}'
Provider        := 'video' | 'audio' | 'raf' | 'custom'

TimelineEvent   := TimedEvent | SequenceBlock | StaggerBlock
TimedEvent      := 'at' TimeRange (NamedAction | InlineAction)
SequenceBlock   := 'sequence' '{' SequenceItem* '}'
StaggerBlock    := 'stagger' TimeExpr Expression 'with' ActionCall 'for' TimeExpr
                 | 'stagger' TimeExpr Expression 'for' TimeExpr
                   '[' Operations ']' '[' Operations ']'

TimeRange       := TimeExpression '..' TimeExpression
TimeExpression  := TimeLiteral | RelativeTimeLiteral | BinaryTimeExpr
TimeLiteral     := NUMBER TimeUnit?
RelativeTimeLiteral := '+' NUMBER TimeUnit?
TimeUnit        := 'ms' | 's' | 'm' | 'h'

Operations      := (OperationCall | IfStatement | ForStatement |
                   VariableDeclaration | BreakStatement | ContinueStatement)*

IfStatement     := 'if' '(' Expression ')' '{' Operations '}'
                   ('else' '{' Operations '}')?
ForStatement    := 'for' '(' ID 'in' Expression ')' '{' Operations '}'
BreakStatement  := 'break'
ContinueStatement := 'continue'
VariableDeclaration := 'const' ID '=' Expression

OperationCall   := ID '(' Arguments? ')'

Expression      := Literal | ObjectLiteral | ArrayLiteral |
                   PropertyChainRef | SystemPropertyRef |
                   VariableRef | ParameterRef | BinaryExpr | UnaryExpr

PropertyChainRef := '$' Scope ('.' ID)+
Scope           := 'globaldata' | 'operationdata' | 'scope'
SystemPropertyRef := '@@' ID
VariableRef     := '@' ID
ParameterRef    := ID  (cross-reference to Parameter)
```

---

## Appendix B: Reserved Identifiers

System property names (used with `@@` prefix):

- `currentItem` - Current loop item
- `loopIndex` - Current loop index
- `loopLength` - Total loop length

Standard scope names (used with `$` prefix):

- `globaldata` - Global scope
- `operationdata` - Action parameter scope
- `scope` - Runtime scope

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-21 | Initial specification based on current grammar |

---

**End of Specification**
