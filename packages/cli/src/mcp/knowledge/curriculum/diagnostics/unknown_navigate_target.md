---
code: unknown_navigate_target
---

**Cause:** `navigate "<name>"` names no timeline declared in this program; the message lists the available names. Names are matched exactly. **Fix:** change it to an existing timeline name (the quick fix *Change to "<closest>"*), or declare the target timeline (the quick fix *Create timeline "<name>"* appends `timeline "<name>" in "<container>" using raf { }`).
