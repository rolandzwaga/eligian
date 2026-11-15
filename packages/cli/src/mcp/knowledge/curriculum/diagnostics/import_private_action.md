---
code: import_private_action
---

**Cause:** an import names an action that the library marks `private`; private actions are helpers for the library's own actions and cannot be imported. **Fix:** import and call the public action that uses it, or, if consumers should call it directly, remove `private` from its definition in the library.
