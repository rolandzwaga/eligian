/**
 * HTML Completion Context Types
 *
 * Type definitions for detecting cursor context in createElement operations.
 * Used to determine what type of completions to show.
 */

/**
 * Types of HTML completion contexts for createElement
 */
export enum HTMLCompletionContextType {
  /** Not in createElement context */
  None = 'None',

  /** Cursor inside element name parameter: createElement("|") */
  ElementName = 'ElementName',

  /** Cursor inside attributes object: createElement("div", { | }) */
  AttributeName = 'AttributeName',

  /** Cursor inside attribute value: createElement("div", { type: "|" }) */
  AttributeValue = 'AttributeValue',
}

/**
 * Detected HTML completion context
 */
export interface HTMLCompletionContext {
  /** Context type */
  readonly type: HTMLCompletionContextType;

  /** Element name (for AttributeName/AttributeValue contexts) */
  readonly elementName?: string;

  /** Attribute name (for AttributeValue context) */
  readonly attributeName?: string;

  /** Text typed so far (for filtering) */
  readonly partialText?: string;

  /** Start offset of string content (after opening quote) - for TextEdit range */
  readonly stringContentStart?: number;

  /** End offset of string content (before closing quote) - for TextEdit range */
  readonly stringContentEnd?: number;
}
