---
code: scroll_container_not_scrollable
---

**Cause:** a warning on a `using scroll` timeline: the scroll container (the explicit `scroll "<sel>"` selector, otherwise the timeline's `in` selector) has no CSS rule or inline style setting `overflow-y` (or `overflow`) to `auto` or `scroll`. A scroll timeline only moves when that element scrolls. **Fix:** give the element a scroll style in the imported CSS, e.g. `#scroller { height: 100vh; overflow-y: auto; }`, or an inline `style` in the layout HTML, and make its content taller than it. Element-name selectors are not checked, nor styles set at run time.
