import type { AstNode, ValidationAcceptor } from 'langium';
import { reportSelectorIssues } from '../css/selector-validation.js';
import {
  isStringLiteral,
  isTimedEvent,
  type NavigateStatement,
  type TimedEvent,
  type WithStatement,
} from '../generated/ast.js';
import { getTimelines } from '../utils/program-helpers.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validates `navigate` statements (hub ↔ chapter timeline switching).
 *
 * - The target must name a timeline declared in the same program (hard error);
 *   a click that switches to a non-existent timeline can never succeed.
 * - The selector is validated against imported CSS, like operation-call
 *   selectors (Feature 013) — every selector must resolve to imported CSS.
 */
export class NavigateValidator extends BaseValidator {
  /**
   * The navigate target must match a timeline name in the same program.
   */
  checkNavigateTarget(node: NavigateStatement, accept: ValidationAcceptor): void {
    const program = this.getProgram(node);
    if (!program) return;
    // Partial AST (recovered after a syntax error): the parse error is enough.
    if (node.target === undefined) return;

    const timelineNames = getTimelines(program).map(t => t.name);
    if (!timelineNames.includes(node.target)) {
      let message = `Unknown navigate target: '${node.target}'. No timeline with this name exists.`;
      if (timelineNames.length > 0) {
        message += ` Available timelines: ${timelineNames.map(n => `'${n}'`).join(', ')}.`;
      }
      accept('error', message, {
        node,
        property: 'target',
        data: { code: 'unknown_navigate_target' },
      });
    }
  }

  /**
   * Idea #17: the selector of `at … target "<sel>"` and of a `with "<sel>" { }`
   * block resolve against imported CSS like every selector (a `with` selector
   * that is not a string literal is checked at runtime).
   */
  checkTargetSelector(node: TimedEvent | WithStatement, accept: ValidationAcceptor): void {
    if (!this.services) return;
    const program = this.getProgram(node);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return;

    let selector: string | undefined;
    let reportNode: AstNode = node;
    let property: string | undefined;
    if (isTimedEvent(node)) {
      selector = node.target;
      property = 'target';
    } else if (isStringLiteral(node.selector)) {
      selector = node.selector.value;
      reportNode = node.selector;
    }
    if (selector === undefined) return;

    this.ensureCSSImportsRegistered(program, documentUri);
    const cssRegistry = this.services.css.CSSRegistry;
    reportSelectorIssues(
      selector,
      reportNode,
      cssRegistry.getClassesForDocument(documentUri),
      cssRegistry.getIDsForDocument(documentUri),
      accept,
      property
    );
  }

  /**
   * The navigate selector must resolve against imported CSS.
   */
  checkNavigateSelector(node: NavigateStatement, accept: ValidationAcceptor): void {
    if (!this.services) return;

    const program = this.getProgram(node);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return;

    this.ensureCSSImportsRegistered(program, documentUri);

    const cssRegistry = this.services.css.CSSRegistry;
    const availableClasses = cssRegistry.getClassesForDocument(documentUri);
    const availableIDs = cssRegistry.getIDsForDocument(documentUri);

    reportSelectorIssues(node.selector, node, availableClasses, availableIDs, accept);
  }
}
