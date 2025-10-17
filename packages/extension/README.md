# Eligian VS Code Extension

VS Code extension for the Eligian DSL - providing language support for `.eligian` files.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Eligian DSL
- **Language Server**: Powered by Langium for intelligent language features
- **Validation**: Real-time error checking and semantic validation
- **Compilation**: Compile `.eligian` files directly from VS Code
- **Diagnostics**: View errors and warnings in the Problems panel

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
