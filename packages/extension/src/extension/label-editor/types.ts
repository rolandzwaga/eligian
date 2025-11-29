/**
 * Message protocol types for Label Editor
 * Bidirectional communication between Extension (Node.js) and Webview (Browser)
 */

/**
 * Label Group entity - represents a collection of translations
 */
export interface LabelGroup {
  /** User-defined group identifier (must be unique) */
  id: string;
  /** Array of translations for this label */
  labels: Translation[];
}

/**
 * Translation entity - single language variant of a label
 */
export interface Translation {
  /** Auto-generated UUID v4 (hidden from user) */
  id: string;
  /** Language code in xx-XX format (e.g., en-US, nl-NL) */
  languageCode: string;
  /** Translated text */
  label: string;
}

/**
 * Validation error details
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

/**
 * Messages sent from Extension to Webview
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
