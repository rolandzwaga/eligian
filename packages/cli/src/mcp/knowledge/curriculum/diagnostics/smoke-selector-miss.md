---
code: smoke-selector-miss
---

**Cause:** a smoke error in strict mode (`eligian smoke --strict`; `eligian_smoke` is strict by default): a `selectElement` selector matched no element in the rendered document, so the operations after it had nothing to act on. It is located at the `selectElement`. **Fix:** add the element to the layout HTML, correct the selector, or make sure the operation that creates the element runs before the selection.
