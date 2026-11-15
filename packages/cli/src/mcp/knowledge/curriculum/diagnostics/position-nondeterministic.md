---
code: position-nondeterministic
---

**Cause:** a smoke `--determinism` error: at a boundary, an element's class, text, style or visibility differs between linear play and a straight seek (`fresh`) or a seek back from the end (`end-back`). Usually a range adds a class (or sets text or style) and its end block does not undo it, so the DOM depends on how the position was reached. `expected` is the linear value; `actual` holds the other two. **Fix:** give the range the inverse end block (`addClass` ↔ `removeClass`, restore the text or style), or use a range-shaped `target` so the selection and its undo stay together.
