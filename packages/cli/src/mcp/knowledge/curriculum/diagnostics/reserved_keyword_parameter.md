---
code: reserved_keyword_parameter
---

**Cause:** a parameter of an action or event action is named after a reserved keyword: `if`, `else`, `for`, `break`, `continue`, `const`, `action`, `endable`, `on`, `timeline`, `sequence`, `stagger`, `import`, `true`, `false` or `null`. **Fix:** rename the parameter and every reference to it in the body, e.g. `action show(target: string)` instead of `action show(for: string)`. Contextual words such as `at`, `from` or `event` are valid names.
