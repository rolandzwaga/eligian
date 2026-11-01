import { type AstNode, AstUtils, type ValidationAcceptor } from 'langium';
import { hasOperation } from '../compiler/operations/index.js';
import { reportNotInLayout, selectorNames } from '../css/selector-sources.js';
import { reportSelectorIssues } from '../css/selector-validation.js';
import {
  type InteractionStatement,
  isActionDefinition,
  isParameterReference,
  isPropertyChainReference,
  isStringLiteral,
  isSystemPropertyReference,
  isTimedEvent,
  isVariableDeclaration,
  isVariableReference,
  type TimedEvent,
  type WithStatement,
} from '../generated/ast.js';
import { DOM_EVENTS, similarDomEvents } from '../utils/dom-events.js';
import { invalidKeyName } from '../utils/key-names.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { getTimelines } from '../utils/program-helpers.js';
import { BaseValidator } from './base-validator.js';

/**
 * Validates interaction statements (`on <event> "<sel>" <verb>`: `navigate` for
 * hub ↔ chapter timeline switching, the playback verbs and `run`, idea #19).
 *
 * - The target must name a timeline declared in the same program (hard error);
 *   a click that switches to a non-existent timeline can never succeed.
 * - The selector is validated against imported CSS, like operation-call
 *   selectors (Feature 013) — every selector must resolve to imported CSS.
 * - The event should be a DOM event (warning: custom events exist).
 * - `run` starts an action, with arguments known at compile time.
 */
export class NavigateValidator extends BaseValidator {
  /**
   * The navigate target must match a timeline name in the same program.
   */
  checkNavigateTarget(node: InteractionStatement, accept: ValidationAcceptor): void {
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
   * `on key "<keys>"`: every shortcut must be one the KeyboardController can
   * match (it throws in init otherwise).
   */
  checkInteractionKeys(node: InteractionStatement, accept: ValidationAcceptor): void {
    if (node.keys === undefined) return;
    const invalid = invalidKeyName(node.keys);
    if (invalid === undefined) return;
    const message =
      invalid === ''
        ? '\'on key\' needs at least one key, such as "ArrowRight" or "shift+right, space"'
        : `Unknown key '${invalid}' in "${node.keys}". Use key names such as "ArrowRight", "space", "Enter", "Escape", "PageDown", "F1", a letter or digit, joined to modifiers (shift, alt, ctrl, meta) with '+' and separated by ','`;
    accept('error', message, { node, property: 'keys', code: 'unknown_key' });
  }

  /** Idea #19: the event of an interaction should be a DOM event name. */
  checkInteractionEvent(node: InteractionStatement, accept: ValidationAcceptor): void {
    if (node.event === undefined || DOM_EVENTS.has(node.event)) return;
    const similar = similarDomEvents(node.event);
    const hint =
      similar.length > 0 ? ` Did you mean: ${similar.map(e => `'${e}'`).join(', ')}?` : '';
    accept('warning', `'${node.event}' is not a known DOM event.${hint}`, {
      node,
      property: 'event',
      code: 'unknown_dom_event',
      data: { suggestions: similar },
    });
  }

  /**
   * Idea #19: `run` starts an action (DOMEventListenerController runs actions,
   * not operations) and its arguments are stored in the listener, so they must
   * be known when it is attached: no parameters, loop items or property chains.
   */
  checkRunCall(node: InteractionStatement, accept: ValidationAcceptor): void {
    const call = node.call;
    if (node.verb !== 'run' || !call) return;
    if (!isActionDefinition(call.operationName?.ref)) {
      // An unknown name is reported by the operation-existence validator
      const name = getOperationCallName(call);
      if (hasOperation(name, call)) {
        accept(
          'error',
          `'run' starts an action, and '${name}' is an operation: wrap it in an action`,
          { node: call, property: 'operationName', code: 'run_not_an_action' }
        );
      }
      return;
    }
    for (const argument of call.args) {
      const runtime = runtimeValueIn(argument);
      if (runtime) {
        accept(
          'error',
          `A 'run' argument must be known when the listener is attached (a literal or constant): '${runtime.$cstNode?.text ?? '?'}' is a runtime value`,
          { node: runtime, code: 'run_runtime_argument' }
        );
      }
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
    const { classes, ids } = selectorNames(this.services, program, documentUri);
    reportSelectorIssues(selector, reportNode, classes, ids, accept, property);
    reportNotInLayout(selector, reportNode, this.services, program, documentUri, accept, property);
  }

  /**
   * The navigate selector must resolve against imported CSS.
   */
  checkNavigateSelector(node: InteractionStatement, accept: ValidationAcceptor): void {
    if (!this.services) return;
    // `on key "…"` without `in "<sel>"`: attached to the timeline container
    const selector = node.selector;
    if (selector === undefined) return;

    const program = this.getProgram(node);
    const documentUri = program?.$document?.uri?.toString();
    if (!program || !documentUri) return;

    this.ensureCSSImportsRegistered(program, documentUri);

    // Idea #18: classes and ids of the imported CSS and of the layout HTML
    const { classes, ids } = selectorNames(this.services, program, documentUri);
    reportSelectorIssues(selector, node, classes, ids, accept);
    reportNotInLayout(selector, node, this.services, program, documentUri, accept, 'selector');
  }
}

/**
 * The first part of `expression` that is only known at runtime: a parameter,
 * a loop item (`@@item`), a property chain, or a constant holding one.
 */
function runtimeValueIn(expression: AstNode, visiting = new Set<AstNode>()): AstNode | undefined {
  for (const node of AstUtils.streamAst(expression)) {
    if (isParameterReference(node) || isSystemPropertyReference(node)) return node;
    if (isPropertyChainReference(node)) return node;
    if (isVariableReference(node)) {
      const declaration = node.variable?.ref;
      if (!isVariableDeclaration(declaration) || visiting.has(declaration)) continue;
      visiting.add(declaration);
      if (declaration.value && runtimeValueIn(declaration.value, visiting)) return node;
    }
  }
  return undefined;
}
