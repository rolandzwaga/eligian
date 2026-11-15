---
code: unresolved-reference
---

**Cause:** a name does not resolve; the message says what kind of thing was looked for. `ActionDefinition`: an action that is not defined or not imported (or its library file is missing). `Parameter`: a name used in an action body that is not one of its parameters. `LabeledEvent`: a label (`intro.end`) that no earlier `at … as intro` event defines. **Fix:** correct the spelling, define or import the action, add the parameter to the action's signature, or label an earlier event. Fix any syntax error first: it can hide the definition.
