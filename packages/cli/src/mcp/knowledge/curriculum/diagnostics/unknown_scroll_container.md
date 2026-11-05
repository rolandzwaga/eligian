---
code: unknown_scroll_container
---

**Cause:** the scroll container selector of a scroll timeline (`using scroll "<selector>"`) names an id or class that neither the layout HTML nor the imported CSS defines, so the timeline would follow no element. **Fix:** correct the selector to the scrollable element of the layout, or add that element to the layout HTML. It should also be scrollable (`overflow-y: auto` or `scroll` in the CSS), or `scroll_container_not_scrollable` follows.
