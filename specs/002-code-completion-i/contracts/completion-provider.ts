/**
 * TypeScript Interface Contracts for Eligian Code Completion
 *
 * This file defines the public API contracts for the code completion feature.
 * All completion provider modules must implement these interfaces.
 *
 * NOTE: This is a specification file, not production code.
 */

import type { AstNode, LangiumDocument } from 'langium';
import type { CompletionItem, Position } from 'vscode-languageserver';

// =============================================================================
// Completion Context
// =============================================================================

/**
 * Represents the cursor context for determining which completions to show.
 * This context is computed once per completion request and passed to all
 * completion provider modules.
 */
export interface CompletionContext {
  /**
   * AST node at cursor position (from Langium CST utilities)
   * May be undefined if cursor is in whitespace or invalid syntax
   */
  cursorNode?: AstNode;

  /**
   * Is cursor inside a for loop?
   * Used to determine if break/continue keywords should appear
   */
  isInsideLoop: boolean;

  /**
   * Is cursor inside an action block?
   * Used to determine if operations/actions should appear
   */
  isInsideAction: boolean;

  /**
   * Is cursor inside an event definition?
   * Used to determine if event names should appear
   */
  isInsideEvent: boolean;

  /**
   * Is cursor after a variable prefix (@@)?
   * Used to determine if variable names should appear
   */
  isAfterVariablePrefix: boolean;

  /**
   * Is cursor inside an operation call?
   * If set, contains the operation name for parameter completion
   */
  insideOperationCall?: string;

  /**
   * Expected type at cursor (for type-specific completions)
   * Currently unused, reserved for future parameter type-checking
   */
  expectedType?: string;

  /**
   * Langium document being edited
   * Used to find actions defined in the document
   */
  document: LangiumDocument;

  /**
   * Cursor position (line, character)
   * Used for precise offset calculations
   */
  position: Position;
}

// =============================================================================
// Metadata Entities
// =============================================================================

/**
 * Metadata for an Eligius operation
 * Extracted from ../eligius/src/operation/metadata/*.ts at build time
 */
export interface OperationMetadata {
  /** Operation name (e.g., "selectElement", "animate") */
  name: string;

  /** Human-readable description from JSDoc */
  description: string;

  /** Operation parameters */
  parameters: ParameterMetadata[];

  /** Properties this operation expects on operationData (from previous operations) */
  dependencies: string[];

  /** Properties this operation adds to operationData (for next operations) */
  outputs: string[];
}

/**
 * Metadata for an operation parameter
 */
export interface ParameterMetadata {
  /** Parameter name (e.g., "selector", "duration") */
  name: string;

  /** Parameter type (e.g., "ParameterType:string", "ParameterType:number") */
  type: string;

  /** Is this parameter required? */
  required: boolean;

  /** Default value if optional */
  defaultValue?: unknown;

  /** Human-readable parameter description */
  description?: string;
}

/**
 * Metadata for a timeline event
 * Extracted from ../eligius/src/timeline-event-names.ts at build time
 */
export interface TimelineEventMetadata {
  /** Event name (e.g., "timeline-play", "timeline-pause") */
  name: string;

  /** Human-readable description from JSDoc */
  description: string;

  /** Event category (e.g., "requests", "announcements") */
  category?: string;
}

/**
 * Metadata for a DSL keyword
 */
export interface KeywordMetadata {
  /** Keyword text (e.g., "action", "if", "break") */
  keyword: string;

  /** Human-readable description */
  description: string;

  /** Context filter for when keyword should appear */
  contextFilter?: 'insideAction' | 'insideLoop' | 'insideEvent' | 'topLevel';
}

/**
 * Metadata for a variable reference (@@prefix)
 */
export interface VariableMetadata {
  /** Variable name without @@ prefix (e.g., "currentItem", "loopIndex") */
  name: string;

  /** Variable type (for display) */
  type: string;

  /** Variable scope */
  scope: 'loop' | 'action' | 'global';

  /** Human-readable description */
  description: string;
}

// =============================================================================
// Completion Provider Modules
// =============================================================================

/**
 * Main completion provider interface
 * Implemented by EligianCompletionProvider
 */
export interface ICompletionProvider {
  /**
   * Provide completion items for the given cursor position
   * @param document Langium document being edited
   * @param position Cursor position
   * @returns Array of completion items
   */
  getCompletion(
    document: LangiumDocument,
    position: Position
  ): Promise<CompletionItem[] | undefined>;
}

/**
 * Context detector module
 * Determines what context the cursor is in (inside loop, inside action, etc.)
 */
export interface IContextDetector {
  /**
   * Detect completion context from cursor position
   * @param document Document being edited
   * @param position Cursor position
   * @returns Completion context information
   */
  detectContext(document: LangiumDocument, position: Position): CompletionContext;
}

/**
 * Operation completion module
 * Provides completions for Eligius operation names
 */
export interface IOperationCompletionProvider {
  /**
   * Get operation name completions
   * @param context Completion context
   * @returns Array of completion items for operations
   */
  getOperationCompletions(context: CompletionContext): CompletionItem[];
}

/**
 * Custom action completion module
 * Provides completions for actions defined in the current document
 */
export interface IActionCompletionProvider {
  /**
   * Get custom action name completions
   * @param document Document being edited (to find action definitions)
   * @param context Completion context
   * @returns Array of completion items for custom actions
   */
  getActionCompletions(document: LangiumDocument, context: CompletionContext): CompletionItem[];
}

/**
 * Keyword completion module
 * Provides completions for DSL keywords
 */
export interface IKeywordCompletionProvider {
  /**
   * Get keyword completions
   * @param context Completion context (for context-aware filtering)
   * @returns Array of completion items for keywords
   */
  getKeywordCompletions(context: CompletionContext): CompletionItem[];
}

/**
 * Timeline event completion module
 * Provides completions for Eligius timeline event names
 */
export interface IEventCompletionProvider {
  /**
   * Get timeline event name completions
   * @param context Completion context
   * @returns Array of completion items for events
   */
  getEventCompletions(context: CompletionContext): CompletionItem[];
}

/**
 * Variable reference completion module
 * Provides completions for @@variable references
 */
export interface IVariableCompletionProvider {
  /**
   * Get variable reference completions
   * @param context Completion context (for scope-aware filtering)
   * @returns Array of completion items for variables
   */
  getVariableCompletions(context: CompletionContext): CompletionItem[];
}

/**
 * Parameter name completion module
 * Provides completions for operation/action parameter names
 */
export interface IParameterCompletionProvider {
  /**
   * Get parameter name completions
   * @param context Completion context
   * @param operationName Operation or action name (to look up parameter metadata)
   * @returns Array of completion items for parameters
   */
  getParameterCompletions(context: CompletionContext, operationName: string): CompletionItem[];
}

// =============================================================================
// Operation Registry
// =============================================================================

/**
 * Operation registry interface
 * Provides access to Eligius operation metadata
 */
export interface IOperationRegistry {
  /**
   * Get all operation metadata (sorted alphabetically)
   * @returns Array of operation metadata (excluding filtered operations)
   */
  getAllOperations(): OperationMetadata[];

  /**
   * Get specific operation metadata by name
   * @param name Operation name
   * @returns Operation metadata or undefined if not found
   */
  getOperation(name: string): OperationMetadata | undefined;

  /**
   * Check if operation should be filtered from completions
   * (operations handled by DSL keywords like breakForEach, continueForEach, etc.)
   * @param name Operation name
   * @returns True if operation should be hidden
   */
  isFilteredOperation(name: string): boolean;
}

/**
 * Timeline event registry interface
 * Provides access to Eligius timeline event metadata
 */
export interface ITimelineEventRegistry {
  /**
   * Get all timeline event metadata (sorted alphabetically)
   * @returns Array of timeline event metadata
   */
  getAllEvents(): TimelineEventMetadata[];

  /**
   * Get specific timeline event metadata by name
   * @param name Event name
   * @returns Event metadata or undefined if not found
   */
  getEvent(name: string): TimelineEventMetadata | undefined;
}

// =============================================================================
// Completion Acceptor (from Langium)
// =============================================================================

/**
 * Completion acceptor function (from Langium)
 * Used to add completion items to the result list
 */
export type CompletionAcceptor = (context: CompletionContext, item: CompletionItem) => void;

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Completion error (for graceful degradation)
 * If operation registry fails to load, completion should still work
 * (just without operation completions)
 */
export interface CompletionError {
  /** Error code */
  code: 'REGISTRY_LOAD_FAILED' | 'CONTEXT_DETECTION_FAILED' | 'COMPLETION_FAILED';

  /** Error message */
  message: string;

  /** Original error if available */
  cause?: unknown;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Completion provider configuration (future extensibility)
 */
export interface CompletionProviderConfig {
  /**
   * Enable/disable specific completion types
   */
  enableOperations?: boolean;
  enableActions?: boolean;
  enableKeywords?: boolean;
  enableEvents?: boolean;
  enableVariables?: boolean;
  enableParameters?: boolean;

  /**
   * Maximum number of completion items to return
   * (for performance with large registries)
   */
  maxItems?: number;

  /**
   * Enable markdown documentation
   */
  enableMarkdownDocs?: boolean;
}
