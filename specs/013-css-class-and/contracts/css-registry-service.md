# API Contract: CSSRegistryService

**Created**: 2025-10-26
**Feature**: Spec 1 - Validation Infrastructure
**Purpose**: Define the public interface for CSS metadata registry

---

## Overview

The `CSSRegistryService` is a Langium service that maintains a centralized registry of all parsed CSS metadata across the workspace. It provides query methods for validators to check CSS class and ID availability for each Eligian document.

**Location**: `packages/language/src/css/css-registry.ts`

**Service Registration**:

```typescript
// packages/language/src/eligian-module.ts

export type EligianAddedServices = {
  validation: {
    EligianValidator: EligianValidator;
  };
  lsp: {
    HoverProvider: EligianHoverProvider;
    CompletionProvider: EligianCompletionProvider;
  };
  css: {
    CSSRegistry: CSSRegistryService;  // NEW
  };
  typir: TypirLangiumServices<EligianSpecifics>;
};

export const EligianModule: Module<EligianServices, PartialLangiumServices & EligianAddedServices> = {
  // ... existing services
  css: {
    CSSRegistry: () => new CSSRegistryService(),
  },
};
```

---

## Interface

```typescript
export class CSSRegistryService {
  /**
   * Update CSS file metadata in the registry.
   *
   * Called when:
   * - CSS file is created or modified (LSP notification)
   * - CSS file is parsed for the first time
   *
   * Behavior:
   * - Replaces existing metadata for the file (if any)
   * - Triggers re-validation of all documents that import this CSS file
   *
   * @param fileUri - Absolute file URI (e.g., "file:///f:/projects/app/styles.css")
   * @param metadata - Parsed CSS metadata (classes, IDs, locations, rules, errors)
   *
   * @example
   * cssRegistry.updateCSSFile('file:///app/styles.css', {
   *   classes: new Set(['button', 'primary']),
   *   ids: new Set(['header']),
   *   classLocations: new Map([...]),
   *   idLocations: new Map([...]),
   *   classRules: new Map([...]),
   *   idRules: new Map([...]),
   *   errors: [],
   * });
   */
  updateCSSFile(fileUri: string, metadata: CSSMetadata): void;

  /**
   * Get metadata for a specific CSS file.
   *
   * Returns:
   * - CSSMetadata if file has been parsed
   * - undefined if file has not been parsed or was deleted
   *
   * @param fileUri - Absolute file URI
   * @returns CSS metadata or undefined
   *
   * @example
   * const metadata = cssRegistry.getMetadata('file:///app/styles.css');
   * if (metadata) {
   *   console.log(`Classes: ${Array.from(metadata.classes).join(', ')}`);
   * }
   */
  getMetadata(fileUri: string): CSSMetadata | undefined;

  /**
   * Remove CSS file from the registry.
   *
   * Called when:
   * - CSS file is deleted
   * - Workspace is cleaned up
   *
   * Behavior:
   * - Removes metadata from registry
   * - Does NOT trigger re-validation (caller's responsibility)
   *
   * @param fileUri - Absolute file URI
   *
   * @example
   * cssRegistry.removeCSSFile('file:///app/styles.css');
   */
  removeCSSFile(fileUri: string): void;

  /**
   * Register which CSS files an Eligian document imports.
   *
   * Called when:
   * - Eligian document is parsed
   * - CSS import statements are extracted from AST
   *
   * Behavior:
   * - Replaces existing imports for the document
   * - Does NOT validate that CSS files exist
   *
   * @param documentUri - Absolute Eligian document URI
   * @param cssFileUris - Absolute CSS file URIs (in import order)
   *
   * @example
   * cssRegistry.registerImports('file:///app/presentation.eligian', [
   *   'file:///app/styles/base.css',
   *   'file:///app/styles/theme.css',
   * ]);
   */
  registerImports(documentUri: string, cssFileUris: string[]): void;

  /**
   * Get all CSS classes available to an Eligian document.
   *
   * Returns:
   * - Union of all classes from imported CSS files
   * - Empty set if document has no CSS imports
   * - Empty set if imported CSS files have not been parsed yet
   *
   * Note: Duplicates across files are de-duplicated (CSS cascade applies at runtime).
   *
   * @param documentUri - Absolute Eligian document URI
   * @returns Set of class names
   *
   * @example
   * const classes = cssRegistry.getClassesForDocument('file:///app/presentation.eligian');
   * // classes = Set { 'button', 'primary', 'header' }
   */
  getClassesForDocument(documentUri: string): Set<string>;

  /**
   * Get all CSS IDs available to an Eligian document.
   *
   * Returns:
   * - Union of all IDs from imported CSS files
   * - Empty set if document has no CSS imports
   * - Empty set if imported CSS files have not been parsed yet
   *
   * @param documentUri - Absolute Eligian document URI
   * @returns Set of ID names
   *
   * @example
   * const ids = cssRegistry.getIDsForDocument('file:///app/presentation.eligian');
   * // ids = Set { 'header', 'main', 'footer' }
   */
  getIDsForDocument(documentUri: string): Set<string>;

  /**
   * Find the definition location of a CSS class.
   *
   * Returns:
   * - Source location of first class definition (if exists in imported CSS)
   * - undefined if class does not exist or CSS files not parsed
   *
   * Behavior:
   * - Searches all imported CSS files for the document
   * - Returns location from first file that defines the class (import order)
   *
   * Use case: "Go to Definition" feature (Spec 2)
   *
   * @param documentUri - Absolute Eligian document URI
   * @param className - CSS class name (without leading '.')
   * @returns Source location or undefined
   *
   * @example
   * const location = cssRegistry.findClassLocation(
   *   'file:///app/presentation.eligian',
   *   'button'
   * );
   * // location = { filePath: 'file:///app/styles.css', startLine: 5, ... }
   */
  findClassLocation(documentUri: string, className: string): SourceLocation | undefined;

  /**
   * Find the definition location of a CSS ID.
   *
   * Returns:
   * - Source location of first ID definition (if exists in imported CSS)
   * - undefined if ID does not exist or CSS files not parsed
   *
   * @param documentUri - Absolute Eligian document URI
   * @param idName - CSS ID name (without leading '#')
   * @returns Source location or undefined
   *
   * @example
   * const location = cssRegistry.findIDLocation(
   *   'file:///app/presentation.eligian',
   *   'header'
   * );
   * // location = { filePath: 'file:///app/styles.css', startLine: 10, ... }
   */
  findIDLocation(documentUri: string, idName: string): SourceLocation | undefined;

  /**
   * Get the CSS rule text for a class.
   *
   * Returns:
   * - Full CSS rule text (e.g., ".button { color: blue; }")
   * - undefined if class does not exist or CSS files not parsed
   *
   * Use case: Hover preview feature (Spec 2)
   *
   * @param documentUri - Absolute Eligian document URI
   * @param className - CSS class name (without leading '.')
   * @returns CSS rule text or undefined
   *
   * @example
   * const rule = cssRegistry.getClassRule(
   *   'file:///app/presentation.eligian',
   *   'button'
   * );
   * // rule = ".button {\n  color: blue;\n  padding: 10px;\n}"
   */
  getClassRule(documentUri: string, className: string): string | undefined;

  /**
   * Get the CSS rule text for an ID.
   *
   * Returns:
   * - Full CSS rule text (e.g., "#header { width: 100%; }")
   * - undefined if ID does not exist or CSS files not parsed
   *
   * @param documentUri - Absolute Eligian document URI
   * @param idName - CSS ID name (without leading '#')
   * @returns CSS rule text or undefined
   *
   * @example
   * const rule = cssRegistry.getIDRule(
   *   'file:///app/presentation.eligian',
   *   'header'
   * );
   * // rule = "#header {\n  width: 100%;\n}"
   */
  getIDRule(documentUri: string, idName: string): string | undefined;

  /**
   * Check if a CSS file has parse errors.
   *
   * Returns:
   * - true if file has syntax errors
   * - false if file is valid or not parsed yet
   *
   * @param fileUri - Absolute CSS file URI
   * @returns Whether file has errors
   *
   * @example
   * if (cssRegistry.hasErrors('file:///app/styles.css')) {
   *   console.error('CSS file has syntax errors');
   * }
   */
  hasErrors(fileUri: string): boolean;

  /**
   * Get parse errors for a CSS file.
   *
   * Returns:
   * - Array of parse errors (if any)
   * - Empty array if file is valid or not parsed yet
   *
   * @param fileUri - Absolute CSS file URI
   * @returns Parse errors
   *
   * @example
   * const errors = cssRegistry.getErrors('file:///app/styles.css');
   * errors.forEach(error => {
   *   console.error(`${error.filePath}:${error.line}:${error.column}: ${error.message}`);
   * });
   */
  getErrors(fileUri: string): CSSParseError[];

  /**
   * Clear all metadata for a document.
   *
   * Called when:
   * - Document is closed
   * - Workspace is cleaned up
   *
   * Behavior:
   * - Removes import tracking for the document
   * - Does NOT remove CSS file metadata (other documents may still import it)
   *
   * @param documentUri - Absolute Eligian document URI
   *
   * @example
   * cssRegistry.clearDocument('file:///app/presentation.eligian');
   */
  clearDocument(documentUri: string): void;
}
```

---

## Usage Examples

### Validator Integration

```typescript
// packages/language/src/eligian-document-validator.ts

export class EligianDocumentValidator extends DefaultDocumentValidator {
  private readonly cssRegistry: CSSRegistryService;

  constructor(services: EligianServices) {
    super(services);
    this.cssRegistry = services.css.CSSRegistry;
  }

  protected override processValidations(
    document: LangiumDocument<Program>,
    diagnostics: Diagnostic[],
    cancelToken: CancellationToken
  ): Promise<void> {
    // Validate CSS class references
    this.validateCSSReferences(document, diagnostics);

    return super.processValidations(document, diagnostics, cancelToken);
  }

  private validateCSSReferences(
    document: LangiumDocument<Program>,
    diagnostics: Diagnostic[]
  ): void {
    const documentUri = document.uri.toString();
    const availableClasses = this.cssRegistry.getClassesForDocument(documentUri);
    const availableIDs = this.cssRegistry.getIDsForDocument(documentUri);

    // Walk AST and validate operation parameters
    streamAllContents(document.parseResult.value).forEach(node => {
      if (isOperationStatement(node)) {
        this.validateOperationStatement(node, availableClasses, availableIDs, diagnostics);
      }
    });
  }

  private validateOperationStatement(
    node: OperationStatement,
    availableClasses: Set<string>,
    availableIDs: Set<string>,
    diagnostics: Diagnostic[]
  ): void {
    const opSpec = operationRegistry.get(node.name);
    if (!opSpec) return;

    // Check parameters with ParameterType.className
    for (const [paramName, paramType] of Object.entries(opSpec.parameters)) {
      if (paramType === ParameterType.className) {
        const value = node.parameters[paramName];
        if (typeof value === 'string' && !availableClasses.has(value)) {
          // Unknown class - generate error with suggestions
          const suggestions = findSimilarClasses(value, availableClasses, 2, 3);
          const message = suggestions.length > 0
            ? `Unknown CSS class: '${value}'. Did you mean: ${suggestions.join(', ')}?`
            : `Unknown CSS class: '${value}'`;

          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: getNodeRange(node),
            message,
            code: 'unknown-css-class',
          });
        }
      }

      // Check parameters with ParameterType.selector
      if (paramType === ParameterType.selector) {
        const value = node.parameters[paramName];
        if (typeof value === 'string') {
          const parsed = parseSelector(value);

          if (!parsed.valid) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: getNodeRange(node),
              message: `Invalid CSS selector syntax: ${parsed.error}`,
              code: 'invalid-selector-syntax',
            });
            return;
          }

          // Validate each class in selector
          for (const className of parsed.classes) {
            if (!availableClasses.has(className)) {
              const suggestions = findSimilarClasses(className, availableClasses, 2, 3);
              const message = suggestions.length > 0
                ? `Unknown CSS class in selector: '${className}'. Did you mean: ${suggestions.join(', ')}?`
                : `Unknown CSS class in selector: '${className}'`;

              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: getNodeRange(node),
                message,
                code: 'unknown-css-class',
              });
            }
          }

          // Validate each ID in selector
          for (const idName of parsed.ids) {
            if (!availableIDs.has(idName)) {
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: getNodeRange(node),
                message: `Unknown CSS ID in selector: '${idName}'`,
                code: 'unknown-css-id',
              });
            }
          }
        }
      }
    }
  }
}
```

### LSP Notification Handler

```typescript
// packages/language/src/main.ts

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { CSS_UPDATED_NOTIFICATION, CSS_ERROR_NOTIFICATION } from './lsp/css-notifications';
import { parseCSS } from './css/css-parser';

const connection = createConnection(ProposedFeatures.all);
const services = createEligianServices({ connection });
const cssRegistry = services.Eligian.css.CSSRegistry;

// Register CSS update notification handler
connection.onNotification(CSS_UPDATED_NOTIFICATION, async (params: CSSUpdatedParams) => {
  try {
    // 1. Read CSS file content
    const cssContent = await fs.readFile(URI.parse(params.cssFileUri).fsPath, 'utf-8');

    // 2. Parse CSS
    const metadata = parseCSS(cssContent, params.cssFileUri);

    // 3. Update registry
    cssRegistry.updateCSSFile(params.cssFileUri, metadata);

    // 4. Trigger re-validation of importing documents
    for (const documentUri of params.documentUris) {
      const document = services.shared.workspace.LangiumDocuments.getDocument(URI.parse(documentUri));
      if (document) {
        // Re-validate document (triggers CSS validation)
        await services.shared.workspace.DocumentBuilder.update([URI.parse(documentUri)], []);
      }
    }
  } catch (error) {
    console.error(`Failed to update CSS file ${params.cssFileUri}:`, error);
  }
});

// Register CSS error notification handler
connection.onNotification(CSS_ERROR_NOTIFICATION, (params: CSSErrorParams) => {
  // Store error metadata in registry
  cssRegistry.updateCSSFile(params.cssFileUri, {
    classes: new Set(),
    ids: new Set(),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors: params.errors,
  });
});

startLanguageServer(services);
```

### Extension CSS Watcher

```typescript
// packages/extension/src/extension/css-watcher.ts

export class CSSWatcherManager {
  private fileWatcher: FileSystemWatcher | undefined;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private workspaceRoot: string,
    private client: LanguageClient
  ) {}

  private async handleCSSFileChange(uri: Uri): Promise<void> {
    const cssFileUri = uri.toString();

    // 1. Find which .eligian documents import this CSS
    const documentUris = this.findImportingDocuments(cssFileUri);

    // 2. Send LSP notification to language server
    this.client.sendNotification(CSS_UPDATED_NOTIFICATION, {
      cssFileUri,
      documentUris,
    });

    // 3. Notify webview for preview hot-reload (existing Feature 011)
    this.notifyWebview(cssFileUri);
  }

  private findImportingDocuments(cssFileUri: string): string[] {
    // Return list of .eligian documents that import this CSS
    // (Implementation uses tracking map populated during document parsing)
    return Array.from(this.importsByCSS.get(cssFileUri) ?? []);
  }

  registerImports(documentUri: string, cssFileUris: string[]): void {
    // Track which documents import which CSS files
    for (const cssUri of cssFileUris) {
      if (!this.importsByCSS.has(cssUri)) {
        this.importsByCSS.set(cssUri, new Set());
      }
      this.importsByCSS.get(cssUri)!.add(documentUri);
    }
  }
}
```

---

## Error Handling

### Invalid CSS File

When a CSS file has syntax errors, the registry stores error metadata:

```typescript
cssRegistry.updateCSSFile('file:///app/styles.css', {
  classes: new Set(),         // Empty - no classes available
  ids: new Set(),            // Empty - no IDs available
  classLocations: new Map(),
  idLocations: new Map(),
  classRules: new Map(),
  idRules: new Map(),
  errors: [
    {
      message: "Unclosed block",
      filePath: "file:///app/styles.css",
      line: 5,
      column: 10,
      source: "> 5 | .button {\n    |          ^",
    },
  ],
});

// Validator checks for errors
if (cssRegistry.hasErrors('file:///app/styles.css')) {
  const errors = cssRegistry.getErrors('file:///app/styles.css');
  // Show error in Eligian document at CSS import statement
  accept('error', `CSS file has syntax errors: ${errors[0].message}`, {
    node: cssImportNode,
  });
}
```

### Missing CSS File

When a CSS file is deleted or not found:

```typescript
const metadata = cssRegistry.getMetadata('file:///app/missing.css');
if (!metadata) {
  // CSS file not parsed yet or deleted
  accept('error', 'CSS file not found: missing.css', {
    node: cssImportNode,
  });
}
```

---

## Performance Guarantees

### Time Complexity

- `updateCSSFile()`: O(1) - Map insertion
- `getMetadata()`: O(1) - Map lookup
- `registerImports()`: O(n) where n = number of imports (typically < 10)
- `getClassesForDocument()`: O(m) where m = number of imported CSS files × classes per file (typically < 1000)
- `findClassLocation()`: O(k) where k = number of imported CSS files (typically < 10)

### Space Complexity

- O(F × C) where F = number of CSS files, C = average classes per file
- Typical: 10 files × 100 classes = ~10KB total

### Success Criteria Compliance

- **SC-001**: Validation < 50ms ✅
  - `getClassesForDocument()` + validation loop < 10ms for typical document
- **SC-002**: Hot-reload < 300ms ✅
  - `updateCSSFile()` + re-validation < 100ms

---

## Thread Safety

**Single-threaded**: Langium language server runs in single-threaded Node.js environment.

**No concurrency issues**: All registry operations are synchronous and execute on the main thread.

**LSP notifications are serialized**: VS Code LSP client sends notifications sequentially.

---

## Testing Strategy

### Unit Tests

Test each method in isolation:

```typescript
describe('CSSRegistryService', () => {
  let registry: CSSRegistryService;

  beforeEach(() => {
    registry = new CSSRegistryService();
  });

  it('should store and retrieve CSS metadata', () => {
    const metadata: CSSMetadata = {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    };

    registry.updateCSSFile('file:///app/styles.css', metadata);
    expect(registry.getMetadata('file:///app/styles.css')).toEqual(metadata);
  });

  it('should return classes from imported CSS files', () => {
    registry.updateCSSFile('file:///app/base.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    registry.updateCSSFile('file:///app/theme.css', {
      classes: new Set(['primary']),
      ids: new Set(),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    registry.registerImports('file:///app/presentation.eligian', [
      'file:///app/base.css',
      'file:///app/theme.css',
    ]);

    const classes = registry.getClassesForDocument('file:///app/presentation.eligian');
    expect(classes).toEqual(new Set(['button', 'primary']));
  });

  it('should find class location from first imported CSS file', () => {
    const location: SourceLocation = {
      filePath: 'file:///app/base.css',
      startLine: 5,
      startColumn: 1,
      endLine: 5,
      endColumn: 7,
    };

    registry.updateCSSFile('file:///app/base.css', {
      classes: new Set(['button']),
      ids: new Set(),
      classLocations: new Map([['button', location]]),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    });

    registry.registerImports('file:///app/presentation.eligian', [
      'file:///app/base.css',
    ]);

    expect(registry.findClassLocation('file:///app/presentation.eligian', 'button')).toEqual(location);
  });

  it('should return undefined for unknown class', () => {
    registry.registerImports('file:///app/presentation.eligian', []);
    expect(registry.findClassLocation('file:///app/presentation.eligian', 'button')).toBeUndefined();
  });
});
```

### Integration Tests

Test with real Eligian documents:

```typescript
describe('CSS Validation Integration', () => {
  it('should validate CSS class references', async () => {
    const cssContent = `
      .button { color: blue; }
      .primary { background: green; }
    `;

    const eligianContent = `
      styles "./styles.css"

      action fadeIn [
        addClass("button")    // ✅ Valid
        addClass("primry")    // ❌ Error: Did you mean: primary?
      ]
    `;

    // Parse CSS → update registry
    const metadata = parseCSS(cssContent, 'file:///app/styles.css');
    cssRegistry.updateCSSFile('file:///app/styles.css', metadata);

    // Parse Eligian → validate
    const document = await parseDocument(eligianContent);
    const diagnostics = await validate(document);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('Did you mean: primary?');
  });
});
```

---

## Contract Status

✅ **Interface Defined**: All methods documented with signatures, parameters, return types
✅ **Examples Provided**: Usage examples for validators, LSP handlers, extension
✅ **Error Handling**: Documented behavior for invalid CSS, missing files
✅ **Performance**: Complexity analysis and success criteria compliance
✅ **Testing**: Unit and integration test strategies defined

**Ready for Implementation**: Yes
