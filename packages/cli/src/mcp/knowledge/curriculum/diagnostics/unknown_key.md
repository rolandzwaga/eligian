---
code: unknown_key
---

**Cause:** `on key "<keys>"` contains a key or modifier that the KeyboardController cannot match (it throws when it starts), or no key at all. **Fix:** use key names such as `ArrowRight`, `space`, `Enter`, `Escape`, `PageDown`, `F1`, or a single letter or digit; join modifiers (`shift`, `alt`, `ctrl`, `meta`) with `+` and separate alternative shortcuts with `,`: `on key "ArrowRight, space" play`, `on key "shift+ArrowRight" seek 10s`.
