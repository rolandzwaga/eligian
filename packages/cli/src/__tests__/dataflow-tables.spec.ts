/**
 * Spec 058 Phase 1 (FR-043, SC-013): the chain-resolution table of
 * `generated/dataflow-tables.md` agrees with Eligius lint. For every registry
 * operation × parameter field, a one-timeline config puts a `$operationdata.`
 * chain in that field and runs `lintConfiguration` (`eligius/lint`): W150 at
 * that field's path fires exactly where the table says "not resolved". Eligius
 * reports W150 only for operations with Eligius metadata (`lint.mjs:4153`); the
 * table marks the others, and their rows are not linted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAllOperations, type IEngineConfiguration } from '@eligian/language';
import { lintConfiguration } from 'eligius/lint';
import { metadata } from 'eligius/metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKnowledge } from '../../scripts/generate-knowledge.js';

const RESOLVED = 'resolved';
const NOT_RESOLVED = 'not resolved';
/** The table's marker for an operation Eligius has no metadata for */
const NO_METADATA = 'not an Eligius operation';

const ROW = /^\| `([^`]+)` \| `([^`]+)` \| ([^|]+?) \|$/gm;

/** `operation.field` → the table's claim */
let claims: ReadonlyMap<string, string>;
let outDir: string;

beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-docs-'));
  await generateKnowledge({ outDir });
  const table = fs.readFileSync(path.join(outDir, 'generated', 'dataflow-tables.md'), 'utf8');
  claims = new Map(
    [...table.matchAll(ROW)].map(([, operation, field, claim]) => [`${operation}.${field}`, claim])
  );
}, 120_000);

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

const OPERATION_PATH = 'timelines[0].timelineActions[0].startOperations[0]';

/** A one-timeline config whose start operation holds a chain in `field` */
function probeConfig(systemName: string, field: string): IEngineConfiguration {
  return {
    id: 'probe',
    engine: { systemName: 'EligiusEngine' },
    containerSelector: '#root',
    language: 'en-US',
    layoutTemplate: '<div></div>',
    availableLanguages: [{ id: 'lang', languageCode: 'en-US', label: 'English' }],
    timelineProviderSettings: {
      animation: { id: 'provider', vendor: 'eligius', systemName: 'RafPositionSource' },
    },
    initActions: [],
    actions: [],
    eventActions: [],
    timelines: [
      {
        id: 'timeline',
        uri: 'timeline',
        type: 'animation',
        duration: 10,
        loop: false,
        selector: '#root',
        timelineActions: [
          {
            id: 'action',
            name: 'probe',
            duration: { start: 0, end: 1 },
            startOperations: [
              {
                id: 'operation',
                systemName,
                operationData: { [field]: '$operationdata.probe' },
              },
            ],
            endOperations: [],
          },
        ],
      },
    ],
  } as unknown as IEngineConfiguration;
}

const fields = getAllOperations()
  .flatMap(signature =>
    signature.parameters.map(parameter => [signature.systemName, parameter.name])
  )
  .sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));

describe('dataflow-tables', () => {
  it('has a row for every operation field', () => {
    expect(fields.length).toBeGreaterThan(0);
    expect([...claims.keys()].sort()).toEqual(fields.map(([o, f]) => `${o}.${f}`).sort());
  });

  it.each(fields)('%s.%s', (systemName, field) => {
    const claim = claims.get(`${systemName}.${field}`);
    expect([RESOLVED, NOT_RESOLVED, NO_METADATA]).toContain(claim);
    if (claim === NO_METADATA) {
      // Eligius lint cannot check it (no W150 without metadata): skipped, but the marker must be true.
      expect(Object.keys(metadata).includes(systemName)).toBe(false);
      return;
    }
    expect(Object.keys(metadata).includes(systemName)).toBe(true);
    const w150 = lintConfiguration(probeConfig(systemName, field)).filter(
      diagnostic =>
        diagnostic.code === 'W150' && diagnostic.path === `${OPERATION_PATH}.operationData.${field}`
    );
    expect({ claim, w150: w150.length > 0 }).toEqual({ claim, w150: claim === NOT_RESOLVED });
  });
});
