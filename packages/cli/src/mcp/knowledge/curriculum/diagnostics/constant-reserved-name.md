---
code: constant-reserved-name
---

**Cause:** a `const` is named after a reserved keyword (`if`, `else`, `for`, `break`, `continue`, `const`, `action`, `endable`, `on`, `timeline`, `sequence`, `stagger`, `import`). The parser usually rejects such a name first with a `syntax-error`. **Fix:** rename the constant and its uses, for example `const introStart = 2s`. Contextual keywords such as `in`, `at` or `from` are valid names.
