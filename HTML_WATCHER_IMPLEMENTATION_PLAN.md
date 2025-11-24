# HTML Watcher Implementation Plan

## Overview
Implement HTML layout file watching for hot-reload validation, following the established patterns from CSS and labels watchers, and integrating with the generic import processor refactoring.

---

## Context

### Existing Infrastructure
1. **Generic Import Processor** ([import-processor.ts](packages/extension/src/language/import-processor.ts))
   - Configuration-driven approach supporting one-to-many (CSS) and one-to-one (labels, HTML)
   - Already tested with HTML imports (11 tests passing)
   - Handles loop prevention via `hasImport()` for one-to-one relationships

2. **HTML Registry** ([html-registry.ts](packages/language/src/html/html-registry.ts))
   - `HTMLRegistryService` for tracking HTML content per document
   - One-to-one document-to-HTML mapping
   - Query API (`getHTMLForDocument`, `getHTMLFileURI`, etc.)

3. **HTML Notifications** ([html-notifications.ts](packages/language/src/lsp/html-notifications.ts))
   - `HTML_UPDATED_NOTIFICATION` - HTML file changed
   - `HTML_IMPORTS_DISCOVERED_NOTIFICATION` - Document imports discovered
   - Parameter interfaces defined

4. **Existing Watchers**:
   - **CSSWatcherManager** ([css-watcher.ts](packages/extension/src/extension/css-watcher.ts))
     - One-to-many: tracks multiple CSS files per document
     - Method: `registerImports(documentUri, cssFileUris: string[])`
   - **LabelsWatcherManager** ([labels-watcher.ts](packages/extension/src/extension/labels-watcher.ts))
     - One-to-one: tracks single labels file per document
     - Method: `registerImport(documentUri, labelsFileUri: string)` (singular)

---

## Implementation Plan

### Phase 1: Create HTMLWatcherManager

**File**: `packages/extension/src/extension/html-watcher.ts`

**Pattern**: Mirror `LabelsWatcherManager` (one-to-one relationship)

**Key Components**:

```typescript
/**
 * HTML Watcher Manager
 *
 * Watches HTML/layout files for changes and triggers validation hot-reload
 * without requiring manual document save. Uses a single FileSystemWatcher
 * with per-file debouncing to handle rapid file changes (e.g., auto-save).
 *
 * Pattern: Mirrors labels-watcher.ts for consistency (one-to-one relationship)
 * Constitution Principle I: Simplicity & Documentation
 */

export class HTMLWatcherManager {
  private watcher: vscode.FileSystemWatcher | null = null;
  private trackedFiles = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceDelay = 300; // milliseconds
  private readonly onChange: HTMLChangeCallback;
  private disposables: vscode.Disposable[] = [];

  // LSP notification support for validation hot-reload
  private client: LanguageClient | null = null;
  private importsByHTMLFile = new Map<string, Set<string>>(); // HTML file URI → Set<document URIs>

  constructor(onChange: HTMLChangeCallback, client?: LanguageClient);

  // One-to-one: single HTML file per document (matches labels pattern)
  registerImport(documentUri: string, htmlFileUri: string): void;

  private resolveAbsoluteHTMLUri(documentUri: string, htmlFileUri: string): string;
  startWatching(htmlFiles: string[], workspaceRoot: string): void;
  updateTrackedFiles(htmlFiles: string[]): void;
  private handleFileChange(uri: vscode.Uri): void;
  private handleFileDelete(uri: vscode.Uri): void;
  private debounceChange(filePath: string): void;
  dispose(): void;
}
```

**Implementation Details**:
1. **File Pattern**: Watch `**/*.html` files in workspace
2. **Callback Type**: `export type HTMLChangeCallback = (filePath: string) => void | Promise<void>;`
3. **LSP Notification**: Send `HTML_UPDATED_NOTIFICATION` when HTML file changes
4. **Notification Params**:
   ```typescript
   {
     htmlFileUri: string,
     documentUris: string[]
   }
   ```
5. **Debouncing**: 300ms per-file (same as CSS/labels)
6. **Reverse Mapping**: `Map<htmlFileUri, Set<documentUris>>` for tracking imports

**Key Differences from CSS Watcher**:
- Use `registerImport()` (singular) instead of `registerImports()` (plural)
- Track single HTML file per document (one-to-one)
- Watch `**/*.html` instead of `**/*.css`

**Key Similarities to Labels Watcher**:
- Identical method signatures (`registerImport` singular)
- Same one-to-one relationship pattern
- Same reverse mapping structure
- Same debounce and disposal logic

---

### Phase 2: Integrate HTMLWatcherManager in Extension

**File**: `packages/extension/src/extension/main.ts`

**Changes Required**:

1. **Import HTML Watcher and Notifications**:
```typescript
import { HTMLWatcherManager } from './html-watcher.js';
import {
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  type HTMLImportsDiscoveredParams,
} from '@eligian/language';
```

2. **Declare Global Watcher Variable** (after line 31):
```typescript
// Shared HTML watcher for validation hot-reload (layout file hot-reload feature)
// This watcher sends LSP notifications when HTML files change, triggering re-validation
let validationHTMLWatcher: HTMLWatcherManager | null = null;
```

3. **Initialize Watcher in `activate()`** (after labels watcher initialization, ~line 83):
```typescript
// Initialize shared HTML watcher for validation hot-reload (layout file hot-reload feature)
// This watcher sends LSP notifications when HTML files change, triggering re-validation
// It's separate from preview-specific concerns and exists for the extension lifetime
validationHTMLWatcher = new HTMLWatcherManager(() => {
  // No-op callback - validation is handled via LSP notifications, not callbacks
}, client);
context.subscriptions.push({
  dispose: () => validationHTMLWatcher?.dispose(),
});

// Register handler for HTML imports discovered notification
// The language server sends this notification when a document's HTML import is discovered.
// We register this import with the validationHTMLWatcher so it knows which documents to
// re-validate when an HTML file changes.
client.onNotification(
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  (params: HTMLImportsDiscoveredParams) => {
    console.error(
      `[Extension] Received HTML_IMPORTS_DISCOVERED: doc=${params.documentUri}, html=${params.htmlFileUri}`
    );
    validationHTMLWatcher?.registerImport(params.documentUri, params.htmlFileUri);
  }
);
```

**Integration Pattern**: Identical to labels watcher registration (lines 61-83)

---

### Phase 3: Register HTML Registry Service in Language Module

**File**: `packages/language/src/eligian-module.ts`

**Changes Required**:

1. **Import HTML Registry**:
```typescript
import { HTMLRegistryService } from './html/html-registry.js';
```

2. **Extend Service Types** (add to existing type extensions):
```typescript
export type EligianAddedServices = {
  css: {
    CSSRegistry: CSSRegistryService;
  };
  labels: {
    LabelRegistry: LabelRegistryService;
  };
  html: {
    HTMLRegistry: HTMLRegistryService;  // ADD THIS
  };
};
```

3. **Register Service in Module** (add to shared services):
```typescript
shared: {
  css: {
    CSSRegistry: () => new CSSRegistryService(),
  },
  labels: {
    LabelRegistry: () => new LabelRegistryService(),
  },
  html: {
    HTMLRegistry: () => new HTMLRegistryService(),  // ADD THIS
  },
},
```

**Pattern**: Follow existing CSS and labels registry registration

---

### Phase 4: Add HTML Processing to main.ts (Language Server)

**File**: `packages/extension/src/language/main.ts`

**Changes Required**:

1. **Import HTML Notifications**:
```typescript
import {
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  HTML_UPDATED_NOTIFICATION,
  type HTMLImportsDiscoveredParams,
  type HTMLUpdatedParams,
} from '@eligian/language';
```

2. **Add HTML Updated Notification Handler** (after labels handler, ~line 150):
```typescript
// Register HTML notification handler
connection.onNotification(HTML_UPDATED_NOTIFICATION, (params: HTMLUpdatedParams) => {
  const { htmlFileUri, documentUris } = params;

  try {
    // Read HTML file content from file system
    const htmlFilePath = URI.parse(htmlFileUri).fsPath;
    const htmlContent = readFileSync(htmlFilePath, 'utf-8');

    // Update the HTML registry with content
    const htmlRegistry = Eligian.html.HTMLRegistry;
    htmlRegistry.updateHTMLFile(htmlFileUri, {
      content: htmlContent,
      errors: [],
    });

    // Trigger re-validation of importing documents
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  } catch (error) {
    // File might be deleted or have errors - clear HTML and trigger re-validation
    const htmlRegistry = Eligian.html.HTMLRegistry;
    htmlRegistry.updateHTMLFile(htmlFileUri, {
      content: '',
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
          line: 0,
          column: 0,
        },
      ],
    });

    // Trigger re-validation to show "file not found"
    for (const docUri of documentUris) {
      const document = shared.workspace.LangiumDocuments.getDocument(URI.parse(docUri));
      if (document) {
        shared.workspace.DocumentBuilder.update([URI.parse(docUri)], []);
      }
    }
  }
});
```

3. **Add HTML Processing in DocumentState.Parsed Handler** (after labels processing, ~line 225):
```typescript
// Process HTML/layout imports (one-to-one: document imports single HTML file)
const htmlRegistry = Eligian.html.HTMLRegistry;
const htmlConfig: ImportProcessorConfig<{ content: string; errors?: Array<{ message: string; line?: number; column?: number }> }> = {
  importType: 'layout',
  parseFile: (content, _filePath) => ({
    content,
    errors: [],
  }),
  createEmptyMetadata: () => ({
    content: '',
    errors: [],
  }),
  registry: {
    updateFile: (uri, metadata) => htmlRegistry.updateHTMLFile(uri, metadata),
    registerImports: (docUri, fileUri) => htmlRegistry.registerImports(docUri, fileUri as string),
    hasImport: (docUri) => htmlRegistry.hasImport(docUri),
  },
  notification: {
    type: HTML_IMPORTS_DISCOVERED_NOTIFICATION,
    createParams: (docUri, fileUri) => ({
      documentUri: docUri,
      htmlFileUri: fileUri as string,
    }),
  },
  cardinality: 'one',
};

processImports(documentUri, root, docDir, connection, htmlConfig);
```

**Pattern**: Identical to labels processing configuration

---

### Phase 5: Export HTML Notifications from Language Package

**File**: `packages/language/src/index.ts`

**Changes Required**:

Add HTML notification exports (add to existing exports):
```typescript
// HTML notifications (Feature: HTML Watcher)
export {
  HTML_UPDATED_NOTIFICATION,
  HTML_IMPORTS_DISCOVERED_NOTIFICATION,
  type HTMLUpdatedParams,
  type HTMLImportsDiscoveredParams,
} from './lsp/html-notifications.js';

// HTML registry (Feature: HTML Watcher)
export { HTMLRegistryService, type HTMLMetadata } from './html/html-registry.js';
```

**Pattern**: Follow existing CSS and labels exports

---

## Testing Strategy

### Unit Tests

**File**: `packages/extension/src/extension/__tests__/html-watcher.spec.ts`

**Test Cases** (mirror labels-watcher tests):
1. Should create watcher with callback
2. Should register single HTML import for document
3. Should start watching HTML files
4. Should debounce file changes (300ms)
5. Should send LSP notification on file change
6. Should handle file deletion
7. Should dispose watcher and clear timers
8. Should track multiple documents importing same HTML file
9. Should resolve relative HTML URIs to absolute
10. Should handle workspace root resolution

**Pattern**: Mirror `labels-watcher.spec.ts` structure

### Integration Tests

**Existing**: Generic import processor tests already cover HTML imports (1 test passing)

**Additional**: Verify HTML hot-reload end-to-end:
1. Create .eligian file with `layout "./template.html"`
2. Modify template.html
3. Verify validation updates without document save

---

## Code Quality Checklist

- [ ] Biome check passes (0 errors, 0 warnings)
- [ ] TypeScript compilation successful
- [ ] All unit tests pass
- [ ] Generic import processor tests still pass (11 tests)
- [ ] No unused imports
- [ ] Documentation comments follow JSDoc style
- [ ] Follow constitution principles (I: Simplicity, II: Testing)

---

## Rollout Plan

### Step 1: Create HTMLWatcherManager (TDD Approach)
1. Write failing unit tests for HTMLWatcherManager
2. Implement HTMLWatcherManager class
3. Verify tests pass

### Step 2: Integrate in Extension
1. Register watcher in extension main.ts
2. Wire up notification handler
3. Verify watcher starts and tracks files

### Step 3: Language Server Integration
1. Register HTML registry service
2. Add HTML processing to DocumentState.Parsed handler
3. Add HTML updated notification handler
4. Verify LSP notifications work

### Step 4: End-to-End Testing
1. Test with real .eligian file and HTML import
2. Modify HTML file and verify hot-reload
3. Test file deletion scenario
4. Test multiple documents importing same HTML

### Step 5: Documentation
1. Update CLAUDE.md with HTML watcher information
2. Add example .eligian file with layout import
3. Document HTML hot-reload in user guide

---

## Success Criteria

1. **Functionality**:
   - HTML files are watched when imported by .eligian documents
   - Validation updates when HTML files change (without document save)
   - File deletions handled gracefully
   - Multiple documents importing same HTML work correctly

2. **Code Quality**:
   - All tests pass (generic processor + new HTML watcher tests)
   - Biome check passes
   - TypeScript compiles without errors
   - No console errors in extension host

3. **Performance**:
   - Hot-reload latency <300ms (matches CSS/labels)
   - Single FileSystemWatcher (efficient)
   - Per-file debouncing works correctly

4. **Consistency**:
   - Follows same patterns as labels watcher (one-to-one)
   - Uses generic import processor
   - LSP notification flow matches CSS/labels
   - Documentation style consistent

---

## Notes

### Key Design Decisions

1. **One-to-One Relationship**: HTML imports are one-to-one (document imports single layout file), matching labels pattern, not CSS pattern.

2. **Method Naming**: Use `registerImport()` (singular) to match labels watcher, not `registerImports()` (plural) from CSS watcher.

3. **File Pattern**: Watch `**/*.html` files in workspace.

4. **No HTML Parsing**: Unlike CSS (which uses PostCSS), HTML is stored as raw content. No parsing errors beyond file I/O errors.

5. **Generic Processor Integration**: HTML processing already tested via generic import processor tests. Just need to wire up the watcher.

### Potential Future Enhancements

1. **HTML Validation**: Validate HTML syntax using a parser
2. **HTML IntelliSense**: Autocomplete HTML elements/attributes
3. **HTML Preview**: Show HTML layout in preview panel
4. **HTML Templates**: Support templating syntax (handlebars, etc.)

### Dependencies

- vscode: `^1.96.0`
- vscode-languageclient: `^10.0.0-next.16`
- @eligian/language: `workspace:*`

---

## Estimated Effort

- **Phase 1** (HTMLWatcherManager): 1-2 hours
- **Phase 2** (Extension Integration): 30 minutes
- **Phase 3** (Registry Service): 15 minutes
- **Phase 4** (Language Server): 30 minutes
- **Phase 5** (Exports): 15 minutes
- **Testing**: 1 hour
- **Documentation**: 30 minutes

**Total**: ~4-5 hours of development time

---

## References

### Existing Code
- [css-watcher.ts](packages/extension/src/extension/css-watcher.ts) - CSS watcher implementation (one-to-many)
- [labels-watcher.ts](packages/extension/src/extension/labels-watcher.ts) - Labels watcher implementation (one-to-one) **PRIMARY PATTERN**
- [import-processor.ts](packages/extension/src/language/import-processor.ts) - Generic import processor (already supports HTML)
- [html-registry.ts](packages/language/src/html/html-registry.ts) - HTML registry service
- [html-notifications.ts](packages/language/src/lsp/html-notifications.ts) - HTML LSP notifications

### Documentation
- Constitution Principle I: Simplicity & Documentation
- Constitution Principle II: Comprehensive Testing
- Constitution Principle XI: Code Quality (Biome checks)
- Constitution Principle XXIII: Testing with vitest-mcp tools
