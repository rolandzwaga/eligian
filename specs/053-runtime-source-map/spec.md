# Feature Specification: Eligian Map, Runtime Errors in the Source and a Live Playhead

**Feature Branch**: `fix/audit-high-findings` (implemented on the audit branch at the maintainer's request)
**Created**: 2026-10-31
**Status**: Implemented (breakpoints not done)
**Input**: Feature idea #14 of the 2026-10-22 codebase audit.

## Problem

The IR knows the source location of every action and operation (`EligiusIR.sourceMap`), but the
emitter returned only the configuration. The preview did not listen to the engine's `error` event,
so runtime failures were invisible, or showed up under generated JSON action names.

## Eligian map

`compiler/eligian-map.ts`, built from the optimized IR:

```ts
interface EligianMap {
  version: 1;
  source?: string;                      // the .eligian file (set by the CLI)
  actions: Record<actionId, {
    name; kind: 'init' | 'action' | 'event' | 'timeline';
    location?: SourceLocation;          // 1-based line/column, length; `file` for library code
    start: { systemName; location?; calls? }[];   // calls: the action a requestAction requests
    end:   { systemName; location?; calls? }[];
    timelineUri?; duration?: { start; end? };     // timeline actions; no end = open-ended
  }>;
}
```

- `compileWithMap(source, options)` returns `{ config, map }` (`compile()` is unchanged).
- CLI: `eligian story.eligian --eligian-map` writes `story.eligian-map.json` next to `story.json`
  (not with `-o -` or `--bundle`). The `--sourcemap` bundle flag is unrelated.

## Locating an engine error

Eligius 3 emits `EngineActionError { actionId, actionName, phase, operationSystemName,
operationIndex }` for a timeline action the engine started or ended. The operation is the
**innermost** failing one: when it failed inside an action the timeline action called, the
index is that action's. `locateEngineError(map, error)`:

1. every operation at the index whose system name matches: in the action's phase, then, for each
   `requestAction` in that phase, in the requested action's operations (start operations when
   followed by `startAction`, end operations for `endAction`), recursively (8 levels); `via`
   lists the actions followed;
2. the first is reported (the action's own operation before the called actions'), the others are
   `alternatives`: the index alone cannot tell them apart. The preview adds them to the
   diagnostic as related information ("Or here (in 'inner')"), the notification says "or N other
   places", `eligian smoke` appends "[or at file:line:col (in inner)]";
3. no match: the timeline action's own location.

## Preview

- The webview forwards `engine.on('error')` (action, phase, operation, message, timeline,
  position) and shows it in the status line.
- `PreviewPanel` locates it and shows a notification with the place
  (`… (story.eligian:6:5)`) and *Go to Source*, plus an Error diagnostic on the operation (source
  `eligius-runtime`, code `runtime_error`) in a collection of its own: in the program, or in the
  library defining the action. Identical repeats are reported once; a recompile and closing the
  preview clear them.
- The webview posts the playhead about 4 times a second (immediately after a seek or a timeline
  switch; `null` when the engine goes away). The panel maps the webview timeline uri back to the
  compiled one, and `PlayheadDecorator` marks the lines of the running timeline actions of the
  previewed file (`▶ 0s..6s` at the line end, whole-line highlight, overview ruler). Open-ended
  actions (`on enter` / `on leave`) are not marked. Setting `eligian.preview.highlightActiveEvents`
  (default true).

## Tests

- `compiler/__tests__/eligian-map.spec.ts`: map contents, locating direct, nested (start and end
  phase) and unknown errors, active actions; a compiled program run on the **real Eligius engine**
  whose `error` event is located on the failing operation's line.
- CLI: the flag writes the file; option combinations.
- Extension: the webview forwards errors and the playhead; the panel's notification text and
  diagnostic; the decorated lines.

## Not done

- Gutter breakpoints that pause the preview when an event starts (audit point 4, optional).
