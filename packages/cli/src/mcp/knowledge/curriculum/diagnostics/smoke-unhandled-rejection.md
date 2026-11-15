---
code: smoke-unhandled-rejection
---

**Cause:** a smoke error: a promise was rejected and nothing handled it while the presentation played, typically an asynchronous operation, controller, or host operation or function that failed. The message gives the rejection reason. **Fix:** find the code that rejects and fix the input that makes it fail; in a host module, handle the error instead of leaving the promise to reject.
