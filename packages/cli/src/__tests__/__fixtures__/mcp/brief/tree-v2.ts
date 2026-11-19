/**
 * A version-2 question tree for the FR-018 tests (spec 059 Phase 1, T014): `TREE` plus one new
 * question `P6` (`since: 2`, no prerequisites, always applies), placed after P5 in tree order.
 */
import { ALWAYS, type Question, TREE } from '../../../../mcp/brief/tree.js';

export const P6: Question = {
  id: 'P6',
  branch: 'P',
  title: 'Is there a call to action at the end?',
  ask: 'Is there a call to action at the end?',
  shape: { kind: 'text' },
  needs: [],
  reads: [],
  appliesWhen: ALWAYS,
  when: 'always',
  docs: [],
  facts: [],
  since: 2,
};

const afterP5 = TREE.findIndex(q => q.id === 'P5') + 1;

export const TREE_V2: readonly Question[] = [...TREE.slice(0, afterP5), P6, ...TREE.slice(afterP5)];
