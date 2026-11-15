---
code: property_chain_in_time_expression
---

**Cause:** a property chain such as `$operationdata.delay` is used as a time: in an event's time range, a stagger delay or duration, a sequence item duration, or a navigate / seek position, directly or inside time arithmetic. Eligius needs times as numbers when the configuration is built, so the compiler rejects it with the same message. **Fix:** use a literal time (`2s`, `500ms`) or a constant expression: declare `const beat = 2s` at program level and write `@beat` or `@beat * 2`. A value only known at run time cannot place an event.
