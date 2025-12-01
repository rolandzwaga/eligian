/**
 * HTML Element Metadata Types
 *
 * Type definitions for HTML element and attribute metadata used by the
 * completion provider. These types define the structure of the generated
 * metadata file (html-elements.generated.ts).
 */

/**
 * Metadata for a single HTML attribute
 */
export interface HTMLAttributeMetadata {
  /** Attribute name (e.g., "href", "type", "disabled") */
  readonly name: string;

  /** Value type */
  readonly type: 'string' | 'number' | 'boolean' | 'enum';

  /** Valid values when type='enum' */
  readonly enumValues?: readonly string[];

  /** Brief description for tooltip */
  readonly description?: string;
}

/**
 * Metadata for an HTML element
 */
export interface HTMLElementMetadata {
  /** HTML tag name (e.g., "a", "div", "input") */
  readonly tagName: string;

  /** TypeScript interface name (e.g., "HTMLAnchorElement") */
  readonly interfaceName: string;

  /** Element-specific attributes */
  readonly attributes: readonly HTMLAttributeMetadata[];
}

/**
 * Generated metadata registry structure
 */
export interface HTMLMetadataRegistry {
  /** All valid HTML element names */
  readonly elementNames: readonly string[];

  /** Metadata for each element */
  readonly elements: Readonly<Record<string, HTMLElementMetadata>>;

  /** Common attributes (apply to all elements) */
  readonly commonAttributes: readonly HTMLAttributeMetadata[];
}
