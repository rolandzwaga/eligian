---
code: event_type_mismatch
---

**Cause:** an event action parameter's type annotation does not match the argument the Eligius event supplies at that position, or the argument has a type no Eligian annotation describes (`any`, a callback). **Fix:** annotate as the message says (`string`, `number`, `boolean`, `object` or `array`), or remove the annotation; annotations are optional.
