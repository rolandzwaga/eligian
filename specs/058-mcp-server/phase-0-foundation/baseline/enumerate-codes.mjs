// Enumerates every diagnostic code emittable today (spec 058 Phase 0, FR-002 / SC-003;
// plan "Enumeration rules" 1-6). Plain Node ESM, no dependencies.
//
//   node specs/058-mcp-server/phase-0-foundation/baseline/enumerate-codes.mjs \
//     > specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-before.json \
//     2> specs/058-mcp-server/phase-0-foundation/baseline/emittable-codes-dropped.txt
//
// stdout: JSON array [{ code, kind, sites: ['file:line', ...] }], sorted by code.
// stderr: every scanned literal that no rule admits, with file:line and the reason.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SRC = join(ROOT, 'packages', 'language', 'src');

const OPERATION_ERRORS = 'compiler/operations/validation/errors.ts'; // rule (iii)
const VALIDATION_ERRORS = 'validators/validation-errors.ts'; // rule (iv)

// Rule (i-b): code unions that a validator passes through to `accept` as an identifier.
// `unionPattern` captures the union's literal text; `passedAt` / `passThrough` is the
// pass-through site, checked so that the rule fails loudly if the code drifts.
const PASS_THROUGH_UNIONS = [
  {
    file: 'dataflow/operation-dataflow.ts',
    name: 'DataflowCode',
    unionPattern: /\btype\s+DataflowCode\s*=\s*((?:\|?\s*'[^']+'\s*)+);/,
    passedAt: 'validators/dataflow-validator.ts',
    passThrough: /code:\s*diagnostic\.code\b/,
  },
  {
    // validateLabelID's result; label-parameter-validator.ts reportLabelIDError puts
    // `error.code` into the diagnostic data of its `accept`.
    file: 'type-system-typir/validation/label-id-validation.ts',
    name: 'LabelIDValidationError.code',
    unionPattern: /\binterface\s+LabelIDValidationError\s*\{[^}]*?\bcode:\s*((?:'[^']+'\s*\|?\s*)+);/,
    passedAt: 'validators/operation-call/label-parameter-validator.ts',
    passThrough: /\{\s*code:\s*error\.code\s*\}/,
  },
];

// Literals reported "not in an accept info object" that were investigated (plan: investigate
// before accepting the baseline): file -> finding, appended to the reason.
const INVESTIGATED = {
  'validators/locale-import-validator.ts':
    'investigated: validateLocalesJSON is called only at asset-loading/compiler-integration.ts, ' +
    'whose createLocalesImportError drops the code; asset-import-validator accepts asset errors ' +
    'without a code, so it never reaches a diagnostic',
};

const dropped = [];
const admitted = new Map(); // code -> { kind, sites: Set }

function admit(code, kind, site) {
  const entry = admitted.get(code);
  if (!entry) {
    admitted.set(code, { kind, sites: new Set([site]) });
    return;
  }
  if (entry.kind !== kind) {
    throw new Error(`code '${code}' admitted as both ${entry.kind} and ${kind} (${site})`);
  }
  entry.sites.add(site);
}

function drop(site, text, reason) {
  dropped.push({ site, text, reason });
}

// ---------------------------------------------------------------------------
// Files

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC, [])
  .map(full => ({ full, rel: relative(SRC, full).split(sep).join('/') }))
  .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

const repoRel = rel => `packages/language/src/${rel}`;

// ---------------------------------------------------------------------------
// Lexer: blanks comments (rule 1) and marks string / template / regex characters.

const CODE = 0;
const STRING = 1;
const COMMENT = 2;
const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'throw', 'delete', 'new',
  'yield', 'await', 'instanceof',
]);

function regexEnd(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') return -1;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      i++;
      while (i < text.length && /[a-z]/i.test(text[i])) i++;
      return i;
    }
    i++;
  }
  return -1;
}

function regexAllowed(text, kinds, pos) {
  let j = pos - 1;
  while (j >= 0 && (kinds[j] === COMMENT || /\s/.test(text[j]))) j--;
  if (j < 0) return true;
  const c = text[j];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(text[k])) k--;
    return REGEX_PREFIX_KEYWORDS.has(text.slice(k + 1, j + 1));
  }
  return false;
}

function lex(text) {
  const kinds = new Uint8Array(text.length);
  const blank = text.split('');
  const templateStack = []; // brace depth at each `${`
  let depth = 0;
  let i = 0;
  const n = text.length;

  const scanString = (quote, from) => {
    let j = from + 1;
    while (j < n && text[j] !== quote && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, n);
  };
  // Scans template text from `from` (just after ` or }); returns [end, endsWithInterpolation].
  const scanTemplate = from => {
    let j = from;
    while (j < n) {
      if (text[j] === '\\') {
        j += 2;
      } else if (text[j] === '`') {
        return [j + 1, false];
      } else if (text[j] === '$' && text[j + 1] === '{') {
        return [j + 2, true];
      } else {
        j++;
      }
    }
    return [n, false];
  };
  const mark = (from, to, kind) => {
    for (let k = from; k < to; k++) {
      kinds[k] = kind;
      if (kind === COMMENT && blank[k] !== '\n' && blank[k] !== '\r') blank[k] = ' ';
    }
  };
  const template = from => {
    const [end, interpolates] = scanTemplate(from);
    mark(from - 1, end, STRING);
    if (interpolates) templateStack.push(depth);
    return end;
  };

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      mark(i, j, COMMENT);
      i = j;
    } else if (c === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const j = close === -1 ? n : close + 2;
      mark(i, j, COMMENT);
      i = j;
    } else if (c === "'" || c === '"') {
      const j = scanString(c, i);
      mark(i, j, STRING);
      i = j;
    } else if (c === '`') {
      i = template(i + 1);
    } else if (c === '/' && regexAllowed(text, kinds, i)) {
      const j = regexEnd(text, i);
      if (j === -1) {
        i++;
      } else {
        mark(i, j, STRING);
        i = j;
      }
    } else if (c === '{') {
      depth++;
      i++;
    } else if (c === '}') {
      if (templateStack.length > 0 && templateStack[templateStack.length - 1] === depth) {
        templateStack.pop();
        i = template(i + 1);
      } else {
        depth--;
        i++;
      }
    } else {
      i++;
    }
  }
  return { kinds, blank: blank.join('') };
}

// ---------------------------------------------------------------------------
// Helpers

function lineOf(text, pos) {
  let line = 1;
  for (let k = 0; k < pos; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

function unionMembers(unionText) {
  return [...unionText.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

// Bracket stack (code characters only) at each requested position, ascending.
function bracketStacks(text, kinds, positions) {
  const result = new Map();
  const stack = [];
  let p = 0;
  for (let k = 0; k < text.length && p < positions.length; k++) {
    while (p < positions.length && positions[p] === k) {
      result.set(k, stack.slice());
      p++;
    }
    if (kinds[k] !== CODE) continue;
    const c = text[k];
    if (c === '(' || c === '[' || c === '{') stack.push({ c, pos: k });
    else if (c === ')' || c === ']' || c === '}') stack.pop();
  }
  for (; p < positions.length; p++) result.set(positions[p], stack.slice());
  return result;
}

function precedingCode(blank, pos) {
  let j = pos - 1;
  while (j >= 0 && /\s/.test(blank[j])) j--;
  return blank.slice(Math.max(0, j - 200), j + 1);
}

// Rule (i-a): the literal sits in the info object of an `accept(` call (only `{` between).
function inAcceptInfoObject(blank, stack) {
  for (let k = stack.length - 1; k >= 0; k--) {
    if (stack[k].c === '{') continue;
    return stack[k].c === '(' && k < stack.length - 1 && /\baccept\s*$/.test(precedingCode(blank, stack[k].pos));
  }
  return false;
}

// Rule 6: a type member (`code: 'x';` / `code: 'x' | ...`) or a member of an
// interface / type-alias body.
function inTypePosition(blank, literalEnd, stack) {
  const rest = blank.slice(literalEnd).match(/^\s*(\S)(\S)?/);
  if (rest && (rest[1] === ';' || (rest[1] === '|' && rest[2] !== '|'))) return true;
  const top = stack[stack.length - 1];
  if (!top || top.c !== '{') return false;
  const before = precedingCode(blank, top.pos);
  return /\b(?:interface\s+[\w$]+(?:\s*<[^{]*>)?(?:\s+extends\s+[^{]+)?|type\s+[\w$]+(?:\s*<[^=]*>)?\s*=)$/.test(
    before
  );
}

// ---------------------------------------------------------------------------
// Pass 1: lex every file, collect the (i-b) unions and the constants used as `code:` values.

const lexed = files.map(f => {
  const text = readFileSync(f.full, 'utf8');
  return { ...f, text, ...lex(text) };
});
const byRel = new Map(lexed.map(f => [f.rel, f]));

const passThrough = new Map(); // file -> { name, members: Set, unionLine }
for (const union of PASS_THROUGH_UNIONS) {
  const file = byRel.get(union.file);
  const passer = byRel.get(union.passedAt);
  const m = file && union.unionPattern.exec(file.blank);
  if (!m) throw new Error(`(i-b) union ${union.name} not found in ${union.file}`);
  if (!passer || !union.passThrough.test(passer.blank)) {
    throw new Error(`(i-b) pass-through of ${union.name} not found in ${union.passedAt}`);
  }
  passThrough.set(union.file, {
    name: union.name,
    members: new Set(unionMembers(m[1])),
    unionLine: lineOf(file.text, m.index + m[0].indexOf(m[1])),
    seen: new Set(),
  });
}

const operationCodes = new Set(); // rule (iii) union members, verbatim
{
  const file = byRel.get(OPERATION_ERRORS);
  if (!file) throw new Error(`${OPERATION_ERRORS} not found`);
  for (const m of file.blank.matchAll(/\bcode:\s*((?:'[^']+'\s*\|?\s*)+);/g)) {
    for (const member of unionMembers(m[1])) operationCodes.add(member);
  }
}

const constantsUsedAsCode = new Set();
for (const f of lexed) {
  for (const m of f.blank.matchAll(/\bcode\s*:\s*([A-Z][A-Z0-9_]*_CODE)\b/g)) {
    if (f.kinds[m.index] === CODE) constantsUsedAsCode.add(m[1]);
  }
}

// ---------------------------------------------------------------------------
// Pass 2: classify every `code: '…'` literal and every `*_CODE = '…'` constant.

const CODE_LITERAL = /\bcode(\??)\s*:\s*(['"])((?:\\.|(?!\2)[^\\\n])*)\2/g;

for (const f of lexed) {
  const site = line => `${repoRel(f.rel)}:${line}`;

  // Literals inside comments (rule 1) and inside string text never enter.
  for (const m of f.text.matchAll(CODE_LITERAL)) {
    const kind = f.kinds[m.index];
    if (kind === COMMENT) drop(site(lineOf(f.text, m.index)), m[0], 'comment');
    else if (kind === STRING) drop(site(lineOf(f.text, m.index)), m[0], 'inside string text');
  }

  const matches = [...f.blank.matchAll(CODE_LITERAL)].filter(
    m => f.kinds[m.index] === CODE && f.kinds[m.index + m[0].length - 1] === STRING
  );
  const stacks = bracketStacks(f.text, f.kinds, matches.map(m => m.index));

  // Rules (iii) and (iv): the code unions, admitted as a whole.
  const unionLines = new Set();
  if (f.rel === OPERATION_ERRORS || f.rel === VALIDATION_ERRORS) {
    for (const m of f.blank.matchAll(/\bcode:\s*((?:'[^']+'\s*\|?\s*)+);/g)) {
      const line = lineOf(f.text, m.index);
      unionLines.add(line);
      for (const member of unionMembers(m[1])) {
        if (f.rel === OPERATION_ERRORS) admit(member.toLowerCase(), 'lowercased', site(line));
        else admit(member, 'pass-through', site(line));
      }
    }
  }

  for (const m of matches) {
    const line = lineOf(f.text, m.index);
    const value = m[3];
    const stack = stacks.get(m.index);
    if (unionLines.has(line)) continue;
    if (f.rel.startsWith('compiler/operations/')) {
      drop(
        site(line),
        m[0],
        operationCodes.has(value)
          ? 'compiler/operations (excluded from (i); reaches a diagnostic only lowercased, via (iii))'
          : 'compiler/operations (excluded from (i); not an OperationValidationError code, never a diagnostic)'
      );
      continue;
    }
    if (m[1] === '?' || inTypePosition(f.blank, m.index + m[0].length, stack)) {
      drop(site(line), m[0], 'type position');
      continue;
    }
    if (inAcceptInfoObject(f.blank, stack)) {
      admit(value, 'literal', site(line));
      continue;
    }
    const union = passThrough.get(f.rel);
    if (union?.members.has(value)) {
      union.seen.add(value);
      admit(value, 'literal', site(line));
      continue;
    }
    const finding = INVESTIGATED[f.rel];
    drop(site(line), m[0], `not in an accept info object${finding ? ` (${finding})` : ''}`);
  }

  // Rule (ii): `*_CODE = '…'` constants, admitted when some `code:` takes them as its value.
  for (const m of f.blank.matchAll(
    /\bconst\s+([A-Z][A-Z0-9_]*_CODE)\s*(?::[^=\n]+)?=\s*(['"])((?:\\.|(?!\2)[^\\\n])*)\2/g
  )) {
    if (f.kinds[m.index] !== CODE) continue;
    const line = lineOf(f.text, m.index);
    if (constantsUsedAsCode.has(m[1])) admit(m[3], 'constant', site(line));
    else drop(site(line), m[0], 'constant never used as a code: value');
  }
}

// Union members of an (i-b) union with no value-position literal: site = the union.
for (const [file, union] of passThrough) {
  for (const member of union.members) {
    if (!union.seen.has(member)) admit(member, 'literal', `${repoRel(file)}:${union.unionLine}`);
  }
}

// ---------------------------------------------------------------------------
// Output

const compareSites = (a, b) => {
  const [fa, la] = [a.slice(0, a.lastIndexOf(':')), Number(a.slice(a.lastIndexOf(':') + 1))];
  const [fb, lb] = [b.slice(0, b.lastIndexOf(':')), Number(b.slice(b.lastIndexOf(':') + 1))];
  return fa < fb ? -1 : fa > fb ? 1 : la - lb;
};

const result = [...admitted.entries()]
  .map(([code, { kind, sites }]) => ({ code, kind, sites: [...sites].sort(compareSites) }))
  .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

dropped.sort((a, b) => compareSites(a.site, b.site));
for (const d of dropped) {
  process.stderr.write(`${d.site}  ${d.text.replace(/\s+/g, ' ')}  -- ${d.reason}\n`);
}
