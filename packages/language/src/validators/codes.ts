/**
 * The diagnostic code registry (spec 058, Phase 0: FR-001, FR-001a, FR-002, FR-002a).
 *
 * Every code an Eligian diagnostic can carry, mapped to the stage that emits it. Existing codes
 * are kept verbatim (quick fixes match on them); new codes are kebab-case. Entries carry only
 * `{ code, source }`.
 */

import type { OperationValidationError } from '../compiler/operations/validation/errors.js';
import type {
  DuplicateDefaultImportError,
  ImportNameError,
  PathError,
  TypeInferenceError,
} from './validation-errors.js';

/** The stage that emits a diagnostic code. */
export type DiagnosticSource = 'parser' | 'validator' | 'type' | 'linker' | 'compiler';

const SOURCES = {
  // Langium lexer / parser errors (EligianDocumentValidator)
  'syntax-error': 'parser',
  // Langium linking errors (EligianDocumentValidator)
  'unresolved-reference': 'linker',
  // Typir core type mismatches (EligianDocumentValidator fallback)
  'type-mismatch': 'type',

  // Codes emittable before Phase 0 (baseline/emittable-codes-before.json), verbatim
  ABSOLUTE_PATH: 'validator',
  AMBIGUOUS_EXTENSION: 'validator',
  DUPLICATE_DEFAULT_IMPORT: 'validator',
  DUPLICATE_IMPORT_NAME: 'validator',
  INVALID_PATH_FORMAT: 'validator',
  OPERATION_NAME_CONFLICT: 'validator',
  RESERVED_KEYWORD: 'validator',
  UNKNOWN_EXTENSION: 'validator',
  action_name_builtin_conflict: 'validator',
  circular_library_import: 'validator',
  control_flow: 'validator',
  duplicate_event_handler: 'validator',
  duplicate_event_label: 'validator',
  duplicate_extensions_import: 'validator',
  duplicate_host_declaration: 'validator',
  duplicate_host_parameter: 'validator',
  duplicate_language_code: 'validator',
  duplicate_lifecycle_block: 'validator',
  duplicate_parameter: 'validator',
  empty_event_name: 'validator',
  empty_languages_block: 'validator',
  end_block_runtime_const: 'validator',
  'erased-property-access': 'validator',
  event_action_empty_body: 'validator',
  event_action_name_builtin_conflict: 'validator',
  event_action_name_conflict: 'validator',
  event_argument_count_mismatch: 'validator',
  event_label_not_before: 'validator',
  event_label_time_unknown: 'validator',
  event_name_must_be_literal: 'validator',
  event_name_too_long: 'validator',
  event_topic_empty: 'validator',
  event_type_mismatch: 'validator',
  extensions_path_not_relative: 'validator',
  extensions_path_type: 'validator',
  host_controller_builtin: 'validator',
  host_operation_builtin: 'validator',
  import_action_not_found: 'validator',
  import_file_not_found: 'validator',
  import_name_collision: 'validator',
  import_private_action: 'validator',
  invalid_constant_expression: 'validator',
  invalid_controller_name_type: 'validator',
  invalid_css_file: 'validator',
  invalid_css_selector: 'validator',
  invalid_css_selector_syntax: 'validator',
  invalid_event_edge: 'validator',
  invalid_language_code_format: 'validator',
  invalid_parameter_count: 'validator',
  invalid_setdata_target: 'validator',
  invalid_time_constant: 'validator',
  library_invalid_content: 'validator',
  'missing-action-dependency': 'validator',
  'missing-dependency': 'validator',
  missing_default_marker: 'validator',
  missing_dependency: 'validator',
  missing_labels_file: 'validator',
  missing_required_parameter: 'validator',
  multiple_default_markers: 'validator',
  no_labels_import: 'validator',
  parameter_count: 'validator',
  parameter_type: 'validator',
  private_only_in_libraries: 'validator',
  property_chain_in_time_expression: 'validator',
  recursive_action_call: 'validator',
  reserved_keyword_parameter: 'validator',
  run_not_an_action: 'validator',
  run_runtime_argument: 'validator',
  runtime_concat_context: 'validator',
  runtime_concat_operand: 'validator',
  runtime_negation_outside_condition: 'validator',
  runtime_operator_operand: 'validator',
  scroll_container_not_scrollable: 'validator',
  selector_not_in_layout: 'validator',
  time_constant_misuse: 'validator',
  time_value_placement: 'validator',
  too_many_parameters: 'validator',
  unknown_controller: 'validator',
  unknown_css_class: 'validator',
  unknown_css_class_in_selector: 'validator',
  unknown_css_id_in_selector: 'validator',
  unknown_dom_event: 'validator',
  unknown_event_name: 'validator',
  unknown_host_function: 'validator',
  unknown_key: 'validator',
  unknown_label_id: 'validator',
  unknown_navigate_target: 'validator',
  unknown_operation: 'validator',
  unknown_scroll_container: 'validator',
  unnecessary_type_annotation: 'validator',

  // Validator codes added in Phase 0
  'timeline-provider-invalid': 'validator',
  'timeline-source-required': 'validator',
  'timeline-source-unused': 'validator',
  'timeline-scroll-duration-required': 'validator',
  'timeline-scroll-selector-not-scroll': 'validator',
  'timeline-duration-relative': 'validator',
  'timeline-duration-not-positive': 'validator',
  'event-ends-after-timeline': 'validator',
  'break-outside-loop': 'validator',
  'continue-outside-loop': 'validator',
  'operation-in-timeline-event': 'validator',
  'unknown-action-in-timeline-event': 'validator',
  'html-import-error': 'validator',
  'css-import-error': 'validator',
  'css-parse-error': 'validator',
  'media-import-error': 'validator',
  'locales-import-error': 'validator',
  'locales-without-languages': 'validator',
  'locales-parse-failed': 'validator',
  'timeline-required': 'validator',
  'validation-exception': 'validator',

  // Validator codes added in Phase 2
  'unknown-listener-action': 'validator',

  // Eligian Typir rule codes (type-system-typir/validation/**)
  'constant-reserved-name': 'type',
  'constant-cycle': 'type',
  'if-condition-not-boolean': 'type',
  'if-empty-then': 'type',
  'for-collection-not-array': 'type',
  'for-empty-body': 'type',
  'event-start-negative': 'type',
  'event-duration-relative': 'type',
  'event-duration-not-positive': 'type',
  'event-end-not-after-start': 'type',
  'sequence-item-duration-not-positive': 'type',
  'stagger-delay-not-positive': 'type',
  'stagger-duration-not-positive': 'type',
  'import-duplicate-default': 'type',
  'asset-type-conflict': 'type',
  'languages-duplicate-code': 'type',
  'languages-missing-default': 'type',
  'languages-multiple-defaults': 'type',
  'timeline-empty': 'type',

  // checkFiles compile and file errors (compiler/pipeline/check.ts)
  'compile-parse-error': 'compiler',
  'compile-validation-error': 'compiler',
  'compile-type-error': 'compiler',
  'compile-transform-error': 'compiler',
  'compile-emit-error': 'compiler',
  'file-unreadable': 'compiler',
} as const satisfies Record<string, DiagnosticSource>;

/** A registered diagnostic code. */
export type DiagnosticCode = keyof typeof SOURCES;

/** One registry entry. */
export interface DiagnosticCodeEntry {
  readonly code: DiagnosticCode;
  readonly source: DiagnosticSource;
}

/** All entries, in declaration order (Phase 1's generated/diagnostics.md reads this). */
export const DIAGNOSTIC_CODES: readonly DiagnosticCodeEntry[] = Object.freeze(
  (Object.keys(SOURCES) as DiagnosticCode[]).map(code =>
    Object.freeze({ code, source: SOURCES[code] })
  )
);

/** The registry's own keys (`Object.hasOwn` needs a newer lib target than this package uses). */
const CODES: ReadonlySet<string> = new Set(Object.keys(SOURCES));

/** Whether a string is a registered diagnostic code. */
export function isDiagnosticCode(value: string): value is DiagnosticCode {
  return CODES.has(value);
}

/** A registry code at a diagnostic site: the literal is checked against the registry at compile time. */
export function diagnosticCode<const C extends DiagnosticCode>(code: C): C {
  return code;
}

// Compile-time derivation checks (FR-002a): every computed (lowercased) and pass-through code is
// a registry code. Type-only imports, so no import cycle reaches runtime.
void ([] as Lowercase<OperationValidationError['code']>[] satisfies readonly DiagnosticCode[]);
void ([] as (
  | PathError['code']
  | ImportNameError['code']
  | TypeInferenceError['code']
  | DuplicateDefaultImportError['code']
)[] satisfies readonly DiagnosticCode[]);
