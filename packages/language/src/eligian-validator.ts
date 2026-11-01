import type { ValidationChecks } from 'langium';
import { LANGUAGE_CODE_REGEX } from './compiler/constants.js';
import type { EligianServices } from './eligian-module.js';
import type { EligianAstType } from './generated/ast.js';
import { ActionValidator } from './validators/action-validator.js';
import { DataflowValidator } from './validators/dataflow-validator.js';
import { EventActionValidator } from './validators/event-action-validator.js';
import { ExpressionValidator } from './validators/expression-validator.js';
import { ImportValidator } from './validators/import-validator.js';
import { LanguagesValidator } from './validators/languages-validator.js';
import { NavigateValidator } from './validators/navigate-validator.js';
import { OperationCallValidator } from './validators/operation-call-validator.js';
import { OperationSequenceValidator } from './validators/operation-sequence-validator.js';
import { ProgramValidator } from './validators/program-validator.js';
import { TimelineValidator } from './validators/timeline-validator.js';

/**
 * Diagnostic code for missing labels file
 * Feature 039: Label File Creation Quick Fix
 */
export const MISSING_LABELS_FILE_CODE = 'missing_labels_file';

/**
 * Validate language code format (IETF BCP 47: xx-XX)
 *
 * Checks if a language code string matches the expected format:
 * - Primary language: 2-3 lowercase letters (e.g., 'en', 'nl', 'pt')
 * - Hyphen: '-'
 * - Region: 2-3 uppercase letters (e.g., 'US', 'NL', 'BR')
 *
 * @param code - Language code string to validate
 * @returns true if valid, false otherwise
 *
 * @example Valid codes
 * isValidLanguageCode('en-US') // true
 * isValidLanguageCode('nl-NL') // true
 * isValidLanguageCode('pt-BR') // true
 *
 * @example Invalid codes
 * isValidLanguageCode('EN-US') // false (uppercase primary)
 * isValidLanguageCode('en-us') // false (lowercase region)
 * isValidLanguageCode('english') // false (no region)
 *
 * Feature 037: Languages Declaration Syntax
 * Research Decision: RT-002
 * Task: T007
 */
export function isValidLanguageCode(code: string): boolean {
  return LANGUAGE_CODE_REGEX.test(code);
}

/**
 * Implementation of custom validations for Eligian DSL.
 *
 * Composition root: holds the focused validator instances grouped by
 * AST-node concern (program, imports, timeline, operation calls, actions,
 * languages, event actions, navigate, expressions). Each sub-validator extends `BaseValidator` and is
 * registered separately by {@link registerValidationChecks}. This keeps the DI
 * entry `services.validation.EligianValidator` resolvable while distributing the
 * `check*` rules across focused classes.
 */
export class EligianValidator {
  readonly program: ProgramValidator;
  readonly imports: ImportValidator;
  readonly timeline: TimelineValidator;
  readonly operationCall: OperationCallValidator;
  readonly action: ActionValidator;
  readonly languages: LanguagesValidator;
  readonly eventAction: EventActionValidator;
  readonly navigate: NavigateValidator;
  readonly expression: ExpressionValidator;
  readonly operationSequence: OperationSequenceValidator;
  readonly dataflow: DataflowValidator;

  constructor(services: EligianServices) {
    this.program = new ProgramValidator(services);
    this.imports = new ImportValidator(services);
    this.timeline = new TimelineValidator(services);
    this.operationCall = new OperationCallValidator(services);
    this.action = new ActionValidator(services);
    this.languages = new LanguagesValidator(services);
    this.eventAction = new EventActionValidator(services);
    this.navigate = new NavigateValidator(services);
    this.expression = new ExpressionValidator(services);
    this.operationSequence = new OperationSequenceValidator(services);
    this.dataflow = new DataflowValidator(services);
  }
}

/**
 * Register custom validation checks.
 *
 * Issues one `registry.register(map, instance)` call per focused validator
 * group. Each AST node type belongs to exactly one group, so the node-type →
 * check-method arrays mirror the original single `checks` map, just split by the
 * owning instance.
 */
export function registerValidationChecks(services: EligianServices) {
  const registry = services.validation.ValidationRegistry;
  const v = services.validation.EligianValidator;

  const programChecks: ValidationChecks<EligianAstType> = {
    Program: [
      v.program.checkTimelineRequired,
      v.program.checkDuplicateActions, // T042: US2 - Duplicate action detection
      v.program.checkDuplicateConstants, // Duplicate constant detection
      v.program.checkDuplicateEventActions, // T033: Duplicate event/topic combinations
      v.program.checkDuplicateTimelines, // Duplicate timeline names (navigate targets)
      v.program.checkEventActionNames, // Duplicate event action names / action + built-in clashes
      // validator.checkDefaultImports, // DISABLED: Now handled by Typir validation (US1)
      v.program.checkNamedImportNames, // T048-T051: US2 - Named import name validation
      v.program.checkAssetLoading, // Feature 010: Asset loading and validation
      v.program.checkCSSImports, // Feature 013 T016: Extract and register CSS imports
      v.program.checkLocalesImports, // Feature 045: Extract and register locales imports
      v.program.checkImportNameCollisions, // T043: US2 - Validate no name conflicts (program-wide, runs once)
    ],
  };
  registry.register(programChecks, v.program);

  const importChecks: ValidationChecks<EligianAstType> = {
    Library: [
      v.imports.checkLibraryContent, // T021-T024: US1 - Validate library content constraints
      v.imports.checkLibraryDuplicateActions, // T025: US1 - Duplicate action detection
      v.imports.checkLibraryImportNameCollisions, // Imports vs own actions / each other
    ],
    LibraryImport: [
      v.imports.checkImportFileExists, // T041: US2 - Validate library file exists
      v.imports.checkCircularLibraryImport, // No import cycles between libraries
      v.imports.checkImportedActionsExist, // T042 + T042a: US2 - Validate imported actions exist
      v.imports.checkImportedActionsPublic, // T055: US3 - Validate imported actions are public
      v.imports.checkImportAliasCollision, // T073: US5 - Validate aliases don't conflict with built-ins
    ],
    DefaultImport: v.imports.checkImportPath, // T017: US5 - Path validation for default imports
    NamedImport: [
      v.imports.checkImportPath, // T017: US5 - Path validation for named imports
      v.imports.checkAssetType, // US4: Validates unknown/ambiguous extensions (NOT US1)
    ],
  };
  registry.register(importChecks, v.imports);

  const timelineChecks: ValidationChecks<EligianAstType> = {
    Timeline: [
      v.timeline.checkValidProvider,
      v.timeline.checkSourceRequired,
      v.timeline.checkTimelineOptions, // Feature 049: scroll / loop / duration header options
      v.timeline.checkTimelineLifecycle, // Audit idea #6: one `on enter` / `on leave` each
      v.timeline.checkEventLabels, // Audit idea #10: unique `at … as <label>`
      v.timeline.checkScrollContainer, // Feature 049: scroll container exists and can scroll
      v.timeline.checkTimelineContainerSelector, // Feature 013: Validate timeline container selector against CSS
    ],
    // A property chain used as a time compiles to nothing (the compiler rejects it)
    PropertyChainReference: v.timeline.checkPropertyChainInTime,
    // Idea #10: time constants and event labels
    TimeValue: v.timeline.checkTimeValuePlacement,
    VariableReference: v.timeline.checkTimeConstantReference,
    EventTimeReference: v.timeline.checkEventTimeReference,
    // TimelineEvent time ranges are validated by the Typir rules
    // (type-system-typir/validation/event-validation.ts), not here.
  };
  registry.register(timelineChecks, v.timeline);

  const operationCallChecks: ValidationChecks<EligianAstType> = {
    OperationCall: [
      v.operationCall.checkTimelineOperationCall, // T020: Check timeline context for unified syntax
      v.operationCall.checkControllerCall, // Feature 035: Validate addController calls
      v.operationCall.checkOperationExists,
      v.operationCall.checkParameterCount,
      v.operationCall.checkParameterTypes,
      v.operationCall.checkClassNameParameter, // Feature 013 T017: Validate className parameters
      v.operationCall.checkSelectorParameter, // Feature 013 T020: Validate selector parameters
      v.operationCall.checkActionCallCssArguments, // Idea #18: selectors/classes through action parameters
      v.operationCall.checkLabelIDParameter, // Feature 034: Validate label ID parameters
      v.operationCall.checkSetDataTargets, // setData keys must be $operationdata./$globaldata./$scope. targets
    ],
  };
  registry.register(operationCallChecks, v.operationCall);

  const actionChecks: ValidationChecks<EligianAstType> = {
    BreakStatement: v.action.checkBreakInsideLoop,
    ContinueStatement: v.action.checkContinueInsideLoop,
    RegularActionDefinition: [
      v.action.checkActionNameCollision, // T039: US2 - Name collision detection
      v.action.checkRecursiveActionCalls, // Detect infinite recursion
      v.action.checkActionParameters, // Duplicate / reserved parameter names
      v.action.checkControlFlowPairing,
      v.action.checkPrivateOnlyInLibraries, // T056: US3 - Validate 'private' only in libraries
    ],
    EndableActionDefinition: [
      v.action.checkActionNameCollision, // T039: US2 - Name collision detection
      v.action.checkRecursiveActionCalls, // Detect infinite recursion
      v.action.checkActionParameters, // Duplicate / reserved parameter names
      v.action.checkControlFlowPairingInStartOps,
      v.action.checkControlFlowPairingInEndOps,
      v.action.checkPrivateOnlyInLibraries, // T056: US3 - Validate 'private' only in libraries
    ],
    InlineEndableAction: [
      v.action.checkControlFlowPairingInInlineStart,
      v.action.checkControlFlowPairingInInlineEnd,
    ],
    TimelineLifecycle: v.action.checkControlFlowPairingInLifecycle, // Audit idea #6
    SequenceBlock: v.action.checkControlFlowPairingInSequence, // Audit idea #11
    SequenceItem: v.action.checkControlFlowPairingInSequenceItem, // Audit idea #11
  };
  registry.register(actionChecks, v.action);

  const languagesChecks: ValidationChecks<EligianAstType> = {
    LanguagesBlock: [
      v.languages.checkDefaultMarker, // Feature 037 T023-T024: US2 - Default marker validation
      v.languages.checkLanguageCodeFormat, // Feature 037 T040: US4 - Language code format validation
      v.languages.checkDuplicateLanguageCodes, // Feature 037 T041: US4 - Duplicate code validation
      v.languages.checkNonEmptyLanguagesBlock, // Feature 037 T043: US4 - Non-empty block validation
    ],
  };
  registry.register(languagesChecks, v.languages);

  const eventActionChecks: ValidationChecks<EligianAstType> = {
    EventActionDefinition: [
      v.eventAction.checkEventActionDefinition, // T031: Event name and empty body validation
      v.eventAction.checkEventActionParameters, // T032: Reserved keywords and duplicate parameters
      v.eventAction.checkEventNameExists, // T034: Event name validation with suggestions (US1)
      v.eventAction.checkEventArgumentCount, // US2: Argument count validation
      v.eventAction.checkEventTypeCompatibility, // US3: Type compatibility validation (T038-T055)
    ],
  };
  registry.register(eventActionChecks, v.eventAction);

  // Control-flow pairing and operationData dependency checks for operation
  // lists outside action definitions (event action bodies, inline stagger
  // blocks). A separate group, so EventActionDefinition has checks in two groups.
  const operationSequenceChecks: ValidationChecks<EligianAstType> = {
    EventActionDefinition: [v.operationSequence.checkControlFlowPairingInEventAction],
    StaggerBlock: [v.operationSequence.checkControlFlowPairingInStagger],
  };
  registry.register(operationSequenceChecks, v.operationSequence);

  // Spec 047: operation-data dependencies with inferred action contracts, one
  // pass per document (replaces the per-action erased-property checks)
  const dataflowChecks: ValidationChecks<EligianAstType> = {
    Program: v.dataflow.checkOperationData,
    Library: v.dataflow.checkOperationData,
  };
  registry.register(dataflowChecks, v.dataflow);

  const navigateChecks: ValidationChecks<EligianAstType> = {
    InteractionStatement: [
      v.navigate.checkNavigateTarget, // navigate target must name an existing timeline
      v.navigate.checkNavigateSelector, // navigate selector must resolve against imported CSS
      v.navigate.checkInteractionEvent, // idea #19: a DOM event name
      v.navigate.checkInteractionKeys, // on key: keys the KeyboardController can match
      v.navigate.checkRunCall, // idea #19: run starts an action with compile-time arguments
    ],
    // Idea #17: `at … target "<sel>"` and `with "<sel>" { }` selectors
    TimedEvent: v.navigate.checkTargetSelector,
    WithStatement: v.navigate.checkTargetSelector,
  };
  registry.register(navigateChecks, v.navigate);

  const expressionChecks: ValidationChecks<EligianAstType> = {
    // Operators the compiler cannot emit: `!`/comparisons/logic on runtime values outside an if
    // condition, arithmetic on runtime values, invalid constants (`10 % 0`, `"abc" - 1`)
    UnaryExpression: v.expression.checkOperatorExpression,
    BinaryExpression: v.expression.checkOperatorExpression,
    // An end block referencing a runtime const of its start block
    VariableReference: v.expression.checkEndBlockConstReference,
  };
  registry.register(expressionChecks, v.expression);
}
