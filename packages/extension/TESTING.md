# VS Code Extension Testing Guide

This guide explains how to test the Eligian VS Code extension manually in the Extension Development Host.

## Prerequisites

- VS Code v1.105.0 or later
- Node.js v20 or later
- Project built successfully (`npm run build` from root)

## Testing Workflow

### 1. Launch Extension Development Host

From the **extension package directory** (`packages/extension`):

```bash
# Build the extension first
cd packages/extension
pnpm run build

# Or from root
npm run build
```

Then in VS Code:
1. Open the **Eligian project root** in VS Code
2. Press `F5` or go to Run & Debug sidebar
3. Select "Run Extension" from the debug dropdown
4. Press the green play button

This will launch a new VS Code window with the extension loaded.

### 2. Test Syntax Highlighting

1. In the Extension Development Host window, open `examples/presentation.eligian`
2. **Verify**:
   - Keywords are highlighted (`timeline`, `using`, `at`, `endable`, `action`)
   - Strings are highlighted (`"presentation"`, `"raf"`)
   - Comments are grayed out
   - Numbers have distinct colors (`0s`, `4s`)
   - Language mode in bottom right shows "Eligian"

### 3. Test Language Server / Validation

1. Open `examples/presentation.eligian`
2. **Test real-time validation**:
   - Add an intentional error: `unknownOperation()`
   - Wait 1-2 seconds
   - Check Problems panel (`Ctrl+Shift+M`) - should show "Unknown operation" error
   - Remove the error - Problems panel should clear

3. **Test timeline validation**:
   - Comment out the `timeline` declaration
   - Problems panel should show "A timeline declaration is required"
   - Uncomment it

4. **Test time range validation**:
   - Change a time range to `at 10s..5s` (end before start)
   - Should show validation error about invalid time range
   - Fix it

### 4. Test Compilation Command

1. Open `examples/presentation.eligian`
2. **Test via Command Palette**:
   - Press `Ctrl+Shift+P`
   - Type "Eligian: Compile"
   - Select "Eligian: Compile Current File"
   - Check Output panel (`Ctrl+Shift+U`) - select "Eligian" from dropdown
   - Should see compilation output with JSON result

3. **Test via Context Menu**:
   - Right-click in the editor
   - Select "Eligian: Compile Current File" from context menu
   - Check Output panel for results

4. **Test with errors**:
   - Add `fakeOperation()` to introduce an error
   - Run compile command
   - Output panel should show compilation error with details
   - Remove the error

### 5. Test File Association

1. In Extension Development Host, create a new file:
   - `File > New File`
   - Save as `test.eligian`
2. **Verify**:
   - Language mode automatically detects as "Eligian"
   - Syntax highlighting works immediately
   - Language server activates (check Output panel → "Eligian Language Server")

### 6. Test Autocompletion (Basic)

Langium provides basic autocompletion out of the box:

1. Open a new `.eligian` file
2. Type `time` and press `Ctrl+Space`
3. Should see `timeline` suggested
4. Type `end` and press `Ctrl+Space`
5. Should see `endable` suggested

### 7. Test Hover Information (if implemented)

1. Hover over a keyword like `timeline` or `endable`
2. Should see documentation popup (if implemented)
3. Hover over an operation name like `selectElement`
4. Should see operation signature and description (if implemented)

## Expected Results Summary

| Feature | Expected Behavior | Status |
|---------|-------------------|--------|
| **Syntax Highlighting** | Keywords, strings, numbers, comments highlighted | ✅ Should work |
| **File Association** | `.eligian` files open with Eligian language mode | ✅ Should work |
| **Real-time Validation** | Errors show in Problems panel as you type | ✅ Should work |
| **Operation Validation** | Unknown operations flagged with suggestions | ✅ Should work |
| **Timeline Validation** | Missing timeline declaration flagged | ✅ Should work |
| **Compile Command** | Command Palette + context menu compile | ✅ Should work |
| **Compilation Output** | JSON output shown in Output panel | ✅ Should work |
| **Compilation Errors** | Errors shown in Output panel | ✅ Should work |
| **Basic Autocompletion** | Keywords suggested via Ctrl+Space | ✅ Should work |
| **Custom Completion** | Advanced operation completion | ⚠️ Deferred |
| **Hover Documentation** | Docs on hover | ⚠️ Deferred |
| **Status Bar** | Compilation status | ⚠️ Deferred |

## Debugging the Extension

### View Extension Logs

1. In Extension Development Host, open Output panel (`Ctrl+Shift+U`)
2. Select "Eligian Language Server" from dropdown
3. View language server logs

### Debug Extension Code

1. In the **main VS Code window** (not Extension Development Host):
2. Set breakpoints in extension code (`packages/extension/src/extension/main.ts`)
3. Press `F5` to launch Extension Development Host
4. Extension code will hit breakpoints in main window

### Common Issues

**Problem**: Extension doesn't activate
- **Solution**: Check `activationEvents` in package.json includes `onLanguage:eligian`
- **Solution**: Verify file extension is `.eligian` not `.eli`
- **Solution**: Reload Extension Development Host window (`Developer: Reload Window`)

**Problem**: No syntax highlighting
- **Solution**: Check `syntaxes/eligian.tmLanguage.json` exists after build
- **Solution**: Verify `contributes.grammars` in package.json points to correct file
- **Solution**: Check language id matches (`eligian` not `Eligian`)

**Problem**: Language server not starting
- **Solution**: Check Output panel → "Eligian Language Server" for errors
- **Solution**: Verify Langium services are initialized in `language/main.ts`
- **Solution**: Check `out/language/main.cjs` exists after build

**Problem**: Validation not working
- **Solution**: Check validators are registered in `eligian-validator.ts`
- **Solution**: Verify ValidationAcceptor is being used
- **Solution**: Check for errors in language server output

## Manual Test Checklist

Before releasing the extension, manually verify:

- [X] Syntax highlighting works for all language constructs
- [X] File extension `.eligian` is recognized
- [X] Language server activates on opening `.eligian` file
- [X] Real-time validation shows errors in Problems panel
- [X] Unknown operations show helpful error messages
- [X] Missing timeline declaration is flagged
- [X] Invalid time ranges are caught
- [X] Compile command appears in Command Palette
- [X] Compile command appears in editor context menu
- [X] Successful compilation shows JSON in Output panel
- [X] Compilation errors show details in Output panel
- [X] Basic autocompletion works (Ctrl+Space)
- [X] Examples compile without errors
- [X] Extension doesn't crash on invalid DSL
- [X] Extension activates only for `.eligian` files
- [X] Extension deactivates cleanly when closing all `.eligian` files

## Automated Testing (Future)

For automated extension testing, consider:
- [@vscode/test-electron](https://www.npmjs.com/package/@vscode/test-electron) - VS Code integration tests
- Unit tests for extension logic (non-VS Code parts)
- CI/CD pipeline with headless VS Code tests

## Reporting Issues

When reporting extension issues, include:
1. VS Code version (`Help > About`)
2. Extension version (from package.json)
3. Steps to reproduce
4. Screenshot or video
5. Extension Host logs (Output panel → "Eligian Language Server")
6. Example `.eligian` file that triggers the issue

---

**Last Updated**: 2025-10-16
**Tested With**: VS Code 1.105.0, Node.js 20.x
