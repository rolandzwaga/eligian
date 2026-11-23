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
- **Host modules**: `extensions "./host.ts" { operation trackEvent(eventName: string) … }` declares your own operations, controllers and functions; they are validated, completed and shown in signature help like Eligius' own. In a trusted workspace the preview bundles the module (esbuild, built in: no Node.js needed) and runs it, and saving it reloads the preview; in an untrusted workspace its operations do nothing
- **CSS / HTML navigation**: Go to Definition (Ctrl+Click, F12) on a class or id in a selector or class-name string (`addClass("on")`, `selectElement(".card.on")`, an action argument, `target`, `with`, `on click`, the timeline container) opens its CSS rule and its elements in the layout HTML; *Eligian: Find Eligian References* (context menu in CSS and HTML files) lists the .eligian strings that use the class or id under the cursor; CSS rules show "N Eligian references" (setting `eligian.codeLens.cssReferences`)
- **Insert selectElement**: when an operation needs a selected element and none is selected, a quick fix inserts `selectElement("…")` (or adds `target "…"` to an `at` event calling an action)
- **Timeline names as symbols**: Go to Definition, Find References and Rename between a timeline and the `navigate "<name>"` targets that switch to it; timeline-name completion after `navigate`; *Change to "…"* / *Create timeline "…"* quick fixes for an unknown target
- **New Presentation**: *Eligian: New Presentation…* (Command Palette) writes a starter project (blank, chapters, video or library) into a folder you pick and opens it with the preview; the same starters as `eligian init`
- **Interactions**: `on <event> "<sel>" navigate | play | pause | toggle | stop | seek <time> | run <action>(…)` and `on key "ArrowRight" <verb>`, with DOM event and key completion (an unknown event is a warning with suggestions, an unknown key an error) and label support in `seek intro.end`
- **Format Document**: whitespace-only formatting (indentation of multi-line `[ ]` / `{ }` blocks, `] [`, spacing around operators, keywords and commas, `5s`); comments are kept. The same rules as `eligian fmt`
- **Runtime errors in the source**: an error the Eligius engine reports while the preview runs is shown on the failing operation (Problems view, source `eligius-runtime`) with a *Go to Source* notification, also inside called actions and imported libraries
- **Outline, breadcrumbs and Go to Symbol** (Ctrl+Shift+O): each timeline lists its `on enter` / `on leave` blocks and events (`at 0s..6s`, `sequence 0s..46s ×6` with its items, `stagger 22s..23.9s ×3`) with their resolved times, labels, the first text they show and the calls they make; next to them the actions, event actions, constants and named imports
- **Timeline view** (panel *Eligian* → *Timeline*, or *Eligian: Show Timeline View*): a swimlane per timeline of the active .eligian file, a bar per event (`at` events, sequence items, stagger items) at its resolved time, events that run at the same time below each other, and the preview's playhead. Click a bar to go to its source, double-click it to preview from its start
- **Live playhead**: while the preview plays, the running events are marked in the editor (setting `eligian.preview.highlightActiveEvents`)
- **Eligius lint**: a moment after you stop typing, every program without errors is also checked by Eligius' own configuration lint over its compiled JSON (compiled in memory, nothing is written). Findings show at the source line and in Problems (source 'Eligius lint'), for example `scrollToElement(200, "nowhere")` (not an allowed `block`), also in the library whose action they are in; the same check as `eligian check` (setting `eligian.validation.eligiusLint`)
- **Preview from here**: `▶ Preview` / `▶ Preview from 22s` CodeLenses above timelines, timed events, sequence items and stagger blocks open the preview at that time and play (setting `eligian.codeLens.preview`)
- **CSS Hot-Reload**: Import CSS files with instant hot-reload (no preview restart)
- **Snippets**: `action`, `endable action`, `on event`, `timeline`, `chapter`, `languages` and `library` skeletons
- **Signature help**: typing `(` or `,` in a call shows its parameters (types, optional ones, descriptions from the operation metadata or the action's JSDoc), including a controller's parameters in `addController`
- **Parameter-name inlay hints**: `broadcastEvent(eventArgs: [...], eventName: "go")`; setting `eligian.inlayHints.parameterNames` = `literals` (default), `all` or `none`
- **Time inlay hints**: absolute times the compiler computes, shown in place: `‹5s..15s›` after each sequence item, `‹22s..23.8s ×3›` after a stagger block, the resolved range of relative, computed or `for` ranges, and the inferred duration on a timeline header without `duration`. Times that depend on runtime values show no hint. Settings `eligian.inlayHints.sequenceTimes`, `staggerTimes`, `computedTimes` and `timelineDuration` (all on by default)
- **Timeline event completion**: inside a timeline, `at … for … [ ]` (starting where the previous event ends), `sequence { }` and `stagger … with …`

## Installation

### From the Marketplace

Search for "Eligian" in the Extensions view, or run:

```bash
code --install-extension rolandzwaga.eligian
```

### From VSIX

```bash
code --install-extension eligian-1.1.0.vsix
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
  color: dimgray;
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

## Coding agents (MCP)

The extension registers the Eligian MCP server for Copilot agent mode automatically. It gives the agent nine `eligian_*` tools: `brief` (the interview before anything is written), `docs`, `operations`, `check`, `fmt`, `init`, `compile`, `project` and `smoke`. You do not need a `.vscode/mcp.json` file; the server appears in **MCP: List Servers** as **Eligian**.

### Getting started

1. Open your presentation folder and trust it when VS Code asks.
2. Install the `eligian` CLI in the folder: click **Install** on the notification, or run `npm install --save-dev eligian` (a project from *Eligian: New Presentation…* already lists it in `package.json`; run `npm install`).
3. Open the Chat view (Ctrl+Alt+I) and choose **Agent** in the mode picker.
4. Click **Configure Tools** in the chat input and check that the **Eligian** tools are ticked.
5. If the server is not running, run **MCP: List Servers**, pick **Eligian** and choose **Start Server**.

**How the agent works with it.** For a new presentation, type `/` in the chat input and pick the Eligian server's **new-presentation** prompt with your idea, or simply describe what you want. The agent first interviews you with `eligian_brief`: a few questions per round, each with a recommended answer, and it looks up facts itself instead of asking you. The answers go into `BRIEF.md` next to the program. You confirm the brief and approve the storyboard in a dialog that VS Code shows; the agent cannot do that for you. Until then, the tools that generate or check a new program refuse it. Programs that already existed when the server first ran in the folder are not affected. To add a timeline, a language or a host module to an approved presentation, use the **add-to-presentation** prompt, which runs a short interview for just that addition.

### Details

**Requirement.** The server is the `eligian` CLI package, version 1.1 or later (on npm, 1.2.0 is the first), installed in the folder's own `node_modules` (`<folder>/node_modules/eligian/bin/cli.js`). The extension runs that copy, so the tools match the version your project builds with. When a folder has an older `eligian`, or has `.eligian` files but no `eligian` package, a notification asks to install it, with **Install** and **Don't Ask Again**. It is shown at most once per window, and **Don't Ask Again** turns it off for that workspace. Once the install finishes, the server appears without a reload.

**What Install runs.** **Install** opens a terminal in the folder and runs one command. The package manager is the one of the nearest lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock` / `bun.lockb`, `package-lock.json`) or `packageManager` field in a `package.json`, found by walking up from the folder; with neither, npm. The command is `<pm> add -D eligian@^1.1` (for npm: `npm install --save-dev eligian@^1.1`). When the folder's `package.json` already declares an `eligian` range that admits 1.1, it is the plain `<pm> install` instead. If a lockfile still pins `eligian` 1.0.x under such a range, the plain install keeps 1.0.x; run `<pm> add -D eligian@^1.1` yourself.

**Settings.** `eligian.mcp.enabled` (default `true`) turns the registration off for a folder, for example when you use your own server or none. `eligian.mcp.command` (default `node`) is the program that runs `cli.js mcp`; set it to an absolute path of `node` when `node` is not on the editor's PATH.

**Trust.** Nothing is registered, and no install prompt is shown, in an untrusted workspace, because the server runs code from the workspace's `node_modules`. `eligian.mcp.command` is a restricted setting there: a value from the workspace's own settings is not used until you trust the workspace.

**Your own server wins.** When you configured an Eligian server yourself, the extension registers nothing for that folder: a server under the key `eligian`, or a stdio server that runs an Eligian `cli.js` (`…/eligian/bin/cli.js mcp`) or `npx eligian mcp`, in the folder's `.vscode/mcp.json`, in the folder's `mcp` settings, or in the workspace-level `mcp` configuration (which covers every folder). The user-profile `mcp.json` is not read, so a server you added there runs beside the extension's.

**Multi-root workspaces.** Each workspace folder that qualifies gets its own server, named `Eligian (<folder>)`, started in that folder. Only the folder's own `node_modules` counts: for an `eligian` installed in a sub-folder, open that sub-folder as a workspace folder or add it to `.vscode/mcp.json`.

**Cursor.** In Cursor the extension registers the same server through Cursor's own MCP extension API instead. Cursor gives a registered server no working directory, so the server works from absolute paths and the MCP roots the client sends rather than from the folder it was started in.

## Configuration

The extension works out of the box. The MCP registration (see [Coding agents (MCP)](#coding-agents-mcp)) has two settings:

| Setting | Default | What it does |
|---------|---------|--------------|
| `eligian.mcp.enabled` | `true` | Register the Eligian MCP server for Copilot agent mode in folders that have `eligian` 1.1 or later installed. Turn off to use your own `.vscode/mcp.json` or no server. |
| `eligian.mcp.command` | `node` | The program that runs `<folder>/node_modules/eligian/bin/cli.js mcp`, for example an absolute path to `node.exe`. Empty means `node`. Restricted in an untrusted workspace. |

The other `eligian.*` settings (validation, CodeLens, inlay hints, preview) are listed under **Settings → Extensions → Eligian**.

## Troubleshooting

### Extension Not Activating

- Ensure the file has `.eligian` extension
- Check VS Code Output panel → "Eligian" for logs
- Try reloading VS Code window

### Compilation Errors

- Check the Output panel → "Eligian Compiler" for detailed error messages
- Verify your syntax matches the Eligian grammar
- Ensure all operations are valid Eligius operations

### Eligian MCP Server Not Starting

- `node` is not on the editor's PATH (common when the editor is started from a desktop shortcut, or `node` comes from a version manager): set `eligian.mcp.command` to the absolute path of `node`.
- No **Eligian** server in **MCP: List Servers**: the folder needs `eligian` 1.1 or later in its own `node_modules`, a trusted workspace, `eligian.mcp.enabled` on, and no Eligian server of your own in `.vscode/mcp.json` or the `mcp` settings.

### Language Server Issues

- Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")
- Check for conflicting extensions
- Verify extension is enabled

## Development

### Building the Extension

```bash
pnpm build   # from the repository root
```

### Packaging

```bash
pnpm -C packages/extension run package
```

This runs the production build (minified, no source maps) and writes `eligian-<version>.vsix`. Only the files the extension needs at runtime go in: `.vscodeignore` is an allow-list, and `build-output.spec.ts` checks it.

### Debugging

1. Open the extension project in VS Code
2. Press F5 to launch Extension Development Host
3. Open a `.eligian` file in the new window
4. Use Debug Console to see logs

## Related Packages

- **@eligian/language**: Core language and compiler
- **eligian** (npm, `packages/cli`): Command-line compiler

## License

See LICENSE file in the root of the repository.
