import type { ValidationChecks } from 'langium';
import { LANGUAGE_CODE_REGEX } from './compiler/constants.js';
import type { EligianServices } from './eligian-module.js';
import type { EligianAstType } from './generated/ast.js';
import { ActionValidator } from './validators/action-validator.js';
import { EventActionValidator } from './validators/event-action-validator.js';
import { ImportValidator } from './validators/import-validator.js';
import { LanguagesValidator } from './validators/languages-validator.js';
import { NavigateValidator } from './validators/navigate-validator.js';
import { OperationCallValidator } from './validators/operation-call-validator.js';
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
 * Composition root: holds the seven focused validator instances grouped by
 * AST-node concern (program, imports, timeline, operation calls, actions,
 * languages, event actions). Each sub-validator extends `BaseValidator` and is
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

  constructor(services: EligianServices) {
    this.program = new ProgramValidator(services);
    this.imports = new ImportValidator(services);
    this.timeline = new TimelineValidator(services);
    this.operationCall = new OperationCallValidator(services);
    this.action = new ActionValidator(services);
    this.languages = new LanguagesValidator(services);
    this.eventAction = new EventActionValidator(services);
    this.navigate = new NavigateValidator(services);
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
    ],
    LibraryImport: [
      v.imports.checkImportFileExists, // T041: US2 - Validate library file exists
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
      v.timeline.checkTimelineContainerSelector, // Feature 013: Validate timeline container selector against CSS
    ],
    TimelineEvent: [v.timeline.checkValidTimeRange, v.timeline.checkNonNegativeTimes],
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
      v.operationCall.checkLabelIDParameter, // Feature 034: Validate label ID parameters
      // TODO T216: Re-enable checkDependencies once we implement proper dependency tracking across sequences
      // validator.checkDependencies
    ],
  };
  registry.register(operationCallChecks, v.operationCall);

  const actionChecks: ValidationChecks<EligianAstType> = {
    BreakStatement: v.action.checkBreakInsideLoop,
    ContinueStatement: v.action.checkContinueInsideLoop,
    RegularActionDefinition: [
      v.action.checkActionNameCollision, // T039: US2 - Name collision detection
      v.action.checkRecursiveActionCalls, // Detect infinite recursion
      v.action.checkControlFlowPairing,
      v.action.checkErasedPropertiesInAction, // T254-T255: Erased property validation
      v.action.checkPrivateOnlyInLibraries, // T056: US3 - Validate 'private' only in libraries
    ],
    EndableActionDefinition: [
      v.action.checkActionNameCollision, // T039: US2 - Name collision detection
      v.action.checkRecursiveActionCalls, // Detect infinite recursion
      v.action.checkControlFlowPairingInStartOps,
      v.action.checkControlFlowPairingInEndOps,
      v.action.checkErasedPropertiesInStartOps, // T254-T255: Erased property validation
      v.action.checkErasedPropertiesInEndOps, // T254-T255: Erased property validation
      v.action.checkPrivateOnlyInLibraries, // T056: US3 - Validate 'private' only in libraries
    ],
    InlineEndableAction: [
      v.action.checkControlFlowPairingInInlineStart,
      v.action.checkControlFlowPairingInInlineEnd,
      v.action.checkErasedPropertiesInInlineStart, // T254-T255: Erased property validation
      v.action.checkErasedPropertiesInInlineEnd, // T254-T255: Erased property validation
    ],
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

  const navigateChecks: ValidationChecks<EligianAstType> = {
    NavigateStatement: [
      v.navigate.checkNavigateTarget, // navigate target must name an existing timeline
      v.navigate.checkNavigateSelector, // navigate selector must resolve against imported CSS
    ],
  };
  registry.register(navigateChecks, v.navigate);
}
