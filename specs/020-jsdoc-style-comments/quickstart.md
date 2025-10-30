# Quickstart: JSDoc-Style Documentation Comments

**Feature**: 020-jsdoc-style-comments
**Audience**: Eligian DSL developers
**Purpose**: Learn to document custom actions with JSDoc comments in 5 minutes

---

## What You'll Learn

1. How to write JSDoc documentation for actions
2. How to auto-generate JSDoc templates
3. How to view documentation on hover

**Time**: 5 minutes

---

## Step 1: Auto-Generate JSDoc Template

Place your cursor on the line **directly above** an action definition and type `/**`:

```eligian
/**|  // <-- Type '/**' then press Enter

action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**Result**: The template auto-generates with inferred types:

```eligian
/**
 * |  // <-- Cursor positioned here for you to type description
 * @param {string} selector
 * @param {number} duration
 */
action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**What happened**:
- Types inferred from parameter annotations (`string`) and usage analysis (`number` from animate operation)
- Template includes all parameters in correct order
- Cursor positioned to start typing description immediately

---

## Step 2: Fill in Documentation

Add a description and parameter details:

```eligian
/**
 * Fades in an element by animating its opacity from 0 to 1
 * @param {string} selector - CSS selector for the target element
 * @param {number} duration - Animation duration in milliseconds
 */
action fadeIn(selector: string, duration) [
  selectElement(selector)
  animate({opacity: 1}, duration)
]
```

**JSDoc Syntax**:
- **Description**: Any text between `/**` and first `@param` tag
- **@param**: `@param {type} name - description`
  - `{type}` - Optional, auto-generated if you used template
  - `name` - Parameter name (must match action parameter)
  - `- description` - Optional description text after parameter name

**Markdown Supported**:
- **Bold**: `**text**`
- *Italic*: `*text*`
- `Code`: `` `code` ``
- Links: `[text](url)`

---

## Step 3: View Documentation on Hover

Hover your mouse over any invocation of your documented action:

```eligian
at 0s..5s fadeIn("#box", 1000)
            ^^^^^  // <-- Hover here
```

**Hover Tooltip Displays**:
```
──────────────────────────────────────
fadeIn

Fades in an element by animating its
opacity from 0 to 1

Parameters:
• selector (string) - CSS selector for
  the target element
• duration (number) - Animation duration
  in milliseconds
──────────────────────────────────────
```

**What's shown**:
- Action name as heading
- Full description from JSDoc
- Each parameter with type and description
- Markdown rendered (bold, italic, code spans)

---

## Common Use Cases

### Use Case 1: Simple Action (No Parameters)

```eligian
/**
 * Initializes the animation engine
 */
action init() [
  setupEngine()
]
```

**Template generation**: Only creates description placeholder (no `@param` tags)

---

### Use Case 2: Untyped Parameters

```eligian
/**|  // <-- Type '/**' above action with untyped params

action processData(input, format) [
  parseInput(input)
  convertToFormat(format)
]
```

**Auto-generated template**:
```eligian
/**
 *
 * @param {unknown} input  // <-- Type inferred as 'unknown'
 * @param {string} format  // <-- Type inferred from convertToFormat operation
 */
action processData(input, format) [
  parseInput(input)
  convertToFormat(format)
]
```

**What happened**:
- `input` type couldn't be inferred → `unknown` used
- `format` type inferred from `convertToFormat` operation metadata
- You can manually change `{unknown}` to the correct type

---

### Use Case 3: Partial Documentation

You can document just the description, no parameters:

```eligian
/**
 * Handles user authentication and session management
 */
action authenticate(username, password) [
  validateCredentials(username, password)
  createSession()
]
```

**Result**: Hover shows description but no parameter details (acceptable pattern)

---

### Use Case 4: Complex Parameters

```eligian
/**
 * Animates an element with custom easing and callbacks
 * @param {string} selector - CSS selector (e.g., `#box`, `.button`)
 * @param {object} options - Animation options object with `duration`, `easing`, `onComplete`
 */
action animateElement(selector, options) [
  selectElement(selector)
  animate(options)
]
```

**Tip**: Use inline code spans `` `like this` `` to highlight values or properties

---

## Tips & Best Practices

### ✅ DO:
- Place JSDoc **directly above** the action (no blank lines)
- Use auto-generation for consistency (type `/**`)
- Describe **what** the action does, not **how** it does it
- Include examples in descriptions when helpful
- Use markdown for clarity (bold, italic, code spans)

### ❌ DON'T:
- Don't add blank lines between JSDoc and action
- Don't document implementation details (those belong in code comments)
- Don't duplicate parameter names in descriptions ("selector: the selector" is redundant)

### 💡 WHEN TO DOCUMENT:
- **Always**: Public/reusable actions used across multiple files
- **Often**: Complex actions with non-obvious parameters
- **Sometimes**: Simple actions if behavior isn't clear from name
- **Never required**: Documentation is optional - undocumented actions work fine

---

## Troubleshooting

### Problem: Template doesn't generate when I type `/**`

**Cause**: Cursor not on line directly above action
**Solution**: Make sure there's no blank line between `/**` and action definition

```eligian
/**  // <-- Cursor here
     // <-- NO BLANK LINE ALLOWED
action foo() [...]
```

---

### Problem: Parameter types show as `{unknown}`

**Cause**: Type inference couldn't determine type from usage
**Solution**: Either:
1. Manually replace `{unknown}` with correct type
2. Add type annotation to parameter: `action foo(bar: string)`
3. Use parameter in operation that provides type hint

---

### Problem: Hover doesn't show documentation

**Possible causes**:
1. **JSDoc is malformed** - Check for syntax errors (missing closing `*/`, typos)
2. **Not hovering over action invocation** - Hover must be on action call, not definition
3. **JSDoc not directly above action** - Remove blank lines between comment and action

**Debug**: Check if JSDoc comment appears in gray in editor (Langium recognizes it)

---

### Problem: Parameter description is too long for tooltip

**Solution**: Keep descriptions concise (1-2 sentences). Use links for detailed docs:

```eligian
/**
 * Processes user input with validation
 * @param {string} input - User input string. See [validation docs](...)
 */
```

---

## Next Steps

**You now know how to**:
- ✅ Auto-generate JSDoc templates with `/**`
- ✅ Write JSDoc descriptions and `@param` tags
- ✅ View documentation in hover tooltips

**Advanced topics**:
- See full JSDoc specification in `LANGUAGE_SPEC.md`
- Review examples in `examples/jsdoc-demo.eligian`
- Explore type inference system for better auto-generation

---

## Complete Example

Here's a fully documented action with all features:

```eligian
/**
 * Slides an element in from off-screen with bounce effect
 *
 * The animation uses a **cubic-bezier** easing function to create a natural
 * bouncing motion. The element must have `position: relative` or `absolute`.
 *
 * @param {string} selector - CSS selector for target element (e.g., `#sidebar`)
 * @param {string} direction - Slide direction: `'left'`, `'right'`, `'top'`, or `'bottom'`
 * @param {number} duration - Animation duration in milliseconds (recommended: 300-800ms)
 * @param {boolean} fadeIn - Whether to fade in during slide (default: `false`)
 */
action slideInWithBounce(selector, direction: string, duration, fadeIn) [
  selectElement(selector)
  setPosition(direction)
  animate({
    transform: "translate(0, 0)",
    opacity: fadeIn ? 1 : 0
  }, duration, "cubic-bezier(0.68, -0.55, 0.265, 1.55)")
]
```

**Hover result shows**:
- Clear description with formatting (bold, code spans)
- All 4 parameters documented with types and helpful examples
- Recommendations for parameter values (duration range)
- Default value documented for `fadeIn`

---

## Summary

**Workflow**:
1. Type `/**` above action → Template auto-generates
2. Fill description and parameter details → Documentation stored
3. Hover over action call → Documentation displays in tooltip

**Time saved**: ~30 seconds per action (no manual typing of boilerplate)

**Benefit**: Other developers understand your actions without reading implementation

Happy documenting! 🎉
