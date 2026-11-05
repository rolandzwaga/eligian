---
code: extensions_path_not_relative
---

**Cause:** the module path of `extensions "<path>" { … }` does not start with `./` or `../`. **Fix:** write it relative to the `.eligian` file, as the message suggests: `extensions "./host.ts" { … }`.
