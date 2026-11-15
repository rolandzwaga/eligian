/**
 * The Eligius lint rules that `eligian check` reports as `eligius-<rule>`
 * (spec 058 phase 1, FR-036). `eligius/lint` exports no rule list, so this is
 * curated: the rule literals of the installed `eligius/dist/lint.mjs` minus
 * `LINT_RULES_CHECKED_BY_ELIGIAN` (W111). The knowledge drift spec guards it.
 */
export const ELIGIUS_LINT_RULES: readonly string[] = [
  'E001',
  'E101',
  'E111',
  'E120',
  'E130',
  'E131',
  'E140',
  'E141',
  'E160',
  'E310',
  'W110',
  'W150',
  'W151',
  'W160',
];
