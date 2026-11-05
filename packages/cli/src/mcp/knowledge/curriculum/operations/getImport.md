---
operation: getImport
card: "Looks up a registered entry by name and puts it in importedInstance: getImport(systemName). The engine answers from its resource importer: built-in operations, controllers and providers, and what the host registers (functions, templates, JSON). It does not call the entry. Throws when nothing is registered under the name."
---

## Example

```eligian probe
styles "./probe.css"
layout "./probe-layout.html"

action inspectImport [
  getImport("selectElement")
  log($operationdata.importedInstance, "import")
]

timeline "main" in "#stage" using raf {
  at 0s..1s inspectImport()
}
```

## Idioms

- Rarely needed in Eligian. To call a host function use `customFunction("<name>")`, to attach
  a controller `addController`, to fetch JSON `loadJson`.
- A registered object that the next operation reads as data: copy it with
  `setOperationData({ <field>: $operationdata.importedInstance })`.

## Pitfalls

- An unknown name throws at runtime; the message names `getImport` and the name, with the
  closest registered names when the importer can suggest them.
- `importedInstance` is the entry itself: a function stays uncalled, a class uninstantiated.
- It erases `systemName`.
