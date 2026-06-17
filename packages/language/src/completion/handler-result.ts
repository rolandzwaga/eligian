/**
 * Result signal returned by the extracted completion-branch handlers
 * (CSS / HTML / event). The orchestrating provider interprets it:
 *
 * - `fallthrough`    — this context did not apply; continue to later branches.
 * - `done`           — items were added; return without invoking the default
 *                      Langium completion.
 * - `finalize-noop`  — items were added; invoke `super.completionFor` with a
 *                      no-op acceptor to finalize completion without adding any
 *                      default items.
 *
 * Splitting the branch bodies out of `EligianCompletionProvider.completionFor`
 * while keeping the `super` calls in the class (W3 decomposition).
 */
export type CompletionBranchResult =
  | { status: 'fallthrough' }
  | { status: 'done' }
  | { status: 'finalize-noop' };
