/**
 * Message protocol types for Locale Editor
 * Bidirectional communication between Extension (Node.js) and Webview (Browser)
 */

// Import and re-export types from Eligius library
import type {
  ILocaleReference,
  ILocalesConfiguration,
  TLanguageCode,
  TLocaleData,
  TLocaleEntry,
} from 'eligius';

export type { ILocaleReference, ILocalesConfiguration, TLanguageCode, TLocaleData, TLocaleEntry };

// =============================================================================
// Key Tree Types (Editor UI Model)
// =============================================================================

/**
 * Node in the key tree for navigation panel.
 * Represents either a branch (namespace) or leaf (translation key).
 */
export interface KeyTreeNode {
  /** Segment name (e.g., "nav" or "home") */
  name: string;

  /** Full key path (e.g., "nav.home") */
  fullKey: string;

  /** Whether this node has a translation value (leaf node) */
  isLeaf: boolean;

  /** Child nodes (empty for leaf nodes) */
  children: KeyTreeNode[];

  /** Translations for this key (only for leaf nodes) */
  translations?: Map<TLanguageCode, string>;
}

/**
 * Serializable version of KeyTreeNode for JSON messages.
 * Uses Record instead of Map for JSON compatibility.
 */
export interface SerializableKeyTreeNode {
  /** Segment name (e.g., "nav" or "home") */
  name: string;

  /** Full key path (e.g., "nav.home") */
  fullKey: string;

  /** Whether this node has a translation value (leaf node) */
  isLeaf: boolean;

  /** Child nodes (empty for leaf nodes) */
  children: SerializableKeyTreeNode[];

  /** Translations for this key (only for leaf nodes) - localeCode → translation */
  translations?: Record<string, string>;
}

// =============================================================================
// Legacy Types (preserved for backward compatibility during migration)
// =============================================================================

/**
 * Label Group entity - represents a collection of translations
 * @deprecated Use KeyTreeNode with ILocalesConfiguration instead
 */
export interface LabelGroup {
  /** User-defined group identifier (must be unique) */
  id: string;
  /** Array of translations for this label */
  labels: Translation[];
}

/**
 * Translation entity - single language variant of a label
 * @deprecated Use KeyTreeNode.translations Map instead
 */
export interface Translation {
  /** Auto-generated UUID v4 (hidden from user) */
  id: string;
  /** Language code in xx-XX format (e.g., en-US, nl-NL) */
  languageCode: string;
  /** Translated text */
  label: string;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation error details for locale editor
 */
export interface LocaleValidationError {
  /** Translation key where error occurred (e.g., "nav.home") */
  key?: string;
  /** Locale code where error occurred (e.g., "en-US") */
  locale?: string;
  /** Field name that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code */
  code: string;
}

/**
 * Validation error details
 * @deprecated Use LocaleValidationError instead
 */
export interface ValidationError {
  /** Group ID where error occurred (optional if global error) */
  groupId?: string;
  /** Translation ID where error occurred (optional if group-level error) */
  translationId?: string;
  /** Field name that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code */
  code: string;
}

// =============================================================================
// Message Protocol Types (New ILocalesConfiguration-based)
// =============================================================================

/**
 * Messages sent from Extension to Webview (new format)
 */
export type LocaleToWebviewMessage =
  | {
      type: 'initialize';
      /** All locale codes in this file */
      locales: string[];
      /** Tree structure for navigation panel (serializable format) */
      keyTree: SerializableKeyTreeNode[];
      /** File path for display */
      filePath: string;
      /** Optional key to auto-select after initialization */
      selectedKey?: string;
    }
  | {
      type: 'select-key';
      /** Translation key to select and scroll into view */
      key: string;
    }
  | {
      type: 'reload';
      /** All locale codes in this file */
      locales: string[];
      /** Updated tree structure after external change */
      keyTree: SerializableKeyTreeNode[];
    }
  | {
      type: 'validation-error';
      /** Validation errors by key */
      errors: LocaleValidationError[];
    }
  | {
      type: 'save-complete';
      /** Whether save succeeded */
      success: boolean;
    }
  | {
      type: 'usage-check-response';
      /** Translation key that was checked */
      key: string;
      /** File URIs where this key is used */
      usageFiles: string[];
    }
  | {
      type: 'delete-confirmed';
      /** Translation key to delete */
      key: string;
    };

/**
 * Messages sent from Webview to Extension (new format)
 */
export type LocaleToExtensionMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'update-translation';
      /** Translation key (e.g., "nav.home") */
      key: string;
      /** Locale code (e.g., "en-US") */
      locale: string;
      /** New translation value */
      value: string;
    }
  | {
      type: 'add-key';
      /** Parent key (null for root level) */
      parentKey: string | null;
      /** New segment name to add */
      newSegment: string;
    }
  | {
      type: 'delete-key';
      /** Translation key to delete */
      key: string;
    }
  | {
      type: 'rename-key';
      /** Old translation key */
      oldKey: string;
      /** New translation key */
      newKey: string;
    }
  | {
      type: 'add-locale';
      /** New locale code to add (e.g., "fr-FR") */
      locale: string;
    }
  | {
      type: 'request-save';
    }
  | {
      type: 'check-usage';
      /** Translation key to check usage for */
      key: string;
    }
  | {
      type: 'request-delete';
      /** Translation key to delete */
      key: string;
      /** Usage files for confirmation message */
      usageFiles: string[];
    };

// =============================================================================
// Legacy Message Protocol Types (preserved for backward compatibility)
// =============================================================================

/**
 * Messages sent from Extension to Webview
 * @deprecated Use LocaleToWebviewMessage instead
 */
export type ToWebviewMessage =
  | {
      type: 'initialize';
      /** Initial label groups from file */
      labels: LabelGroup[];
      /** File path for display */
      filePath: string;
      /** Optional label ID to auto-select after initialization */
      selectedLabelId?: string;
    }
  | {
      type: 'select-label';
      /** Label ID to select and scroll into view */
      labelId: string;
    }
  | {
      type: 'reload';
      /** Updated label groups after external change */
      labels: LabelGroup[];
    }
  | {
      type: 'validation-error';
      /** Validation errors to display */
      errors: ValidationError[];
    }
  | {
      type: 'save-complete';
      /** Whether save succeeded */
      success: boolean;
    }
  | {
      type: 'usage-check-response';
      /** Group ID that was checked */
      groupId: string;
      /** File URIs where this label is used */
      usageFiles: string[];
    }
  | {
      type: 'delete-confirmed';
      /** Index of group to delete */
      index: number;
    };

/**
 * Messages sent from Webview to Extension
 * @deprecated Use LocaleToExtensionMessage instead
 */
export type ToExtensionMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'update';
      /** Updated label groups after user edit */
      labels: LabelGroup[];
    }
  | {
      type: 'request-save';
      /** Label groups to save */
      labels: LabelGroup[];
    }
  | {
      type: 'validate';
      /** Label groups to validate */
      labels: LabelGroup[];
    }
  | {
      type: 'check-usage';
      /** Group ID to check usage for */
      groupId: string;
    }
  | {
      type: 'request-delete';
      /** Group ID to delete */
      groupId: string;
      /** Index of group to delete */
      index: number;
      /** Usage files for confirmation message */
      usageFiles: string[];
    };
