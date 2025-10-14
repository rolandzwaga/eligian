import type { ValidationChecks } from 'langium';
import type { EligianAstType } from './generated/ast.js';
import type { EligianServices } from './eligian-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: EligianServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.EligianValidator;
    const checks: ValidationChecks<EligianAstType> = {
        // TODO: Declare validators for your properties
        // See doc : https://langium.org/docs/learn/workflow/create_validations/
        /*
        Element: validator.checkElement
        */
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class EligianValidator {

    // TODO: Add logic here for validation checks of properties
    // See doc : https://langium.org/docs/learn/workflow/create_validations/
    /*
    checkElement(element: Element, accept: ValidationAcceptor): void {
        // Always accepts
    }
    */
}
