import type { ValidationAcceptor } from 'langium';
import type { EligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';
import { BaseValidator } from './base-validator.js';
import { ProgramAssetImportValidator } from './program/asset-import-validator.js';
import { ProgramDuplicateValidator } from './program/duplicate-validator.js';
import { ProgramImportNameValidator } from './program/import-name-collision-validator.js';
import { ProgramStructureValidator } from './program/structure-validator.js';

/**
 * Program-level validations for the Eligian DSL.
 *
 * Thin delegator (W3 decomposition): the former ~515-line class is split into
 * four collaborating, independently-testable validators grouped by check family
 * — structure (timeline presence), duplicates (actions/constants/event handlers),
 * import names (named-import + collision), and asset imports (assets/CSS/locales).
 * This class keeps the single registered DI surface
 * (`services.validation.EligianValidator.program`) so the `Program` check map in
 * {@link registerValidationChecks} is unchanged; each registered method forwards
 * to the owning collaborator.
 */
export class ProgramValidator extends BaseValidator {
  private readonly structure: ProgramStructureValidator;
  private readonly duplicates: ProgramDuplicateValidator;
  private readonly importNames: ProgramImportNameValidator;
  private readonly assets: ProgramAssetImportValidator;

  constructor(services: EligianServices) {
    super(services);
    this.structure = new ProgramStructureValidator(services);
    this.duplicates = new ProgramDuplicateValidator(services);
    this.importNames = new ProgramImportNameValidator(services);
    this.assets = new ProgramAssetImportValidator(services);
  }

  checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
    this.structure.checkTimelineRequired(program, accept);
  }

  checkDuplicateActions(program: Program, accept: ValidationAcceptor): void {
    this.duplicates.checkDuplicateActions(program, accept);
  }

  checkDuplicateConstants(program: Program, accept: ValidationAcceptor): void {
    this.duplicates.checkDuplicateConstants(program, accept);
  }

  checkDuplicateEventActions(program: Program, accept: ValidationAcceptor): void {
    this.duplicates.checkDuplicateEventActions(program, accept);
  }

  checkNamedImportNames(program: Program, accept: ValidationAcceptor): void {
    this.importNames.checkNamedImportNames(program, accept);
  }

  checkImportNameCollisions(program: Program, accept: ValidationAcceptor): void {
    this.importNames.checkImportNameCollisions(program, accept);
  }

  checkAssetLoading(program: Program, accept: ValidationAcceptor): void {
    this.assets.checkAssetLoading(program, accept);
  }

  checkCSSImports(program: Program, accept: ValidationAcceptor): void {
    this.assets.checkCSSImports(program, accept);
  }

  checkLocalesImports(program: Program, accept: ValidationAcceptor): Promise<void> {
    return this.assets.checkLocalesImports(program, accept);
  }
}
