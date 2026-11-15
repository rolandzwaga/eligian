---
code: extensions_path_type
---

**Cause:** the module of `extensions "./<file>" { … }` is not a script file esbuild can bundle as the host module. **Fix:** point it at a `.js`, `.mjs`, `.ts`, `.mts`, `.jsx` or `.tsx` file, for example `extensions "./host.ts" { operation trackEvent(eventName: string) }`.
