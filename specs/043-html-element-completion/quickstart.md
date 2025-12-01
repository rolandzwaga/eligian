# Quickstart: HTML Element Completion for createElement

**Feature**: 043-html-element-completion
**Date**: 2025-12-01

## Overview

This feature adds intelligent code completion for the `createElement` operation:
- **Element names**: All 112 standard HTML elements
- **Attributes**: Context-aware suggestions based on element type
- **Values**: Enumerated values for constrained attributes

## Usage Examples

### Element Name Completion

```eligian
action createButton [
  createElement("|")  // ← Trigger completion here
  // Shows: a, abbr, address, article, aside, audio, b, button, canvas, ...
]
```

Type partial text to filter:

```eligian
action createButton [
  createElement("bu|")  // ← Shows: button
]
```

### Attribute Completion

After specifying an element, get context-aware attribute suggestions:

```eligian
action createLink [
  createElement("a", { | })  // ← Trigger completion here
  // Shows: href, target, download, rel, hreflang, type, ...
]

action createImage [
  createElement("img", { | })  // ← Shows: src, alt, width, height, loading, ...
]

action createInput [
  createElement("input", { | })  // ← Shows: type, value, placeholder, checked, disabled, ...
]
```

### Attribute Value Completion

For enumerated attributes, get valid value suggestions:

```eligian
action createInput [
  createElement("input", { type: "|" })  // ← Trigger completion here
  // Shows: text, password, checkbox, radio, email, number, date, file, ...
]

action createLink [
  createElement("a", { target: "|" })  // ← Shows: _self, _blank, _parent, _top
]

action createImage [
  createElement("img", { loading: "|" })  // ← Shows: eager, lazy
]
```

## Common Patterns

### Creating Interactive Elements

```eligian
action createForm [
  // Create form with method completion
  createElement("form", { method: "post", action: "/submit" })
  appendToElement("#container")

  // Create input with type completion
  createElement("input", {
    type: "email",       // ← Completion for type values
    placeholder: "Enter email",
    required: true
  })
  appendToElement("form")

  // Create submit button
  createElement("button", { type: "submit" })  // ← Completion for button type
  appendToElement("form")
]
```

### Creating Media Elements

```eligian
action createVideoPlayer [
  createElement("video", {
    src: "/video.mp4",
    controls: true,
    preload: "metadata",  // ← Completion: none, metadata, auto
    poster: "/thumbnail.jpg"
  })
  appendToElement("#player-container")
]

action createImage [
  createElement("img", {
    src: "/photo.jpg",
    alt: "Description",
    loading: "lazy",     // ← Completion: eager, lazy
    decoding: "async"    // ← Completion: sync, async, auto
  })
  appendToElement("#gallery")
]
```

### Creating Semantic Elements

```eligian
action createArticle [
  // Semantic container elements
  createElement("article")
  appendToElement("main")

  createElement("header")
  appendToElement("article")

  createElement("h1", { }, "Article Title")
  appendToElement("header")

  createElement("section")
  appendToElement("article")

  createElement("footer")
  appendToElement("article")
]
```

## Supported Elements

All 112 standard HTML elements are supported:

**Text Content**: `p`, `h1`-`h6`, `blockquote`, `pre`, `code`, `span`, `br`, `hr`, ...

**Structural**: `div`, `section`, `article`, `nav`, `header`, `footer`, `main`, `aside`, ...

**Forms**: `form`, `input`, `button`, `select`, `option`, `textarea`, `label`, `fieldset`, ...

**Tables**: `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `caption`, `colgroup`, `col`

**Media**: `img`, `video`, `audio`, `source`, `track`, `canvas`, `picture`, ...

**Links/Embedded**: `a`, `iframe`, `embed`, `object`, `script`, `link`, `style`, ...

**Lists**: `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `menu`

## Troubleshooting

### Completions not appearing?

1. **Check cursor position**: Must be inside quotes for element name or inside `{ }` for attributes
2. **Check operation name**: Must be `createElement`, not `selectElement` or similar
3. **Check element name**: Attribute completions require a valid element name in the first parameter

### Unknown element showing generic attributes?

Custom elements (e.g., `my-component`) fall back to generic HTMLElement attributes. This is expected behavior.

### Missing an attribute?

Some attributes are intentionally excluded:
- Event handlers (`onclick`, `onfocus`, etc.) - use Eligius event system instead
- Deprecated attributes - use modern equivalents
- Internal/readonly properties (`tagName`, `nodeName`, etc.)

## Technical Details

- Metadata generated from TypeScript's `lib.dom.d.ts` at build time
- 112 elements with ~1500 total element-specific attributes
- ~25 enumerated attributes with value completions
- Completion response time: <100ms target
