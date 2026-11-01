# Eligian VS Code Extension

VS Code extension for the Eligian DSL - providing language support for `.eligian` files.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Eligian DSL
- **Language Server**: Powered by Langium for intelligent language features
- **Validation**: Real-time error checking and semantic validation
- **Compilation**: Compile `.eligian` files directly from VS Code
- **Diagnostics**: View errors and warnings in the Problems panel
- **Live Preview**: Interactive preview with Eligius engine integration, with a scrubber and time readout, a timeline picker and a language picker
- **Selectors through actions**: string literals passed to an action parameter that ends up as a selector or class name are checked (and completed) like those passed to operations; selectors may use ids and classes of the imported CSS and of the layout HTML; *Change to '…'* quick fix for suggestions; optional warning for selector ids/classes that are in the CSS but not in the layout (setting `eligian.validation.selectorNotInLayout`: `off` / `ids` / `all`)
- **Insert selectElement**: when an operation needs a selected element and none is selected, a quick fix inserts `selectElement("…")` (or adds `target "…"` to an `at` event calling an action)
- **Timeline names as symbols**: Go to Definition, Find References and Rename between a timeline and the `navigate "<name>"` targets that switch to it; timeline-name completion after `navigate`; *Change to "…"* / *Create timeline "…"* quick fixes for an unknown target
- **Interactions**: `on <event> "<sel>" navigate | play | pause | toggle | stop | seek <time> | run <action>(…)` and `on key "ArrowRight" <verb>`, with DOM event and key completion (an unknown event is a warning with suggestions, an unknown key an error) and label support in `seek intro.end`
- **Format Document**: whitespace-only formatting (indentation of multi-line `[ ]` / `{ }` blocks, `] [`, spacing around operators, keywords and commas, `5s`); comments are kept. The same rules as `eligian fmt`
- **Runtime errors in the source**: an error the Eligius engine reports while the preview runs is shown on the failing operation (Problems view, source `eligius-runtime`) with a *Go to Source* notification, also inside called actions and imported libraries
- **Live playhead**: while the preview plays, the running events are marked in the editor (setting `eligian.preview.highlightActiveEvents`)
- **Preview from here**: `▶ Preview` / `▶ Preview from 22s` CodeLenses above timelines, timed events, sequence items and stagger blocks open the preview at that time and play (setting `eligian.codeLens.preview`)
- **CSS Hot-Reload**: Import CSS files with instant hot-reload (no preview restart)
- **Snippets**: `action`, `endable action`, `on event`, `timeline`, `chapter`, `languages` and `library` skeletons
- **Signature help**: typing `(` or `,` in a call shows its parameters (types, optional ones, descriptions from the operation metadata or the action's JSDoc), including a controller's parameters in `addController`
- **Parameter-name inlay hints**: `broadcastEvent(eventArgs: [...], eventName: "go")`; setting `eligian.inlayHints.parameterNames` = `literals` (default), `all` or `none`
- **Time inlay hints**: absolute times the compiler computes, shown in place: `‹5s..15s›` after each sequence item, `‹22s..23.8s ×3›` after a stagger block, the resolved range of relative, computed or `for` ranges, and the inferred duration on a timeline header without `duration`. Times that depend on runtime values show no hint. Settings `eligian.inlayHints.sequenceTimes`, `staggerTimes`, `computedTimes` and `timelineDuration` (all on by default)
- **Timeline event completion**: inside a timeline, `at … for … [ ]` (starting where the previous event ends), `sequence { }` and `stagger … with …`

## Installation

### From Marketplace (Coming Soon)

Search for "Eligian" in the VS Code Extensions marketplace.

### From VSIX

```bash
code --install-extension eligian-0.0.1.vsix
```

## Usage

### Opening Files

Simply open any `.eligian` file in VS Code. The extension activates automatically and provides:

- Syntax highlighting
- Error detection
- Autocompletion (operations, actions, CSS classes, events, timeline events) and snippets
- Hover information

### Compiling

To compile an Eligian file:

1. Open a `.eligian` file
2. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Run command: **"Eligian: Compile Current File"**

Or right-click in the editor and select **"Eligian: Compile Current File"** from the context menu.

The compiled JSON output will be written to a `.json` file with the same name, and opened in a split view.

## Language Features

### Syntax Highlighting

Full syntax highlighting for:
- Keywords (`timeline`, `video`, `audio`, `raf`)
- Time ranges (`0..5`)
- Strings and numbers
- Property chains (`$scope.foo`)
- Operation calls (`selectElement`, `addClass`, etc.)
- Comments (`// line comment`, `/* block comment */`)

### Validation

Real-time validation catches errors as you type:
- Missing timeline
- Invalid time ranges
- Unknown operations
- Invalid parameter counts
- Type mismatches
- Missing dependencies

### Diagnostics

Errors and warnings appear in:
- The editor (red/yellow squiggles)
- The Problems panel
- Hover tooltips

## Example

Create a file `example.eligian`:

```eligian
timeline raf {
  0..5: {
    selectElement("#title")
    addClass("visible")
  }

  5..10: {
    selectElement("#content")
    fadeIn(1000)
  }
}
```

The extension will:
- Highlight syntax
- Validate operations (`selectElement`, `addClass`, `fadeIn`)
- Check parameter types
- Show errors if any

## CSS Styling with Hot-Reload

Import CSS files to style your Eligius presentations. Changes to CSS files are automatically reloaded in the preview without restarting the timeline.

### Importing CSS

Use the `styles` keyword to import CSS files:

```eligian
// Import single CSS file
styles "./styles/main.css"

// Import multiple CSS files (loaded in order)
styles "./styles/base.css"
styles "./styles/theme.css"
styles "./styles/animations.css"

timeline raf {
  0..5: {
    selectElement("#title")
    addClass("fade-in")  // CSS class from animations.css
  }
}
```

### Hot-Reload

When you save changes to imported CSS files:
- ✅ CSS reloads instantly (< 300ms)
- ✅ Timeline continues playing (no restart)
- ✅ Element states preserved
- ✅ Works with multiple CSS files

### CSS Features

**Supported**:
- Relative paths (resolved from `.eligian` file location)
- Images and fonts in CSS (`url()` paths automatically resolved)
- Multiple CSS files (loaded in order)
- Standard CSS syntax

**Error Handling**:
- Clear notifications if files are missing
- "Open File" button to quickly fix paths
- Preview stays functional with previous valid CSS
- Rate-limited notifications (max 3 per minute per file)

### Example with CSS

Create `styles/main.css`:
```css
#title {
  font-size: 48px;
  color: #333;
}

.fade-in {
  animation: fadeIn 1s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

Create `presentation.eligian`:
```eligian
styles "./styles/main.css"

timeline raf {
  0..5: {
    selectElement("#title")
    addClass("fade-in")
  }
}
```

**Result**: Open preview, see styled content. Edit CSS, see changes instantly without restarting timeline!

## Visual Locale Editor

The extension includes a visual editor for managing translation locale files used with Eligius's `LabelController`.

### Opening the Editor

1. Create or open a locale JSON file (e.g., `locales.json`)
2. Right-click the file and select **"Open with Locale Editor"**
3. Or use the command palette: **"Eligian: Open Locale Editor"**

### Editor Features

**Tree View Navigation**:
- Translation keys displayed in a hierarchical tree (e.g., `nav.home.button`)
- Expand/collapse branches for easy navigation
- Click a key to select and edit its translations

**Multi-Locale Support**:
- Each locale (e.g., `en-US`, `nl-NL`) displayed as a column
- Inline editing for translations
- Add new locales with the "Add Language" button

**Key Management**:
- Add new translation keys with dot-notation (e.g., `nav.contact`)
- Rename keys while preserving all translations
- Delete keys with usage tracking warnings

**Usage Tracking**:
- See which `.eligian` files reference each translation key
- Usage count displayed as badges next to keys
- Hover for detailed file list

### Supported Formats

The editor supports two JSON formats:

**New Format (ILocalesConfiguration)**:
```json
{
  "en-US": {
    "nav": {
      "home": "Home",
      "about": "About"
    }
  },
  "nl-NL": {
    "nav": {
      "home": "Thuis",
      "about": "Over"
    }
  }
}
```

**Legacy Format (LabelGroup[])**:
```json
[
  {
    "id": "nav.home",
    "labels": [
      { "id": "uuid", "languageCode": "en-US", "label": "Home" },
      { "id": "uuid", "languageCode": "nl-NL", "label": "Thuis" }
    ]
  }
]
```

### Validation

Real-time validation for:
- Language code format (`xx-XX` pattern, e.g., `en-US`)
- Translation key format (alphanumeric, dots, underscores, hyphens)
- Duplicate key detection
- Empty translation warnings

### Using Locales in Eligian

Import locale files in your `.eligian` code:

```eligian
locales "./locales.json"

timeline raf {
  0..5: {
    addController("LabelController", "nav.home", { selector: "#title" })
  }
}
```

The `LabelController` will display the translation for the user's locale.

## Compilation Output

When you compile, the extension:
1. Validates your code
2. Runs the compiler
3. Writes the output `.json` file
4. Opens the JSON in a split view
5. Shows any errors in the Output panel

## Configuration

Currently no configuration options. Extension works out of the box.

Future configuration possibilities:
- Compiler optimization settings
- Output format preferences
- Custom operation definitions

## Troubleshooting

### Extension Not Activating

- Ensure the file has `.eligian` extension
- Check VS Code Output panel → "Eligian" for logs
- Try reloading VS Code window

### Compilation Errors

- Check the Output panel → "Eligian Compiler" for detailed error messages
- Verify your syntax matches the Eligian grammar
- Ensure all operations are valid Eligius operations

### Language Server Issues

- Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")
- Check for conflicting extensions
- Verify extension is enabled

## Development

### Building the Extension

```bash
cd packages/extension
npm run build
```

### Packaging

```bash
vsce package
```

This creates a `.vsix` file you can install.

### Debugging

1. Open the extension project in VS Code
2. Press F5 to launch Extension Development Host
3. Open a `.eligian` file in the new window
4. Use Debug Console to see logs

## Related Packages

- **@eligian/language**: Core language and compiler
- **@eligian/cli**: Command-line compiler

## License

See LICENSE file in the root of the repository.
