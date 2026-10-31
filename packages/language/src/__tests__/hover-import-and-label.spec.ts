/**
 * Regression tests for hover audit findings:
 * - #27: `locales "..."` default import must not hover as Import<media>
 * - #26: the dead buildLabelIDHover builder was removed; label IDs are hovered
 *   through buildControllerHover
 */
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { DefaultImport, NamedImport, Program } from '../generated/ast.js';
import * as hoverBuilders from '../hover/hover-builders.js';
import { buildImportHover } from '../hover/hover-builders.js';
import { hoverContentsText } from './test-helpers.js';

describe('buildImportHover', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  async function firstImport(source: string): Promise<DefaultImport | NamedImport> {
    const doc = await parse(source);
    return doc.parseResult.value.statements.find(
      s => s.$type === 'DefaultImport' || s.$type === 'NamedImport'
    ) as DefaultImport | NamedImport;
  }

  it.each([
    ['layout "./l.html"', 'Import<html>'],
    ['styles "./s.css"', 'Import<css>'],
    ['provider "./v.mp4"', 'Import<media>'],
    ['locales "./labels.json"', 'Import<json>'],
  ])('shows the shared Typir mapping for `%s`', async (source, expected) => {
    const hover = buildImportHover(await firstImport(source));
    expect(hover).toBeDefined();
    expect(hoverContentsText(hover!.contents)).toContain(expected);
  });

  it('does not show Import<media> for locales', async () => {
    const hover = buildImportHover(await firstImport('locales "./labels.json"'));
    expect(hoverContentsText(hover!.contents)).not.toContain('Import<media>');
  });

  it('shows Import<json> for a named .json import', async () => {
    const hover = buildImportHover(await firstImport('import data from "./data.json"'));
    expect(hoverContentsText(hover!.contents)).toContain('Import<json>');
  });
});

describe('buildLabelIDHover removal', () => {
  it('is no longer exported (it could never match)', () => {
    expect('buildLabelIDHover' in hoverBuilders).toBe(false);
  });
});
