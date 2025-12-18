# Eligian VS Code Extension

VS Code extension for the Eligian DSL - providing language support for `.eligian` files.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Eligian DSL
- **Language Server**: Powered by Langium for intelligent language features
- **Validation**: Real-time error checking and semantic validation
- **Compilation**: Compile `.eligian` files directly from VS Code
- **Diagnostics**: View errors and warnings in the Problems panel
- **Live Preview**: Interactive preview with Eligius engine integration
- **CSS Hot-Reload**: Import CSS files with instant hot-reload (no preview restart)

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
- Autocompletion (basic keywords)
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
