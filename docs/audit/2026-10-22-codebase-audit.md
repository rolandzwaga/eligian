# Eligian codebase audit — 2026-10-22

## Resolution (updated 2026-10-31)

All 146 confirmed findings are resolved on branch `fix/audit-high-findings`. Each finding below has a **Status** line.

| Severity | Findings | Commit |
|---|---|---|
| High | 15 | `65fdd0f` |
| Medium | 53 (4 already covered by the high fixes) | `c7a75df` |
| Low | 78 (5 already covered by earlier fixes; #44 and #58 completed in `c47f7bd`) | `e6b5c32` |

Follow-up work on the same branch, prompted by the audit:

- `a242971`: runtime string concatenation and runtime value forwarding (feature idea #1, spec 046).
- `4fb2c74`: one operation-data dataflow analysis with inferred action contracts (spec 047).
- `711a713`: program-level runtime consts used a `setData` key Eligius rejects (`globaldata.x`, now `$globaldata.x`).
- `11e5ad1`: `setData` target keys are validated, with a quick fix for a missing `.
- `c47f7bd`: bundling works outside a project; build warnings cleaned up.

The feature ideas below are still open except #1 and #2 (done) and #12 (partly done).


## Summary

- **Build health:** green. `pnpm typecheck`, `pnpm run ci` (Biome), `pnpm effect:check` (0/0/0 for both projects) and `pnpm test` (2702 passed, 42 skipped, 0 failed) all pass. The only Biome output is a deprecation info about `linter.recommended` in `biome.json`.
- **Confirmed findings:** 146 in total. 0 critical, 15 high, 53 medium, 78 low. No findings were left uncertain. 9 reported findings were refuted and are left out of this report.
- **Top bug 1: silent miscompiles in constant folding.** A local const that shadows a global const is folded to the global's value ([expression-evaluator.ts:135](../../packages/language/src/compiler/expression-evaluator.ts#L135)). `!param` always folds to `false` ([expression-transformer.ts:213](../../packages/language/src/compiler/transformers/expression-transformer.ts#L213)). Neither produces a diagnostic.
- **Top bug 2: any warning aborts compilation.** `extractDocumentErrors` fails on `diagnostics[0]` and never checks severity ([document-errors.ts:72](../../packages/language/src/compiler/pipeline/document-errors.ts#L72)). Several validators emit warnings, so valid programs fail to compile. This also turns the false "asset type conflicts" warning into a hard failure.
- **Top bug 3: valid code gets hard type and time errors.** Timeline action calls with `null`, `-5`, `1 + 2`, `$globaldata.x` or `@@currentItem` arguments fail Typir checking even when the parameter is untyped ([eligian-type-system.ts:462](../../packages/language/src/type-system-typir/eligian-type-system.ts#L462)). Both time-range checks also ignore units: `500ms..2s`, `30s..1m` and `+0s..+5s` are rejected ([timeline-validator.ts:155](../../packages/language/src/validators/timeline-validator.ts#L155), [time-expression.ts:32](../../packages/language/src/type-system-typir/utils/time-expression.ts#L32)).
- **Also high and cheap to fix:** CI runs only the language package's tests ([ci.yml:72](../../.github/workflows/ci.yml#L72)). The installed `eligian` bin is a silent no-op ([cli/package.json:22](../../packages/cli/package.json#L22)). The extension's Compile command can overwrite the source file ([compile.ts:131](../../packages/extension/src/extension/commands/compile.ts#L131)).
- **Top feature idea 1:** close the silent parameter-forwarding hole. Today a forwarded parameter whose name differs from the operation input is emitted as a literal `"$operationdata.x"` string.
- **Top feature idea 2:** make the CLI a real linter. Add `eligian check` with every diagnostic, severities kept separate, globs and JSON/SARIF/GitHub output. This also absorbs four confirmed pipeline bugs.
- **Top feature idea 3:** optional end block and `at <start> for <duration>`. This removes the 36 `] []` lines and the hand-computed ranges in the tour.

## Build health

The health-check agent reported the following, quoted as given:

> All four checks pass, but I broke the read-only rule once. I ran `pnpm ci` expecting the Biome script, and it is pnpm's built-in clean install. It deleted `node_modules` in the root, `packages/cli`, `packages/extension` and `packages/language`, then reinstalled from the lockfile. It said "Lockfile is up to date", so it should not have changed versions. It also printed "Agent skills awaiting approval: typegraph-mcp". I did not run `pnpm effect:patch` or approve anything. The Biome script, which I ran next as `pnpm run ci`, is the one that matches your instruction. I ran `pnpm typecheck` before the reinstall and the other checks after it.

| Command | Result |
|---|---|
| `pnpm typecheck` (`tsc -b tsconfig.build.json`) | Pass, exit 0, no output. |
| `pnpm run ci` (Biome, no writes) | Pass, exit 0. Checked 452 files and found 1 info. |
| `pnpm effect:check` | Pass. Language: 197 files, 0 errors, 0 warnings, 0 messages. CLI: 208 files, 0 errors, 0 warnings, 0 messages. |
| `pnpm test` | Pass, exit 0. |

- **Biome info:** `biome.json:3:13` says the `recommended` field in the `linter` block is deprecated and will be removed in the next major version. It says to use `preset` instead and to run `biome migrate`. It is informational only and doesn't fail the check.
- **Tests:** 2702 passed, 42 skipped, 0 failed, out of 2744 total.

| Package | Test files | Tests |
|---|---|---|
| shared-utils | 4 passed | 87 passed |
| language | 140 passed, 1 skipped (141) | 2081 passed, 23 skipped (2104) |
| extension | 20 passed | 327 passed |
| cli | 9 passed, 1 skipped (10) | 207 passed, 19 skipped (226) |

- **Skipped tests:** 23 skips are in language and 19 in cli. The agent did not list which tests or files they are, and did not check for `todo` tests.
- **Side effect:** `pnpm ci` (pnpm's built-in clean install) reinstalled `node_modules` from the lockfile. The "Agent skills awaiting approval: typegraph-mcp" prompt it printed was not approved.

No check failed, so there are no failure logs to reproduce here.

## Confirmed findings

### Critical

None.

### High

### Constant evaluator resolves @refs by name, so a non-constant local that shadows a global const is replaced by the global's value

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/expression-evaluator.ts:135](../../packages/language/src/compiler/expression-evaluator.ts#L135)
- **Category:** bug
- **Description:** The VariableReference case uses only `varRef.variable.ref.name` to look up the constants map, and ignores which declaration the reference actually linked to. The scope provider lets an action-local const shadow a global one. If the local value is not foldable (e.g. `$operationdata.foo`), the local is emitted as setVariable, but every `@x` still finds the global constant of the same name. expression-transformer.ts has the same by-name lookup (`scope.programConstants.has(varName)`), so plain references are inlined with the wrong value and derived constants fold against it.
- **Failure scenario:** Source: `const x = 1` then `action a() [ const x = $operationdata.foo  selectElement("#a")  setElementContent(@x)  const y = @x + 10  setElementContent(@y) ]`. Real CLI output: setVariable x = `"$operationdata.foo"` is emitted, but the two setElementContent ops get template 1 and template 11 instead of `"$scope.variables.x"` and a runtime expression. The compiled presentation silently shows the wrong data.

**Evidence**

```
const varName = varRef.variable.ref.name;
...
if (!constants.has(varName)) { throw new Error(`Undefined constant: ${varName}`); }
const constant = constants.get(varName)!;
return constant.value;
```

**Fix:** Key the ConstantMap entries by declaration identity: store the VariableDeclaration node in each ConstantValue and fold only when `constant.declaration === varRef.variable.ref`. Apply the same check in expression-transformer's VariableReference case, which uses `scope.programConstants.has(varName)`. Optionally add a validator warning for a local const that shadows a global const. Add tests for both the folded-literal and derived-constant cases.

Verifier: Reproduced with the real CLI (packages/cli/bin/cli.js) on a scratchpad file with the exact source from the finding, plus a styles import so CSS validation passes. The output contains setVariable `{name:'x', value:'$operationdata.foo'}`, but the two setElementContent ops get template 1 and template 11, with no diagnostic. expression-evaluator.ts:135 looks up constants only by `varRef.variable.ref.name`, so the global const wins over the local declaration the reference actually links to. The output is silently wrong. The trigger is narrow (an action-local const that shadows a same-named global and cannot be folded), so high fits better than critical.

### parseSource uses URI.parse on a Windows filesystem path, dropping the drive letter and breaking asset and library resolution when the file is on a different drive from the cwd

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/pipeline/parser.ts:53](../../packages/language/src/compiler/pipeline/parser.ts#L53)
- **Category:** bug
- **Description:** The CLI (compile-file.ts) and the VS Code extension pass sourceUri as a plain fsPath (e.g. `C:\proj\a.eligian`). `URI.parse('C:\\proj\\a.eligian')` reads `C` as the scheme, so `documentUri.fsPath` becomes `\proj\a.eligian` with no drive. Every later resolution (asset validation, library path resolution, CSS file reads) is relative to the process's current drive, not the file's drive.
- **Failure scenario:** Input file `C:\...\zz\ok.eligian` contains `styles "./s.css"`, with s.css next to it. Run the CLI from `F:\` and it fails with 'Asset file not found: ./s.css'. Run the same command from `C:\` and it compiles. A circular-import error message also printed paths such as `\projects\eligius\...` without the drive. Library imports from a source on another drive fail the same way.

**Evidence**

```
const uriString = uri ?? `file:///memory/source-${documentCounter++}.eligian`;
const documentUri = URI.parse(uriString);
```

**Fix:** In parseSource: when uri matches `/^[a-zA-Z]:[\\/]/` or has no `://` scheme, use `URI.file(uri)`; otherwise use `URI.parse(uri)`. Use `documentUri.toString()` everywhere the raw uriString is currently used as a registry key (CSSRegistry.clearDocument, registerImports), so the keys match the validator's URI format. Add a test with an absolute Windows path on a drive other than the cwd's.

Verifier: Reproduced. A file in the C: scratchpad with `styles "./s.css"` and s.css next to it fails with 'Asset file not found: ./s.css' when the CLI runs from `F:\`, and the same command run from `C:\` compiles. compile-file.ts:274 passes absoluteInputPath, and the extension (commands/compile.ts:114, preview/CompilationService.ts:137) passes `uri.fsPath`. parser.ts:53 calls URI.parse on that string, which treats the drive letter as a URI scheme, so the drive is lost in `documentUri.fsPath`. In the extension this breaks any workspace on a different drive from the extension host's cwd.

### Any warning, info or hint diagnostic aborts compilation as a ValidationError

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/pipeline/document-errors.ts:72](../../packages/language/src/compiler/pipeline/document-errors.ts#L72)
- **Category:** bug
- **Description:** extractDocumentErrors fails on `document.diagnostics[0]` whenever the array is non-empty and never checks severity. The validators emit warnings (timeline provider with unused source, duplicate event handlers, empty timeline, unreachable code, operation dependency warnings, locales parse warning). Those become fatal compile errors. Only element 0 is inspected, so a warning can also hide the real error that follows it.
- **Failure scenario:** `timeline "main" in "#app" using raf from "x.mp4" { at 0s..5s f() }` is otherwise valid. The CLI prints 'Compilation failed: Validation Error: While validating the AstNode ..., this warning is found: Timeline provider 'raf' does not use a source file' and produces no output. Two handlers for the same event also fail the build, although the validator only warns.

**Evidence**

```
if (document.diagnostics && document.diagnostics.length > 0) {
  const error = document.diagnostics[0];
```

**Fix:** In extractDocumentErrors, filter `document.diagnostics` to `severity === DiagnosticSeverity.Error` (or undefined, which defaults to error) and fail on the first of those. Return or log warnings through a separate channel (for example a warnings array on the compile result or the Logger service) so the CLI can print them without failing. This also applies to library documents, because parseLibraryDocument uses the same helper.

Verifier: Reproduced with the real CLI. `timeline "main" in "#app" using raf from "x.mp4" { at 0s..5s f() }`, with valid CSS and action, fails with 'Validation Error: While validating the AstNode ..., this warning is found: Timeline provider 'raf' does not use a source file' and produces no output. document-errors.ts:72 takes `diagnostics[0]` whenever the array is non-empty and never checks severity. EligianDocumentValidator does not filter by severity either. Several validators emit 'warning' severity: timeline-validation, control-flow-validation, import-validation, event-action-validator, parameter-validator, asset-import-validator and duplicate-validator. Each of these becomes fatal, and a warning listed first can hide a later real error.

### resolveLibraryPath does not normalize '..', so import cycles that use '..' defeat cycle detection and recurse until the process runs out of memory

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/pipeline/library-loader.ts:85](../../packages/language/src/compiler/pipeline/library-loader.ts#L85)
- **Category:** bug
- **Description:** The absolute path is built by string concatenation (`` `${currentDir}${separator}${cleanPath}` ``), and URI.file does not resolve `..` segments. loadLibraryRecursive compares `uri.fsPath` strings in loadingStack. Each hop of a cycle that goes through `../` yields a longer, textually different path (`a\..\b\..\a\l1.eligian` ...), so `loadingStack.has()` never matches. The recursion is unbounded, and each level re-reads and re-parses the file.
- **Failure scenario:** a/l1.eligian: `library l1  import { actionB } from "../b/l2.eligian"`. b/l2.eligian: `library l2  import { actionA } from "../a/l1.eligian"`. A main program imports `./a/l1.eligian`. The CLI ran for 2 minutes and died with 'FATAL ERROR: Ineffective mark-compacts near heap limit ... JavaScript heap out of memory'. The `./` variant (examples/libraries/nested/cycle-test) correctly reports 'Circular dependency detected'.

**Evidence**

```
const absolutePath = `${currentDir}${separator}${cleanPath}`;
return URI.file(absolutePath);
...
if (loadingStack.has(uriPath)) {
```

**Fix:** Use `path.resolve(path.dirname(currentDocUri.fsPath), importPath)` (or the shared resolveImportRelativePath) and return URI.file of the result. Key loadingStack on `path.normalize(fsPath)`, lowercased on win32. The duplicate-document check in parseSource should compare the same normalized key. Add a regression test for a `../`-based cycle.

Verifier: Reproduced. a/l1.eligian imports `../b/l2.eligian`, b/l2.eligian imports `../a/l1.eligian`, and main imports `./a/l1.eligian`. Run with `--max-old-space-size=256`, the CLI dies within about 7 seconds with 'FATAL ERROR: Ineffective mark-compacts near heap limit ... JavaScript heap out of memory' (exit 134) instead of reporting the cycle. resolveLibraryPath builds the path by string concatenation, and URI.file does not collapse `..` segments. loadingStack compares raw fsPath strings, so each hop produces a new, longer key and the cycle is never detected. The `./`-only cycle example is detected correctly.

### Library actions cannot call sibling or private helper actions (FR-010 unimplemented in the compiler)

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/transformers/library-imports.ts:93](../../packages/language/src/compiler/transformers/library-imports.ts#L93)
- **Category:** bug
- **Description:** resolveImports only adds the actions the program names in `import { ... }`, plus ALL actions of libraries that are imported by other libraries. A library's own non-imported actions, `private` helpers included, never enter `allActions`. When an imported public action is compiled via transformActionDefinition, a call to a sibling is not found by findActionByName. It falls through to transformOperationCall and fails as an unknown operation. Spec 023 FR-010 requires private actions to be callable within their own library. The existing library-merging and library-compilation tests never have one library action call another.
- **Failure scenario:** priv.eligian: `library priv; private action helper(s: string)[selectElement(s)]; action pub(s: string)[helper(s) addClass("x")]`. A program does `import { pub } from "./priv.eligian"` and calls `pub("#a")`. transformAST fails with TransformError ValidationError: `Unknown operation: "helper"`. Reproduced.

**Evidence**

```
for (const actionImport of libraryImport.actions) {
  const actionDef = actionImport.action.ref;
  ...
  importedActions.push(actionDef);
}
// nothing adds libraryImport's own library.actions to the lookup list
```

**Fix:** In resolveImports, for each resolved import's library (and recursively for nested libraries), add every action of that library, public and private, to the lookup set passed as allActions. Transform each library's actions with the lookup scope of its own library, so a private helper never resolves from the program. Emit the transitively reachable non-aliased definitions into config.actions only once, deduped by node identity. Note that resolveLibraryDocument uses `getOrCreateServices()`, so tests that use createTestContextWithMockFS never take the nested branch. New tests must either load libraries into the shared services, or the helper must take the services as a parameter.

Verifier: In library-imports.ts, resolveImports pushes only the explicitly imported ActionDefinitions. `resolveLibraryImports(library)` collects only the actions of libraries that the imported library itself imports, never the library's own actions. `findActionByName(name, allActions)` therefore cannot find a sibling or private helper, and pipeline.ts / library-loader.ts have no other path that adds them. Reproduced in a scratch vitest using the real transformAST: `library priv; private action helper(sel)[selectElement(sel)]; action pub(sel)[helper(sel) addClass("x")]` plus `import { pub }` passes validation, then fails with `Unknown operation: "helper"`. This breaks spec 023 FR-010 ('Private actions MUST be callable by other actions within the same library file'). No compiler test covers a library action calling a sibling.

### Unary `!` on a runtime reference constant-folds to `false`

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/compiler/transformers/expression-transformer.ts:213](../../packages/language/src/compiler/transformers/expression-transformer.ts#L213)
- **Category:** bug
- **Description:** UnaryExpression transforms the operand first. A parameter, variable or system reference becomes a string such as `$operationdata.flag`. The `!` case then applies JS `!` to that string, so every non-empty reference string becomes the compile-time constant `false`. The operand is a runtime value, so the result should stay symbolic, or be rejected the way the condition transformer rejects it.
- **Failure scenario:** `action ff(flag: boolean)[ selectElement("#a") setData({"a": !flag}) ]`, called as `ff(true)`. The emitted operationData is `{"properties":{"a":false}}`, and `!x` for a numeric param also gives `false`. The same happens for `!@@something` and `!@var`, so the flag is wrong at runtime for every input. Reproduced.

**Evidence**

```
const operand = yield* transformExpression(expr.operand, scope);
switch (expr.op) {
  case '!':
    return !operand;
```

**Fix:** In the `'!'` case, fold only when the operand is a boolean, number or null, i.e. a compile-time constant after constant folding. Otherwise fail with TransformError kind 'InvalidExpression': 'Negation of runtime values (parameters/variables/system properties) is only supported inside if/when conditions'. Ideally also add a validator check so the IDE reports it before compilation.

Verifier: expression-transformer.ts:212-213 applies JS `!` to the transformed operand. For a parameter, the operand is the string `$operationdata.flag`, so the result is always `false`. Reproduced: `action ff(flag: boolean)[selectElement("#a") setData({"a": !flag})]` emits `{"properties":{"a":false}}`, and validation raises no error. The value is silently wrong at runtime for every input. The `-` case right below it already distinguishes numbers from non-numbers, which shows the `!` case is missing that guard.

### checkValidTimeRange compares raw time values and ignores units, rejecting valid ranges like 500ms..2s or 90s..2m

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/validators/timeline-validator.ts:155](../../packages/language/src/validators/timeline-validator.ts#L155)
- **Category:** bug
- **Description:** TimeLiteral has an optional unit (ms|s|m|h), but the check compares `start.value > end.value` without converting to a common unit. Valid mixed-unit ranges are reported as errors, and invalid ones (`1s..500ms`) are not caught by this check. The compiler's time-transformer converts units correctly, so the validator disagrees with the compiler. The Typir rule (type-system-typir/utils/time-expression.ts) also converts only 'ms', so 'm' and 'h' are treated as seconds there. Reproduced by running the validator.
- **Failure scenario:** `at 500ms..2s action()` gives the error 'Timeline event start time (500) must be less than or equal to end time (2)'. `at 90s..2m` and `at 61m..1h` are rejected the same way, and the error blocks compilation. `at 1s..500ms` is missed by this check and only Typir reports it.

**Evidence**

```
if (start.$type === 'TimeLiteral' && end.$type === 'TimeLiteral') {
      if (start.value > end.value) {
```

**Fix:** Make both checks unit-aware. Have extractTimeValue convert m (x60) and h (x3600) as well as ms, or reuse the compiler's convertTimeToSeconds. Then either compare converted seconds in checkValidTimeRange or delete it as a duplicate of the Typir range rule. Keeping two rules gives two diagnostics for one problem.

Verifier: The grammar (eligian.langium:624-628) defines `TimeLiteral: value=NUMBER unit=TimeUnit?` with TimeUnit 'ms'|'s'|'m'|'h'. checkValidTimeRange (timeline-validator.ts:155) compares raw `start.value > end.value` and is registered for every TimelineEvent (eligian-validator.ts:134). The verifier ran the real validator through a tsx script using createEligianServices. `at 500ms..2s a()` gives 'Timeline event start time (500) must be less than or equal to end time (2)'. `at 90s..2m` gives the same error plus a Typir error, because extractTimeValue in type-system-typir/utils/time-expression.ts converts only 'ms' and treats 'm'/'h' as seconds. `at 1s..500ms` is missed by this check and only Typir reports it. pipeline.spec.ts shows that this check's error blocks compilation, so valid mixed-unit ranges cannot be compiled. High severity is justified.

### Timeline action calls fail with a hard error for any argument without a Typir inference rule, even for untyped (unknown) parameters

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:462](../../packages/language/src/type-system-typir/eligian-type-system.ts#L462)
- **Category:** bug
- **Description:** Action function types are created with `validateArgumentsOfFunctionCalls: true`. Typir infers each argument and requires it to be assignable to the parameter type. Only StringLiteral, NumberLiteral, BooleanLiteral, ObjectLiteral and ArrayLiteral have inference rules, plus the Variable/Parameter reference rules. Everything else has no rule: NullLiteral, PropertyChainReference (`$globaldata.x`), SystemPropertyReference (`@@currentItem`, `$scope.currentItem`), UnaryExpression (`-5`, `!x`), BinaryExpression (`1 + 2`), and variable references whose const is initialised from those. For such arguments `inferType` returns InferenceProblems and `checkTypes` reports a mismatch. This also happens when the parameter is unannotated and typed as the Top type, so the 'unknown = opt-out' contract does not hold. Top does not help as the expected type, because what is missing is the actual argument type.
- **Failure scenario:** Verified by running the real services. With `action a1(a) [ ... ]`, each of `at 0s..3s a1(null)`, `a1(-5)`, `a1(1 + 2)`, `a1($globaldata.x)`, `a1(@@currentItem)`, and `const q = $globaldata.x` followed by `a1(@q)` gives: 'The given operands for the call of 'a1' don't match ... While inferring the type for the AstNode ..., found no applicable inference rules'. The program is valid, but the call gets error severity. `a1("x")` and `a1([1,2])` pass.

**Evidence**

```
validateArgumentsOfFunctionCalls: true, // Enable type checking for action calls
...
typir.Inference.addInferenceRulesForAstNodes({ Parameter..., VariableDeclaration..., VariableReference..., ParameterReference... })  // no NullLiteral/PropertyChainReference/SystemPropertyReference/UnaryExpression/BinaryExpression rules
```

**Fix:** The simplest robust fix is the function form of `validateArgumentsOfFunctionCalls`: validate only when every argument has an inference result (`!isInferenceProblem(typir.Inference.inferType(arg))`), or skip arguments whose parameter type is Top. Then add real inference rules: NullLiteral, PropertyChainReference and SystemPropertyReference map to Top/unknown (or to a Bottom type assignable to everything), and UnaryExpression and BinaryExpression map to number or boolean depending on the operator. Add regression tests for each case listed.

Verifier: Reproduced against the built services (packages/language/out, built after the last commit), using one document per case under EmptyFileSystem. With `action a1(a) [...]` and timeline calls, `a1(null)`, `a1(-5)`, `a1(1 + 2)`, `a1($globaldata.x)`, `a1(@@currentItem)`, and `const q = $globaldata.x` followed by `a1(@q)` each give an error-severity diagnostic: "The given operands for the call of 'a1' don't match ... parameters of 'a1(a: any): ($return: any)'". `a1("x")` gives none. eligian-type-system.ts registers inference rules only for String/Number/Boolean/Object/ArrayLiteral and for Parameter/VariableDeclaration/VariableReference/ParameterReference, and the action rule uses `validateArgumentsOfFunctionCalls: true`. So the argument cannot be inferred even when the parameter is Top/unknown. That breaks the documented 'unknown = opt-out' contract and blocks ordinary valid programs with an error.

### extractTimeValue ignores m/h units, relative times and property-chain times, giving spurious and missed time-range errors

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/type-system-typir/utils/time-expression.ts:32](../../packages/language/src/type-system-typir/utils/time-expression.ts#L32)
- **Category:** bug
- **Description:** The grammar allows TimeUnit `ms|s|m|h`, RelativeTimeLiteral (`+2s`) and PropertyChainReference inside time expressions. The compiler's `convertTimeToSeconds` handles m and h, and the transformer adds the previous event's end time for relative literals. `extractTimeValue` treats every unit other than ms as seconds (so `1m` becomes 1) and returns 0 for RelativeTimeLiteral and PropertyChainReference. `event-validation.ts` uses these values for the `endTime <= startTime` and `duration <= 0` checks.
- **Failure scenario:** Verified. `at +0s..+5s [...] [...]`, which LANGUAGE_SPEC documents, gives the error 'Timeline event end time (0s) must be greater than start time (0s)'. `at 30s..1m` (30s to 60s) gives an error because 1m becomes 1, both in the Typir validator and in timeline-validator ('start time (30) must be less than or equal to end time (1)'). In the other direction, `at 2m..90s` (120 to 90) passes because it is read as 2..90. `stagger ... for +1s` or a property-chain duration fails the 'duration must be positive' check.

**Evidence**

```
const unit = timeExpr.unit || 's'; // Default to seconds
    return unit === 'ms' ? value / 1000 : value;
...
  // TODO: Handle RelativeTimeLiteral, PropertyChainReference
  // For now, return 0 for unsupported types
  return 0;
```

**Fix:** In extractTimeValue, convert `ms/1000`, `s`, `m*60` and `h*3600`, and return `undefined` for RelativeTimeLiteral, PropertyChainReference, or any undefined operand in a BinaryTimeExpression. In event-validation.ts and event-inference.ts, skip the range, duration and delay checks when a value is undefined. Apply the same unit fix to the Langium timeline validator that reports 'start time (30) ... end time (1)'. Add tests for `1m`, `1.5h`, `+0s..+5s`, `30s..1m`, `2m..90s` and a `$globaldata` duration.

Verifier: time-expression.ts treats every unit except 'ms' as seconds and returns 0 for RelativeTimeLiteral and PropertyChainReference (there is an explicit TODO). The grammar allows `'ms'|'s'|'m'|'h'` and RelativeTimeLiteral, and time-transformer.ts handles 'm' and 'h'. LANGUAGE_SPEC.md (lines 1858-1860) documents `+2s` and `+0s`. Reproduced: `at +0s..+5s` gives "Timeline event end time (0s) must be greater than start time (0s)". `at 30s..1m` gives two errors, one from the Langium timeline validator ("start time (30) must be less than or equal to end time (1)") and one from Typir. `at 2m..90s` gives no error. All three are either errors on valid input or a missed error on invalid input.

### Explicit 'as' asset type is compared against an extension map that defaults unknown extensions to html, producing false conflict warnings

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/type-system-typir/utils/asset-type-inferrer.ts:51](../../packages/language/src/type-system-typir/utils/asset-type-inferrer.ts#L51)
- **Category:** bug
- **Description:** `inferAssetTypeFromExtension` returns 'html' for every extension it does not know. The NamedImport validation warns whenever the explicit `as` type differs from that result. The asset-type validator tells users to add an explicit `as` for unknown extensions, and `as css` and `as media` are legal. Following that advice for any extension not in the small list then produces a contradictory warning. Media extensions such as .mov, .m4a, .aac, .flac, .mkv and .opus, and .scss/.less for css, are not in the list.
- **Failure scenario:** Verified. `import theme from "./theme.scss" as css` gives the warning "Asset type 'css' conflicts with inferred type 'html' from file extension". `import clip from "./intro.mov" as media` gives the same warning for media. The user did what the compiler asked and still gets a warning that contradicts that advice.

**Evidence**

```
default:
      // Default to html for unknown extensions
      return 'html';
...
if (node.assetType !== inferredType) { accept({ severity: 'warning', message: `Asset type '${node.assetType}' conflicts with inferred type '${inferredType}' ...
```

**Fix:** Drop the Typir-local inferrer. Use `inferAssetType` from utils/asset-type-inference.ts, which returns undefined for unknown extensions, as the single source of truth in both import-validation.ts and import-inference.ts. Warn only when an inference exists and differs from the explicit type. Treat AMBIGUOUS_EXTENSIONS (.ogg) as 'no inference' too. Extending the extension map (.m4a/.aac/.flac/.mov/.mkv/.opus/.oga/.ogv) is optional. Also consider making extractDocumentErrors fail only on severity-1 (error) diagnostics, so that no warning can block compilation.

Verifier: `inferAssetTypeFromExtension` (asset-type-inferrer.ts:51-53) returns 'html' for any extension it does not know. The NamedImport rule in import-validation.ts:99-108 warns whenever `assetType !== inferredType`. Meanwhile the Langium asset-type-validator reports UNKNOWN_EXTENSION for .scss/.mov/etc. with the hint "Add 'as html', 'as css', or 'as media'". Reproduced with the real CLI (packages/cli/bin/cli.js): `import theme from "./theme.scss" as css` and `import clip from "./clip.mov" as media` both print "Asset type 'css'/'media' conflicts with inferred type 'html'...". The reviewer understated the impact, because this is more than a warning. `extractDocumentErrors` (compiler/pipeline/document-errors.ts:72) fails the compile on the first entry in `document.diagnostics`, warnings included, so the CLI stops with 'Compilation failed: Validation Error'. Following the compiler's own advice for any unlisted css or media extension therefore makes the program impossible to compile, and only `as html` gets through. That is why the severity was raised to high. The root cause is that two separate inferrers exist and have drifted apart: the Typir one, and utils/asset-type-inference.ts, which returns undefined for unknown extensions.

### Library files cannot call actions they import: scope returns only the library's own actions

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/eligian-scope-provider.ts:120](../../packages/language/src/eligian-scope-provider.ts#L120)
- **Category:** bug
- **Description:** For a Library root, getScopeForActionReference uses only `model.actions`. It never adds the actions the library imports (Feature 032 US3 nested libraries). The existence validator also gates the imported-action lookup on `program &&`, which is null for libraries. So the call stays unresolved and checkOperationExists reports an unknown operation.
- **Failure scenario:** The repo's own example examples/libraries/nested/b.eligian does `import { fadeIn } from "./c.eligian"` and calls `fadeIn(selector, 500)` inside `slideAndFade`. In the IDE the library file gets the error `Unknown operation: "fadeIn". Did you mean: ...`, and go-to-definition and hover do not work on the call. Also reproduced with a library C that imports `bAct` from B and calls it, which gives `Unknown operation: "bAct"`.

**Evidence**

```
} else if (isLibrary(model)) {
      // Library: get actions directly from library.actions array
      actionDefinitions = model.actions || [];
    }
```

**Fix:** In the Library branch, add the library's directly imported actions, named `alias ?? name` and taken from `model.imports`. In the existence and parameter validators, resolve imports against the root model, Program or Library (findImportedActionByNameOrAlias should accept `{ statements } | { imports }`), not only Program. Also give getActionNameForScope alias support for Library roots.

Verifier: The Library branch of getScopeForActionReference (lines 120-123) only uses `model.actions`. OperationExistenceValidator.checkOperationExists checks imported actions only inside `if (program && this.services)`. getProgram uses `getContainerOfType(isProgram)`, which returns undefined in a library document, and the library branch searches only `library.actions`. The repo example examples/libraries/nested/b.eligian imports fadeIn from c.eligian and calls `fadeIn(selector, 500)`. fadeIn is not in registry.generated.ts (0 matches), so validateOperationExists reports an unknown operation and the reference stays unresolved, with no go-to-definition or hover. ParameterValidator has the same program-only gate. So a nested-libraries feature that the repo documents is broken in the IDE for the repo's own example.

### Locales JSON schema rejects every { "$ref": ... } locale entry (oneOf matches both branches)

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/language/src/schemas/locales-schema.json:10](../../packages/language/src/schemas/locales-schema.json#L10)
- **Category:** bug
- **Description:** The per-locale value is `oneOf [localeData, localeReference]`. `localeData` allows any string-valued property, so `{ "$ref": "./x.json" }` is also a valid localeData. It then matches both branches and Ajv fails `oneOf` (passingSchemas [0,1]). The schema's own `examples`, the LabelsParser docs and `isLocaleReference` all treat `$ref` entries as valid, so the documented external-locale format can never compile. Confirmed by running the compiled schema through Ajv.
- **Failure scenario:** locales.json = `{"en-US": {"$ref": "./locales/en-US.json"}}`. validateLocalesJSON returns invalid_locales_schema with the message 'must match exactly one schema in oneOf'. loadProgramAssets then adds a LocalesImportError, and both `eligian` CLI compilation and the LSP asset check fail on valid input.

**Evidence**

```
"oneOf": [ { "$ref": "#/$defs/localeData" }, { "$ref": "#/$defs/localeReference" } ]  ... localeData: "additionalProperties": { "oneOf": [ {"type":"string"}, {"$ref":"#/$defs/localeData"} ] }  // Ajv: {"keyword":"oneOf","params":{"passingSchemas":[0,1]}}
```

**Fix:** Restrict localeData so it cannot match a reference: add `"not": {"required": ["$ref"]}` to localeData, or exclude the `$ref` key via propertyNames. Alternatively use `if: {required:["$ref"]}` then localeReference, else localeData. Switching to anyOf also works but gives weaker error messages. Add a validateLocalesJSON spec for a `$ref`-only locales file and one for a mixed file.

Verifier: The verifier compiled packages/language/src/schemas/locales-schema.json with Ajv, using the same options as locale-import-validator.ts. `{"en-US":{"$ref":"./locales/en-US.json"}}` returns false with keyword 'oneOf' and passingSchemas [0,1], while `{"en-US":{"a":"b"}}` passes. localeData's additionalProperties accepts any string value, so a `$ref` object matches both oneOf branches. The validator is called from loadProgramAssets (compiler-integration.ts:219, which adds a LocalesImportError and is used by the CLI and the LSP asset check) and from the extension's locales parse step, which then returns empty metadata. The schema's own second example and the LabelsParser docs therefore describe a format that is always rejected. No spec runs a `$ref` entry through validateLocalesJSON.

### package.json bin maps eligian to dist/cli.mjs, which only exports main and never runs it; bin/cli.js is not published

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/cli/package.json:22](../../packages/cli/package.json#L22)
- **Category:** bug
- **Description:** dist/cli.mjs is the esbuild bundle of src/main.ts. It has a shebang and `export default main` but never calls `main()`. The real launcher, bin/cli.js, is not referenced by the bin field and is not in the `files` allowlist (dist, out). So any installed or `pnpm exec` run of `eligian` does nothing. The repo's own AGENTS.md and KNOWN_ISSUES.md acknowledge this, but it is still unfixed.
- **Failure scenario:** After install, `eligian foo.eligian` exits 0 with no output and no file written. CI or scripts that rely on the exit code treat it as success.

**Evidence**

```
"bin": {
    "eligian": "./dist/cli.mjs",
    "eligian-cli": "./dist/cli.mjs"
  },
  "files": ["dist","out"]
```

**Fix:** Point both bin entries at `./bin/cli.js` and add `"bin"` to `files`. Alternatively, add a separate esbuild entry (e.g. src/cli-entry.ts that imports main and calls it) and point bin at its output, so the library entry keeps a side-effect-free main.ts.

Verifier: package.json `bin` maps both `eligian` and `eligian-cli` to ./dist/cli.mjs. That is the esbuild bundle of src/main.ts (the esbuild.mjs entry). main.ts only does `export default function main()` and never calls it: the end of the file is `program.parse` inside main, and dist/cli.mjs only defines `function main()`. bin/cli.js is the real launcher (it imports main and calls it). The bin field does not reference it, and `files` (dist, out) does not include bin/. packages/cli/AGENTS.md:20-22 records this explicitly: an installed or `pnpm exec eligian` run is a silent no-op that exits 0.

### Compile command overwrites the source file when its path does not end in .eligian

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [packages/extension/src/extension/commands/compile.ts:131](../../packages/extension/src/extension/commands/compile.ts#L131)
- **Category:** bug
- **Description:** The output path is derived with a case-sensitive regex replace. If the active document has languageId 'eligian' but its path does not end in lowercase '.eligian', the replace does nothing and the output path equals the input path. The compiled JSON is then written over the user's source file. A document can have languageId 'eligian' without the extension through 'Change Language Mode', files.associations, untitled documents, or an upper-case .ELIGIAN extension. For an untitled document, fsPath is 'Untitled-1', so the JSON is written to a relative path in the extension host's cwd.
- **Failure scenario:** The user opens notes.txt, switches the language mode to Eligian, and runs 'Eligian: Compile Current File'. `outputPath === inputPath === notes.txt`, so fs.writeFile replaces the user's source with compiled JSON. If the file was saved, the original content is lost.

**Evidence**

```
const inputPath = sourceUri.fsPath;
const outputPath = inputPath.replace(/\.eligian$/, '.json');
...
await fs.writeFile(outputPath, outputJson, 'utf-8');
```

**Fix:** Require `document.uri.scheme === 'file'`. Compute the output as `path.join(dir, name + '.json')` from `path.parse(inputPath)`, so the extension is always replaced whatever its case. Refuse to write, with an error message, when `path.resolve(outputPath)` equals `path.resolve(inputPath)` (compare case-insensitively on win32).

Verifier: compile.ts:92 checks only `document.languageId === 'eligian'`, and line 131 derives the output with the case-sensitive `inputPath.replace(/\.eligian$/, '.json')`. No other guard exists. If a document has the eligian language ID but its path does not end in lowercase '.eligian' (Change Language Mode, files.associations such as `*.eli`, or an upper-case .ELIGIAN file on Windows), `outputPath === inputPath` and fs.writeFile overwrites the source on disk. The compile has to succeed first, so this only happens when the content is valid Eligian. That is realistic for an associated or upper-case extension, not for an arbitrary notes.txt. For an untitled document, fsPath is 'Untitled-1', so the write goes to a relative path in the extension host's cwd instead of over a source file. Undo or Local History may recover the file, but losing the source on disk justifies high severity.

### CI only runs tests for the language package; cli, extension and shared-utils specs never run

- **Status:** ✅ Fixed in `65fdd0f`

- **Location:** [.github/workflows/ci.yml:72](../../.github/workflows/ci.yml#L72)
- **Category:** test-gap
- **Description:** The CI test step runs `pnpm run test:coverage:ci`, which is `pnpm -r test:coverage:ci`. Only @eligian/language defines that script. shared-utils defines `test:coverage`, and cli and extension define only `test` and `test:watch`. `pnpm -r` silently skips packages that lack the script, so the step succeeds without running those suites.
- **Failure scenario:** A regression in the CLI argument handling, the bundler, the extension preview code or `resolvePath` breaks some of the 10, 20 or 4 spec files in those packages. CI stays green because those suites never run.

**Evidence**

```
- name: Run tests with coverage
  run: pnpm run test:coverage:ci
(root package.json: "test:coverage:ci": "pnpm -r test:coverage:ci"; only packages/language/package.json defines it)
```

**Fix:** Add `test:coverage:ci` (for example `vitest run`, or with `--coverage`) to cli, extension and shared-utils, or add a separate `pnpm -r test` step for the packages that lack it. Keep the language coverage report step as it is.

Verifier: ci.yml has one test step, `pnpm run test:coverage:ci` (line 72), and no `pnpm test` step. The root script is `pnpm -r test:coverage:ci`, and only packages/language/package.json defines `test:coverage:ci`. shared-utils has `test:coverage`, and cli and extension have only `test`. `pnpm -r <script>` skips packages without the script, so the cli, extension and shared-utils specs never run in CI. pages.yml builds and runs the CLI but runs no tests either.

### Medium


### Constant folding produces NaN for % by zero and for arithmetic on non-numeric operands, which serialize as JSON null

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/expression-evaluator.ts:214](../../packages/language/src/compiler/expression-evaluator.ts#L214)
- **Category:** bug
- **Description:** `/` guards against a zero divisor, but `%` does not. `-`, `*`, `<`, `>` etc. cast string and boolean operands with `as number` and rely on JS coercion without checking types. `10 % 0` and `"abc" - 1` fold to NaN and are accepted as constants of type 'number'. JSON.stringify turns NaN into null, so the compiled config silently gets null.
- **Failure scenario:** `const modv = 10 % 0  const strv = "abc" - 1  ... setElementContent(@modv) setElementContent(@strv)` compiles with `"template": null` for both ops and no error or warning. `true + 1` folds to 2 and `"5" - 2` to 3 through coercion.

**Evidence**

```
case '%':
  return (left as number) % (right as number);
...
case '-':
  return (left as number) - (right as number);
```

**Fix:** In applyBinaryOperator, require `typeof left === 'number' && typeof right === 'number'` for `- * / % < > <= >=`, and throw otherwise so the expression becomes non-constant or is reported. Guard `%` by zero the same way as `/`. After computing any arithmetic result, throw if `!Number.isFinite(result)`. Ideally report this as a compile error rather than falling back to the runtime, because `"abc" - 1` is a type error either way.

Verifier: Reproduced with the real CLI. `const modv = 10 % 0` and `const strv = "abc" - 1` compile without any diagnostic, and both setElementContent ops get `"template": null`. applyBinaryOperator guards only `/` against a zero divisor, and every other arithmetic and relational operator casts with `as number`. Folding to NaN, which JSON serializes as null, is silent data corruption. It is not critical because the inputs are unusual, and type checking may flag some of them in the IDE.

### Parse errors at end of input get NaN line and column

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/pipeline/document-errors.ts:61](../../packages/language/src/compiler/pipeline/document-errors.ts#L61)
- **Category:** bug
- **Description:** For an unexpected EOF, Chevrotain's EOF token has startLine, startColumn and startOffset equal to NaN. `NaN ?? 1` stays NaN, so the nullish fallback never applies. The location is reported as NaN and the code snippet is empty. The length uses `error.token.endOffset ? ... : 0`, which only works by accident.
- **Failure scenario:** A file containing `timeline "main" in "#app" using raf {\n  at 0s..5s f(\n` fails with ``Parse Error: Expecting token of type ')' but found ``.  at NaN:NaN`` and no source context. Editors or consumers that use `location.line` get NaN.

**Evidence**

```
line: error.token.startLine ?? 1,
column: error.token.startColumn ?? 1,
length: error.token.endOffset ? error.token.endOffset - error.token.startOffset : 0,
```

**Fix:** Check `Number.isFinite(error.token.startOffset)`. When it is NaN, use `error.previousToken` (its endLine/endColumn, as Langium's DefaultDocumentValidator does), or fall back to the last line/column of `document.textDocument`. Compute the length from offsets only when both are finite. In the validation branch, compute the length as `document.textDocument.offsetAt(range.end) - offsetAt(range.start)`, clamped to >= 0.

Verifier: document-errors.ts:61-63 uses `?? 1` on Chevrotain token positions. The Chevrotain EOF token (chevrotain@12) has NaN positions, and NaN is not nullish, so the fallback never applies. Langium 4.2.4's DefaultDocumentValidator (document-validator.js:83) handles exactly this case with `isNaN(token.startOffset)` plus a previousToken fallback; this module does not. Running the built dist/index.cjs compile() on `timeline "main" in "#app" using raf {\n  at 0s..5s f(\n` failed with location `{line:NaN, column:NaN, length:0}` (JSON printed the NaNs as null) and the message "Expecting token of type ')' but found ``.". The length only comes out as 0 because NaN is falsy. The validation branch's single-line length calculation can also go negative or be wrong for multi-line ranges.

### Constant evaluator rejects the grammar's `**` operator, so valid constant expressions are not folded and constant conditions are rejected

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/expression-evaluator.ts:244](../../packages/language/src/compiler/expression-evaluator.ts#L244)
- **Category:** inconsistency
- **Description:** The grammar defines `**` in Multiplicative, and expression-transformer.ts handles it (`left ** right`), but applyBinaryOperator has no case for it. `const powv = 2 ** 3` is therefore not a constant and falls back to a globaldata variable. In if-conditions, evaluateExpression fails, so condition-transformer reports that `**` is unsupported 'unless both sides are constants', even though both sides are constants.
- **Failure scenario:** `action a() [ if (2 ** 3 > 5) { setElementContent("big") } ]` fails with 'Transform Error (InvalidExpression): Operator `**` is not supported in conditions unless both sides are constants'. `const powv = 2 ** 3` is emitted as a setData init action (`'globaldata.powv': 8`) instead of being inlined.

**Evidence**

```
default:
  throw new Error(`Unsupported binary operator: ${op}`);
```

**Fix:** Add `case '**': return (left as number) ** (right as number);` to applyBinaryOperator, with numeric-operand checks consistent with the other arithmetic operators. Add a test that every BinaryExpression operator in the grammar is handled by both the evaluator and expression-transformer.

Verifier: The grammar (eligian.langium:663) allows `**` in Multiplicative, and expression-transformer.ts:186 handles it. applyBinaryOperator in expression-evaluator.ts has no `**` case and throws 'Unsupported binary operator'. Verified with the built compiler: `const powv = 2 ** 3` is emitted as a setData init action (`'globaldata.powv': 8`) and referenced as `$globaldata.powv`, while `2 * 3` is inlined. `if (2 ** 3 > 5)` fails with "Operator `**` is not supported in conditions unless both sides are constants", even though both sides are constants. The const case still works at runtime, so that half is a missed optimization. The condition case rejects a valid program with a misleading message.

### Errors raised for imported library actions are reported with no file and are rendered against the main source

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/source-location.ts:14](../../packages/language/src/compiler/transformers/source-location.ts#L14)
- **Category:** bug
- **Description:** getSourceLocation always sets `file: undefined`. Errors raised while transforming actions that came from an imported library carry the library file's line and column, but formatError/extractCodeSnippet in error-reporter.ts use the main program's text. The snippet and 'at line:col' therefore point at unrelated code.
- **Failure scenario:** badlib.eligian line 5 contains `notARealOperation(selector)`. The main file imports `bad` and calls it on line 5. The CLI prints 'Unknown operation: "notARealOperation" at 5:3', with the main file's line `at 0s..2s bad("#a")` as the snippet and a caret under it. Nothing names badlib.eligian.

**Evidence**

```
return {
  file: undefined,
  line: cstNode.range.start.line + 1,
  column: cstNode.range.start.character + 1,
```

**Fix:** In getSourceLocation, set `file: AstUtils.getDocument(node)?.uri.fsPath`, guarding nodes that have no document. In error-reporter, build the snippet only when `location.file` is undefined or equals the main source's path; otherwise read that file or omit the snippet. Consider also validating library documents during compile, so these errors surface as library validation errors with the file in the hint.

Verifier: source-location.ts always sets `file: undefined`. Library documents are built with `validation:false` (library-loader.ts parseLibraryDocument) and only the main document is validated, so errors in imported library actions first appear at transform time, each carrying the library node's line and column. Reproduced with the built compiler. The main file had `import { bad } from "./badlib.eligian"` and a call to `bad("#app")`, and the library had notARealOperation on line 10. The result was TransformError 'Unknown operation: "notARealOperation"...' at `{line:10, column:3}`, with no file and nothing naming badlib.eligian. The location length was also NaN/null there. error-reporter's extractCodeSnippet uses the main sourceCode, so the snippet is either empty or points at an unrelated line of the main file.

### compile() ignores assets.errors, relying on a validator that skips asset checks for paths containing '/memory/'

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/pipeline.ts:127](../../packages/language/src/compiler/pipeline.ts#L127)
- **Category:** robustness
- **Description:** loadProgramAssets collects missing-file errors, CSS/HTML syntax errors and locales-schema errors into `result.errors`, but compile() only reads layoutTemplate, cssFiles and locales from the result. Reporting those errors is left entirely to asset-import-validator.checkAssetLoading, which returns early when the file name matches `/^\d+\.eligian$/` or the path includes '/memory/'. Such files then compile with the assets silently dropped.
- **Failure scenario:** A real project at /home/u/memory/talk/main.eligian (or a file named 1.eligian) imports `styles "./typo.css"` or an invalid locales file. Validation is skipped, assets.errors is ignored, and the output has `cssFiles: []` or `locales: undefined` with exit 0.

**Evidence**

```
if (options.sourceUri) {
  assets = loadProgramAssets(validatedProgram, options.sourceUri);
}
```

**Fix:** In compile(), when `assets.errors.length > 0`, fail with a tagged ValidationError carrying each error's message, hint and sourceLocation, so the CLI result no longer depends on the validator. Separately, replace the path heuristic in asset-import-validator with an explicit opt-out (for example a URI scheme, or a flag set by the test helpers) instead of file-name matching. Leave the CSS path alone; it is already guarded.

Verifier: pipeline.ts:126-131 passes `assets` to transformAST and never reads `assets.errors`. The only place those errors become diagnostics is AssetImportValidator.checkAssetLoading (validators/program/asset-import-validator.ts:75), which returns early when the file name matches `/^\d+\.eligian$/` or the path contains '/memory/'. The file-name test is not exotic: chapter-numbered files such as `01.eligian` or `2.eligian` match it. One correction to the scenario: a missing or broken CSS file is still caught, because parseSource writes the read error into CSSRegistry and validateCSSFileErrors reports it without the path heuristic. What does slip through is a missing or invalid layout HTML, a locales file that is missing or fails the schema, and errors on named HTML/CSS imports. The compile then succeeds with the default layout or `locales: undefined`. checkAssetLoading also drops any error whose filePath does not exactly match an import's `path`, and it swallows exceptions, so the gap is bigger than the heuristic alone.

### Comment says local actions override imported ones, but findActionByName returns the imported action first

- **Status:** ✅ Already fixed by `65fdd0f` (regression test added in `c7a75df`)

- **Location:** [packages/language/src/compiler/ast-transformer.ts:159](../../packages/language/src/compiler/ast-transformer.ts#L159)
- **Category:** inconsistency
- **Description:** actionDefinitions is `[...importedActions, ...localActions]`, and every consumer calls `findActionByName(name, allActions)`, which uses Array.find and so returns the first match. If an imported (aliased) action and a local action ever share a name, the imported one wins, the opposite of what the comment says. `actionDefinitions` and the emitted `actions` would also both contain duplicates. Only the validator prevents this.
- **Failure scenario:** If validation is bypassed or has a gap (for example an alias equal to a local action name in an edge case), `at 0s..2s fade()` binds to the library action's body while the user expects their local definition.

**Evidence**

```
// This ensures local actions can override imported ones if there are name conflicts
const actionDefinitions = [...importedActions, ...localActions];
```

**Fix:** During the merge, build a name-keyed map. Put local actions first, then explicitly imported (aliased) ones, then transitive library actions. Fail with a TransformError on a duplicate between a local action and an imported one. Longer term, keep transitive or private library actions out of the main program's name space (for example by name-mangling them, or resolving them only within their library), and fix the comment.

Verifier: The reviewer's scenario is guarded: ImportNameCollisionValidator.checkImportNameCollisions flags both an alias and a plain import name that collide with a local action. There is a real gap through another route, though. resolveLibraryImports (transformers/library-imports.ts:155-159) pushes all actions of each transitively imported library, private ones included, under their original names, and no validator compares those names with the main program's local actions. Example: main imports `{ a }` from libA, libA imports from libB, which defines `show`, and main also defines a local `show`. Then actionDefinitions = [libB.show, a, local show]. findActionByName (name-resolver.ts:69, Array.find) in timeline-transformer.ts:186/299/577 and operation-transformer.ts:301 returns libB's `show`, the opposite of what the comment claims. The emitted `actions` array also holds two actions named `show`, so lookup by name at runtime is ambiguous too. Validation passes because the local `show` resolves in scope. Silently binding to the wrong body justifies a higher severity than low.

### Transitive library resolution is import-order dependent: missing actions or duplicate action definitions

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/library-imports.ts:36](../../packages/language/src/compiler/transformers/library-imports.ts#L36)
- **Category:** bug
- **Description:** The `visited` set is a cycle guard, but resolveLibraryDocument returns undefined for any already-visited library. That also suppresses the 'add ALL actions of nested library' step in resolveLibraryImports, so which actions end up in the compile set depends on the order of the import statements. If a program first imports `{c}` from L and then `{b}` from M (M imports `{c,d}` from L, and `b` calls both), L is already marked visited, so M's transitive step skips L and `d` is never collected. If the order is reversed, L's actions arrive through M, and the explicit `{c}` import then pushes `c` a second time. The program ends up with two `c` actions with different UUIDs.
- **Failure scenario:** animations.eligian defines c and d. other.eligian does `import {c,d} from animations` and defines `b`, which calls c and d. Program A, `import {c} from animations; import {b} from other`, fails with `Unknown operation: "d"`. Program B has the same imports in the opposite order and compiles, but config.actions is ['c','d','b','c'], with the same name twice and two different ids. Reproduced.

**Evidence**

```
if (visited.has(libraryUri.fsPath)) {
  return undefined;
}
...
importedActions.push(...nestedActions);  // resolveImports
...
importedActions.push(actionDef);          // explicit import, no dedupe
```

**Fix:** Replace the shared `visited` set with an in-progress stack (the cycle guard) plus a `Map<fsPath, ActionDefinition[]>` cache of each library's collected actions. Collect each library's actions once and reuse the cached list on later imports. Before transformActionDefinition runs, dedupe the final list by ActionDefinition node identity, keeping aliased copies distinct by alias name.

Verifier: `visited` serves both as a cycle guard and as an 'already collected' marker. resolveLibraryDocument returns undefined for any visited path, so the nested 'push ALL actions' step is skipped, and the explicit-import loop has no dedupe. Reproduced with libraries loaded into `getOrCreateServices()` (the singleton that resolveLibraryDocument uses). The order `import {c} from animations; import {b} from other` fails with `Unknown operation: "d"`. The reversed order compiles, but config.actions is [c, d, b, c] with two distinct UUIDs for c. Severity lowered to medium: the missing-action case is a loud compile error with a workaround (reorder the imports), and the duplicate case only emits a redundant action with the same name and body.

### Operations inside an endable action's end block (and inside if/for in any end block) use startAction instead of endAction

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/action-transformer.ts:69](../../packages/language/src/compiler/transformers/action-transformer.ts#L69)
- **Category:** inconsistency
- **Description:** transformActionDefinition passes `false` for isEndOperation when it transforms an endable action's endOperations. The inline timeline form (timeline-transformer.ts:560) and inline stagger form (timeline-transformer.ts:389) pass `true`. In addition, transformIfStatement and transformForStatement hard-code `false` for their nested statements and have no parameter to carry the flag. So an endable-action call placed inside `if`/`for` in an end block is also expanded to startAction, in the inline timeline and stagger forms too. The end phase therefore restarts the nested endable action instead of ending it, and the nested effect is never reverted.
- **Failure scenario:** `endable action inner(sel)[selectElement(sel) addClass("a")][selectElement(sel) removeClass("a")]`, then `endable action outer(sel)[selectElement(sel)][inner(sel)]`. outer's endOperations compile to requestAction{inner} + `startAction` where endAction is expected. Likewise `at 0s..2s [ ... ] [ if (cond) { inner("#a") } ]` emits `when`, requestAction, `startAction`, `endWhen` in the end ops. Reproduced.

**Evidence**

```
for (const opStmt of actionDef.endOperations) {
  const ops = yield* transformOperationStatement(
    opStmt,
    actionScope,
    false,  // <- isEndOperation
    ...
// operation-transformer.ts: transformOperationStatement(thenOp, thenScope, false, program, allActions)
```

**Fix:** Pass `true` for endOperations in transformActionDefinition. Add an `isEndOperation` parameter to transformIfStatement and transformForStatement (both then/else branches and the loop body) and forward it from transformOperationStatement's IfStatement/ForStatement cases. Add tests for a nested endable call in an action end block, and for one inside if/for in timeline and stagger end blocks.

Verifier: action-transformer.ts:69-76 passes `false` for isEndOperation on endOperations. transformIfStatement and transformForStatement (operation-transformer.ts) call transformOperationStatement with a hard-coded `false` and have no flag parameter. Both cases reproduced: outer's endOperations are [requestAction, startAction], and the end block of an inline timeline gives [requestAction, endAction] for a direct call but [when, requestAction, startAction, endWhen] inside an if. The inline timeline/stagger forms pass true for direct calls, so the behaviour is inconsistent. Lowered to medium: it requires an endable action called from an end block, which is a fairly niche pattern.

### Event actions cannot call imported (library) actions; error is a misleading 'Unknown operation'

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/action-transformer.ts:166](../../packages/language/src/compiler/transformers/action-transformer.ts#L166)
- **Category:** bug
- **Description:** transformEventAction takes no allActions parameter and passes `undefined, undefined` for program and allActions. transformOperationStatement then falls back to looking only at the local Program's action elements, so imported actions are never searched. ast-transformer.ts:194 also does not pass the merged action list. The validator accepts the call, so the failure only appears at transform time.
- **Failure scenario:** The library defines `action lf(selector: string)`. The program has `import { lf } from "./animations.eligian"` and `on event "language-change" action handler(a) [ lf(a) ]`. Validation reports no errors, then transformAST fails with `Unknown operation: "lf". Did you mean: log, calc?`. The same call from a normal action or a timeline works. Reproduced.

**Evidence**

```
const operationIRs = yield* transformOperationStatement(
  opStmt,
  eventActionScope,
  false,
  undefined,
  undefined
);
// ast-transformer.ts:194  yield* transformEventAction(eventActionDef, constantMap)
```

**Fix:** Add an optional `allActions?: ActionDefinition[]` parameter to transformEventAction, keeping the defaulted signature for the public test API, and forward it to transformOperationStatement. In transformAST, pass `actionDefinitions` (and `program`). Add an integration test for an event action calling an imported action.

Verifier: transformEventAction calls `transformOperationStatement(opStmt, scope, false, undefined, undefined)`. With allActions undefined, findActionByName falls back to the local Program's elements, which never include imported actions, and ast-transformer.ts:194 does not pass actionDefinitions. Reproduced: `import { lf } from "./animations.eligian"` + `on event "language-change" action handler(a: string) [ lf(a) ]` validates without errors and then fails at transform with `Unknown operation: "lf". Did you mean: log, calc?`. The same lf call in the timeline of that program compiles.

### Arithmetic on runtime references is emitted as an inert expression string instead of failing

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/expression-transformer.ts:203](../../packages/language/src/compiler/transformers/expression-transformer.ts#L203)
- **Category:** bug
- **Description:** When a BinaryExpression has a non-number side (a reference string), the transformer serializes it as the literal string `("$operationdata.x" + 10)`. Eligius resolves only whole-string property chains (`$operationdata.…`, `$scope.…`), so this string is passed to the operation verbatim, and nothing in the compiler or validator flags it. Division by zero (`10 / 0`) folds to Infinity, which JSON serializes as `null`.
- **Failure scenario:** `action ff(x: number)[selectElement("#a") animate({left: x + 10}, 500)]` compiles to `animationProperties: {"left": "(\"$operationdata.x\" + 10)"}`. The animation receives a meaningless string at runtime and no diagnostic is produced. `setData({c: 10/0})` emits `null`. Reproduced.

**Evidence**

```
// Otherwise, serialize as expression string
return `(${JSON.stringify(left)} ${expr.op} ${JSON.stringify(right)})`;
```

**Fix:** In the BinaryExpression case, if either side is not a number, return Effect.fail with a TransformError (kind 'InvalidExpression', location `getSourceLocation(expr)`) saying that arithmetic on runtime values is not supported and that calc/setVariable should be used. Also fail when the folded number is not finite. Ideally add a matching validator diagnostic so the IDE shows it before compiling.

Verifier: In expression-transformer.ts lines 173-204, both sides are folded only when they are numbers; otherwise the code returns the literal string `` `(${JSON.stringify(left)} op ${JSON.stringify(right)})` ``. Operation arguments use this path (operation-transformer.ts:148/271/326, timeline-transformer.ts:209/325). Conditions do not: they go through condition-transformer.ts serializeCondition, which emits Eligius `when` expression syntax, so `if` is unaffected. Eligius resolve-external-property-chain treats a value as a chain only when it starts with `$operationdata.`/`$globaldata.`/`$scope.`, so a string starting with '(' is passed to the operation as-is. No validator or Typir rule mentions BinaryExpression. For division by zero, expression-evaluator.ts throws on `/` by zero, but transformExpression does not use it, so `10/0` folds to Infinity and is emitted as null. condition-transformer.ts:174 already has an isFinite guard, which shows the gap is unintended.

### Property-chain in a time expression throws a raw Error out of the Effect pipeline

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/time-transformer.ts:104](../../packages/language/src/compiler/transformers/time-transformer.ts#L104)
- **Category:** robustness
- **Description:** The grammar allows PropertyChainReference as a PrimaryTime, and transformTimeExpression turns it into a `variable` node. evaluateTimeExpression then does `throw new Error(...)`. It is called synchronously inside Effect.gen from transformTimedEvent, transformSequenceBlock and transformStaggerBlock, and from convertTimelineActionToEligius, so the throw becomes a defect (a fiber crash) instead of a TransformError. Only navigate-operations wraps it in Effect.try. The validator does not reject the input.
- **Failure scenario:** `timeline "T" in ".c" using raf { at $scope.x..2s someAction() }`. The Effect rejects with `Error: Variables not yet supported in time expressions: $scope.x`. The CLI/LSP gets an untyped crash instead of a diagnostic with a location. Reproduced.

**Evidence**

```
case 'variable':
  // TODO: Variable support requires a symbol table/environment
  throw new Error(`Variables not yet supported in time expressions: ${expr.name}`);
```

**Fix:** Simplest fix: in transformTimeExpression's 'PropertyChainReference' case, return Effect.fail with a TransformError (kind 'InvalidExpression', location `getSourceLocation(expr)`) saying property references are not supported in time expressions. Add a validator for a TimeExpression that contains a PropertyChainReference, so the IDE reports it. Optionally have evaluateTimeExpression return `Effect<number, TransformError>` so callers can no longer throw.

Verifier: The grammar's PrimaryTime includes PropertyChainReference (eligian.langium:607-611), and transformTimeExpression maps it to `{kind:'variable'}` (time-transformer.ts:41-49). evaluateTimeExpression throws a raw Error for 'variable'. It is called synchronously, with no Effect.try, inside Effect.gen at timeline-transformer.ts:79/98/115/177/270/274/539/540 and config-builder.ts:274/278, so the throw becomes a defect rather than a TransformError. Only navigate-operations.ts:64 wraps it in Effect.try. The validators checkValidTimeRange and checkNonNegativeTimes inspect only TimeLiteral nodes and never reject PropertyChainReference. The CLI's runPromiseExit and try/catch keep the process from crashing, but the user gets a generic error with no source location.

### navigate broadcasts the timeline NAME, but the engine switches by uri; video/audio timelines are never reached

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/compiler/transformers/navigate-operations.ts:117](../../packages/language/src/compiler/transformers/navigate-operations.ts#L117)
- **Category:** bug
- **Description:** buildNavTargetAction puts the DSL target (a timeline name) into the `request-timeline-uri` eventArgs, and the engine calls `switchTimeline(uri, position)`. buildTimelineConfig sets `uri = provider === 'raf' ? timeline.name : timeline.source || timeline.name`, so for video/audio timelines the uri is the media source path. The navigate validator only checks that the name exists, so navigating to a media timeline compiles cleanly but is a no-op or an error at runtime.
- **Failure scenario:** `timeline "Clip" in ".c" using video from "./c.mp4" {...}` plus `on click "#a" navigate "Clip"` in the hub. The compiled nav action has eventArgs `["Clip",0]`, while the timeline's uri is `"./c.mp4"`. Reproduced.

**Evidence**

```
operationData: { eventName: REQUEST_TIMELINE_URI, eventArgs: [target, position] }
// timeline-transformer.ts: const uri = timeline.provider === 'raf' ? timeline.name : timeline.source || timeline.name;
```

**Fix:** When expanding navigate (in ast-transformer and in the operation-transformer call site), resolve the target name to its Timeline node and compute the uri with the same expression as timeline-transformer.ts:131, extracted into a shared helper such as `timelineUri(timeline)`. Put that uri in eventArgs, and base the synthetic name and dedupe key on it, or keep the name keyed on the target but broadcast the resolved uri.

Verifier: buildNavTargetAction broadcasts eventArgs `[target, position]`, where target is the DSL timeline name. In Eligius, engine-eventbus-adapter.ts:168-172 calls `switchTimeline(uri, position)`, and eligius-engine.ts:728 looks the timeline up in `_timelineLookupCache`, which is keyed by `timelineInfo.uri` (line 1347). It rejects with an unknown-timeline error when there is no match. timeline-transformer.ts:131 sets uri = name only for 'raf'; for video/audio timelines with a source, uri = source. navigate-validator.ts only checks that a timeline with that name exists. So navigating to a media timeline compiles without errors and fails at runtime.

### Library files that import other libraries get false 'Unknown operation' errors and no argument-count checking when calling the imported action

- **Status:** ✅ Already fixed by `65fdd0f` (regression test added in `c7a75df`)

- **Location:** [packages/language/src/validators/operation-call/operation-existence-validator.ts:55](../../packages/language/src/validators/operation-call/operation-existence-validator.ts#L55)
- **Category:** bug
- **Description:** Feature 032 US3 allows libraries to import other libraries, but the imported-action lookup is gated on `program && this.services`. Inside a Library, `getProgram()` is undefined, so only `library.actions` is searched. The scope provider's Library branch also exposes only `model.actions`. A call to an imported action in a library is therefore unresolved, falls through to validateOperationExists, and is reported as an unknown operation. ParameterValidator.checkParameterCount has the same gap and silently skips arity validation for these calls. Reproduced.
- **Failure scenario:** b.eligian: `library b action x() [...]`. a.eligian: `library a import { x } from "./b.eligian" action y() [ x() ]`. Result: the error 'Unknown operation: "x". Did you mean: log?' on a.eligian. Calling `x()` with the wrong argument count is not reported either.

**Evidence**

```
if (program && this.services) {
      const scopeProvider = this.services.references.ScopeProvider as EligianScopeProvider;
      const importedActions = scopeProvider.getImportedActions(program);
```

**Fix:** Use the document root (Program or Library) instead of `getProgram()` when calling `scopeProvider.getImportedActions` in OperationExistenceValidator, ParameterValidator.checkParameterCount and checkTimelineOperationCall. Extend the scope provider's Library branch so getScopeForActionReference also exposes imported actions, so the cross-reference resolves too.

Verifier: The grammar allows `'library' name=ID (imports += LibraryImport)* ...` (eligian.langium:59-60), and spec 032 User Story 3 explicitly supports nested library imports. Reproduced with two documents. lb.eligian: `library b action x()`. la.eligian: `library a import { x } from "./lb.eligian" action y() [ x() ] action z() [ x(1,2,3) ]`. la.eligian got 'Unknown operation: "x". Did you mean: log?' twice and no arity error for `x(1,2,3)`. This matches the reviewer's analysis: the imported-action lookup in operation-existence-validator.ts is gated on a Program root. A specified feature gives false errors that block the library, so medium is right.

### No duplicate-name validation for timelines or event actions, and event actions can collide with actions or operations

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/validators/program/duplicate-validator.ts:21](../../packages/language/src/validators/program/duplicate-validator.ts#L21)
- **Category:** bug
- **Description:** checkDuplicateActions only considers Regular/EndableActionDefinition. No check exists for duplicate timeline names, even though navigate targets and Eligius timeline URIs are identified by name. EventActionDefinition has its own `name` but is excluded from checkDuplicateActions, and checkActionNameCollision (the built-in operation clash) is not registered for it. checkDuplicateEventActions only looks at event/topic signatures. Reproduced: no diagnostic is produced.
- **Failure scenario:** Two `timeline "t" in ".c" using raf {...}` blocks, `on event "x" action foo(...)` twice, `on event "x" action foo()` alongside `action foo()`, or an event action named `selectElement` all validate with no error. The compiled config then has ambiguous timeline URIs or duplicate action names, and `navigate "t"` picks an arbitrary timeline.

**Evidence**

```
const actions = getElements(program).filter(
      (element): element is RegularActionDefinition | EndableActionDefinition =>
        element.$type === 'RegularActionDefinition' || element.$type === 'EndableActionDefinition'
    );
```

**Fix:** Add a checkDuplicateTimelines program check (code `duplicate_timeline`) that reports every timeline after the first one with the same name. For event actions, add duplicate-name detection, and treat a collision with a regular action name as at least a warning. Applying the built-in collision check to event actions is optional, since they cannot be called.

Verifier: duplicate-validator.ts only checks Regular/Endable action names, constants and event/topic signatures. Each case reproduced: two `timeline "t"` blocks give no duplicate diagnostic, two `on event ... action foo()` give none, `action foo()` plus `on event "x" action foo()` give none, and an event action named `selectElement` gives no built-in conflict. The timeline part matters most. The grammar has a NavigateStatement (`navigate "Timeline name"`, eligian.langium:433-452) that targets timelines by name, so duplicate names make navigation ambiguous with no warning. The event-action parts are weaker: event actions go into a separate eventActions[] array and cannot be called as operations, so a clash with a built-in name has little effect. The timeline case justifies medium; the event-action cases on their own would be low.

### Duplicate parameter names are not validated for regular/endable actions

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/validators/action-validator.ts:1](../../packages/language/src/validators/action-validator.ts#L1)
- **Category:** bug
- **Description:** EventActionValidator.checkEventActionParameters reports duplicate and reserved parameter names, but RegularActionDefinition/EndableActionDefinition have no equivalent check. ParameterReference resolves by name, so the second parameter is silently shadowed. Reproduced: `action a(x: string, x: number)` and `action a(x, x)` produce no diagnostics.
- **Failure scenario:** `action a(x, x) [ selectElement(x) ]` validates cleanly. Callers pass two arguments, but both references in the body bind to one of them, so the compiled operationData mapping is wrong or ambiguous.

**Evidence**

```
RegularActionDefinition: [
      v.action.checkActionNameCollision,
      v.action.checkRecursiveActionCalls,
      v.action.checkControlFlowPairing,
      v.action.checkErasedPropertiesInAction,
      v.action.checkPrivateOnlyInLibraries,
    ],
```

**Fix:** Move the duplicate/reserved-name parameter logic out of EventActionValidator into a shared helper (for example on BaseValidator, which already has reportDuplicatesByName). Register it for RegularActionDefinition and EndableActionDefinition, reporting 'duplicate_parameter' on the later Parameter node with property 'name'.

Verifier: The RegularActionDefinition/EndableActionDefinition checks (eligian-validator.ts:157-172) contain nothing that looks at parameter names. The only duplicate-parameter check in the language package is EventActionValidator.checkEventActionParameters (event-action-validator.ts:89-96), and it is registered only for EventActionDefinition. Typir (eligian-type-system.ts) and program/duplicate-validator.ts do not check parameters, and Langium has no built-in duplicate-name check. The scope for ParameterReference is `createScopeForNodes(container.parameters)` (eligian-scope-provider.ts:260-279), so both references bind to the same Parameter. action-transformer maps actionParameters by `p.name`, so the two collapse into one operationData key. This is a silent miscompile.

### Control-flow pairing and erased-property checks are not applied to event actions or stagger inline blocks

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian-validator.ts:193](../../packages/language/src/eligian-validator.ts#L193)
- **Category:** bug
- **Description:** checkControlFlowPairing* and checkErasedProperties* are registered for RegularActionDefinition, EndableActionDefinition and InlineEndableAction only. EventActionDefinition (operations) and StaggerBlock (startOps/endOps) get neither check. The same raw `when(...)` without `endWhen` is reported in a regular action but passes silently here. Reproduced.
- **Failure scenario:** `on event "language-change" action hh(l) [ when(@@currentItem) ]` and `stagger 1s [".a"] for 1s [ when(@@currentItem) ] [ ]` validate with no errors. The emitted Eligius config contains an unclosed `when`, which breaks the runtime operation list.

**Evidence**

```
EventActionDefinition: [
      v.eventAction.checkEventActionDefinition,
      v.eventAction.checkEventActionParameters,
      v.eventAction.checkEventNameExists,
      v.eventAction.checkEventArgumentCount,
      v.eventAction.checkEventTypeCompatibility,
    ],
```

**Fix:** Add checkControlFlowPairingInEventAction (operations), checkControlFlowPairingInStaggerStart/End (startOps/endOps) and the matching erased-property wrappers, and register them under EventActionDefinition and StaggerBlock. validateOperationSequence's `context` parameter type must be widened to include EventActionDefinition and StaggerBlock. For StaggerBlock, guard the 'with actionCall' alternative, where startOps/endOps are empty.

Verifier: In eligian-validator.ts the control-flow pairing and erased-property checks are registered only for RegularActionDefinition, EndableActionDefinition and InlineEndableAction (lines 157-178). EventActionDefinition (lines 193-199) gets only event-specific checks, and StaggerBlock (grammar lines 579-581, startOps/endOps) is not registered at all. validateControlFlowPairing and OperationDataTracker are used nowhere else outside tests, and the compiler pipeline does not run pairing validation. 'when' is a real registry operation (registry.generated.ts:2177), so a raw `when()` resolves and passes. An unclosed raw when/forEach in an event action or in an inline stagger block is therefore not reported.

### Recursion detection identifies actions by name, giving false positives across files and aliases

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/validators/action-validator.ts:94](../../packages/language/src/validators/action-validator.ts#L94)
- **Category:** bug
- **Description:** The call chain and the visited set hold names, mixing `action.name` (the definition name) with `opCall.operationName.$refText` (the alias at the call site). Different actions that share a name, such as a local action and a private action in an imported library, are treated as the same node. Aliased imports are keyed inconsistently, so `visited` pruning does not match. When a cycle is found, `accept` is also called with a node from another document, so the diagnostic range comes from a different file's CST. The name-collision false positive was reproduced.
- **Failure scenario:** lib.eligian: `private action init()` and `action helper() [ init() ]`. main.eligian: `import { helper } from "./lib.eligian"` and `action init() [ helper() ]`. main reports 'Recursive action call detected: init creates an infinite loop' on a node inside lib.eligian, although there is no cycle.

**Evidence**

```
const calledActionName = opCall.operationName.$refText;

        // Check if this action is already in our call chain (cycle detected!)
        if (chain.includes(calledActionName)) {
```

**Fix:** Track identity, not names. Use `chain: ActionDefinition[]` (or a Set) and `visited: Set<ActionDefinition>`, compare actionRef nodes, and build the message from node names. Only report when the cycle closes back to the root action, or report on the root action's own call node (the first-hop OperationCall in the current document) instead of a node from another document.

Verifier: checkRecursiveActionCalls keys the chain and the visited set by string: `$refText` at call sites (line 91) and `currentAction.name` (line 113). The scope provider resolves an imported action call in a Program to the ActionDefinition node in the library document (getScopeForActionReference plus createDescription with actionDoc). A library's own OperationCall scope contains only `library.actions`, so lib's `init()` resolves to lib's private init. In the scenario, main's init → helper (lib node) → lib init: 'init' is found in the chain, so a bogus recursive_action_call is reported. `accept` receives an opCall from lib's AST, so the diagnostic is attached to main's document using a range computed from lib's CST. The compiler also runs validation, so this can block compilation. Aliases only affect visited-set pruning (alias vs definition name), not correctness, since a library cannot call back into the importing program.

### Contradictory and duplicate diagnostics: Langium start<=end rule vs Typir end>start rule, plus double-reported errors

- **Status:** ✅ Already fixed by `65fdd0f` (regression test added in `c7a75df`)

- **Location:** [packages/language/src/validators/timeline-validator.ts:155](../../packages/language/src/validators/timeline-validator.ts#L155)
- **Category:** inconsistency
- **Description:** checkValidTimeRange allows equal start and end ('must be less than or equal to'), and its test accepts `at 5s..5s`. The Typir rule in type-system-typir/validation/event-validation.ts errors when `endTime <= startTime`. The two checks disagree, and every invalid range is reported twice on the same node. checkNonNegativeTimes is dead code, since the NUMBER terminal cannot be negative and a unary minus is a parse error.
- **Failure scenario:** `at 2s..1s a()` shows two errors on one line: 'start time (2) must be less than or equal to end time (1)' and 'end time (1s) must be greater than start time (2s)'. `at 5s..5s a()` is accepted by the Langium rule and rejected by Typir. With a partial `at 0s.. [...]`, Typir adds a false 'end time (0s) must be greater than start time (0s)'.

**Evidence**

```
`Timeline event start time (${start.value}) must be less than or equal to end time (${end.value})`
```

**Fix:** Remove checkValidTimeRange and checkNonNegativeTimes from the Langium TimelineEvent registration (eligian-validator.ts:134). Keep a single unit-aware rule, and fix extractTimeValue to convert m (x60) and h (x3600). Pick one definition of zero-length events and align the test with it. Skip the check when `timeRange.start` or `timeRange.end` is missing, or is a type the rule cannot evaluate (RelativeTimeLiteral, PropertyChainReference), instead of treating it as 0. Add a mixed-unit test (`at 500ms..2s` must produce no errors).

Verifier: timeline-validator.ts:154-165 errors only when `start.value > end.value`, so equal values are accepted. validation.spec.ts:171-190 accepts `at 5s..5s`, but its filter only matches 'must be less than', which hides the Typir error. type-system-typir/validation/event-validation.ts:66 errors when `endTime <= startTime`, and Typir rules run through initializeLangiumTypirServices (eligian-module.ts:131). So the two rules disagree on zero-length events, and every reversed range is reported twice. checkNonNegativeTimes is dead: NUMBER is `/[0-9]+(\.[0-9]+)?/`, and the test at validation.spec.ts:192 says negative values are a parse error. extractTimeValue also returns 0 for a missing end, so a partial range gets a false 'end (0s) must be greater than start (0s)'. The reviewer missed a worse problem: the Langium rule compares the raw `value` and ignores `unit` (no value converter exists), so valid code such as `at 500ms..2s` gets a false 'start time (500) must be less than or equal to end time (2)' error. Typir's extractTimeValue also treats 'm' and 'h' as seconds. That false positive on valid mixed-unit ranges is why the severity was raised to medium.

### Action function types are matched by name only and are global across documents, so overloads from other files mask or change checks

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:426](../../packages/language/src/type-system-typir/eligian-type-system.ts#L426)
- **Category:** bug
- **Description:** `onNewAstNode` registers a function type for every action in every loaded document, including library and private actions. The call rule's `matching` compares only `getOperationCallName(call) === action.name` and never checks that `call.operationName.ref` is that action. Typir therefore treats same-named actions from different documents as overloads, and a call passes if any overload accepts it. Calls to aliased imports (`import { a as b }`) never match, because the function type is registered under `a`.
- **Failure scenario:** Verified. File b.eligian defines `action dup(n: number)`. File c.eligian defines `action dup(a: string)` and calls `dup(5)`. c shows no error, because b's overload accepts a number; the same file validated alone does error. Results depend on which other documents are loaded and in what order. With `import { show as display }`, `display(...)` is never type-checked, and a local `show(x: number)` is checked against the library's `show` overload.

**Evidence**

```
matching: (call: OperationCall) => {
          // Only match if the call name matches this action
          if (getOperationCallName(call) !== action.name) {
            return false;
          }
```

**Fix:** In the action call rule, match on the resolved cross-reference: `matching: call => call.operationName.ref === action && ...` (OperationCall.operationName is `[ActionDefinition:ID]`, and the scope provider resolves aliased imports to the library ActionDefinition). Linking finishes before validation, so `.ref` is available. Keep the stagger and in-action-body exclusions. Add tests for the cross-document, alias and local-shadowing cases.

Verifier: Reproduced with separate service instances per scenario. With c.eligian alone (`action dup(a: string)`, `dup(5)`), Typir reports the error. When b.eligian (`action dup(n: number)`) is loaded in the same workspace, in either order, the error disappears. `import { show as display }` followed by `display(5)` gives no type error, whereas an unaliased `show(5)` does. A local `show(x: number)` called as `show("a")` passes when a library defines `show(txt: string)`. The cause is that `matching` compares `getOperationCallName(call)` (`$refText`) with `action.name`, and onNewAstNode registers a function type for every action in every loaded document. In the IDE the whole workspace is loaded, so this happens in normal use.

### Timeline container selector regex rejects valid CSS selectors (non-ASCII identifiers, escapes, '/' in attribute values)

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/type-system-typir/validation/timeline-validation.ts:48](../../packages/language/src/type-system-typir/validation/timeline-validation.ts#L48)
- **Category:** bug
- **Description:** `isValidCSSSelector` accepts only an ASCII-limited character whitelist (`\w` is ASCII-only, and `/`, `\`, `%`, `@`, `{`, `&` are not allowed). Valid selectors that use non-ASCII identifier characters, backslash escapes (e.g. Tailwind `.sm\:flex`) or '/' or '%' in attribute values are reported as errors.
- **Failure scenario:** Verified. `timeline "T" in "a[href='/x']" using raf {...}` and `timeline "T" in "#café" using raf {...}` both give the error "Invalid CSS selector", although both selectors are valid. A program with a valid selector cannot compile.

**Evidence**

```
const cssSelectorPattern = /^[#.\w\-:[\]=~|^$*"'()\s,>+]+$/;
  return cssSelectorPattern.test(selector);
```

**Fix:** Delete Rule 2 from timeline-validation.ts, or replace the regex with `parseSelector(node.containerSelector).valid` from css/selector-parser.ts, so one real parser decides validity. The Langium validator only runs its parse when CSS is imported, so check whether it returns early before the parse; if it does, move the syntax check above that early return rather than keeping a regex.

Verifier: The pattern `/^[#.\w\-:[\]=~|^$*"'()\s,>+]+$/` uses ASCII `\w` and excludes '/', '\\', '%' and '@'. Reproduced with the CLI: `timeline "T" in "a[href='/x']" using raf {...}` fails with "Invalid CSS selector: 'a[href='/x']'". A diagnostics dump through createEligianServices on `#café` gave the same Typir error, 'Invalid CSS selector: '#café''. Both selectors are valid CSS. Typir errors are part of `document.diagnostics`, so compilation is blocked. The Langium validator `checkTimelineContainerSelector` (validators/timeline-validator.ts:90) already parses the same selector with the PostCSS-based `parseSelector` and reports 'Invalid CSS selector syntax' when it really is invalid. The regex check is therefore redundant as well as wrong.

### Transitively imported library actions leak into the importer's scope and can shadow explicitly imported actions

- **Status:** ✅ Already fixed by `65fdd0f` (regression test added in `c7a75df`)

- **Location:** [packages/language/src/eligian-scope-provider.ts:208](../../packages/language/src/eligian-scope-provider.ts#L208)
- **Category:** bug
- **Description:** computeImportedActions pushes the actions that a nested library imports (from its own imports) before the importing file's own imports. getScopeForActionReference and the validators then treat every one of them as callable from the program, although the program never imported them. Scope lookup returns the first description with a given name, so an action pulled in transitively wins over an explicitly imported action of the same name. The result depends on import order.
- **Failure scenario:** Library A does `import { bAct } from "./B.eligian"`. Library D defines its own `bAct(selector, x)`. The program does `import { pub } from "./A.eligian"`, then `import { bAct } from "./D.eligian"`, and calls `bAct("#box", 1)`. The call resolves to B.bAct, and the validator reports "Action 'bAct' expects 1 argument(s) but got 2". Swapping the two import lines resolves it to D.bAct with no error. Both reproduced. Separately, a program that imports only `pub` can call `bAct(...)` with no error at all, so encapsulation is not enforced.

**Evidence**

```
const nestedActions = this.getImportedActions(library, visited);
      importedActions.push(...nestedActions);

      // Add each imported action from THIS library to the list
      for (const actionImport of libraryImport.actions) {
```

**Fix:** Split the API into `getDirectlyImportedActions(model)`, which walks only the current document's `LibraryImport.actions` and yields one entry per import named `alias ?? original` (use it for scope, completion and validators), and the existing transitive getImportedActions, which stays for the compiler and emission. Also make checkImportNameCollisions ignore transitive entries.

Verifier: computeImportedActions (eligian-scope-provider.ts:208-209) pushes the nested library's transitive imports before that LibraryImport's direct imports. getScopeForActionReference passes this list to createScope, and Langium's StreamScope.getElement returns the first entry whose name matches, so a transitively pulled B.bAct ends up ahead of an explicitly imported D.bAct whenever the A import comes first. findImportedActionByNameOrAlias falls back to `importedActions.find(name)`, which is also first-wins, so the parameter-count validator checks against the wrong action. ProgramImportNameValidator.checkImportNameCollisions only looks at direct imports, so nothing flags the clash. A program that imports only `pub` can also call `bAct` without an error. The compiler's resolveImports/resolveLibraryImports in transformers/library-imports.ts deliberately includes transitive actions (all actions of nested libraries) so that `pub`'s body can be emitted. So the transitive closure is needed for emission, but it should not be in the program's visible scope. The bug is real but only triggers with same-named actions across a nested chain, so medium rather than high.

### `@var` references do not see consts declared in endable end blocks, inline endable blocks or event actions

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian-scope-provider.ts:368](../../packages/language/src/eligian-scope-provider.ts#L368)
- **Category:** bug
- **Description:** getVisibleVariables collects locals only when an ancestor satisfies `isActionDefinition`. EventActionDefinition and InlineEndableAction are not ActionDefinitions. For endable actions, getLocalVariables reads only `startOperations`, so consts in `endOperations` are never collected. The grammar allows VariableDeclaration in all of these OperationStatement lists.
- **Failure scenario:** An event action `on event "foo" action handler(x) [ const c = 1  setStyle({a: @c}) ]` gives `Could not resolve reference to VariableDeclaration named 'c'`. The same error appears for `endable action e [...] [ const c = 1  setStyle({a: @c}) ]` and for an inline `at 0s..2s [ const c = 1 setStyle({a: @c}) ] [ ... ]`. All three reproduced.

**Evidence**

```
if (isActionDefinition(current)) {
        const localVars = this.getLocalVariables(current);
...
    const operations = isActionDefinition(actionDef)
      ? 'startOperations' in actionDef
        ? actionDef.startOperations
        : actionDef.operations
      : [];
```

**Fix:** Replace the isActionDefinition gate with a lexical walk. For each ancestor statement list (operations, startOperations, endOperations, thenOps, elseOps, body, startOps, endOps, event action operations, inline endable blocks), collect the VariableDeclarations that come before the statement containing the reference. Inner lists shadow outer ones, and program globals come last.

Verifier: getVisibleVariables only collects locals when an ancestor matches isActionDefinition, and ActionDefinition is EndableActionDefinition | RegularActionDefinition (grammar line 312). EventActionDefinition (lines 270-275) and InlineEndableAction (lines 587-589) both contain OperationStatement lists that permit VariableDeclaration (lines 360-361), but neither is an ActionDefinition. For endable actions, getLocalVariables reads only startOperations, because `'startOperations' in actionDef` is true, so endOperations is never walked. No validator forbids const in these contexts (a grep of the validators shows no such guard), so `@c` stays unresolved in all three cases. Stagger startOps/endOps have the same gap.

### Local const scoping ignores block structure and declaration order, so references bind to the wrong declaration

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian-scope-provider.ts:414](../../packages/language/src/eligian-scope-provider.ts#L414)
- **Category:** bug
- **Description:** getLocalVariables gathers every VariableDeclaration anywhere in the enclosing action (recursively through if, else and for bodies), and the first one with a given name wins. Consts declared in a different branch or later in the action are therefore visible, and same-named consts in sibling blocks all bind to the first one.
- **Failure scenario:** `if (c) { const c = 1  setStyle({a: @c}) } else { const c = 2  setStyle({a: @c}) }`: both `@c` references resolve to the then-branch declaration (line 3), so the else branch binds to the wrong node, and type inference and go-to-definition are wrong. `if (...) { const c = 1 }  setStyle({a: @c})` and a use before the declaration (`setStyle({a: @c}) const c = 1`) both resolve with no unresolved-reference error. All reproduced.

**Evidence**

```
const collectVars = (nodes: AstNode[]): void => {
      for (const node of nodes) {
        if (isVariableDeclaration(node)) {
          variables.push(node);
        }
        // Recursively check children (for if statements, for loops, etc.)
```

**Fix:** Use the same lexical-visibility algorithm as the previous finding: only declarations in enclosing statement lists that come before the referencing statement are visible, nearest scope first. Optionally add a validator for use-before-declaration and for duplicate consts within one block.

Verifier: getLocalVariables walks the whole action recursively with streamContents, and getVisibleVariables keeps the first declaration for each name. So a const in a sibling else branch binds to the then-branch declaration, a const inside an if block is visible after the block, and a use before the declaration resolves. No duplicate-local validator exists: checkDuplicateConstants only covers program-level elements, and action-validator's VariableDeclaration branch is empty. At runtime `@c` is name-based (scope.variables), so the emitted JSON is mostly unaffected. The impact is wrong go-to-definition and rename, wrong Typir type inference (a const of a different type in each branch gives false type errors), and missing use-before-declaration diagnostics. Medium is a fair rating, leaning toward low.

### if/else branch property state is never merged back, producing false 'missing dependency' errors

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/validators/action-validator.ts:370](../../packages/language/src/validators/action-validator.ts#L370)
- **Category:** bug
- **Description:** validateOperationSequence validates thenOps and elseOps with cloned trackers and discards them. OperationDataTracker.merge (the intersection logic in operation-data-tracker.ts:155) exists but is never called. After an if/else in which both branches create a property, the outer tracker lacks that property.
- **Failure scenario:** `action t [ if (@@currentItem) { selectElement("#a") } else { selectElement("#b") }  addClass("x") ]` reports the error `Property 'selectedElement' is not available - ensure it is created by a previous operation` on addClass, although both branches create selectedElement. Reproduced. Valid code gets a blocking error.

**Evidence**

```
this.validateOperationSequence(statement.thenOps, accept, context, currentTracker.clone());
        this.validateOperationSequence(statement.elseOps, accept, context, currentTracker.clone());
```

**Fix:** Have validateOperationSequence return its final tracker. For an IfStatement, run the then branch and the else branch each on a clone. If there is an else, set currentTracker to thenResult merged with elseResult; if there is no else, merge thenResult with the pre-branch tracker. merge() only intersects availableProperties, so this is correct. Keep the For body as it is, because the body may run zero times. Add tests for clone/merge and for the if/else join.

Verifier: action-validator.ts:315-380 validates both IfStatement branches on `currentTracker.clone()` and throws the results away. OperationDataTracker.merge (operation-data-tracker.ts:155) has no call sites. In registry.generated.ts, addClass declares selectedElement as a dependency. Running the reviewer's program against the built language package (createEligianServices + EmptyFileSystem) reports "Property 'selectedElement' is not available - ensure it is created by a previous operation" on addClass, so the false error is real. Severity lowered to medium: it is a false positive in one narrow pattern (selecting inside both branches), and selecting before the if avoids it.

### Imports of libraries outside the loaded workspace never resolve in the IDE (no on-demand document loading)

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian-scope-provider.ts:198](../../packages/language/src/eligian-scope-provider.ts#L198)
- **Category:** robustness
- **Description:** Both getScopeForActionImport and computeImportedActions only use `LangiumDocuments.getDocument(uri)`, which returns a document only if it is already in the workspace (workspace folders plus open editors). Nothing loads a missing library on demand. The CLI/pipeline loader does load it (library-loader.ts adds the document). So a relative import pointing outside the workspace folders is an unresolved reference in the editor but compiles from the CLI. The reviewer could not check this in a live language server. It follows from Langium's default workspace manager loading only files in the workspace folders, and from the absence of any getOrCreateDocument call in the scope code.
- **Failure scenario:** The workspace folder is /proj/app, and the program does `import { x } from "../shared/lib.eligian"` (outside the folder, not open). Result: `Could not resolve reference to ActionDefinition named 'x'`, and the calls are reported as unknown, while `eligian compile` succeeds. The reviewer also claimed that a missing result stays cached in importedActionsCache until the next DocumentBuilder.onUpdate; the verifier refuted that claim.

**Evidence**

```
const libraryDoc = documents.getDocument(resolvedUri);

      if (!libraryDoc?.parseResult.value) continue;
```

**Fix:** Load imported libraries during the build, not in scope resolution. Options: hook `DocumentBuilder.onBuildPhase(DocumentState.Parsed/IndexedContent)`, or subclass DefaultWorkspaceManager / DocumentBuilder. Collect the LibraryImport paths from each built document and resolve them with resolveLibraryPath. For URIs not yet in LangiumDocuments, call `await LangiumDocuments.getOrCreateDocument(uri)` (it reads through FileSystemProvider), then `DocumentBuilder.update([uri], [])` so they get indexed and the importers are relinked. Keep the synchronous scope provider unchanged.

Verifier: The scope provider (computeImportedActions, getScopeForActionImport) and import-validator use only `LangiumDocuments.getDocument`. Nothing in language/src or extension/src defines a custom WorkspaceManager or loads documents on demand; only the CLI's library-loader does fromString + addDocument. With Langium's default workspace manager, a library outside the workspace folders is not loaded, and neither is any sibling file when VS Code opens a single file with no folder. The IDE then shows 'Library file not found' plus unresolved references, while the CLI compiles the same file. This was not checked in a live server. The caching sub-claim is refuted: importedActionsCache is a WorkspaceCache, which clears on every DocumentBuilder update, so a cached empty result cannot outlive a later load. The reviewer's suggested fix is also partly wrong: in Langium 4, getOrCreateDocument is async (it returns a Promise), so the synchronous scope provider cannot call it.

### findActionBelow ignores event actions and non-adjacent declarations, yielding wrong JSDoc templates; on-type formatter is untested and no-ops for unterminated /**

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/utils/ast-navigation.ts:59](../../packages/language/src/utils/ast-navigation.ts#L59)
- **Category:** bug
- **Description:** findActionBelow returns the first ActionDefinition anywhere at or after the next line. EventActionDefinition is not an ActionDefinition, and other statements (timeline, const) are skipped, so the template is built for an unrelated later action. Also, with an unterminated `/**` (the state right after typing it) the parse fails and the AST loses the actions, so formatDocumentOnType returns []. Existing tests call findActionBelow directly and never exercise EligianFormatter.formatDocumentOnType. The inserted lines are also not indented to the comment's column.
- **Failure scenario:** The text is `/** */`, then `on event "x" action handler(a) [...]`, then `action later(b: string) [...]`. formatDocumentOnType (cursor at 0:3) inserts `* @param {string} b`, the params of `later`, instead of `a` for the event action. Reproduced. With an unterminated `/**` above an action, the result is [].

**Evidence**

```
const actionOffset = item.$cstNode?.offset;
      if (actionOffset !== undefined && actionOffset >= nextLineStart) {
        return item;
      }
```

**Fix:** Stop depending on the AST for the trigger case. Option 1: in formatDocumentOnType, re-parse a copy of the text with the `/**` on the cursor line removed, or with ` */` appended. Option 2: add `{"open":"/**","close":" */"}` to the autoClosingPairs in language-configuration.json. Option 3: provide the template as a completion item, as TypeScript does. Then make findActionBelow accept only the first top-level statement that starts after the comment line, returning it if it is an ActionDefinition or EventActionDefinition and undefined otherwise, and extend generateJSDocTemplate to event actions. Prefix the inserted lines with the comment line's leading whitespace. Add formatter-level tests, including the unterminated `/**` case and the event-action case.

Verifier: Ran Eligian.lsp.Formatter.formatDocumentOnType against the built package. (a) With `/** */`, then an event action handler(a), then action later(b: string), it inserts '* @param {string} b', which is later's parameter and not the event action's. EventActionDefinition is not part of the ActionDefinition union (grammar lines 81-82 and 312), and findActionBelow skips anything that isn't an action. (b) With an unterminated `/**` above an action, the parse yields 1 parser error, `statements` is undefined and the result is []. When the `/**` follows an earlier action, the action after it is lost from the AST and the result is still []. language-configuration.json has no `/**` auto-closing pair, so the unterminated state is exactly what exists when the user types the trigger `*`. The on-type JSDoc template therefore does nothing in its main real-world use. No test exercises formatDocumentOnType; tests only call findActionBelow on well-formed documents. Severity was raised to medium because the feature is effectively broken in practice, not just mis-targeted in an edge case.

### Any string inside an event-action body is treated as the event-name string and offers destructive event skeleton completions

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/completion/context.ts:252](../../packages/language/src/completion/context.ts#L252)
- **Category:** bug
- **Description:** detectEventNameString only checks that the leaf CST node contains a quote and that no 'topic' or 'action' text appears before the cursor on its line. It never checks that the node is the eventName STRING of the EventActionDefinition. detectContext sets eventAction for every cursor anywhere inside the definition, including the body. So in a multi-line event action, every string argument on its own line has `isInEventNameString = true`. handleEventCompletion then offers all 46 event names, and each item carries additionalTextEdits that delete the entire EventActionDefinition and insert a skeleton.
- **Failure scenario:** Input: `on event "timeline-play" action handler() [\n  setElementContent("hel|lo")\n]`. The completion list contains timeline-play, before-request-timeline-uri and so on, instead of the default result. Accepting any of them deletes the whole handler: the main textEdit empties the string, and the additionalTextEdits remove the action and insert a new skeleton. That is data loss while typing an ordinary string argument. Verified by running the completion provider: 46 items with additionalTextEdits. Strings that the earlier CSS or HTML branches catch are spared. Existing tests only cover single-line `on event ".."` headers.

**Evidence**

```
const lineStart = text.lastIndexOf('\n', offset) + 1;
...
const topicPos = lineText.indexOf('topic');
const actionPos = lineText.indexOf('action');
...
const beforeTopic = topicPos === -1 || cursorPosInLine < topicPos;
const beforeAction = actionPos === -1 || cursorPosInLine < actionPos;
return beforeTopic && beforeAction;
```

**Fix:** Decide membership from the CST instead of the line text. Get `GrammarUtils.findNodeForProperty(eventAction.$cstNode, 'eventName')` and return true only when that node exists and `nameNode.offset < offset <= nameNode.end - 1` (inside the quotes). Drop the line-text keyword heuristic. For the empty or just-deleted case, also accept a STRING leaf that sits directly after the `event` keyword node, before any `topic`/`action` keyword node. Add tests with a body string on its own line, a body string on the header line, and a topic string.

Verifier: In completion/context.ts, detectEventNameString checks only that the leaf text contains a quote and that the current line has no 'topic'/'action' text before the cursor. It never uses the eventAction argument (the parameter is `_eventAction`). detectContext sets eventAction for any cursor inside the EventActionDefinition, including the body, and the provider calls handleEventCompletion after the CSS and HTML branches and before the operation branch. The verifier ran the real CompletionProvider.getCompletion through test-helpers with a scratch tsx script. On `on event "timeline-play" action handler() [\n  setElementContent("hel|lo")\n]` it returned 46 event-name items, every one with additionalTextEdits that delete the whole EventActionDefinition and insert a skeleton. The header case gives the same 46 items, as intended. Severity lowered to medium for two reasons. VS Code filters on the string-content range against filterText (the event name), so with a prefix like "hel" nothing appears; the items show up only when the string is empty or happens to match an event-name prefix. And an accepted edit can be undone in one step. Still, the default completions are suppressed, and a stray accept rewrites the whole handler.

### Attribute-name completions are lost when the cursor is in whitespace inside the createElement attributes object

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/html/context-detection.ts:41](../../packages/language/src/html/context-detection.ts#L41)
- **Category:** bug
- **Description:** detectHTMLCompletionContext starts from `CstUtils.findLeafNodeAtOffset(cstNode, offset)`, which only matches a leaf with offset <= o < end. Whitespace is a hidden gap between leaves, so no leaf is found and the function returns None before the AST-range checks run. The final regex fallback only handles an empty `createElement(` call.
- **Failure scenario:** `createElement("input", "", { | })` and `createElement("input", "", { type: "text", | })` (cursor in the space or after the comma) yield only the @@variable list (7 items), not the 51 input attributes. Only `{|}` (cursor directly on `}`) works. This is the normal state when a user presses space or Enter inside a freshly typed object. Verified by running the provider.

**Evidence**

```
const leafNode = CstUtils.findLeafNodeAtOffset(cstNode, offset);
  if (!leafNode?.astNode) {
    return { type: HTMLCompletionContextType.None };
  }
```

**Fix:** When findLeafNodeAtOffset returns undefined, fall back to `CstUtils.findLeafNodeBeforeOffset(cstNode, offset)` (or the leaf at offset-1) to get the enclosing OperationCall/ObjectLiteral. The later range checks against `args[2].$cstNode` then decide AttributeName correctly. Add tests for the space-in-braces, after-comma and newline-in-braces positions.

Verifier: In html/context-detection.ts, detectHTMLCompletionContext returns None when CstUtils.findLeafNodeAtOffset finds no leaf, which is the case for whitespace (hidden, not a leaf). The regex fallback covers only `createElement(`. Running the provider, `createElement("input", "", { | })` and `{ type: "text", | }` both returned only the 7 @@variable items, while `{|}` returned 51 input attributes, matching the report exactly. A space or Enter inside a fresh object is the normal typing state, so medium is reasonable.

### Attribute metadata uses DOM property names although createElement applies them with .attr(): `class` is missing and `className` is offered

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/completion/html-elements.generated.ts:141](../../packages/language/src/completion/html-elements.generated.ts#L141)
- **Category:** bug
- **Description:** Eligius createElement does `template.attr(key, String(value))` over Object.entries(attributes), so keys are HTML attribute names. The generated metadata is derived from TS DOM interfaces. It offers `className` (which sets a non-functional `classname` attribute) and `htmlFor`, `httpEquiv` and `acceptCharset`, whose real attribute names differ, and never offers `class`, `for`, `http-equiv` or `accept-charset`. It also offers read-only or DOM-only properties that are not attributes, such as a: hash/host/hostname/port/protocol/search, and input: defaultChecked/defaultValue/indeterminate/webkitEntries. The unit test `expect(labels).toContain('className')` locks in the wrong name.
- **Failure scenario:** The user completes `createElement("div", "", { className: "box" })`. The compiled config sets an attribute `className` on the element, and no CSS class is applied. `{ htmlFor: "x" }` on a label does not link to the input. The user is also never offered `class` or `for`.

**Evidence**

```
COMMON_HTML_ATTRIBUTES: ...
  {"name":"id","type":"string"},
  {"name":"className","type":"string"},
// eligius create-element.ts:
entries.forEach(([key, value]) => { template.attr(key, String(value)); });
```

**Fix:** In scripts/generate-html-metadata.ts, emit HTML attribute names. Map className→class, htmlFor→for, httpEquiv→http-equiv, acceptCharset→accept-charset, and lowercase camelCase property names whose attribute is lowercase (e.g. accessKey→accesskey, tabIndex→tabindex). Exclude read-only and DOM-only properties (defaultValue, defaultChecked, indeterminate, webkitEntries, hash/host/hostname/port/protocol/search, etc.). Ideally drive the generator from an attribute list such as the HTML spec or a vscode-html-languageservice dataset, not TS DOM interfaces. Update html-elements.spec.ts. Optionally add a validator warning for className/htmlFor keys in createElement attributes.

Verifier: The installed eligius dist (node_modules/eligius/dist/index.mjs) contains `template.attr(key, String(value))`, and the source create-element.ts applies Object.entries(attributes) through jQuery `.attr()` on `$(document.createElement(...))`. jQuery .attr does not map className to class (propFix applies only to .prop), so `className: "box"` sets a `classname` attribute and no class. html-elements.generated.ts line 141 lists `className` in COMMON_HTML_ATTRIBUTES and also lists `htmlFor`, and a run showed className, defaultChecked and defaultValue among the input attributes. The compiler has no className-to-class key mapping (a grep of compiler/ finds none). html-elements.spec.ts lines 160/189 assert `className`. The root cause is the eligius type `attributes?: Partial<HTMLElementTagNameMap[T]>` (DOM properties), which the generator mirrors, while the runtime sets attributes.

### Imported (library) actions are never suggested at operation-name positions

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/completion/actions.ts:121](../../packages/language/src/completion/actions.ts#L121)
- **Category:** bug
- **Description:** getActionCompletions only streams the ActionDefinition nodes of the current document. For `next.property === 'operationName'` the provider deliberately skips super.completionFor, which is the only path that would offer cross-referenced (imported) actions through the scope provider. The existing library completion tests only cover completion inside `import { | }` braces.
- **Failure scenario:** Given `import { fadeIn } from "./lib2.eligian"` and an empty line inside an `action local [ ... ]` body, the completion list contains `local (action)` but no `fadeIn`. Verified with a mock file system: the only matching labels were ['local (action)'].

**Evidence**

```
for (const node of AstUtils.streamAllContents(root)) {
    if (node.$type === 'RegularActionDefinition' || node.$type === 'EndableActionDefinition') {
// provider:
if (next.type === 'OperationCall' && next.property === 'operationName') {
  return;
}
```

**Fix:** In getActionCompletions (or the provider), also collect imported actions. Either resolve the document's ActionImport/NamedImport specifiers through the same library-loader/scope used for linking and emit them with an '(imported action)' detail and JSDoc, or query `scopeProvider.getScope({container: <OperationCall>, property: 'operationName', reference})` and include the action descriptions. Keep the actionNames dedup set in sync so the filtering acceptor still drops duplicates. Add a test with a library import and a cursor in an action body and in a timeline event.

Verifier: getActionCompletions(document) only streams the current document's Regular/EndableActionDefinition nodes. For OperationCall.operationName, completionFor explicitly returns before super.completionFor, and super is the only path to the scope provider's cross-references. The verifier ran the provider with a mock-FS library `lib2` exporting fadeIn, `import { fadeIn } from "./lib2.eligian"`, and a cursor on an empty line in `action local [...]`. The only fadeIn/local match was 'local (action)'. Existing library-completion tests cover only the `import { | }` braces. Nothing breaks, but completion is missing for a core workflow, so medium stands.

### Classes from named CSS imports are emitted into cssFiles but never registered for validation

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/validators/base-validator.ts:93](../../packages/language/src/validators/base-validator.ts#L93)
- **Category:** inconsistency
- **Description:** loadProgramAssets pushes both `styles` imports and named imports whose assetType is css (`import theme from "./theme.css"`) into `cssFiles`, so the runtime loads them. CSS registration and parsing only look at `DefaultImport` with `type === 'styles'`: ensureCSSImportsRegistered in base-validator, parser.ts, and validateCSSFileErrors. A named CSS import therefore contributes no classes or IDs to `getClassesForDocument`, and its syntax errors are never surfaced through the registry.
- **Failure scenario:** `import theme from "./theme.css"` defines .dark, and the program calls `addClass("dark")`. This produces a false 'Unknown CSS class: dark' error, even though the CSS is bundled into the output config.

**Evidence**

```
base-validator.ts:93: const cssImports = allImports.filter(imp => isDefaultImport(imp) && imp.type === 'styles');  vs compiler-integration.ts:238-239: if (importInfo.assetType === 'css') { result.cssFiles.push(importInfo.path); }
```

**Fix:** Add a shared helper `getCssImportPaths(program)` that returns the `styles` default import plus named imports whose asset type resolves to css (explicit `as css`, or inferred via inferAssetType). Use it in ensureCSSImportsRegistered, parser.ts, validateCSSFileErrors, and the extension's CSS processImports config (which is currently keyed on importType 'styles'), so registry parsing and the runtime cssFiles stay in sync.

Verifier: loadProgramAssets (compiler-integration.ts) pushes named imports with assetType 'css' into result.cssFiles, so the runtime loads them as stylesheets. Every place that feeds the CSS registry only considers DefaultImport with type 'styles': base-validator.ensureCSSImportsRegistered, compiler/pipeline/parser.ts, validateCSSFileErrors in asset-import-validator.ts, and the extension's processImports with importType 'styles'. A class defined only in a named CSS import is therefore reported as 'Unknown CSS class'. This matters more because only one `styles` default import is allowed per document, so named CSS imports are the only way to bring in a second stylesheet.

### CssParseError carries the absolute path, so the LSP asset validator silently drops CSS syntax errors

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/asset-loading/asset-validation-service.ts:178](../../packages/language/src/asset-loading/asset-validation-service.ts#L178)
- **Category:** bug
- **Description:** validateCss builds `createCssParseError({ filePath: absolutePath, ... })`. checkAssetLoading maps each error back to its import node with `imp.path === error.filePath`, where `imp.path` is the relative import path. The absolute path never matches, `importStmt` is undefined, and the error is discarded with no fallback. The other asset errors (HTML, CssImportError, Locales) use the relative path and work.
- **Failure scenario:** `import theme from "./theme.css"`, where theme.css has an unclosed brace. loadProgramAssets returns a CssParseError, but the validator finds no matching import and emits no diagnostic. compile() via the pipeline succeeds, while the CLI (which reports loadProgramAssets errors directly) fails. The IDE and the CLI disagree.

**Evidence**

```
createCssParseError({ filePath: absolutePath, message: `CSS validation error: ...` ...})   // asset-validation-service.ts:178-179
const importStmt = imports.find(imp => (isDefaultImport(imp) && imp.path === error.filePath) || (isNamedImport(imp) && imp.path === error.filePath)); if (importStmt) { accept(...) }   // asset-import-validator.ts:88-98
```

**Fix:** Change createCssParseError to use `filePath: relativePath`, and add an absolutePath field if the type allows it (the errors/asset-errors.ts type may need that field). Also add a fallback in checkAssetLoading that reports unmatched errors on the program node (or on the first import), so asset errors are never silently swallowed.

Verifier: validateCss in asset-validation-service.ts builds the CssParseError with `filePath: absolutePath`, while every other error builder uses relativePath. checkAssetLoading (asset-import-validator.ts) matches errors to imports with `imp.path === error.filePath`. imp.path and importInfo.path come from the same AST STRING, so relative paths match, but an absolute path never does, and with no else branch the error is dropped. For `styles` imports the syntax error still appears through validateCSSFileErrors (the registry path), so only named CSS imports lose it, which overlaps with the named-CSS-import finding above. The CLI (compile-file.ts) does report loadProgramAssets errors, so the IDE and the CLI disagree. Separately, pipeline.ts ignores assets.errors entirely.

### mergeLocaleEntry replaces a { $ref } locale with {}, silently deleting the reference in the user's file

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/labels/label-entry-generator.ts:123](../../packages/language/src/labels/label-entry-generator.ts#L123)
- **Category:** bug
- **Description:** For a locale entry that is a `$ref`, the code sets `localeData = {}` and assigns it back to `result[code]`. The comment says 'can't merge into reference', but the pointer is overwritten rather than preserved. The VS Code 'create label entry' quick fix writes this result straight back to disk. The extension's hasTranslationKey also skips `$ref` entries, so that check does not prevent this.
- **Failure scenario:** locales.json = `{"en-US": {"$ref": "./en-US.json"}, "nl-NL": {...}}`. The user runs the quick fix for the missing key 'nav.home' with languages [en-US, nl-NL]. en-US becomes `{"nav":{"home":""}}`, and the `$ref` to the real translations is lost from the file.

**Evidence**

```
if (!localeData || typeof localeData !== 'object' || '$ref' in localeData) {
  // Create new locale data if missing or if it's a $ref (can't merge into reference)
  localeData = {};
  result[code] = localeData;
}
```

**Fix:** In mergeLocaleEntry, leave `$ref` entries unchanged (do not overwrite them) and return the list of skipped locale codes. In createLabelEntry, either resolve the `$ref` relative to the locales file and merge into that file, or tell the user the key must be added to the referenced file. Add a unit test showing that a `$ref` entry survives mergeLocaleEntry.

Verifier: mergeLocaleEntry replaces any locale entry containing '$ref' with {} on the deep clone. createLabelEntry (extension/src/extension/label-entry-creator.ts) writes that result straight back to the locales file with JSON.stringify. hasTranslationKey skips `$ref` entries, so it does not guard against this. The scenario is reachable: translation-key-extractor also skips `$ref` entries, so keys that live in a referenced file are reported as unknown_label_id. The code action provider then offers the 'create label entry' quick fix, and running it overwrites the `$ref` pointer with `{"key":""}`. That loses data in the user's locales file.

### rewriteUrls mangles fragment, query, percent-encoded and protocol-relative url() values

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/css/css-service.ts:147](../../packages/language/src/css/css-service.ts#L147)
- **Category:** bug
- **Description:** Every url() that is not http(s)/data is run through `path.resolve(cssDir, urlPath)` and turned into a file URI. Several forms are not handled. `url(#grad)`, used by SVG filter/clip-path/mask references, becomes a filesystem path ending in '/#grad'. Font URLs such as `font.eot?#iefix` or `font.woff2?v=4.7.0` (Font Awesome style) keep '?...' in the file name, which then does not exist. Percent-encoded names such as `my%20file.png` are re-encoded to %2520. `//cdn.x/a.png`, `blob:` and `about:` are treated as paths. The regex also stops at the first ')' inside quotes, so `url("a (1).png")` is truncated and the rest of the CSS is corrupted. Unquoted `URL(` and `url( 'x' )` are not matched at all.
- **Failure scenario:** The live preview injects a stylesheet with `filter: url(#blur)` and `src: url('fa.woff2?v=4.7.0')`. The first is rewritten to `url('vscode-webview://.../css/#blur')`, so the filter stops applying. The second requests 'fa.woff2%3Fv%3D4.7.0', which returns 404, so the icon font is missing in the preview.

**Evidence**

```
const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g; ... if (urlPath.startsWith('http://') || urlPath.startsWith('https://') || urlPath.startsWith('data:')) { return match; } const absolutePath = path.resolve(cssDir, urlPath);
```

**Fix:** Leave values unchanged when they start with '#' or '//' or match `/^[a-z][a-z0-9+.-]*:/i`. Split off ?query and #fragment before resolving, run decodeURIComponent on the path part, and append the suffix again after asWebviewUri. Replace the regex with postcss plus postcss-value-parser (postcss is already a dependency), so quoted values, whitespace and case are handled. Also rewrite `@import` string forms.

Verifier: rewriteUrls is used only by the preview (webview-css-injector.ts:66 and :103, through css-loader.rewriteCSSUrls). VSCodeWebviewUriConverter calls `vscode.Uri.file(fileUri.path)`, which percent-encodes '#', '?' and '%' in the path. So `url(#blur)` becomes `.../css/%23blur`, `fa.woff2?v=4.7.0` becomes `...fa.woff2%3Fv%3D4.7.0`, and `my%20file.png` becomes `my%2520file.png`; all three break. '//cdn', 'blob:' and 'about:' fall through to path.resolve. With `url("a (1).png")`, the character class `[^'")]` stops at the first ')' and leaves `.png")` behind, which corrupts the CSS. Uppercase `URL(` does not match because the regex is case-sensitive. The impact is limited to the live preview; the compiled output and the CLI do not use this function.

### parseCSS ignores @import, so classes defined in imported stylesheets are reported as unknown (and bare-string @import is not rewritten for the webview)

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/css/css-parser.ts:93](../../packages/language/src/css/css-parser.ts#L93)
- **Category:** robustness
- **Description:** Only `root.walkRules` is used. `@import` at-rules are never followed or recorded, and `@scope (.x)` preludes are not scanned. A `styles "./main.css"` entry that does `@import "./buttons.css";` therefore exposes none of buttons.css's classes to the registry. In addition, rewriteUrls only touches `url(...)`, so `@import "./buttons.css"` or `@import 'x.css'` stays relative inside an injected `<style>` block and fails to load in the preview.
- **Failure scenario:** main.css contains `@import "./buttons.css";`, and buttons.css defines .btn-primary. In the DSL, `addClass("btn-primary")` gets the error 'Unknown CSS class'. In the live preview, the imported stylesheet is not applied because the relative `@import` is not rewritten.

**Evidence**

```
root.walkRules((rule: Rule) => { ... })   // no root.walkAtRules('import', ...) anywhere in css-parser.ts
const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;   // css-service.ts:147 does not match @import "x"
```

**Fix:** Collect `@import` targets in parseCSS (resolved relative to the CSS file) and parse them recursively, with cycle protection, merging their classes. In rewriteUrls, also rewrite `@import "..."` string forms.

Verifier: css-parser.ts parseCSS uses only root.walkRules. There is no walkAtRules('import') anywhere and nothing resolves imported files, so classes defined only in an `@import`-ed file are missing from the registry. The class validators (css-parameter-validator, selector-validation, timeline-validator) then report them as unknown, which is a false error. In the preview, `@import "./x.css"` (bare string) is not matched by the rewriteUrls regex. Once it is injected into a `<style>` block, the relative path resolves against the webview document instead of the CSS file's folder and fails; `@import url(...)` is rewritten. A workaround exists (list every CSS file as its own `styles` import, since cardinality is 'many'). Medium is still fair, because `@import` is common and the false error blocks compilation.

### Named media/binary imports are read fully as UTF-8 text into importMap

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/asset-loading/compiler-integration.ts:205](../../packages/language/src/asset-loading/compiler-integration.ts#L205)
- **Category:** performance
- **Description:** B37 skipped content loading only for the `provider` default import. A named import of a video, audio or image (`import intro from "./intro.mp4"`) still goes through `loader.loadFile(absolutePath)`, which does `readFileSync(path, 'utf-8')`. The whole binary is decoded into a mangled JS string and stored in `result.importMap[name]`. This runs on every LSP validation pass (checkAssetLoading) as well as on compile.
- **Failure scenario:** A 300 MB intro.mp4 imported by name is read synchronously and decoded on each document validation, blocking the language server and spiking memory. The resulting string is garbage because the bytes are not UTF-8.

**Evidence**

```
const content = loader.loadFile(absolutePath);  ...  } else if (importInfo.type === 'named' && importInfo.name) { if (importInfo.assetType === 'css') { result.cssFiles.push(importInfo.path); } result.importMap[importInfo.name] = content; }
```

**Fix:** In the named branch, if assetType is 'media', set `importMap[name] = importInfo.path` and skip loadFile. Better, change the gate to `if (importInfo.type === 'provider' || importInfo.assetType === 'media')` so no media is ever read as text. Only html, css and json need their content loaded.

Verifier: In loadProgramAssets, only `importInfo.type === 'provider'` skips loader.loadFile. Every other import, including named media imports (inferred media from .mp4 and similar), goes through NodeAssetLoader.loadFile, which calls shared-utils loadFileSync and so `fs.readFileSync(path, 'utf-8')`, and the result is stored in importMap[name]. loadProgramAssets is called from validators/program/asset-import-validator.ts on every LSP validation of a real file, not only from pipeline.ts. Nothing reads per-name media content from importMap; cli compile-file only counts the keys. So a large binary is read synchronously and decoded into a useless string on every validation pass. Files above V8's maximum string length would throw and show up as a bogus load error. Because it is on the language server's hot path, medium is more accurate than low.

### Default output path equals the input path when the input does not end in lowercase .eligian, so the source file is overwritten

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/cli/src/main.ts:141](../../packages/cli/src/main.ts#L141)
- **Category:** bug
- **Description:** The default output path is computed with a regex replace that does nothing when the input lacks a lowercase '.eligian' suffix. The output path then equals the input path, and fs.writeFile overwrites the user's DSL source with JSON. There is no guard against output === input. The same pattern is used for the bundle dir at packages/cli/src/bundler/index.ts:103, where it degrades to a late mkdir failure instead of data loss.
- **Failure scenario:** `eligian story` (no extension), `eligian story.txt` or `eligian STORY.ELIGIAN` compiles successfully and then writes the JSON to the same file, destroying the source. The same happens with `-o story.eligian`.

**Evidence**

```
const outputPath = options.output || inputPath.replace(/\.eligian$/, '.json');
...
await fs.writeFile(outputPath, result.json, 'utf-8');
```

**Fix:** Derive the default with path.parse: `path.join(dir, name + '.json')`, matching `.eligian` case-insensitively. Before writing, fail with an IOError when `path.resolve(outputPath) === path.resolve(inputPath)`. Derive the `.bundle` default in createBundle the same way.

Verifier: main.ts:141 sets `outputPath = options.output || inputPath.replace(/\.eligian$/, '.json')`. When the input has no lowercase `.eligian` suffix, the replace does nothing, and the code goes straight to `fs.writeFile(outputPath, ...)` with no check that output differs from input. compileFile reads any path and passes it to parseSource, which builds the Langium document from that URI. It never checks the extension, and with a single registered language the service registry ignores the extension anyway. So `eligian STORY.ELIGIAN` (common on Windows), `eligian story.txt` or an extensionless file compiles, and then the JSON overwrites the source. Downgraded to medium because it needs an unusual input name. The `-o story.eligian` case is the user's explicit choice, not a defect. The `.bundle` default in bundler/index.ts:103 has the same no-op replace: directoryExists returns false for a file, and the bundle then fails late at mkdir, with no data lost.

### CLI uses esbuild, eligius and jquery at runtime but declares none of them as dependencies

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/cli/package.json:32](../../packages/cli/package.json#L32)
- **Category:** bug
- **Description:** src/bundler/css-processor.ts and runtime-bundler.ts import 'esbuild' at module top level. main.ts statically imports the bundler, so this runs on every CLI invocation, not just with `--bundle`. esbuild.mjs builds with `packages:'external'`, so the dependency must be installed. The package lists only @eligian/language, chalk and commander. esbuild and eligius are only root devDependencies. In createBundle, eligius and jquery are resolved only through nodePaths walked up from the user's .eligian directory, never from the CLI's own install.
- **Failure scenario:** Outside the monorepo (global or npx install), starting the CLI fails with ERR_MODULE_NOT_FOUND for 'esbuild', even for a plain compile or `--check`. With esbuild present, `--bundle` fails with 'Could not resolve eligius' or 'jquery' unless the user's project happens to have them in a parent node_modules.

**Evidence**

```
"dependencies": {
    "@eligian/language": "workspace:*",
    "chalk": "6.0.1",
    "commander": "15.0.0"
  }
// runtime-bundler.ts: import * as esbuild from 'esbuild';
// index.ts: nodePaths = await findNodeModulesPaths(basePath)
```

**Fix:** Declare esbuild, effect and eligius in packages/cli/package.json dependencies (jquery comes in through eligius, or declare it as well). Append the CLI's own resolution roots to nodePaths, e.g. `path.dirname(createRequire(import.meta.url).resolve('eligius/package.json'))` and its parent node_modules. Optionally use a dynamic `await import('esbuild')` inside the bundling path, so a plain compile and `--check` don't load it.

Verifier: css-processor.ts:12 and runtime-bundler.ts:12 import 'esbuild' at top level. main.ts:15 imports createBundle from './bundler/index.js', which imports both modules, so esbuild loads on every invocation. esbuild.mjs builds with `packages: 'external'`. The CLI's dependencies are only @eligian/language, chalk and commander; esbuild is a root devDependency, and eligius and effect are root dependencies. The finding missed that `effect` is also imported by main.ts and not declared by the CLI. findNodeModulesPaths only walks up from the user's .eligian directory, so eligius and jquery resolve only if the user's tree happens to contain them. Inside the monorepo all of this works through root hoisting; outside it (an installed package) it would fail. Medium is right because the package cannot be published as-is anyway (see the bin finding and the `workspace:*` dependency).

### CSS url() references with query string, fragment, #id, percent-encoding, or inside comments are treated as file paths and abort the bundle with AssetNotFound

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/cli/src/bundler/asset-collector.ts:453](../../packages/cli/src/bundler/asset-collector.ts#L453)
- **Category:** bug
- **Description:** Every url(...) that is not http(s), '//' or data: is resolved with path.resolve and fs.stat'd as a literal file path. There is no stripping of ?query or #fragment, no decodeURIComponent, no skipping of fragment-only references, and no comment awareness (the regex is applied to raw text). A missing stat becomes AssetNotFoundError, which fails the whole bundle. rewriteCSSUrls in css-processor.ts uses the same raw resolution, so the same URLs would also fail to match the manifest.
- **Failure scenario:** CSS containing `@font-face { src: url('fa.woff2?v=4.7') }`, `fill: url(#grad)`, `background: url(icons.svg#sprite)`, `url(my%20img.png)`, or a commented-out `/* url(old.png) */` makes `eligian --bundle` fail with 'Asset not found'. Valid CSS is rejected.

**Evidence**

```
const absolutePath = resolveAssetPath(urlRef, cssFilePath);
const stat = yield* Effect.tryPromise({ try: () => fs.stat(absolutePath), catch: () => new AssetNotFoundError(absolutePath, cssFilePath, {...}) });
```

**Fix:** Write one normalizeUrlRef helper in url-utils.ts and use it in both the collector and rewriteCSSUrls. It should skip refs starting with '#', split off the ?query/#fragment suffix, run decodeURIComponent on the path part, and resolve that. In the rewrite, append the suffix back to outputPath (drop it for data URIs). Strip `/* */` comments before scanning, or use postcss-value-parser/postcss, which the language package already depends on.

Verifier: extractCSSUrlsWithLines (asset-collector.ts:93) runs URL_REGEX over each raw line. It skips only isExternalUrl (http, https, //) and isDataUri, with no comment stripping and no handling of '#', ?query or percent-encoding. collectAssets passes each ref to resolveAssetPath (plain path.resolve) and then fs.stat; a failed stat becomes AssetNotFoundError, which createBundle maps to a fatal BundleError. So `url('fa.woff2?v=4.7')`, `url(#grad)`, `url(icons.svg#sprite)`, `url(my%20img.png)` and a commented-out `/* url(old.png) */` all abort `--bundle`, even though font-awesome-style versioned font URLs are very common. rewriteCSSUrls (css-processor.ts:55) uses the same raw resolution as the manifest key, so fixing only the collector would leave the rewrite mismatched.

### Bundle mode flattens compile errors to 'Compilation failed: ParseError: ...' and discards line/snippet/hint details

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/cli/src/bundler/index.ts:111](../../packages/cli/src/bundler/index.ts#L111)
- **Category:** inconsistency
- **Description:** compileFile throws ParseError, CompilationError or AssetError, each carrying `formatted` diagnostics (messages, code snippets, hints). createBundle turns the thrown value into a string with a template literal, which yields only 'Name: short message', and bundleCLI prints that single line. Plain compile mode prints full diagnostics, so `--bundle` gives far worse error reporting for the same input.
- **Failure scenario:** For a syntax error in the source, `eligian x.eligian --bundle` prints 'Bundle failed: Compilation failed: ParseError: Failed to parse Eligian source' with no location or snippet. The same file without `--bundle` prints a full diagnostic.

**Evidence**

```
catch: e => new BundleError(`Compilation failed: ${e}`),
```

**Fix:** Give BundleError an optional `cause` and pass the original error in createBundle: `catch: e => new BundleError('Compilation failed', e)`. In bundleCLI, check whether `failure.value.cause` is a ParseError, CompilationError or AssetError, and reuse printFormattedErrors and printAssetErrors, the same branches compileFileCLI uses. A simpler option is to move the error printing out of compileFileCLI into a shared helper that both paths call.

Verifier: compileFile throws ParseError, CompilationError or AssetError, all subclasses of CompileError. CompileError sets `this.name = 'CompileError'`, and the subclasses do not override it. createBundle catches with `` e => new BundleError(`Compilation failed: ${e}`) ``, which becomes 'CompileError: Failed to parse Eligian source' or 'CompileError: Compilation failed'. The `formatted` array (message, codeSnippet, hint) and AssetError.errors are dropped, and BundleError has no cause field. bundleCLI prints only `failure.value.message`, so the actual output is 'Bundle failed: Compilation failed: CompileError: Compilation failed', with no location or snippet. compileFileCLI prints full diagnostics through printFormattedErrors and printAssetErrors. The real output says 'CompileError' rather than the 'ParseError' the finding quotes; that detail does not change the problem.

### One watcher is rooted at the first document's workspace folder, so imports in other roots or outside the root are never watched

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/base-watcher-manager.ts:184](../../packages/extension/src/extension/base-watcher-manager.ts#L184)
- **Category:** bug
- **Description:** startWatching() creates a single FileSystemWatcher the first time it is called, with a RelativePattern rooted at that call's workspaceRoot. Every later call only adds to trackedFiles and never creates a watcher for another root. registerImportsInternal picks the root from the first registering document's workspace folder, or `dirname(docPath)` when the document is outside any folder. So in a multi-root workspace, the CSS, HTML and labels files of documents in the second folder are never watched. The same happens for imports like '../shared/theme.css' that resolve outside the first root. PreviewPanel has the same flaw: it uses `workspaceFolders[0]` as the root for its per-panel CSS watcher.
- **Failure scenario:** A multi-root workspace has folders A and B. A.eligian is registered first, so the watcher is `A/**/*.css`. The user edits B/styles/main.css, which B/doc.eligian imports. No event fires, so there is no revalidation, no LSP notification and no preview hot reload. With a single folder, an import of '../common/shared.css' is silently never hot-reloaded.

**Evidence**

```
if (!this.watcher) {
  // Single watcher for all matching files in the workspace (efficient).
  const pattern = new vscode.RelativePattern(workspaceRoot, this.config.globPattern);
  this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
```

**Fix:** Keep a `Map<string, FileSystemWatcher>` keyed by root, and for each tracked file pick the containing workspace folder (`vscode.workspace.getWorkspaceFolder(Uri.file(file))`). For files outside every folder, create a narrow watcher with `RelativePattern(Uri.file(dirname(file)), basename(file))`. In PreviewPanel, derive the root from `vscode.workspace.getWorkspaceFolder(documentUri)`.

Verifier: base-watcher-manager.ts:182-203 creates the watcher only once, in the first startWatching call, with `RelativePattern(workspaceRoot, glob)`. Later calls only add paths to trackedFiles. registerImportsInternal derives workspaceRoot from the first registering document's folder, or from `dirname(doc)` when the document is outside any folder. The validation watchers in extension/main.ts are singletons for the extension's lifetime, so in a multi-root workspace, CSS/HTML files under a second root never fire events. The same applies to imports that resolve outside the first root, and to every workspace file when the first document registered was outside the workspace (the root is then just that document's directory). PreviewPanel.ts:105 uses `workspaceFolders[0]` for its own CSS watcher. Single-root workspaces with in-root imports, the common case, work, which makes medium more accurate than high.

### Retargeting a one-to-one import (locales/layout) is never announced, so the extension keeps watching the old file

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/language/import-processor.ts:104](../../packages/extension/src/language/import-processor.ts#L104)
- **Category:** bug
- **Description:** For cardinality 'one', the IMPORTS_DISCOVERED notification is sent only when `registry.hasImport(documentUri)` was false before this pass. The registry is still updated with the new file on every pass. If the user changes the import from a.json to b.json, hasImport is already true, so no notification is sent. The extension-side importsByFile/trackedFiles still reference a.json, and b.json is never tracked. The same applies when the import is removed, because `fileUris.length === 0` sends nothing and the extension's mapping goes stale.
- **Failure scenario:** The document has `locales "./a.json"` and hot reload works. The user edits it to `locales "./b.json"`. The server registers b.json but sends no notification. Editing and saving b.json does not trigger LABELS_UPDATED, so validation and completion for label keys go stale until the window is reloaded, while editing a.json still triggers spurious revalidation of the document. The same happens with `layout "./x.html"`.

**Evidence**

```
const isNewImport =
    config.cardinality === 'one' && config.registry.hasImport
      ? !config.registry.hasImport(documentUri)
      : true;
...
if (fileUris.length > 0 && isNewImport) {
```

**Fix:** Change importType for the labels config to 'locales', and narrow the ImportProcessorConfig.importType union to the grammar's values so TypeScript catches this. For cardinality 'one', compare the previously registered file (add `getImportedFile(docUri)` to HTMLRegistry/LabelRegistry) with `fileUris[0]`, and notify whenever they differ. Also notify with an empty or undefined URI when the import is removed, so the extension can clear its mapping. Alternatively, always notify, since the extension-side registerImportsInternal is idempotent.

Verifier: For the layout import the finding is accurate. HTMLRegistry.hasImport returns true after the first pass, and registerImports simply overwrites the mapping. Retargeting `layout "./a.html"` to `"./b.html"` therefore updates the server registry but sends no HTML_IMPORTS_DISCOVERED. The extension's HTMLWatcherManager keeps a.html mapped and never tracks b.html, and removing the import sends nothing either. The locales example does not happen as described, because the actual bug is worse. language/main.ts:220 configures `importType: 'labels'`, while the grammar and generated AST only allow DefaultImport.type 'layout' | 'locales' | 'provider' | 'styles'. `statement.type !== 'labels'` is therefore always true, so the labels processImports call never matches anything and LABELS_IMPORTS_DISCOVERED is never sent. The validation labels watcher never gets any import registered, so locale hot-reload revalidation never works at all, not just after a retarget. The spec in extension/src/language/__tests__/import-processor.spec.ts also uses 'labels', which hides this.

### Eligian: Edit Locales from the editor context menu receives the editor's own URI and opens the .eligian file in the locale editor

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/commands/locale.ts:26](../../packages/extension/src/extension/commands/locale.ts#L26)
- **Category:** bug
- **Description:** The command is contributed to the editor/context menu in package.json. VS Code passes the current editor's resource URI as the first argument to commands invoked from editor/context. The handler treats any truthy first argument as an 'explicit locale file' and opens it directly with eligian.localeEditor. The 'cursor on a locales import' branch is therefore only reachable from the command palette or a keybinding. From the context menu, the .eligian document itself is opened with the JSON locale editor.
- **Failure scenario:** The user right-clicks on the line `locales "./locales.json"` in doc.eligian and picks 'Eligian: Edit Locales'. fileUri is the URI of doc.eligian, so vscode.openWith opens the DSL file in the Locale Editor (a JSON custom editor), which fails or shows garbage instead of opening locales.json.

**Evidence**

```
async (fileUri?: vscode.Uri) => {
  // If invoked with an explicit file URI ...
  if (fileUri) {
    try {
      await vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
```

**Fix:** Use the explicit-URI path only when fileUri is a vscode.Uri whose path ends with '.json' (case-insensitive). Otherwise, for example for an .eligian URI from the context menu, fall through to cursor-line resolution in the active editor. Or register a separate internal command id for the label-file-creator caller.

Verifier: package.json contributes eligian.openLabelEditor to editor/context with the condition `resourceLangId == eligian`. VS Code calls editor/context commands with the active editor's resource URI as the first argument. The handler at locale.ts:26 treats any truthy fileUri as an explicit locale file and calls `vscode.openWith(fileUri, 'eligian.localeEditor')`, so a right-click opens the .eligian document itself in the JSON locale custom editor. vscode.openWith forces the viewType even though the selector is `**/*locale*.json`. The cursor-line branch is only reachable from the command palette. The one programmatic caller, label-file-creator.ts:141, passes a JSON URI, so only the context-menu path is broken.

### Preview localResourceRoots omits the document directory, so CSS url() assets and media outside workspace folders are blocked

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/preview/PreviewPanel.ts:135](../../packages/extension/src/extension/preview/PreviewPanel.ts#L135)
- **Category:** bug
- **Description:** localResourceRoots is the extension URI plus the workspace folders. Elsewhere the panel falls back to `path.dirname(documentUri.fsPath)` as the root when no workspace folder exists. For a loose .eligian file (no folder open), or one that references assets in a sibling directory outside the workspace, asWebviewUri produces URIs the webview refuses to load. The webview-uri-converter performs no check, so the failure is silent.
- **Failure scenario:** The user opens ~/demo/story.eligian with File > Open (no workspace), or the file lives outside the opened folder. Its CSS has `url('./bg.png')`, and the config has media. localResourceRoots contains only the extension URI, so the webview blocks every request (ERR_ACCESS_DENIED), and the preview has no images, fonts or media.

**Evidence**

```
localResourceRoots: [
  this.extensionUri,
  // Add workspace folders for media access
  ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
],
```

**Fix:** Add `vscode.Uri.file(path.dirname(this.documentUri.fsPath))` to localResourceRoots. Media paths may use '../', so the document directory alone may not cover everything. Either (a) collect the directories of resolved media and CSS files and, when one is outside the current roots, update `this.panel.webview.options = { ...options, localResourceRoots: [...] }` before posting the config, or (b) also add the workspace folder that contains the document, via `vscode.workspace.getWorkspaceFolder`.

Verifier: In PreviewPanel.ts:132-136, localResourceRoots contains only extensionUri and the workspace folders, set once when the panel is created. MediaResolver.resolveMediaPath resolves relative media against the document directory (and allows '../'), and css-service rewriteUrls resolves url() against the CSS file's directory. Both then call webview.asWebviewUri. With no workspace folder open, or with the document or assets outside every workspace folder, the webview refuses those resource requests. The code already handles the no-workspace case for the CSS injector (line 105 falls back to `path.dirname(documentUri.fsPath)`) but not for localResourceRoots, which is inconsistent. The CSS text itself is inlined through postMessage and loads fine; only url() assets and media are blocked. Medium is justified.

### createLabelsFile overwrites an existing locale file without checking that it exists

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/label-file-creator.ts:135](../../packages/extension/src/extension/label-file-creator.ts#L135)
- **Category:** bug
- **Description:** createLabelsFile calls vscode.workspace.fs.writeFile on the target path. writeFile overwrites by default, and the code never stats the path first. validatePath only checks the extension, length and characters. The quick fix is offered from a diagnostic saying the file is missing, and that diagnostic can be stale, for example after a git checkout, or after the file was created by hand or by another quick fix. The command 'eligian.createLabelsFile' is also a public command that takes arbitrary args.
- **Failure scenario:** The editor shows 'locales file not found' for ./locales.json. The user restores or creates that file, which holds real translations, without triggering revalidation, and then clicks the stale 'Create labels file' quick fix. The file is replaced by the template content, and every translation is lost without confirmation. An open dirty buffer for that file then conflicts too.

**Evidence**

```
await vscode.workspace.fs.createDirectory(parentDir);

    // Feature 039 - T008: Write file content
    const contentBytes = Buffer.from(content, 'utf-8');
    await vscode.workspace.fs.writeFile(fileUri, contentBytes);
```

**Fix:** Before writing, call `await vscode.workspace.fs.stat(fileUri)` inside a try/catch. If the stat succeeds, the file exists: skip the write and just open it with eligian.openLabelEditor, optionally with an info message such as 'Labels file already exists'. Write the template only when stat throws FileNotFound. Another option is `WorkspaceEdit.createFile(fileUri, { overwrite: false, ignoreIfExists: true, contents })` followed by applyEdit. Separately, consider setting `watchCreate: true` for the labels watcher, so creating the file revalidates the document and clears the stale diagnostic.

Verifier: In label-file-creator.ts createLabelsFile, the only checks before `vscode.workspace.fs.writeFile(fileUri, contentBytes)` are validatePath (extension, length, characters) and createDirectory. Nothing stats the target, and fs.writeFile overwrites by default. The code action (eligian-code-action-provider.ts createLabelsFileActions) is built from whatever MISSING_LABELS_FILE diagnostics the client passes in, so it is only as fresh as the last validation. Nothing clears the diagnostic when the file appears: LabelsWatcherManager (labels-watcher.ts) does not set watchCreate, and base-watcher-manager.ts only wires onDidCreate when config.watchCreate is set (its comment says 'CSS only'). So a labels file created by hand, by git checkout or by an external tool does not revalidate the .eligian document, and the stale 'Create labels file' quick fix stays available. Clicking it replaces the real file with the template. That write goes through workspace.fs, not a text edit, so Ctrl+Z cannot undo it. The trigger is narrow, but the loss is real and unrecoverable, so medium stands.

### Adding or updating a key under an existing leaf silently replaces the translation with an empty object in every locale

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/locale-editor/locale-editor-utils.ts:124](../../packages/extension/src/extension/locale-editor/locale-editor-utils.ts#L124)
- **Category:** bug
- **Description:** setAtPath replaces any non-object intermediate segment, including a string leaf, with {}. addKeyToConfig only checks `getAtPath(...) === undefined`, and getAtPath returns undefined when it walks through a string. So a path that passes through a leaf is treated as 'does not exist', and the leaf is destroyed. The Add Key modal has a free-text 'parent key' input (media/locale-editor.ts handleAddKeyConfirm). Its value is not validated against the tree and is sent as parentKey. updateTranslationInConfig and renameKeyInConfig use the same setAtPath.
- **Failure scenario:** The locale file has `{"en-US":{"nav":{"home":"Home"}}}`. The user types parent 'nav.home' and segment 'title' in the Add Key modal. The key 'nav.home.title' is created, and en-US.nav.home becomes `{"title":""}`. The 'Home' translation is lost in all locales, and the next saveConfig writes the loss into the document.

**Evidence**

```
for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {};
    }
```

**Fix:** Make setAtPath fail instead of overwriting, for example by returning false when an intermediate segment is a string, a function or another non-plain-object. Have addKeyToConfig and renameKeyInConfig check every prefix of the path; if any prefix resolves to a leaf in any locale, return the original config plus an error. In the 'add-key' and 'rename-key' handlers, post an error message back to the webview, and validate every parentKey segment with the same regex the webview uses for newSegment.

Verifier: In locale-editor-utils.ts, getAtPath returns undefined as soon as the walk hits a string. addKeyToConfig treats undefined as 'missing' and calls setAtPath, which replaces any non-object intermediate segment, including a string leaf, with {}. The webview's handleAddKeyConfirm (media/locale-editor.ts) validates only newSegment with `/^[a-zA-Z0-9_-]+$/`. parentKey is free text from the #add-key-parent input and is sent unchecked. The modal pre-fill avoids leaves, but the user can edit the field; the template placeholder is literally 'nav.home', and the help text invites dot-notation parents. locale-message-handler.ts 'add-key' joins `${parentKey}.${newSegment}` and passes it to addKeyToConfig without checking it against the tree, then calls saveConfig, which applies a WorkspaceEdit. So `{"nav":{"home":"Home"}}` with parent 'nav.home' and segment 'title' turns home into `{title:''}` in every locale. A renameKeyInConfig to a new key that passes through a leaf uses the same setAtPath. The WorkspaceEdit makes the change undoable on the text document, which limits the damage, but the overwrite is silent and hits every locale. Medium is right.

### CSS removed from the .eligian source stays injected in the preview; removeCSS is never called

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/preview/PreviewPanel.ts:283](../../packages/extension/src/extension/preview/PreviewPanel.ts#L283)
- **Category:** bug
- **Description:** On every successful compile, only the CSS files currently in config.cssFiles are injected (css-load). Style tags created by earlier compiles are never removed. WebviewCSSInjector.removeCSS exists but has no caller, and the whole block is skipped when `cssFiles.length === 0`. The CSSWatcherManager also keeps watching old files, because startWatching only adds.
- **Failure scenario:** The user removes `styles "./theme.css"` from the .eligian file and saves. The engine re-initializes, and the config no longer references theme.css, but the `<style data-css-id=...>` from the previous compile stays in document.head. The preview keeps showing styles that the compiled output no longer has, so the preview does not match the real output until the panel is closed and reopened.

**Evidence**

```
const cssFiles = extractCSSFiles(resolvedConfig);
        if (cssFiles.length > 0) {
          ...
          await this.cssInjector.injectCSS(absoluteCSSFiles);
          this.cssWatcher.startWatching(absoluteCSSFiles, this.workspaceRoot);
        }
```

**Fix:** On every successful compile, including the zero-CSS case, compute the new set of absolute paths. For each path in the injector's loadedCSS that is not in the new set, call `removeCSS(path)`, which needs a small accessor such as `getLoadedFiles()`. Then call injectCSS for the new set. Give CSSWatcherManager a replace or unwatch path, or stop and restart it with the new list, so removed files stop triggering reloads.

Verifier: PreviewPanel sets panel.webview.html only once, in the constructor, so the webview document and its `<head>` persist across recompiles. On each successful compile, compileAndUpdate only calls `cssInjector.injectCSS(absoluteCSSFiles)`, and it skips the block entirely when `cssFiles.length === 0`. The webview's 'css-load' handler only creates or updates `<style data-css-id>` tags. The 'css-remove' handler exists, but WebviewCSSInjector.removeCSS has no callers; a search finds only its definition. Engine re-initialization does not clear head styles either. So deleting or renaming a `styles` import leaves the old stylesheet applied in the preview until the panel is reopened, and because CSSWatcherManager.startWatching only adds files, the old files are still watched. The preview then no longer matches the compiled output, which is a real fidelity bug. Medium stands.

### The locale file watcher reacts to the editor's own saves: it shows 'modified externally' and reloads the webview, losing focus

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts:219](../../packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L219)
- **Category:** bug
- **Description:** LocaleFileWatcher fires onDidChange for any write to the file, including the `document.save()` triggered by the editor's request-save or Ctrl+S. applyingWebviewEdits only guards the in-memory WorkspaceEdit, not the later disk write. The callback always shows the information toast and posts a 'reload'. In the new-format webview, the 'reload' case (media/locale-editor.ts ~417) re-renders the key tree and table without saveFocusState/restoreFocusState; the legacy branch does call them.
- **Failure scenario:** The user edits a translation and presses Save. About 300 ms later the FileSystemWatcher fires, and the toast 'Label file was modified externally. Reloaded.' appears although nothing external happened. renderLocaleTable() rebuilds the inputs, so the cursor and focus in the translation field the user is typing in are lost.

**Evidence**

```
const fileWatcher = new LocaleFileWatcher(document.uri, async _fileUri => {
      // Re-parse JSON and update webview with new format
      const parseResult = parseLocalesConfiguration(document.getText());
 ...
      vscode.window.showInformationMessage('Label file was modified externally. Reloaded.');
```

**Fix:** Remove the LocaleFileWatcher reload path, because onDidChangeTextDocument already covers external changes to the open TextDocument. Keep only the onDidDelete warning if it is wanted. If the watcher stays, skip the reload and toast when `document.getText()` equals the last text serialized or posted for this URI. Separately, wrap the new-format 'reload' handler in saveFocusState/restoreFocusState, or update inputs in place, so that external reloads keep focus.

Verifier: LocaleFileWatcher (LocaleFileWatcher.ts) wraps `vscode.workspace.createFileSystemWatcher` and calls onChange for every onDidChange on the file after a 300 ms debounce. A FileSystemWatcher also fires for writes VS Code makes itself, so document.save() (from the webview's Ctrl+S → 'request-save' → trySaveDocument, or a native save) triggers it. applyingWebviewEdits is only set around applyEdit, never around the save, and nothing else guards the callback, so it always posts 'reload' and shows 'Label file was modified externally. Reloaded.' In media/locale-editor.ts the new-format 'reload' case (~line 417) calls renderKeyTree() and renderLocaleTable() without saveFocusState/restoreFocusState. renderLocaleTable removes and rebuilds the table, so a focused input loses focus and cursor. The legacy branch (~line 350) does save and restore focus. The watcher is also redundant: for an open TextDocument, VS Code reloads external disk changes into the document, and onDidChangeTextDocument → updateWebview already handles that.

### Overlapping compiles and overlapping engine initializations can apply stale results or destroy an engine that is mid-init

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/extension/src/extension/preview/PreviewPanel.ts:233](../../packages/extension/src/extension/preview/PreviewPanel.ts#L233)
- **Category:** bug
- **Description:** compileAndUpdate has no sequence number or in-flight guard. It is triggered by the debounced save callback and by the webview 'retry' message, and it awaits the file read, postMessage and engineService.initialize along the way. Two runs can interleave, so an older result can be posted after a newer one. In the webview, the message listener is async and 'initialize' is not serialized. A second initializeEngine can run `factoryResult.destroy()` and recreate the engine while the first is still in `await engine.init()`.
- **Failure scenario:** The user saves, a compile and init starts, and the user clicks Retry or saves again within the init time of a media-heavy config. Two 'initialize' messages are processed concurrently. The second destroys the engine the first is still initializing, the first throws and posts 'error', and a spurious 'Eligian Preview: ...' error toast appears. The older config can also finish last and win.

**Evidence**

```
private async compileAndUpdate(): Promise<void> {
    console.log('[Preview] Starting compilation for:', this.documentUri.fsPath);
    try { await this.panel.webview.postMessage({ type: 'showLoading' }); ... const result = await this.compilationService.compile(this.documentUri);
// media/preview.ts
case 'initialize':
      await initializeEngine(message.payload.config);
```

**Fix:** In PreviewPanel, keep a `private compileSeq = 0`. At the start of compileAndUpdate do `const id = ++this.compileSeq`, and after each await return early if `id !== this.compileSeq`. In media/preview.ts, serialize engine lifecycle work through one promise chain (`engineQueue = engineQueue.then(() => initializeEngine(cfg))`, and the same for destroyEngine). Optionally skip an initialize when a newer one is already queued.

Verifier: compileAndUpdate is triggered by FileWatcher's onDidSaveTextDocument with a 300 ms debounce, and by the webview 'retry' message, with no in-flight guard or sequence id. It awaits CompilationService.compile (a Langium/Effect compile with a 5 s timeout), then postMessage, then engineService.initialize. Two saves more than 300 ms apart while a compile is running start two concurrent runs. In media/preview.ts the 'message' listener is async, and the browser does not await it between events, so a second 'initialize' runs initializeEngine concurrently: it calls `factoryResult.destroy()` and reassigns factoryResult/engine while the first call is still in `await engine.init()`. The first call can then throw; its catch posts 'error', and PreviewPanel turns that into a `showErrorMessage('Eligian Preview: ...')` toast. An older compile that finishes late can also post its updateConfig/initialize after the newer one. The effect is limited to the preview and clears on the next save, so medium is fair rather than high.

### `**` is parsed at the same precedence and associativity as `*`, `/`, `%`, so constant folding gives wrong values

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian.langium:663](../../packages/language/src/eligian.langium#L663)
- **Category:** bug
- **Description:** The Multiplicative rule puts `**` in the same left-associative loop as `*`, `/` and `%`. In JS and in math, `**` binds tighter than `*` and is right-associative. The compiler's constant folder (expression-transformer.ts, `case '**': return left ** right`) follows the tree shape, so folded constants and emitted expressions silently differ from what the author wrote. The AST shapes were confirmed by parsing.
- **Failure scenario:** `const x = 2 * 3 ** 2` parses as `((2 * 3) ** 2)` and folds to 36, where JS gives 18. `2 ** 3 ** 2` parses as `((2 ** 3) ** 2)` = 64, where JS gives 512. `-2 ** 2` parses as `((-2) ** 2)` = 4, where JS rejects it as a syntax error. No diagnostic is raised.

**Evidence**

```
Multiplicative infers Expression:
    Unary ({infer BinaryExpression.left=current} op=('*' | '/' | '%' | '**') right=Unary)*;
```

**Fix:** Add `Exponent infers Expression: Unary ({infer BinaryExpression.left=current} op='**' right=Exponent)?;`, make Multiplicative use Exponent as its operand, and remove `**` from Multiplicative. Either make Unary wrap Exponent (so `-2**2` = `-(2**2)`, the math convention) or reject a unary operand on the left of `**` with a validator error, as JS does. Run `pnpm langium:generate`, and add parser and fold tests for `2*3**2` (18), `2**3**2` (512) and `-2**2`.

Verifier: eligian.langium:662-663 puts `**` in the same left-associative loop as `*`, `/` and `%`, directly over Unary. Running the built parser (packages/language/dist/index.cjs) on `const x = 2 * 3 ** 2` produced `BinaryExpression(**, left=BinaryExpression(*, 2, 3), right=2)`. In expression-transformer.ts:173-200 the fold follows the tree (`case '**': return left ** right`), so the result is 36 where JS gives 18. Right-associativity is also wrong, and because Unary sits below Multiplicative, `-2 ** 2` folds to 4 with no diagnostic. No parser or folder tests use `**`. The bug is real and silent. Lowered to medium because mixing `**` with other operators is rare in timeline config.

### Many grammar keywords cannot be used as identifiers, property-chain segments or object keys

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/src/eligian.langium:771](../../packages/language/src/eligian.langium#L771)
- **Category:** bug
- **Description:** Every keyword that also matches the ID pattern becomes a reserved token. `ObjectProperty.key` and `Parameter.name` are plain `ID` (or `ID|STRING`), and there is no data-type rule that allows keywords. Reserved words include: event, click, topic, on, at, in, from, as, with, layout, styles, provider, locales, html, css, media, string, number, boolean, object, array, video, audio, raf, custom, scope, operationdata, globaldata, languages, private, library, and the time units s, m, h, ms. Each failure was confirmed by running the real parser.
- **Failure scenario:** `on event "x" action hh(event) [...]` fails with "Expecting ')' but found `event`". `action f(object)`, `action f(layout)`, `const s = 5`, `for (s in items)`, `animate({ from: 1, to: 2 }, 5)`, `$operationdata.html`, `$scope.currentItem.string` and `$scope.currentItem.at` all fail with parser errors that do not say the word is reserved. Users have to rename perfectly normal identifiers.

**Evidence**

```
ObjectProperty:
    key=(ID | STRING) ':' value=Expression;
PropertyChainReference:
    '$' scope=PropertyScope ('.' properties += ID)+;
Parameter:
    name=ID (':' type=TypeAnnotation)?;
```

**Fix:** Add a data-type rule, for example `FeatureName returns string: ID | 'from' | 'to' | 'at' | 'in' | 'event' | 'html' | 's' | 'm' | 'h' | 'ms' | ...`. Use it for ObjectProperty.key and for PropertyChainReference/'@@' property segments, where no ambiguity arises. Using it for Parameter and const names may cause LL ambiguities and needs checking with `pnpm langium:generate`. Also add a validator or parser-error hint that names the reserved word.

Verifier: The errors were reproduced with the built parser. `action f(event)` gives "Expecting token of type ')' but found `event`". `action f(s)` and `const s = 5` fail because the TimeUnits 'ms'|'s'|'m'|'h' are keywords. `animate({ from: 1, to: 2 }, 5)` gives "Expecting '}' but found `from`", and `$scope.currentItem.at` fails. `const items = 5` parses, so only exact keyword matches are affected. Grammar lines 337 (Parameter name=ID), 467 (const name=ID), 693 (property chain ID segments) and 771 (ObjectProperty key=(ID|STRING)) have no keyword-tolerant rule. Quoting works around it for object keys (`"from": 1` parses), but property-chain segments and parameter/const names have no workaround, and the error does not say the word is reserved.

### TextMate grammar is hand-written, stale and highlights almost none of the current keywords

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [packages/language/syntaxes/eligian.tmLanguage.json:9](../../packages/language/syntaxes/eligian.tmLanguage.json#L9)
- **Category:** inconsistency
- **Description:** The extension copies this file verbatim (extension `build:prepare`). langium-config.json has no `textMate` section, so nothing generates or checks it. The keyword list has only about 20 words, one of which (`context`) is not in the grammar. Control-flow, declaration, import, event and timeline keywords are missing, and there are no number or operator scopes.
- **Failure scenario:** In VS Code, `if`, `else`, `for`, `in`, `const`, `break`, `continue`, `import`, `layout`, `styles`, `provider`, `locales`, `library`, `private`, `languages`, `on`, `event`, `topic`, `sequence`, `stagger`, `with`, `click`, `navigate`, `scope`, `as`, `html`, `css` and `media` render as plain text, and numbers and `$`/`@` references get no scopes.

**Evidence**

```
"match": "\\b(action|at|audio|context|custom|endable|false|from|globaldata|h|m|ms|null|operationdata|raf|s|timeline|true|using|video)\\b"
```

**Fix:** Add `"textMate": { "out": "syntaxes/eligian.tmLanguage.json" }` to the language entry in packages/language/langium-config.json, so `langium generate` produces the keyword list. If hand-written scopes (numbers, time units, `$operationdata`/`@` refs) should be kept, keep the file hand-written and add a spec that reads the grammar's keywords and asserts each one is matched by the tmLanguage. Either way, drop 'context'.

Verifier: packages/language/langium-config.json has no textMate section, and the extension's build:prepare uses shx to copy ../language/syntaxes/eligian.tmLanguage.json as-is. The single keyword regex lists action|at|audio|context|custom|endable|false|from|globaldata|h|m|ms|null|operationdata|raf|s|timeline|true|using|video. 'context' does not appear in eligian.langium. The grammar's other keywords are missing from the regex: if, else, for, in, const, break, continue, import, layout, styles, provider, locales, library, private, languages, on, event, topic, sequence, stagger, with, click, navigate, scope, as, html, css, media, plus the type names string, number, boolean, object, array. The file has no number, operator or `$`/`@` reference scopes, and no SemanticTokenProvider exists in language/src or extension/src to make up for it, so these words really are not highlighted.

### Test files are excluded from every tsconfig and currently hold 277 type errors that nothing catches

- **Status:** ✅ Fixed in `c7a75df`

- **Location:** [tsconfig.json:22](../../tsconfig.json#L22)
- **Category:** test-gap
- **Description:** The root tsconfig excludes `**/__tests__/**/*` and `**/__fixtures__/**/*`. The language, cli and extension tsconfigs inherit that exclude, so `tsc -b` and the Effect check never type-check test files. `packages/language/tsconfig.json` says it covers 'both src and test files' but inherits the exclude as well. Vitest does not type-check. With the exclude overridden, tsc reported 277 errors in test files.
- **Failure scenario:** A Langium upgrade removes `CompletionList` from `langium/lsp`, and test code that still uses it is never flagged. Tests pass at runtime through any-typed values, so API drift in tests (completion.spec.ts: 57 errors, event-action-integration.spec.ts: 32, hover-provider.spec.ts: 21, parsing.spec.ts: 20) builds up unnoticed.

**Evidence**

```
"exclude": [
    "**/lib/**/*",
    "**/out/**/*",
    "**/node_modules/**/*",
    "**/__tests__/**/*",
    "**/__fixtures__/**/*"
  ]
// tsc over the language sources with the exclude removed: src/__tests__/completion.spec.ts(9,15): error TS2305: Module '"langium/lsp"' has no exported member 'CompletionList'.
```

**Fix:** Add a per-package tsconfig.test.json (noEmit, composite false, include `src/**/*.ts`, exclude only node_modules/out/lib) and run it from a `typecheck:tests` script in CI once the 277 existing errors are fixed. Fix or remove the misleading comment and the dead `test/**/*` include in packages/language/tsconfig.json.

Verifier: The root tsconfig.json excludes `**/__tests__/**/*` and `**/__fixtures__/**/*`. tsconfig.src.json extends it and includes only `src/**/*.ts`, so the exclude is inherited. packages/language/tsconfig.json's comment says it covers 'both src and test files', but it includes `test/**/*` (a directory that does not exist) and inherits the exclude. No vitest config enables typecheck. Type-checking the language src tree, tests included, through a scratch tsconfig outside the repo gave exactly 277 errors, all in spec files: completion.spec.ts 57, event-action-integration.spec.ts 32, hover-provider.spec.ts 21, parsing.spec.ts 20, and others. One of them is TS2305 'CompletionList' not exported from langium/lsp. CI's `pnpm typecheck` and `effect:check` therefore never see test code.

### Low

### HTML import load failures are swallowed with console.error and the reference compiles to a never-set $globaldata variable

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/constant-folder.ts:76](../../packages/language/src/compiler/constant-folder.ts#L76)
- **Category:** robustness
- **Description:** A failure to resolve or read an HTML import is caught, logged and ignored, with the comment 'transformer will catch missing constants'. The transformer does not catch it. The scope provider links `@name` to the NamedImport node, whose `$container` is the Program, so expression-transformer falls through to `` return `$globaldata.${varName}` ``, which nothing ever sets. The asset validator skips in-memory and '/memory/' documents, so this path is reachable (compile(source) without a sourceUri, or a project path containing /memory/).
- **Failure scenario:** `import page from "./missing.html"` compiled without a real sourceUri: stderr gets '[CONSTANT-FOLDER]: ...', the compile succeeds, and the output contains `"$globaldata.page"` where the HTML should have been inlined. The error only shows up at runtime in the browser.

**Evidence**

```
} catch (error: any) {
  // Log warning but don't fail - transformer will catch missing constants
  console.error(`[CONSTANT-FOLDER]: ${error.message}`);
}
```

**Fix:** Have buildConstantMap collect HTML import load failures and have transformAST fail with a TransformError at the import's location. Also, in expression-transformer, if `expr.variable.ref` is a NamedImport, which programConstants never resolves, fail instead of falling back to `$globaldata`. Narrow the asset validator's test-document skip so it does not match real paths that happen to contain '/memory/'.

Verifier: The scenario is real but narrower than the reviewer says. On the real CLI and extension path, compile() gets a sourceUri, and asset-import-validator.checkAssetLoading reports the missing file as a validation error before transform; with a sourceUri the result was 'Asset file not found: ./missing.html'. Without a sourceUri the document URI is /memory/..., the validator skips it, and constant-folder logs '[CONSTANT-FOLDER]: File not found: /memory/missing.html' to stderr. The compile then succeeds, and setElementContent gets template `"$globaldata.page"`, a variable nothing sets; confirmed end to end. The same can happen for a real project path containing '/memory/', or a file named like `1.eligian`. That makes it a robustness gap in the programmatic API and edge cases, not a common user-facing bug.

### Code-snippet caret is shifted one column to the right

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/error-reporter.ts:224](../../packages/language/src/compiler/error-reporter.ts#L224)
- **Category:** bug
- **Description:** `location.column` is 1-based (getSourceLocation and extractDocumentErrors add 1), but the caret padding adds `location.column` as if it were a 0-based offset, so the underline starts one character late.
- **Failure scenario:** For `timeline "main" in "#app" using raf {` with an error at 1:20 (the opening quote of `"#app"`), the carets start under '#' instead of under the quote, and extend one character past the token.

**Evidence**

```
const padding = ' '.repeat(prefix.length + String(lineNum).length + 3 + location.column);
```

**Fix:** Use `Math.max(0, location.column - 1)` in the padding, and add a spec that asserts the caret's exact column.

Verifier: Each snippet line is rendered as `${prefix}${lineNum} | ${line}`, so the source text starts at offset prefix.length + digits + 3, and a 1-based column c is at that offset + (c-1). The padding adds `+ location.column`, which puts the caret at column c+1. Every producer of the column is 1-based: source-location.ts:21 uses `character + 1`, document-errors.ts:81 uses `start.character + 1`, and the Chevrotain lexer column and token.startColumn are 1-based. error-reporter.spec.ts only checks `toContain('^')`, so no test pins the offset. This is a purely cosmetic off-by-one.

### compileToIR drops sourceUri and assets and skips the library-file check that compile() performs

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/pipeline.ts:185](../../packages/language/src/compiler/pipeline.ts#L185)
- **Category:** inconsistency
- **Description:** compileToIR accepts CompileOptions (including sourceUri) but calls `parseSource(source)` and `transformAST(validatedProgram)` with no URI and no assets. Library imports, CSS validation, the layout template, cssFiles and locales are all missing from the IR that tooling sees, and library sources are not rejected up front.
- **Failure scenario:** `compileToIR(source, { sourceUri: '/p/main.eligian' })` for a program with `import { a } from "./lib.eligian"` and `styles "./s.css"` yields an IR with the default layout and empty cssFiles. Library imports are not loaded, so validation or transformation of imported-action calls fails or gives results that differ from compile().

**Evidence**

```
const program = yield* parseSource(source);
...
const ir = yield* transformAST(validatedProgram);
```

**Fix:** Extract a shared internal `compileToOptimizedIR(source, options)` that runs `parseSource(source, options.sourceUri)`, the library check, loadProgramAssets (with the asset-error failure from the assets.errors finding above), `transformAST(validatedProgram, assets)`, typeCheck and optimize. compileToIR returns its result, and compile() pipes it into emitJSON.

Verifier: pipeline.ts:185 calls `parseSource(source)` without `options.sourceUri`, and line 191 calls `transformAST(validatedProgram)` without assets. It also skips the isLibrary check that compile() does at line 112. Without a URI, parseSource never loads libraries, never fills the CSS registry, and uses a `file:///memory/` URI, so imports and assets are absent from the IR. The only callers are in pipeline.spec.ts. compileToIR is still exported through the compiler/index.ts barrel, so this is a real API inconsistency, but it does not affect CLI or IDE output today. Low severity is right.

### parseSource claims to remove documents from the workspace but never does, so documents accumulate in the shared index

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/pipeline/parser.ts:46](../../packages/language/src/compiler/pipeline/parser.ts#L46)
- **Category:** performance
- **Description:** The doc comment says documents are removed after parsing to prevent memory leaks. No such cleanup exists: DocumentBuilder.build indexes each built document in the singleton IndexManager, and nothing removes it. Library documents are also re-added with addDocument and never deleted. Programmatic compiles without a uri use a fresh `file:///memory/source-N.eligian` each time (`documentCounter++`), so every call adds a permanent entry.
- **Failure scenario:** A long-running host (watch mode, a test runner or an embedding service) that calls compile(source) 100k times grows the singleton's index and document state without bound. Stale indexed libraries also stay visible to later compilations.

**Evidence**

```
* after parsing to prevent memory leaks.
...
const uriString = uri ?? `file:///memory/source-${documentCounter++}.eligian`;
```

**Fix:** For anonymous (no-uri) compiles, call `await DocumentBuilder.update([], [documentUri])` after extracting the result (or `IndexManager.remove(documentUri)`, plus `LangiumDocuments.deleteDocument` if it was added). Otherwise, correct the doc comment to say documents are not removed.

Verifier: The doc comment (parser.ts:41-44) says documents are removed after parsing, but no cleanup exists anywhere in language/src or cli/src. A search for deleteDocument, IndexManager.remove and DocumentBuilder.update finds only the delete-then-re-add at library-loader.ts:140. In Langium, DocumentBuilder.build runs IndexManager.updateContent, which stores an entry in symbolIndex keyed by URI. Calls without a uri generate `` `file:///memory/source-${documentCounter++}` ``, so every programmatic compile adds a permanent index entry. One correction: library documents do not accumulate, because they reuse the same URI, are deleted and re-added, and updateContent overwrites the same key. The same holds for CLI compiles with a fixed sourceUri. So growth is limited to anonymous compiles (tests, embedders) and their stale exports, which remain in the global index. That is a real but minor issue.

### Synthetic navigate action names collide for distinct targets, so clicks go to the wrong timeline

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/transformers/navigate-operations.ts:42](../../packages/language/src/compiler/transformers/navigate-operations.ts#L42)
- **Category:** bug
- **Description:** syntheticNavActionName slugifies the target (`toLowerCase().replace(/[^a-z0-9]+/g,'_')`). transformAST dedupes by this name (`seenNavActions`), not by the real (target, position) pair, so the lossy slug collapses distinct timeline names. Only the first target's broadcast action is emitted, and call sites for the other target reference the same name.
- **Failure scenario:** Timelines named "Chapter 1" and "chapter-1" both exist, and the hub has `navigate "Chapter 1"` and `navigate "chapter-1"`. Only `__nav__chapter_1` with eventArgs `["Chapter 1",0]` is emitted, so clicking the second button navigates to "Chapter 1". Reproduced.

**Evidence**

```
const slug =
  target.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'timeline';
...
return `__nav__${slug}${posSuffix}`;
```

**Fix:** Make the name unique for each exact target string. For example, append a short stable hash of the exact target (`` `__nav__${slug}_${fnv1a(target).toString(16).slice(0,8)}${posSuffix}` ``), or encode non-alphanumerics reversibly (for example `_xHH_`). The call site and the generator both derive the name from syntheticNavActionName, so they stay in sync.

Verifier: syntheticNavActionName slugifies the target lossily: it lowercases, and every run of non-alphanumerics becomes '_'. ast-transformer.ts:179-188 dedupes on that slug name (seenNavActions), and the call site uses the same name. Two exact target strings with the same slug ('Chapter 1' / 'chapter-1', 'Intro!' / 'Intro?') therefore produce a single broadcast action carrying the first target, and the second button navigates to the wrong timeline. The mechanism is real, but it needs two timelines whose names differ only in case or punctuation, which is rare in practice, hence low rather than medium.

### hasOperation uses `in`, so names like toString/constructor crash validators and the transformer

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/operations/index.ts:94](../../packages/language/src/compiler/operations/index.ts#L94)
- **Category:** robustness
- **Description:** `name in OPERATION_REGISTRY` is true for inherited Object.prototype members. validateOperationExists then treats `toString`, `constructor`, `valueOf`, `hasOwnProperty` and the like as real operations. `getOperationSignature`/`OPERATION_REGISTRY[name]` returns a function, and the next `signature.parameters.filter`/`signature.dependencies` access throws a TypeError. The validators and name-resolver share the same lookup.
- **Failure scenario:** `action f(x: string) [ toString(x) ]` gives several `An error occurred during validation: ... is not iterable` / `Cannot read properties of undefined (reading 'filter')` diagnostics from the validators, and transformAST then throws `TypeError: Cannot read properties of undefined (reading 'filter')`. Instead of a normal 'unknown operation' message the user gets a crash. Reproduced.

**Evidence**

```
export function hasOperation(name: string): boolean {
  return name in OPERATION_REGISTRY;
}
```

**Fix:** Use `Object.hasOwn(OPERATION_REGISTRY, name)` in hasOperation, and in getOperationSignature return `Object.hasOwn(...) ? OPERATION_REGISTRY[name] : undefined`. Route validator.ts:77 through getOperationSignature, or build OPERATION_REGISTRY with `Object.assign(Object.create(null), ...)` so every direct index access is safe as well.

Verifier: operations/index.ts:43 builds OPERATION_REGISTRY as a plain object literal, so hasOperation's `name in OPERATION_REGISTRY` is true for Object.prototype members (toString, constructor, valueOf, hasOwnProperty...). getOperationSignature (line 79) and validator.ts:77 index the registry directly and return the inherited function. Callers include operation-existence-validator:126, parameter-validator:143/179/216, action-validator:32/330, import-validator:228 and name-resolver:98. They then read signature.parameters/dependencies on a function, which crashes validators (Langium reports 'An error occurred during validation') and the transformer. action-validator:32 would also wrongly report that an action named `toString` collides with an operation. The bug is real, but it only triggers on Object.prototype member names, which users rarely type, so low severity.

### Event action operations skip dependency validation that normal actions get

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/transformers/action-transformer.ts:166](../../packages/language/src/compiler/transformers/action-transformer.ts#L166)
- **Category:** inconsistency
- **Description:** transformActionDefinition and transformTimedEvent call validateOperationSequence (T173) on their operation lists. transformEventAction builds startOperations and returns without calling it. The validator also reports nothing for the event action, so an operation that needs `selectedElement` compiles and fails only in the engine.
- **Failure scenario:** `on event "language-change" action handler(a) [ addClass("x") ]` compiles with no diagnostics. The equivalent `action hh() [ addClass("x") ]` fails with `Operation 'addClass' requires 'selectedElement' but it is not available`. Reproduced.

**Evidence**

```
for (const opIR of operationIRs) {
  startOperations.push({ id: opIR.id, systemName: opIR.systemName, operationData: opIR.operationData });
}
// no validateOperationSequence(...) before the return
```

**Fix:** Collect the OperationConfigIR[] from each transformOperationStatement call into a local array. After the loop, call `` yield* validateOperationSequence(collectedIRs, `event action '${eventAction.name}'`) ``, then map the array to IOperationConfiguration[]. Add a negative test in event-action-transformer.spec.ts.

Verifier: transformActionDefinition (action-transformer.ts:94-100) and timeline-transformer.ts:652-657 both call validateOperationSequence. transformEventAction (action-transformer.ts:132-205), which ast-transformer.ts:194 calls, never does. The Langium validator's dependency check (parameter-validator.ts checkDependencies) is commented out in eligian-validator.ts:148-149 (TODO T216), so nothing else checks event action bodies. The scenario holds: an event action that calls addClass without selectElement compiles. Every valid event-action fixture starts with selectElement, so adding the check will not break them.

### generateLayoutTemplate emits duplicate ids and mangles compound selectors

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/transformers/config-builder.ts:127](../../packages/language/src/compiler/transformers/config-builder.ts#L127)
- **Category:** bug
- **Description:** The function maps each timeline to one div without deduplicating selectors. It strips only the first character of the selector, so `.a.b` becomes `class="a.b"`, `#x.y` becomes `id="x.y"`, `div#z` becomes `class="divz"` and `.p > .q` becomes `class="p > .q"`. Two timelines that share a container produce repeated ids.
- **Failure scenario:** Two timelines `in "#stage"` with no layout import produce two divs with `id="stage"`. A timeline `in ".panel.active"` produces a div whose class attribute is the single token `panel.active`, which the selector does not match. Reproduced by calling generateLayoutTemplate directly.

**Evidence**

```
if (selector.startsWith('.')) {
  const className = selector.slice(1);
  return `<div class="${className}"></div>`;
}
if (selector.startsWith('#')) {
  const id = selector.slice(1);
  return `<div id="${id}"></div>`;
}
```

**Fix:** Deduplicate by selector with a Set. Parse each selector with the existing parseSelector helper (already used in timeline-validator) into its tag, id and classes, and emit one element that carries all of them. Skip selectors that contain combinators or other parts it cannot represent, or emit a comment for them. Escape attribute values.

Verifier: config-builder.ts:127-151 maps each timeline to its own div with no deduplication. It strips only the first character: `.a.b` becomes `class="a.b"`, `#x.y` becomes `id="x.y"`, and other selectors have every non-alphanumeric character removed (`div#z` becomes `class="divz"`). It only runs as the fallback when no layout is imported (ast-transformer.ts:214, `assets?.layoutTemplate ?? generateLayoutTemplate(timelines)`), which limits the impact. Nothing stops two timelines from sharing a container or using a compound selector (timeline-validator only checks the selector against CSS), so duplicate ids and elements that do not match their own selector can happen.

### Floating-point accumulation leaks into emitted times and action names

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/transformers/timeline-transformer.ts:361](../../packages/language/src/compiler/transformers/timeline-transformer.ts#L361)
- **Category:** robustness
- **Description:** ms values are converted by division (`value / 1000`), and stagger start times are computed as `previousEventEndTime + i * delay` in floating point. The raw result is written to the config and into the action name, so values like 0.30000000000000004 appear.
- **Failure scenario:** `stagger 100ms [".a",".b",".c",".d"] with f for 1s` produces the action `stagger-f-3-0.30000000000000004-1.3` with duration.start 0.30000000000000004. This is mostly cosmetic noise in the JSON, but boundary comparisons in the engine (an end time exactly equal to the next start time) are sensitive to it. Reproduced.

**Evidence**

```
const startTime = previousEventEndTime + i * delay;
const endTime = startTime + duration;
```

**Fix:** Round where the times are produced, e.g. a helper `roundTime = (x) => Math.round(x * 1e6) / 1e6` applied to startTime and endTime in both stagger branches and to accumulated relative times. Alternatively, keep the arithmetic in integer milliseconds and divide by 1000 once at emission.

Verifier: time-transformer.ts:82 converts ms with `value / 1000`. Both stagger forms in timeline-transformer.ts compute `previousEventEndTime + i * delay` and write the raw number into duration.start and the action name. In node, `0 + 3*(100/1000)` gives 0.30000000000000004, so the reported output is real. The effect is mostly cosmetic, and engine boundary comparisons are a minor risk at most, so low is the right severity.

### hasOperation uses `in` on a plain object, so prototype names (toString, constructor, hasOwnProperty, valueOf) count as operations and crash the operation-call validators

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/compiler/operations/index.ts:94](../../packages/language/src/compiler/operations/index.ts#L94)
- **Category:** bug
- **Description:** `name in OPERATION_REGISTRY` is true for inherited Object.prototype members. Validators then read `OPERATION_REGISTRY[name].parameters/dependencies`, which are undefined for those entries. Several checks throw (checkParameterCount, checkParameterTypes, checkClassNameParameter, checkSelectorParameter, checkLabelIDParameter, validateOperationSequence), and Langium converts each throw into an 'An error occurred during validation' diagnostic. checkOperationExists treats the name as valid, so the user never sees 'unknown operation'. Defining an action called `toString` is rejected with a false 'conflicts with built-in operation' error. Reproduced. (The compiler-transformers reviewer reported the same root cause separately; see the robustness entry above.)
- **Failure scenario:** `action a() [ toString() ]` or `constructor("x")` produces 5-6 'An error occurred during validation: Cannot read properties of undefined' errors instead of one 'unknown operation' diagnostic. `action toString() [...]` reports a bogus built-in conflict.

**Evidence**

```
export function hasOperation(name: string): boolean {
  return name in OPERATION_REGISTRY;
}
```

**Fix:** Change hasOperation to `Object.hasOwn(OPERATION_REGISTRY, name)`, and getOperationSignature to `Object.hasOwn(OPERATION_REGISTRY, name) ? OPERATION_REGISTRY[name] : undefined`. Then route the direct `OPERATION_REGISTRY[x]` lookups (parameter-validator.ts, css-parameter-validator.ts, label-parameter-validator.ts, compiler/operations/validator.ts) through getOperationSignature. Building the registry with `Object.assign(Object.create(null), ...)` also works.

Verifier: OPERATION_REGISTRY (compiler/operations/index.ts:43) is a plain object literal spread from the generated registry, so `name in OPERATION_REGISTRY` is true for inherited Object.prototype keys. Reproduced: `action b() [ toString() ]` produces 5 'An error occurred during validation' diagnostics ('signature.dependencies is not iterable', 'reading filter', and 'reading length' three times) and no 'unknown operation' message. `action toString() [...]` reports the false error 'name conflicts with built-in operation' and also hits the same crashes. The bug is real, but it only fires for Object.prototype names (toString, constructor, valueOf, hasOwnProperty, ...), which users rarely pick as action or operation names, so low fits better than medium.

### LibraryImport validators crash when the import path is missing (partial AST while typing)

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/validators/import-validator.ts:87](../../packages/language/src/validators/import-validator.ts#L87)
- **Category:** robustness
- **Description:** checkImportFileExists and resolveLibraryNode pass `libraryImport.path` straight to resolveLibraryPath, which calls `.replace` on it. The path is mandatory in the grammar, but Langium error recovery produces a LibraryImport with `path === undefined`. Other import validators guard this case (validateImportPath returns undefined for an empty path); these do not. Reproduced with `import { a } from` followed by a newline.
- **Failure scenario:** While the user is typing `import { a } from`, three checks throw (checkImportFileExists, checkImportedActionsExist, checkImportedActionsPublic). The editor shows three 'An error occurred during validation: Cannot read properties of undefined (reading 'replace')' errors on the import.

**Evidence**

```
const originalPath = libraryImport.path;
    const resolvedUri = resolveLibraryPath(documentUri, originalPath);
...
    const resolvedUri = resolveLibraryPath(documentUri, libraryImport.path);
```

**Fix:** Guard at the source: return early or skip when `!libraryImport.path` in EligianScopeProvider.computeImportedActions, checkImportFileExists and resolveLibraryNode. Make resolveLibraryPath defensive too (accept `string | undefined`). Guarding only the two import-validator methods leaves the linker and the operation-existence/parameter-count crashes in place.

Verifier: resolveLibraryPath (compiler/pipeline/library-loader.ts:77) calls `importPath.replace(...)` with no guard. Langium recovery produced a LibraryImport with an undefined path for `import { a } from` followed by a newline. EligianDocumentValidator does not set stopAfterParsingErrors, so validation still runs. Reproduced: one linking error ('An error occurred while resolving reference to a ... replace') and five 'An error occurred during validation' errors. The stack traces show the crash is wider than the import validators: it also comes from EligianScopeProvider.computeImportedActions (eligian-scope-provider.ts:195), which OperationExistenceValidator.checkOperationExists and ParameterValidator.checkParameterCount call. The state is transient while typing and a real parse error is already shown, so it is noisy rather than harmful. Low is a better severity than medium.

### Control-flow pairing only inspects top-level operations, so raw when/forEach inside if/for bodies are never checked

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/validators/action-validator.ts:187](../../packages/language/src/validators/action-validator.ts#L187)
- **Category:** bug
- **Description:** validateControlFlowPairingForOps filters `operations` to direct OperationCall children and never recurses into IfStatement.thenOps/elseOps or ForStatement.body. A raw unpaired `when(...)`/`forEach(...)` nested in a block is not detected, although the same call at top level is. Reproduced.
- **Failure scenario:** `action q() [ if (true) { when(@@currentItem) } ]` gives no control_flow error, while `action q2() [ when(@@currentItem) ]` gives 'Unclosed when block'. The nested version compiles to an unbalanced when/endWhen sequence.

**Evidence**

```
const operationNames = operations
      .filter(op => op.$type === 'OperationCall')
      .map(op => getOperationCallName(op as OperationCall))
```

**Fix:** Make the pairing check recursive. Validate the top-level OperationCall names, then run the same routine on each IfStatement.thenOps, IfStatement.elseOps and ForStatement.body as independent sequences. Each sugar block compiles to its own balanced when/endWhen or forEach/endForEach wrapper, so pairing must balance inside each nested list. Report errors on the nested statement (or the OperationCall itself) rather than always on the action's 'operations' property.

Verifier: validateControlFlowPairingForOps (action-validator.ts:186-189) filters to top-level OperationCall nodes and never descends into IfStatement.thenOps/elseOps or ForStatement.body. That differs from collectOperationCallsFromStatements and validateOperationSequence, which both recurse. An unclosed raw `when()` inside an if body is therefore never checked; the if itself compiles to a when/endWhen pair, so the emitted sequence ends up unbalanced. It also produces false positives: a top-level `when()` followed by an `endWhen()` inside an if body is reported as unclosed. Real, but it needs raw when/forEach calls mixed with if/for sugar, which is unusual, so low severity.

### Library files miss import validations: circular library imports, import/local name collisions, and duplicate imports

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/eligian-validator.ts:111](../../packages/language/src/eligian-validator.ts#L111)
- **Category:** bug
- **Description:** The grammar comment says circular dependencies between libraries are not allowed, and Library allows `imports`, but the validator has no import-cycle diagnostic. Circularity is detected only at compile time in compiler/pipeline/library-loader.ts, and the scope provider silently cuts the cycle. checkImportNameCollisions is registered only on Program, so a Library that imports `x` and also defines `action x` gets no error. checkLibraryContent still says libraries cannot contain imports. Reproduced.
- **Failure scenario:** a.eligian imports `y` from b.eligian, and b.eligian imports `x` from a.eligian. The IDE shows only misleading 'Could not resolve reference' / 'Unknown operation' errors and no cycle message. A library with `import { x } from "./b.eligian"` plus `action x()` shows no error.

**Evidence**

```
Library: [
      v.imports.checkLibraryContent,
      v.imports.checkLibraryDuplicateActions,
    ],
```

**Fix:** Add a LibraryImport (or Library) check that walks the import chain via resolveLibraryPath + LangiumDocuments with a visited set of URIs, and reports 'circular_library_import' on the offending import's path. Generalize ProgramImportNameValidator.checkImportNameCollisions to accept a Library root (statements vs imports/actions), and register it under Library. Fix the stale checkLibraryContent docblock. Separately, check whether the Library branch of getScopeForActionReference should include `getImportedActions(model)`.

Verifier: The Library checks are only checkLibraryContent and checkLibraryDuplicateActions. checkImportNameCollisions is registered only for Program, and no validator mentions cycles. Circular imports are detected at compile time in compiler/pipeline/library-loader.ts:220-231 ('Circular dependency detected'), and the scope provider silently cuts the cycle with a visited set. So this is only a missing IDE diagnostic, not a silent miscompile, and the reported severity was too high. The stale docblock on checkLibraryContent ('Imports (libraries cannot import...)') is cosmetic. Separately, the 'misleading Could not resolve / Unknown operation' errors in a library are probably not cycle-specific: getScopeForActionReference's Library branch returns only model.actions, not imported actions, so calls to imported actions inside a library may fail to resolve even without a cycle (not verified at runtime). The 'duplicate imports' part is not substantiated.

### checkEventArgumentCount messages are inverted and warn on the benign case of declaring fewer parameters than the event supplies

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/validators/event-action-validator.ts:221](../../packages/language/src/validators/event-action-validator.ts#L221)
- **Category:** inconsistency
- **Description:** When the action declares fewer parameters than the event provides, the extra arguments are simply dropped, yet the warning claims 'Missing arguments may be undefined at runtime'. When it declares more, the extra parameters are the ones that are undefined, but the message says 'Extra parameters will be ignored'. The first case should not warn at all. Reproduced.
- **Failure scenario:** `on event "language-change" action h() [ ... ]` produces the warning 'Event language-change provides 1 arguments, but action declares 0 parameters. Missing arguments may be undefined at runtime.' A handler that ignores an argument is normal, and the explanation is wrong.

**Evidence**

```
if (actualParamCount < expectedArgCount) {
      // Too few parameters
      message = `Event '${eventName}' provides ${expectedArgCount} arguments, but action declares ${actualParamCount} parameters. Missing arguments may be undefined at runtime.`;
```

**Fix:** Drop the warning when `actualParamCount < expectedArgCount`, or make it a hint without the 'undefined' claim. When `actualParamCount > expectedArgCount`, warn that 'parameters `<names>` will be undefined at runtime (event supplies only N arguments)'. Update specs/029 data-model.md and quickstart.md to match.

Verifier: event-action-validator.ts:211-238 warns whenever the counts differ. action-transformer.ts:119/150 and expression-transformer.ts:160 map parameters to `$operationData.eventArgs.<n>` by index. So when an action declares fewer parameters than the event supplies, the trailing args are never read, which is harmless; when it declares more, the extra parameters resolve to undefined. The messages say the opposite: 'Missing arguments may be undefined' fires on the harmless case, and 'Extra parameters will be ignored' fires on the case that yields undefined. The text was copied verbatim from specs/029 data-model.md, so the spec has the same error. It is still a real false or misleading warning on a common pattern (a handler that ignores its args).

### checkRecursiveActionCalls reports the same cycle multiple times, once per action that can reach it

- **Status:** ✅ Already fixed by an earlier commit on this branch (regression test added in `e6b5c32`)

- **Location:** [packages/language/src/validators/action-validator.ts:59](../../packages/language/src/validators/action-validator.ts#L59)
- **Category:** bug
- **Description:** The DFS runs from every action and reports any cycle reachable from it, not only cycles that include the action being validated. Actions upstream of a cycle report it too, each time attaching the diagnostic to the same offending call node with a differently worded call chain. Reproduced.
- **Failure scenario:** `action a() [ b() ] action b() [ c() ] action c() [ b() ]` yields two 'Recursive action call detected: b' errors on the `b()` call inside c (from a's and b's validation) plus one for c, so the Problems panel shows 3 errors for one cycle.

**Evidence**

```
const callChain: string[] = [action.name];
...
        if (chain.includes(calledActionName)) {
          const cycleChain = [...chain, calledActionName].join(' → ');
```

**Fix:** Report only back-edges to the root: `if (calledActionName === action.name)`. Recurse when the name is neither in the chain nor visited, and skip without reporting when it is in the chain but is not the root. Each cycle member then reports its own outgoing call, and actions that are not in the cycle report nothing. The visited pruning stays sound, because the root is always on the stack.

Verifier: Traced action-validator.ts:59-118 for a→b, b→c, c→b. Validating a: chain [a,b,c], c calls b, which is in the chain, so it reports on the b() node in c. Validating b: chain [b,c], so it reports on the same b() node with a different chain string. Validating c: chain [c,b], so it reports on c() in b. That is 3 errors for one cycle, two of them on one node, and Langium does not dedupe diagnostics. The rule is registered for both regular and endable actions (eligian-validator.ts:159,166). Upstream actions that are not in the cycle (a) still report it.

### Partial-AST handling produces misleading or contradictory diagnostics (empty languages block, missing event name, navigate target 'undefined')

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/validators/languages-validator.ts:20](../../packages/language/src/validators/languages-validator.ts#L20)
- **Category:** robustness
- **Description:** Several checks do not guard against optional or recovered properties. An empty `languages { }` yields both 'Multiple languages require exactly one * marker' (entryCount 0 is not special-cased) and 'cannot be empty'. A missing event name yields 'must be a string literal (not a variable reference)' and 'Event name cannot be empty' on the same property, and `""` gets the 'variable reference' message. checkNavigateTarget interpolates an undefined `node.target`. Reproduced.
- **Failure scenario:** `languages { }` shows two contradictory errors. `on event action foo() [...]` shows two errors on eventName. `on click "#a" navigate ]` shows 'Unknown navigate target: 'undefined'. No timeline with this name exists.' on top of the syntax error.

**Evidence**

```
const entryCount = block.entries.length;

    if (entryCount === 1) {
      return;
    }
    const defaultMarkerCount = block.entries.filter(entry => entry.isDefault).length;
```

**Fix:** In checkEventActionDefinition, handle only the length check (or `eventName === undefined` with a 'missing event name' message), and leave empty or missing names to checkEventNameExists, so only one diagnostic fires. Drop the misleading 'variable reference' wording, since the grammar cannot produce a variable there. In checkDefaultMarker use `if (entryCount <= 1) return;`. In checkNavigateTarget add `if (node.target === undefined) return;`.

Verifier: Event name: the grammar is `'on' 'event' eventName=STRING?` (eligian.langium:271), so `on event action foo()` parses without a syntax error. checkEventActionDefinition (line 24) then reports 'must be a string literal (not a variable reference)', and checkEventNameExists (line 119) reports 'Event name cannot be empty', both on the same property. `""` is falsy, so it also gets the misleading 'variable reference' text. That part is a real issue on input that parses. Languages and navigate: `entries+=LanguageEntry+` and `target=STRING` are required, so `languages { }` and a navigate with no target are already parse errors. The extra checkDefaultMarker and checkNonEmptyLanguagesBlock errors (entryCount 0 is not special-cased) and the 'undefined' navigate message are follow-on noise on broken code. They are cosmetic but real, because Langium runs custom checks despite parse errors by default.

### checkAssetLoading skips asset validation for any file whose path contains /memory/ or is named N.eligian

- **Status:** ✅ Already fixed by an earlier commit on this branch (regression test added in `e6b5c32`)

- **Location:** [packages/language/src/validators/program/asset-import-validator.ts:75](../../packages/language/src/validators/program/asset-import-validator.ts#L75)
- **Category:** bug
- **Description:** Production code detects test documents by path heuristics. A real user project under a directory named `memory`, or a file literally named `1.eligian`, silently loses all asset-existence, HTML and CSS validation, with no diagnostic that validation was skipped.
- **Failure scenario:** The file `C:\work\memory\talk\main.eligian` has `layout "./missing.html"`. No 'file not found' error is shown in the IDE, and the problem surfaces only at compile time.

**Evidence**

```
if (/^\d+\.eligian$/.test(fileName) || normalizedPath.includes('/memory/')) {
      // Test document - skip asset validation
      return;
```

**Fix:** Give in-memory documents a distinct scheme. Change parser.ts:52 to something like `inmemory:///source-N.eligian` (and update the matching CSS registry keys in pipeline/services.ts:58-94 that assume `file:///memory/styles.css`). Make the test helpers use a non-file scheme as well. Then, in checkAssetLoading, skip only when `program.$document.uri.scheme !== 'file'`, and remove the filename and '/memory/' heuristics. Alternatively, inject a 'skipAssetValidation' flag or a mock asset loader through services.

Verifier: asset-import-validator.ts:70-78 skips all asset loading when the filename matches `/^\d+\.eligian$/` or the fsPath contains '/memory/'. This is production code in the IDE validator path (program-validator.ts:60-61, eligian-validator.ts:101). A real project at `C:\work\memory\talk\main.eligian`, or a file named 2024.eligian, therefore loses missing-file, HTML and CSS import diagnostics silently. The heuristic exists because compiler/pipeline/parser.ts:52 creates in-memory documents as `file:///memory/source-N.eligian` (with the file: scheme), and because parseHelper uses /N.eligian. That is why the reviewer's 'detect by scheme' fix does not work on its own.

### Cyclic or self-referencing consts crash inference with an uncaught Typir recursion error

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:282](../../packages/language/src/type-system-typir/eligian-type-system.ts#L282)
- **Category:** robustness
- **Description:** VariableDeclaration returns `varDecl.value` and VariableReference returns `decl`, so Typir recurses through declaration, value, reference and back. The scope provider makes every program-level const visible regardless of order, including to itself, and no validator detects const cycles. Typir's `inferType` throws on a pending node instead of returning a problem, and does not clear the pending flag when it throws. The flag stays set until the document cache is cleared, so later inferences of that node throw again.
- **Failure scenario:** Verified. `const a = @b\nconst b = @a\naction foo(x) [...]\ntimeline ... { at 0s..3s foo(@a) }` logs 'An error occurred during validation: Error: There is a recursion loop for inferring the type...' and shows the diagnostic 'An error occurred during validation'. `const a = @a` does the same. Typir infers the arguments of every function rule before checking `validateArgumentsOfFunctionCalls`, so `selectElement(@a)` inside an action can trigger it too. The throw aborts all remaining Typir validation for that node.

**Evidence**

```
VariableDeclaration: (varDecl) => { if (varDecl.value) { return varDecl.value; } ... },
VariableReference: (varRef) => { const decl = varRef.variable?.ref; return decl ? decl : this.unknownType; },
```

**Fix:** Add a Langium validator that detects const reference cycles (follow VariableReference chains with a visited set) and reports "Constant 'a' refers to itself (a -> b -> a)". In the VariableDeclaration rule, return unknownType when `varDecl.value` is a VariableReference chain that loops back, instead of delegating to Typir.

Verifier: Reproduced: `const a = @b; const b = @a`, and also `const a = @a`, used as a timeline action argument produce a logged Typir 'recursion loop for inferring the type' exception, and the only diagnostic is a generic 'An error occurred during validation'. The cause is that the VariableDeclaration and VariableReference rules hand inference back to Typir recursively. However, such a program is invalid anyway, and the user still sees an error-severity diagnostic. The problem is the poor message and the noisy stack trace, not a missed error or a language-server crash, because Langium catches the exception. The claim that the pending flag stays stuck was not verified, and it only matters for an already-invalid node. Low severity, not medium.

### Arity mismatch on timeline action calls is reported twice, and the Typir copy is a long nested message

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:462](../../packages/language/src/type-system-typir/eligian-type-system.ts#L462)
- **Category:** inconsistency
- **Description:** ParameterValidator.checkParameterCount already reports `Action 'foo' expects N argument(s) but got M` for local and imported actions. The Typir call validation (`validateArgumentsOfFunctionCalls: true`) independently reports the same wrong count as 'The given operands for the call of ... don't match -> ... The number of given parameter values does not match...', with sub-problems that name the Typir signature `foo(a: any, b: any): ($return: any)`.
- **Failure scenario:** Verified. `action foo(a, b) [...]` with `at 0s..3s foo(1)` gives two error diagnostics for one mistake, and the second exposes internal Typir wording and the 'any' type name. Every argument-count mistake in a timeline is reported twice.

**Evidence**

```
validateArgumentsOfFunctionCalls: true, // Enable type checking for action calls
```

**Fix:** Use the function form of `validateArgumentsOfFunctionCalls` on action call rules, returning false when `call.args.length !== action.parameters.length`, so arity is left to ParameterValidator. Combine this with the fix for untyped-argument inference (skip arguments that cannot be inferred). Ideally also replace Typir's nested message with a custom type-mismatch validator that reports "Argument 'x' of 'foo' expects string but got number".

Verifier: Reproduced: `action foo(a, b)` with `at 0s..3s foo(1)` gives two errors on the same line: "Action 'foo' expects 2 argument(s) but got 1. Expected: a, b" from ParameterValidator, and a nested Typir message that exposes 'foo(a: any, b: any): ($return: any)'. This is real but cosmetic: one mistake, two diagnostics, one of them in internal wording. Nothing is wrongly accepted or rejected, so low rather than medium.

### Unresolved references infer as the Top type, producing a second, misleading error/warning that names the type 'any'

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:293](../../packages/language/src/type-system-typir/eligian-type-system.ts#L293)
- **Category:** inconsistency
- **Description:** VariableReference and ParameterReference with an unresolved ref return the Top ('any') type. Control-flow validation compares `getName()` against 'array' and 'boolean', and the call validation checks assignability. Top is neither, so an unresolved name that already has a linking error gets a second error or warning that mentions 'any'. 'any' is not an Eligian type name; the language calls this 'unknown'.
- **Failure scenario:** Verified. `const c = @zzz` followed by `for (i in @c) {...}` gives the linking error plus "For loop collection must be array type, got 'any'". `foo(@nope)` with `foo(a: string)` adds an 'operands don't match' error on top of the unresolved-reference error.

**Evidence**

```
return decl ? decl : this.unknownType;  // VariableReference (line 293) and ParameterReference (line 299)
...
if (typeName !== 'array') { accept({ severity: 'error', message: `For loop collection must be array type, got '${typeName}'`
```

**Fix:** Return InferenceRuleNotApplicable for unresolved refs (`varRef.variable?.ref` undefined). The call validation then gets no type, and the control-flow validators already skip when `isType(result)` is false. Also print 'unknown' instead of the Typir Top name in control-flow messages, or skip the checks when the type is Top.

Verifier: Both cases reproduced with a diagnostics dump. `const c = @zzz` plus `for (i in @c)` produces the linking error and also "For loop collection must be array type, got 'any'". `foo(@nope)` with `foo(a: string)` produces the linking error and also "The given operands for the call of 'foo' don't match". The VariableReference and ParameterReference rules (eligian-type-system.ts:291-300) return the Top type for an unresolved ref, and Top is not assignable to string and is not named 'array'. The primary linking error is still reported first and the compile fails anyway, so the effect is only follow-on noise plus the non-Eligian name 'any'. Low severity is right.

### Typir call validation infers arguments for every built-in operation rule on every OperationCall, and the per-operation function types are never used for checking

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:243](../../packages/language/src/type-system-typir/eligian-type-system.ts#L243)
- **Category:** performance
- **Description:** A function type with an inference rule is created for each of the 79 registry operations, all with `validateArgumentsOfFunctionCalls: false` and output type Top. Typir's `FunctionCallArgumentsValidation.validation` iterates all overload groups (79 operations plus every action in the workspace). For the matching rule, `executeSingleRule` runs `inferType` on every argument and `checkTypes` before it looks at `validateArgumentsOfFunctionCalls`. So each built-in operation call infers all of its arguments and then discards the result, and each OperationCall also scans every function group. `mapParameterTypeToTypirType` (including the 'first type only' simplification at lines 228-236) therefore has no observable effect.
- **Failure scenario:** A large document or workspace with M operation calls and N actions does O(M x (79 + N)) rule `matching` calls. Operation arguments are inferred for nothing, which is also an extra path into the const-cycle throw above.

**Evidence**

```
typir.factory.Functions.create({ functionName: opName, outputParameter: { name: '$return', type: this.unknownType }, inputParameters: inputParams })
  .inferenceRuleForCalls({ languageKey: 'OperationCall', matching: ..., inputArguments: (call) => call.args, validateArgumentsOfFunctionCalls: false })
```

**Fix:** Delete the STEP 3 loop that creates per-operation Typir function types, together with `mapParameterTypeToTypirType`. Argument validation for operations already lives in the Langium operation-call validator. Before deleting, make sure no test relies on Typir inferring OperationCall to Top for built-ins. Indexing action rules by name is optional.

Verifier: Checked typir/lib/kinds/function/function-validation-calls.js. `validation()` loops over every overload group (79 registry ops plus every action), and for each one runs `executeSingleRule`. That function calls `matching`, then, when the arity matches, `inferType` on every argument and `checkTypes`. Only after that does it consult `validateArgumentsOfFunctionCalls` (line 140). For built-in ops that flag is false, so the inferred argument types and the mapped parameter types never produce a diagnostic. The output type is always Top, and nothing in src calls inferType on an OperationCall, so `mapParameterTypeToTypirType` has no observable effect. Two corrections: argument inference happens only when the argument count equals the declared parameter count, which optional parameters often prevent; and the per-group cost is a cheap name comparison. The real cost is modest, so this is dead code with a low performance impact rather than a bug.

### No tests cover action-call argument type checking from timelines, time units/relative times, or const cycles

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/type-system-typir/eligian-type-system.ts:400](../../packages/language/src/type-system-typir/eligian-type-system.ts#L400)
- **Category:** test-gap
- **Description:** `createActionFunctionType`, its context-dependent `matching` (stagger skip, action body skip, timeline-only) and `validateArgumentsOfFunctionCalls: true` have no dedicated spec. The existing typir-event-validation spec has no test for m/h units or relative times, and the reference-cycle path in the Variable/Parameter inference rules is untested. Even basic tests would have caught the bugs above.
- **Failure scenario:** Regressions such as `foo(null)`, `foo($globaldata.x)`, `at +0s..+5s`, `at 30s..1m` and `const a = @a` go unnoticed. All of them currently produce wrong diagnostics.

**Evidence**

```
validateArgumentsOfFunctionCalls: true, // Enable type checking for action calls   // no spec references this path
```

**Fix:** Keep the existing action-type-validation.spec.ts and stagger-validation.spec.ts and add the missing cases. (a) Add a unit spec for type-system-typir/utils/time-expression.ts covering ms/s/m/h, RelativeTimeLiteral and binary expressions, and fix extractTimeValue to convert m (x60) and h (x3600). For relative literals, either resolve them against the previous event or skip the TimedEvent range check when either endpoint is relative. (b) Add cases to typir-event-validation.spec.ts asserting no errors for `at 30s..1m` and for `at 0s..1s` followed by `at +0s..+5s`. (c) Add action-call specs for null, unary/binary and property-chain (`$globaldata.x`) arguments, InlineEndableAction bodies, and two documents that define a same-named action. (d) Add specs for `const a = @a` and `const a = @b; const b = @a`, asserting that validation finishes with a diagnostic and does not hang or overflow the stack.

Verifier: The finding is partly overstated. Action-call argument typing does have tests: `__tests__/action-type-validation.spec.ts` parses a timeline that calls `test(123)` against `action test(name: string)` and asserts a number/string mismatch, so the basic `createActionFunctionType` / `validateArgumentsOfFunctionCalls` path is covered. The stagger skip is covered too: `__tests__/stagger-validation.spec.ts` tests the arity of `with action()` for 1- and 2-parameter actions. The other gaps are real. (1) No spec covers null args, unary/binary expressions, `$globaldata` property chains, InlineEndableAction contexts or same-named actions in two documents. (2) Time units and relative times: typir-event-validation.spec.ts only uses s/ms (`0s - 1s..5s`, `5s..2s`), and the `+0s..+5s` tests in compiler/__tests__/transformer.spec.ts only exercise transformAST, not validation. These gaps hide real bugs: extractTimeValue converts only 'ms' and treats every other unit as seconds, so `at 30s..1m` gives 30 vs 1 and wrongly triggers the end<=start error, and it returns 0 for RelativeTimeLiteral (there is a TODO), so `at +0s..+5s` gives 0..0 and wrongly triggers 'end time (0s) must be greater than start time (0s)'. utils/__tests__ has only asset-type-inferrer.spec.ts and no time-expression spec. (3) Const cycles: the VariableDeclaration/VariableReference inference rules (eligian-type-system.ts lines ~282-300) recurse with no cycle guard, and no spec contains a self-referencing or mutually referencing const; the only `const X = @Y` cases in specs are acyclic compiler tests. So it is a genuine test gap, but 'no dedicated spec' is wrong for the basic and stagger action-call cases.

### Aliased/duplicate imports of the same action leave the second name unresolved

- **Status:** ✅ Already fixed by an earlier commit on this branch (regression test added in `e6b5c32`)

- **Location:** [packages/language/src/eligian-scope-provider.ts:241](../../packages/language/src/eligian-scope-provider.ts#L241)
- **Category:** bug
- **Description:** getActionNameForScope returns the first alias found for the ActionDefinition. If the same action is imported twice (with two aliases, or aliased once and plain once), the array contains the same node twice, and both descriptions get the first alias as their name. The other name has no scope entry, so the reference is unresolved. The validator accepts the name through findImportedActionByNameOrAlias, so no diagnostic is shown.
- **Failure scenario:** `import { bAct as foo } from "./B.eligian"` plus `import { bAct as bar } from "./B.eligian"`, then calling `bar("#box")`: `ref` is undefined. Go-to-definition, JSDoc hover (which needs `actionRef.ref`) and rename do nothing for `bar`. The same happens for `import { bAct }` after an aliased import, where `bAct` is unresolved. Reproduced.

**Evidence**

```
for (const actionImport of libraryImport.actions) {
        // Check if this actionImport references the same action
        if (actionImport.action.ref === action && actionImport.alias) {
          return actionImport.alias;
        }
      }
```

**Fix:** Build scope descriptions from the ActionImport nodes: for each actionImport whose `action.ref` resolves, create `createDescription(actionImport.action.ref, actionImport.alias ?? actionImport.action.$refText, libraryDoc)`. This removes the reverse lookup in getActionNameForScope entirely.

Verifier: getActionNameForScope returns the first alias whose `actionImport.action.ref === action`. With `import { bAct as foo }` and `import { bAct as bar }`, checkImportNameCollisions flags nothing, because the final names foo and bar differ. computeImportedActions pushes the same ActionDefinition twice, and both descriptions are named 'foo', so `bar(...)` has no scope entry and ref is undefined. findImportedActionByNameOrAlias builds an alias map, so the validators still accept 'bar' and no diagnostic appears. The same happens with a plain import after an aliased one, because the plain name gets the alias. Only IDE features break (definition, hover, rename), and importing one action under two names is rare, so low rather than medium.

### Block label bracket detection takes the first four '[' / ']' tokens in the whole node, so array literals corrupt positions

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/lsp/block-labels.ts:126](../../packages/language/src/lsp/block-labels.ts#L126)
- **Category:** bug
- **Description:** extractBracketPositions streams every leaf CST token of the endable node, including brackets that belong to array literals or other expressions inside the start block, and then assumes the first four brackets are the block delimiters.
- **Failure scenario:** `endable action x [ selectElement("#a") addClass(["one","two"]) ] [ removeClass("x") ]` yields startBracketClosingPosition at the array's `[` (line 2 col 11), endBracketPosition at the array's `]` (2:24), and endBracketClosingPosition at the real start block's closing `]` (3:0). The extension decorates the wrong characters. Reproduced.

**Evidence**

```
if (allBrackets.length >= 4) {
    return {
      start: allBrackets[0].pos, // First '['
      startClose: allBrackets[1].pos, // First ']'
      end: allBrackets[2].pos, // Second '['
      endClose: allBrackets[3].pos, // Second ']'
```

**Fix:** Use `GrammarUtils.findNodesForKeyword(node.$cstNode, '[')` and the same call with `']'`. Langium prunes CST subtrees that belong to child AST nodes, so only the node's own block delimiters come back. Take [0]/[1] for the start block and [1] of each list for the end block. Add a test where the start block contains an array literal or a nested object.

Verifier: extractBracketPositions streams every leaf CST token under the endable node, nested ones included, and takes the first four brackets. The grammar has array literals (eligian.langium:782, `'[' elements ']'`). Running extractBlockLabels on the reviewer's example returned startClose at 2:11, end at 2:23 and endClose at 3:0, all wrong. The only effect is that the editor decorates the wrong characters (block labels); compilation and validation are unaffected, so low severity.

### JSDoc @param parsing drops multi-line descriptions and silently drops optional or nested-brace types

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/jsdoc/jsdoc-parser.ts:134](../../packages/language/src/jsdoc/jsdoc-parser.ts#L134)
- **Category:** bug
- **Description:** The regex `(?:\s+(.+))?` stops at the first newline, because `.` does not match line breaks, so continuation lines of a description are cut off. `@param [opt] ...` (optional syntax) and `{{a: string}}` do not match, and the whole param is dropped from the hover. A description starting with `- ` (the common `@param x - text` style) renders as `- - text`. The `{type}` text is inserted inside backticks without escaping in jsdoc-formatter.ts, so a backtick in a type breaks the markdown.
- **Failure scenario:** For `@param {string} selector the target\n *   continues here`, the hover shows only `the target`. `@param [opt] optional` is missing from the Parameters list. `@param duration - ms` renders as `- - ms`. Reproduced with parseJSDoc and formatJSDocAsMarkdown.

**Evidence**

```
const match = contentText.match(/^(?:\{([^}]+)\}\s+)?(\w+)(?:\s+(.+))?/);
```

**Fix:** Use `[\s\S]+` for the description, then collapse whitespace and newlines. Accept `\[(\w+)(?:=[^\]]*)?\]` as an optional name. Strip a leading `-\s*` from the description. Optionally parse brace-balanced types. Add a test for each case.

Verifier: Langium 4.2.4's JSDocParagraph.toString joins lines with '\n'. The regex `(?:\s+(.+))?` has no s flag, so the description stops at the first line break. Running parseJSDoc from the built output on a sample comment gave: selector description 'the target' (the continuation line is dropped), the `@param [opt]` entry missing entirely, and duration description '- ms', which the formatter renders as ' - - ms'. All three problems are real. The impact is limited to hover text quality, so the severity is low.

### buildLabelIDHover can never match: label-ID parameter type does not exist in the registry and the CST comparison is broken

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/hover/hover-builders.ts:383](../../packages/language/src/hover/hover-builders.ts#L383)
- **Category:** bug
- **Description:** No operation in registry.generated.ts has a `ParameterType:labelId` parameter, so labelIDParamIndices is always empty and the function returns undefined. Even if one existed, the match `findLeafNodeAtOffset(arg.$cstNode, 0) === node.$cstNode` is wrong: offset 0 is an absolute document offset and the right-hand side is a composite node, so the equality is never true. The feature has no test.
- **Failure scenario:** If a labelId-typed operation parameter is ever added, hovering a label ID shows no TranslationKey hover, and nobody notices because nothing tests it.

**Evidence**

```
if (arg.$cstNode && CstUtils.findLeafNodeAtOffset(arg.$cstNode, 0) === node.$cstNode) {
```

**Fix:** Delete buildLabelIDHover and its call in EligianHoverProvider.getHoverContent (step 2). LabelController IDs already get their hover from buildControllerHover. If a labelId operation parameter is ever added, write the check as `args.indexOf(node) === paramIndex` (as buildControllerHover does) instead of comparing CST leaves.

Verifier: Counting the `ParameterType:*` values in registry.generated.ts shows none of them is labelId, so labelIDParamIndices is always empty, and buildLabelIDHover (called from eligian-hover-provider.ts:110 on every hover) always returns undefined. The matching check is also wrong: `findLeafNodeAtOffset(arg.$cstNode, 0)` looks up absolute document offset 0 and compares it with `node.$cstNode`, the composite CST node of the hovered AST node, so it would never be true. No spec references this builder. Users lose nothing, though: label-ID hover already works through buildControllerHover, whose `addController('LabelController', '<id>')` branch (hover-builders.ts, paramIndex === 1) shows the translation-key metadata. So this is dead code, not a missing feature.

### Hover for `locales "..."` default import shows `Import<media>`

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/hover/hover-builders.ts:293](../../packages/language/src/hover/hover-builders.ts#L293)
- **Category:** bug
- **Description:** DefaultImport.type can be 'layout' | 'styles' | 'provider' | 'locales', but the mapping treats everything that is not layout or styles as 'media'.
- **Failure scenario:** Hovering `locales "./labels.json"` shows `### Import<media>` instead of a locales/labels type.

**Evidence**

```
assetType =
      importNode.type === 'layout' ? 'html' : importNode.type === 'styles' ? 'css' : 'media';
```

**Fix:** Replace the ternary with a call to `inferAssetTypeFromKeyword(importNode.type)` from type-system-typir/inference/import-inference.ts, so the hover and Typir share one mapping (locales maps to json). The named-import branch could also reuse the extension inference so that .json files are not shown as 'unknown'.

Verifier: The grammar defines DefaultImport `type=('layout' | 'styles' | 'provider' | 'locales')`, and buildImportHover's ternary maps every type other than layout and styles to 'media', so hovering `locales "./x.json"` shows `Import<media>`. The Typir inference this function says it copies (type-system-typir/inference/import-inference.ts, inferAssetTypeFromKeyword) maps 'locales' to 'json', and import-inference.spec.ts tests that mapping. The hover therefore contradicts the type system.

### OperationDataTracker erase tracking is dead: 'removed' history is never recorded, so the 'erased-property-access' diagnostic is unreachable

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/operation-data-tracker.ts:107](../../packages/language/src/operation-data-tracker.ts#L107)
- **Category:** test-gap
- **Description:** No code path pushes an entry with action 'removed', so findErasurePoint always returns undefined, and the validator's erased-property-access error branch can never fire. clone() and merge() have no unit tests, and the only spec that exercises the tracker is a single happy-path case in validation.spec.ts.
- **Failure scenario:** A dependency that really was consumed by a previous operation is always reported as `missing-dependency` with the wrong explanation, or not reported at all. The if/else merge bug above went unnoticed because merge is not tested.

**Evidence**

```
findErasurePoint(propertyName: string): { operation: string } | undefined {
    for (const entry of this.history) {
      if (entry.action === 'removed' && entry.property === propertyName) {
```

**Fix:** Delete the dead code: findErasurePoint, the erased-property-access branch in validateOperationSequence, and the unused merge() (or wire merge into the IfStatement/ForStatement handling if you want join semantics). Then add operation-data-tracker.spec.ts covering processOperation (erased parameters not tracked, outputs tracked), clone isolation, and the validator's if/for behaviour.

Verifier: In operation-data-tracker.ts only `action: 'added'` entries are ever pushed to history (in processOperation; clone and merge just copy). So findErasurePoint always returns undefined, and the erased-property-access branch in action-validator.ts validateOperationSequence (around line 339) can never run. merge() is never called anywhere: the IfStatement branch validates each branch on clone() and drops the result. No spec tests the tracker on its own. The practical impact is small. Dependencies (for example selectedElement) are outputs that are never erased, and erased parameters are deliberately never added (erased params are intended in Eligius), so the validator's missing-dependency message ('ensure it is created by a previous operation') is roughly right in any realistic case. This is dead code plus a test gap, not a user-visible wrong diagnostic.

### Inclusive end-offset comparisons offer HTML completions with the cursor outside the string or object

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/html/context-detection.ts:93](../../packages/language/src/html/context-detection.ts#L93)
- **Category:** bug
- **Description:** The range checks use `offset <= objEnd`, `offset <= argEnd` and `offset <= valueEnd`. `$cstNode.end` is exclusive, so a cursor immediately after the closing `}` or closing quote still counts as inside. In the object case there is no string-boundary TextEdit, so the item is inserted at the cursor, after the `}`.
- **Failure scenario:** `createElement("input", "x", {}|)` returns 51 attribute-name items, and accepting `accept` produces `{}accept)`. `createElement("div"|)` returns the element item `div` with a textEdit replacing the string content, even though the cursor is after the closing quote. Both cases verified.

**Evidence**

```
if (offset >= objStart && offset <= objEnd) {
...
if (offset >= argStart && offset <= argEnd) {
...
if (offset >= valueStart && offset <= valueEnd) {
```

**Fix:** For the object, require `objStart < offset < objEnd`. For string arguments and values, require `argStart < offset < argEnd` (strictly between the quotes), or use the computed stringBounds (`contentStart <= offset <= contentEnd`). This keeps `{|}` working, because there offset == objEnd-1, which still passes the strict check. Add tests for a cursor right after `}` and right after a closing quote.

Verifier: `$cstNode.end` is exclusive and the checks use `offset <= end`. Running it, `createElement("input", "x", {}|)` returned 51 attribute items, and `accept` has a zero-width textEdit at the cursor after `}`, so accepting it gives `{}accept)`. The `{}|` case works because the leaf at that offset is `)`, whose container is still the OperationCall. For `createElement("div"|)`, the `div` item's textEdit range is chars 17-20 while the cursor is at 21; VS Code rejects items whose edit range does not contain the cursor, so that half is mostly invisible to the user. The bug is real but only shows up when completion is invoked right after a closing delimiter, so low.

### `script` element and `srcdoc` attribute are suggested although createElement refuses them at runtime

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/completion/html-elements.generated.ts:99](../../packages/language/src/completion/html-elements.generated.ts#L99)
- **Category:** inconsistency
- **Description:** Eligius createElement throws for elementName `script`, and assertSafeAttribute throws for `srcdoc` and `on*` attributes. The metadata lists 'script' in HTML_ELEMENT_NAMES (line 99) and `srcdoc` for iframe (line 871).
- **Failure scenario:** A user accepts the `script` completion, or `srcdoc` on an iframe. The config compiles, but the Eligius runtime throws `createElement: elementName 'script' is not allowed` or the attribute error when the operation runs.

**Evidence**

```
  'script',
...
      {"name":"srcdoc","type":"string"},
```

**Fix:** Filter these out in scripts/generate-html-metadata.ts and regenerate: drop `script` from the element names and the attribute table, and drop `srcdoc` and every attribute whose name starts with `on`. Optionally add a compile-time validator for `createElement('script')` and for on*/srcdoc keys in the attributes object, so the compiler reports the Eligius runtime rules before the operation runs.

Verifier: Checked node_modules/eligius/dist/configuration-api.d.mts (createElement docs, around line 2362) and index.mjs. Eligius refuses `script` elements ('configuration may not create scripts') and `on*`/`srcdoc` attributes ('Event handler (on*) and srcdoc attributes are refused'). html-elements.generated.ts lists 'script' at line 99, a 'script' attribute table at line 1342, `srcdoc` for iframe at line 871, and `onenterpictureinpicture`/`onleavepictureinpicture` at lines 1785-1786. Outside the generated file and tests, no Eligian validator mentions 'script' or 'srcdoc', so nothing stops this at compile time. The IDE suggests values that are guaranteed to fail at runtime. The impact is small because the runtime error is explicit.

### Cursor at the opening quote of the first createElement argument yields an empty list because substring() swaps its arguments

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/html/context-detection.ts:241](../../packages/language/src/html/context-detection.ts#L241)
- **Category:** bug
- **Description:** When offset == argStart, relativeOffset is -1 and endPos becomes openQuoteIndex. `argText.substring(openQuoteIndex + 1, endPos)` then has start > end, so JS swaps the arguments and returns the quote character itself. The partial text becomes `"`, which matches no element name, and the branch still returns `done`, so the default completions are suppressed too.
- **Failure scenario:** `createElement(|"div")` gives 0 items. Verified.

**Evidence**

```
const relativeOffset = offset - argStart - openQuoteIndex - 1;
...
const endPos = Math.min(openQuoteIndex + 1 + relativeOffset, closeQuoteIndex);
return argText.substring(openQuoteIndex + 1, endPos);
```

**Fix:** In detectHTMLCompletionContext, treat a cursor outside [contentStart, contentEnd] as not inside the string, and return the None or fall-through context instead of ElementName. Alternatively, clamp with `Math.max(0, relativeOffset)` in both quote branches of extractPartialText.

Verifier: detectHTMLCompletionContext accepts the ElementName branch when `offset >= argStart`, so a cursor just before the opening quote qualifies. In extractPartialText, openQuoteIndex is 0, so relativeOffset = offset - argStart - 0 - 1 = -1 and endPos = min(0, close) = 0. substring(1, 0) then swaps its arguments and returns the quote character. getElementNameCompletions filters with `name.includes('"')`, which matches nothing, and handleHtmlCompletion still returns 'done', so the fallback completions are suppressed as well. The bug is real, but it only hits a cursor placed before the quote, where an element-name completion is of little use anyway.

### Custom-action completion items (with markdown) are rebuilt by a full AST walk on every completionFor call; the documented WeakMap cache does not exist

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/eligian-completion-provider.ts:128](../../packages/language/src/eligian-completion-provider.ts#L128)
- **Category:** performance
- **Description:** The doc comment of getActionCompletions says actions are cached per document in a WeakMap, but there is no cache. completionFor is invoked once per context and feature for a single request. Each call runs streamAllContents over the whole program and builds signatures, markdown and a Set, before the CSS, HTML and event branches that return early without using any of it. detectContext is also recomputed in getCompletion and again in each completionFor.
- **Failure scenario:** In a large document with many actions, each keystroke triggers several full-AST walks plus per-action string building, even when the cursor is inside a CSS or HTML string where none of it is used.

**Evidence**

```
const actionCompletions = getActionCompletions(document);
const actionNames = new Set(
  actionCompletions.map(a => a.insertText || a.label.replace('action: ', ''))
);
// actions.ts: "Actions are cached per document using a WeakMap" - but getAllActions() has no cache
```

**Fix:** Compute actionCompletions and actionNames lazily, after the CSS/HTML/event early returns, and only when the isInsideAction branch or the filtering acceptor needs them. Either fix the misleading comment or add the WeakMap cache keyed by `document.parseResult.value`.

Verifier: The header comment in completion/actions.ts (lines 16-17) claims a per-document WeakMap cache, but neither getActionCompletions nor getAllActions caches anything. getAllActions walks the full AST with streamAllContents on every call, and getActionCompletions builds signatures and markdown for each action. In eligian-completion-provider.ts (lines 128-131), completionFor computes actionCompletions and actionNames before the CSS, HTML and event branches return early, so the work is wasted in those contexts. Langium calls completionFor once per next-feature, so this repeats within a single request. In practice the cost is small for typical document sizes, so this is a real but low-impact inefficiency plus a stale comment.

### Event-name completion's main textEdit lies inside the range deleted by additionalTextEdits (overlapping edits)

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/completion/event-completion-handler.ts:97](../../packages/language/src/completion/event-completion-handler.ts#L97)
- **Category:** robustness
- **Description:** The LSP specification requires additionalTextEdits not to overlap the main edit. Here the main textEdit range (the string content) is a subset of the delete range [actionStart, actionEnd], and the skeleton insert shares the delete's start position. The result depends on the client: VS Code may reject or misapply the edits, and other LSP clients may fail outright. The snippet placeholders are also stripped with `/\$\d+/g`, so the skeleton is inserted as plain text without cursor placement.
- **Failure scenario:** A non-VS Code client (or a stricter future VS Code) either applies the edits in a different order, producing a garbled definition, or drops the completion.

**Evidence**

```
additionalTextEdits: [
  { range: { start: actionStartPos, end: actionEndPos }, newText: '' },
  { range: { start: actionStartPos, end: actionStartPos }, newText: fullSkeleton.replace(/\$\d+/g, '') },
],
textEdit: { range: stringRange, newText: '' },
```

**Fix:** The reviewer's suggested fix, one textEdit over the whole EventActionDefinition range, breaks a different rule: VS Code/LSP requires a completion textEdit range to be single-line and to contain the request position, and the action definition usually spans several lines. Instead, make the main textEdit run from actionStart (the `on event "` header is on the cursor's line) to the end of the header tokens on that line, or to the closing quote. Set newText to the snippet skeleton with insertTextFormat=Snippet so `$0` is kept, and set filterText to the line text being replaced (e.g. `on event "<label>`) so client filtering still matches. If parts of the old definition on later lines must be removed, delete only that trailing, non-overlapping portion with an additionalTextEdit placed strictly after the main range.

Verifier: In event-completion-handler.ts lines 97-113, the main textEdit (stringRange, which runs from inside the event-name string to the cursor) lies inside the additionalTextEdits delete range [actionStart, actionEnd]. The LSP spec says additionalTextEdits must not overlap the main edit, so this breaks the spec as written, and the result depends on how each client handles it. VS Code applies the additional edits first and then moves the main edit by the change in cursor column, which is fragile when a multi-line skeleton is inserted. The only skeleton placeholder is `$0` (event-action-skeleton.ts:108: `[\n\t$0\n]`), so the regex strip leaves valid text but loses cursor placement; that part of the claim is correct. The integration tests that would exercise this path (`__tests__/event-action-integration/event-name-completion.spec.ts`) are wrapped in describe.skip, so nothing checks the behaviour. A real client run showing garbled output was not possible, so low severity stands.

### HTMLRegistryService.hasImport is keyed by document only, so changing or re-adding a layout import is never re-announced; documents are never cleared

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/html/html-registry.ts:106](../../packages/language/src/html/html-registry.ts#L106)
- **Category:** robustness
- **Description:** The extension's processImports computes `isNewImport = !hasImport(documentUri)` before registerImports overwrites the mapping. A document that switches from layout1.html to layout2.html is therefore not 'new', no HTML_IMPORTS_DISCOVERED notification is sent, and the file watcher keeps watching the old file. clearDocument is never called for HTML (only the CSS registry is cleared in the parser pipeline). Removing the import leaves the stale mapping, and htmlByFile entries are never pruned by clearDocument.
- **Failure scenario:** Edit `layout "./a.html"` to `layout "./b.html"`. The registry maps the document to b.html, but no watcher is set up for b.html, so hot reload of b.html does not revalidate or update the preview. The caller is in packages/extension/src/language/import-processor.ts; the reviewer did not run the extension to confirm this end to end.

**Evidence**

```
hasImport(documentUri: string): boolean {
    return this.htmlFileByDocument.has(documentUri);
  }
// import-processor.ts: const isNewImport = config.cardinality === 'one' && config.registry.hasImport ? !config.registry.hasImport(documentUri) : true;
```

**Fix:** In processImports, for cardinality 'one', compute isNewImport as `registry.getFileURI?.(documentUri) !== fileUris[0]`, i.e. compare against the previously registered target, instead of checking only whether the key exists (HTMLRegistryService.getHTMLFileURI already exists; LabelRegistry needs an equivalent). When fileUris is empty, call `registry.clearDocument(documentUri)` and send a notification with an empty or undefined target so the extension watcher drops its mapping. Also clear on document close (`documents.onDidClose`).

Verifier: In extension/src/language/import-processor.ts:104-106, `isNewImport = !hasImport(documentUri)` is computed before registerImports, and HTMLRegistryService.hasImport (html-registry.ts:106) checks only the document key. Switching `layout "./a.html"` to `"./b.html"` therefore sends no HTML_IMPORTS_DISCOVERED notification. That notification is the only thing that calls validationHTMLWatcher.registerImport (extension/src/extension/main.ts:102-107). BaseWatcherManager.handleFileChange ignores files outside trackedFiles, so edits to b.html do not trigger revalidation while the document stays mapped to a.html in the watcher. The LSP-side registry is still re-read on every rebuild of the .eligian document, which limits the damage to hot reload and revalidation triggered by the HTML file. clearDocument for HTML is never called (grep finds no callers), and processImports never clears the mapping when the layout import is removed, so getHTMLForDocument keeps returning stale content. The labels registry follows the same pattern (main.ts:234) and has the same defect.

### Object-literal attribute keys given as strings (data-*, aria-*) get no completions and the metadata contains no such attributes

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/html/context-detection.ts:99](../../packages/language/src/html/context-detection.ts#L99)
- **Category:** bug
- **Description:** ObjectProperty keys may be ID or STRING, and hyphenated attributes such as `data-foo` or `aria-label` can only be written as string keys. A cursor inside a string key falls through to None or to the attribute-value path; in the key-string case it returns 0 items. The metadata has no data-*/aria-* entries. The `target` attribute is also typed as a free string for form elements, while a, area and base get enums.
- **Failure scenario:** `createElement("input", "", { "|": 1 })` returns 0 items (verified). Users get no guidance for ARIA or data attributes, which are the attributes most often set through `.attr()`.

**Evidence**

```
const objectProperty = AstUtils.getContainerOfType(astNode, isObjectProperty);
if (objectProperty?.value?.$cstNode) {
...
// grammar: ObjectProperty: key=(ID | STRING) ':' value=Expression;
```

**Fix:** In detectHTMLCompletionContext, check whether the offset falls inside the key's CST node (`GrammarUtils.findNodeForProperty(objectProperty.$cstNode, 'key')`). If it does, return AttributeName with stringContentStart/End computed via extractStringBoundaries. In the handler, give attribute-name items a textEdit over the string content range, as the ElementName branch already does. Add the global ARIA attributes (role, aria-*) and a `data-` snippet to the generated attribute metadata (the generate:html-metadata script), and use the `_blank`/`_self`/`_parent`/`_top` enum for form/button `target`/`formtarget`.

Verifier: The grammar allows `key=(ID | STRING)` (eligian.langium:771). When the cursor is inside a string key, getContainerOfType returns the ObjectProperty; the cursor is not within `value.$cstNode`, so detection returns AttributeName. The handler (html-completion-handler.ts) then accepts items with no textEdit. Langium's default edit building matches the label against the token text from tokenOffset, which here begins with `"`, so the items are filtered out, consistent with the reviewer's 0 items. The metadata (html-elements.generated.ts) has no aria-* entries (grep count 0) and no data-* entries. `target` is typed as plain string at lines 722 and 1019 (form-related elements) but as an enum for a/area/base. This is mainly a feature gap rather than a regression, so low severity is right.

### No tests for handler-level HTML and event completion boundaries, whitespace cursor positions or event-body strings

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/html/__tests__/context-detection.spec.ts:158](../../packages/language/src/html/__tests__/context-detection.spec.ts#L158)
- **Category:** test-gap
- **Description:** The HTML context tests compute the offset as `indexOf(operationName) + operationName.length + 2` or `indexOf(text) + text.length`. These are always cursor positions on a token, never whitespace or immediately after a closing delimiter, and they do not go through the real completion provider. context.spec.ts tests isInEventNameString only on single-line headers. There is no spec for html-completion-handler.ts or event-completion-handler.ts.
- **Failure scenario:** The regressions reported above (whitespace in the object, cursor after `}` or the closing quote, cursor on the opening quote, strings in event bodies) pass the current suite unnoticed.

**Evidence**

```
const offset = code.indexOf(operationName) + operationName.length + 2; // After opening paren and quote
```

**Fix:** Add expectCompletion tests with `<|>` markers through createEligianServices for: `{ <|> }`, `{}<|>`, `"div"<|>`, `<|>"div"`, a string key `{ "<|>": 1 }`, and a multi-line `on event` body containing a string, where no event-name items should appear. Un-skip or replace event-name-completion.spec.ts with tests that assert on the textEdit/additionalTextEdits ranges that handleEventCompletion produces, including non-overlap.

Verifier: html/__tests__/context-detection.spec.ts computes offsets with indexOf+length (lines 166 and 185), so every test cursor sits on a token, and the tests call detectHTMLCompletionContext directly, not the completion provider. No spec exercises handleHtmlCompletion or handleEventCompletion. The event-name integration suite (`__tests__/event-action-integration/event-name-completion.spec.ts`) is entirely describe.skip, and the isInEventNameString tests in context.spec.ts cover single-line headers only. The coverage gap is real.

### parseCSS drops every class/ID on any CSS syntax error, so each class use in .eligian is flagged unknown

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/css/css-parser.ts:90](../../packages/language/src/css/css-parser.ts#L90)
- **Category:** robustness
- **Description:** `postcss.parse` throws on the first syntax error (an unclosed block, a stray `}`, a `//` comment). The catch block returns empty class/ID sets with one error. The registry is overwritten with that empty metadata on every CSS_UPDATED notification, and the unknown-class check only consults `getClassesForDocument`, never `hasErrors`. The spec 'should return empty classes/IDs when CSS has fatal syntax error' pins this behaviour.
- **Failure scenario:** The user is mid-edit in main.css and has an unclosed `{`. Every `addClass("btn")`, `selectElement(".x")` and similar call in the importing .eligian files now shows 'Unknown CSS class' with no suggestions. The single real error is on the import line, so the diagnostics are very noisy.

**Evidence**

```
const root: Root = postcss.parse(cssContent, { from: filePath }); ... } catch (error) { if (isCssSyntaxError(error)) { errors.push({...}) } ... } return { classes, ids, ... }  // classes empty on throw
```

**Fix:** In the className and selector checks, skip the unknown-class and unknown-ID diagnostics (or downgrade them) when any CSS file imported by the document has registry errors (`cssRegistry.hasErrors`). Optionally, also fall back to postcss-safe-parser so rules that parse correctly keep their classes.

Verifier: parseCSS wraps postcss.parse in try/catch. On a CssSyntaxError (for example an unclosed block) it returns empty class and ID sets plus one error. The extension's Parsed-phase handler and its CSS_UPDATED handler (extension/src/language/main.ts) write that result into the registry. CssParameterValidator, reportSelectorIssues, timeline-validator and navigate-validator only call getClassesForDocument/getIDsForDocument and never check hasErrors, so every class or ID use is flagged unknown, with no suggestions because the set is empty. The scenario is real. However, re-parsing happens on file save through the file watcher, not on every keystroke; the root cause is also reported at the import (validateCSSFileErrors); and the behaviour is deliberate and pinned by a spec. This is noisy follow-on diagnostics rather than incorrect output, so low severity.

### setNestedValue allows prototype pollution through dotted translation keys such as `__proto__.x`

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/labels/label-entry-generator.ts:34](../../packages/language/src/labels/label-entry-generator.ts#L34)
- **Category:** security
- **Description:** `segment in current` is true for the inherited `__proto__` accessor, and `typeof current['__proto__'] === 'object'`. The code never replaces it, so `current` becomes `Object.prototype`, and the final `current[lastSegment] = value` writes onto it. The label id comes from the .eligian source, which is untrusted workspace content. Reproduced: after `mergeLocaleEntry({'en-US':{}}, '__proto__.polluted', ['en-US'])`, `({}).polluted === ''`.
- **Failure scenario:** A cloned repo contains `requestLabelData("__proto__.isAdmin")`. The user clicks 'Create label entry'. The extension host (or LSP) process now has `Object.prototype.isAdmin = ''` for the rest of its lifetime, which can change the behaviour of unrelated code in the same process.

**Evidence**

```
if (!(segment in current) || typeof current[segment] !== 'object') { current[segment] = {}; }
current = current[segment] as TLocaleData;
```

**Fix:** Reject any key path containing the segments `__proto__`, `constructor` or `prototype`, both in setNestedValue and in hasTranslationKey or label-id validation, and report them as invalid label ids. Use `Object.hasOwn(current, segment)` instead of `in`, and check `current[segment] !== null` along with the typeof check. Apply the same hasOwn change in hasTranslationKey.

Verifier: Traced the path: label-entry-creator.ts:221 calls `mergeLocaleEntry(localesConfig, labelId, languageCodes)` with the label id from the .eligian source. hasTranslationKey (label-entry-creator.ts:90) does not block `__proto__.x`: `'__proto__' in current` is true, current becomes Object.prototype, then `'x' in Object.prototype` is false, so it returns false and the merge goes ahead. In setNestedValue, `'__proto__' in current` is true and `typeof Object.prototype === 'object'`, so current becomes Object.prototype and the final assignment writes there. Running the same logic in node gives `({}).polluted === ''` true, and the written JSON is `{"en-US":{}}`, so the key is also silently lost. Severity lowered to low because the user has to click the quick fix, the value written is always the empty string, and only the property name is attacker-chosen. It is still real prototype pollution in the extension host. `constructor.x` is safe because `typeof Object` is 'function', so that segment gets replaced with an own {}.

### extractTranslationKeys is not guarded against non-object locale entries (bogus numeric keys, or a throw)

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/locales/translation-key-extractor.ts:51](../../packages/language/src/locales/translation-key-extractor.ts#L51)
- **Category:** robustness
- **Description:** Both LSP callers (checkLocalesImports, ensureLabelsImportsRegistered) only run JSON.parse before extractTranslationKeys, never the schema. Any entry that is not a plain object is passed straight to `Object.entries`. A string value yields one key per character ('0','1',...), an array yields index keys, and null throws. Confirmed: `{'en-US':'oops'}` returns ids '0'..'3'.
- **Failure scenario:** locales.json = `{"en-US": "Hello"}`. The label registry gets keys '0'..'4', so `requestLabelData("0")` validates. For `{"en-US": null}` the whole file is dropped with the generic warning 'Cannot convert undefined or null to object'.

**Evidence**

```
const keys = extractKeysFromLocaleData(localeEntry as TLocaleData, '');   // no typeof/Array/null check; for (const [key, value] of Object.entries(data))
```

**Fix:** Run `validateLocalesJSON(content, absolutePath)` in checkLocalesImports, report its error as a diagnostic, and clear the registry entry for that file. As a defensive measure in extractTranslationKeys, skip entries where `typeof entry !== 'object' || entry === null || Array.isArray(entry)`.

Verifier: asset-import-validator.ts:265-269 (checkLocalesImports) and label-parameter-validator.ts:258-260 (ensureLabelsImportsRegistered) both call JSON.parse and then extractTranslationKeys, with no validateLocalesJSON step. The main.ts notification handlers do validate, but these validators overwrite the registry. `isLocaleReference('Hello')` returns false, so `Object.entries('Hello')` produces keys '0' to '4', and an array produces index keys. For null, Object.entries throws a TypeError, which is caught and shown as the generic 'Failed to parse locales file: Cannot convert undefined or null to object' warning in checkLocalesImports and silently ignored in the label validator. The compile path (compiler-integration.ts:219) does run the schema, so a bad file still fails at compile time. The impact is limited to misleading IDE validation for a file that is already malformed, so low is right.

### CLASS_NAME/SELECTOR_OPERATIONS list operations that do not exist in Eligius and omit ones that do

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/css/css-operations.ts:18](../../packages/language/src/css/css-operations.ts#L18)
- **Category:** inconsistency
- **Description:** The hover and completion sets contain `hasClass`, `selectElements`, `querySelector` and `querySelectorAll`. None of these is in the generated operation registry or in Eligius' operation dir. In the registry, className and selector parameters actually belong to addClass, removeClass, toggleClass, animateWithClass (className) and selectElement, reparentElement (selector). The validator is driven by the registry's ParameterType, but hover and completion use these hard-coded sets, so the two have drifted apart.
- **Failure scenario:** The user types `animateWithClass("")` or `reparentElement(".")`. The validator checks them, but there is no class/ID completion and no CSS hover. The dead entries never match anything.

**Evidence**

```
export const CLASS_NAME_OPERATIONS = new Set(['addClass','removeClass','toggleClass','hasClass']);
export const SELECTOR_OPERATIONS = new Set(['selectElement','selectElements','querySelector','querySelectorAll']);
```

**Fix:** Build CLASS_NAME_OPERATIONS and SELECTOR_OPERATIONS by scanning OPERATION_REGISTRY for parameters whose type contains ParameterType:className or ParameterType:selector. Ideally also record which parameter index carries the type, so hover and completion only fire on that argument and not on any string in the call.

Verifier: css-operations.ts lists hasClass, selectElements, querySelector and querySelectorAll. In registry.generated.ts, ParameterType:className appears only on addClass, animateWithClass, removeClass and toggleClass, and ParameterType:selector only on reparentElement and selectElement. Eligius' src/operation dir has add-class, animate-with-class, remove-class, select-element and toggle-class, and no hasClass or querySelector*. context-detection.ts and hover-detection.ts are the only consumers, so animateWithClass and reparentElement get no CSS completion or hover, and the four extra names are dead.

### getHTMLImports ignores an explicit `as` type and is case-sensitive, disagreeing with inferAssetType

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/utils/program-helpers.ts:96](../../packages/language/src/utils/program-helpers.ts#L96)
- **Category:** inconsistency
- **Description:** Selection is `assetType === 'html' || path.endsWith('.html')`. An explicit non-html override on an .html file (`import x from "./a.html" as css`) is still treated as an HTML constant. Conversely, `./Page.HTML` (handled as html by inferAssetType, which lowercases) is not treated as HTML here. The same logic is duplicated in eligian-scope-provider.getHTMLImports.
- **Failure scenario:** `import page from "./Page.HTML"` is compiled as html in asset loading, but `@page` fails to resolve as a constant, because the scope provider and the constant folder filter on a case-sensitive '.html' suffix.

**Evidence**

```
const explicitType = imp.assetType === 'html';
const htmlExtension = imp.path.endsWith('.html');
return explicitType || htmlExtension;
```

**Fix:** Add one shared helper, `isHtmlImport(imp) = (imp.assetType ?? inferAssetType(imp.path)) === 'html'`, in program-helpers. Use it in getHTMLImports and in the scope provider, which can just call the program-helpers getHTMLImports on the Program.

Verifier: program-helpers.getHTMLImports (line 96) and eligian-scope-provider.getHTMLImports (line 342) both use the case-sensitive `imp.path.endsWith('.html')` and ignore a non-html explicit assetType. inferAssetType in utils/asset-type-inference.ts is documented as case-insensitive (.HTML maps to html). So asset loading treats ./Page.HTML as html, but the scope provider does not offer it as an @-referenceable name and constant-folder does not inline it. An `.html` file with `as css` is still folded as an HTML constant. The logic is duplicated in two places.

### isOffsetInStringLiteral returns true when the cursor sits between two separate strings on one line

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/utils/string-utils.ts:26](../../packages/language/src/utils/string-utils.ts#L26)
- **Category:** bug
- **Description:** The function takes the nearest quote before the offset and the nearest matching quote after it, without tracking whether quotes are open or closed. The closing quote of one string and the opening quote of the next satisfy this. It is used by CSS completion context detection.
- **Failure scenario:** For `selectElement(".a") /* */ addClass("b")` with the cursor after the first call's closing quote, the backward scan finds that closing `"`, and the forward scan finds the opening `"` of "b", so the function returns true although the cursor is outside any string. A wrong ClassName/Selector completion context can then be reported.

**Evidence**

```
if (char === '"' || char === "'") { openQuote = i; quoteChar = char; break; } ... if (char === quoteChar) { closeQuote = i; break; } ... return openQuote !== -1 && closeQuote !== -1;
```

**Fix:** Use the CST: the cursor is in a string when the leaf node from `CstUtils.findLeafNodeAtOffset` is a STRING token (tokenType name 'STRING') with `offset > leaf.offset` and `offset < leaf.end`. Failing that, scan forward from the line start, tracking quote state and backslash escapes. Update the 'limitation' assertion in string-utils.spec.ts to expect false.

Verifier: The algorithm does not track whether quotes are open or closed. string-utils.spec.ts line 84 even asserts `true` for the between-strings case with the comment 'limitation: between strings', so this is a known, tested limitation rather than an accident. In detectCompletionContext, the leaf node at an offset just after `addClass("a")` still belongs to that OperationCall. If another string follows on the same line (e.g. `[ addClass("a") ] [ removeClass("b") ]`), isOffsetInStringLiteral returns true and a ClassName context is reported, where the paren fallback would have returned None. css-completion-handler also uses it to decide needsQuotes, so a completion inserted at that spot would leave out its quotes. The trigger is narrow and the impact cosmetic.

### No tests for label-entry-generator (mergeLocaleEntry/generateLocaleEntry) or for rewriteUrls edge cases

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/labels/label-entry-generator.ts:89](../../packages/language/src/labels/label-entry-generator.ts#L89)
- **Category:** test-gap
- **Description:** mergeLocaleEntry and generateLocaleEntry write to user locale files, but no spec references them. The only rewriteUrls specs cover plain relative paths, http/data URLs and Windows backslashes. The defects reported above (`$ref` overwrite, `__proto__` keys, fragment/query/percent-encoded URLs, `@import`) are all uncovered.
- **Failure scenario:** A regression in nested-key merging or `$ref` handling would ship unnoticed, and the quick fix would then corrupt users' locale JSON files.

**Evidence**

```
export function mergeLocaleEntry(existing: ILocalesConfiguration, translationKey: string, languageCodes: string[]): ILocalesConfiguration  // no *.spec.ts imports mergeLocaleEntry
```

**Fix:** Add packages/language/src/labels/__tests__/label-entry-generator.spec.ts covering: new top-level and nested (dotted) keys, merging into an existing nested object without clobbering siblings, a key path that collides with a leaf string, `$ref`-based locale entries left intact, a language code missing from the existing config, and `__proto__`/`constructor` segments rejected. Add the rewriteUrls edge cases (fragment-only, query, percent-encoding, protocol-relative `//host`, `@import`) to css-service.spec.ts.

Verifier: No `*.spec.ts` in packages/ imports label-entry-generator, mergeLocaleEntry or generateLocaleEntry. The only references are language/src/index.ts, the generated out/*.d.ts and extension/src/extension/label-entry-creator.ts, and there is no labels/__tests__ directory. These functions build the content the extension writes to user locale JSON files, so the test gap is real. The specific defects this finding cites (`$ref` overwrite, `__proto__`, URL edge cases) belong to other findings and were not re-checked here.

### Media timeline source (video/audio) is not copied into the bundle and is used as the HTML page title

- **Status:** ✅ Fixed in `e6b5c32` (partial), completed in `c47f7bd`

- **Location:** [packages/cli/src/bundler/index.ts:69](../../packages/cli/src/bundler/index.ts#L69)
- **Category:** bug
- **Description:** For non-raf timelines the compiler sets timeline.uri to the media source path (timeline-transformer.ts:131). The bundler never collects or copies that file. extractConfigAssets only inspects `timelineProviderSettings.*.src/path`, but the compiler emits only positionSource there, and the embedded CONFIG still points at the original relative URI. deriveTitle also uses `timelines[0].uri` verbatim as the page `<title>`.
- **Failure scenario:** `timeline "t" in "#v" using video from "./intro.mp4"` bundles successfully, but the output dir has no intro.mp4. The reviewer expected playback to 404 in the standalone bundle; the verifier found that it fails earlier, at engine init (see the Verifier line). The browser tab title reads './intro.mp4'.

**Evidence**

```
const timelines = config.timelines;
if (timelines?.[0]?.uri) { return timelines[0].uri; }
// extractConfigAssets: const settings = config.timelineProviderSettings; ... settingsWithSrc.src
```

**Fix:** The root cause is in the compiler. generateTimelineProviderSettings (or a per-timeline positionSource override) should emit `positionSource.sources: [{src: timeline.source, type: <mime from extension>}]` and the real `selector` for mediaplayer timelines. The bundler's extractConfigAssets should then collect the `positionSource.sources[].src` entries, both in timelineProviderSettings and in per-timeline positionSource overrides, copy them to assets/, and rewrite them in the embedded config. Do not touch uri, because it is an identifier. deriveTitle should use the timeline name, or `path.basename` of the input, never a uri that may be a file path.

Verifier: The code does what the finding says. timeline-transformer.ts sets `uri = timeline.source || timeline.name` for non-raf providers. generateTimelineProviderSettings (config-builder.ts) emits only `positionSource: { systemName: 'VideoPositionSource', selector: '' }`, with no src, path or sources. extractConfigAssets only looks for `.src` and `.path`, so the media file is never collected or copied. deriveTitle returns `timelines[0].uri` verbatim, so the tab title becomes './intro.mp4'; that part is real but cosmetic. The stated failure mechanism is wrong, though. Eligius never fetches `timeline.uri` as a file: it is only an identifier, used for lookup, playlist selection and the providers-by-uri map in engine-factory.ts and eligius-engine.ts. Eligius 3's VideoPositionSource.doInit rejects with "'sources' is required (an array of {src, type})" when positionSource.sources is missing, and the compiler never emits sources. So a mediaplayer timeline already fails at engine init, in plain compile mode as well as in a bundle, before any 404 could happen. The root cause is in the compiler. The bundler gap only appears once the compiler emits sources, and then the bundler would need to read `positionSource.sources[].src`, not uri. Severity lowered to low: what remains is a cosmetic title bug plus a latent copy gap.

### Temp directory leaks when runtime bundling (or any later step) fails; most I/O failures drop the underlying cause

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/cli/src/bundler/index.ts:149](../../packages/cli/src/bundler/index.ts#L149)
- **Category:** robustness
- **Description:** mkdtemp creates eligian-bundle-* in the OS temp dir. The only fs.rm runs after bundleRuntime succeeds, so an esbuild failure (for example an unresolvable 'eligius' import) returns early and the directory is never removed. Separately, the write and copy catch handlers (`catch: () => new BundleError('Failed to write bundle.js')`, 'Failed to copy asset: ...') ignore the thrown error, so EACCES, ENOSPC and similar errors look the same.
- **Failure scenario:** Each failed `--bundle` run leaves an eligian-bundle-XXXX dir in %TEMP%. A permission error on copy prints only 'Failed to copy asset: `<path>`' with no reason.

**Evidence**

```
const tempDir = yield* Effect.tryPromise({ try: () => fs.mkdtemp(...) ...});
const bundleJS = yield* bundleRuntime({...});
yield* Effect.tryPromise({ try: () => fs.rm(tempDir, ...) ...
```

**Fix:** Use Effect.acquireUseRelease, or Effect.ensuring, around the mkdtemp-to-bundleRuntime block, with `fs.rm(tempDir, {recursive: true, force: true})` as the release step and its result ignored. That cleans up the dir and the entry file on every outcome. Also use Effect.ensuring for the entry-file unlink in runtime-bundler.ts. Include `${error}` or error.message in each BundleError catch message (write index.html, write bundle.js, mkdir, copy asset).

Verifier: The temp dir is created with mkdtemp at index.ts:149, and fs.rm runs only after bundleRuntime succeeds. If findNodeModulesPaths or bundleRuntime fails, the Effect stops early and the directory stays. The leak is worse than an empty dir: runtime-bundler.ts writes entry-`<ts>`.js, containing the full embedded config, into tempDir before esbuild runs, and its unlink also runs only after esbuild succeeds, so on an esbuild failure the entry file stays behind too. The second half also holds: the catch handlers for mkdir, writeFile and copyFile in index.ts ignore the error argument and drop the errno.

### --verbose messages go to stdout and corrupt JSON when output is '-'

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/cli/src/main.ts:117](../../packages/cli/src/main.ts#L117)
- **Category:** bug
- **Description:** Progress output ('Compiling...', 'Validated N asset(s)') uses console.log (stdout), the same stream as the JSON written for `-o -`. Status output should go to stderr when stdout carries data.
- **Failure scenario:** `eligian x.eligian -o - -v > out.json` produces a file starting with 'Compiling x.eligian...' and a '✓ Validated 2 asset(s)' line (with ANSI codes), so it is not valid JSON.

**Evidence**

```
console.log(chalk.blue(`Compiling ${inputPath}...`));
...
console.log(chalk.green(`✓ Validated ${result.assetCount} asset(s)`));
...
if (outputPath === '-') { console.log(result.json); }
```

**Fix:** Send the verbose and progress messages, and all non-data status output, to console.error (stderr) unconditionally, or at least when `options.output === '-'`. Keep console.log only for the JSON payload.

Verifier: compileFileCLI calls console.log for 'Compiling ...' (line 117) and '✓ Validated N asset(s)' (line 128) when verbose is set. When `outputPath === '-'`, it writes the JSON with console.log, which is also stdout. Nothing guards the verbose lines in stdout mode, so `-o - -v > out.json` produces invalid JSON. The success message is already skipped for '-', which shows the intent to keep stdout clean; verbose was simply missed. It only happens with -v, hence low severity.

### Several CLI flags are silently ignored in --bundle mode and --inline-threshold accepts garbage

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/cli/src/main.ts:252](../../packages/cli/src/main.ts#L252)
- **Category:** inconsistency
- **Description:** With `--bundle`, `--check` is ignored (a bundle is still written) and `--no-optimize` is ignored (createBundle hardcodes `optimize: true`). parseInt accepts partial and negative input: '10kb' becomes 10, and '-5' disables inlining without any error. `--minify` in bundle mode controls JS/CSS rather than JSON, which is undocumented.
- **Failure scenario:** `eligian x.eligian --bundle --check` writes a full bundle directory even though the user asked for validation only. `--inline-threshold 8k` silently becomes 8 bytes.

**Evidence**

```
const inlineThreshold = parseInt(cmdOptions.inlineThreshold as string, 10);
if (Number.isNaN(inlineThreshold)) {...}
// bundler: compileFile(inputPath, { optimize: true })
```

**Fix:** Validate `--inline-threshold` with `/^\d+$/` and reject anything else with a clear error; optionally accept k/KB suffixes explicitly. In the action handler, either reject `--bundle --check` as mutually exclusive or make bundleCLI run compileFile only and report validity. Add `optimize?: boolean` to BundleOptions and defaultBundleOptions, thread `options.optimize` from bundleCLI, and use it in createBundle's compileFile call. Update the `--minify` help text to say it also minifies the bundle's JS and CSS.

Verifier: bundleCLI never reads options.check, so `--bundle --check` writes a full bundle. createBundle hardcodes `compileFile(inputPath, { optimize: true })`, and BundleOptions has no optimize field, so `--no-optimize` is silently ignored. `parseInt('8k', 10)` is 8 and `parseInt('10kb', 10)` is 10, and the only guard is Number.isNaN. A negative value passes, and since no asset size is <= a negative number, inlining is silently disabled. `--minify` in bundle mode goes to processCSS and esbuild, not to the JSON output, and the help text only says 'minify JSON output'. All of this is real, but these are input-validation and UX inconsistencies, not crashes, so low severity.

### --force bundles are written over the existing directory without cleaning, leaving stale assets

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/cli/src/bundler/index.ts:198](../../packages/cli/src/bundler/index.ts#L198)
- **Category:** bug
- **Description:** With `--force` the existing output dir is reused (`mkdir` recursive) and files are overwritten, but previously emitted `assets/*` that are no longer referenced are never removed. Stale files remain and are not counted in the stats.
- **Failure scenario:** A first bundle copies assets/big.mp4. After the reference is removed and the bundle is rebuilt with `--force`, big.mp4 is still shipped in the output directory.

**Evidence**

```
yield* Effect.tryPromise({ try: () => fs.mkdir(outputDir, { recursive: true }), ...});
```

**Fix:** Under `--force`, delete only what the bundler owns: `fs.rm(path.join(outputDir,'assets'),{recursive:true,force:true})` plus index.html and bundle.js (and bundle.js.map) before writing. Do not remove the whole outputDir, because the user may point `--output` at a directory that holds other content. Another option is to build into a sibling temp dir and rename it into place.

Verifier: In packages/cli/src/bundler/index.ts, the only check on an existing output dir is at line 106 (`if (!resolvedOptions.force && directoryExists(outputDir))`). With `--force` the code runs `fs.mkdir(outputDir, {recursive:true})`, then writes index.html and bundle.js and copies each non-inlined asset into assets/. Nothing removes files that are already there; the only `fs.rm` in the file deletes the temp esbuild dir. Asset output names come from generateUniqueOutputPath in asset-collector.ts: `assets/<fileName>`, with a hash suffix only when two sources share a name. So an asset that was dropped, renamed, or whose collision hash changed stays in assets/ after a `--force` rebuild and is not listed in the BundleFile stats. The scenario is real but low impact: extra bytes ship, and nothing breaks at runtime.

### HTML and labels watchers ignore create events, so a delete followed by create (atomic save, git checkout) permanently stops hot-reload

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/base-watcher-manager.ts:268](../../packages/extension/src/extension/base-watcher-manager.ts#L268)
- **Category:** bug
- **Description:** handleFileDelete removes the path from trackedFiles for every watcher, but only the CSS watcher registers onDidCreate (watchCreate) to re-add it. HTML and labels watchers set no watchCreate, so after a delete event the file is untracked and later change events are dropped by the `if (!this.trackedFiles.has(filePath))` guard. For 'one' imports the server will not re-send the import notification either (see the hasImport finding), so nothing re-tracks the file. A missing file that is created later also never triggers revalidation, so the 'file not found' diagnostic stays.
- **Failure scenario:** A tool saves layout.html through temp-file-and-rename, or a branch switch deletes and recreates labels.json. The delete event untracks the file and the create event is ignored, so later edits to layout.html or labels.json never produce HTML_UPDATED or LABELS_UPDATED. Likewise, creating the file after the user imported a not-yet-existing `locales "./en-US.json"` does not clear the error.

**Evidence**

```
if (wasTracked) {
  this.trackedFiles.delete(filePath);
...
// config: watchCreate is only set in css-watcher.ts ('watchCreate: true'); html-watcher.ts / labels-watcher.ts omit it
```

**Fix:** Register onDidCreate for every watcher (drop the flag, or default it to true). Re-add the path to trackedFiles whenever importsByFile has the URI, and send the update notification, as handleFileCreate already does for CSS.

Verifier: Only css-watcher.ts sets watchCreate, so HTML and labels watchers register no onDidCreate. handleFileDelete removes the path from trackedFiles, and handleFileChange then drops later change events for that path. Since the server never re-sends the one-to-one notification (the retarget finding), nothing re-tracks the file after a genuine delete followed by a later recreate. The atomic-save scenario is overstated: VS Code's file-event coalescer turns a DELETED followed by an ADDED event for the same path in one batch into a CHANGED event, so temp-file-and-rename saves usually arrive as a change and are not affected. If an imported file was missing at registration, it is still added to trackedFiles (registerImportsInternal tracks it whether or not it exists); creating it later sends no notification, but the next edit to it is processed, and editing the .eligian document also re-reads the file in the Parsed build phase. The labels half does not apply in practice, because labels imports are never registered (see the retarget finding). What remains is a real but narrow problem: the HTML layout file is deleted and restored outside one coalesced batch.

### Language client start failure aborts activation, so unrelated commands (compile, preview, locale editor) never get registered

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/main.ts:44](../../packages/extension/src/extension/main.ts#L44)
- **Category:** robustness
- **Description:** activate() awaits startLanguageClient() as its first statement and has no try/catch. If client.start() rejects (missing out/language/main.cjs, a server crash on init, a port 6009 conflict in debug mode), activate rejects before any command, custom editor or provider is registered. Compile and Preview only need the in-process compiler, and the locale editor needs nothing from the LSP, yet they become 'command not found'. The partly started client is not stopped, and the user sees nothing beyond VS Code's generic activation failure.
- **Failure scenario:** The packaged server bundle is missing, or the server throws during initialization. client.start() rejects and activate() rejects. 'Eligian: Compile Current File' and 'Eligian: Preview Timeline' report 'command not found' instead of working without LSP features.

**Evidence**

```
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Start language client first
  client = await startLanguageClient(context);
```

**Fix:** Register the parts that do not need the client first (diagnostics, locale editor provider, link provider, openLocaleFile, compile, preview, locale/labels commands, PreviewManager/output-channel disposers). Then put startLanguageClient in try/catch. On failure, show a `vscode.window.showErrorMessage` saying LSP features are unavailable, call `client?.stop()` on the partly started client, and skip the pieces that need the client (the three watchers and their onNotification handlers, the JSDoc command, BlockLabelDecorationProvider).

Verifier: packages/extension/src/extension/main.ts:44: the first thing activate() does is `client = await startLanguageClient(context)`, and nothing catches an error from it. startLanguageClient awaits client.start() (line 247). If that rejects, activate() rejects before line 110, so the diagnostics collection, the locale custom editor, the link provider, compile, preview, the locale commands and the create-labels commands are never registered, and VS Code reports 'command not found' for the contributed commands. `registerCompileCommand()` and `registerPreviewCommand(context)` take no client and could work without the LSP. The scenario needs a broken install (missing out/language/main.cjs) or a server crash during initialize, which is uncommon and leaves the extension mostly useless anyway. That makes this a robustness or graceful-degradation issue, so low rather than medium.

### Labels hot-reload with invalid JSON neither updates the registry nor revalidates importing documents

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/language/main.ts:117](../../packages/extension/src/language/main.ts#L117)
- **Category:** bug
- **Description:** In the LABELS_UPDATED handler, triggerRevalidation is only called inside `if (!validationError)`. When the saved labels file is syntactically or schema-invalid, the handler does nothing. The comment says the validator will show the error, but no revalidation is triggered, so the validator does not run, and the registry keeps the old keys. This is inconsistent with the Parsed-phase path (processImports.parseFile), which registers empty metadata on a validation error.
- **Failure scenario:** The user has a valid locales.json imported by doc.eligian, introduces a trailing comma and saves. LABELS_UPDATED arrives, validateLocalesJSON returns an error, and the handler returns. doc.eligian shows no diagnostic and still offers and validates the old keys until the document is next edited. A full reparse then registers empty metadata, which gives different results from the hot-reload path.

**Evidence**

```
if (!validationError) {
  ...
  triggerRevalidation(documentUris);
}
// If validation error, we don't update the registry
// The validator will handle showing the error to the user
```

**Fix:** Call `triggerRevalidation(documentUris)` in the validationError branch as well. The rebuild reruns the Parsed-phase processImports, which registers [] for an invalid file. For immediate consistency, you can also call `labelRegistry.updateLabelsFile(labelsFileUri, [])` first. Separately, the program validator reports schema-invalid but syntactically valid JSON only if JSON.parse throws; consider calling validateLocalesJSON there so schema errors are also reported.

Verifier: In language/main.ts:117-130, triggerRevalidation is only called when validateLocalesJSON returns no error. The comment says the validator will show the error, but that validator (checkLocalesImports in validators/program/asset-import-validator.ts, which emits the warning 'Failed to parse locales file') only runs when the document is revalidated. JSON.parse does not throw on this path, because validateLocalesJSON catches syntax errors itself, so the outer catch that clears the registry is not reached either. Result: after a broken save the registry keeps the old keys, and no new diagnostic appears until the .eligian document is edited. The finding is correct. The effect is a stale diagnostic until the next edit, with no data loss, so severity was lowered to low. Calling triggerRevalidation alone would be enough: DocumentBuilder.update reruns the Parsed phase, where the processImports labels parseFile already returns [] on a validation error and so clears the registry.

### Stale CSS is never removed from the preview, and css-reload is a silent no-op for unknown ids

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/webview-css-injector.ts:383](../../packages/extension/src/extension/webview-css-injector.ts#L383)
- **Category:** bug
- **Description:** removeCSS() has no callers. On each recompile, injectCSS only sends css-load for the currently imported files. The webview's css-load updates an existing style tag's content but never reorders it. Style tags for CSS imports removed from the source therefore stay in the document head, and the load-order attribute is not updated when imports are reordered. In PreviewPanel, trackedFiles also only grows, so a removed import keeps being watched. The webview's css-reload handler does nothing when the style tag does not exist.
- **Failure scenario:** The user removes `styles "./dark.css"` from the source, and the preview recompiles. The dark.css style tag remains in the head and still styles the preview, so the preview does not match the compiled output. Reordering two styles imports likewise does not change the cascade order.

**Evidence**

```
removeCSS(cssFile: string): void { ... type: 'css-remove' ...}  // no call sites
// media/preview.ts: case 'css-load': if (!styleTag) { ... appendChild } styleTag.textContent = content;
```

**Fix:** In WebviewCSSInjector.injectCSS, compute the new id set and call removeCSS for each id in `this.loadedCSS` that is not in it. Make the webview's css-load handler place the tag in order (remove and re-append in loadOrder, or insert before the first tag with a higher data-load-order). Also call `injectCSS([])` (or a clear) when `cssFiles.length === 0`, so the last removed import is cleared. Make css-reload create the tag when it is missing. Reset or replace the preview CSS watcher's tracked set on each compile (startWatching with the current list).

Verifier: A search for callers of removeCSS outside tests finds none, so 'css-remove' is never sent. PreviewPanel sets webview.html only once (line 87), in the constructor. Each recompile calls `cssInjector.injectCSS(absoluteCSSFiles)` only for the files currently imported, and only when `cssFiles.length > 0`. In media/preview.ts, the css-load handler reuses an existing `style[data-css-id]` tag and just replaces its textContent; it never moves the tag or updates data-load-order. So a removed styles import keeps styling the preview, reordering imports does not change cascade order, and removing the last import leaves every style tag in place. The base watcher's trackedFiles only grows, by design (its own comment says so), so removed imports stay watched. The css-reload handler does nothing when no tag exists, so a CSS file that failed its initial load and is then fixed does not appear until the next recompile. The finding is real but limited to the preview, so low.

### rewriteUrls rewrites url(#frag), query/fragment suffixes and protocol-relative URLs as file paths

- **Status:** ✅ Already fixed by an earlier commit on this branch (regression test added in `e6b5c32`)

- **Location:** [packages/language/src/css/css-service.ts:147](../../packages/language/src/css/css-service.ts#L147)
- **Category:** bug
- **Description:** The skip list covers only http://, https:// and data:. Everything else goes to path.resolve and then to the converter, which calls vscode.Uri.file on the path. This breaks several forms. `url(#clip)` (SVG fragment references) becomes a file URI under the CSS directory. Font URLs such as `url(font.woff2?v=3)` or `url(font.eot?#iefix)` keep the '?...' as part of the filename, and Uri.file encodes it as %3F, so the file is not found. `url(//cdn.example.com/x.png)` and `url(blob:...)` are treated as local paths. The webview converter in the extension has no query/fragment handling either. (This is the extension-core reviewer's view of the same function as the medium rewriteUrls finding above.)
- **Failure scenario:** The CSS contains `@font-face { src: url("fonts/a.eot?#iefix") }` or `.m { mask: url(#m1) }`. The preview rewrites them to vscode-resource URIs pointing at nonexistent files like `.../fonts/a.eot%3F%23iefix` and `.../#m1`. Fonts fail to load and the SVG reference breaks.

**Evidence**

```
const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
...
if (urlPath.startsWith('http://') || urlPath.startsWith('https://') || urlPath.startsWith('data:')) { return match; }
const absolutePath = path.resolve(cssDir, urlPath);
```

**Fix:** Return the match unchanged when urlPath starts with '#' or '//', or matches `/^[a-z][a-z0-9+.-]*:/i` (any scheme). Otherwise split at the first '?' or '#', resolve only the path part, convert it with the converter, and re-append the suffix to the converted URI string. Change the converter interface to accept query/fragment, or append them in rewriteUrls. Also trim whitespace inside `url( )` before testing.

Verifier: In language/src/css/css-service.ts:147-170, the only values skipped are those starting with http://, https:// or data:. Everything else goes through `path.resolve(cssDir, urlPath)`, then VSCodeWebviewUriConverter, which calls `vscode.Uri.file(path)`. Uri.file treats '?' and '#' as part of the path and percent-encodes them, so `url(#m1)`, `url(font.woff2?v=3)`, `url(//cdn/x.png)` and `url(blob:...)` all become broken vscode-resource file URIs. A repo search shows rewriteUrls is used only by the extension preview (css-loader.ts and css-service.ts:209); compiled output and the CLI bundler are not affected. The specific '?#iefix' EOT example is mostly harmless, because browsers skip `format('embedded-opentype')` sources and use the woff/woff2 entries. Query-string cache busting on a woff2 and SVG fragment refs do break, but only in the preview, so low rather than medium.

### JSDoc auto-close inserts a duplicate '*/' when the second '*' is typed on an existing block comment

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/commands/jsdoc.ts:108](../../packages/extension/src/extension/commands/jsdoc.ts#L108)
- **Category:** bug
- **Description:** The handler fires for any single-character `*` insertion whose preceding text ends with `/**`. It never checks whether a `*/` already follows on the line, or whether the cursor is inside a string or line comment. It then always inserts ` */` and runs eligian.generateJSDoc. generateJSDoc also uses the first `*/` on the line, which can belong to a different comment. language-configuration.json has no `/**` auto-closing pair, so this handler is the only source of the closing `*/`, and it produces a duplicate when an existing comment is edited. There is no test for this path.
- **Failure scenario:** The line reads `/* note */`, and the user turns it into a doc comment by typing a second `*`. The text becomes `/** */ note */` (a stray `*/` and a broken comment), and generateJSDoc may inject a template.

**Evidence**

```
if (text === '*') { ... if (textBeforeCursor.trimEnd().endsWith('/**')) {
  await editor.edit((editBuilder) => { editBuilder.insert(position, ' */'); }, ...
```

**Fix:** Before inserting, check that the rest of the line after `position` has no `*/`. Also check that the text before `/**` on the line has no `//` and no unbalanced quote; a cheap check is whether a `*/` appears before the next `/*` in the rest of the document. In generateJSDoc, search for `*/` only after jsdocStart+3: `lineText.indexOf('*/', jsdocStart + 3)`. Add a unit test that drives onDidChangeTextDocument through a mocked editor.

Verifier: In jsdoc.ts:76-125, the handler fires on any single-change `*` insertion where `getText(0..position)`, after trimEnd(), ends with `/**`. Because the change range is empty, `position` (end.character + 1) lands right after the typed `*`. Nothing checks whether a `*/` already follows on the line, or whether the cursor is in a string or a `//` comment, so `/* note */` plus a typed `*` becomes `/** */ note */`. language-configuration.json confirms there is no `/**` autoClosingPair, so this handler is the only source of the closing `*/`. Two smaller points: the trimEnd() means trailing whitespace before the cursor is ignored, and generateJSDoc's `lineText.indexOf('*/')` takes the first `*/` on the line. No spec exists for jsdoc.ts; the extension `__tests__` directory has no jsdoc or compile specs. Severity stays low because the trigger needs an existing block comment being converted, and Ctrl+Z recovers.

### Compile command reports defects as 'Unknown Error: {}' and leaves post-write failures unhandled

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/commands/compile.ts:119](../../packages/extension/src/extension/commands/compile.ts#L119)
- **Category:** robustness
- **Description:** On a defect or interruption, causeToError returns `Cause.squash(cause)`, which is typically an Error instance rather than a tagged CompilerError. The result is cast to CompilerError and passed to formatErrors, whose default branch renders `` `Unknown Error: ${JSON.stringify(error)}` ``. For an Error that is '{}', so the message and stack are lost. Also, `vscode.workspace.openTextDocument` and `showTextDocument` after the write are outside any try/catch, so a failure there shows up only as VS Code's generic command error after the 'Compiled' toast.
- **Failure scenario:** The compiler throws a TypeError inside a transformer (a defect). The output channel shows 'Unknown Error: {}' with no message, so the user cannot report or diagnose it.

**Evidence**

```
const actualError = causeToError(exit.cause) as CompilerError;
reportCompilationFailure([actualError], sourceCode);
```

**Fix:** In compile.ts, branch on the Cause. If `Cause.findErrorOption` is Some and the value has a string `_tag`, use formatErrors as now. Otherwise, write `Internal compiler error:` plus `Cause.pretty(exit.cause)` to the output channel; Cause.pretty includes the stack. As further hardening, make error-reporter's default branch render `error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)`, which covers the CLI too. Wrap the open/show steps in try/catch and show a non-fatal warning there.

Verifier: The compile type (pipeline.ts:103) declares only tagged errors in its failure channel, and the pipeline has no catchDefect or sandbox. Defects can still happen: loadProgramAssets is called synchronously inside Effect.gen and is not wrapped, and transformers can throw. In that case causeToError returns `Cause.squash(cause)`, which is the original Error, and that Error goes to formatErrors. Its `_tag` is undefined, so error-reporter.ts:162-170 takes the default branch and prints `` `Unknown Error: ${JSON.stringify(error)}` ``. Error's message and stack are non-enumerable, so this prints '{}'. An interruption squashes to an Error-like value too. The post-write openTextDocument and showTextDocument calls (compile.ts:145-150) are outside any try/catch; a failure there rejects the withProgress callback, and VS Code shows only a generic command error. That is a cosmetic gap and rare. Low severity is right: it affects diagnosability, not correctness.

### LSP update notifications are fire-and-forget promises that can reject when the client is not running

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/css-watcher.ts:35](../../packages/extension/src/extension/css-watcher.ts#L35)
- **Category:** robustness
- **Description:** sendUpdateNotification (css/html/labels) calls `c.sendNotification(...)` without awaiting or catching it. LanguageClient.sendNotification returns a promise that rejects when the client is not in the running state (stopped, restarting after a crash, or during deactivate). The debounce timer and watcher event callbacks do not catch it, so this becomes an unhandled promise rejection in the extension host.
- **Failure scenario:** The language server crashes and the client is restarting, or the extension is deactivating. A CSS file is saved, the 300ms debounce fires, and sendNotification rejects with 'Client is not running'. The extension host logs an unhandled rejection.

**Evidence**

```
sendUpdateNotification: (c, cssFileUri, documentUris) => {
  c.sendNotification(CSS_UPDATED_NOTIFICATION, { cssFileUri, documentUris });
},
```

**Fix:** Change the FileWatcherConfig.sendUpdateNotification return type to `Promise<void> | void`, and have each callback `return c.sendNotification(...)`. In notifyFileChanged, wrap the call as `void Promise.resolve().then(() => this.config.sendUpdateNotification(...)).catch(() => {})`; the .then form also catches synchronous throws. You can also return early when `!this.client.isRunning()`.

Verifier: Checked node_modules/vscode-languageclient 9.0.1, lib/common/client.js:420-423: `async sendNotification` returns `Promise.reject(ResponseError('Client is not running'))` when $state is StartFailed, Stopping or Stopped. The CSS, HTML and labels sendUpdateNotification callbacks call `c.sendNotification(...)` and drop the promise, and the config type declares them as returning void. base-watcher-manager.ts notifyFileChanged (:304-311) calls the callback inside the debounce timer or the delete/create handlers without catching; its only guard is `!this.client`, which does not check isRunning(). The onChange callback is wrapped in .catch, but the notification is not. StartFailed is a persistent state, so if the server fails to start, every save of an imported CSS, HTML or labels file logs an unhandled rejection, and crash-restart windows and deactivate do the same. The impact is only console noise in the extension host, so low is right.

### Parsed-phase handler synchronously re-reads and re-parses every CSS/labels/HTML import on every document rebuild

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/language/main.ts:183](../../packages/extension/src/language/main.ts#L183)
- **Category:** performance
- **Description:** The onBuildPhase(Parsed) handler calls processImports three times per .eligian document. Each call does readFileSync plus parseCSS (PostCSS), JSON validation or an HTML read for every import, on the language-server main thread. This happens on every rebuild, including each reparse triggered by typing, even though the files have not changed. The hot-reload notifications already exist to refresh the registries when files do change. Large CSS files (framework-sized) slow down typing and completion.
- **Failure scenario:** A document imports a 300KB CSS file. Every edit (after Langium's update debounce) re-reads and re-parses it synchronously, adding tens of milliseconds of blocking work per rebuild.

**Evidence**

```
shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Parsed, async documents => { ... processImports(documentUri, root, docDir, connection, cssConfig); ... readFileSync(absolutePath, 'utf-8'); config.parseFile(content, absolutePath);
```

**Fix:** Keep a `Map<absolutePath, {mtimeMs, size, metadata}>` in processImports, or one per config. Use fs.statSync and reuse the cached metadata when mtime and size match; the stat is much cheaper than the PostCSS parse. Invalidate the cache entry in the CSS_UPDATED and HTML_UPDATED handlers. As a separate fix, change the labels config importType to 'locales', or remove that pass, since it is currently dead.

Verifier: In language/main.ts:183-260, the onBuildPhase(DocumentState.Parsed) handler runs processImports three times for every .eligian document in each build batch. processImports (import-processor.ts) calls readFileSync and then config.parseFile for each matching import on every pass, with no cache. For CSS that means a PostCSS parse through parseCSS on the server thread for every rebuild triggered by typing, as the finding says. A correction to the evidence: the labels pass never does any work, because its importType is 'labels' while the grammar and generated ast.ts define DefaultImport.type as 'layout' | 'locales' | 'provider' | 'styles'. So only the CSS and HTML passes do I/O. That labels path is dead code; the label-parameter-validator loads locales itself (label-parameter-validator.ts:262), and import-processor.spec hides the problem by mocking type 'labels'. Severity stays low: the cost scales with the size of the imported CSS and only matters for framework-sized stylesheets. The mtime-cache fix is sound, because the CSS_UPDATED notification handler re-reads independently.

### No tests for watcher lifecycle (delete/create/debounce/dispose), command handlers, or retargeted imports

- **Status:** ✅ Fixed in `e6b5c32` (partial), completed in `c47f7bd`

- **Location:** [packages/extension/src/extension/base-watcher-manager.ts:288](../../packages/extension/src/extension/base-watcher-manager.ts#L288)
- **Category:** test-gap
- **Description:** The existing watcher specs only cover reverse-mapping cleanup (registerImports twice for the same document). Nothing exercises debounce coalescing, the delete-then-create sequence, the CSS behaviour on deleting an untracked file, or dispose() clearing timers and the watcher. debounce-util.ts has no spec. The mock's createFileSystemWatcher cannot fire events. There are no specs for compile.ts (including the output-path derivation), jsdoc.ts, locale.ts, or processImports with a changed import path. The defects in this report sit on exactly these paths.
- **Failure scenario:** A regression such as untracking on delete without re-tracking on create, or an output path equal to the input path, passes the suite because nothing exercises these paths.

**Evidence**

```
debounce(this.debounceTimers, filePath, this.debounceDelay, () => { ... }) // no spec references debounce, handleFileDelete, handleFileCreate; mocks: createFileSystemWatcher: () => ({ onDidCreate: () => ({ dispose: () => {} }), ...
```

**Fix:** Make the vscode mock's createFileSystemWatcher return EventEmitter-backed onDidCreate, onDidChange and onDidDelete that a test can fire. Then add `vi.useFakeTimers()` tests for debounce coalescing (several changes within 300ms give one notification), delete-then-create re-tracking, the CSS notify-on-untracked-delete case, and dispose() clearing timers. Add a processImports test where the document's layout or styles path changes between two calls, and assert that registerImports and the notification reflect the new file. Use AST type values the grammar can produce ('locales', not 'labels'). Add compile.ts specs for output-path derivation and for defect reporting.

Verifier: The extension's watcher specs are only the `*-watcher-mapping-cleanup.spec.ts` files. Nothing references debounce, handleFileDelete, handleFileCreate or onDidDelete, and there is no debounce-util spec. In `__mocks__` (lines 56-61), createFileSystemWatcher returns no-op onDidCreate/onDidChange/onDidDelete, so tests cannot fire events. The commands/ directory (compile.ts, jsdoc.ts, locale.ts, preview.ts) has no specs. import-processor.spec.ts does exist and covers path resolution, multiple CSS files, hasImport loop prevention, missing files and partial failure, but has no case for an import path that changes between passes. That gap matters: for one-to-one imports, hasImport makes isNewImport false, so a retargeted layout import never sends the discovered notification. The labels tests also use a mock type 'labels' that the grammar cannot produce (the grammar keyword is 'locales'), which hides the fact that the labels pass is dead in language/main.ts. The test gap is real and low severity.

### Preview diagnostics are never cleared when the preview panel closes, so stale Problems entries persist

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/preview/PreviewPanel.ts:193](../../packages/extension/src/extension/preview/PreviewPanel.ts#L193)
- **Category:** bug
- **Description:** Diagnostics are written to the static 'eligian-preview' collection on compile failure, and they are cleared only after a later successful compile in the same panel. handleDispose never calls `PreviewPanel.diagnostics.delete(documentUri)`, and it does not guard against an in-flight compileAndUpdate setting diagnostics after disposal.
- **Failure scenario:** A save fails to compile, and an 'Eligian Preview' error is added to the Problems panel. The user closes the preview, fixes the file and saves. The panel is gone, so nothing recompiles and nothing clears the entry, and the stale error stays until the extension reloads. An in-flight compile that finishes after the panel was closed can also re-add diagnostics.

**Evidence**

```
private handleDispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Destroy Eligius engine
    this.engineService.destroy();
 ... (no PreviewPanel.diagnostics.delete(this.documentUri))
```

**Fix:** In handleDispose, call `PreviewPanel.diagnostics?.delete(this.documentUri)`. In compileAndUpdate, add `if (this.isDisposed) return;` after the compile await, before any diagnostics.set or postMessage.

Verifier: PreviewPanel.handleDispose destroys the engine and disposes the file watcher, the CSS watcher and other disposables, but never calls `PreviewPanel.diagnostics.delete(this.documentUri)`. The only writes to the collection are inside compileAndUpdate: `set(uri, [])` on success and `set(uri, vsDiagnostics)` on failure. A repo-wide search for diagnostics.delete or diagnostics.clear finds nothing outside the static disposeDiagnostics, which runs only on extension deactivation. Once the panel is closed, nothing recompiles that document's preview, so the 'Eligian Preview' entries stay in Problems until reload. compileAndUpdate also has no isDisposed check after its awaits, so a compile in flight can set diagnostics after disposal. The language server publishes its own diagnostics for the real errors, so these entries are stale duplicates. They are confusing, but no output is affected, so low rather than medium.

### Compiler error messages are injected into the webview with innerHTML without escaping

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/media/preview.ts:354](../../packages/extension/media/preview.ts#L354)
- **Category:** security
- **Description:** The 'showError' handler builds markup from error.message, error.code and error.severity with template strings and assigns it to innerHTML. Messages contain text from the source, such as import paths, string literals and Chevrotain token text. The CSP (`script-src ${cspSource}`, no unsafe-inline) blocks script execution, but injected markup still corrupts or hides the message, and it can load images and apply styles. EventbusDebugViewer.renderEvents (line ~285-312) has the same problem: it writes eventName, eventTopic and `JSON.stringify(args)` into innerHTML. Operation data in those args routinely holds HTML strings, which then render as live DOM in the debug panel.
- **Failure scenario:** A source file contains `import layout "./<b>x.html"` or an unterminated construct, and the error message contains `<b>` or `<style>...`. The webview renders the markup instead of showing the text, so the message is truncated or hidden, and an injected `<style>` or `<img src=https://...>` affects the whole preview. In the debug viewer, an event whose args contain `<link rel=stylesheet ...>` or `<style>` restyles the page.

**Evidence**

```
errorList.innerHTML = message.payload.errors
        .map(
          (error: any) =>
            `<div class="error-item ${error.severity || 'error'}">
          ...
          <div class="error-message">${error.message}</div>
```

**Fix:** Build the error items and debug-event rows with `document.createElement`, and set textContent for message, code, eventName, eventTopic and argsJson; inside a `<pre>`, textContent keeps the JSON formatting. Take the severity class from an allow-list ('error' or 'warning'), not raw input. A small escapeHtml helper over each interpolated value would also work.

Verifier: The 'showError' handler in media/preview.ts puts error.message, error.severity and error.code into an innerHTML template with no escaping. EventbusDebugViewer.renderEvents does the same with eventName, eventTopic and `JSON.stringify(args)`. The CSP in preview.html allows `style-src 'unsafe-inline'` and `img-src https:`, so injected `<style>` or `<img>` tags would take effect. The security framing is overstated, though. All of this text comes from the author's own .eligian source and compiled config, and the same webview already renders that author's arbitrary layout HTML through Eligius. No trust boundary is crossed, and script-src blocks inline script. What remains is a display bug: messages or event args containing `<...>`, such as HTML strings in operation data or type text with angle brackets, render as markup or vanish instead of showing as text. That is low severity, not a medium security issue.

### Invalid JSON in the document leaves a stale documentConfigs entry, and the next webview edit overwrites the whole document with it

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts:275](../../packages/extension/src/extension/locale-editor/LocaleEditorProvider.ts#L275)
- **Category:** bug
- **Description:** updateWebview and the file-watcher callback update documentConfigs only when parseLocalesConfiguration succeeds. On failure they fall back to the legacy parseLabels path, which for a non-array posts a legacy 'reload' with `labels: []` and leaves the old config cached. Every webview edit (update-translation, add-key and so on) is computed from that cached config, and saveConfig then replaces the entire document text with the serialized result.
- **Failure scenario:** The locale file is open in the custom editor and also in a text editor beside it. The user types in the text editor, and the JSON is briefly invalid (a missing comma). The webview receives a bogus legacy reload with `labels: []`. The user then edits a translation in the webview, and saveConfig replaces lines 0..lineCount with JSON.stringify of the old cached config. The text-editor changes are discarded, and the user's unsaved work is lost with no error shown.

**Evidence**

```
const parseResult = parseLocalesConfiguration(document.getText());
    if (parseResult.success && parseResult.config) {
      ...
    } else {
      // Fallback to legacy format
      const labels = parseLabels(document.getText());
 ...
private saveConfig(...) { const json = JSON.stringify(config, null, 2);
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), json);
```

**Fix:** In each mutating handler, re-parse `document.getText()` instead of trusting documentConfigs. If the parse fails, refuse the edit and post an error or read-only state to the webview. In updateWebview, delete the cached config on a parse failure, and fall back to the legacy path only when the JSON parses as an array.

Verifier: updateWebview runs from onDidChangeTextDocument for any non-webview change, including typing in a side-by-side text editor. It calls documentConfigs.set only when parseLocalesConfiguration succeeds. On invalid JSON it falls back to parseLabels, which returns [] on a JSON.parse error, and posts a legacy reload. The new-format UI ignores that message (it updates the hidden legacy state), so the webview still shows the old tree, and documentConfigs keeps the last valid config. The update-translation, add-key, delete-key, rename-key and add-locale handlers in locale-message-handler.ts read that cached config, and saveConfig replaces `Range(0,0,lineCount,0)` with its serialization. That silently drops any text-editor changes made since the last parseable state. The impact is smaller than claimed: the cache refreshes on every valid parse, so only the edits since the last valid JSON state are lost; the overwrite is a normal WorkspaceEdit, so Undo restores it; and the scenario needs both editors open on the same file. Low severity.

### createLabelEntry read-modify-writes the file on disk and ignores an open or dirty editor buffer

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/label-entry-creator.ts:155](../../packages/extension/src/extension/label-entry-creator.ts#L155)
- **Category:** bug
- **Description:** The function reads the file with workspace.fs.readFile and writes it back with workspace.fs.writeFile, never consulting `vscode.workspace.textDocuments`. The locale editor applies every webview change to the TextDocument immediately, so the document is dirty until it is saved, and the creator merges onto a stale disk version. It also serializes with `JSON.stringify(..., null, 2)`, which reformats the whole file. Two quick fixes run in quick succession can race, because both read the same original content and the later write drops the earlier key.
- **Failure scenario:** The user has the locale editor open with unsaved edits, such as a newly added key, and triggers 'Create label entry' from the .eligian file. The disk file is read without those edits, and the new key is written onto it. The dirty buffer now conflicts with the file on disk: saving the buffer asks to overwrite, which drops the new entry, or the user's edits are lost.

**Evidence**

```
const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      existingContent = Buffer.from(contentBytes).toString('utf-8');
...
      await vscode.workspace.fs.writeFile(fileUri, contentBytes);
```

**Fix:** Read the current text with `vscode.workspace.openTextDocument(fileUri)`, which returns the dirty buffer if one is open. Apply the merged result as a WorkspaceEdit that replaces the full range, then call `document.save()`; the open locale editor then picks up the change through onDidChangeTextDocument. To select the new key, post 'select-key' to the existing panel, because consumePendingSelection only runs on 'ready'.

Verifier: createLabelEntry (registered as the eligian.createLabelEntry command in main.ts) reads with workspace.fs.readFile and writes with workspace.fs.writeFile, and never checks workspace.textDocuments. The locale editor applies every webview change as a WorkspaceEdit, so the document stays dirty until Ctrl+S. If the user runs the quick fix while the buffer is dirty, the new key goes onto the stale disk content, and the dirty buffer then conflicts with the disk. The loss is not silent, though: on save, VS Code shows its 'file is newer' conflict dialog (Compare/Overwrite), so the user picks which version to keep. A related problem the reviewer missed: openLabelEditorWithSelection runs vscode.openWith on an already-open custom editor, which only reveals it, so no new 'ready' message arrives, the pending selection is not consumed, and the dirty webview never shows the new key. The race between two quick fixes needs two command invocations to overlap a few ms of file I/O, which is unlikely. Low severity.

### MediaResolver rewrites any string that ends in a media extension, and its missing-file warning can never fire

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/preview/MediaResolver.ts:158](../../packages/extension/src/extension/preview/MediaResolver.ts#L158)
- **Category:** bug
- **Description:** isMediaProperty returns true when the property name matches; otherwise it returns true when `getMediaType(value) !== null`. Since findMediaReferences also requires getMediaType(value) to be non-null, the property-name check makes no difference. Every string value anywhere in the config that ends in .png, .mp3, .ogg and so on is treated as a media path and replaced with a webview URI, including label text, template text and selector text. Separately, missingFiles is only pushed to inside the catch of asWebviewUri (line ~222), which never throws for a normal path. The file's existence is never checked, so PreviewPanel's 'media file(s) not found' warning is dead code.
- **Failure scenario:** An operation sets the text 'Save the image as photo.png'. The preview shows 'vscode-resource.../photo.png' instead of the text, so the preview differs from the real output. A video src './missing.mp4' is rewritten to a webview URI and returns 404 silently, and no warning is shown, although the code claims to check for missing files.

**Evidence**

```
// Check file extension
    return this.getMediaType(value) !== null;
...
    } catch (error) {
      console.warn(`[MediaResolver] Failed to convert to webview URI: ${mediaPath}`, error);
      this.missingFiles.push(mediaPath);
```

**Fix:** Pass `path.dirname(this.documentUri.fsPath)` as the base directory to resolvePath. Rewrite a value only when the property name is in mediaPropertyNames AND the value is a relative path (./ or ../) or an http(s) URL with a media extension. Check existence with fs.existsSync, or await workspace.fs.stat (which makes the method async), and push to missingFiles when the file is absent. Add unit tests for MediaResolver.

Verifier: findMediaReferences adds a reference only when getMediaType(value) is non-null, and isMediaProperty returns true in that same case, so the property-name list never matters. Every string anywhere in the config that ends in a listed extension gets rewritten, including text or operationData values; that is possible but rare in real configs. missingFiles is pushed only in the catch around Uri.file/asWebviewUri, which do not throw for an ordinary path, and existence is never checked, so PreviewPanel's 'media file(s) not found' warning is effectively dead code. Both claims hold, and no tests cover MediaResolver. The reviewer missed a more serious problem: resolveMediaPath calls `resolvePath(mediaPath, this.documentUri.fsPath)`, passing the .eligian file path where the base directory is expected, and resolvePaths uses path.win32.resolve/posix.resolve. './video.mp4' therefore resolves to `<dir>/file.eligian/video.mp4`, which looks broken for every relative media path. That would raise the overall area severity, but this finding as stated is low.

### After a compile error the previous engine keeps running and the playback controls stay visible over the error view

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/media/preview.ts:346](../../packages/extension/media/preview.ts#L346)
- **Category:** bug
- **Description:** The 'showError' handler hides #loading and #eligius-container and shows #error-container. It does not destroy the running engine and does not hide #controls, which is position:fixed and was shown by showControls on the last successful init. PreviewPanel's failure branch does not send 'destroy' either.
- **Failure scenario:** A preview with audio is playing, and the user introduces a syntax error and saves. The error panel appears, but the old timeline and its audio keep playing invisibly. The Play/Pause/Restart buttons are still shown and act on the stale engine, so the user thinks they are controlling the broken source.

**Evidence**

```
case 'showError': {
      // Hide loading, show errors
      document.getElementById('loading')!.style.display = 'none';
      document.getElementById('eligius-container')!.style.display = 'none';
      document.getElementById('error-container')!.style.display = 'block';
```

**Fix:** In the webview's 'showError' case, call `await destroyEngine()` and `_hideControls()`, and remove the @ts-expect-error from `_hideControls`. Doing this in the webview also covers PreviewPanel's catch branch. If the extension side should own this, call `this.engineService.destroy()` before posting showError in both failure branches of compileAndUpdate.

Verifier: The showError handler in media/preview.ts (around line 346) only switches the visibility of #loading, #eligius-container and #error-container. It does not call destroyEngine() and does not hide #controls, which the template styles as position:fixed with z-index 1000 and which showControls() set to display:block on the last successful init. On compile failure, PreviewPanel.compileAndUpdate sends showError and nothing else: no 'destroy', and engineService.destroy() is not called, in both the result.success=false branch and the catch branch. The old engine (factoryResult) stays alive until the next initializeEngine or dispose, so audio or video from the old timeline keeps playing, and the buttons still send timeline requests on the shared eventbus. `_hideControls` exists but is unused (@ts-expect-error).

### The webview 'ready' message is a no-op, so a reloaded webview stays on 'Loading' with no config

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/preview/PreviewPanel.ts:369](../../packages/extension/src/extension/preview/PreviewPanel.ts#L369)
- **Category:** bug
- **Description:** The extension sends showLoading, updateConfig, initialize and css-load once, from compileAndUpdate, which is triggered by the constructor or a save. The webview posts 'ready' on every load (the last line of media/preview.ts), but handleWebviewMessage only logs it. If the webview is reloaded (Developer: Reload Webviews, or after the host re-creates it), it starts from the template's initial loading state, and nothing resends the state. There is also no cached last config or CSS to replay.
- **Failure scenario:** The user runs 'Developer: Reload Webviews', or the webview is re-created. The preview shows the loading spinner indefinitely, until the next save of the .eligian file or a manual retry.

**Evidence**

```
case 'ready':
        console.log('[Preview] Webview ready');
        break;
```

**Fix:** Ignore the first 'ready', which the constructor's compileAndUpdate already covers (track it with a flag). On any later 'ready', call `this.compileAndUpdate()`. Also clear the cssInjector's injected-state tracking, so the CSS is re-sent with css-load rather than css-reload, because css-reload is a no-op when the style tag is missing.

Verifier: PreviewPanel.handleWebviewMessage only logs 'ready', which the webview posts as the last statement of media/preview.ts. The first load works, because VS Code queues postMessage until the webview is ready and the constructor calls compileAndUpdate. `retainContextWhenHidden: true` means a hidden tab does not reload, so the only realistic triggers are 'Developer: Reload Webviews' and the host re-creating the webview. In those cases the HTML is reloaded, starts on the template's loading view, and nothing resends updateConfig, initialize or the css-load messages. The retry button lives in the error container, so it cannot be reached from the loading view, and the preview stays there until the next save. Severity is low because the main trigger is a developer command.

### Locale tree edits split user-typed keys on '.' without guarding `__proto__`, so Parent key input can pollute Object.prototype

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/locale-editor/locale-editor-utils.ts:124](../../packages/extension/src/extension/locale-editor/locale-editor-utils.ts#L124)
- **Category:** security
- **Description:** The Add Key modal validates newSegment against `/^[a-zA-Z0-9_-]+$/`, which allows `__proto__`. The parent key is free text with no validation. addKeyToConfig does `key.split('.')`, and getAtPath/setAtPath walk with plain bracket access. For the path [`__proto__`, 'x'], getAtPath finds `entry['__proto__']` (Object.prototype) and returns undefined for 'x'. setAtPath then takes `current['__proto__']` as an object, descends into it and writes `Object.prototype.x = ''`. Object.prototype is shared by every extension in the host process.
- **Failure scenario:** The user types `__proto__` as the Parent key and 'polluted' as the segment. `Object.prototype.polluted = ''` is set in the extension host, so every plain object in every extension now has a 'polluted' key, and code that checks `'polluted' in obj` or iterates with for..in changes behaviour.

**Evidence**

```
for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {};
    }
    current = current[segment] as TLocaleData;
  }
```

**Fix:** Reject the segments `__proto__`, `prototype` and `constructor` in the shared path helpers (getAtPath, setAtPath, deleteAtPath and the rename path), so every caller is covered. Also validate every parentKey segment with the same regex as newSegment, in both the webview and the extension message handler. In setAtPath, use `Object.hasOwn(current, segment)` before descending, so inherited properties are never traversed.

Verifier: Traced the path. locale-message-handler builds fullKey as `${parentKey}.${newSegment}`. parentKey is a free-text input (add-key-parent) with no validation; only newSegment is checked against `/^[a-zA-Z0-9_-]+$/`, which allows `__proto__`. addKeyToConfig clones with JSON.parse/JSON.stringify, so locale entries are ordinary objects with Object.prototype. For the path [`__proto__`,'polluted'], getAtPath returns undefined. In setAtPath, `current['__proto__']` is Object.prototype, a non-null object, so the code descends into it and assigns `Object.prototype.polluted = ''`. The extension host is shared by all extensions, so the pollution is real. A locale file that contains a `__proto__` key does not trigger it, because JSON.parse makes that an own property, which shadows the accessor. The only way in is the user typing `__proto__` (or `constructor.prototype`) themselves. With no external attacker, this is a robustness bug rather than a meaningful security issue. Low is right.

### The pending label selection is not applied when the locale editor is already open, and it lingers until a later unrelated open

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/label-entry-creator.ts:75](../../packages/extension/src/extension/label-entry-creator.ts#L75)
- **Category:** bug
- **Description:** openLabelEditorWithSelection stores the key in a module-level map, which is consumed only inside the 'ready' handler of a newly resolved webview (locale-message-handler.ts:75/87). If the custom editor for that file is already open, vscode.openWith just reveals it, no 'ready' is sent, and the entry stays in the map. The disk write triggers only a 'reload' with no selection.
- **Failure scenario:** The locale editor is open for locales.json, and the user runs the quick fix for a missing key 'intro.title'. The editor is revealed without selecting the new key, which defeats the 'auto-select' feature. Days later the user closes and reopens that file from the explorer, and the editor suddenly selects 'intro.title' from the stale pending entry.

**Evidence**

```
setPendingSelection(fileUri.toString(), labelId);

  // Open the locale editor
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'eligian.localeEditor');
```

**Fix:** Have LocaleEditorProvider keep a `Map<uriString, WebviewPanel>` of live panels, registered in resolveCustomEditor and removed on dispose. In openLabelEditorWithSelection, if a live panel exists, call reveal() and post a select-key message; this needs a new webview message type, or a selectedKey field on the reload message. Use the pending map only when no panel exists. Also delete any leftover pending entry after openWith resolves, or after a short timeout.

Verifier: consumePendingSelection runs only in the 'ready' case of locale-message-handler.ts (lines 75 and 87). The custom editor is registered in main.ts:116 with `retainContextWhenHidden: true`. So when the editor for that URI is already open, visible or in a background tab, vscode.openWith only reveals it, the webview does not reload, and no 'ready' is sent. The file write sends a 'reload' message, which carries no selection. The entry stays in the module-level map until the next time a webview for that URI is resolved (for example when the user closes and reopens it), and then an unrelated open selects the stale key. Nothing clears it except clearPendingSelections, which is meant for tests.

### Core preview and quick-fix paths have no unit tests (CompilationService, MediaResolver, PreviewPanel message handling, createLabelEntry, LocaleLinkProvider)

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/extension/src/extension/preview/CompilationService.ts:69](../../packages/extension/src/extension/preview/CompilationService.ts#L69)
- **Category:** test-gap
- **Description:** A search of the extension specs finds no direct tests for MediaResolver, PreviewPanel.handleWebviewMessage or compileAndUpdate, BlockLabelDecorationProvider, LocaleLinkProvider, LocaleFileWatcher, or createLabelEntry beyond the pending-selection store. The CompilationService tests (compilation-error-consistency.spec.ts) cover only the error format. The timeout branch, convertCompilerError for errors without a location, media path rewriting, hasTranslationKey, the BOM/invalid-JSON branch and the link regex are untested. Several defects listed above are in exactly these paths.
- **Failure scenario:** A regression in MediaResolver (for example a string ending in .png being rewritten), in createLabelEntry's read-modify-write, or in the locale link regex would not be caught by CI.

**Evidence**

```
public async compile(documentUri: vscode.Uri, timeout = 5000): Promise<CompilationResult> {
    ... Promise.race([compilationPromise, timeoutPromise]) ... if ('timeout' in result)
```

**Fix:** Add vitest specs with the vscode mock for: `MediaResolver.resolveMediaPaths` (property and extension matching, missing files), `CompilationService.compile` (the timeout and no-location error cases), `createLabelEntry` (existing key, invalid JSON, BOM, write failure), and `LocaleLinkProvider.provideDocumentLinks` (comments, ranges).

Verifier: The extension package's spec files are under media/__tests__, src/extension/__tests__ and src/extension/locale-editor/__tests__. A grep across all of them for MediaResolver, createLabelEntry, LocaleLinkProvider, BlockLabelDecoration, LocaleFileWatcher, compileAndUpdate and PreviewPanel's handleWebviewMessage finds nothing. The only CompilationService hits are compilation-error-consistency.spec.ts and error-import-consistency.spec.ts, which test the error format and error imports. label-entry-auto-select.spec.ts covers only the pending-selection store. The gap is real, and as a test-gap finding it is low severity.

### @eligian/cli statically imports `esbuild` and `effect` but declares neither (nor `eligius`)

- **Status:** ✅ Already fixed by an earlier commit on this branch (regression test added in `e6b5c32`)

- **Location:** [packages/cli/package.json:33](../../packages/cli/package.json#L33)
- **Category:** robustness
- **Description:** The built `dist/cli.mjs` and `dist/index.mjs` use `packages: 'external'` and contain top-level `import ... from "effect"` and `import * as esbuild from "esbuild"`, and the bundler also needs `eligius` at runtime. The package lists only @eligian/language, chalk and commander as dependencies. Locally it works only because the root devDependencies and `shamefullyHoist: true` expose these packages. Because the imports are static, a missing `esbuild` or `effect` crashes the whole CLI at load, not only `--bundle`. (This overlaps with the medium cli-bundler finding above, from the config reviewer's angle.)
- **Failure scenario:** The CLI is packed or installed outside this workspace (`npm i -g` of the tarball, or `pnpm deploy`). Running `eligian foo.eligian` fails with ERR_MODULE_NOT_FOUND for `effect` or `esbuild` before any argument parsing.

**Evidence**

```
"dependencies": {
    "@eligian/language": "workspace:*",
    "chalk": "6.0.1",
    "commander": "15.0.0"
  }
// dist/cli.mjs: import { Cause, Effect, Exit, Option } from "effect"; import * as esbuild from "esbuild";
```

**Fix:** Declare `effect` and `esbuild` (and `eligius`, if the bundler resolves it at runtime) in the packages/cli dependencies at the root's pinned versions. Declare `effect`, `eligius` and any vscode-languageserver* imports in packages/language. Turning off shamefullyHoist would expose undeclared dependencies, but langium-cli needs it, so test that change separately.

Verifier: packages/cli/package.json declares only @eligian/language, chalk and commander. The built dist/cli.mjs (esbuild `packages: 'external'`) has a top-level `import ... from "effect"`, and the reviewer also found a top-level esbuild import. bin/cli.js imports dist/cli.mjs statically, so a missing module would fail at load. effect, eligius and esbuild come only from the root package.json and are visible because of `shamefullyHoist: true` in pnpm-workspace.yaml. The language package also omits effect and eligius. The manifest defect is real, but the failure scenario is hypothetical: no publish, pack or `pnpm deploy` flow exists, and pages.yml runs the CLI inside the workspace. So it is a latent manifest problem, not a live failure.

### Windows drive-root baseDir collapses to a drive-relative path and resolves against process cwd

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/shared-utils/src/path-resolver.ts:87](../../packages/shared-utils/src/path-resolver.ts#L87)
- **Category:** bug
- **Description:** `normalizePath` strips every trailing slash except a lone `/`. For `C:/` it returns `C:`, which is a drive-relative path. `resolvePath` then calls `isWindowsAbsolutePath('C:')`, whose regex needs `C:/`, so it is false, and it falls through to `path.posix.resolve('C:', rel)`, which prepends `process.cwd()`. This breaks the module's own rule that cwd is never used. Confirmed by running the built package.
- **Failure scenario:** An `.eligian` file sits at a drive root (for example `C:\story.eligian`, or an extension host whose workspace is `C:/`). `resolvePath('./x.css', 'C:/')` returns `/projects/eligius/eligian/C:/x.css` (which depends on the cwd), so asset loading reports file-not-found for an existing file.

**Evidence**

```
if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
// normalizePath('C:/') => 'C:'; resolvePath('./x.css','C:/') => '/projects/eligius/eligian/C:/x.css'
```

**Fix:** In normalizePath, keep the slash for a drive root (skip the strip when `/^[a-zA-Z]:\/$/` matches), and/or make isWindowsAbsolutePath accept `/^[a-zA-Z]:([\\/]|$)/`. Add path-resolver tests for `C:/`, `C:\` and `c:/` bases.

Verifier: Running the built shared-utils/dist: `normalizePath('C:/')` returns 'C:'. `resolvePath('./x.css','C:/')` and `resolvePath('./x.css','C:\\')` both return '/projects/eligius/eligian/packages/shared-utils/C:/x.css', which depends on the cwd, while 'C:/proj' resolves correctly. The trailing-slash strip turns the drive root into the drive-relative 'C:', isWindowsAbsolutePath then fails, and posix.resolve prepends the cwd. Callers (node-asset-loader.ts:89 and html-import-utils.ts:42) pass path.dirname of the source file, which is `C:\` for a file at a drive root. The bug is real, but it only affects .eligian files stored directly at a drive root, so low severity. Separately, MediaResolver.ts:214 passes `documentUri.fsPath` (a file, not a directory) as baseDir; that is a different issue and not covered by this finding.

### No `else if` chain: IfStatement only allows `else { ... }`

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/eligian.langium:380](../../packages/language/src/eligian.langium#L380)
- **Category:** robustness
- **Description:** The optional else branch is only `'else' '{' ... '}'`. Users coming from JS/TS will write `else if (...)`, which fails with "Expecting token of type '{' but found `if`" (confirmed). The workaround, nesting `else { if ... }`, parses fine, so this is purely missing syntactic sugar.
- **Failure scenario:** `if (a) { ... } else if (b) { ... }` produces a parse error instead of compiling to nested when/otherwise.

**Evidence**

```
IfStatement:
    'if' '(' condition=Expression ')' '{' (thenOps += OperationStatement)* '}'
    ('else' '{' (elseOps += OperationStatement)* '}')?;
```

**Fix:** Write the else branch as `('else' (elseOps += IfStatement | '{' (elseOps += OperationStatement)* '}'))?`. IfStatement is already an OperationStatement and the transformer already loops over elseOps, so this needs no new AST property and no transformer change. Run `pnpm langium:generate`, and add parse and compile tests for else-if chains.

Verifier: In eligian.langium, IfStatement's else branch is only `'else' '{' (elseOps += OperationStatement)* '}'`, so `else if` cannot parse. Nested `else { if ... }` works, so this is missing syntactic sugar, not a correctness bug. IfStatement is already a member of OperationStatement (line 361), and operation-transformer.ts already iterates elseOps and transforms each one as an OperationStatement.

### CI runs `biome lint`, so formatting and import order are never enforced and warnings do not fail the build

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [.github/workflows/ci.yml:57](../../.github/workflows/ci.yml#L57)
- **Category:** inconsistency
- **Description:** The root `lint` script is `biome lint .`, which does not run the formatting, `organizeImports` (assist action) or `ci`-mode checks. Also, `noUnusedVariables`, `noUnusedImports` and `useConst` are configured as `warn`, and warnings do not fail `biome lint`. AGENTS.md says the goal is 0 warnings and offers `pnpm ci` (`biome ci .`) as the CI-style command, but CI uses neither `pnpm ci` nor `--error-on-warnings`.
- **Failure scenario:** A PR with unformatted code, unsorted imports, or unused imports and variables passes CI.

**Evidence**

```
- name: Lint code (Biome)
  run: pnpm run lint
(root package.json: "lint": "biome lint .")
```

**Fix:** Change the root script to `"ci": "biome ci --error-on-warnings ."`, and have the workflow step run `pnpm run ci` instead of `pnpm run lint`. Use `pnpm run ci`, not bare `pnpm ci`, which is a pnpm built-in command. Run `pnpm check` on main first, so existing format, import-order or warning findings don't break the first CI run.

Verifier: ci.yml line 57 runs `pnpm run lint`, and the root package.json defines it as `biome lint .`. Lint mode skips formatting and the assist/organizeImports check that biome.json enables. noUnusedVariables, noUnusedImports and useConst are set to warn, and warnings do not fail `biome lint`. CI never runs the existing `ci` script (`biome ci .`). Even that script lacks `--error-on-warnings`, so the reviewer's fix wrongly implied the existing script already had the flag.

### language package export map advertises `./css-service` but no dist bundle is built for it

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/package.json:22](../../packages/language/package.json#L22)
- **Category:** bug
- **Description:** `exports['./css-service'].default` points to `./dist/css/css-service.cjs`. esbuild.mjs builds only `src/index.ts` and `src/errors/index.ts`, so `dist/css/` does not exist (verified in the build output). The types entry resolves (`out/css/css-service.d.ts` exists), so TypeScript accepts the import, but Node fails at runtime.
- **Failure scenario:** `import { ... } from '@eligian/language/css-service'` type-checks, then throws ERR_MODULE_NOT_FOUND (or the CJS equivalent) at runtime. No in-repo consumer exists, so nothing catches it.

**Evidence**

```
"./css-service": {
      "types": "./out/css/css-service.d.ts",
      "default": "./dist/css/css-service.cjs"
    }
// esbuild.mjs entryPoints: 'src/index.ts' and 'src/errors/index.ts' only; no dist/css
```

**Fix:** Remove the './css-service' export entry, since index.ts already re-exports everything in it. If the subpath is wanted, add a matching esbuild context that writes dist/css/css-service.cjs. Optionally add a spec that checks every exports target file exists after build.

Verifier: In packages/language/package.json, `exports['./css-service'].default` points to ./dist/css/css-service.cjs. esbuild.mjs has only two entry points: src/index.ts → dist/index.cjs and src/errors/index.ts → dist/errors/index.cjs. dist/css does not exist on disk, while out/css/css-service.d.ts does. No in-repo code imports '@eligian/language/css-service', and index.ts already re-exports './css/css-service.js'. The broken subpath is latent: nothing is affected until an external consumer resolves it, hence low.

### pruned-coverage tool reads the wrong coverage path from the repo root, and hides all failures

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [tools/pruned-coverage.ts:16](../../tools/pruned-coverage.ts#L16)
- **Category:** bug
- **Description:** The root `pnpm test:coverage` runs `npm run test:coverage:ci` and then reads `coverage/coverage-summary.json` relative to the cwd (the repo root). Coverage is written to `packages/language/coverage/`, and the root `coverage/` has only a stale coverage-final.json and no summary, so the report step always lands in the catch. Separately, child stdout and stderr are discarded, so if the tests or thresholds fail (code !== 0) the script exits with no output. Directories with zero branches also print NaN%.
- **Failure scenario:** Running `pnpm test:coverage` as documented prints 'Failed to read coverage summary: ENOENT' and exits 1. When a test fails, it prints nothing and exits non-zero.

**Evidence**

```
const child = spawn('npm', ['run', 'test:coverage:ci'], {...});
child.stdout?.on('data', () => {});
child.stderr?.on('data', () => {});
...
const summaryData = await readFile('coverage/coverage-summary.json', 'utf-8');
```

**Fix:** Resolve the summary path from the repo root (`packages/language/coverage/coverage-summary.json`, built from `import.meta.url`). Spawn `pnpm run test:coverage:ci`, or `pnpm --filter @eligian/language test:coverage:ci`. Buffer the child output and print it when the exit code is non-zero. Guard the directory percentage when total is 0.

Verifier: tools/pruned-coverage.ts spawns `npm run test:coverage:ci`, which runs `pnpm -r test:coverage:ci`, then reads 'coverage/coverage-summary.json' relative to the cwd. The root package.json `test:coverage` runs `tsx tools/pruned-coverage.ts` from the repo root. The root coverage/ dir holds only coverage-final.json, while coverage-summary.json is in packages/language/coverage/, so the documented command always reaches the catch with ENOENT. The stdout and stderr data handlers are no-ops, so a non-zero exit prints nothing. This is a dev-only tool, so low severity is right.

### Package engines are inconsistent with dependency requirements and the pinned @types/vscode

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/cli/package.json:7](../../packages/cli/package.json#L7)
- **Category:** inconsistency
- **Description:** The cli and language packages declare `node >=20.10.0`, but cli depends on commander 15 (engines node >=22.12.0) and chalk 6 (node >=22). The extension declares `engines.vscode ^1.107.0` while its devDependency `@types/vscode` is 1.140.0, and `vsce package` and `vsce publish` refuse an @types/vscode newer than engines.vscode.
- **Failure scenario:** On Node 20 the CLI installs fine, then fails at startup with an engine or syntax error from commander or chalk. `vsce package` for the extension fails with '@types/vscode 1.140.0 greater than engines.vscode ^1.107.0'. vsce was not run; that part is based on its documented check.

**Evidence**

```
"node": ">=20.10.0"  // cli/language; commander 15.0.0 requires >=22.12.0, chalk 6.0.1 requires >=22
"vscode": "^1.107.0"  vs  "@types/vscode": "1.140.0"
```

**Fix:** Set the cli (and language, if it relies on Node 22 APIs) engines.node to `>=22.12.0`, and remove the npm engine entry, since the repo is pnpm-only. Raise engines.vscode to `^1.140.0` (if dropping older VS Code is acceptable), or pin @types/vscode to `~1.107.0`.

Verifier: packages/cli/package.json declares engines node >=20.10.0 and npm >=10.2.3. Its runtime dependencies are commander 15.0.0, whose installed package.json requires node >=22.12.0, and chalk 6.0.1, which requires node >=22. esbuild marks these packages external, so they are installed and loaded at runtime, and the declared engine range is therefore wrong. packages/language has the same >=20.10 declaration. The extension declares engines.vscode ^1.107.0 with devDependency @types/vscode 1.140.0, and it has a `vsce` config block, so packaging with vsce is intended; vsce's documented check rejects an @types/vscode newer than engines.vscode. CI uses Node 24, so this only affects end users and packaging. Low severity holds.

### Grammar comments and LANGUAGE_SPEC document syntax the grammar rejects (`stagger ... with fadeIn` and zero-param event actions)

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/language/src/eligian.langium:580](../../packages/language/src/eligian.langium#L580)
- **Category:** inconsistency
- **Description:** LANGUAGE_SPEC.md (about line 1835) and the grammar doc comment show `stagger 200ms [...] with fadeIn for 2s` with no parentheses, but StaggerBlock uses `actionCall=OperationCall`, which requires `(`...`)`. Likewise the EventActionDefinition doc shows `on event "timeline-complete" action ShowCompletionMessage [`, but the grammar requires `()`. Regular and endable actions allow the parentheses to be omitted, so this is inconsistent. Both were confirmed to fail to parse.
- **Failure scenario:** A user copies the documented `stagger 200ms [".a"] with fadeIn for 2s` and gets 'Expecting token of type ( but found `for`'. The documented paren-less event action fails the same way.

**Evidence**

```
StaggerBlock:
    'stagger' delay=TimeExpression items=Expression 'with' actionCall=OperationCall 'for' duration=TimeExpression | ...
EventActionDefinition: ... 'action' name=ID
    '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
```

**Fix:** Change the docs to `with fadeIn() for 2s` in LANGUAGE_SPEC.md, the grammar comments and the timeline-transformer.ts comment. Either fix the event-action doc example to `ShowCompletionMessage()`, or make the parentheses optional in EventActionDefinition to match RegularActionDefinition (then run langium:generate).

Verifier: Line 580 of the grammar is `StaggerBlock: 'stagger' delay items 'with' actionCall=OperationCall 'for' duration`, and OperationCall at line 485 requires `'(' ... ')'`. The grammar doc comments (lines 530, 564, 572), the timeline-transformer.ts doc (line 249) and LANGUAGE_SPEC.md line 1835 all show `with fadeIn for 2s` without parentheses, while every test (transformer.spec.ts, transformer-golden.spec.ts) uses `fadeIn()` or `intro()`. EventActionDefinition (lines 270-275) makes the parameter parentheses mandatory, but its doc comment at line 259 shows `action ShowCompletionMessage [` without them; regular and endable actions make the parentheses optional. The docs and grammar really do disagree.

### shared-utils is outside the root typecheck/watch graph and has no `clean` script, so stale dist/tsbuildinfo can survive

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [tsconfig.build.json:2](../../tsconfig.build.json#L2)
- **Category:** maintainability
- **Description:** tsconfig.build.json references only language, cli and extension, so `pnpm typecheck` and `pnpm watch` never build shared-utils. Consumers read shared-utils' prebuilt `dist/*.d.ts`, so after an edit, `pnpm watch` leaves language, cli and extension using a stale shared-utils dist. shared-utils also defines no `clean` script, so the root `clean` and `build:clean` skip it. Its inherited composite/incremental tsbuildinfo sits at the package root (`tsconfig.tsbuildinfo`), outside `dist`, so after `dist` is removed an incremental `tsc` can consider the project up to date and not emit anything.
- **Failure scenario:** A developer edits `resolvePath` and runs `pnpm watch`; dist is not rebuilt, and language keeps the old behaviour. Or a developer deletes `dist` by hand, `tsc` emits nothing, and the dependent packages fail with module-not-found.

**Evidence**

```
tsconfig.build.json: "references": [ {"path": "./packages/language/tsconfig.src.json"}, {"path": "./packages/cli"}, {"path": "./packages/extension"} ]
shared-utils/package.json scripts: build/test/test:watch/test:coverage only (no clean)
```

**Fix:** Add `{ "path": "./packages/shared-utils" }` to tsconfig.build.json. Add shared-utils references to language/tsconfig.src.json and extension, which import it (cli uses it through language). Set `tsBuildInfoFile: "./dist/.tsbuildinfo"` in shared-utils' tsconfig. Add `"clean": "shx rm -fr *.tsbuildinfo dist"`.

Verifier: tsconfig.build.json references only language/tsconfig.src.json, cli and extension, and no project tsconfig references shared-utils. language and extension consume it through `workspace:*`, and its package.json types/main point at ./dist. So `pnpm typecheck` and `pnpm watch` (`tsc -b tsconfig.build.json`) never rebuild it, and edits to shared-utils stay stale until `pnpm build` builds it separately. shared-utils/package.json has no clean script, so the root `pnpm clean` skips it. Its tsconfig inherits composite and incremental from the root without setting tsBuildInfoFile, and tsconfig.tsbuildinfo sits at the package root next to dist, so deleting dist by hand can leave tsc thinking the project is up to date. This is a maintainability issue, so low severity.

### normalizePath is host-OS dependent: backslash `..` segments are not resolved on POSIX, and UNC paths lose their prefix

- **Status:** ✅ Fixed in `e6b5c32`

- **Location:** [packages/shared-utils/src/path-resolver.ts:81](../../packages/shared-utils/src/path-resolver.ts#L81)
- **Category:** robustness
- **Description:** `normalizePath` calls the host `path.normalize` before replacing backslashes. On POSIX hosts (CI, Linux dev containers) backslashes are ordinary characters, so `C:\a\..\b` becomes `C:/a/../b` with the `..` unresolved. `resolvePaths` only treats `X:` roots as Windows-absolute, so a UNC base like `//server/share/dir` goes through `path.posix.resolve`, which collapses the leading `//` (verified: the result is `/server/share/dir/x.css`). Existing tests cover only simple backslash conversion.
- **Failure scenario:** The language server or compiler runs on Linux with a Windows-style path containing `..` (a pasted path, or a URI `fsPath` from a remote workspace). The path is returned unnormalized and does not compare equal to the same file's normalized path, which can cause duplicate document or CSS-registry entries. On Windows, a project on a network share (`\\server\share\proj`) resolves imports to `/server/share/proj/...`, which does not exist, so the asset is reported as not found.

**Evidence**

```
let normalized = path.normalize(filePath);
  normalized = normalized.replace(/\\/g, '/');
// resolvePath('./x.css','//server/share/dir') => '/server/share/dir/x.css'
```

**Fix:** In resolvePaths, also treat a base with a leading `//` (UNC) as Windows-absolute, resolve it with path.win32.resolve, and convert back to forward slashes. In normalizePath, replace backslashes first, then normalize with path.posix.normalize, keeping a leading `//`. Add tests for UNC bases. The POSIX backslash `..` case is optional hardening.

Verifier: The UNC part was checked on Windows with a script that copies the code's logic. normalizePath turns the UNC base `\\server\share\proj` into `//server/share/proj`. isWindowsAbsolutePath only matches a drive letter, so resolution falls through to path.posix.resolve, which yields `/server/share/proj/x.css`, and the final normalizePath keeps it that way. The UNC prefix is lost, and the path points to a nonexistent drive-root path. Real callers can pass UNC paths: MediaResolver passes `documentUri.fsPath`, and NodeAssetLoader and resolveHTMLPath pass the dirname of the source path. The POSIX part (Windows backslash `..` paths on a Linux host) is mostly hypothetical: VS Code fsPath on Linux, including remote workspaces, uses forward slashes, and .eligian import paths cannot contain backslashes. Network-share projects are uncommon, so the finding is real but narrow, and low severity is right.

## Uncertain findings

None. The verifiers either confirmed or refuted every finding the reviewers reported. The 9 refuted findings are left out of this report (see Method).

| Severity | Title | File:line | Why uncertain |
|---|---|---|---|
| — | — | — | — |

## Area notes

Counts are reported → confirmed (by severity among the confirmed).

- **compiler-core: 15 reported, 14 confirmed (4 high, 6 medium, 4 low).** The Effect pipeline itself is sound: tagged errors are used consistently, there is no misuse of the Effect.gen adapter, and the stages compose correctly. The defects are at the edges. Constant folding resolves references by name, so a shadowed const gets the wrong value. URI handling loses the drive letter on Windows. Diagnostics are not filtered by severity. Library paths with '..' defeat cycle detection and can run the process out of memory. Folding has no numeric type guards, so NaN reaches the JSON as null. Most of these were reproduced with the real CLI. The type-checker and emitter do almost no validation. The `effects/` service layer is exported but unused outside the barrel, and its defaults still say `input.eli`. Tests cover happy paths only.
- **compiler-transformers: 13 reported, 13 confirmed (2 high, 6 medium, 5 low).** The transformers are split cleanly, and stagger baking, navigate expansion and the `when` condition serializer are careful. The weak spots are where transformers hand off to each other. Library resolution collects only the actions the program names, so a library action that calls a sibling or a transitively imported action fails. The end-operation flag is dropped in some paths. Expression folding treats runtime reference strings as ordinary values. The event-action path is a thinner copy of the action path: it gets no allActions and no dependency validation. Library resolution, event actions calling imported actions, end-block calls and `!` have no tests. All findings were reproduced through transformAST in a throwaway harness.
- **validation: 15 reported, 15 confirmed (1 high, 6 medium, 8 low).** The validators are well split up, and several defensive guards exist. The defects fall into four groups. Some checks disagree with the compiler: time units are ignored, and recursion detection identifies actions by name. Coverage is uneven across node kinds: event actions, stagger inline blocks, library roots, nested if/for bodies and regular-action parameters each miss checks that their siblings have. Some inputs throw: a missing LibraryImport path, and prototype keys accepted by `hasOperation`. Langium and Typir report duplicate or contradictory diagnostics for the same construct. `errors/` is consistent. `formatForVSCode` and `formatErrorWithSnippet` have no production callers.
- **type-system: 11 reported, 10 confirmed (3 high, 2 medium, 5 low).** The two biggest problems were confirmed against the real services. First, action calls in timelines fail Typir checking for any argument kind that has no inference rule, which breaks the 'unknown = opt-out' contract. Second, `extractTimeValue` ignores m/h units, relative times and property-chain times. Other issues: const cycles throw, action function types are matched by name across documents, arity errors are reported twice, and the import-type and CSS-selector heuristics give false positives. The 79 operation function types are built with argument validation turned off and are effectively dead. The label registry in `utils/` has no callers outside tests.
- **scope-lsp: 15 reported, 13 confirmed (1 high, 6 medium, 6 low).** Transitively imported library actions shadow explicit imports, and libraries cannot see their own imports. Variable scoping only covers regular action bodies and start operations, and it ignores block structure. The operation data tracker computes control-flow merges but never uses them, which produces false 'missing dependency' errors after if/else. Hover, JSDoc and block-label code has several smaller correctness bugs. There are almost no tests for on-type formatting, label hover, tracker merge/clone or multi-line `@param`. The formatter does nothing for document formatting. Code actions are fine.
- **completion-html: 14 reported, 12 confirmed (4 medium, 8 low).** Cursor-context detection is the riskiest part: it relies on leaf-node lookups, inclusive end offsets and line-text heuristics instead of AST structure. The worst bug is that any string in an event-action body is treated as the event name, which offers completions that destroy the handler. createElement completion has boundary bugs. The attribute metadata does not match Eligius' `.attr()` semantics: it offers `className` and has no `class`. Imported library actions are never offered. All custom actions and their markdown are rebuilt on every completionFor call.
- **css-assets-locales: 15 reported, 14 confirmed (1 high, 6 medium, 7 low).** This area is mostly small, well-factored pure functions, and PostCSS handles realistic CSS. The defects are where the pieces meet. The locales schema rejects the documented `$ref` form. Default and named CSS imports are handled differently. CSS parse errors are reported against the wrong import or cascade into false unknown-class errors. `rewriteUrls` and the locale quick-fix helpers handle edge-case input naively. Path handling is consistent. `label-entry-generator` and the url-rewrite edge cases have no tests.
- **cli-bundler: 12 reported, 10 confirmed (1 high, 4 medium, 5 low).** Effect 4 failure handling and exit codes are correct, and asset output names cannot escape outputDir. The weak spots are packaging (the bin field, undeclared runtime dependencies) and the derivation of input and output paths, which can overwrite the source. The bundler also assumes CSS, layout and media assets that real projects break: query strings, fragments, subdirectory layouts and video timelines. There is no watch mode. Tests do not cover non-.eligian inputs, CSS url edge cases, media timelines or bundle-mode diagnostics.
- **extension-core: 15 reported, 15 confirmed (1 high, 4 medium, 10 low).** The code is small and mostly tidy, and the webview CSP is restrictive. The defects fall into three groups. The shared watcher assumes one workspace: a single watcher is rooted at the first document's folder. In the server/extension handshake, one-to-one imports are announced only once, and the labels config uses `importType: 'labels'`, which the grammar never produces, so that pass is dead. Compile, openLabelEditor and JSDoc auto-close mishandle edge cases. A server launch failure also disables commands that do not need the server. Lifecycle tests are missing.
- **extension-preview-locale: 15 reported, 15 confirmed (5 medium, 10 low).** The debounce, listener and edit-flag hardening is already in place (B47/B48 fixed). The remaining risk is in four places. Several write paths overwrite without reading the current state. Webview HTML is built with innerHTML without escaping. Preview state has lifecycle gaps: diagnostics and CSS are never torn down, nothing is replayed on `ready`, and compiles and inits are not serialized. The locale editor reloads in response to its own saves. The locale editor webview itself uses textContent and escapes correctly. Preview and quick-fix tests are thin.
- **shared-grammar-config: 15 reported, 15 confirmed (1 high, 4 medium, 10 low).** shared-utils is mostly sound, apart from drive-root, UNC and host-OS path handling. The grammar has no ambiguity or left recursion, but `**` has the wrong precedence, keywords cannot be used as identifiers, and there is no `else if`. The config and CI layer has the bigger gaps. CI runs only the language tests. `biome lint` is used instead of `biome ci`. Test files are excluded from every tsconfig and contain 277 type errors. The CLI has undeclared dependencies. The TextMate grammar is hand-written and out of date. Hoisting hides undeclared dependencies locally.

## Feature ideas

Ranked 1–25 by the judge. Below they are grouped by tier, and each heading carries its rank.

### Tier: do-now

### #1 Close the silent parameter-forwarding hole (auto-resolve or diagnose non-resolving operation inputs)

- **Status:** ✅ Done in `a242971` (runtime values are resolved by a `setOperationData` before operations that do not resolve them; spec 046)

- **Area:** dsl / compiler · **Effort:** M · **Score:** 9.4
- **Problem:** Most Eligius operations do not resolve `$operationdata.x` property chains in their inputs. operation-transformer.ts drops a forwarded parameter only when the action parameter has the same name as the operation input. Otherwise it emits the chain as a literal string. So `action label(sel, cls, text) [ selectElement(sel) addClass(cls) setElementContent(text) ]` compiles to `addClass {className: "$operationdata.cls"}`, the page gets a class literally named `$operationdata.cls`, and the compiler says nothing. The tour library has to document the workaround ('the content param MUST be named `template`').
- **Proposal:**
  1. Extend generate-registry.ts so each operation parameter carries `resolvesPropertyChain: boolean`. Derive it from Eligius metadata, or from a curated table until upstream adds a JSDoc tag.
  2. In operation-transformer.ts, when a runtime reference (bare parameter, `$operationdata`, `$scope`, `@var`) is bound to a field that does not resolve chains, insert `setOperationData({ properties: { <field>: <chain> } })` before the operation and leave the field out of the operation itself.
  3. Update dependencies.ts and operation-data-tracker.ts so the inserted operation counts as the producer of the field.
  4. Behind the setting `eligian.compiler.autoForwardParams=false`, emit a warning instead, with a quick fix that renames the parameter to the operation input's name.
  5. Add compile tests for addClass, setElementContent and removeClass with arbitrary parameter names.

**Example**

```
action callout(selector: string, text: string) [
  selectElement(selector)
  setElementContent(text)   // emits setOperationData({properties:{template:"$operationdata.text"}}) then setElementContent()
]
```

- **Touches:** compiler/operations/generate-registry.ts, registry.generated.ts (regenerated), compiler/transformers/operation-transformer.ts, compiler/operations/validation/dependencies.ts, operation-data-tracker.ts, validators/operation-call/parameter-validator.ts, eligian-code-action-provider.ts, LANGUAGE_SPEC.md
- **Rationale:** Authors cannot see this correctness bug: the output compiles and then misbehaves at runtime. It also forces naming conventions on every action author. The fix stays inside the existing registry and transformer architecture and depends on nothing else in this list. It ranks above every other idea because it affects any action that forwards a parameter.

### #2 Make the CLI a real linter: `eligian check` with every diagnostic, severities kept separate, globs and machine-readable output

- **Status:** ✅ Done on `fix/audit-high-findings` (`eligian check` with pretty/json/sarif/github output, `--max-warnings`, `--warnings-as-errors`, `compile` subcommand, CI job `pnpm run check:examples`)

- **Area:** cli · **Effort:** M · **Score:** 9.2
- **Problem:** extractDocumentErrors (pipeline/document-errors.ts) returns only the first lexer, parser or validation diagnostic. It also ignores severity, so any warning, info or hint aborts compilation as a ValidationError (the confirmed high-severity bug at document-errors.ts:72). Parse errors at end of input get NaN line and column. A file with 6 errors takes 6 runs to fix. The CLI accepts a single input and prints coloured text only, and the repo's CI never compiles examples/.
- **Proposal:**
  1. Rewrite document-errors.ts to collect every diagnostic into a `Diagnostics` value that keeps severity. Only errors fail the Effect; warnings, info and hints are returned on `CompileResult.diagnostics`. Fix the NaN position at EOF by falling back to the last token.
  2. Add `eligian check <globs...>`. It loads all matched files into one Langium workspace and removes them afterwards, which also fixes the document accumulation at parser.ts:46. Flags: `--format pretty|json|sarif|github`, `--max-warnings <n>`, `--warnings-as-errors`.
  3. Make the current default action an explicit `compile` subcommand, keeping the bare-argument form as an alias.
  4. Use it in this repo: add a ci.yml job that runs `eligian check "examples/**/*.eligian" --format github`.
  5. While in parser.ts, replace URI.parse with URI.file so Windows paths keep their drive letter (high bug at parser.ts:53), and make compile() report assets.errors (pipeline.ts:127).

**Example**

```
$ eligian check "examples/**/*.eligian" --format github --max-warnings 0
::error file=examples/eligian-tour/tour.eligian,line=212,col=5::Unknown CSS class 'activ'. Did you mean 'active'?
2 files, 1 error, 1 warning
```

- **Touches:** compiler/pipeline/document-errors.ts, pipeline/parser.ts, pipeline.ts, compiler/error-reporter.ts (also fix the caret off-by-one at :224), packages/cli/src/compile-file.ts, main.ts, new packages/cli/src/reporters/*, .github/workflows/ci.yml
- **Rationale:** This item absorbs four confirmed pipeline bugs (warnings abort compilation, NaN positions, lost drive letter, ignored assets.errors), so fixing them is part of the work rather than a prerequisite. It is also the foundation that the smoke runner, the dev server and CI all need. The CI part of the 'Reusable GitHub Action' idea is merged in here.

### #3 Optional end block and `at <start> for <duration>`

- **Area:** dsl · **Effort:** S · **Score:** 9.0
- **Problem:** InlineEndableAction requires both `[start] [end]`, so `at 0s..2s [ selectElement("#b") ]` is a parse error, and tour.eligian contains 36 empty `] []` lines. Ranges must be written as absolute `a..b` pairs, so every beat repeats the arithmetic.
- **Proposal:** Change the grammar to `'[' start* ']' ('[' end* ']')?`, and add `TimeRange: start=TimeExpression ('..' end=TimeExpression | 'for' duration=TimeExpression)`. Desugar both forms in timeline-transformer.ts; the IR does not change. `for` works with relative time: `at +0s for 7s` starts at the previous event's end. Before shipping, fix checkValidTimeRange so it compares unit-normalised values (the high bug at timeline-validator.ts:155, which rejects `500ms..2s`), and reduce the contradictory Langium start<=end and Typir end>start rules to one diagnostic. Add a code action that converts `a..b` to `a for (b-a)`. Update the formatter and LANGUAGE_SPEC.

**Example**

```
at 20s for 7s [
  narrate("Times take units.")
]
at +0s for 8s [ narrate("Ranges can compute…") ]
```

- **Touches:** eligian.langium (InlineEndableAction, TimeRange) + langium:generate, compiler/transformers/timeline-transformer.ts, time-transformer.ts, validators/timeline-validator.ts, eligian-code-action-provider.ts, LANGUAGE_SPEC.md
- **Rationale:** It removes the most frequent noise in real files at small cost. The existing two-block stagger form stays unambiguous because it has its own keyword. It depends on fixing the high-severity unit-comparison bug in checkValidTimeRange first; otherwise `for 500ms` after a `2s` start is rejected.

### #4 Shared absolute-time resolver plus inlay hints for sequence, stagger, relative and arithmetic times

- **Area:** ide · **Effort:** M · **Score:** 8.8
- **Problem:** Absolute times are implicit for sequence items, for stagger items (whose base is the previous event's end), for `+2s` relative literals and for time arithmetic. The tour explains them in comments ('Placed here so its base time = end of Beat 3 (22s)'), and moving one event silently shifts a stagger. No InlayHintProvider is registered (confirmed by a grep of packages/language/src).
- **Proposal:**
  1. Move the base-time, relative-time and expansion logic out of time-transformer.ts and timeline-transformer.ts into a pure `resolveTimelineTimes(timeline)` that returns `Map<AstNode, {start,end}|unresolved>`. The compiler and the IDE both call it, so the hints always match the output.
  2. Add an EligianInlayHintProvider (Langium AbstractInlayHintProvider). It shows `‹5s..15s›` after SequenceItems, `‹22s..23.9s ×3›` after stagger blocks, the resolved value next to relative and arithmetic times, and the total duration on the timeline header. It shows nothing for times that depend on runtime values. Cache results per document version, and give each hint kind its own setting.
  3. Fix these inside the resolver first: support `**`, report % by zero and non-numeric operands as errors instead of NaN, round emitted times to avoid floating-point drift (timeline-transformer.ts:361), and turn the raw `throw` at time-transformer.ts:104 into a tagged error.

**Example**

```
sequence {
  intro() for 5s   ‹0s..5s›
  main() for 10s   ‹5s..15s›
}
```

- **Touches:** new packages/language/src/lsp/eligian-inlay-hint-provider.ts, new compiler/transformers/time-resolver.ts, time-transformer.ts, timeline-transformer.ts, expression-evaluator.ts, eligian-module.ts, extension package.json (settings)
- **Rationale:** Five other items build on the shared resolver: the preview CodeLens, the Outline, snippet default start times, time markers and the `for` form. That puts it ahead of them. Fixing the NaN, `**` and floating-point bugs is required for the hints to be trustworthy.

### #5 Preview scrubber, timeline picker, language switcher and a 'Preview from here' CodeLens

- **Area:** ide · **Effort:** M · **Score:** 8.7
- **Problem:** The preview offers only Play, Pause, Stop and Restart. EngineCommand has no seek or switch, and spec 001 deferred scrubbing. Checking Chapter 4 Beat 4 means clicking the hub and waiting 22 seconds every time. Multilingual presentations always run in the default language, and the preview never broadcasts 'language-change'. Two of the ideation angles proposed the same scrubber and CodeLens.
- **Proposal:**
  1. Add `seek`, `switchTimeline` and `setLanguage` to EngineCommand, handled in media/preview.ts through `engine.seek(pos)`, `engine.switchTimeline(uri, pos)` and a 'language-change' broadcast. Engine reconciliation re-fires the start ops of events that span the target time.
  2. Add a scrubber bar, a time readout driven by `engine.on('time')`, a timeline dropdown filled from config.timelines (clamped to each timeline's duration), and a language dropdown filled from config.availableLanguages.
  3. Add an LSP CodeLensProvider (lsp/eligian-code-lens-provider.ts) that shows '▶ Preview from 22s' above each timeline, `at` event, sequence item and stagger. It takes times from the shared resolver (#4) and runs `eligian.previewAt(uri, timelineUri, seconds)`.
  4. Switch timelines by uri, not by name (see the navigate name-versus-uri bug).

**Example**

```
// CodeLens:  ▶ Preview from 22s  |  ▶ Loop 22s..31s
at 22s..31s [
  narrate("'stagger' fans one effect across a collection")
]
```

- **Touches:** packages/extension/src/extension/preview/EligiusEngineService.ts, PreviewPanel.ts, commands/preview.ts, media/preview.ts, preview/templates/preview.html, new packages/language/src/lsp/eligian-code-lens-provider.ts, eligian-module.ts, extension package.json
- **Rationale:** This merges 'Timeline-aware preview: scrubber, play-from-cursor CodeLens and live playhead highlight' with 'Preview scrubber, timeline picker and Preview from here CodeLens', and adds the language switcher from 'Preview inspector'. It removes the biggest cost in each edit-and-check cycle, using engine APIs that already exist. The live-playhead decoration moves to #14, which provides the source map it needs.

### #6 Timeline lifecycle blocks: `on enter [..]` / `on leave [..]`

- **Area:** dsl · **Effort:** M · **Score:** 8.6
- **Problem:** Eligius has no per-timeline setup hook, so every tour timeline starts with `at 0s..3600s [ showView(..) …navigate wiring ] [ hideView(..) ]` (7 copies). As a result every compiled timeline reports `duration: 3600`, which breaks progress and timeline-complete. `previousEventEndTime` also jumps to 3600, so relative times and position-based staggers after the block are anchored an hour out. Authors must learn an engine-internals trick before they can build anything with more than one timeline.
- **Proposal:** Add optional `on enter [ ops ]` and `on leave [ ops ]` (at most one of each) at the top of a timeline body. Compile them to one endable timeline action with start 0 and end = the computed content duration plus epsilon, or the explicit duration from #9. Exclude it from duration inference and from previousEventEndTime. Mark it in the IR (`lifecycle: true`) so hover, the Outline and inlay hints can label it. Prerequisite: fix action-transformer.ts:69, where ops inside an endable end block (and inside if/for in end blocks) emit startAction instead of endAction, because `on leave` is exactly an end block. Update completion, the formatter and the tour.

**Example**

```
timeline "Logic" in "#stage" using raf {
  on enter [ showView("#ch3") on click "#c3-to-hub" navigate "Hub" ]
  on leave [ hideView("#ch3") ]
  at 0s for 7s [ narrate("const names a value") ]
}
```

- **Touches:** eligian.langium (Timeline) + langium:generate, compiler/transformers/timeline-transformer.ts, action-transformer.ts, types/eligius-ir.ts, validators/timeline-validator.ts, eligian-formatter.ts, completion/, LANGUAGE_SPEC.md, examples/eligian-tour/tour.eligian
- **Rationale:** It fixes a real output defect (duration 3600 everywhere) and removes a trick every author of multi-timeline presentations has to learn. It ranks just below the IDE foundations because it depends on the end-block startAction fix, and the end-time strategy for video and scroll sources still needs checking against the engine.

### #7 Signature help and parameter-name inlay hints for operations and actions

- **Area:** ide · **Effort:** M · **Score:** 8.4
- **Problem:** Calls are positional, but Eligius operations take named properties, so the tour has to explain argument order in comments ('broadcastEvent's params are (eventArgs, eventName) in that order'). No SignatureHelpProvider or InlayHintProvider is registered, even though registry.generated.ts and action JSDoc already hold every parameter's name, type, required flag and description.
- **Proposal:**
  1. Add an EligianSignatureHelpProvider (Langium AbstractSignatureHelpProvider) that triggers on '(' and ','. It resolves the callee as an action first, then as an operation (as name-resolver.ts does), and shows the signature with the active parameter, its type, its required/erased flags, and the description from the operation metadata or JSDoc `@param`. For addController with a literal controller name, list the controller's parameters from controllers.generated.ts.
  2. Add parameter-name inlay hints to the provider from #4. The default mode is 'literals only', and a hint is suppressed when a ParameterReference already has the target name.
  3. Prerequisites: findActionByName must prefer local actions over imported ones, as its comment says (ast-transformer.ts:159), and hasOperation must use Object.hasOwn instead of `in`, so typing `toString(` cannot crash anything.

**Example**

```
broadcastEvent(eventArgs: ["#c5-fx-panel"], eventName: "tour-ping")
// typing  callout(|  → callout(selector: string, template: string) — Animate an arrow+label callout
```

- **Touches:** new lsp/eligian-signature-help-provider.ts, lsp/eligian-inlay-hint-provider.ts (shared with #4), eligian-module.ts, compiler/operations/index.ts (hasOperation), compiler/ast-transformer.ts (lookup precedence), completion/metadata/controllers.generated.ts, jsdoc/
- **Rationale:** This helps every day for any author who has not memorised the operation catalogue, and the metadata already exists. It costs a moderate amount because it shares the inlay-hint provider with #4.

### #8 Hot reload keeps the playhead (and timeline)

- **Area:** ide · **Effort:** S · **Score:** 8.3
- **Problem:** Every .eligian save calls initializeEngine, which destroys and recreates the engine, so playback restarts at 0s on the first timeline. CSS hot reload keeps the timeline running, but a DSL edit loses your position. Tuning a beat at 40s means watching 40 seconds again after every save.
- **Proposal:** In media/preview.ts, record `engine.currentTimelineUri`, the position and the play state before destroyEngine. After the new `engine.init()`, call `switchTimeline(uri, position)` if that uri still exists; otherwise fall back to the first timeline and show a status message. Then restore play or pause. Add a 'Keep position on reload' toggle, persisted per workspace in webview state. This reuses the switchTimeline command from #5.

**Example**

```
Edit narrate() text in Beat 5 (31s), save → preview recompiles and is paused at 31.0s on 'Timeline Power Tools'.
```

- **Touches:** packages/extension/media/preview.ts (initializeEngine/destroyEngine), PreviewPanel.ts (compileAndUpdate), EligiusEngineService.ts
- **Rationale:** A small change with a large effect on how fast authors can iterate. It uses the same engine commands as #5, so it is cheap once #5 lands, but it can also ship on its own.

### #9 Timeline header options: `loop`, explicit `duration`, `scroll` provider and a real video selector

- **Area:** runtime-integration · **Effort:** S · **Score:** 8.0
- **Problem:** timeline-transformer.ts hard-codes `loop: false // TODO`. Duration is always inferred from the largest event end. Providers are limited to `video|audio|raf|custom`, and `custom` silently maps to 'animation'. config-builder emits the VideoPositionSource selector as ''. Eligius 3's ScrollPositionSource, the basis of scroll-driven storytelling, cannot be targeted.
- **Proposal:** Grammar: `timeline STRING in STRING using (raf|video|audio|scroll) STRING? ('from' STRING)? ('loop')? ('duration' TimeExpression)?`. `scroll "#scroller"` emits a per-timeline `positionSource: {systemName:'ScrollPositionSource', selector, duration}`, and a validator requires `duration` for scroll. For video and audio, emit the selector from the header instead of ''. When an explicit duration is set, use it as the timeline duration and warn if events run past it. Show the effective duration on timeline hover. In the preview webview, give scroll timelines a scrollable container. Before coding, check that the Eligius configuration-resolver accepts a per-timeline positionSource override.

**Example**

```
timeline "Story" in "#stage" using scroll "#scroller" duration 120s { … }
timeline "Ambient" in "#bg" using raf loop duration 30s { … }
```

- **Touches:** eligian.langium (Timeline, TimelineProvider) + langium:generate, compiler/transformers/timeline-transformer.ts, config-builder.ts, types/eligius-ir.ts, validators/timeline-validator.ts, hover/, extension preview template
- **Rationale:** It exposes engine capabilities that the DSL currently hides, including a flagship use case (scroll), with small grammar and transformer changes. An explicit duration also gives lifecycle blocks (#6) a precise end time.

### #12 Fix the installed bin and add `eligian init` / 'New Presentation…' starters

- **Status:** 🟡 Partly done: the bin was fixed in `65fdd0f`; `eligian init` and the starters are still open

- **Area:** docs-onboarding · **Effort:** S · **Score:** 7.3
- **Problem:** KNOWN_ISSUES B1b: the package.json bin points at dist/cli.mjs, which does not call main, and bin/cli.js is missing from `files`, so a new user's `eligian --version` prints nothing. There is no scaffold, so authors must work out the required timeline header, the languages and locales pairing and the hub/chapter pattern from scratch.
- **Proposal:**
  1. Point `bin` at a launcher that calls main, add it to `files`, and add a test that runs the packed bin.
  2. Add `eligian init [dir] --template blank|video|chapters|library`. It writes main.eligian, layout.html, styles.css, a locales file plus a `languages` block, .vscode/extensions.json, and package.json scripts (check and build).
  3. Add an extension command 'Eligian: New Presentation…' that offers the same templates in a quick pick and opens the preview.
  4. Compile every template in the CLI test suite so the starters stay in sync with the grammar.

**Example**

```
$ eligian init my-talk --template chapters
  created my-talk/ (main.eligian, layout.html, styles.css, locales/en-US.json)
```

- **Touches:** packages/cli/package.json (bin, files), packages/cli/bin/, new packages/cli/templates/**, packages/cli/src/init.ts, main.ts, packages/extension/src/extension/commands/new-presentation.ts, extension package.json, packages/cli/src/__tests__
- **Rationale:** This merges '`eligian init` starters + fix the installed bin' with the scaffolding command from 'Project scaffolding, snippets and timeline-event completion'. The snippets half is #13. The bin fix is the cheapest way to give new users a first command that works. The value outside the monorepo depends on publishing the CLI.

### #13 Snippets and timeline-event completion (resolve the completeTimelineEvents TODO)

- **Area:** ide · **Effort:** S · **Score:** 7.2
- **Problem:** eligian-completion-provider.ts line 271 still has `// completeTimelineEvents(...)` commented out, so a timeline body offers no `at`, `sequence` or `stagger` skeletons. The extension contributes no snippets (package.json has no 'snippets' entry).
- **Proposal:** Implement completion/timeline-events.ts. Inside a timeline body, offer snippet completions for `at ${1:<prevEnd>} for ${2:5s} [ $0 ]`, `sequence { … }` and `stagger 200ms [...] with … for 1s`, where the default start is the previous event's end, taken from the shared resolver (#4). Contribute snippets/eligian.json for top-level constructs: endable action, on event, a chapter timeline with a navigate back-link, a languages block, a library header. Do not duplicate the existing keyword completions.

**Example**

```
inside a timeline, `at` + Tab → at 31s for 5s [ | ]   (31s = previous event's end)
```

- **Touches:** packages/language/src/eligian-completion-provider.ts, new completion/timeline-events.ts, packages/extension/package.json (snippets contribution), new packages/extension/snippets/eligian.json
- **Rationale:** Split out of 'Project scaffolding, snippets and timeline-event completion'; the scaffolding part was merged into #12. This is a cheap way to finish a TODO already in the code, and it gets better once #3 and #4 land.

### Tier: next

### #10 Time constants, named event markers and explicit stagger anchors

- **Area:** dsl · **Effort:** M · **Score:** 7.8
- **Problem:** Time expressions accept only literals, relative literals and `$` chains, and a chain crashes the compiler: `at $globaldata.beat..10s` reports 'Unknown Error: {}', because time-transformer.ts:104 throws a raw Error out of the Effect pipeline. Authors cannot write `const beat = 7s` or refer to another event's start or end. Stagger takes its base time from the event's position in the document, so reordering events breaks it.
- **Proposal:**
  1. Allow TimeLiteral values in `const` and bare const references in PrimaryTime, folded by the constant folder. Prerequisite: the evaluator must resolve references by AST node, not by name (the high bug at expression-evaluator.ts:135, where a local that shadows a global const gets the global's value).
  2. Add event labels with `at … as intro [..]`, and allow `intro.start` / `intro.end` in later time expressions. The shared resolver (#4) resolves them and detects cycles.
  3. Add `stagger <delay> <items> at <time> …` for an explicit anchor.
  4. Replace the raw throw with a tagged TransformError that carries a location: 'runtime value $globaldata.beat cannot be used as a time; use a compile-time const'.

**Example**

```
const beat = 7s
at 15s for beat as editBeat [ narrate("edit one, the rest follow") ]
stagger 200ms ["#c4-card-1", "#c4-card-2"] at editBeat.end with revealCard() for 1.5s
```

- **Touches:** eligian.langium (PrimaryTime, TimedEvent label, StaggerBlock anchor, VariableDeclaration) + langium:generate, compiler/transformers/time-transformer.ts, timeline-transformer.ts, constant-folder.ts, expression-evaluator.ts, eligian-scope-provider.ts, type-system-typir (time type), validators/timeline-validator.ts
- **Rationale:** It fixes the confirmed raw-throw crash (the Effect no-throw rule) and stops stagger timing from depending on where an event sits in the document. It ranks below #3 to #9 because it depends on the shared resolver, on the high-severity evaluator shadowing bug, and on a new Typir `time` type.

### #11 Sequence items with inline blocks and a shared `each` prelude

- **Area:** dsl · **Effort:** M · **Score:** 7.7
- **Problem:** A SequenceItem only accepts `OperationCall for <dur>`, so the most common shape, a run of beats that each have an inline body, cannot use `sequence`, and the tour falls back to hand-computed ranges. Every beat also starts with `clearSpots()` (30 occurrences), and inserting a beat means renumbering every later range.
- **Proposal:** Grammar: `SequenceItem: (actionCall=OperationCall | 'for'?) 'for' duration … ('[' start ']' ('[' end ']')?)?`, which accepts either `call() for 7s` or `for 7s [start] [end]?`. Add `sequence ('each' '[' prelude ']' ('then' '[' postlude ']')?)? '{' … '}'`. The prelude is prepended to each item's start ops, and the postlude to each item's end ops. Generate stable action names for anonymous items (`sequence-<timeline>-<index>`, with rounded times). An optional `as <name>` connects to the markers from #10. Absolute ranges come from the inlay hints in #4. Prerequisite: the end-block startAction bug (action-transformer.ts:69).

**Example**

```
sequence each [ clearSpots() ] {
  for 7s [ narrate("An action is a named list…") revealBlock("#c2-code-def") ]
  for 8s [ narrate("Calling your action…") ]
}
```

- **Touches:** eligian.langium (SequenceBlock, SequenceItem) + langium:generate, compiler/transformers/timeline-transformer.ts (transformSequenceBlock), validators/timeline-validator.ts, completion/, LANGUAGE_SPEC.md
- **Rationale:** Together with #3 it removes most hand-computed timing in click-paced presentations. It extends an existing construct naturally, so it fits the language well.

### #14 Runtime source map: engine errors as diagnostics and a live playhead in the editor

- **Area:** runtime-integration · **Effort:** M · **Score:** 7.5
- **Problem:** The IR carries a sourceLocation for every action and operation and builds EligiusIR.sourceMap, but emitter.ts returns only `ir.config`, so the mapping is lost. The preview never subscribes to `engine.on('error')`, although Eligius 3 raises EngineActionError with the action, phase and operation index. Runtime failures are invisible, or they appear under the names of generated JSON actions.
- **Proposal:**
  1. After the optimizer runs, have the emitter optionally return a separate map, `{actions: {[name]: {uri, range, start: [ranges], end: [ranges]}}}`. compile() exposes it, and the CLI writes `<out>.eligian-map.json` under a new `--eligian-map` flag (do not reuse the JS `--sourcemap` flag).
  2. The preview subscribes to `engine.on('error')`, maps (action, phase, opIndex) to a range, and publishes an Error diagnostic with source 'eligius-runtime' in the existing preview DiagnosticCollection, plus a 'Go to source' link in the preview panel.
  3. Forward 'time' events at about 4 Hz and decorate the active events in the editor.
  4. Optional follow-up: gutter breakpoints that pause the preview when an event starts.
  5. Prerequisite: imported library actions must carry their own file URI (the bug at source-location.ts:14).

**Example**

```
Runtime error at 'Logic and Data' 9.0s
addClass (end op #2 of inline action at tour.eligian:212:9): 'selectedElement' is undefined  [Go to source]
```

- **Touches:** compiler/emitter.ts, pipeline.ts, types/eligius-ir.ts, compiler/transformers/source-location.ts, packages/cli/src/compile-file.ts, main.ts, packages/extension/media/preview.ts, preview/PreviewPanel.ts, EligiusEngineService.ts, new extension decorations/playhead-decoration-provider.ts
- **Rationale:** This merges 'Engine-to-source bridge: runtime errors as diagnostics, live playhead and timeline breakpoints' with 'Runtime source maps', and takes the live-highlight part of the first preview idea. Effort is M rather than L because the IR already holds the locations, and breakpoints are left for later to keep it at M. The smoke runner (#21) and the dev server (#23) reuse it.

### #15 Implement the formatter and `eligian fmt --check`

- **Area:** tooling · **Effort:** M · **Score:** 7.4
- **Problem:** EligianFormatter.format() contains only `// No special formatting rules for now`, so Format Document does nothing in VS Code. There is no CLI formatter either, so files with several authors end up with inconsistent indentation and layout of `[ ] [ ]` blocks and imports.
- **Proposal:** Implement Langium formatting rules: 2-space indent inside `[ ]`/`{ }`, one statement per line, `] [` for endable pairs, one blank line between top-level declarations, sorted and deduplicated named imports, whitespace-only normalisation of time literals, and preserved comments and JSDoc. Expose a headless `formatDocument` from pipeline/services.ts and add `eligian fmt <globs> [--check|--write]`, where `--check` prints a diff and exits 1. Back the rules with tests that format every file in examples/ and all __fixtures__, and check that formatting twice changes nothing and the AST is unchanged. Optional setting: `eligian.format.alignTimeRanges`.

**Example**

```
$ eligian fmt --check "**/*.eligian"
  1 file would be reformatted
```

- **Touches:** packages/language/src/eligian-formatter.ts, compiler/pipeline/services.ts, new packages/cli/src/fmt.ts, main.ts, extension package.json
- **Rationale:** A Format Document command that does nothing is a basic IDE gap. Effort is M because comments must not be lost. The decompiler (#25) also needs a working formatter to produce readable output.

### #16 Timeline names as symbols: completion, go-to-definition, references, rename and a 'Did you mean' fix for navigate targets

- **Area:** ide · **Effort:** S · **Score:** 7.1
- **Problem:** `navigate target=STRING` is a plain string. navigate-validator reports 'unknown_navigate_target', but no code action handles it. Timeline names get no completion, Ctrl+Click or Find References, and renaming a timeline silently breaks every navigate that targets it.
- **Proposal:** Without changing the grammar, add a custom DefinitionProvider, ReferenceFinder and RenameProvider override that match NavigateStatement.target to Timeline.name in the same program. Add completion of timeline names after `navigate `, and quick fixes for unknown_navigate_target: 'Change to "`<closest>`"' (using css/levenshtein.ts) and 'Create timeline "`<name>`"'. Prerequisites: add duplicate-name validation for timelines (duplicate-validator.ts:21), make synthetic navigate action names unique per target (navigate-operations.ts:42), and broadcast the timeline's uri rather than its name (navigate-operations.ts:117), so the timeline a symbol resolves to is the one the engine switches to.

**Example**

```
on click "#card-ch4" navigate "Timeline Power Tool"
// 💡 Change to "Timeline Power Tools"   💡 Create timeline "Timeline Power Tool"
```

- **Touches:** eligian-code-action-provider.ts, validators/navigate-validator.ts, validators/program/duplicate-validator.ts, compiler/transformers/navigate-operations.ts, new lsp/timeline-reference-provider.ts, eligian-module.ts, eligian-completion-provider.ts, new completion/timelines.ts
- **Rationale:** The IDE work is cheap, but it is only useful once three navigate and duplicate-name bugs are fixed, which puts it in 'next'.

### #17 Target-scoped events and blocks (`at … target "<sel>"`, `with "<sel>" { }`) plus an 'Insert selectElement' quick fix

- **Area:** dsl · **Effort:** S · **Score:** 7.0
- **Problem:** Start and end chains each begin from an empty `{}`, so every block must open with selectElement(...). 'Re-select in every block' is the first rule in the tour's notes on the execution model. The selector is repeated in start blocks, end blocks and actions, and the 'requires selectedElement' error has no quick fix.
- **Proposal:**
  1. Add `at <range> target "<sel>" [start] [end]?`, which inserts `selectElement(sel)` at the head of both blocks. Use the keyword `target`, not `on`, to avoid clashing with `on event` / `on click`.
  2. Add an in-block `with "<sel>" { ops }` statement that desugars to selectElement followed by the ops.
  3. Add a code action on the selectedElement dependency diagnostic: 'Insert selectElement("`<last selector used in sibling block>`")'.
  4. Run the new selector slot through the existing CSS selector validation.
  5. Prerequisite: apply the control-flow and erased-property checks to event actions and stagger inline blocks (eligian-validator.ts:193), so the new syntax is validated in every context.

**Example**

```
at 0s..5s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
action clearSpots() [ with ".tok" { removeClass("spot") } with ".callout" { removeClass("show") } ]
```

- **Touches:** eligian.langium (TimedEvent, new WithStatement) + langium:generate, compiler/transformers/timeline-transformer.ts, operation-transformer.ts, compiler/operations/validation/dependencies.ts, eligian-code-action-provider.ts, css validators, eligian-formatter.ts
- **Rationale:** It removes the most common runtime mistake at small cost. It ranks below the timing sugar because the quick fix alone delivers most of the value, and the keyword choice needs a short design discussion.

### #18 Selector and class validation through action parameters, checked against layout HTML

- **Area:** ide · **Effort:** M · **Score:** 6.9
- **Problem:** css-parameter-validator only checks string literals passed directly to built-in className or selector parameters. In real files most selectors go through actions (`spotlight("#tok-timeline")`, about 150 call sites in the tour), so typos get no squiggle, completion or did-you-mean. IDs are checked against the CSS, not against the imported layout HTML, where they actually live.
- **Proposal:**
  1. Infer a parameter role (`selector` or `className`) when an action parameter is passed, directly or through nested action calls, to selectElement or to a className/selector input. Compute it in operation-data-tracker.ts or as a Typir annotation, cached per action.
  2. Validate literals passed for role-tagged parameters at call sites, offer CSS and HTML completions, and reuse the Levenshtein quick fix.
  3. Have HtmlRegistry extract IDs and classes from the layout file, and accept selectors that match either the CSS or the HTML. Add a configurable 'not in layout' warning that skips runtime selectors such as `@@currentItem`.
  4. Show the role in the parameter hover.
  5. Prerequisites: the library-import validation bugs (operation-existence-validator.ts:55, and name-based recursion detection at action-validator.ts:94), so roles carry across library files.

**Example**

```
spotlight("#tok-timelin")
//         ~~~~~~~~~~~~~ Unknown ID '#tok-timelin' in layout.html. Did you mean: #tok-timeline?
```

- **Touches:** validators/operation-call/css-parameter-validator.ts, css/selector-validation.ts, html/html-registry.ts, operation-data-tracker.ts, completion/, hover/, css/css-code-actions.ts
- **Rationale:** It extends a strong existing feature (CSS validation, spec 013) to the places where most selectors actually appear. It stays in 'next' because it depends on the library-validation bugs and risks false positives.

### #19 Interaction and playback statements beyond `on click … navigate`

- **Area:** runtime-integration · **Effort:** M · **Score:** 6.8
- **Problem:** NavigateStatement supports only `on click "<sel>" navigate "<tl>" (at t)?`. Play and pause buttons, keyboard navigation, seek-to-marker and click-paced beats all require a hand-written `addController("DOMEventListenerController", …)` plus a broadcastEvent action, even though the engine already listens for timeline play, pause, toggle, seek and stop requests.
- **Proposal:** Generalise the rule to `on <domEvent> "<sel>" <verb>` and `on key "<Key>" <verb>`, with the verbs `navigate "<tl>" (at t)?`, `play`, `pause`, `toggle`, `stop`, `seek <time|marker>` and `run <action>(args)`. Compile them through navigate-operations.ts (a synthetic action plus a DOMEventListenerController; for keys, a document-level listener, after confirming that Eligius supports one). Validate DOM event names against the HTML metadata, and offer completion for events, keys and timelines. Leave `next`/`prev` and `await click` until markers (#10) exist. Prerequisites: the navigate name-collision and name-versus-uri bugs, and event actions being unable to call library actions (action-transformer.ts:166).

**Example**

```
on key "ArrowRight" seek intro.end
on click "#play" toggle
```

- **Touches:** eligian.langium (NavigateStatement → InteractionStatement) + langium:generate, compiler/transformers/navigate-operations.ts, validators/navigate-validator.ts, completion/, LANGUAGE_SPEC.md
- **Rationale:** Valuable for interactive presentations, and it reuses the navigate code. It is in 'next' because three navigate and event-action bugs must be fixed first, and the most useful verbs need markers (#10).

### #20 Timeline-aware Outline and breadcrumbs (Gantt view as a follow-up)

- **Area:** ide · **Effort:** M · **Score:** 6.6
- **Problem:** Langium's default DocumentSymbolProvider lists only named nodes, so the unnamed `at`, sequence and stagger events are missing from the Outline, the breadcrumbs and Ctrl+Shift+O. The only way to move around a 559-line file with 7 timelines is to scroll.
- **Proposal:** Add an EligianDocumentSymbolProvider that nests events under their timeline. Each event is labelled with its resolved range from #4 and its first call (for example 'at 22s..31s · clearSpots, narrate…', 'stagger ×3 22s..23.9s · revealCard', 'on "tour-ping" → ch5OnPing'), and lifecycle blocks (#6) are tagged. Phase 2, which can ship separately, is an 'Eligian Timeline' webview view with one swimlane per timeline, a bar per event and overlap warnings. Clicking a bar shows its source, and double-clicking previews from there through #5.

**Example**

```
▾ timeline "Timeline Power Tools" (0s..42s)
   on enter · showView("#ch4")
   at 0s..7s · narrate…
   stagger ×3 · 22s..23.9s · revealCard
```

- **Touches:** new packages/language/src/lsp/eligian-document-symbol-provider.ts, eligian-module.ts, shared time resolver (#4); phase 2: new packages/extension/src/extension/timeline-view/, extension package.json (views)
- **Rationale:** Once the resolver exists, the Outline part is close to S effort. The Gantt part is L effort and is deliberately split off so it does not delay the cheap win.

### #21 `eligian smoke`: play every timeline headlessly in jsdom and report runtime failures

- **Area:** tooling · **Effort:** M · **Score:** 6.5
- **Problem:** Many Eligian mistakes compile cleanly and fail only at runtime: not re-selecting in an end block, parameter-name mismatches, unregistered controllers. The tour was checked by hand, and no tool listens to the engine's 'error' event.
- **Proposal:** Add `eligian smoke <entry>`. Create jsdom before importing eligius, then boot EngineFactory with the importer map that runtime-bundler.ts generates (export that builder) and a deterministic stepping position source. For each timeline: switchTimeline, seek through every distinct start and end boundary plus the end, then switch away so end ops run. Collect engine 'error' events, unhandled rejections and console errors. An opt-in `--strict` also flags selectElement calls that match 0 elements. Report against the .eligian location using the map from #14. Exit non-zero on failure, and support the same `--format github` output as `check` (#2).

**Example**

```
$ eligian smoke examples/eligian-tour/tour.eligian
  timeline 'Logic and Data' 18 boundaries FAIL
    at 9.0s end-op addClass: selectedElement is undefined (tour.eligian:44)
```

- **Touches:** new packages/cli/src/smoke/{runner,stepping-position-source,instrument}.ts, packages/cli/src/bundler/runtime-bundler.ts (export importer-map builder), packages/cli/package.json (jsdom dependency), main.ts
- **Rationale:** It catches the class of bugs that static validation cannot. It ranks here because it needs #2 and #14 for useful output, and jsdom's limits mean some false positives and negatives. A future `@eligian/testing` library would build on its harness.

### Tier: later

### #22 Go to Definition and Find References between .eligian, CSS and layout HTML

- **Area:** ide · **Effort:** M · **Score:** 6.2
- **Problem:** css-parser.ts records classLocations and idLocations, but only for hover text. Ctrl+Click on `addClass("spot")` or `selectElement("#c3-badge")` does nothing, and from a CSS file there is no way to see which beats toggle a class.
- **Proposal:** Extend Langium's DefaultDefinitionProvider. A className argument jumps to its CSS rules through classLocations. A selector string is split with css/selector-parser.ts, and each #id or .class jumps to its CSS rule and to the layout element (HtmlRegistry must keep element offsets). Add the command 'Find Eligian references' for CSS and HTML files, backed by the indexed Langium documents and the CSS context detection, plus an optional 'N Eligian references' CodeLens in CSS files. It pairs well with the role inference from #18.

**Example**

```
addClass("spot")  // Ctrl+Click → tour.css:118 .tok.spot { … }
```

- **Touches:** new packages/language/src/lsp/eligian-definition-provider.ts, eligian-module.ts, css/css-registry.ts, css/selector-parser.ts, css/context-detection.ts, html/html-registry.ts, extension main.ts
- **Rationale:** Solid navigation value, built on existing CSS infrastructure. It ranks lower because jumping from .eligian to CSS is only moderately useful, and the reverse lookup needs workspace-wide indexing.

### #23 `eligian dev`: browser dev server with live reload that keeps the playhead

- **Area:** cli · **Effort:** L · **Score:** 5.8
- **Problem:** The only live loop is the VS Code webview. Checking the real bundle in a real browser (fonts, video.js, a mobile viewport), or working from another editor, means rerunning `--bundle --force` and refreshing by hand. Each refresh restarts the presentation, and the CLI has no watch mode.
- **Proposal:** Add `eligian dev <entry> [--port] [--open]`. Use an esbuild context() with incremental in-memory rebuilds, served by node:http. Watch the entry, its libraries, and the layout, styles, locales and media found by asset-collector.ts, and push updates over SSE. On a CSS-only change, swap the stylesheet in place. On other changes, reload and restore the timeline uri and position from location.hash through engine.switchTimeline. Show compile errors as a browser overlay using formatErrors. Put the resume and CSS-swap logic in a runtime helper shared with the webview (#8). Prerequisites: the drive-letter fix, and the swallowed HTML import failures (constant-folder.ts:76).

**Example**

```
$ eligian dev examples/eligian-tour/tour.eligian --open
  [12:04:02] presentation.eligian changed -> rebuilt in 180ms, resumed at 'Tooling Magic' 14.2s
```

- **Touches:** new packages/cli/src/dev/{server,watcher,client-runtime}.ts, packages/cli/src/bundler/index.ts, bundler/html-generator.ts, bundler/asset-collector.ts, main.ts
- **Rationale:** High value for people who do not use VS Code, but it is L effort and a second live-preview implementation to maintain. Do it after the webview gets scrubbing and position-preserving reload (#5, #8).

### #24 Host modules: custom operations, functions and controllers declared in the DSL and bundled automatically

- **Area:** runtime-integration · **Effort:** L · **Score:** 5.6
- **Problem:** Eligius 3 registers app-specific code through EligiusResourceImporter, but Eligian cannot declare or bundle such code. Unknown operations fail validation, the bundler imports only named eligius exports, and the `custom` provider silently becomes 'animation'. A single line of custom JS forces authors to hand-edit the generated bundle.
- **Proposal:** Add a default import `extensions "./host.ts"` whose module exports `operations`, `functions` and `controllers`. Read their metadata from a generated `host.eligian-meta.json` (`eligian meta host.ts`, which parses JSDoc `@required`/`@dependency`/`@output` tags with `@typescript/typescript6`, as generate-html-metadata.ts does). Merge it into the registry lookup so validation, completion, signature help (#7) and the customFunction/addController systemName checks all work. `--bundle`, the preview and `dev` pass the module to esbuild and spread its exports into the importer map. Report name collisions with built-ins at compile time. Prerequisite: hasOperation must use Object.hasOwn (operations/index.ts:94).

**Example**

```
extensions "./host.ts"
action intro() [ trackEvent("intro", { endpoint: "/analytics" }) ]
```

- **Touches:** eligian.langium (DefaultImport) + langium:generate, asset-loading/, compiler/operations/ (registry merge), validators/operation-call/*, completion/, packages/cli/src/bundler/runtime-bundler.ts, index.ts, extension preview
- **Rationale:** It makes real-world presentations that need a little custom code possible. But it is L effort, it adds a metadata pipeline, and the preview CSP and Eligius's 'no arbitrary code' stance must be settled first.

### Tier: speculative

### #25 `eligian import`: decompile Eligius JSON into idiomatic .eligian

- **Area:** cli · **Effort:** L · **Score:** 5.4
- **Problem:** Teams with existing Eligius presentations, the audience the DSL was built for, have no migration path. Nothing converts JSON to Eligian, so adopting it means rewriting every timeline by hand.
- **Proposal:** Add `eligian import <config.json> -o out/`. It writes main.eligian, extracts layoutTemplate to layout.html and the locales to per-language files, and adds the languages, layout and locales imports. It recognises the compiler's own expansions and turns them back into DSL syntax:
  - requestAction+startAction → a call
  - forEach → for
  - when/otherwise → if/else
  - break/continue
  - DOMEventListenerController plus request-timeline-uri → navigate
  - eventActions → on event
  - evenly spaced identical actions → stagger/sequence

  It uses registry.generated.ts for positional argument order, emits `// TODO` for operations it cannot map, and prints through the formatter (#15). A round-trip check (compile the output, then compare its structure with the input) runs in the tests and behind a `--verify` flag. A VS Code command wraps it.

**Example**

```
$ eligian import legacy/config.json -o migrated/ --verify
  3 timelines, 41 actions -> 17 actions + 2 stagger blocks; round-trip: 0 differences
```

- **Touches:** new packages/cli/src/decompile/{reader,patterns,printer,roundtrip}.ts, compiler/operations/registry.generated.ts (read-only), eligian-formatter.ts, main.ts, packages/extension commands
- **Rationale:** This merges the two `eligian import` ideas from the CLI and authoring angles. It matters for adoption, but it is L effort, it needs updating for every new piece of DSL syntax, and it depends on a working formatter (#15).

## Dropped ideas

| Title | Reason |
|---|---|
| Semantic tokens: tell actions, operations, parameters, sigils, selectors and times apart | Lowest user value of the remaining ideas (3). It is mostly cosmetic, and with the 25-item cap it lost out to items that fix real defects. Signature help (#7) and inlay hints (#4) already make the action-versus-operation distinction visible. Revisit as a quick S task once those land. |
| Preview inspector: highlight the selector under the cursor and switch languages | Partly merged: the language switcher is now part of #5. The selector-highlight overlay was cut by the cap: it cannot evaluate selectors passed in as parameters, and it overlaps with selector validation through action calls (#18) and Go to Definition (#22). |
| Reusable timeline fragments and compile-time `each` generators | L effort, and its semantics overlap with actions, the sequence `each` prelude (#11) and lifecycle blocks (#6), which together remove most of the repetition it targets. Diagnostics inside expanded code need source mapping in both directions, which does not exist yet. Re-evaluate after #6, #10 and #11. |
| Structural refactorings: Extract action, Inline action, at-to-sequence, repeat-to-stagger | L effort. Most of its motivating examples (the copied 0s..3600s setup block, hand-timed consecutive beats) are better solved by new syntax (#6, #3, #11) than by refactoring tools. Cut by the cap; Extract action is a candidate for a later, smaller standalone item. |
| `@eligian/testing`: timeline assertion API for Vitest | A new public API that would have to be versioned with each Eligius major, built directly on the smoke-runner harness (#21), which does not exist yet. Cut by the cap; revisit once smoke exists. |
| Shareable Eligian libraries via npm: bare-specifier imports + `@eligian/std` | Blocked by confirmed library defects: library actions cannot call sibling or private helpers (FR-010 unimplemented, library-imports.ts:93), transitive resolution depends on import order, and '..' cycles defeat cycle detection (library-loader.ts:85). It would also reverse the spec-042 'relative paths only' rule and requires a published CLI. Fix the library bugs first, then reconsider. |
| `eligian docs`: reference site from action JSDoc and timeline outline | Low end-user value (3) compared with the alternatives. Hover already shows JSDoc, and the Outline (#20) and inlay hints (#4) give a better timeline overview. Cut by the cap. |
| Reusable GitHub Action + CI recipe: check, smoke, bundle, deploy | The in-repo part (compiling examples/ in CI) is merged into #2. The external composite action needs a published CLI, `check` (#2) and `smoke` (#21) first, so it is premature now. |
| Timeline-aware preview: scrubber, play-from-cursor CodeLens and live playhead highlight | Merged: the scrubber and CodeLens went into #5, and the live playhead highlight went into #14. |
| Runtime source maps: map Eligius runtime errors back to .eligian lines | Merged into #14, together with 'Engine-to-source bridge'. |
| `eligian import`: decompile Eligius JSON (or a ConfigurationFactory script's output) | Merged into #25 (a duplicate of the other `eligian import` idea). |
| Project scaffolding, snippets and timeline-event completion | Split: the scaffolding command went into #12 (init + bin fix), and the snippets and the completeTimelineEvents TODO became #13. |

## Method

- **Repo map:** Haiku produced a read-only inventory of packages, modules, DSL constructs, specs and tests (appendix).
- **Build health:** one agent ran typecheck, Biome (`pnpm run ci`), `effect:check` and the full test suite.
- **Review:** 11 Sonnet reviewers, one per area (compiler-core, compiler-transformers, validation, type-system, scope-lsp, completion-html, css-assets-locales, cli-bundler, extension-core, extension-preview-locale, shared-grammar-config). Most findings were reproduced with throwaway scripts in a scratchpad, using the real CLI, parser or services. Nothing was written to the repo.
- **Verification:** Opus checked the 155 reported findings in batches of 5, reading the code and re-running probes. 146 were confirmed, often with corrected severity or a corrected fix. 9 were refuted and are left out of this report. None were left uncertain. Where the verifier corrected a fix, that corrected fix is the one shown here.
- **Ideation:** 3 Opus ideation angles (DSL/authoring, IDE/runtime, CLI/tooling), then an Opus judge that merged, ranked, scored and tiered the ideas into the 25 above and recorded the dropped and merged ones.
- **Known side effect:** the health agent's `pnpm ci` (pnpm's built-in clean install) reinstalled `node_modules` from the lockfile. See Build health.

## Appendix: repo map

## Eligian monorepo inventory (read-only)

**1. Packages**
- `packages/language` (`@eligian/language`): Langium grammar, LSP features, validators, type system (Typir), and the Effect-based DSL-to-Eligius compiler.
- `packages/cli` (`@eligian/cli`): CLI compiler (`compile-file.ts`, `main.ts`, bundler for assets and CSS).
- `packages/extension`: VS Code extension (LSP client, webview preview, CSS loader and watcher).
- `packages/shared-utils`: shared errors, file loader, path resolver, tag guard, locale guards.

**2. Module map of `packages/language/src`** (`.ts` files only, including specs; lines from `cat`)

| Dir / file | Files | Lines | Purpose |
|---|---|---|---|
| `__tests__/` | 72 | 21128 | Test suites and `test-helpers.ts` |
| `compiler/` | 79 | 18337 | Parse, transform, type-check, optimize, emit pipeline |
| `validators/` | 29 | 4677 | Semantic validation rules |
| `type-system-typir/` | 33 | 4114 | Typir-based type system |
| `completion/` | 23 | 6930 | Completion providers |
| `css/` | 18 | 4427 | CSS class and selector validation (PostCSS) |
| `asset-loading/` | 15 | 2840 | Asset import resolution |
| `utils/` | 18 | 1940 | Shared helpers |
| `errors/` | 10 | 2914 | Error types and reporting |
| `generated/` | 3 | 5786 | Langium-generated AST and grammar (do not edit) |
| `jsdoc/` | 8 | 945 | JSDoc parsing for action docs |
| `labels/` | 7 | 685 | Typed label support |
| `lsp/` | 6 | 567 | LSP wiring helpers |
| `html/` | 5 | 745 | HTML metadata for completion |
| `hover/` | 1 | 452 | Hover support |
| `locales/` | 2 | 252 | Locale handling |
| `types/` | 1 | 142 | Shared type declarations |
| `schemas/` | 0 | 0 | No `.ts` files (likely non-TS schema assets) |
| Top-level `eligian-*.ts`, `operation-data-tracker.ts`, `index.ts` | 9 | about 1,700 | Langium service wiring: module, scope, validator, formatter, completion, hover, code action |

**3. DSL constructs** (from `eligian.langium`)
- `Library`: `library <name>` followed by imports and actions. Library files contain only actions.
- `Program`: optional `languages { ... }` block, then statements.
- `LanguagesBlock` and `LanguageEntry`: `languages { * "code" "label" ... }`, where `*` marks the default.
- `DefaultImport`: `layout | styles | provider | locales "<path>"`.
- `NamedImport`: `import <name> from "<path>" (as html|css|media)?`.
- `LibraryImport` and `ActionImport`: `import { a, b as c } from "<path>"`.
- `EventActionDefinition`: `on event "<name>" (topic "<topic>")? action <name>(<params>) [ ... ]`.
- `ActionDefinition`: `(private)? action <name>(<params>)? [ ... ]`, or the endable form `(private)? endable action <name>(...)? [ start ] [ end ]`.
- `Parameter`: `name (: string|number|boolean|object|array)?`.
- `IfStatement`: `if (<expr>) { ... } (else { ... })?`.
- `ForStatement`: `for (<item> in <expr>) { ... }`.
- `BreakStatement` and `ContinueStatement`: `break` and `continue`, valid only inside `for`.
- `NavigateStatement`: `on click "<selector>" navigate "<timeline>" (at <time>)?`.
- `VariableDeclaration`: `const <name> = <expr>`.
- `OperationCall`: `name(args...)`, covering built-in operations and custom actions.
- `Timeline`: `timeline "<name>" in "<selector>" using video|audio|raf|custom (from "<src>")? { events }`.
- `TimedEvent`: `at <start>..<end> <action>`, where the action is an inline endable, an operation call, a for loop, or an if.
- `SequenceBlock` and `SequenceItem`: `sequence { call() for <time> ... }`.
- `StaggerBlock`: `stagger <delay> <items> with <call> for <dur>` or `stagger <delay> <items> for <dur> [ start ] [ end ]`.
- `InlineEndableAction`: `[ start ] [ end ]`.
- `TimeRange`, `TimeExpression`, `RelativeTimeLiteral`: `a..b`, arithmetic on times, `+2s`, units `ms|s|m|h`.
- Expressions: full binary and unary operators (`|| && == != < > + - * / % **`, `!`), object and array literals.
- References: `$scope.x`, `$operationdata.x`, `$globaldata.x` (`PropertyChainReference`); `@@name` (`SystemPropertyReference`); `@var` (`VariableReference`); bare `param` (`ParameterReference`).

**4. Spec index** (`specs/`, title = first `#` heading of `spec.md`)
- 001 Eligian Timeline Preview
- 002 Code Completion for Eligian DSL
- 003 Robust Type System with Typir Integration
- 004 Test Coverage Improvement
- 005 Constant Folding Optimization
- 006 Unified Custom Action and Operation Call Syntax
- 007 Custom Action Reference Provider
- 008 Custom Action Code Completions
- 009 Asset Import Syntax
- 010 Asset Loading & Validation
- 011 Preview CSS Support with Live Reload
- 012 CSS Class/ID Validation (no `spec.md`; has `master-plan.md`)
- 013 CSS Class and Selector Validation
- 014 CSS IDE Features
- 015 HTML Variables
- 016 Shared Utilities Package
- 017 Phase 2 - CSS Consolidation
- 018 Error Type Unification
- 019 Phase 4 - Validation Pipeline Unification
- 020 JSDoc-Style Documentation Comments
- 021 Enhanced Typir Integration for IDE Support
- 022 Test Suite Refactoring
- 023 Library Files with Action Imports
- 024 Validate Imported Actions in Operation Context
- 025 Multi-File Test Infrastructure for Library Imports
- 026 Import Resolution Failures in Multi-File Test Scenarios
- 027 Dependency Package Upgrades
- 028 Event Actions with Declarative Syntax
- 029 Event Name and Argument Validation
- 030 Event Action Code Completion
- 031 Code Duplication Refactoring
- 032 Library File Loading in Compiler Pipeline
- 033 Label Imports
- 034 Typed Labels Validation
- 035 Specialized Controller Syntax
- 036 Label Editor for VSCode Extension
- 037 Languages Declaration Syntax
- 038 Language Block Quick Fix
- 039 Label File Creation Quick Fix
- 040 Standalone Bundle Compilation
- 041 Missing Label Entry Quick Fix
- 042 Looser Import Paths
- 043 HTML Element Completion for createElement
- 044 Eligius 2.0.0 API Migration
- 045 Locale-Based Label Management Refactor

Non-numbered dirs: `eligian-validator-decomposition/` has only `plan.md`. `main/` is the break/continue sugar spec (`spec.md` heading "Break and Continue Syntactic Sugar") with plan, tasks, and contracts.

**5. Import cycles and dead exports**
- Import cycles: `ts_import_cycles` returned 0 cycles. I passed `package: "language"`, and the result may cover the whole graph (465 files, 1005 edges). Not verified per package.
- Dead exports: I ran `ts_dead_exports` on three files only, all with 0 dead. These were `compiler/pipeline.ts` (19 exports checked), `eligian-scope-provider.ts` (1), and `validators/index.ts` (0 exports, so it is a pure barrel or empty). The full-repo count and top-15 list are not established. Running it per module would be needed to produce them.

**6. Test footprint** (`*.spec.ts` files, excluding node_modules)
- `packages/language`: 141
- `packages/extension`: 20
- `packages/cli`: 10
- `packages/shared-utils`: 4
- Total: 175

**Notes**
- `ts_project_info`: 285 project files, 1562 indexed symbols (1320 unique), graph of 465 files and 1005 edges, backend `tsgo` 7.0.2 via `@effect/tsgo`.
- Read-only: no files were edited and no write commands were run.
