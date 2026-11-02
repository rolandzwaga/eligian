/**
 * Eligius' lint in the editor, the language package's part: a parsed program
 * compiled without a parse of its own (tryCompileProgramWithMap), its findings
 * as diagnostics per file (lintFindingsToParams), and the setting.
 */
import { EmptyFileSystem, TextDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { tryCompileProgramWithMap } from '../../compiler/pipeline.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { ValidationSettings } from '../../validators/validation-settings.js';
import { lintFindingsToParams } from '../eligius-lint-notifications.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const parse = parseHelper<Program>(services);

describe('tryCompileProgramWithMap', () => {
  test('compiles a parsed program, with its map', async () => {
    const document = await parse(`timeline "t" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") ]
}`);
    const compiled = tryCompileProgramWithMap(document.parseResult.value, '/w/main.eligian');
    expect(compiled?.config.timelines[0]?.timelineActions).toHaveLength(1);
    expect(Object.keys(compiled?.map.actions ?? {})).toHaveLength(1);
    expect(compiled?.host).toBeUndefined();
  });

  test('undefined when it does not compile', async () => {
    const library = await parse('library helpers\naction a() [ selectElement("#a") ]');
    expect(tryCompileProgramWithMap(library.parseResult.value, '/w/lib.eligian')).toBeUndefined();
  });
});

describe('lintFindingsToParams', () => {
  const text = TextDocument.create('file:///w/lib.eligian', 'eligian', 1, 'one\n  two three\n');

  test('per file, with the range of the location and the JSON path', () => {
    const params = lintFindingsToParams(
      'file:///w/main.eligian',
      [
        {
          severity: 'error',
          rule: 'E120',
          message: 'bad block',
          path: 'timelines[0].block',
          location: { line: 3, column: 1 },
        },
        {
          severity: 'warning',
          rule: 'W151',
          message: 'nothing provides it',
          path: 'actions[0].x',
          location: { file: 'F:\\w\\lib.eligian', line: 2, column: 3, length: 3 },
        },
        { severity: 'warning', rule: 'W200', message: 'somewhere', path: '' },
      ],
      () => 'file:///w/lib.eligian',
      uri => (uri === text.uri ? text : undefined)
    );
    expect(params).toEqual({
      programUri: 'file:///w/main.eligian',
      files: [
        {
          uri: 'file:///w/main.eligian',
          diagnostics: [
            {
              // Without the file's text: one character
              range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } },
              severity: 1,
              source: 'Eligius lint',
              code: 'E120',
              message: 'bad block (at timelines[0].block in the compiled JSON)',
            },
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              severity: 2,
              source: 'Eligius lint',
              code: 'W200',
              message: 'somewhere (at the configuration in the compiled JSON)',
            },
          ],
        },
        {
          uri: 'file:///w/lib.eligian',
          diagnostics: [
            expect.objectContaining({
              // `two`, from the location's length
              range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } },
              code: 'W151',
            }),
          ],
        },
      ],
    });
  });
});

describe('eligian.validation.eligiusLint', () => {
  test('on unless set to false', () => {
    const settings = new ValidationSettings();
    expect(settings.eligiusLint).toBe(true);
    settings.apply({ eligiusLint: false });
    expect(settings.eligiusLint).toBe(false);
    settings.apply({});
    expect(settings.eligiusLint).toBe(true);
  });
});
