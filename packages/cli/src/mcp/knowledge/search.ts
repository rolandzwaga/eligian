/**
 * Spec 058 Phase 1 (FR-019; plan C7): the keyword search behind `eligian_docs({ query })`.
 *
 * Tokens are lower case, split on non-alphanumerics and on camelCase. Routing comes first: a
 * query word that is an operation name (case-insensitive) puts `operation/<name>` and then
 * `operations-index` at the top. The rest is ranked by score: a query token in the id or title
 * 8, in a use case 4, in the card 3, in the best heading 2, and `log2(1 + count)` of the
 * body (non-operation chunks only); ties by id.
 */
import type { IndexEntry, Knowledge } from './types.js';

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly heading?: string;
}

const OPERATION_PREFIX = 'operation/';
const OPERATIONS_INDEX = 'operations-index';

/** Words split on anything that is not a letter or a digit. */
const words = (text: string): string[] => text.split(/[^A-Za-z0-9]+/).filter(word => word !== '');

const tokenize = (text: string): string[] =>
  words(text).flatMap(word =>
    word
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(' ')
  );

const countIn = (tokens: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
};

/** The heading that holds the most query tokens (the first on a tie); none when none does. */
const bestHeading = (
  headings: readonly string[],
  query: readonly string[]
): { readonly heading?: string; readonly matched: number } => {
  let best: { heading?: string; matched: number } = { matched: 0 };
  for (const heading of headings) {
    const tokens = new Set(tokenize(heading));
    const matched = query.filter(token => tokens.has(token)).length;
    if (matched > best.matched) best = { heading, matched };
  }
  return best;
};

const scoreEntry = (
  entry: IndexEntry,
  knowledge: Pick<Knowledge, 'headings' | 'body'>,
  query: readonly string[]
): SearchHit => {
  const titleTokens = new Set(tokenize(`${entry.id} ${entry.title}`));
  const useCaseTokens = new Set(tokenize(entry.use_cases.join(' ')));
  const cardTokens = new Set(tokenize(entry.card));
  const body = entry.kind === 'operation' ? undefined : knowledge.body(entry.id);
  const bodyCounts = countIn(body === undefined ? [] : tokenize(body));
  const { heading, matched } = bestHeading(knowledge.headings(entry.id), query);

  let score = 2 * matched;
  for (const token of query) {
    if (titleTokens.has(token)) score += 8;
    if (useCaseTokens.has(token)) score += 4;
    if (cardTokens.has(token)) score += 3;
    score += Math.log2(1 + (bodyCounts.get(token) ?? 0));
  }
  return { id: entry.id, score, ...(heading === undefined ? {} : { heading }) };
};

/** The ids routed to the top: the operations the query names, then `operations-index`. */
const routedIds = (index: readonly IndexEntry[], query: string): string[] => {
  const operations = new Map(
    index
      .filter(entry => entry.kind === 'operation' && entry.id.startsWith(OPERATION_PREFIX))
      .map(entry => [entry.id.slice(OPERATION_PREFIX.length).toLowerCase(), entry.id])
  );
  const named = [
    ...new Set(words(query).flatMap(word => operations.get(word.toLowerCase()) ?? [])),
  ];
  if (named.length === 0) return [];
  return index.some(entry => entry.id === OPERATIONS_INDEX) ? [...named, OPERATIONS_INDEX] : named;
};

export function searchIndex(
  knowledge: Pick<Knowledge, 'index' | 'headings' | 'body'>,
  query: string,
  limit = 8
): SearchHit[] {
  const tokens = [...new Set(tokenize(query))];
  const hits = new Map(
    knowledge.index.map(entry => [entry.id, scoreEntry(entry, knowledge, tokens)] as const)
  );
  const routed = routedIds(knowledge.index, query).flatMap(id => hits.get(id) ?? []);
  const routedSet = new Set(routed.map(hit => hit.id));
  const ranked = [...hits.values()]
    .filter(hit => hit.score > 0 && !routedSet.has(hit.id))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...routed, ...ranked].slice(0, limit);
}
