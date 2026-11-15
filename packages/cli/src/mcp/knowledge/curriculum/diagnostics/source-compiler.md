---
source: compiler
---

**Cause:** the program passed validation, but compiling it (or reading the file) failed; the message says where. **Fix:** fix every other diagnostic in the file and its imported libraries first, then the construct the message names. If a program with no other diagnostic does not compile, it is an Eligian bug: report it with the smallest program that shows it.
