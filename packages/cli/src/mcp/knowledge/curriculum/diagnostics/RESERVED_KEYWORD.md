---
code: RESERVED_KEYWORD
---

**Cause:** a named import uses a reserved keyword as its name (`if`, `else`, `for`, `break`, `continue`, `const`, `action`, `endable`, `on`, `timeline`, `sequence`, `stagger`, `import`, `true`, `false`, `null`). The parser usually rejects such a name first with a `syntax-error`. **Fix:** rename the import, for example `import timelineLayout from "./timeline.html"`. Contextual keywords such as `in`, `at` or `from` are valid names.
