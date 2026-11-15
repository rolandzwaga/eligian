---
operation: httpPut
card: "Sends an HTTP PUT: httpPut(url, body?, headers?). The body goes out as JSON unless the headers set another content type. Provides status and response (the parsed JSON answer, null when it is empty). A status outside 2xx or a network failure throws. Start it from a click or key handler, not from a timeline range that re-runs on every seek."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action saveProgress(chapter: number) [
  httpPut("/api/progress", { chapter: chapter }, { "X-Client": "eligian" })
  log($operationdata.status, "status")
  log($operationdata.response, "saved")
]

timeline "main" in "#stage" using raf {
  on enter [
    on click "#next" run saveProgress(2)
  ]
  on leave [
    with "#next" { removeControllerFromElement("DOMEventListenerController") }
  ]
}
```

## Idioms

- Put the request in a named action and start it from an interaction (`on click "#next" run
  saveProgress(2)`) or an event action, so it runs once per user action.
- Read the answer from `$operationdata.response` and `$operationdata.status` later in the same
  list; the compiler moves such a chain into a `setOperationData` where the field does not
  resolve it.
- `httpPost` creates, `httpPut` replaces, `httpDelete` removes; all three take `url` and
  `headers` the same way.

## Pitfalls

- A relative url resolves against the page at runtime, not against the `.eligian` file; it is
  an endpoint, so `--bundle` does not copy it.
- A non-2xx answer throws (`httpPut: HTTP error <status>`) after setting `status`, and an answer
  that is not JSON throws too; the rest of the list does not run.
- In a timeline range it runs again every time a seek or a replay enters the range.
- It erases `url`, `body` and `headers`.
