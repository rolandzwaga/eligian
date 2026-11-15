---
code: timeline-required
---

**Cause:** a program (a file that does not start with `library <name>`) has no timeline; Eligius needs at least one. A syntax error early in the file can also hide a timeline that is there. **Fix:** fix any syntax error first; otherwise add one: `timeline "Main" in "#stage" using raf { at 0s..3s showTitle() }`, where `#stage` is the container element in the layout. A file that only holds actions for other files should be a library: start it with `library <name>`.
