---
code: lottie-web-not-installed
---

**Cause:** a review warning: the program adds a `LottieController`, and no `node_modules/lottie-web` is found from the program's directory upward. The controller needs `lottie-web` at runtime, and the CLI does not ship it, so the presentation's own project must provide it. `LottieController` stays `constrained` until the project installs it. **Fix:** run `npm install lottie-web` in the presentation's project (next to its `package.json`), then check again. If the animation is not essential, use another controller or a CSS animation instead.
