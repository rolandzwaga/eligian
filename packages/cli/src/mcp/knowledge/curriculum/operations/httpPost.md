---
operation: httpPost
card: "Sends a POST request: httpPost(url, body?, headers?). The body is JSON-encoded with Content-Type application/json unless headers set another content type, in which case a string body is sent as is. The action waits; status and response (the parsed JSON body, null when empty) follow. A network failure, a non-2xx status or an invalid JSON body throws."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action sendScore(score: number) [
  httpPost("https://api.example.com/scores", { score: score, source: "quiz" })
  selectElement("#title")
  setElementContent("Score saved")
]

timeline "main" in "#stage" using raf {
  on enter [ on click "#next" run sendScore(3) ]
  on leave [ with "#next" { removeControllerFromElement("DOMEventListenerController") } ]
}
```

## Idioms

- Run it in a click or key handler (`on click … run`), not in a timeline range that a seek
  re-runs.
- Read the reply as `$operationdata.response.<field>` in a field that resolves chains, or the
  status as `$operationdata.status` in an `if`.
- Post form input with `getFormData()` first and `$operationdata.formData` as the body.

## Pitfalls

- Asynchronous: the operations after it wait for the response.
- An error status throws and stops the action; `status` is set before it throws.
- A response that is not JSON throws (`invalid JSON response`), except an empty one or a 204 /
  205, which give `null`.
- `url`, `body` and `headers` are erased only after a successful request.
