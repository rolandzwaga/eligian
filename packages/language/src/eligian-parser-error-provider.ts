/**
 * Readable syntax errors.
 *
 * Chevrotain's default messages list every token sequence the parser could
 * have accepted. Because most keywords are also valid names (the contextual
 * keywords of the `Identifier` rule), a misplaced word produced a list of 50+
 * alternatives, and simple mismatches used internal token names ("token of
 * type 'STRING'", "found ``" at the end of the file). Here:
 *
 * - a keyword where a name is expected says so:
 *     'loop' is a keyword, so it cannot be used as a name here. Choose another name.
 * - the keywords a name may also be are folded into "a name"
 * - tokens are described in words ("a string", "a number", "the end of the file")
 * - a short list of alternatives is spelled out, a long one is not:
 *     Expected a name here, but found '='.
 *     Expected 'video', 'audio', 'raf', 'scroll' or 'custom' here, but found 'banana'.
 */
import type { IToken, TokenType } from 'chevrotain';
import {
  AstUtils,
  GrammarAST,
  type LangiumCoreServices,
  LangiumParserErrorMessageProvider,
} from 'langium';

/** The datatype rules whose keyword alternatives are names (contextual keywords). */
const NAME_RULES = ['Identifier', 'ActionName', 'DomEventName', 'FeatureName'];

/** The most alternatives a message spells out. */
const MAX_LISTED = 6;

/**
 * What a rule's alternatives are, in words: used instead of listing the tokens
 * they may start with.
 */
const CONCEPTS: Record<string, string> = {
  PrimaryTime: 'a time (such as 2s, +1s, @beat or intro.end)',
  TimelineAction: 'an action or operation call, or a [ … ] block',
  Primary: 'a value (such as "text", 5, true, [ … ], { … }, @constant or $operationdata.name)',
};

/** Langium appends a zero-width space to the rule names it gives Chevrotain. */
const ruleOf = (ruleName: string) => ruleName.replace(/\u200B/g, '');

const TERMINAL_WORDS: Record<string, string> = {
  ID: 'a name',
  STRING: 'a string',
  NUMBER: 'a number',
  EOF: 'the end of the file',
};

export class EligianParserErrorMessageProvider extends LangiumParserErrorMessageProvider {
  /** Keywords that are also valid names */
  private readonly nameKeywords: ReadonlySet<string>;
  /** Names of the grammar's terminals (ID, STRING, …) */
  private readonly terminals: ReadonlySet<string>;

  constructor(services: LangiumCoreServices) {
    super();
    const grammar = services.Grammar;
    const nameKeywords = new Set<string>();
    for (const rule of grammar.rules) {
      if (GrammarAST.isParserRule(rule) && NAME_RULES.includes(rule.name)) {
        for (const node of AstUtils.streamAllContents(rule)) {
          if (GrammarAST.isKeyword(node)) nameKeywords.add(node.value);
        }
      }
    }
    this.nameKeywords = nameKeywords;
    this.terminals = new Set([
      ...grammar.rules.filter(GrammarAST.isTerminalRule).map(rule => rule.name),
      'EOF',
    ]);
  }

  override buildMismatchTokenMessage(options: {
    expected: TokenType;
    actual: IToken;
    previous: IToken;
    ruleName: string;
  }): string {
    const rule = ruleOf(options.ruleName);
    // A timeline body ends at the first word that starts no event
    if (rule === 'Timeline' && options.expected.name === '}') {
      return `Expected an event (at, sequence, stagger), on enter / on leave, or '}' here, but found ${this.actual(options.actual)}.`;
    }
    const message = this.message([options.expected], options.actual);
    // `Foo(if)`, `a(x, for)`: right after ( or , a keyword was meant as a name
    if (this.isKeyword(options.actual) && ['(', ','].includes(options.previous?.image ?? '')) {
      return message.replace(
        /\.$/,
        ` ('${options.actual.image}' is a keyword and cannot be used as a name).`
      );
    }
    return message;
  }

  override buildNotAllInputParsedMessage(options: {
    firstRedundant: IToken;
    ruleName: string;
  }): string {
    return `Unexpected ${this.actual(options.firstRedundant)}: expected the end of the file (or a timeline, action, constant or import).`;
  }

  override buildNoViableAltMessage(options: {
    expectedPathsPerAlt: TokenType[][][];
    actual: IToken[];
    previous: IToken;
    customUserDescription: string;
    ruleName: string;
  }): string {
    const concept = CONCEPTS[ruleOf(options.ruleName)];
    const expected = firstTokens(options.expectedPathsPerAlt.flat());
    if (concept && !this.keywordAsName(expected, options.actual[0])) {
      return `Expected ${concept} here, but found ${this.found(options.actual[0])}.`;
    }
    return this.message(expected, options.actual[0]);
  }

  override buildEarlyExitMessage(options: {
    expectedIterationPaths: TokenType[][];
    actual: IToken[];
    previous: IToken;
    customUserDescription: string;
    ruleName: string;
  }): string {
    return this.message(firstTokens(options.expectedIterationPaths), options.actual[0]);
  }

  /** The message for finding `actual` where one of `expected` was needed. */
  private message(expected: readonly TokenType[], actual: IToken | undefined): string {
    const names = new Set(expected.map(type => type.name));
    const nameExpected = names.has('ID');
    if (actual && this.keywordAsName(expected, actual)) {
      return `'${actual.image}' is a keyword, so it cannot be used as a name here. Choose another name.`;
    }
    // The keywords a name may also be are part of "a name"
    const described = [...names]
      .filter(name => !(nameExpected && this.nameKeywords.has(name)))
      .map(name => this.describe(name));
    const found = this.found(actual);
    if (described.length === 0 || described.length > MAX_LISTED) {
      return `Unexpected ${found} here.`;
    }
    // A name is one of the options, and the word is a keyword: say why it is not one
    const hint =
      nameExpected && actual && this.isKeyword(actual)
        ? ` ('${actual.image}' is a keyword and cannot be used as a name)`
        : '';
    return `Expected ${orList(described)} here, but found ${found}${hint}.`;
  }

  /** A keyword where the only thing that fits is a name (`action loop()`). */
  private keywordAsName(expected: readonly TokenType[], actual: IToken | undefined): boolean {
    if (!actual || !this.isKeyword(actual)) return false;
    const names = expected.map(type => type.name);
    return (
      names.includes('ID') && names.every(name => name === 'ID' || this.nameKeywords.has(name))
    );
  }

  private found(token: IToken | undefined): string {
    return token ? this.actual(token) : 'the end of the file';
  }

  private describe(tokenName: string): string {
    return (
      TERMINAL_WORDS[tokenName] ?? (this.terminals.has(tokenName) ? tokenName : `'${tokenName}'`)
    );
  }

  private actual(token: IToken): string {
    if (token.tokenType.name === 'EOF' || token.image === '') return 'the end of the file';
    return `'${token.image}'`;
  }

  /**
   * A keyword token: its type is named after the keyword (not a terminal), and
   * it is a word (punctuation such as `=` or `[` is named after its text too).
   */
  private isKeyword(token: IToken): boolean {
    const name = token.tokenType.name;
    return !this.terminals.has(name) && name === token.image && /^[A-Za-z_]\w*$/.test(name);
  }
}

/** The first token of every path, without repeats. */
function firstTokens(paths: readonly TokenType[][]): TokenType[] {
  const seen = new Map<string, TokenType>();
  for (const path of paths) {
    const first = path[0];
    if (first && !seen.has(first.name)) seen.set(first.name, first);
  }
  return [...seen.values()];
}

/** "a", "a or b", "a, b or c" */
function orList(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
