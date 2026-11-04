# Eligius execution model — only claims marked "probed:" are verified against the installed eligius (mcp-runtime-claims.spec.ts)

How the Eligius runtime executes a compiled Eligian config, read from the source of
**eligius 4.2.0** as installed (`node_modules/eligius/dist/`). The engine is bundled
into `engine-factory-*.mjs`; the bundle keeps a `// src/<module>.ts` marker above
each module, so every citation below names the module and the function or method
(search the bundle for them; no line numbers, which change with every build).
It exists because the tour once got the start/end operationData model wrong, and
it is what the tour's chapters and their storyboards rely on. Corrections welcome.

**Markers.** A sentence about what the engine does at runtime ends with one of two
markers. `(probed: "<title>")` names the test in
`packages/cli/src/__tests__/mcp-runtime-claims.spec.ts` that runs it on the installed
eligius; that test fails when an eligius upgrade changes the behaviour. The other
marker, "not probed, Phase 0" in parentheses, means the sentence was read from the
source only and nothing tests it yet. Sentences about what the Eligian compiler emits,
and pointers into the eligius source, carry no marker.

---

## 1. The execution unit: an operation chain over a shared `operationData`

An **action** owns one or two ordered lists of **operations** (`startOperations`,
`endOperations`). An operation is a function called with `this` = the **scope** and
one argument, the **operationData**; it returns operationData (sync or a Promise). (not probed, Phase 0)

`Action.executeOperation` (`src/action/action.ts`) walks the list in a **loop**
(iterative in 4.x, so long `forEach` loops do not grow the stack). (not probed, Phase 0)
- For operation *i* it copies the operation's configured data and merges it over
  the data threaded from the previous operation (`Object.assign(operationData, configuredData)`). (not probed, Phase 0)
- It calls the operation with the merged object. (not probed, Phase 0)
- The operation's **return value is the operationData of the next operation**; a
  returned Promise is awaited, then the loop continues with the resolved data. (not probed, Phase 0)
- So an operation that returns `undefined` loses the bag: the next operation sees
  none of the keys earlier operations left, only its own configured data (after
  `selectElement(…)` and an operation returning `undefined`, `selectedElement` is gone). (probed: "an operation that returns undefined hands the next operation an empty operationData")

**So `operationData` is one object threaded down the chain**: each operation reads
what earlier ones left and adds its own outputs. (not probed, Phase 0)
A run starts from the data passed to `start()` / `end()`, or `{}`. (not probed, Phase 0)

## 2. `selectedElement` and the dependency model

- `selectElement` (`src/operation/select-element.ts`) finds the element below the
  engine root (`eventbus.request("request-engine-root")` + `.find(selector)`) and
  writes `operationData.selectedElement`. (not probed, Phase 0)
- `addClass` and the other DOM operations **read** `operationData.selectedElement`;
  they never select on their own. (not probed, Phase 0)

The operation metadata (`src/operation/metadata/*.ts`) declares what each operation
needs and produces: `dependentProperties` (must already be present, e.g.
`selectedElement` for addClass), `outputProperties` (e.g. `selectedElement` for
selectElement) and per-property `required` / `erased` (consumed and removed after use,
e.g. `selector`). (not probed, Phase 0)
The Eligian compiler reads the same metadata, which is where the
*"Property 'selectedElement' is not available - ensure it is created by a previous
operation"* error and the inferred action contracts come from (`LANGUAGE_SPEC.md` 4.7).

### start vs end are INDEPENDENT runs, each with a fresh `{}`

- `Action.start()` runs `startOperations` and `EndableAction.end()` runs
  `endOperations`, each through `_runOperations` with a scope stack of its own
  (`src/action/action.ts`, `src/action/endable-action.ts`). (not probed, Phase 0)
- The engine dispatches timeline actions itself: `_runActionMethod(action, phase)`
  calls `action[phase]()` with **no arguments** (`src/eligius-engine.ts`), so each
  run starts from `{}`. (probed: "start and end blocks are independent runs, each starting from an empty operationData")

**Therefore nothing carries from start to end.** A `selectedElement` set in
`startOperations` does **not** exist in `endOperations`: every block must
`selectElement` before it can `addClass` / `animate` / … (or use `target`, rule 8). (probed: "start and end blocks are independent runs, each starting from an empty operationData")
**So are the other engine-fired blocks:**
- the lifecycle action's `on enter` and `on leave` blocks start from `{}`; (probed: "on enter and on leave blocks start from an empty operationData")
- event actions (`on event`) start with only `eventArgs`
  (`src/eventbus/actionregistry-eventbus-listener.ts`); (probed: "an event action starts with only eventArgs")
- listener actions (a DOMEventListenerController's or KeyboardController's actions)
  start with a copy of the listener's `actionOperationData` plus `eventTarget`, and
  `eventKey` for keys (`src/controllers/dom-event-listener-controller.ts`,
  `keyboard-controller.ts`); nothing the timeline block that wired the listener had in
  its operationData reaches them. (probed: "a listener action starts with the listener's actionOperationData plus eventTarget, and eventKey for keys")

## 3. Property chains, sigils and constants

`resolveExternalPropertyChain(sourceObject, scope, value)`
(`src/operation/helper/resolve-external-property-chain.ts`):
- `"$operationdata.x"` → the current operationData. (not probed, Phase 0)
- `"$globaldata.x"` → a deep copy of the value in the global store. (not probed, Phase 0)
- `"$scope.x"` → the nearest scope that declares `x` (`$scope.currentItem`,
  `$scope.loopIndex`, `$scope.variables.foo`). (not probed, Phase 0)
- Any other string (e.g. `"#title"`) → returned as-is. (not probed, Phase 0)

**Resolution is opt-in per operation**: each operation resolves only the fields it
cares about (`selectElement` its selector, `forEach` its collection, `when` its
operands, `broadcastEvent` its eventArgs, …). (not probed, Phase 0)
For every other operation the compiler resolves a runtime argument first with a
`setOperationData` (rule 1, `LANGUAGE_SPEC.md` 7.4 "Runtime values in operation
arguments").

How Eligian's references compile:
- a bare action parameter `label` → `$operationdata.label` (an event action's
  parameter → `$operationData.eventArgs.<index>`);
- `@@currentItem` / `@@loopIndex` / `@@loopLength` → `$scope.currentItem` / … ;
  **`@@p`**, the item of `for (p in …)`, is the loop item by name: also
  `$scope.currentItem` (forEach gets `itemName: "p"`);
- **`@@loopLength` is not the length**: inside a `for` over a 3-item array it is `2`
  on every iteration (the last index). (probed: "@@loopLength is the length of the collection minus one")
- `@name` reads a `const`. **Constants are folded**: a const whose value is known at
  compile time (`const theme = "dark"`, `const total = 2 ** 3 * 2 + 1`, an array or
  object literal) is inlined wherever `@name` appears and emits no operation (a
  program-level one adds nothing to `initActions`). **Only a runtime value** inside an
  action (`const copy = label`) becomes `setVariable` (`src/operation/set-variable.ts`),
  read back as `$scope.variables.copy`.
- `setVariable` stores the value on the action's root scope
  (`this.variables[name] = value`). (not probed, Phase 0)

## 4. The scope and control flow

The scope holds `currentIndex`, `newIndex` (set to jump), the loop fields
(`loopIndex`, `loopLength`, `loopStartIndex`, `loopEndIndex`, `currentItem`),
`whenEvaluation`, `eventbus`, `operations`, `variables`, `parent`. (not probed, Phase 0)
`executeOperation` pushes a child scope on `when` / `forEach` and pops it on
`endWhen` / `endForEach` (`_pushScope`, `src/action/action.ts`). (not probed, Phase 0)

- **if / else if / else** = `when` / `otherwise` / `endWhen` (an `else if` is a nested
  `when` inside the `otherwise`). `when` evaluates its expression and, when false,
  jumps to the matching `otherwise` / `endWhen` (`src/operation/when.ts`). (not probed, Phase 0)
- **for** = `forEach` / `endForEach`: `forEach` resolves the collection once,
  iterates over a snapshot of it and sets `currentItem` each iteration;
  `endForEach` loops back (`src/operation/for-each.ts`, `end-for-each.ts`). (not probed, Phase 0)
  `break` / `continue` = `breakForEach` / `continueForEach`.
- A variable set with `setVariable` belongs to the action: set inside a `when` or
  `forEach` it is the same variable outside it. (not probed, Phase 0)

## 5. Calling an action (the unified call syntax)

A DSL action call compiles to `requestAction` + `startAction`:
- `requestAction(systemName)` sets `operationData.actionInstance`
  (`eventbus.request("request-action", …)`, `src/operation/request-action.ts`). (not probed, Phase 0)
- `startAction(actionInstance, actionOperationData)` (`src/operation/start-action.ts`)
  starts the callee on **its own copy** of the caller's current operationData,
  merged with `actionOperationData` (the call's arguments, keyed by parameter name).
  When the callee has finished, the caller continues with **the operationData it
  had before** (plus `actionInstance`): whatever the callee added, changed or
  removed stays with the callee. (probed: "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back")

So a called action **inherits** its caller's state (a `selectedElement` the caller
selected is there), its arguments arrive as `$operationdata.<param>`, and **its
outputs do not flow back** (`LANGUAGE_SPEC.md` 4.7, "Outputs don't flow back"). (probed: "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back")
`startAction` calls **`.start()` only**: a plain call runs the start operations. (probed: "a plain action call runs the start operations only")
End operations run when the engine drives an endable action as a timeline action (§7)
or through `endAction`. (not probed, Phase 0)

## 6. Controllers

`addController("Name", …)` takes **positional parameters** in the order of the
controller's metadata (`LANGUAGE_SPEC.md` "Controllers") and compiles to
`getControllerInstance` + `addControllerToElement`:
- `addController("DOMEventListenerController", "click", ["ch5BroadcastPing"])` →
  `addControllerToElement { eventName: "click", actions: ["ch5BroadcastPing"] }`;
  `addController("LabelController", "hub.title")` → `{ translationKey: "hub.title" }`.
- `getControllerInstance(systemName)` sets `controllerInstance`
  (`eventbus.request("request-instance", …)`, `src/operation/get-controller-instance.ts`). (not probed, Phase 0)
- `addControllerToElement` needs `selectedElement` **and** `controllerInstance`, calls
  `controllerInstance.init(operationData)` (the **whole** operationData, so the
  controller's parameters ride along in it) and `attach(eventbus)`, and registers the
  controller on the element (`src/operation/add-controller-to-element.ts`). (not probed, Phase 0)

**Controllers are not detached on a timeline switch**: a controller attached in
`on enter` outlives the chapter unless `on leave` removes it. (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")
The engine ends the leaving timeline's actions, but it only detaches controllers when
their element is replaced or removed (`removeElement`, `clearElement`,
`setElementContent`, the layout at `init`, `destroy`; `detachControllersWithin`). (not probed, Phase 0)
`removeControllerFromElement("KeyboardController")` on the same element removes
**one** controller of that name and detaches it (it warns `controller for name '…'
was not found on the given element` when there is none;
`src/operation/remove-controller-from-element.ts`). (not probed, Phase 0)

## 7. The engine: position → start/end firing, and timeline switching

- Each timeline action registers its start at `duration.start` and its end at
  `duration.end`; a missing end (or `-1`) is an **open end**, read as Infinity. (not probed, Phase 0)
- Position updates dispatch every start and end between the previous and the
  current position, in order (`_dispatchActionsBetween`, `src/eligius-engine.ts`). (not probed, Phase 0)
- A seek or a large jump instead **reconciles** (`_reconcileActions`): it ends the
  active actions that no longer cover the position and starts the inactive ones
  that do, the ends first. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
- So a forward jump past a whole range runs neither its start nor its end
  operations (rule 13). (probed: "a forward jump past a range runs neither its start nor its end operations")
- A `TimelineAction` is `active` from `start()` until `end()`, so a second dispatch
  of the same start or end is a no-op (`src/action/timeline-action.ts`). (not probed, Phase 0)
- `initActions` run once at engine init, after the `layoutTemplate` is rendered into
  the container. (not probed, Phase 0)
- **Timeline switching**: the engine **listens** for the broadcast
  `request-timeline-uri` with `[uri, position?]` and calls `switchTimeline(uri,
  position)` (`src/adapters/engine-eventbus-adapter.ts`); it is a broadcast like any
  other, not a request. (not probed, Phase 0)
  The same adapter listens for `timeline-play-toggle-request`,
  `timeline-seek-request`, `timeline-stop-request`, … . (not probed, Phase 0)
  This is the hub ↔ chapter mechanism: `on click "#card-ch3" navigate "Logic"`
  compiles to a DOMEventListenerController whose generated action
  (`__nav__<slug>_<fnv1a hex>`, e.g. `__nav__logic_5aedf3b1`) is one
  `broadcastEvent(["Logic", 0], "request-timeline-uri")`. The other interaction verbs
  get one generated action each, named `__on__…` (`__on__toggle` broadcasts
  `timeline-play-toggle-request`, `__on__seek__7` broadcasts `timeline-seek-request`
  with `[7]`); `run action(args)` lists the action itself, with the literal arguments
  as the listener's `actionOperationData`.

### 7b. Per-timeline setup and teardown: `on enter` / `on leave`

- **Use the lifecycle blocks.** `on enter [ … ]` / `on leave [ … ]` in a timeline body
  compile to **one open-ended timeline action** (`duration: { start: 0 }`, no end)
  whose start operations are the enter block and whose end operations are the leave
  block. It is not counted in the timeline's duration.
- **Why it works:** `switchTimeline` first ends every **active** action of the leaving
  timeline (`_endActiveActionsReporting`), so its `on leave` runs. (probed: "switchTimeline ends the leaving timeline's active actions, so its on leave runs")
  Then it reconciles the entering timeline at the target position, so that timeline's
  `on enter` runs. (not probed, Phase 0)
  `stop()` ends the active actions too, so `on leave` also runs on stop. (not probed, Phase 0)
  The lifecycle action never ends on its own: its range has no end, and a raf timeline
  holds its last frame, so `on leave` does **not** run when the content ends. (probed: "on leave does not run when the content ends")
- A switch to the timeline that is already current changes nothing: no `on leave`, no
  `on enter`, and a following `seek(0)` adds neither. (probed: "a switch to the timeline that is already current is a no-op")
- **Consequence:** each timeline manages **only its own view**
  (`on enter [ enterChapter("#ch3") … ]` / `on leave [ leaveChapter("#ch3", …) ]`);
  no timeline hides the others (O(1) per chapter, not O(N)).
- `configuration.initActions` is still a **single global list**; a timeline config
  carries only its `timelineActions`, so there is no per-timeline init field. The
  lifecycle blocks are the per-timeline hook.
- **History:** before spec 050 the tour used an endable action with a range longer
  than the chapter (`at 0s..3600s [ showView(self) … ] [ hideView(self) ]`), so its end
  fired only through the switch cleanup. The lifecycle blocks replace it: no range to
  pick, and the timeline keeps its real duration.
- `init()` starts no timeline: the **first** timeline (the hub) starts on the first
  position update, which `start()` emits at once, before any animation frame
  (`RafPositionSource.startTicking` calls `setPosition(getPosition())`), and which a
  seek emits without playback, `seek(0)` included. (probed: "the first timeline starts on the first position update (start or seek), not at init")
  So in headless jsdom nothing starts until `start()` or a seek (`eligian smoke` seeks
  every timeline to each of its event boundaries).

## 8. Eventbus: broadcasts and requests

`src/eventbus/eventbus.ts`: `broadcast(name, args)` calls every `on(name)` handler
(topics key handlers as `name:topic`). (not probed, Phase 0)
`request(name, …args)` calls the **first** registered `onRequest(name)` responder and
returns its value synchronously ("first responder wins"). (not probed, Phase 0)

- **Broadcasts** are what a program sends: the `broadcastEvent` operation calls
  `eventbus.broadcast` (`src/operation/broadcast-event.ts`). (not probed, Phase 0)
  Its parameters are `(eventArgs, eventName, eventTopic?)`, array first:
  `broadcastEvent(["#c5-fx-panel"], "tour-ping")`.
  Whoever listens reacts: `on event` actions, controllers, and the engine itself (§7). (not probed, Phase 0)
- **Requests are internal to operations**: `request-engine-root` (selectElement),
  `request-instance` (getControllerInstance), `request-action` (requestAction),
  `request-function`, … . `broadcastEvent` cannot reach a request responder. (not probed, Phase 0)

---

## Practical rules for writing correct Eligian (consequences)

1. **Engine-fired blocks start empty; called actions copy the caller's data**, so
   select before you mutate:
   - start and end blocks begin with `{}`; (probed: "start and end blocks are independent runs, each starting from an empty operationData")
   - lifecycle blocks begin with `{}`; (probed: "on enter and on leave blocks start from an empty operationData")
   - event actions begin with only `eventArgs`; (probed: "an event action starts with only eventArgs")
   - listener actions begin with only the listener's data plus `eventTarget` (and
     `eventKey`); (probed: "a listener action starts with the listener's actionOperationData plus eventTarget, and eventKey for keys")
   - a called action starts with a **copy** of its caller's operationData plus its
     arguments, and its outputs do not flow back. (probed: "a called action gets a copy of the caller's operationData plus its arguments, and nothing flows back")

   Parameters reach operations by name; when the names differ, the compiler inserts a
   `setOperationData` (spec 046).
2. **Operations within one block do thread state**: one `selectElement` then several
   class / style operations is fine. (not probed, Phase 0)
   An operation that returns `undefined` breaks the thread: the next one starts
   without the earlier keys (§1). (probed: "an operation that returns undefined hands the next operation an empty operationData")
3. **A plain action call runs start operations only.** (probed: "a plain action call runs the start operations only")
   End operations run through the engine (timeline action) or `endAction`. (not probed, Phase 0)
4. **Selectors and classes are validated**: ids against the layout HTML, classes
   against the imported CSS, also when they reach an operation through an action
   parameter (spec 056).
5. **Sigils are runtime property chains**, resolved per operation: `$operationdata.x`,
   `$globaldata.x`, `$scope.x` / `$scope.variables.x` / `$scope.currentItem`. (not probed, Phase 0)
6. **Interactions wire listeners**: `on click "<sel>" navigate "<timeline>"` (a
   DOMEventListenerController whose generated action broadcasts
   `request-timeline-uri` `[name, 0]`), `on click "<sel>" run action(args)` (literal
   arguments), and `on key "<keys>" <verb>` (a KeyboardController on the timeline's
   container, or on `in "<sel>"`).
7. **Each timeline shows and hides only its own view, in its lifecycle blocks**:
   `on enter` sets up, `on leave` tears down (§7b).
8. **`target` / `with` select for you**: `at … target "<sel>" [ … ] [ … ]` prepends a
   `selectElement` to the event's start (and end) operations; `with <sel> { … }` is a
   `selectElement` followed by the block, and the selection stays (spec 055).
9. **Erased parameters are preserved**: an operation that erases a property named like
   an action parameter (`selectElement` removes `selector`) is wrapped in a save /
   restore when the block uses the parameter again (`LANGUAGE_SPEC.md` 4.7).
10. **Dataflow errors are reported where the data starts** (timeline events, items,
    inline blocks, event and listener actions), with the quick fixes *Insert
    selectElement* and *Add target*.
11. **Constants are folded**: a compile-time `const` emits nothing and is inlined at
    every `@name`; only a runtime value inside an action becomes `setVariable`.
12. **Unwire in `on leave`**: the engine never detaches controllers on a timeline switch,
    so remove every controller `on enter` attached (`removeControllerFromElement`, one
    per controller, on the same element). (probed: "a controller attached in on enter survives a timeline switch unless on leave removes it")
    Otherwise a hub digit stays live inside a chapter and listeners pile up on every
    visit. (not probed, Phase 0)
13. **A seek re-runs starts but never undoes what earlier blocks did to the DOM**;
    beats without end blocks leave their classes behind. (not probed, Phase 0)
    A seek ends only the active actions that no longer cover the position and starts
    those that do. (probed: "a seek ends the active actions that no longer cover the position and starts the inactive ones that do")
    A replay is therefore *reset, then seek* (`replayChapter`: `resetChapter(view)`, then
    `broadcastEvent([0], "timeline-seek-request")`), and a switch to the timeline that
    is already current is a no-op, so a self-`navigate` cannot replay either. (probed: "a switch to the timeline that is already current is a no-op")
