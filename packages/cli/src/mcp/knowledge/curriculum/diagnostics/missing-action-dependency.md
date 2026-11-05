---
code: missing-action-dependency
---

**Cause:** the called action uses a property it does not create itself (usually `selectedElement`, for `addClass` and friends), and the property is not available where the action is called. An event's end block does not see what its start block selected; an action started by an interaction (`on click … run`) or a controller gets only `eventTarget`, `eventKey` and its arguments. **Fix:** prefer a self-contained action: give it a selector parameter and call `selectElement(selector)` first inside it. Otherwise select the element right before the call (`selectElement("#x")`, `with "#x" { … }`, or `target "#x"` on the event). Apply the diagnostic's `quickFix` when it has one.
