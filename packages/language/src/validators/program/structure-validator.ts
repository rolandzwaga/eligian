import type { ValidationAcceptor } from 'langium';
import type { Program } from '../../generated/ast.js';
import { getTimelines } from '../../utils/program-helpers.js';
import { BaseValidator } from '../base-validator.js';

/**
 * Program structural validations (timeline presence).
 */
export class ProgramStructureValidator extends BaseValidator {
  /**
   * Validate that every program has at least one timeline declaration.
   *
   * Eligius requires at least one timeline provider to drive events.
   * Multiple timelines are supported for complex scenarios (e.g., synchronized video+audio).
   */
  checkTimelineRequired(program: Program, accept: ValidationAcceptor): void {
    const timelines = getTimelines(program);

    if (timelines.length === 0) {
      accept(
        'error',
        'A timeline declaration is required. Add: timeline "<name>" using <provider> { ... }',
        {
          node: program,
          property: 'statements',
        }
      );
    }
    // Multiple timelines are now allowed (removed restriction)
  }
}
