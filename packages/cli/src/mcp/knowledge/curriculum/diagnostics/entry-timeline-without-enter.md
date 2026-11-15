---
code: entry-timeline-without-enter
---

**Cause:** a review warning: the program declares two or more timelines, and the first one (the entry, the timeline the engine starts with) has no `on enter` block. With several timelines, the entry usually wires up the navigation or the start controls there, so without one the other timelines may be unreachable. A program with a single timeline is never reported. **Fix:** add `on enter [ … ]` to the first timeline with the controls that reach the others (for example `on click "#card-1" navigate "Chapter 1"`), and an `on leave` that removes them. If the entry needs no setup, the warning can be accepted.
