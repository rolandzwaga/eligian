/**
 * Spec 058 Phase 3 (FR-045, FR-046; plan C1): the rule behind each operation origin, for
 * `eligian_compile`'s `explain`. Each rule is at most 300 characters and names the curriculum
 * chunk to read (`docs`, an `index.json` id); the drift test in `mcp-knowledge.spec.ts` checks
 * both against `OPERATION_ORIGINS` and the generated index.
 */
import type { OperationOrigin } from '@eligian/language';

export interface OriginRule {
  readonly rule: string;
  readonly docs: string;
}

export const ORIGIN_RULES: Readonly<Record<OperationOrigin, OriginRule>> = {
  source: {
    rule: 'Written in the source: one operation call compiles to one Eligius operation with the same name and its arguments as operationData.',
    docs: 'map-actions-and-calls',
  },
  call: {
    rule: 'An action call: requestAction looks the action up by name, then startAction (or endAction in an end block) runs its operation list with the arguments as operationData.',
    docs: 'map-actions-and-calls',
  },
  'library-qualified': {
    rule: 'A call of an action imported from a library: the requestAction names the action under its library-qualified system name, so imported actions never collide with local ones.',
    docs: 'map-imports-and-assets',
  },
  'param-binding': {
    rule: 'A setOperationData before an operation whose argument reads a parameter or a runtime value ($operationdata, $globaldata, …): the value is copied into operationData so the operation can read it.',
    docs: 'map-dataflow',
  },
  target: {
    rule: 'Added by `target "<sel>"` on an event: a selectElement before the start operations and another before the end operations, so both blocks act on the selected element.',
    docs: 'map-dataflow',
  },
  with: {
    rule: 'Added by `with <sel> { … }`: a selectElement before the block; the selection stays for the operations after it.',
    docs: 'map-dataflow',
  },
  'erased-save': {
    rule: 'An operation erases a property named like a parameter (selectElement erases selector) that the block reads again: a setOperationData saves the value under __eligian_param_<name> first.',
    docs: 'map-erased-parameters',
  },
  'erased-restore': {
    rule: 'Restores an erased parameter after the operation that erased it: a setOperationData copies __eligian_param_<name> back to <name>, so later operations still read it.',
    docs: 'map-erased-parameters',
  },
  concat: {
    rule: 'A string built from parts (`a + b`, template text): setOperationData with the parts, concatenateStrings, and a removePropertiesFromOperationData that clears the temporary keys afterwards.',
    docs: 'map-control-flow-and-data',
  },
  'saved-result': {
    rule: "Keeps an earlier operation's result across a string concatenation: a setOperationData saves operationData.result before it and another puts it back after it.",
    docs: 'map-control-flow-and-data',
  },
  'loop-control': {
    rule: 'break / continue inside a for loop: compiled to breakForEach / continueForEach; valid only inside a for loop.',
    docs: 'map-control-flow-and-data',
  },
  interaction: {
    rule: 'An `on <event> "<sel>" <verb>` or `on key` interaction: a DOMEventListenerController / KeyboardController added to the element and a generated action that broadcasts the verb (navigate, play, pause, seek, run, …).',
    docs: 'map-events-and-interactions',
  },
  lifecycle: {
    rule: 'In an on enter / on leave block: runs when the timeline is entered / left, not on timelineComplete or a loop restart; every controller added in on enter must be removed in on leave.',
    docs: 'map-timeline-and-providers',
  },
  sequence: {
    rule: 'A sequence item: each item becomes one timeline action that calls the item action (requestAction + startAction, endAction for an endable one), placed right after the previous item ends.',
    docs: 'map-timeline-and-providers',
  },
  stagger: {
    rule: 'A stagger: one timeline action per item, each calling the action (requestAction + startAction, endAction for an endable one) with its start offset by the stagger delay.',
    docs: 'map-timeline-and-providers',
  },
  'init-globaldata': {
    rule: 'Program-level variables: one setData in a generated init action named init-globaldata, which runs once when the engine starts and fills $globaldata.',
    docs: 'map-program-and-config',
  },
};
