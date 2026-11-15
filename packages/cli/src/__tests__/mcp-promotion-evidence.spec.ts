/**
 * Spec 058 Phase 5 (FR-001, FR-001a, SC-020; plan A0-1, P20): the pure promotion-evidence
 * functions. Inline records and telemetry lines only; no files.
 */
import { describe, expect, it } from 'vitest';
import {
  CHECK_NEEDS,
  checkCodesInOrder,
  type EvidenceLine,
  type EvidenceRecord,
  isFullRun,
  type PromotionEvidence,
  promotionEvidence,
  REVIEW_CODES,
  renderPromotionEvidence,
  roundsWhileReported,
} from '../mcp/evals/promotion-evidence.js';

const HEADER =
  '| code | (a) A1 runs with the code | (b) rounds while reported | (c) check needs | (d) editor cost | promote |';

function check(codes: Record<string, number>, truncated?: boolean): EvidenceLine {
  return { tool: 'eligian_check', result: { codes }, ...(truncated ? { truncated: true } : {}) };
}

function rec(
  runId: string,
  caseId: string,
  n: number,
  lines: readonly EvidenceLine[] | undefined,
  arm = 'A1'
): EvidenceRecord {
  return { runId, caseId, arm, n, model: 'claude-sonnet-5-5', lines };
}

function row(evidence: PromotionEvidence, code: string) {
  const found = evidence.rows.find(r => r.code === code);
  if (!found) throw new Error(`no row for ${code}`);
  return found;
}

const C = 'class-never-removed';
const ROW = /^\| `([a-z-]+)` \|/;

describe('promotion evidence (FR-001)', () => {
  it('counts a record once per code however often it is reported', () => {
    const records = [
      rec('F', '1', 1, [check({ [C]: 3 }), check({ [C]: 2 }), check({ [C]: 1 })]),
      rec('F', '1', 2, [check({})]),
    ];
    const evidence = promotionEvidence({ records, caseIds: ['1'], pinned: ['F'] });
    expect(row(evidence, C).runsWithCode).toBe(1);
    expect(row(evidence, 'controller-imbalance').runsWithCode).toBe(0);
  });

  it('counts a round for each reporting check line followed by another check line', () => {
    expect(roundsWhileReported([check({ c: 1 }), check({}), check({ c: 1 })], 'c')).toBe(1);
    expect(roundsWhileReported([check({}), check({ c: 2 })], 'c')).toBe(0);
    expect(roundsWhileReported([check({ c: 1 }), check({ c: 1 }), check({})], 'c')).toBe(2);
    const records = [
      rec('F', '1', 1, [check({ [C]: 1 }), check({ [C]: 1 }), check({})]),
      rec('F', '1', 2, [check({ [C]: 1 }), check({})]),
    ];
    const evidence = promotionEvidence({ records, caseIds: ['1'], pinned: ['F'] });
    expect(row(evidence, C).rounds).toBe(3);
    expect(row(evidence, C).roundsPerRun).toEqual([{ run: 'F', rounds: 3 }]);
  });

  it('ignores lines of other tools and lines without result.codes', () => {
    const other: EvidenceLine = { tool: 'eligian_project', result: { codes: { c: 1 } } };
    const bare: EvidenceLine = { tool: 'eligian_check' };
    const nullCodes: EvidenceLine = { tool: 'eligian_check', result: { codes: null } };
    expect(roundsWhileReported([other, check({})], 'c')).toBe(0);
    expect(roundsWhileReported([check({ c: 1 }), other], 'c')).toBe(0);
    const order = checkCodesInOrder([other, bare, nullCodes, check({ c: 1 })]);
    expect(order.map(o => [...o.codes])).toEqual([[], [], ['c']]);
    const evidence = promotionEvidence({
      records: [
        rec('F', '1', 1, [{ tool: 'eligian_project', result: { codes: { [C]: 1 } } }, bare]),
      ],
      caseIds: ['1'],
      pinned: ['F'],
    });
    expect(row(evidence, C).runsWithCode).toBe(0);
    expect(row(evidence, C).rounds).toBe(0);
  });

  it('says no data and rule not applied when nothing is pinned', () => {
    const records = [rec('F', '1', 1, [check({ [C]: 1 }), check({})])];
    for (const pinned of [undefined, []]) {
      const evidence = promotionEvidence({ records, caseIds: ['1'], pinned });
      expect(evidence.ruleApplies).toBe(false);
      expect(evidence.counted).toEqual([]);
      expect(evidence.rows).toHaveLength(9);
      for (const r of evidence.rows) {
        expect(r.runsWithCode).toBe('no data');
        expect(r.rounds).toBe('no data');
        expect(r.promote).toBe('rule not applied');
      }
    }
  });

  it('isFullRun needs an A1 record for every case id', () => {
    const full = [rec('F', '1', 1, []), rec('F', '2', 1, [])];
    expect(isFullRun(full, ['1', '2'])).toBe(true);
    expect(isFullRun([rec('F', '1', 1, [])], ['1', '2'])).toBe(false);
    expect(isFullRun([rec('F', '1', 1, []), rec('F', '2', 1, [], 'A0')], ['1', '2'])).toBe(false);
    expect(isFullRun([rec('F', '1', 1, undefined), rec('F', '2', 3, undefined)], ['1', '2'])).toBe(
      true
    );
  });

  it('counts only pinned full runs: a partial pinned run next to a full one is rejected and adds no codes', () => {
    const records = [
      rec('F', '1', 1, [check({ [C]: 1 })]),
      rec('F', '2', 1, [check({})]),
      rec('P', '1', 1, [check({ [C]: 1 })]),
      rec('P', '2', 1, [check({ [C]: 1 })], 'A0'),
    ];
    const evidence = promotionEvidence({ records, caseIds: ['1', '2'], pinned: ['P', 'F'] });
    expect(evidence.counted).toEqual(['F']);
    expect(evidence.rejected[0].run).toBe('P');
    expect(evidence.rejected[0].reason).toMatch(/not a full run: no A1 record for 2/);
    expect(row(evidence, C).runsWithCode).toBe(1);
    expect(evidence.ruleApplies).toBe(true);
    const missing = promotionEvidence({ records, caseIds: ['1', '2'], pinned: ['F', 'X'] });
    expect(missing.rejected).toEqual([{ run: 'X', reason: 'no records' }]);
  });

  it('names the arm and the models of each counted run (FR-001: run ids, model, arm)', () => {
    const records = [
      { ...rec('F', '1', 1, [check({})]), model: 'claude-opus-5-5' },
      rec('F', '2', 1, [check({})]),
      rec('F', '2', 2, [check({})]),
      { ...rec('F', '1', 1, [check({})], 'A0'), model: 'ignored-a0-model' },
    ];
    const evidence = promotionEvidence({ records, caseIds: ['1', '2'], pinned: ['F'] });
    expect(evidence.countedModels).toEqual([
      { run: 'F', models: ['claude-opus-5-5', 'claude-sonnet-5-5'] },
    ]);
    const text = renderPromotionEvidence({ scanned: [], evidence });
    expect(text).toContain('- F: counted (arm A1; models claude-opus-5-5, claude-sonnet-5-5)');
    const unknown = promotionEvidence({
      records: [{ ...rec('U', '1', 1, [check({})]), model: '' }],
      caseIds: ['1'],
      pinned: ['U'],
    });
    expect(renderPromotionEvidence({ scanned: [], evidence: unknown })).toContain(
      '- U: counted (arm A1; model not recorded)'
    );
  });

  it('ignores an unpinned full run (the SC-003 re-run)', () => {
    const base = [rec('F', '1', 1, [check({ [C]: 1 }), check({})])];
    const withS = [...base, rec('S', '1', 1, [check({ [C]: 1 }), check({ [C]: 1 }), check({})])];
    const a = promotionEvidence({ records: base, caseIds: ['1'], pinned: ['F'] });
    const b = promotionEvidence({ records: withS, caseIds: ['1'], pinned: ['F'] });
    expect(b.counted).toEqual(['F']);
    expect(b.rows).toEqual(a.rows);
    expect(row(b, C).runsWithCode).toBe(1);
    expect(row(b, C).rounds).toBe(1);
  });

  it('lists a counted A1 record without a log as no data', () => {
    const records = [rec('F', '1', 1, [check({ [C]: 1 })]), rec('F', '2', 3, undefined)];
    const evidence = promotionEvidence({ records, caseIds: ['1', '2'], pinned: ['F'] });
    expect(evidence.counted).toEqual(['F']);
    expect(evidence.noData).toEqual([{ run: 'F', caseId: '2', n: 3 }]);
    expect(row(evidence, C).runsWithCode).toBe(1);
    const text = renderPromotionEvidence({ scanned: [], evidence });
    expect(text).toContain('- F 2 A1-3: no data (no .mcp.log)');

    const noLogs = promotionEvidence({
      records: [rec('F', '1', 1, undefined)],
      caseIds: ['1'],
      pinned: ['F'],
    });
    expect(row(noLogs, C).runsWithCode).toBe('no data');
    expect(row(noLogs, C).rounds).toBe('no data');
    expect(row(noLogs, C).promote).toBe(false);
  });

  it('marks (a) and (b) as lower bounds when a counted check line is truncated', () => {
    const records = [rec('F', '1', 1, [check({ [C]: 40 }, true), check({})])];
    const evidence = promotionEvidence({ records, caseIds: ['1'], pinned: ['F'] });
    expect(evidence.truncatedLines).toBe(1);
    expect(checkCodesInOrder(records[0].lines ?? [])[0].truncated).toBe(true);
    const text = renderPromotionEvidence({ scanned: [], evidence });
    expect(text).toContain('≥');
    expect(text).toContain('lower bounds');
    const clean = renderPromotionEvidence({
      scanned: [],
      evidence: promotionEvidence({
        records: [rec('F', '1', 1, [check({ [C]: 40 }), check({})])],
        caseIds: ['1'],
        pinned: ['F'],
      }),
    });
    expect(clean).not.toContain('≥');
    expect(clean).not.toContain('lower bounds');
  });

  it('promotes on (a) >= 2 or (b) >= 1', () => {
    const twoRuns = promotionEvidence({
      records: [rec('F', '1', 1, [check({ [C]: 1 })]), rec('F', '1', 2, [check({ [C]: 1 })])],
      caseIds: ['1'],
      pinned: ['F'],
    });
    expect(row(twoRuns, C)).toMatchObject({ runsWithCode: 2, rounds: 0, promote: true });
    const oneRound = promotionEvidence({
      records: [rec('F', '1', 1, [check({ [C]: 1 }), check({})])],
      caseIds: ['1'],
      pinned: ['F'],
    });
    expect(row(oneRound, C)).toMatchObject({ runsWithCode: 1, rounds: 1, promote: true });
    const neither = promotionEvidence({
      records: [rec('F', '1', 1, [check({}), check({ [C]: 1 })])],
      caseIds: ['1'],
      pinned: ['F'],
    });
    expect(row(neither, C)).toMatchObject({ runsWithCode: 1, rounds: 0, promote: false });
  });

  it('never promotes lottie-web-not-installed', () => {
    const L = 'lottie-web-not-installed';
    const records = [1, 2, 3, 4, 5].map(n => rec('F', '1', n, [check({ [L]: 1 }), check({})]));
    const evidence = promotionEvidence({ records, caseIds: ['1'], pinned: ['F'] });
    expect(row(evidence, L)).toMatchObject({ runsWithCode: 5, rounds: 5, promote: false });
    expect(CHECK_NEEDS[L]).toBe('install');
  });

  it('renders all 9 REVIEW_CODES with columns (a)-(d), the scanned and pinned runs', () => {
    expect(CHECK_NEEDS).toEqual({
      'controller-imbalance': 'compiled-config',
      'class-never-removed': 'compiled-config',
      'media-file-missing': 'ast-and-files',
      'media-from-duplicate': 'ast-and-files',
      'timeline-container-not-in-layout': 'ast-and-files',
      'media-timeline-first-without-start-gesture': 'ast-and-files',
      'entry-timeline-without-enter': 'ast-and-files',
      'host-operation-in-block-without-select': 'compiled-config',
      'lottie-web-not-installed': 'install',
    });
    const records = [
      rec('F', '1', 1, [check({ [C]: 1 }), check({})]),
      rec('P', '1', 1, [check({ [C]: 1 })], 'A0'),
    ];
    const evidence = promotionEvidence({ records, caseIds: ['1'], pinned: ['F', 'P'] });
    const x = {
      scanned: [
        { run: 'F', note: 'new format; arms A1' },
        { run: 'P', note: 'new format; arms A0' },
        { run: 'old', note: 'one-case harness format; no log' },
      ],
      evidence,
    };
    const text = renderPromotionEvidence(x);
    expect(text).toContain(HEADER);
    const rows = text.split('\n').filter(l => ROW.test(l));
    expect(rows).toHaveLength(9);
    expect(rows.map(l => ROW.exec(l)?.[1])).toEqual([...REVIEW_CODES]);
    expect(text).toContain('a validator on every validation');
    expect(text).toContain(
      'one in-memory compile per clean program after validation (the I-2 channel)'
    );
    expect(text).toContain('not a program check: never promoted');
    expect(text).toContain('- F: new format; arms A1');
    expect(text).toContain('- old: one-case harness format; no log');
    expect(text).toContain('- F: counted (arm A1; model claude-sonnet-5-5)');
    expect(text).toContain('- P: rejected (not a full run: no A1 record for 1)');
    expect(renderPromotionEvidence(x)).toBe(renderPromotionEvidence(x));

    const empty = renderPromotionEvidence({
      scanned: [],
      evidence: promotionEvidence({ records: [], caseIds: ['1'], pinned: undefined }),
    });
    expect(empty).toContain('rule not applied');
    expect(empty).toContain('none exist');
    expect(empty.split('\n').filter(l => ROW.test(l))).toHaveLength(9);
  });
});
