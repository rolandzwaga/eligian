# Research: CSS Class and Selector Validation

**Created**: 2025-10-26
**Feature**: Spec 1 - Validation Infrastructure
**Purpose**: Technical research for Phase 0 tasks (R1-R5)

---

## R1: PostCSS API for CSS Parsing

### Overview

PostCSS is already a dependency from Feature 011 (CSS file watching). We'll use it to parse CSS files and extract class/ID definitions with source locations.

### Key APIs

#### 1. Parsing CSS Files

```typescript
import postcss from 'postcss';

// Parse CSS string
const result = postcss.parse(cssContent, {
  from: filePath  // Required for error reporting
});

// Access the root node
const root = result.root;
```

#### 2. Extracting Class Names from Rules

Use `walkRules()` to iterate through all CSS rules:

```typescript
import postcss, { Rule } from 'postcss';

const classes = new Set<string>();
const classLocations = new Map<string, SourceLocation>();

root.walkRules((rule: Rule) => {
  // rule.selector contains the full selector string (e.g., ".button.primary")
  // We'll use postcss-selector-parser to extract individual classes
  // See R2 for selector parsing details
});
```

**Important**: `rule.selector` is a string - we need postcss-selector-parser to parse it into individual classes.

#### 3. Getting Source Locations

PostCSS provides line/column information for all nodes:

```typescript
import { Rule } from 'postcss';

root.walkRules((rule: Rule) => {
  const location = {
    filePath: rule.source?.input.file ?? 'unknown',
    startLine: rule.source?.start?.line ?? 0,
    startColumn: rule.source?.start?.column ?? 0,
    endLine: rule.source?.end?.line ?? 0,
    endColumn: rule.source?.end?.column ?? 0,
  };

  // Store location for error reporting and hover features
});
```

**Note**: All PostCSS locations are 1-based (line 1, column 1 = start of file).

#### 4. Handling CSS Syntax Errors

PostCSS throws `CssSyntaxError` for invalid CSS:

```typescript
import postcss, { CssSyntaxError } from 'postcss';

try {
  const result = postcss.parse(cssContent, { from: filePath });
  // Success - process rules
} catch (error) {
  if (error instanceof CssSyntaxError) {
    // Extract error details
    const parseError = {
      message: error.message,
      filePath: error.file ?? 'unknown',
      line: error.line ?? 0,
      column: error.column ?? 0,
      source: error.source,  // CSS source snippet
      showSourceCode: error.showSourceCode(),  // Formatted error with context
    };

    // Example error message:
    // "CssSyntaxError: test.css:3:5: Unclosed block"
    // > 3 | .button {
    //     |     ^
  } else {
    // Unexpected error (file read error, etc.)
    throw error;
  }
}
```

**Key Points**:
- `CssSyntaxError` includes line/column precision
- `showSourceCode()` provides formatted output with context (useful for debugging)
- Always pass `{ from: filePath }` to `parse()` for better error messages

#### 5. Extracting CSS Rule Definitions

For future hover features (Spec 2), we need the full CSS rule text:

```typescript
import { Rule } from 'postcss';

const classRules = new Map<string, string>();

root.walkRules((rule: Rule) => {
  // rule.toString() gives the full rule including selector and declarations
  const ruleText = rule.toString();
  // Example: ".button { color: blue; font-size: 16px; }"

  // Store for each class in the selector
  // (We'll use postcss-selector-parser to extract classes)
});
```

### Implementation Strategy

**css-parser.ts** should export:

```typescript
export interface CSSParseResult {
  classes: Set<string>;                      // All class names (e.g., "button", "primary")
  ids: Set<string>;                          // All ID names (e.g., "header", "main")
  classLocations: Map<string, SourceLocation>;  // Class name → definition location
  idLocations: Map<string, SourceLocation>;     // ID name → definition location
  classRules: Map<string, string>;           // Class name → CSS rule text
  idRules: Map<string, string>;              // ID name → CSS rule text
  errors: CSSParseError[];                   // Syntax errors (if any)
}

export interface SourceLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CSSParseError {
  message: string;
  filePath: string;
  line: number;
  column: number;
  source?: string;  // CSS source snippet
}

export function parseCSS(cssContent: string, filePath: string): CSSParseResult;
```

**Workflow**:
1. `postcss.parse()` → root AST
2. `root.walkRules()` → iterate rules
3. For each rule: parse `rule.selector` with postcss-selector-parser (see R2)
4. Extract classes/IDs and store locations
5. Catch `CssSyntaxError` → store in `errors` array

---

## R2: postcss-selector-parser API

### Overview

**NEW DEPENDENCY**: `postcss-selector-parser@^6.0.15`

This library parses complex CSS selectors into an AST, allowing us to extract individual classes and IDs while ignoring pseudo-classes, combinators, and attributes.

### Key APIs

#### 1. Basic Selector Parsing

```typescript
import selectorParser from 'postcss-selector-parser';

// Create a processor with a transformation callback
const processor = selectorParser((selectors) => {
  // selectors is the root container node
  // Walk through all nodes
});

// Parse a selector string
const result = processor.processSync('.button.primary');
```

#### 2. Extracting Classes from Selectors

Use `walkClasses()` to iterate through all class nodes:

```typescript
import selectorParser, { Root, ClassName } from 'postcss-selector-parser';

const classes = new Set<string>();

const processor = selectorParser((root: Root) => {
  root.walkClasses((classNode: ClassName) => {
    classes.add(classNode.value);  // "button", "primary", etc.
  });
});

processor.processSync('.button.primary > .card');
// classes = Set { "button", "primary", "card" }
```

**Key Point**: `walkClasses()` only returns class nodes (`.className`), ignoring:
- Pseudo-classes (`:hover`, `:nth-child(2)`)
- Pseudo-elements (`::before`, `::after`)
- Attributes (`[disabled]`, `[data-foo="bar"]`)
- Combinators (`>`, `+`, `~`, space)

#### 3. Extracting IDs from Selectors

Use `walkIds()` to iterate through all ID nodes:

```typescript
import selectorParser, { Root, Identifier } from 'postcss-selector-parser';

const ids = new Set<string>();

const processor = selectorParser((root: Root) => {
  root.walkIds((idNode: Identifier) => {
    ids.add(idNode.value);  // "header", "main", etc.
  });
});

processor.processSync('#header.active > #main');
// ids = Set { "header", "main" }
```

#### 4. Handling Invalid Selector Syntax

postcss-selector-parser throws `Error` for invalid selectors:

```typescript
import selectorParser from 'postcss-selector-parser';

const processor = selectorParser(() => {});

try {
  processor.processSync('.button[');  // Unclosed attribute selector
} catch (error) {
  // Error: Unexpected "["
  // (Error messages vary - not CssSyntaxError like PostCSS)
}
```

**Important**: Errors from postcss-selector-parser are generic `Error` objects, NOT `CssSyntaxError`. We need to catch and convert them.

#### 5. Using `root.error()` for Better Error Reporting

When processing selectors within a PostCSS rule, use `root.error()` for consistent error formatting:

```typescript
import selectorParser from 'postcss-selector-parser';
import postcss from 'postcss';

const processor = selectorParser((root) => {
  root.walkClasses((classNode) => {
    // Validation logic
    if (classNode.value.includes('_')) {
      // Throw error with source location
      throw root.error('Class names may not contain underscores', {
        index: classNode.sourceIndex,
        word: classNode.value,
      });
    }
  });
});

// Within a PostCSS plugin
postcss.plugin('validator', () => {
  return (cssRoot) => {
    cssRoot.walkRules((rule) => {
      try {
        processor.processSync(rule);
      } catch (error) {
        // Error includes line/column from original CSS file
        console.error(error.toString());
        // "CssSyntaxError: test.css:1:5: Class names may not contain underscores"
      }
    });
  };
});
```

**Best Practice**: When validating selectors from a CSS file, use `root.error()` to get CssSyntaxError with proper line/column info.

#### 6. Node Types and Type Guards

postcss-selector-parser provides node type constants:

```typescript
import selectorParser from 'postcss-selector-parser';

// Node type constants (useful for filtering)
selectorParser.CLASS;       // 'class'
selectorParser.ID;          // 'id'
selectorParser.COMBINATOR;  // 'combinator'
selectorParser.PSEUDO;      // 'pseudo'
selectorParser.ATTRIBUTE;   // 'attribute'
selectorParser.TAG;         // 'tag'
selectorParser.UNIVERSAL;   // 'universal'
selectorParser.COMMENT;     // 'comment'
selectorParser.NESTING;     // 'nesting' (&)

// Check node type
if (node.type === 'class') {
  // node is a ClassName
}
```

#### 7. Synchronous vs. Asynchronous Processing

Both sync and async processing are supported:

```typescript
// Synchronous (recommended for our use case)
const result = processor.processSync('.button');

// Asynchronous (returns Promise)
const result = await processor.process('.button');
```

**Recommendation**: Use `processSync()` for simplicity - CSS parsing is fast and doesn't require async.

### Implementation Strategy

**selector-parser.ts** should export:

```typescript
export interface ParsedSelector {
  classes: string[];        // All class names in selector
  ids: string[];           // All ID names in selector
  valid: boolean;          // Whether selector syntax is valid
  error?: string;          // Error message (if invalid)
}

export function parseSelector(selector: string): ParsedSelector;
```

**Workflow**:
1. Create processor with `selectorParser()`
2. Use `walkClasses()` and `walkIds()` to extract names
3. Wrap in try/catch to handle syntax errors
4. Return `ParsedSelector` with results or error

**Example Implementation**:

```typescript
import selectorParser from 'postcss-selector-parser';

export function parseSelector(selector: string): ParsedSelector {
  const classes: string[] = [];
  const ids: string[] = [];

  try {
    const processor = selectorParser((root) => {
      root.walkClasses((classNode) => {
        classes.push(classNode.value);
      });
      root.walkIds((idNode) => {
        ids.push(idNode.value);
      });
    });

    processor.processSync(selector);

    return { classes, ids, valid: true };
  } catch (error) {
    return {
      classes: [],
      ids: [],
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid selector syntax',
    };
  }
}
```

### Edge Cases to Handle

1. **Empty selectors**: `""` → `{ classes: [], ids: [], valid: true }`
2. **Whitespace-only**: `"   "` → `{ classes: [], ids: [], valid: true }`
3. **No classes/IDs**: `"div > span"` → `{ classes: [], ids: [], valid: true }`
4. **Multiple classes**: `".a.b.c"` → `{ classes: ['a', 'b', 'c'], ids: [], valid: true }`
5. **Mixed classes/IDs**: `"#foo.bar"` → `{ classes: ['bar'], ids: ['foo'], valid: true }`
6. **Pseudo-classes ignored**: `".button:hover"` → `{ classes: ['button'], ids: [], valid: true }`
7. **Invalid syntax**: `".button["` → `{ classes: [], ids: [], valid: false, error: '...' }`

---

## R3: Langium Service Registration

### Overview

Langium uses dependency injection to manage services. We need to create a `CSSRegistryService` and register it in the `EligianModule`.

### Key Patterns from Codebase

#### 1. Service Interface Definition

Services are defined in `EligianAddedServices` type in **eligian-module.ts**:

```typescript
// packages/language/src/eligian-module.ts (lines 27-36)
export type EligianAddedServices = {
  validation: {
    EligianValidator: EligianValidator;
  };
  lsp: {
    HoverProvider: EligianHoverProvider;
    CompletionProvider: EligianCompletionProvider;
  };
  typir: TypirLangiumServices<EligianSpecifics>;
};

export type EligianServices = LangiumServices & EligianAddedServices;
```

**Our Addition**:

```typescript
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
```

#### 2. Service Registration in Module

Services are registered in `EligianModule` object using factory functions:

```typescript
// packages/language/src/eligian-module.ts (lines 49-69)
export const EligianModule: Module<EligianServices, PartialLangiumServices & EligianAddedServices> = {
  references: {
    ScopeProvider: services => new EligianScopeProvider(services),
  },
  validation: {
    EligianValidator: () => new EligianValidator(),
    DocumentValidator: services => new EligianDocumentValidator(services),
  },
  lsp: {
    HoverProvider: services => new EligianHoverProvider(services),
    CompletionProvider: services => new EligianCompletionProvider(services),
  },
  typir: services =>
    createTypirLangiumServices(
      services.shared,
      new EligianAstReflection(),
      new EligianTypeSystem(),
      {}
    ),
};
```

**Our Addition**:

```typescript
export const EligianModule: Module<EligianServices, PartialLangiumServices & EligianAddedServices> = {
  // ... existing services
  css: {
    CSSRegistry: () => new CSSRegistryService(),  // NEW
  },
};
```

**Key Points**:
- Factory function `() => new CSSRegistryService()` creates a singleton instance
- Services that need other services use `(services) => new Service(services)` pattern
- `CSSRegistryService` likely won't need injected services (stateful registry)

#### 3. Service Injection in Validators

Access services via the injected `services` parameter:

```typescript
// packages/language/src/eligian-validator.ts
export class EligianValidator {
  // NO constructor - stateless validator

  checkClassName(
    node: OperationStatement,
    accept: ValidationAcceptor
  ): void {
    // How to access CSSRegistry here?
    // We need to inject services into checkClassName
  }
}
```

**Problem**: `EligianValidator` methods don't receive `services` parameter - they only get `node` and `accept`.

**Solution**: Use `DocumentValidator` pattern (see R4 for LSP notifications):

```typescript
// packages/language/src/eligian-document-validator.ts (lines 10-30)
export class EligianDocumentValidator extends DefaultDocumentValidator {
  private readonly cssRegistry: CSSRegistryService;

  constructor(services: EligianServices) {
    super(services);
    this.cssRegistry = services.css.CSSRegistry;  // Inject CSS registry
  }

  protected override processValidations(
    document: LangiumDocument,
    diagnostics: Diagnostic[],
    cancelToken: CancellationToken
  ): Promise<void> {
    // Custom validation logic using this.cssRegistry
    const cssMetadata = this.cssRegistry.getMetadataForDocument(document.uri);
    // ... validate against CSS classes

    return super.processValidations(document, diagnostics, cancelToken);
  }
}
```

**Workflow**:
1. `EligianDocumentValidator` receives `services` in constructor
2. Extract `CSSRegistryService` from `services.css.CSSRegistry`
3. Store as instance variable
4. Use in `processValidations()` to validate CSS classes

#### 4. Service Initialization

Services are created in `createEligianServices()`:

```typescript
// packages/language/src/eligian-module.ts (lines 86-104)
export function createEligianServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Eligian: EligianServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    EligianGeneratedSharedModule
  );

  const Eligian = inject(
    createDefaultModule({ shared }),
    EligianGeneratedModule,
    EligianModule  // Our custom services injected here
  );

  shared.ServiceRegistry.register(Eligian);
  initializeLangiumTypirServices(Eligian, Eligian.typir);
  registerValidationChecks(Eligian);

  return { shared, Eligian };
}
```

**No changes needed** - `inject()` automatically instantiates our `CSSRegistryService` factory.

### Implementation Strategy

**CSSRegistryService Interface** (css/css-registry.ts):

```typescript
export class CSSRegistryService {
  // Map of CSS file URI → parsed metadata
  private metadataByFile = new Map<string, CSSMetadata>();

  // Map of Eligian document URI → imported CSS file URIs
  private importsByDocument = new Map<string, Set<string>>();

  // Update CSS file metadata (called on file change)
  updateCSSFile(fileUri: string, metadata: CSSMetadata): void;

  // Get metadata for a CSS file
  getMetadata(fileUri: string): CSSMetadata | undefined;

  // Register which CSS files a document imports
  registerImports(documentUri: string, cssFileUris: string[]): void;

  // Get all classes available to a document
  getClassesForDocument(documentUri: string): Set<string>;

  // Get all IDs available to a document
  getIDsForDocument(documentUri: string): Set<string>;

  // Find definition location of a class
  findClassLocation(documentUri: string, className: string): SourceLocation | undefined;

  // Find definition location of an ID
  findIDLocation(documentUri: string, idName: string): SourceLocation | undefined;

  // Get CSS rule for a class (for hover feature)
  getClassRule(documentUri: string, className: string): string | undefined;
}
```

**Registration**:

1. Add `CSSRegistryService` to `EligianAddedServices` under `css` namespace
2. Add factory function to `EligianModule.css.CSSRegistry`
3. Inject into `EligianDocumentValidator` constructor
4. Use in validation logic

---

## R4: LSP Custom Notifications

### Overview

We need LSP custom notifications to communicate CSS file changes from the VS Code extension to the language server:

- `css/updated` - Notify server that CSS file was updated
- `css/error` - Notify server that CSS file has parse errors

### LSP Notification Protocol

LSP supports custom notifications via `workspace/notification` or custom notification types.

**Standard Pattern**:

```typescript
// Extension → Language Server notification
connection.sendNotification('custom/notificationType', { ...params });

// Language Server receives notification
connection.onNotification('custom/notificationType', (params) => {
  // Handle notification
});
```

### Existing Pattern in Codebase

The codebase doesn't currently use custom LSP notifications, but Langium provides the infrastructure.

**Language Server Connection**:

```typescript
// packages/language/src/main.ts (language server entry point)
import { startLanguageServer } from 'langium/lsp';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';

const connection = createConnection(ProposedFeatures.all);

startLanguageServer({
  connection,
  // ... services
});
```

**Extension Connection**:

```typescript
// packages/extension/src/extension/main.ts (extension entry point)
import { LanguageClient } from 'vscode-languageclient/node';

const client = new LanguageClient(
  'eligian',
  'Eligian Language Server',
  serverOptions,
  clientOptions
);

await client.start();
```

### Implementation Strategy

#### 1. Define Notification Types

Create **packages/language/src/lsp/css-notifications.ts**:

```typescript
// Notification type constants
export const CSS_UPDATED_NOTIFICATION = 'eligian/cssUpdated';
export const CSS_ERROR_NOTIFICATION = 'eligian/cssError';

// Notification parameter types
export interface CSSUpdatedParams {
  cssFileUri: string;       // URI of changed CSS file
  documentUris: string[];   // URIs of Eligian documents that import it
}

export interface CSSErrorParams {
  cssFileUri: string;       // URI of CSS file with errors
  errors: CSSParseError[];  // Parse errors
}

export interface CSSParseError {
  message: string;
  line: number;
  column: number;
  source?: string;
}
```

#### 2. Send Notifications from Extension

In **packages/extension/src/extension/css-watcher.ts**, when CSS file changes:

```typescript
import { LanguageClient } from 'vscode-languageclient/node';
import { CSS_UPDATED_NOTIFICATION, CSS_ERROR_NOTIFICATION } from '../language/lsp/css-notifications';

export class CSSWatcherManager {
  constructor(private client: LanguageClient) {}

  private async handleCSSFileChange(cssFileUri: string) {
    // 1. Load CSS file
    const cssContent = await loadCSSFile(cssFileUri);

    // 2. Find which .eligian documents import this CSS
    const documentUris = this.findImportingDocuments(cssFileUri);

    // 3. Send notification to language server
    this.client.sendNotification(CSS_UPDATED_NOTIFICATION, {
      cssFileUri,
      documentUris,
    });
  }

  private async handleCSSParseError(cssFileUri: string, errors: CSSParseError[]) {
    // Send error notification
    this.client.sendNotification(CSS_ERROR_NOTIFICATION, {
      cssFileUri,
      errors,
    });
  }
}
```

**Key Points**:
- Extension already knows which CSS files are imported (from `CSSWatcherManager`)
- Extension sends notification when CSS changes
- Language server processes notification and updates `CSSRegistryService`

#### 3. Receive Notifications in Language Server

In **packages/language/src/main.ts**, register notification handlers:

```typescript
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { CSS_UPDATED_NOTIFICATION, CSS_ERROR_NOTIFICATION } from './lsp/css-notifications';
import { startLanguageServer } from 'langium/lsp';
import { createEligianServices } from './eligian-module';

const connection = createConnection(ProposedFeatures.all);
const services = createEligianServices({ connection });

// Register CSS notification handlers
connection.onNotification(CSS_UPDATED_NOTIFICATION, (params: CSSUpdatedParams) => {
  const cssRegistry = services.Eligian.css.CSSRegistry;

  // 1. Parse CSS file (using css-parser.ts)
  const metadata = parseCSS(params.cssFileUri);

  // 2. Update registry
  cssRegistry.updateCSSFile(params.cssFileUri, metadata);

  // 3. Trigger re-validation of importing documents
  for (const documentUri of params.documentUris) {
    const document = services.shared.workspace.LangiumDocuments.getDocument(documentUri);
    if (document) {
      // Re-validate document (triggers CSS validation)
      services.shared.workspace.DocumentBuilder.update([documentUri], []);
    }
  }
});

connection.onNotification(CSS_ERROR_NOTIFICATION, (params: CSSErrorParams) => {
  const cssRegistry = services.Eligian.css.CSSRegistry;

  // Store error metadata
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

**Workflow**:
1. Extension detects CSS file change
2. Extension sends `eligian/cssUpdated` notification with CSS file URI
3. Language server receives notification
4. Language server re-parses CSS file → updates `CSSRegistryService`
5. Language server triggers re-validation of importing documents
6. Validation uses updated CSS metadata from registry

#### 4. Integration with CSSWatcherManager

Extend existing **packages/extension/src/extension/css-watcher.ts**:

```typescript
export class CSSWatcherManager {
  private fileWatcher: FileSystemWatcher | undefined;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  // NEW: Store LanguageClient reference
  constructor(
    private workspaceRoot: string,
    private client: LanguageClient  // Injected from extension
  ) {}

  // Existing method (from Feature 011)
  private handleCSSFileChange(uri: Uri): void {
    const cssFileUri = uri.toString();

    // Existing: Notify webview for preview hot-reload
    this.notifyWebview(cssFileUri);

    // NEW: Notify language server for validation update
    this.notifyLanguageServer(cssFileUri);
  }

  // NEW: Send LSP notification
  private async notifyLanguageServer(cssFileUri: string): Promise<void> {
    // Find which .eligian documents import this CSS
    const documentUris = this.findImportingDocuments(cssFileUri);

    // Send notification
    this.client.sendNotification(CSS_UPDATED_NOTIFICATION, {
      cssFileUri,
      documentUris,
    });
  }

  // NEW: Track CSS imports per document
  registerImports(documentUri: string, cssFileUris: string[]): void {
    // Store mapping: document → CSS files
    // (Called when .eligian file is parsed)
  }

  private findImportingDocuments(cssFileUri: string): string[] {
    // Return list of .eligian documents that import this CSS
  }
}
```

**Design Decision**: `CSSWatcherManager` handles BOTH:
1. Preview hot-reload (existing Feature 011)
2. Language server validation updates (new Feature 013)

This avoids duplicate file watchers and maintains consistency.

---

## R5: Levenshtein Distance Algorithm

### Overview

Levenshtein distance measures the minimum number of single-character edits (insertions, deletions, substitutions) needed to transform one string into another. We'll use it for "Did you mean?" suggestions.

### Algorithm

**Standard Dynamic Programming Implementation**:

```typescript
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column (deletions from a)
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row (insertions into a)
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        // Characters match - no edit needed
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // Take minimum of:
        // - Substitution: matrix[i-1][j-1] + 1
        // - Deletion: matrix[i-1][j] + 1
        // - Insertion: matrix[i][j-1] + 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  // Substitution
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1       // Insertion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}
```

**Time Complexity**: O(m × n) where m = length of a, n = length of b
**Space Complexity**: O(m × n) for the matrix

### Finding Suggestions

To find "Did you mean?" suggestions, compute distance for all available classes:

```typescript
export function findSimilarClasses(
  unknownClass: string,
  availableClasses: Set<string>,
  maxDistance = 2,
  maxSuggestions = 3
): string[] {
  const suggestions: Array<{ name: string; distance: number }> = [];

  for (const className of availableClasses) {
    const distance = levenshteinDistance(unknownClass, className);

    if (distance <= maxDistance) {
      suggestions.push({ name: className, distance });
    }
  }

  // Sort by distance (closest first), then alphabetically
  suggestions.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.name.localeCompare(b.name);
  });

  // Return top N suggestions
  return suggestions.slice(0, maxSuggestions).map(s => s.name);
}
```

**Example**:

```typescript
const availableClasses = new Set(['button', 'primary', 'secondary', 'disabled']);

findSimilarClasses('primry', availableClasses, 2, 3);
// Returns: ['primary'] (distance = 1)

findSimilarClasses('buton', availableClasses, 2, 3);
// Returns: ['button'] (distance = 1)

findSimilarClasses('xyz', availableClasses, 2, 3);
// Returns: [] (all distances > 2)
```

### Optimization: Early Exit

For large class lists, we can optimize by:

1. **Case-insensitive comparison**: Convert both strings to lowercase before comparing
2. **Length filtering**: If `|len(a) - len(b)| > maxDistance`, skip (impossible to match)
3. **Early exit**: If distance exceeds maxDistance during computation, abort early

**Optimized Version**:

```typescript
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance?: number
): number {
  const lenA = a.length;
  const lenB = b.length;

  // Early exit: length difference exceeds max distance
  if (maxDistance !== undefined && Math.abs(lenA - lenB) > maxDistance) {
    return maxDistance + 1;
  }

  // ... standard DP algorithm ...

  // Early exit within loop
  if (maxDistance !== undefined) {
    // If current row minimum exceeds maxDistance, abort
    const rowMin = Math.min(...matrix[i]);
    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[lenA][lenB];
}
```

### Implementation Strategy

**levenshtein.ts** exports:

```typescript
export function levenshteinDistance(a: string, b: string, maxDistance?: number): number;

export function findSimilarClasses(
  unknownClass: string,
  availableClasses: Set<string>,
  maxDistance?: number,
  maxSuggestions?: number
): string[];
```

**Usage in Validator**:

```typescript
import { findSimilarClasses } from './css/levenshtein';

// In CSS class validation
const availableClasses = cssRegistry.getClassesForDocument(documentUri);
const suggestions = findSimilarClasses(unknownClass, availableClasses, 2, 3);

if (suggestions.length > 0) {
  accept('error', `Unknown CSS class: '${unknownClass}'. Did you mean: ${suggestions.join(', ')}?`, {
    node,
    property: 'value',
  });
} else {
  accept('error', `Unknown CSS class: '${unknownClass}'`, {
    node,
    property: 'value',
  });
}
```

### Testing Strategy

**Test Cases** (levenshtein.spec.ts):

1. **Exact match**: `levenshteinDistance('foo', 'foo')` → `0`
2. **Single substitution**: `levenshteinDistance('foo', 'foa')` → `1`
3. **Single insertion**: `levenshteinDistance('foo', 'fooo')` → `1`
4. **Single deletion**: `levenshteinDistance('foo', 'fo')` → `1`
5. **Multiple edits**: `levenshteinDistance('kitten', 'sitting')` → `3`
6. **Empty strings**: `levenshteinDistance('', 'foo')` → `3`
7. **Case sensitivity**: `levenshteinDistance('Foo', 'foo')` → `1` (if case-sensitive)

**Suggestion Tests**:

1. **Close match**: `findSimilarClasses('primry', ['primary', 'secondary'])` → `['primary']`
2. **Multiple matches**: `findSimilarClasses('butn', ['button', 'submit'])` → `['button']`
3. **No matches**: `findSimilarClasses('xyz', ['button', 'primary'])` → `[]`
4. **Max suggestions**: `findSimilarClasses('btn', ['button', 'submit', 'btn-lg'], 2, 2)` → `['button', 'submit']` (limited to 2)

---

## Summary

### Phase 0 Research Complete

All research tasks (R1-R5) are now complete:

✅ **R1: PostCSS API** - Parse CSS files, extract classes/IDs, handle errors, get source locations
✅ **R2: postcss-selector-parser API** - Parse selectors, extract classes/IDs, handle invalid syntax
✅ **R3: Langium Service Registration** - Create `CSSRegistryService`, register in module, inject into validators
✅ **R4: LSP Custom Notifications** - Define `eligian/cssUpdated` and `eligian/cssError` notifications
✅ **R5: Levenshtein Distance** - Algorithm for "Did you mean?" suggestions with max distance filtering

### Key Design Decisions

1. **PostCSS + postcss-selector-parser**: Robust CSS and selector parsing with error handling
2. **CSSRegistryService**: Centralized registry for CSS metadata, per-document context
3. **LSP Notifications**: Extension → Language Server communication for CSS changes
4. **Levenshtein Distance**: Max distance = 2, max suggestions = 3 (per spec success criteria)
5. **Reuse CSSWatcherManager**: Single file watcher for both preview and validation

### Next Steps

Proceed to **Phase 1 - Design Artifacts**:

1. **data-model.md** - Define `CSSMetadata`, `ParsedSelector`, `ValidationError` entities
2. **contracts/** - Define `CSSRegistryService` interface contract
3. **quickstart.md** - Usage examples and error code reference

After Phase 1, generate **tasks.md** using `/speckit.tasks`.

---

## References

- **PostCSS Documentation**: https://postcss.org/api/
- **postcss-selector-parser Documentation**: https://github.com/postcss/postcss-selector-parser/blob/master/API.md
- **Langium Documentation**: https://langium.org/docs/
- **LSP Specification**: https://microsoft.github.io/language-server-protocol/
- **Levenshtein Distance**: https://en.wikipedia.org/wiki/Levenshtein_distance

---

**Research Status**: ✅ Complete
**Ready for Phase 1**: Yes
