---
operation: announceToScreenReader
card: "Speaks a message through an ARIA live region: announceToScreenReader(message, priority?), priority \"polite\" (default) or \"assertive\". Needs no selection and returns at once; the message appears 100 ms later in an off-screen #aria-live-region and is removed after 5 seconds."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action chapter(title: string) [
  selectElement("#title")
  setElementContent(title)
  announceToScreenReader(title)
]

timeline "main" in "#stage" using raf {
  at 0s..4s chapter("Chapter two")
  at 4s..5s [
    announceToScreenReader("The presentation has ended", "assertive")
  ]
}
```

## Idioms

- Announce what changed on screen next to the change itself: a new chapter title, a step of a
  sequence, the result of a click.
- `"assertive"` interrupts the screen reader; keep it for the few messages that must not
  wait.

## Pitfalls

- An empty or blank message throws at runtime; `check` does not catch a parameter that
  arrives empty.
- A newer announcement replaces one that is still pending, so two in the same block leave
  only the last.
- The live region is invisible: for text the audience should see, also use
  `setElementContent`.
