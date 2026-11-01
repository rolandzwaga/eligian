/**
 * Operation-data dataflow with inferred action contracts (spec 047).
 *
 * Eligius passes one `operationData` object through an action's operations.
 * Operations declare dependencies (properties they read, e.g. addClass needs
 * `selectedElement`) and outputs (properties they add, e.g. selectElement adds
 * `selectedElement`); both come from the generated operation registry.
 *
 * Where an action body starts depends on how it is entered:
 * - timeline actions, sequence/stagger items: empty (plus the call's arguments)
 * - event actions: `{ eventArgs }`
 * - startAction/endAction from another action: the caller's whole operationData
 * - DOMEventListenerController, KeyboardController, `on <event> … run`:
 *   `actionOperationData` + `eventTarget` + `eventKey`, each
 *   listed action's result merging into the next
 *
 * So a regular action may rely on its caller: `action highlight() [ addClass("on") ]`
 * is fine when called after a selectElement. Each action therefore gets an
 * inferred contract: the properties it needs that it does not create itself.
 * Contracts propagate to call sites (transitively); only entry bodies, whose
 * starting state is known, report missing properties. A callee's outputs never
 * flow back to its caller (eligius start-action.ts restores the caller's data).
 *
 * This module is shared by the IDE validator (validators/dataflow-validator.ts)
 * and the compiler (ast-transformer.ts), so both accept the same programs.
 */
import { type AstNode, AstUtils } from 'langium';
import {
  findOperationsWithOutput,
  getOperationSignature,
  hasOperation,
} from '../compiler/operations/index.js';
import {
  type ActionDefinition,
  type ArrayLiteral,
  type EventActionDefinition,
  type Expression,
  isActionDefinition,
  isArrayLiteral,
  isBooleanLiteral,
  isEndableActionDefinition,
  isEventActionDefinition,
  isForStatement,
  isIfStatement,
  isInlineEndableAction,
  isInteractionStatement,
  isLibrary,
  isObjectLiteral,
  isOperationCall,
  isProgram,
  isSequenceBlock,
  isStaggerBlock,
  isStringLiteral,
  isTimedEvent,
  isTimeline,
  isWithStatement,
  type Library,
  type OperationCall,
  type OperationStatement,
  type Program,
} from '../generated/ast.js';
import { OperationDataTracker } from '../operation-data-tracker.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';

export type ActionPhase = 'start' | 'end';

/** A property an action needs from whoever starts it. */
export interface Requirement {
  readonly property: string;
  /** The operation that reads the property. */
  readonly operation: string;
  /** The action whose body contains that operation (may be a transitively called one). */
  readonly action: string;
}

export type DataflowCode =
  | 'missing-dependency'
  | 'missing-action-dependency'
  | 'erased-property-access';

export interface DataflowDiagnostic {
  readonly node: AstNode;
  /** The node property to highlight (`operationName` for calls). */
  readonly property?: string;
  readonly message: string;
  readonly code: DataflowCode;
}

export interface DataflowEnvironment {
  /**
   * Resolve an action called by `name` from the scope of `context` (local and
   * imported actions, aliases included). Used for controller action lists and
   * for calls whose reference is not linked.
   */
  resolveAction(context: AstNode, name: string): ActionDefinition | undefined;
}

/** Name of the controller that starts actions listed by name on a DOM event. */
const DOM_EVENT_CONTROLLER = 'DOMEventListenerController';

/**
 * Controllers that start actions listed by name, with the same parameter
 * positions (event or keys, actions, actionOperationData): the DOM event
 * listener and (Eligius 3.1) the KeyboardController.
 */
const KEYBOARD_CONTROLLER = 'KeyboardController';
const ACTION_CONTROLLERS: ReadonlySet<string> = new Set([
  DOM_EVENT_CONTROLLER,
  KEYBOARD_CONTROLLER,
]);

/**
 * What these controllers give the actions they start, besides
 * actionOperationData: the event target and (Eligius 3.1) `eventKey`, the
 * KeyboardEvent.key (undefined for other DOM events).
 */
const DOM_EVENT_CONTROLLER_PROVIDES = ['eventTarget', 'eventKey'];

interface WalkContext {
  /** Entry body: its starting state is known, so unmet dependencies are errors. */
  readonly entry: boolean;
  /** Statements of an end block: endable callees are ended (endAction), not started. */
  readonly endBlock: boolean;
  /** Name of the action being analysed (for requirement messages). */
  readonly owner: string;
  /** Collects requirements when not an entry body. */
  readonly requires?: Map<string, Requirement>;
  /** Receives diagnostics; undefined while silently computing a contract. */
  readonly report?: (diagnostic: DataflowDiagnostic) => void;
}

type ContractKey = { readonly action: ActionDefinition; readonly phase: ActionPhase };

/**
 * One analysis run. Contracts are memoized per instance; create a new instance
 * per validation or compilation, since the AST it reads may change between runs.
 */
export class OperationDataflow {
  private readonly contracts = new Map<
    ActionDefinition,
    Map<ActionPhase, Map<string, Requirement>>
  >();
  private readonly settled = new Set<string>();
  /** Contracts of the component being iterated: read, not recomputed, on recursion. */
  private readonly inProgress = new Set<string>();
  private readonly keyIds = new Map<ActionDefinition, number>();

  constructor(private readonly env: DataflowEnvironment) {}

  /**
   * The properties `action` needs from whoever starts (`'start'`) or ends
   * (`'end'`) it, in the order first needed.
   */
  requirementsOf(action: ActionDefinition, phase: ActionPhase = 'start'): Requirement[] {
    return [...this.contractOf({ action, phase }).values()];
  }

  /** All dataflow diagnostics for the actions, event actions and timelines of `root`. */
  analyzeDocument(root: Program | Library): DataflowDiagnostic[] {
    const diagnostics: DataflowDiagnostic[] = [];
    // A sequence's `each` / `then` block is analyzed once per item: report each
    // finding on a node once
    const reported = new Map<AstNode, Set<string>>();
    const report = (diagnostic: DataflowDiagnostic) => {
      const messages = reported.get(diagnostic.node) ?? new Set<string>();
      if (messages.has(diagnostic.message)) return;
      messages.add(diagnostic.message);
      reported.set(diagnostic.node, messages);
      diagnostics.push(diagnostic);
    };

    const actions = isLibrary(root)
      ? root.actions
      : root.statements.filter((s): s is ActionDefinition => isActionDefinition(s));
    for (const action of actions) {
      for (const phase of phasesOf(action)) {
        // Non-entry: only erasures are reported; unmet dependencies are requirements
        this.walk(bodyOf(action, phase), this.initialState(action), {
          entry: false,
          endBlock: phase === 'end',
          owner: action.name,
          requires: new Map(),
          report,
        });
      }
    }
    if (isLibrary(root)) return diagnostics;

    for (const statement of root.statements) {
      if (isEventActionDefinition(statement)) {
        this.analyzeEventAction(statement, report);
      } else if (isTimeline(statement)) {
        // `on enter` / `on leave` (audit idea #6): the start and end block of one
        // timeline action, each starting with empty operation data like inline blocks
        for (const block of statement.lifecycle) {
          this.walk(
            block.operations,
            new OperationDataTracker(),
            entryContext('', block.kind === 'leave', report)
          );
        }
        for (const event of statement.events) {
          this.analyzeTimelineEvent(event, report);
        }
      }
    }
    return diagnostics;
  }

  private analyzeEventAction(
    eventAction: EventActionDefinition,
    report: (d: DataflowDiagnostic) => void
  ): void {
    // Eligius starts event actions with { eventArgs } (actionregistry-eventbus-listener.ts)
    const state = new OperationDataTracker();
    state.assume('eventArgs');
    this.walk(eventAction.operations, state, entryContext(eventAction.name, false, report));
  }

  private analyzeTimelineEvent(event: AstNode, report: (d: DataflowDiagnostic) => void): void {
    if (isTimedEvent(event)) {
      const action = event.action;
      // Idea #17: `target "<sel>"` selects the element before each block
      const fresh = () => {
        const state = new OperationDataTracker();
        if (event.target !== undefined) {
          this.applyOperation(
            'selectElement',
            event,
            state,
            entryContext('', false, () => {})
          );
        }
        return state;
      };
      if (isInlineEndableAction(action)) {
        this.walk(action.startOperations, fresh(), entryContext('', false, report));
        this.walk(action.endOperations, fresh(), entryContext('', true, report));
      } else if (isOperationCall(action)) {
        this.analyzeTimelineCall(action, report, fresh);
      } else {
        this.walk([action], fresh(), entryContext('', false, report));
      }
    } else if (isSequenceBlock(event)) {
      // Idea #11: every item runs `each [..]` first and `then [..]` after its end;
      // inline items are start/end blocks like an inline `at` event
      for (const item of event.items) {
        if (item.actionCall) {
          if (event.prelude.length > 0) {
            this.walk(event.prelude, new OperationDataTracker(), entryContext('', false, report));
          }
          this.analyzeTimelineCall(item.actionCall, report);
          if (event.postlude.length > 0) {
            this.walk(event.postlude, new OperationDataTracker(), entryContext('', true, report));
          }
        } else {
          this.walk(
            [...event.prelude, ...item.startOps],
            new OperationDataTracker(),
            entryContext('', false, report)
          );
          this.walk(
            [...item.endOps, ...event.postlude],
            new OperationDataTracker(),
            entryContext('', true, report)
          );
        }
      }
    } else if (isStaggerBlock(event)) {
      if (event.actionCall) {
        this.analyzeTimelineCall(event.actionCall, report);
      } else {
        this.walk(event.startOps, new OperationDataTracker(), entryContext('', false, report));
        this.walk(event.endOps, new OperationDataTracker(), entryContext('', true, report));
      }
    }
  }

  /**
   * A timeline-level call: an action started (and, when endable, ended) by the
   * engine with only its arguments, or a plain operation.
   */
  private analyzeTimelineCall(
    call: OperationCall,
    report: (d: DataflowDiagnostic) => void,
    fresh: () => OperationDataTracker = () => new OperationDataTracker()
  ): void {
    const callee = this.calleeOf(call);
    if (!callee) {
      this.walk([call], fresh(), entryContext('', false, report));
      return;
    }
    const seen = new Set<string>();
    for (const phase of phasesOf(callee)) {
      this.checkCall(call, callee, phase, fresh(), {
        ...entryContext('', phase === 'end', report),
        // The same requirement of start and end blocks is reported once
        report: d => {
          if (!seen.has(d.message)) {
            seen.add(d.message);
            report(d);
          }
        },
      });
    }
  }

  private initialState(action: ActionDefinition): OperationDataTracker {
    // Action arguments arrive as operationData keys (startAction's actionOperationData)
    const state = new OperationDataTracker();
    for (const parameter of action.parameters) {
      state.assume(parameter.name);
    }
    return state;
  }

  private walk(
    statements: readonly OperationStatement[],
    state: OperationDataTracker,
    ctx: WalkContext
  ): OperationDataTracker {
    let current = state;
    for (const statement of statements) {
      if (isOperationCall(statement)) {
        this.walkCall(statement, current, ctx);
      } else if (isIfStatement(statement)) {
        // Each branch starts from the pre-branch state; after the join only
        // properties available in both remain (a missing else is the pre-state).
        const thenState = this.walk(statement.thenOps, current.clone(), ctx);
        const elseState = this.walk(statement.elseOps, current.clone(), ctx);
        thenState.merge(elseState);
        current = thenState;
      } else if (isForStatement(statement)) {
        // The body may run zero times, so its resulting state is discarded
        this.walk(statement.body, current.clone(), ctx);
      } else if (isWithStatement(statement)) {
        // Idea #17: selectElement(<selector>), then the body; the selection stays
        this.applyOperation('selectElement', statement, current, ctx, [statement.selector]);
        current = this.walk(statement.body, current, ctx);
      } else if (isInteractionStatement(statement)) {
        // Compiles to selectElement + getControllerInstance + addControllerToElement
        for (const operation of [
          'selectElement',
          'getControllerInstance',
          'addControllerToElement',
        ]) {
          this.applyOperation(operation, statement, current, ctx);
        }
        // Idea #19: the listener starts a `run` action later, with fresh data
        if (statement.verb === 'run' && statement.call && ctx.report) {
          this.checkRunAction(
            statement.call,
            statement.keys === undefined ? DOM_EVENT_CONTROLLER : KEYBOARD_CONTROLLER,
            ctx.report
          );
        }
      }
      // const/break/continue do not change operationData
    }
    return current;
  }

  private walkCall(call: OperationCall, state: OperationDataTracker, ctx: WalkContext): void {
    const callee = this.calleeOf(call);
    if (callee) {
      const phase = ctx.endBlock && isEndableActionDefinition(callee) ? 'end' : 'start';
      this.checkCall(call, callee, phase, state, ctx);
      return;
    }

    const name = getOperationCallName(call);
    if (name === 'addController') {
      // Compiles to getControllerInstance + addControllerToElement
      this.applyOperation('getControllerInstance', call, state, ctx);
      this.applyOperation('addControllerToElement', call, state, ctx);
      if (ctx.report) this.checkControllerActions(call, ctx.report);
      return;
    }

    if (hasOperation(name)) {
      this.applyOperation(name, call, state, ctx, call.args);
    }
    // Unknown names are reported by the operation-existence validator
  }

  /** An action call: requestAction, the callee's contract, then startAction/endAction. */
  private checkCall(
    call: OperationCall,
    callee: ActionDefinition,
    phase: ActionPhase,
    state: OperationDataTracker,
    ctx: WalkContext
  ): void {
    this.applyOperation('requestAction', call, state, ctx);
    for (const requirement of this.contractOf({ action: callee, phase }).values()) {
      if (state.hasProperty(requirement.property)) continue;
      this.unmet(requirement.property, call, state, ctx, {
        code: 'missing-action-dependency',
        requirement,
        message: `Action '${callee.name}' requires '${requirement.property}' (${usedBy(requirement)}), which is not available here - ensure it is created before calling '${callee.name}'${providerHint(requirement.property)}`,
      });
    }
    // The callee's outputs do not flow back: the caller continues with its own data
    this.applyOperation(phase === 'end' ? 'endAction' : 'startAction', call, state, ctx);
  }

  /**
   * `addController("DOMEventListenerController", event, ["a", "end:b"], data?)`
   * (or `addController("KeyboardController", keys, [...], data?)`) starts the
   * listed actions with only `actionOperationData` + `eventTarget` + `eventKey`,
   * each one's result merging into the next. A non-literal list is an unknown
   * caller and is not checked.
   */
  private checkControllerActions(
    call: OperationCall,
    report: (d: DataflowDiagnostic) => void
  ): void {
    const [controller, , actions, data] = call.args;
    if (!isStringLiteral(controller) || !ACTION_CONTROLLERS.has(controller.value)) return;
    if (!isArrayLiteral(actions)) return;

    const state = new OperationDataTracker();
    for (const property of DOM_EVENT_CONTROLLER_PROVIDES) state.assume(property);
    if (data !== undefined) {
      const keys = literalObjectKeys(data);
      if (keys) {
        for (const key of keys) state.assume(key);
      } else {
        state.markUnknown();
      }
    }

    for (const element of actions.elements) {
      if (!isStringLiteral(element)) return; // dynamic list from here on: unknown
      const isEnd = element.value.startsWith('end:');
      const name = isEnd ? element.value.slice('end:'.length) : element.value;
      const action = this.env.resolveAction(call, name);
      if (!action) continue; // reported by the controller validators
      const phase: ActionPhase = isEnd && isEndableActionDefinition(action) ? 'end' : 'start';

      for (const requirement of this.contractOf({ action, phase }).values()) {
        if (state.hasProperty(requirement.property)) continue;
        report({
          node: element,
          code: 'missing-action-dependency',
          message: `Action '${name}' requires '${requirement.property}' (${usedBy(requirement)}), which ${controller.value} does not provide: it starts its actions with only eventTarget, eventKey and actionOperationData${providerHint(requirement.property)}`,
        });
      }
      // This action's result is the next one's starting data
      const exit = this.exitState(action, phase);
      for (const property of exit.getAvailableProperties()) {
        state.assume(property);
      }
      if (exit.isUnknown()) state.markUnknown();
    }
  }

  /**
   * `on <event> "<sel>" run action(args)` (idea #19): DOMEventListenerController
   * starts the action with only eventTarget, eventKey and its arguments.
   */
  private checkRunAction(
    call: OperationCall,
    controller: string,
    report: (d: DataflowDiagnostic) => void
  ): void {
    const action = this.calleeOf(call);
    if (!action) return; // `run` of a non-action: reported by the interaction validator
    const state = new OperationDataTracker();
    for (const property of DOM_EVENT_CONTROLLER_PROVIDES) state.assume(property);
    for (const parameter of action.parameters ?? []) state.assume(parameter.name);
    for (const requirement of this.contractOf({ action, phase: 'start' }).values()) {
      if (state.hasProperty(requirement.property)) continue;
      report({
        node: call,
        code: 'missing-action-dependency',
        message: `Action '${action.name}' requires '${requirement.property}' (${usedBy(requirement)}), which is not available when the event runs it: ${controller} starts it with only eventTarget, eventKey and its arguments${providerHint(requirement.property)}`,
      });
    }
  }

  /** The operationData an action leaves behind, assuming its contract is met. */
  private exitState(action: ActionDefinition, phase: ActionPhase): OperationDataTracker {
    const state = this.initialState(action);
    for (const requirement of this.contractOf({ action, phase }).values()) {
      state.assume(requirement.property);
    }
    return this.walk(bodyOf(action, phase), state, {
      entry: false,
      endBlock: phase === 'end',
      owner: action.name,
      requires: new Map(),
    });
  }

  /** Apply one registry operation, reporting or requiring its unmet dependencies first. */
  private applyOperation(
    operation: string,
    node: AstNode,
    state: OperationDataTracker,
    ctx: WalkContext,
    args?: readonly Expression[]
  ): void {
    for (const property of state.missingDependencies(operation)) {
      this.unmet(property, node, state, ctx, {
        code: 'missing-dependency',
        requirement: { property, operation, action: ctx.owner },
        message: `Property '${property}' is not available - ensure it is created by a previous operation${providerHint(property)}`,
      });
    }
    if (args && applyDynamicOutputs(operation, args, state)) return;
    state.processOperation(operation);
  }

  /**
   * An unavailable property: erased on this path (always an error), missing in
   * an entry body (error), or a requirement of the action being analysed.
   */
  private unmet(
    property: string,
    node: AstNode,
    state: OperationDataTracker,
    ctx: WalkContext,
    problem: { code: DataflowCode; message: string; requirement: Requirement }
  ): void {
    const erasure = state.findErasurePoint(property);
    if (erasure) {
      ctx.report?.({
        node,
        property: isOperationCall(node) ? 'operationName' : undefined,
        code: 'erased-property-access',
        message: `Property '${property}' is not available - it was erased by operation '${erasure.operation}'`,
      });
      return;
    }
    if (ctx.entry) {
      ctx.report?.({
        node,
        property: isOperationCall(node) ? 'operationName' : undefined,
        code: problem.code,
        message: problem.message,
      });
      return;
    }
    if (ctx.requires && !ctx.requires.has(property)) {
      ctx.requires.set(property, problem.requirement);
    }
    // Assumed provided by the caller from here on
    state.assume(property);
  }

  private calleeOf(call: OperationCall): ActionDefinition | undefined {
    const ref = call.operationName.ref;
    if (isActionDefinition(ref)) return ref;
    const name = getOperationCallName(call);
    // Unified call syntax: actions first; an unlinked call may still name an action
    if (name === 'addController' || hasOperation(name)) return undefined;
    return this.env.resolveAction(call, name);
  }

  /**
   * The contract of `key`, computed together with every action reachable from it
   * by fixed-point iteration (requirement sets only grow, so it terminates, also
   * for recursive calls).
   */
  private contractOf(key: ContractKey): Map<string, Requirement> {
    const id = this.idOf(key);
    if (this.settled.has(id) || this.inProgress.has(id)) return this.getContract(key)!;

    const component = this.reachableFrom(key).filter(k => !this.settled.has(this.idOf(k)));
    for (const k of component) {
      if (!this.getContract(k)) this.setContract(k, new Map());
      this.inProgress.add(this.idOf(k));
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const k of component) {
        const before = this.getContract(k)!;
        const after = this.computeContract(k);
        if (after.size !== before.size) {
          this.setContract(k, after);
          changed = true;
        }
      }
    }
    for (const k of component) {
      this.inProgress.delete(this.idOf(k));
      this.settled.add(this.idOf(k));
    }
    return this.getContract(key)!;
  }

  private computeContract(key: ContractKey): Map<string, Requirement> {
    const requires = new Map<string, Requirement>();
    this.walk(bodyOf(key.action, key.phase), this.initialState(key.action), {
      entry: false,
      endBlock: key.phase === 'end',
      owner: key.action.name,
      requires,
    });
    return requires;
  }

  /** `key` and every action/phase its bodies call, transitively (controller lists excluded). */
  private reachableFrom(key: ContractKey): ContractKey[] {
    const found = new Map<string, ContractKey>();
    const visit = (k: ContractKey) => {
      const id = this.idOf(k);
      if (found.has(id)) return;
      found.set(id, k);
      for (const call of callsIn(bodyOf(k.action, k.phase))) {
        const callee = this.calleeOf(call);
        if (!callee) continue;
        // Calls in an end block end endable callees (as walkCall does)
        const phase = k.phase === 'end' && isEndableActionDefinition(callee) ? 'end' : 'start';
        visit({ action: callee, phase });
      }
    };
    visit(key);
    return [...found.values()];
  }

  private idOf(key: ContractKey): string {
    let id = this.keyIds.get(key.action);
    if (id === undefined) {
      id = this.keyIds.size;
      this.keyIds.set(key.action, id);
    }
    return `${id}:${key.phase}`;
  }

  private getContract(key: ContractKey): Map<string, Requirement> | undefined {
    return this.contracts.get(key.action)?.get(key.phase);
  }

  private setContract(key: ContractKey, requires: Map<string, Requirement>): void {
    let phases = this.contracts.get(key.action);
    if (!phases) {
      phases = new Map();
      this.contracts.set(key.action, phases);
    }
    phases.set(key.phase, requires);
  }
}

function entryContext(
  owner: string,
  endBlock: boolean,
  report: (d: DataflowDiagnostic) => void
): WalkContext {
  return { entry: true, endBlock, owner, report };
}

function phasesOf(action: ActionDefinition): ActionPhase[] {
  return isEndableActionDefinition(action) ? ['start', 'end'] : ['start'];
}

function bodyOf(action: ActionDefinition, phase: ActionPhase): readonly OperationStatement[] {
  if (isEndableActionDefinition(action)) {
    return phase === 'end' ? action.endOperations : action.startOperations;
  }
  return phase === 'start' ? action.operations : [];
}

/** Operation and action calls in `statements`, nested if/for bodies included. */
function callsIn(statements: readonly OperationStatement[]): OperationCall[] {
  const calls: OperationCall[] = [];
  for (const statement of statements) {
    for (const node of AstUtils.streamAst(statement)) {
      if (isOperationCall(node)) calls.push(node);
    }
  }
  return calls;
}

function usedBy(requirement: Requirement): string {
  return requirement.action
    ? `used by ${requirement.operation} in '${requirement.action}'`
    : `used by ${requirement.operation}`;
}

function providerHint(property: string): string {
  const providers = findOperationsWithOutput(property).map(op => op.systemName);
  return providers.length > 0 ? ` (for example with ${providers.slice(0, 3).join(' or ')})` : '';
}

/** Keys of an object literal, or undefined when `expr` is not one. */
function literalObjectKeys(expr: Expression | undefined): string[] | undefined {
  return isObjectLiteral(expr) ? expr.properties.map(p => String(p.key)) : undefined;
}

/** String elements of an array literal, or undefined when `expr` is not an all-string literal. */
function literalStrings(expr: Expression | undefined): string[] | undefined {
  if (!isArrayLiteral(expr)) return undefined;
  const elements = (expr as ArrayLiteral).elements;
  return elements.every(isStringLiteral) ? elements.map(e => e.value) : undefined;
}

/**
 * Operations whose outputs are their arguments' keys (spec 047 decision 3):
 * literal keys are modelled, anything else makes the state unknown. Returns
 * true when `operation` was handled here.
 */
function applyDynamicOutputs(
  operation: string,
  args: readonly Expression[],
  state: OperationDataTracker
): boolean {
  const arg = (name: string): Expression | undefined => {
    const index =
      getOperationSignature(operation)?.parameters.findIndex(p => p.name === name) ?? -1;
    return index >= 0 ? args[index] : undefined;
  };

  switch (operation) {
    case 'setOperationData': {
      const keys = literalObjectKeys(arg('properties'));
      const override = arg('override');
      if (!keys || (override !== undefined && !isBooleanLiteral(override))) {
        state.markUnknown();
      } else if (isBooleanLiteral(override) && override.value) {
        state.replaceWith(operation, keys);
      } else {
        state.addProperties(operation, keys);
      }
      return true;
    }
    case 'setData': {
      const keys = literalObjectKeys(arg('properties'));
      if (!keys) {
        state.markUnknown();
        return true;
      }
      // Only `$operationdata.<key>` targets write operationData
      const written = keys
        .map(key => key.split('.'))
        .filter(path => path[0].toLowerCase() === '$operationdata' && path.length >= 2)
        .map(path => path[1]);
      state.addProperties(operation, written);
      return true;
    }
    case 'removePropertiesFromOperationData': {
      const names = literalStrings(arg('propertyNames'));
      if (names) state.removeProperties(operation, names);
      else state.markUnknown();
      return true;
    }
    case 'clearOperationData': {
      const properties = arg('properties');
      if (properties === undefined) {
        state.clearAll(operation);
      } else {
        const names = literalStrings(properties);
        if (names) state.removeProperties(operation, names);
        else state.markUnknown();
      }
      return true;
    }
    default:
      return false;
  }
}

/** Whether `node` belongs to a document root the analysis runs on. */
export function isDataflowRoot(node: AstNode): node is Program | Library {
  return isProgram(node) || isLibrary(node);
}
