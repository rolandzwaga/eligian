---
operation: getQueryParams
card: "Reads the page URL's query string into queryParams, an object of strings: getQueryParams(defaultValues?). Keys missing from the URL take their value from defaultValues; keys in the URL win. Read one as $operationdata.queryParams.<name>, e.g. in an if condition."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action applyParams [
  getQueryParams({ mode: "plain" })
  if ($operationdata.queryParams.mode == "highlight") {
    selectElement("#box")
    addClass("highlight")
  }
]

timeline "main" in "#stage" using raf {
  on enter [ applyParams() ]
  on leave [
    selectElement("#box")
    removeClass("highlight")
  ]
}
```

## Idioms

- Run it once in `on enter` and branch on a parameter with `if`; give every parameter you read
  a default so the condition never meets a missing value.
- Pass a value on in a field that resolves chains (`setOperationData`, `calc`).

## Pitfalls

- Values are strings: `?step=2` gives `"2"`, and `when` compares strictly, so compare with
  `"2"`, not `2`.
- A repeated key keeps one value, not a list.
- It erases `defaultValues`. Under `smoke` the page URL is `http://localhost/`, without a
  query string, so only the defaults apply.
