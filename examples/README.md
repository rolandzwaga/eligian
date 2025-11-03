# Eligian Examples

This directory contains a comprehensive demonstration of all Eligian language features.

## Files

### Main Demo
- **[demo.eligian](demo.eligian)** - Complete presentation showcasing ALL language features:
  - Asset imports (CSS, HTML, libraries)
  - Constants (all Eligius types: string, number, boolean, array, object)
  - Custom actions with JSDoc documentation
  - Type annotations and type inference
  - Control flow (if/else, for loops, break/continue)
  - Timeline events with operations
  - Library imports and action calls
  - Stagger animations
  - Private actions

### Supporting Assets
- **[demo-styles.css](demo-styles.css)** - CSS styles for the demo
- **[demo-layout.html](demo-layout.html)** - HTML layout structure

### Library Files
Located in `libraries/`:

- **[animations.eligian](libraries/animations.eligian)** - Reusable animation actions:
  - `fadeIn()`, `fadeOut()` - Opacity animations
  - `slideInLeft()`, `slideInRight()`, `slideOut()` - Transform animations
  - `scaleIn()`, `rotate()` - Scale and rotation effects
  - Private helper `resetTransforms()`

- **[utils.eligian](libraries/utils.eligian)** - Safe utility actions:
  - `safeAddClass()`, `safeRemoveClass()`, `safeToggleClass()` - Class manipulation helpers
  - `safeSetContent()` - Content setting helper
  - `batchAddClass()`, `batchRemoveClass()` - Batch operations on multiple elements
  - Private helper `debugLog()`

## Running the Demo

1. Open `demo.eligian` in VS Code with the Eligian extension installed
2. Use the "Eligian: Preview Timeline" command (Ctrl+K V / Cmd+K V)
3. Watch the presentation play through all features

## Language Features Demonstrated

| Feature | Location in demo.eligian |
|---------|--------------------------|
| **Asset Imports** | Lines 17-23 |
| **Constants** | Lines 30-37 |
| **Type Annotations** | All action definitions (lines 49+) |
| **JSDoc Comments** | All actions (preceding definitions) |
| **If/Else** | `validateInput()`, `showItems()` actions |
| **For Loops** | `showItems()`, `searchItems()` actions |
| **Break/Continue** | `searchItems()`, timeline line 227 |
| **Private Actions** | `resetAll()` (line 146) |
| **Library Imports** | Lines 22-23, used throughout timeline |
| **Timeline Events** | Lines 156-270 |
| **Stagger Animations** | Timeline line 180 |
| **Type Inference** | All actions (params without explicit types) |

## Best Practices Shown

1. **Modular Design**: Reusable actions in separate library files
2. **Type Safety**: All parameters typed for compile-time validation
3. **Documentation**: JSDoc comments on all public actions
4. **Valid Operations**: All examples use only valid Eligius operations
5. **Encapsulation**: Private actions for internal helpers
6. **Naming Conventions**: Clear, descriptive names for all entities
7. **Code Organization**: Logical sections with comments

## Previous Examples (Removed)

The examples directory previously contained 35+ individual test files. These have been consolidated into the single comprehensive demo to reduce clutter while maintaining coverage of all language features.
