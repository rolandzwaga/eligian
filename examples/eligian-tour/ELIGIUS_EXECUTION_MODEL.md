# Eligius execution model — verified from source

My working model of how the Eligius runtime executes a compiled config, read from
`F:\projects\eligius\eligius\src` (sibling repo, read-only). Every claim cites the
source so you can check it. This exists because I got the start/end operationData
model wrong; this is me proving I now understand it. **Please correct anything off.**

---

## 1. The execution unit: an operation chain over a shared `operationData`

An **action** owns one or two ordered lists of **operations** (`startOperations`,
`endOperations`). An operation is just a function:

```ts
type TOperation = (this: IOperationScope, operationData: TOperationData) => TOperationData | Promise<TOperationData>
```
(`operation/types.ts:64`). It receives `this` = the **scope** and one arg = the
**operationData**, and returns operationData (sync or Promise).

`Action.executeOperation` (`action/action.ts:72-143`) walks the list recursively:
- For op *i*: `copy = deepCopy(op.operationData ?? {})` then
  `mergedOperationData = Object.assign(previousOperationData, copy)` (`:90-92`).
  → the op's **configured data is merged over the data threaded from the previous op**.
- `result = op.instance.call(scope, mergedOperationData)` (`:104`).
- The op's **return value becomes `previousOperationData` for the next op** (`:120-138`).
- If a Promise is returned, it awaits, then continues with the resolved data.

**So `operationData` is a single object threaded down the chain**, each op reading
what earlier ops left and adding its own outputs. `previousOperationData` defaults
to `{}` (`:77`).

## 2. `selectedElement` and the dependency model (THE thing I got wrong)

- `selectElement` resolves its `selector`, finds the element via
  `this.eventbus.request('request-engine-root')` + `.find(selector)`, and writes
  `operationData.selectedElement = <jQuery>`, then returns operationData
  (`operation/select-element.ts:46-75`).
- `addClass` **reads** `operationData.selectedElement` (no select of its own) and
  calls `selectedElement.addClass(className)` (`operation/add-class.ts:24-29`).

The operationData interfaces carry JSDoc tags that the Eligian compiler mirrors:
`@output` (produces, e.g. `selectedElement` on selectElement), `@dependency` (must
already be present, e.g. `selectedElement` on addClass), `@required`, `@erased`
(consumed/removed after use; e.g. `selector`, `className`). That's the source of
the compiler's *"Property 'selectedElement' is not available — ensure it is created
by a previous operation"* error.

### start vs end are INDEPENDENT runs, each with a fresh `{}`

- `EndableAction.start()` and `.end()` each call `_initializeScopeStack()` and run
  their own list from index 0 with their own `initOperationData`
  (`action/action.ts:20-36`, `action/endable-action.ts:16-35`).
- The engine fires them with **no arguments**: action methods are invoked as
  `exec()` (`eligius-engine.ts:783`) and `_executeActions` does `await action[methodName]()`
  (`:685`) — so `initOperationData` is `undefined` → defaults to `{}`.

**Therefore nothing carries from start to end.** A `selectedElement` set in
`startOperations` does **not** exist in `endOperations`. **Every operation block
(start, and end) must `selectElement` before it can `addClass`/`animate`/etc.**
This is why the canonical pattern (eligius `CLAUDE.md:645-652`) re-selects in both
blocks, and why my "end inherits the start's selection" assumption was simply false.

## 3. Property-chain resolution ($operationdata / $globaldata / $scope)

`resolveExternalPropertyChain(sourceObject, scope, value)` (`operation/helper/resolve-external-property-chain.ts:13-43`):
- `"$operationdata.x"` → value from the current operationData.
- `"$globaldata.x"` → value from the global store (`getGlobals()`).
- `"$scope.x"` → value from the scope object (e.g. `$scope.currentItem`, `$scope.loopIndex`, `$scope.variables.foo`).
- Any other string (e.g. `"#title"`) → returned as-is.

**Resolution is opt-in per operation** — each op resolves the specific fields it
cares about (selectElement→`selector`, when→expression operands, forEach→`collection`).
There is no global pre-pass. Eligian's sigils map straight onto this:
`$operationdata`/`$globaldata`/`$scope` are literal; a bare action param compiles to
`$operationdata.<param>`; `@var` → `$scope.variables.<var>`; `@@currentItem` → `$scope.currentItem`.

## 4. The scope and control flow

`IOperationScope` (`operation/types.ts:8-62`) holds: `currentIndex`, `newIndex`
(set to redirect the next op index), `loopIndex/loopLength/loopStartIndex/loopEndIndex`,
`currentItem`, `whenEvaluation`, `eventbus`, `operations`, `variables`, `parent`.
The executor manages a `_scopeStack`, pushing on `when`/`forEach` and popping on
`endWhen`/`endForEach` (`action/action.ts:94-115`).

- **if/else** = `when`/`otherwise`/`endWhen`. `when` evaluates the expression; if
  false it sets `newIndex` to jump to the matching `otherwise`/`endWhen`
  (`operation/when.ts:68-72`). `otherwise` jumps to `endWhen` if the when was true
  (`operation/otherwise.ts:13-16`). `endWhen` clears `whenEvaluation`.
- **for** = `forEach`/`endForEach`. `forEach` resolves the collection, sets
  `loopIndex=0`, `loopLength=len-1`, `loopStartIndex`, and `this.currentItem =
  collection[loopIndex]` (`operation/for-each.ts:55-74`). `endForEach` increments
  `loopIndex` and sets `newIndex = loopStartIndex` to loop, deleting `currentItem`
  (`operation/end-for-each.ts:11-20`). `break`/`continue` = `breakForEach`/`continueForEach`.
- `const` inside an action = `setVariable` → `this.variables[name] = value`
  (`operation/set-variable.ts:29-33`), read later via `$scope.variables.name` (`@name`).

## 5. Calling an action (the unified call syntax)

A DSL action call compiles to `requestAction` + `startAction`:
- `requestAction(systemName)` → `this.eventbus.request('request-action', systemName)`
  sets `operationData.actionInstance` (`operation/request-action.ts:28-38`).
- `startAction(actionInstance, actionOperationData)` merges `actionOperationData`
  into a fresh object, calls `actionInstance.start(that)`, then strips those keys
  (`operation/start-action.ts:30-46`).

So **arguments arrive as the sub-action's initial `operationData`**, read inside via
`$operationdata.<param>`. Note `startAction` calls **`.start()` only** — a normal
action call runs its start operations; end operations run only when an *endable*
action is driven by the engine as a timeline action (see §7), or via `endAction`.

## 6. Controllers

`addController("Name", {params})` compiles to `getControllerInstance` +
`addControllerToElement`:
- `getControllerInstance(systemName)` → `this.eventbus.request('request-instance', systemName)`
  sets `controllerInstance` (`operation/get-controller-instance.ts:29-38`).
- `addControllerToElement` needs `selectedElement` **and** `controllerInstance`
  (both `@dependency`), then `attachControllerToElement(...)`, `controllerInstance.init(operationData)`,
  `controllerInstance.attach(eventbus)` (`operation/add-controller-to-element.ts:33-39`).

`init` receives the **whole operationData**, so controller-specific params (e.g.
`DOMEventListenerController`'s `eventName`/`actions`) ride along in that object.

## 7. The engine: position → start/end firing, and timeline switching

- Each timeline action registers `start` at `duration.start` and `end` at
  `duration.end` (`eligius-engine.ts:609-651`).
- `_onTimeHandler` fires when the (floored) position changes, running every method
  registered at that position via `exec()` (no args) (`:765-785`).
- `start()` flips the action `active` (if it has end ops) so it won't re-fire; `end()`
  clears it (`action/timeline-action.ts:24-38`).
- `initActions` run once at engine init (`:387`); the `layoutTemplate` is rendered
  into `containerSelector` before that.
- **Timeline switching**: broadcasting `request-timeline-uri` with `[uri, position?]`
  → engine `switchTimeline(uri, position)` (`:696-698`). This is the hub↔chapter
  mechanism; a click is wired with `DOMEventListenerController` whose `actions` run
  an action that does `broadcastEvent("request-timeline-uri", [uri, 0])`.

### 7b. There is NO per-timeline init action — the switch lifecycle is the hook

- `configuration.initActions` is a **single global list**, not per-timeline: run
  once at `engine.init()` (`:387`), end ops run once at shutdown reversed (`:417-419`).
  A `timeline` config carries only `timelineActions` (`configuration/types.ts:359-373`)
  — there is no per-timeline init/setup field.
- **The switch lifecycle gives you per-timeline setup/teardown anyway.**
  `switchTimeline` first calls `_cleanUpTimeline()` →
  `_executeRelevantActions(this._getActiveActions, 'end')` (`:700-701`, called `:264`):
  it runs the **end** ops of the *leaving* timeline's still-**active** actions
  (an action is "active" once its start fired and it has end ops, `timeline-action.ts:24-38`).
  Then the incoming timeline's **start** ops fire at position 0 (`_executeStartActions`).
- **Consequence:** an **endable** timeline action gets *start-on-enter / end-on-leave*
  for free. A per-view setup action — `[ showView(self) … ] [ hideView(self) ]` — lets
  each timeline manage **only its own container**: shown when switched in, hidden by the
  engine's cleanup when switched away. No timeline needs to hide the others (O(1) per
  chapter, not O(N)).
- **Caveats:** (1) the setup action's range must be **longer than the chapter's content**
  (e.g. `0s..3600s`) so its `end` fires only via switch-cleanup, never from the playhead
  reaching it mid-chapter (raf is non-looping and holds the last frame, so a long range
  never ends on its own). (2) At init the **first** timeline (hub) shows via the first
  position tick — `engine.init()` runs only the global `initActions`; the hub's start
  fires when the provider ticks to 0 (in headless jsdom you must nudge the position to
  force this tick).

## 8. Eventbus

`eventbus.ts`: `broadcast(name,args)` calls all `on(name)` handlers (`:115-117,201-225`);
topics key handlers as `name:topic` (`:65-73`). `request(name,...args)` calls the
**first** registered `onRequest(name)` responder and returns its value synchronously
("first responder wins", `:188-199`). selectElement/getControllerInstance/requestAction
all use `request`; timeline control and custom events use `broadcast`.

---

## Practical rules for writing correct Eligian (consequences)

1. **Re-select in every block.** Each inline endable `[start][end]` — and each
   separately-fired action — begins with a fresh `{}`; select before you mutate.
2. **Operations within one block do thread state** — one `selectElement` then several
   class/style ops is fine; the `selectedElement` persists down that block's chain.
3. **A plain action call runs start ops only.** End/teardown happens via the engine
   (timeline action) or `endAction`.
4. **Selectors/classes are validated against imported CSS** — by design; import the
   `styles` that defines them.
5. **Sigils are runtime property chains**, resolved per-op: `$operationdata.x`,
   `$globaldata.x`, `$scope.x`/`$scope.variables.x`/`$scope.currentItem`.
5b. **Name an action parameter after the operation property it feeds.** Params are
   threaded by name through `operationData`; an operation reads its input by
   property name. So a param feeding `setElementContent` must be named `template`,
   one feeding `addClass` must be `className`, one feeding `selectElement` must be
   `selector`. (Not all operations resolve `$…` chains on value fields, so there's
   no name-bridging — matching the name is the contract.)
6. **Hub↔chapter nav** = `DOMEventListenerController` click → action →
   `broadcastEvent("request-timeline-uri", [uri, 0])`.
7. **Let each timeline show/hide only its own view via an endable setup action.**
   There is no per-timeline init action, but the switch lifecycle runs the leaving
   timeline's `end` ops then the entering timeline's `start` ops (§7b). So a long-range
   endable action `at 0s..3600s [ showView(self) + nav wiring ] [ hideView(self) ]`
   gives start-on-enter / end-on-leave — the engine hides the outgoing view for you.
   Don't make each timeline hide every other view (O(N)); self-manage (O(1)). Keep the
   range longer than the chapter content so `end` fires only on switch.
