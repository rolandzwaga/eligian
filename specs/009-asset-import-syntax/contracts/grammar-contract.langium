/**
 * Grammar Contract: Asset Import Syntax
 *
 * This file defines the Langium grammar rules for import statements in Eligian DSL.
 * These rules will be integrated into packages/language/src/eligian.langium
 *
 * Date: 2025-10-25
 * Feature: Asset Import Syntax (009)
 */

// =============================================================================
// Entry Rule Update
// =============================================================================

/**
 * Updated entry rule to support optional import statements at document top
 *
 * CHANGE: Add (imports+=ImportStatement)* before existing rules
 * BACKWARD COMPATIBLE: Existing files without imports still parse correctly
 */
entry EligianDocument:
    (imports+=ImportStatement)*        // NEW: Optional import statements
    (actions+=Action | timeline=Timeline)+;  // EXISTING: Actions and timeline


// =============================================================================
// Import Statement Rules
// =============================================================================

/**
 * Union type for import statements (default or named)
 *
 * Alternatives allow parser to choose between two import syntaxes:
 * 1. DefaultImport: layout './file', styles './file', provider './file'
 * 2. NamedImport: import name from './file' as type?
 */
ImportStatement:
    DefaultImport | NamedImport;


/**
 * Default import statement for auto-assignment to configuration properties
 *
 * Syntax: <type> '<path>'
 * Examples:
 *   layout './layout.html'
 *   styles './main.css'
 *   provider './video.mp4'
 *
 * Keywords: layout, styles, provider (unambiguous parsing)
 * Type: Auto-inferred from extension
 * Assignment: Automatically mapped to config properties
 */
DefaultImport:
    type=('layout' | 'styles' | 'provider') path=STRING;


/**
 * Named import statement for reusable asset references
 *
 * Syntax: import <name> from '<path>' (as <type>)?
 * Examples:
 *   import tooltip from './tooltip.html'
 *   import theme from './theme.css'
 *   import video from './intro.mp4'
 *   import data from './template.txt' as html  // explicit type override
 *
 * Keyword: import (ES module-like syntax)
 * Name: Identifier for referencing the import (must be unique)
 * Type: Inferred from extension OR explicitly specified with 'as' clause
 * Optional: 'as' clause for non-standard extensions or type override
 */
NamedImport:
    'import' name=ID 'from' path=STRING ('as' assetType=AssetType)?;


/**
 * Asset type enum for explicit type specification
 *
 * Values:
 *   html  - HTML files (layouts, content snippets)
 *   css   - CSS stylesheets (styling, class definitions)
 *   media - Video/audio files (timeline providers)
 *
 * Used in: NamedImport 'as' clause for explicit type override
 */
AssetType:
    'html' | 'css' | 'media';


// =============================================================================
// Terminal Rules
// =============================================================================

/**
 * STRING terminal for file paths
 *
 * Matches: Double-quoted or single-quoted strings
 * Examples: "./layout.html", '../theme.css', "./video.mp4"
 *
 * NOTE: Validation of relative vs. absolute paths happens in validators,
 * not at grammar level (allows better error messages)
 */
terminal STRING:
    '"' (!'"')* '"' | "'" !("'")* "'";


/**
 * ID terminal for import names
 *
 * Matches: Valid identifiers (letters, digits, underscores)
 * Examples: tooltip, mainLayout, theme_dark
 *
 * NOTE: Validation of name uniqueness and reserved keywords happens
 * in validators (allows checking against existing names)
 */
terminal ID:
    /[_a-zA-Z][\w_]*/;


// =============================================================================
// Example Valid DSL Code
// =============================================================================

/*
  Example 1: Default imports only

    layout './layout.html'
    styles './main.css'
    provider './video.mp4'

    action fadeIn [
      selectElement(".box")
    ]


  Example 2: Named imports only

    import tooltip from './tooltip.html'
    import modal from './modal.html'
    import theme from './theme.css'

    action showTooltip [
      setElementContent(tooltip)
    ]


  Example 3: Mixed default and named imports

    layout './layout.html'
    styles './main.css'

    import tooltip from './tooltip.html'
    import modal from './components/modal.html'

    action showTooltip [
      setElementContent(tooltip)
    ]


  Example 4: Explicit type override

    import data from './template.txt' as html
    import video from './movie.bin' as media

    action loadTemplate [
      setElementContent(data)
    ]
*/


// =============================================================================
// Generated TypeScript Interfaces (Automatic from Langium)
// =============================================================================

/*
  Langium automatically generates these TypeScript interfaces:

  interface EligianDocument extends AstNode {
      $type: 'EligianDocument';
      imports: ImportStatement[];
      actions: Action[];
      timeline?: Timeline;
  }

  type ImportStatement = DefaultImport | NamedImport;

  interface DefaultImport extends AstNode {
      $type: 'DefaultImport';
      type: 'layout' | 'styles' | 'provider';
      path: string;
  }

  interface NamedImport extends AstNode {
      $type: 'NamedImport';
      name: string;
      path: string;
      assetType?: 'html' | 'css' | 'media';
  }
*/


// =============================================================================
// Integration Notes
// =============================================================================

/*
  To integrate this grammar into packages/language/src/eligian.langium:

  1. Add ImportStatement, DefaultImport, NamedImport, AssetType rules
  2. Update entry rule (EligianDocument) to include imports
  3. Run `npm run langium:generate` to regenerate AST types
  4. Implement validators in packages/language/src/eligian-validator.ts
  5. Add tests in packages/language/src/__tests__/parsing.spec.ts

  Backward Compatibility:
  - (imports+=ImportStatement)* is OPTIONAL (zero or more)
  - Existing files without imports will parse correctly
  - No breaking changes to existing grammar
*/
