---
code: host-operation-in-block-without-select
---

**Cause:** a review warning: a host operation (declared in an `extensions` block) runs with no `selectElement` before it in a block whose operation data starts fresh: a timeline event (start or end), `on enter` / `on leave`, an init action or an event action. It finds no selected element. `target` and `with` count as a selection. Named-action bodies are not reported: a called action gets a copy of its caller's operation data, so it may rely on the caller's selection; the call site must select first. **Fix:** select first (`selectElement("#x")`, `at … target "#x" [ … ]`, or `with "#x" { … }`), or declare a `selector` parameter on the operation so it selects for itself.
