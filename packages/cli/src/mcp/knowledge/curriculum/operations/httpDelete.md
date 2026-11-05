---
operation: httpDelete
card: "Sends a DELETE request: httpDelete(url, headers?). The action waits for the answer, then status holds the HTTP status and response the parsed JSON body, or null when the response is not JSON or empty. A network failure or a non-2xx status throws, which stops the action."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action removeDraft(id: string) [
  httpDelete("https://api.example.com/drafts/" + id, { Authorization: "Bearer demo" })
  selectElement("#title")
  setElementContent("Draft removed")
]

timeline "main" in "#stage" using raf {
  on enter [ on click "#next" run removeDraft("42") ]
  on leave [ with "#next" { removeControllerFromElement("DOMEventListenerController") } ]
}
```

## Idioms

- Run requests in a click or key handler (`on click … run`), not in a timeline range that a
  seek re-runs.
- Branch on `$operationdata.status` after it, e.g. `if ($operationdata.status == 204)`.

## Pitfalls

- Asynchronous: the operations after it wait for the response, so a slow server holds up the
  rest of the action.
- An error status throws: no operation after it runs. The `status` is set before it throws.
- `url` and `headers` are erased only after a successful request.
