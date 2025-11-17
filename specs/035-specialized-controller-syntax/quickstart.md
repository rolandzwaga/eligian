# Quickstart Guide: Specialized Controller Syntax

**Feature**: 035-specialized-controller-syntax
**Date**: 2025-11-17
**Audience**: Eligian DSL developers

## Overview

This guide shows how to use the specialized `addController` syntax to add Eligius controllers to elements with concise, validated syntax.

**Before** (verbose multi-operation sequence):
```eligian
{
  "systemName": "getControllerInstance",
  "operationData": {"systemName": "LabelController"}
},
{
  "systemName": "addControllerToElement",
  "operationData": {"labelId": "mainTitle"}
}
```

**After** (specialized syntax):
```eligian
addController('LabelController', "mainTitle")
```

---

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [All 8 Controllers](#all-8-controllers)
3. [Validation and Errors](#validation-and-errors)
4. [IDE Support](#ide-support)
5. [Migration Guide](#migration-guide)
6. [Advanced Scenarios](#advanced-scenarios)

---

## Basic Usage

### Syntax

```eligian
addController('ControllerName', param1, param2, ...)
```

- **First argument**: Controller class name (string literal, e.g., `'LabelController'`)
- **Subsequent arguments**: Controller-specific parameters (order matters, inferred from metadata)

### Example: LabelController

```eligian
labels "./labels.json"

timeline "Welcome" in "#app" using raf {
  at 0s selectElement("#title") {
    // Add label controller to display translated text
    addController('LabelController', "mainTitle")
  }
}
```

**Compiles to**:
```json
{
  "systemName": "getControllerInstance",
  "operationData": {"systemName": "LabelController"}
},
{
  "systemName": "addControllerToElement",
  "operationData": {"labelId": "mainTitle"}
}
```

---

## All 8 Controllers

### 1. LabelController

**Purpose**: Renders translated label text in an element, listens for language changes.

**Parameters**:
- `labelId` (labelId, required) - Label ID reference
- `attributeName` (string, optional) - Attribute name to set (default: text content)

**Example**:
```eligian
labels "./labels.json"

timeline "Multilingual" in "#app" using raf {
  at 0s selectElement("#title") {
    // Basic usage (text content)
    addController('LabelController', "mainTitle")
  }

  at 1s selectElement("#subtitle") {
    // With custom attribute
    addController('LabelController', "subtitle", "data-label")
  }
}
```

**Validation**:
- ✅ `labelId` validated against imported label files
- ✅ Typo suggestions via Levenshtein distance
- ❌ Error if label doesn't exist

---

### 2. NavigationController

**Purpose**: Manages navigation state.

**Parameters**:
- `json` (object, required) - Navigation configuration object

**Example**:
```eligian
timeline "Navigation" in "#app" using raf {
  at 0s selectElement("#nav") {
    addController('NavigationController', {
      routes: ["/home", "/about", "/contact"],
      defaultRoute: "/home"
    })
  }
}
```

---

### 3. LottieController

**Purpose**: Renders Lottie animations from lottie-web library.

**Parameters**:
- `url` (url, required) - Lottie animation JSON URL

**Example**:
```eligian
timeline "Animation" in "#app" using raf {
  at 0s selectElement("#lottie-container") {
    // Basic animation
    addController('LottieController', "./animations/intro.json")
  }

  at 5s selectElement("#outro") {
    // With freeze/end positions (Eligius URL encoding)
    addController('LottieController', "./animations/outro[freeze=10,end=21].json")
  }
}
```

---

### 4. SubtitlesController

**Purpose**: Renders subtitles for media content.

**Parameters**:
- `language` (string, optional) - Subtitle language code
- `subtitleData` (array, optional) - Subtitle data array

**Example**:
```eligian
timeline "Video" in "#app" using raf {
  at 0s selectElement("#video-container") {
    addController('SubtitlesController', "en", [
      {start: 0, end: 2, text: "Welcome"},
      {start: 2, end: 5, text: "to Eligius"}
    ])
  }

  at 10s selectElement("#video-container-2") {
    // Language only (data loaded separately)
    addController('SubtitlesController', "de")
  }
}
```

---

### 5. ProgressbarController

**Purpose**: Renders progress bar visualizations.

**Parameters**: *(Check Eligius metadata for specific parameters)*

**Example**:
```eligian
timeline "Progress" in "#app" using raf {
  at 0s selectElement("#progress") {
    addController('ProgressbarController')
  }
}
```

---

### 6. RoutingController

**Purpose**: Manages routing state.

**Parameters**: *(Check Eligius metadata for specific parameters)*

**Example**:
```eligian
timeline "Routing" in "#app" using raf {
  at 0s selectElement("#router") {
    addController('RoutingController')
  }
}
```

---

### 7. MutationObserverController

**Purpose**: Observes DOM mutations on elements.

**Parameters**: *(Check Eligius metadata for specific parameters)*

**Example**:
```eligian
timeline "Mutations" in "#app" using raf {
  at 0s selectElement("#watched-element") {
    addController('MutationObserverController')
  }
}
```

---

### 8. DOMEventListenerController

**Purpose**: Attaches DOM event listeners to elements.

**Parameters**: *(Check Eligius metadata for specific parameters)*

**Example**:
```eligian
timeline "Events" in "#app" using raf {
  at 0s selectElement("#button") {
    addController('DOMEventListenerController')
  }
}
```

---

## Validation and Errors

### Error 1: Unknown Controller Name

**Code**:
```eligian
addController('LablController', "mainTitle")  // Typo: Labl instead of Label
```

**Error**:
```
Unknown controller: 'LablController' (Did you mean: 'LabelController'?)
```

**Fix**: Correct the controller name.

---

### Error 2: Missing Required Parameter

**Code**:
```eligian
addController('LabelController')  // Missing required labelId
```

**Error**:
```
Missing required parameter 'labelId' for controller 'LabelController'
```

**Fix**: Add the required parameter.

---

### Error 3: Too Many Parameters

**Code**:
```eligian
addController('LabelController', "mainTitle", "attr", "extra")  // 3 params, expects max 2
```

**Error**:
```
Too many parameters for controller 'LabelController' (expected 2, got 3)
```

**Fix**: Remove excess parameters.

---

### Error 4: Invalid Label ID (Feature 034 Integration)

**Code**:
```eligian
labels "./labels.json"

timeline "Test" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', "unknownLabel")  // Label doesn't exist
  }
}
```

**Error**:
```
Unknown label ID: 'unknownLabel'
```

**With Typo Suggestion**:
```eligian
addController('LabelController', "mainTitel")  // Typo: Titel instead of Title
```

**Error**:
```
Unknown label ID: 'mainTitel' (Did you mean: 'mainTitle'?)
```

**Fix**: Correct the label ID.

---

### Error 5: Parameter Type Mismatch

**Code**:
```eligian
addController('NavigationController', "stringInsteadOfObject")  // Expects object
```

**Error**:
```
Parameter 'json' expects type 'object', got 'string'
```

**Fix**: Provide the correct type.

---

## IDE Support

### Autocomplete

#### Controller Name Autocomplete

1. Type `addController('`
2. Trigger autocomplete (Ctrl+Space)
3. See all 8 controllers with descriptions

**Example**:
```
addController('|')  ← cursor here
```

**Suggestions**:
- `LabelController` - This controller attaches to the given selected element and renders...
- `NavigationController` - (empty description)
- `LottieController` - This controller renders a lottie-web animation...
- ... (all 8 controllers)

---

#### Parameter Autocomplete (Label IDs)

1. Type `addController('LabelController', "`
2. Trigger autocomplete
3. See all available label IDs

**Example**:
```eligian
labels "./labels.json"  // Contains: mainTitle, subtitle, footer

timeline "Test" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', "|")  ← cursor here
  }
}
```

**Suggestions**:
- `mainTitle` - Label with 3 translations (en, de, fr)
- `subtitle` - Label with 2 translations (en, de)
- `footer` - Label with 1 translation (en)

---

### Hover Documentation

#### Hover on Controller Name

**Code**:
```eligian
addController('LabelController', "mainTitle")
              ↑ hover here
```

**Tooltip**:
```markdown
### LabelController

This controller attaches to the given selected element and renders
the text associated with the given label id in it.

The controller also listen for the `LANGUAGE_CHANGE` event and
re-renders the text with the new language after such an event.

**Required Parameters:**
- `labelId` (labelId) - Label ID reference

**Optional Parameters:**
- `attributeName` (string) - Attribute name to set

**Dependencies:**
- selectedElement
```

---

#### Hover on Parameter (Label ID)

**Code**:
```eligian
labels "./labels.json"

timeline "Test" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', "mainTitle")
                                      ↑ hover here
  }
}
```

**Tooltip**:
```markdown
**Parameter:** `labelId` (labelId, required)

Label ID reference

**Label:** mainTitle
- Translations: 3 languages (en, de, fr)
- Default language: en
```

---

## Migration Guide

### From Old Syntax to New Syntax

**Before**:
```eligian
timeline "Demo" in "#app" using raf {
  at 0s selectElement("#title") {
    {
      "systemName": "getControllerInstance",
      "operationData": {"systemName": "LabelController"}
    }
    {
      "systemName": "addControllerToElement",
      "operationData": {"labelId": "mainTitle"}
    }
  }
}
```

**After**:
```eligian
timeline "Demo" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', "mainTitle")
  }
}
```

**Savings**: 6 lines → 1 line (83% reduction)

---

### Backwards Compatibility

**Both syntaxes work**:
```eligian
timeline "Mixed" in "#app" using raf {
  at 0s selectElement("#title") {
    // New syntax
    addController('LabelController', "mainTitle")
  }

  at 1s selectElement("#subtitle") {
    // Old syntax (still valid)
    {
      "systemName": "getControllerInstance",
      "operationData": {"systemName": "LabelController"}
    }
    {
      "systemName": "addControllerToElement",
      "operationData": {"labelId": "subtitle"}
    }
  }
}
```

**Recommendation**: Migrate incrementally, no rush to convert existing code.

---

## Advanced Scenarios

### Multiple Controllers on Same Element

```eligian
timeline "Multiple" in "#app" using raf {
  at 0s selectElement("#element") {
    // Add multiple controllers in sequence
    addController('LabelController', "mainTitle")
    addController('MutationObserverController')
    addController('DOMEventListenerController')
  }
}
```

**Compiles to**:
```json
// 6 operations (2 per controller)
[
  {"systemName": "getControllerInstance", ...},
  {"systemName": "addControllerToElement", ...},
  {"systemName": "getControllerInstance", ...},
  {"systemName": "addControllerToElement", ...},
  {"systemName": "getControllerInstance", ...},
  {"systemName": "addControllerToElement", ...}
]
```

---

### Using Variables for Parameters

**Valid** (parameter values can be variables):
```eligian
const myLabelId = "mainTitle"

timeline "Variables" in "#app" using raf {
  at 0s selectElement("#title") {
    addController('LabelController', myLabelId)  ✅
  }
}
```

**Invalid** (controller name must be string literal):
```eligian
const controllerName = "LabelController"

timeline "Invalid" in "#app" using raf {
  at 0s selectElement("#title") {
    addController(controllerName, "mainTitle")  ❌ Error: controller name must be string literal
  }
}
```

**Rationale**: Controller name must be known at compile time for parameter validation.

---

### Optional Parameters

**With optional parameter**:
```eligian
timeline "Optional" in "#app" using raf {
  at 0s selectElement("#title") {
    // Both parameters provided
    addController('LabelController', "mainTitle", "data-label")
  }

  at 1s selectElement("#subtitle") {
    // Only required parameter
    addController('LabelController', "subtitle")
  }
}
```

---

### Complex Parameter Types

**Object parameter**:
```eligian
timeline "Objects" in "#app" using raf {
  at 0s selectElement("#nav") {
    addController('NavigationController', {
      routes: [
        {path: "/home", label: "Home"},
        {path: "/about", label: "About"}
      ],
      defaultRoute: "/home",
      transitionDuration: 300
    })
  }
}
```

**Array parameter**:
```eligian
timeline "Arrays" in "#app" using raf {
  at 0s selectElement("#video") {
    addController('SubtitlesController', "en", [
      {start: 0, end: 2, text: "Line 1"},
      {start: 2, end: 5, text: "Line 2"},
      {start: 5, end: 8, text: "Line 3"}
    ])
  }
}
```

---

## Performance Notes

### Validation Performance

- **Controller name lookup**: <1ms (Map lookup)
- **Parameter count check**: <1ms (array length comparison)
- **Parameter type check**: <10ms (per parameter)
- **Label ID validation**: <1ms (Feature 034 Map lookup)
- **Levenshtein suggestions**: <100ms (8 controllers, short names)

**Total**: <10ms per `addController` call (imperceptible to user)

---

### IDE Performance

- **Autocomplete response**: <300ms (per spec requirement SC-005)
- **Hover tooltip**: <200ms (typical)
- **Label ID lookup**: <100ms (Feature 034 service)

---

## Common Patterns

### Pattern 1: Label Text Rendering

```eligian
labels "./labels.json"

timeline "Multilingual Site" in "#app" using raf {
  at 0s {
    selectElement("#header-title") {
      addController('LabelController', "headerTitle")
    }
    selectElement("#nav-home") {
      addController('LabelController', "navHome")
    }
    selectElement("#nav-about") {
      addController('LabelController', "navAbout")
    }
    selectElement("#footer-copyright") {
      addController('LabelController', "footerCopyright")
    }
  }
}
```

---

### Pattern 2: Lottie Animations

```eligian
timeline "Animated Landing Page" in "#app" using raf {
  at 0s selectElement("#hero-animation") {
    addController('LottieController', "./animations/hero.json")
  }

  at 2s selectElement("#feature-1-icon") {
    addController('LottieController', "./animations/feature1.json")
  }

  at 4s selectElement("#feature-2-icon") {
    addController('LottieController', "./animations/feature2.json")
  }
}
```

---

### Pattern 3: Video with Subtitles

```eligian
timeline "Video Presentation" in "#app" using raf {
  at 0s selectElement("#video-container") {
    // Add subtitle controller
    addController('SubtitlesController', "en", [
      {start: 0, end: 3, text: "Welcome to our presentation"},
      {start: 3, end: 6, text: "Today we'll discuss..."},
      {start: 6, end: 10, text: "Key features include..."}
    ])
  }
}
```

---

## Troubleshooting

### Issue: Controller not found

**Symptom**: `Unknown controller: 'MyController'`

**Solutions**:
1. Check spelling (case-sensitive)
2. Verify controller exists in Eligius ctrlmetadata
3. Run `pnpm run langium:generate` to regenerate metadata
4. Check Eligius package version

---

### Issue: Label validation not working

**Symptom**: No error for invalid label ID

**Solutions**:
1. Verify label file imported: `labels "./labels.json"`
2. Check label file path is correct
3. Verify label file has valid JSON structure
4. Restart language server (VS Code: "Developer: Reload Window")

---

### Issue: Autocomplete not showing controllers

**Symptom**: No suggestions when typing `addController('`

**Solutions**:
1. Verify language server is running
2. Check VS Code extension is active
3. Run `pnpm run langium:generate` to regenerate metadata
4. Restart VS Code

---

## Next Steps

1. **Try basic examples**: Start with LabelController and LottieController
2. **Explore autocomplete**: Use Ctrl+Space to discover controllers
3. **Read hover docs**: Hover over controller names to see documentation
4. **Test validation**: Intentionally make errors to see validation
5. **Migrate existing code**: Convert old syntax incrementally

---

## Additional Resources

- **Eligius Documentation**: [https://github.com/rolandzwaga/eligius](https://github.com/rolandzwaga/eligius)
- **Controller Metadata**: `node_modules/eligius/src/controllers/metadata/`
- **Feature Spec**: `specs/035-specialized-controller-syntax/spec.md`
- **Data Model**: `specs/035-specialized-controller-syntax/data-model.md`
- **Contracts**: `specs/035-specialized-controller-syntax/contracts/`
