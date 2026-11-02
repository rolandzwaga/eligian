/**
 * Regression test for the hand-written TextMate grammar (audit finding: it was stale and
 * highlighted almost none of the current keywords).
 *
 * The TextMate grammar is not generated, so this spec reads every keyword out of
 * `eligian.langium` and asserts each one is scoped by `eligian.tmLanguage.json`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

interface TmPattern {
  name?: string;
  match?: string;
  begin?: string;
  end?: string;
  include?: string;
  captures?: Record<string, { name: string }>;
  patterns?: TmPattern[];
}

interface TmGrammar {
  scopeName: string;
  patterns: TmPattern[];
  repository: Record<string, TmPattern>;
}

interface Token {
  text: string;
  scopes: string[];
}

const langiumPath = resolve(__dirname, '../eligian.langium');
const grammarPath = resolve(__dirname, '../../syntaxes/eligian.tmLanguage.json');
const tm = JSON.parse(readFileSync(grammarPath, 'utf8')) as TmGrammar;

/** Keyword literals declared in the Langium grammar (comments stripped). */
function langiumKeywords(): string[] {
  const source = readFileSync(langiumPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const words = new Set<string>();
  for (const m of source.matchAll(/'([A-Za-z]+)'/g)) {
    words.add(m[1]);
  }
  return [...words].sort();
}

/** Resolve `include` references and flatten into a list of concrete patterns. */
function flatten(patterns: TmPattern[]): TmPattern[] {
  const out: TmPattern[] = [];
  for (const p of patterns) {
    if (p.include) {
      const target = tm.repository[p.include.replace(/^#/, '')];
      expect(target, `unknown include ${p.include}`).toBeDefined();
      out.push(...flatten(target.patterns ?? [target]));
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Minimal single-line TextMate tokenizer: leftmost match wins, ties go to the earlier rule. */
function tokenize(line: string): Token[] {
  const rules = flatten(tm.patterns);
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < line.length) {
    let best: { rule: TmPattern; m: RegExpExecArray } | undefined;
    for (const rule of rules) {
      const re = new RegExp(rule.match ?? rule.begin ?? '', 'y');
      for (let i = pos; i < line.length; i++) {
        re.lastIndex = i;
        const m = re.exec(line);
        if (m) {
          if (!best || m.index < best.m.index) best = { rule, m };
          break;
        }
      }
    }
    if (!best) break;
    const { rule, m } = best;
    if (m.index > pos) tokens.push({ text: line.slice(pos, m.index), scopes: [] });
    if (rule.begin) {
      const endRe = new RegExp(rule.end ?? '$', 'g');
      endRe.lastIndex = m.index + m[0].length;
      const e = endRe.exec(line);
      const stop = e ? e.index + e[0].length : line.length;
      tokens.push({ text: line.slice(m.index, stop), scopes: rule.name ? [rule.name] : [] });
      pos = stop;
    } else if (rule.captures) {
      let cursor = m.index;
      for (let g = 1; g < m.length; g++) {
        const cap = m[g];
        if (cap === undefined) continue;
        const at = line.indexOf(cap, cursor);
        const scope = rule.captures[String(g)]?.name;
        tokens.push({ text: cap, scopes: scope ? [scope] : [] });
        cursor = at + cap.length;
      }
      pos = m.index + m[0].length;
    } else {
      tokens.push({ text: m[0], scopes: rule.name ? [rule.name] : [] });
      pos = m.index + m[0].length;
    }
    if (m[0].length === 0) pos++;
  }
  if (pos < line.length) tokens.push({ text: line.slice(pos), scopes: [] });
  return tokens;
}

function scopeOf(line: string, text: string): string | undefined {
  return tokenize(line).find(t => t.text === text)?.scopes[0];
}

const TIME_UNITS = new Set(['ms', 's', 'm', 'h']);

describe('TextMate grammar', () => {
  test('targets the eligian scope', () => {
    expect(tm.scopeName).toBe('source.eligian');
  });

  test('extracts a plausible keyword set from eligian.langium', () => {
    const kw = langiumKeywords();
    for (const expected of ['action', 'if', 'else', 'for', 'import', 'locales', 'stagger']) {
      expect(kw).toContain(expected);
    }
  });

  describe('every keyword in eligian.langium is scoped', () => {
    for (const keyword of langiumKeywords()) {
      if (TIME_UNITS.has(keyword)) {
        test(`time unit "${keyword}" is scoped after a number`, () => {
          expect(scopeOf(`5${keyword}`, keyword)).toBe('keyword.other.unit.time.eligian');
        });
      } else {
        test(`keyword "${keyword}" is scoped`, () => {
          const scope = scopeOf(keyword, keyword);
          expect(scope, `"${keyword}" is not highlighted by eligian.tmLanguage.json`).toBeDefined();
          expect(scope).toMatch(/\.eligian$/);
        });
      }
    }
  });

  test('keywords are not matched inside longer identifiers or after a dot', () => {
    expect(scopeOf('format', 'format')).toBeUndefined();
    expect(scopeOf('iffy', 'iffy')).toBeUndefined();
    expect(scopeOf('x.in', 'in')).toBeUndefined();
  });

  test('stale non-keyword "context" is not highlighted', () => {
    expect(scopeOf('context', 'context')).toBeUndefined();
    expect(readFileSync(grammarPath, 'utf8')).not.toMatch(/\bcontext\b/);
  });

  test('comments', () => {
    expect(tokenize('// if else')[0].scopes[0]).toBe('comment.line.double-slash.eligian');
    expect(tokenize('/* if */')[0].scopes[0]).toBe('comment.block.eligian');
    expect(tokenize('// if else')).toHaveLength(1);
  });

  test('strings (both quote styles) swallow keywords', () => {
    expect(tokenize('"if else"')).toEqual([
      { text: '"if else"', scopes: ['string.quoted.double.eligian'] },
    ]);
    expect(tokenize("'a b'")[0].scopes[0]).toBe('string.quoted.single.eligian');
  });

  test('numbers with and without time units', () => {
    expect(scopeOf('42', '42')).toBe('constant.numeric.eligian');
    expect(scopeOf('1.5s', '1.5')).toBe('constant.numeric.eligian');
    expect(scopeOf('1.5s', 's')).toBe('keyword.other.unit.time.eligian');
    expect(scopeOf('500ms', 'ms')).toBe('keyword.other.unit.time.eligian');
    expect(scopeOf('2h', 'h')).toBe('keyword.other.unit.time.eligian');
    expect(scopeOf('3m', 'm')).toBe('keyword.other.unit.time.eligian');
  });

  test.each([
    ['0s..5s', '5', 's'],
    ['1s..2.5s', '2.5', 's'],
    ['at 100ms..1500ms a()', '1500', 'ms'],
  ])('the end of a time range is scoped: %s', (line, number, unit) => {
    const tokens = tokenize(line);
    const range = tokens.findIndex(t => t.text === '..');
    expect(tokens[range].scopes[0]).toBe('keyword.operator.range.eligian');
    expect(tokens[range + 1]).toEqual({ text: number, scopes: ['constant.numeric.eligian'] });
    expect(tokens[range + 2]).toEqual({ text: unit, scopes: ['keyword.other.unit.time.eligian'] });
  });

  test('a decimal fraction is still one number', () => {
    expect(tokenize('1.5')).toEqual([{ text: '1.5', scopes: ['constant.numeric.eligian'] }]);
  });

  test('bare time-unit letters are not keywords outside a number', () => {
    expect(scopeOf('s', 's')).toBeUndefined();
    expect(scopeOf('m', 'm')).toBeUndefined();
  });

  test('$scope / $operationdata / $globaldata property chains', () => {
    for (const scope of ['scope', 'operationdata', 'globaldata']) {
      const tokens = tokenize(`$${scope}.a.b`);
      expect(tokens.map(t => t.text)).toEqual(['$', scope, '.a.b']);
      expect(tokens[1].scopes[0]).toBe('variable.language.scope.eligian');
    }
  });

  test('@@system properties and @const references', () => {
    const sys = tokenize('@@currentItem.name');
    expect(sys.map(t => t.text)).toEqual(['@@', 'currentItem', '.name']);
    expect(sys[1].scopes[0]).toBe('variable.language.system.eligian');
    const ref = tokenize('@myConst');
    expect(ref.map(t => t.text)).toEqual(['@', 'myConst']);
    expect(ref[1].scopes[0]).toBe('variable.other.constant.eligian');
  });

  test('operators', () => {
    expect(scopeOf('0s..5s', '..')).toBe('keyword.operator.range.eligian');
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      expect(scopeOf(`a ${op} b`, op)).toBe('keyword.operator.comparison.eligian');
    }
    for (const op of ['&&', '||', '!']) {
      expect(scopeOf(`a ${op} b`, op)).toBe('keyword.operator.logical.eligian');
    }
    for (const op of ['+', '-', '*', '/', '%', '**']) {
      expect(scopeOf(`a ${op} b`, op)).toBe('keyword.operator.arithmetic.eligian');
    }
    expect(scopeOf('const a = 1', '=')).toBe('keyword.operator.assignment.eligian');
  });

  test('realistic line tokenizes into expected scopes', () => {
    const tokens = tokenize('at 0s..5s fadeIn("#box")');
    expect(tokens.find(t => t.text === 'at')?.scopes[0]).toBe('keyword.control.timeline.eligian');
    expect(tokens.find(t => t.text === 'fadeIn')?.scopes[0]).toBe('entity.name.function.eligian');
    expect(tokens.find(t => t.text === '"#box"')?.scopes[0]).toBe('string.quoted.double.eligian');
  });
});
