/**
 * Spec 058 Phase 2 (FR-020–FR-027, FR-005; plan D3): `eligian_project`, the inventory of a
 * program (or of every program in a directory).
 *
 * Per program, one section under the compiler lock: `withLoadedDocuments` loads the program and
 * its libraries into the shared workspace (with its CSS in the registry) and releases them all
 * afterwards; inside it the names (CSS, layout, selectors, locales, host), the outline (the
 * document symbol provider's tree plus timeline and parameter facts), the asset problems (the
 * review pass's own `timelineFindings`) and the STORYBOARD.md text are read. Every user-state
 * read is guarded there, so only a genuine failure becomes `ToolInternal`. Then, still in the
 * lock, `compileFile` gives the timeline durations and the storyboard's ranged action counts
 * (`null` when the program does not compile). The tool writes nothing.
 *
 * `Tool` is `@stability unstable`; the server is built on it (roadmap §2, decision 1: `effect` is
 * pinned exactly).
 */
// @effect-diagnostics unstableApiUsage:off
import fs from 'node:fs';
import path from 'node:path';
import {
  extractTranslationKeys,
  hostModuleOf,
  hostOperations,
  isDefaultImport,
  type LoadedDocuments,
  type Program,
  resolveImportRelativePath,
  STARTERS,
  withLoadedDocuments,
} from '@eligian/language';
import {
  ASSET_REVIEW_CODES,
  EligianDocumentSymbolProvider,
  hostControllers,
  hostFunctions,
  layoutElementsOf,
  parameterRoles,
  selectorNames,
  timelineFindings,
  timelineNamed,
  timelineNames,
} from '@eligian/language/mcp';
import { Effect, Schema } from 'effect';
import { isLibrary } from '../../check/check-command.js';
import { type CompileResult, compileFile } from '../../compile-file.js';
import { CompilerLock } from '../compiler-lock.js';
import { type ToolError, ToolFailure, ToolInternal, toToolError } from '../errors.js';
import { type EffectAi, projectRoot, resolveInputPath, resolveInputPatterns } from '../paths.js';
import { readStoryboard } from '../storyboard.js';
import type { ToolContext } from './check.js';

export const NAME = 'eligian_project' as const;

export const DESCRIPTION =
  'The project inventory of an Eligian program: the css classes and ids, layout ids and classes, ' +
  'the selectors it may use, locales (languages, keys), host names, assets problems, files, ' +
  'outline and STORYBOARD.md counts. `path` is an entry .eligian file or a directory (every ' +
  'program under it gets a section; library files are listed under `files`). Read it before ' +
  'writing selectors or labels: `selectors` is what a selector may name (the CSS plus the ' +
  'layout HTML), `locales.keys` what a label may name. The `outline` lists the timelines ' +
  '(container, provider, `from`, compiled duration) with their events at resolved times, the ' +
  'actions with the role of each parameter, event actions, constants and named imports. ' +
  '`assets.problems` names missing media and named-import files, media timelines sharing one ' +
  'file and timeline containers missing from the layout. `storyboard` compares the beat rows ' +
  'of STORYBOARD.md per timeline with the compiled ranged timeline actions (`null` counts when ' +
  "the program does not compile). `response_format: 'detailed'` adds file sizes, the " +
  'languages of each locale key and the starters. Nothing is written.';

export const KEYWORDS: readonly string[] = [
  'project',
  'inventory',
  'selectors',
  'css',
  'layout',
  'locales',
  'assets',
];

export const Parameters = Schema.Struct({
  path: Schema.String,
  response_format: Schema.optionalKey(Schema.Literals(['concise', 'detailed'])),
});

const FILE_KINDS = [
  'entry',
  'library',
  'layout',
  'styles',
  'locales',
  'provider',
  'asset',
  'media',
  'host',
] as const;
type FileKind = (typeof FILE_KINDS)[number];

const ProjectFile = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(FILE_KINDS),
  exists: Schema.Boolean,
  bytes: Schema.optionalKey(Schema.Int),
});
type ProjectFile = typeof ProjectFile.Type;

const Names = Schema.Struct({
  classes: Schema.Array(Schema.String),
  ids: Schema.Array(Schema.String),
});

const HostEntry = Schema.Struct({
  name: Schema.String,
  parameters: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.optionalKey(Schema.String),
      optional: Schema.Boolean,
    })
  ),
});

const Problem = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  path: Schema.optionalKey(Schema.String),
  line: Schema.Int,
  column: Schema.Int,
});
type Problem = typeof Problem.Type;

const StoryboardSummary = Schema.Struct({
  timelines: Schema.Array(
    Schema.Struct({
      timeline: Schema.String,
      beats: Schema.Int,
      timelineActions: Schema.NullOr(Schema.Int),
    })
  ),
  unknownTimelines: Schema.Array(Schema.String),
  interactions: Schema.Int,
  ignoredRows: Schema.Int,
});

const ProjectProgram = Schema.Struct({
  file: Schema.String,
  files: Schema.Array(ProjectFile),
  css: Names,
  layout: Schema.Struct({ ids: Schema.Array(Schema.String), classes: Schema.Array(Schema.String) }),
  selectors: Names,
  locales: Schema.Struct({
    languages: Schema.Array(Schema.String),
    keys: Schema.Array(Schema.String),
    keyLanguages: Schema.optionalKey(
      Schema.Array(Schema.Struct({ id: Schema.String, languageCodes: Schema.Array(Schema.String) }))
    ),
  }),
  host: Schema.Struct({
    operations: Schema.Array(HostEntry),
    controllers: Schema.Array(HostEntry),
    functions: Schema.Array(HostEntry),
  }),
  /** `{ kind, name, detail?, line, children? }` nodes; recursive, so not spelled out here */
  outline: Schema.Array(Schema.Unknown),
  assets: Schema.Struct({ problems: Schema.Array(Problem) }),
  storyboard: Schema.NullOr(StoryboardSummary),
});
type ProjectProgram = typeof ProjectProgram.Type;

export const Success = Schema.Struct({
  header: Schema.String,
  root: Schema.String,
  files: Schema.Array(ProjectFile),
  programs: Schema.Array(ProjectProgram),
  starters: Schema.optionalKey(
    Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String }))
  ),
});

export const summarizeArgs = (
  params: typeof Parameters.Type
): Readonly<Record<string, unknown>> => ({ response_format: params.response_format ?? 'concise' });

export const makeTool = (ai: EffectAi) =>
  ai.Tool.make(NAME, {
    description: DESCRIPTION,
    parameters: Parameters,
    success: Success,
    failure: ToolFailure,
    dependencies: [CompilerLock],
  })
    .annotate(ai.Tool.Readonly, true)
    .annotate(ai.Tool.Meta, { 'anthropic/maxResultSizeChars': 200000 });

const header = (context: ToolContext, resolvedPath: string): string =>
  `eligian ${context.versions.compiler} · eligius ${context.versions.eligius} · ${NAME} · ${resolvedPath}`;

type Statement = Program['statements'][number];
type StatementOf<T extends Statement['$type']> = Extract<Statement, { readonly $type: T }>;
type Symbol = ReturnType<EligianDocumentSymbolProvider['getSymbols']>[number];

const statementsOf = <T extends Statement['$type']>(program: Program, type: T): StatementOf<T>[] =>
  program.statements.filter((statement): statement is StatementOf<T> => statement.$type === type);

/** The 1-based start of a node's source. */
const startOf = (node: Statement): { line: number; column: number } => {
  const start = node.$cstNode?.range.start;
  return { line: (start?.line ?? 0) + 1, column: (start?.character ?? 0) + 1 };
};

/** The LSP `SymbolKind` names, by value. */
const SYMBOL_KINDS = [
  '',
  'File',
  'Module',
  'Namespace',
  'Package',
  'Class',
  'Method',
  'Property',
  'Field',
  'Constructor',
  'Enum',
  'Interface',
  'Function',
  'Variable',
  'Constant',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Key',
  'Null',
  'EnumMember',
  'Struct',
  'Event',
  'Operator',
  'TypeParameter',
];

interface OutlineNode {
  readonly kind: string;
  readonly name: string;
  readonly detail?: string;
  readonly line: number;
  readonly container?: string;
  readonly provider?: string;
  readonly from?: string;
  /** Set after the compile: the config timeline's duration, null when it does not compile */
  duration?: number | null;
  readonly parameters?: readonly { readonly name: string; readonly role?: string }[];
  readonly children?: readonly OutlineNode[];
}

const comparable = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);

/** A URI's fsPath with the drive letter written as in `like` (fsPath lowercases it). */
const driveAs = (fsPath: string, like: string): string =>
  /^[a-z]:/i.test(fsPath) &&
  /^[a-z]:/i.test(like) &&
  fsPath[0].toLowerCase() === like[0].toLowerCase()
    ? like[0] + fsPath.slice(1)
    : fsPath;

/** What the loaded program yields; the compile completes it. */
interface Inspected {
  readonly section: Omit<ProjectProgram, 'storyboard' | 'outline'>;
  readonly outline: OutlineNode[];
  readonly timelines: readonly string[];
  readonly storyboardText: string | undefined;
}

/** The outline node of a document symbol, with its timeline or action facts. */
function outlineNode(symbol: Symbol, program: Program, topLevel: boolean): OutlineNode {
  const base = {
    kind: SYMBOL_KINDS[symbol.kind] ?? String(symbol.kind),
    name: symbol.name,
    ...(symbol.detail === undefined ? {} : { detail: symbol.detail }),
    line: symbol.range.start.line + 1,
  };
  const children = symbol.children?.map(child => outlineNode(child, program, false));
  const withChildren = children && children.length > 0 ? { children } : {};
  const timelineName = topLevel ? /^timeline "(.*)"$/.exec(symbol.name)?.[1] : undefined;
  const timeline = timelineName === undefined ? undefined : timelineNamed(program, timelineName);
  if (timeline) {
    return {
      ...base,
      container: timeline.containerSelector,
      provider: timeline.provider,
      ...(timeline.source === undefined ? {} : { from: timeline.source }),
      ...withChildren,
    };
  }
  const action = topLevel
    ? [
        ...statementsOf(program, 'RegularActionDefinition'),
        ...statementsOf(program, 'EndableActionDefinition'),
      ].find(definition => definition.name === symbol.name)
    : undefined;
  if (action) {
    const roles = parameterRoles(action);
    return {
      ...base,
      parameters: action.parameters.map(parameter => {
        const role = roles.get(parameter.name);
        return role === undefined ? { name: parameter.name } : { name: parameter.name, role };
      }),
      ...withChildren,
    };
  }
  return { ...base, ...withChildren };
}

/** The guarded locales read: keys, and a problem for a file that is there but does not parse. */
function readLocales(
  program: Program,
  file: string,
  detailed: boolean
): { locales: ProjectProgram['locales']; problems: Problem[] } {
  const languages = program.languages?.entries.map(entry => entry.code) ?? [];
  const localesImport = statementsOf(program, 'DefaultImport').find(i => i.type === 'locales');
  const empty = { languages, keys: [], ...(detailed ? { keyLanguages: [] } : {}) };
  if (!localesImport) return { locales: empty, problems: [] };
  const localesPath = resolveImportRelativePath(localesImport.path, path.dirname(file));
  if (!fs.existsSync(localesPath)) return { locales: empty, problems: [] };
  try {
    const groups = extractTranslationKeys(JSON.parse(fs.readFileSync(localesPath, 'utf8')))
      .map(group => ({ id: group.id, languageCodes: [...group.languageCodes] }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
      locales: {
        languages,
        keys: groups.map(group => group.id),
        ...(detailed ? { keyLanguages: groups } : {}),
      },
      problems: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      locales: empty,
      problems: [
        {
          code: 'locales-parse-failed',
          message: `Failed to parse locales file: ${message}`,
          path: localesPath,
          ...startOf(localesImport),
        },
      ],
    };
  }
}

/** Everything read from the loaded documents (inside `withLoadedDocuments`). */
function inspect(
  loaded: LoadedDocuments,
  file: string,
  unreadable: readonly string[],
  detailed: boolean
): Inspected | undefined {
  const document = loaded.documentOf(file);
  if (!document) return undefined;
  const program = document.parseResult.value as Program;
  const uri = document.uri.toString();
  const dir = path.dirname(file);
  const resolve = (importPath: string) => resolveImportRelativePath(importPath, dir);

  const files: { path: string; kind: FileKind }[] = [{ path: file, kind: 'entry' }];
  for (const library of loaded.documents.values()) {
    if (library !== document)
      files.push({ path: driveAs(library.uri.fsPath, file), kind: 'library' });
  }
  for (const missing of unreadable) files.push({ path: driveAs(missing, file), kind: 'library' });
  for (const statement of program.statements) {
    if (isDefaultImport(statement))
      files.push({ path: resolve(statement.path), kind: statement.type });
  }
  const namedImports = statementsOf(program, 'NamedImport');
  for (const named of namedImports) files.push({ path: resolve(named.path), kind: 'asset' });
  for (const timeline of statementsOf(program, 'Timeline')) {
    if ((timeline.provider === 'video' || timeline.provider === 'audio') && timeline.source) {
      files.push({ path: resolve(timeline.source), kind: 'media' });
    }
  }
  const host = hostModuleOf(program);
  if (host) files.push({ path: resolve(host.path), kind: 'host' });

  const seen = new Set<string>();
  const projectFiles: ProjectFile[] = [];
  for (const entry of files) {
    if (seen.has(comparable(entry.path))) continue;
    seen.add(comparable(entry.path));
    const stat = fs.statSync(entry.path, { throwIfNoEntry: false });
    projectFiles.push({
      ...entry,
      exists: stat !== undefined,
      ...(detailed && stat !== undefined ? { bytes: stat.size } : {}),
    });
  }

  const cssRegistry = loaded.services.css.CSSRegistry;
  const sorted = (names: Iterable<string>): string[] => [...names].sort();
  const layout = layoutElementsOf(loaded.services, program, uri);
  const selectors = selectorNames(loaded.services, program, uri);
  const { locales, problems: localeProblems } = readLocales(program, file, detailed);
  const hostEntry = (declaration: {
    readonly name: string;
    readonly parameters?: readonly {
      readonly name: string;
      readonly type?: string;
      readonly optional: boolean;
    }[];
  }) => ({
    name: declaration.name,
    parameters: (declaration.parameters ?? []).map(parameter => ({
      name: parameter.name,
      ...(parameter.type === undefined ? {} : { type: parameter.type }),
      optional: parameter.optional,
    })),
  });

  const problems: Problem[] = [
    ...timelineFindings(program, file)
      .filter(finding => ASSET_REVIEW_CODES.includes(finding.code))
      .map(finding => ({
        code: finding.code,
        message: finding.message,
        ...(finding.path === undefined ? {} : { path: finding.path }),
        line: finding.line,
        column: finding.column,
      })),
    ...namedImports
      .filter(named => !fs.existsSync(resolve(named.path)))
      .map(named => ({
        code: 'import_file_not_found',
        message: `Asset file not found: ${named.path}`,
        path: resolve(named.path),
        ...startOf(named),
      })),
    ...localeProblems,
  ];

  let storyboardText: string | undefined;
  try {
    storyboardText = fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8');
  } catch {
    storyboardText = undefined; // absent or unreadable: no storyboard (FR-025)
  }

  return {
    section: {
      file,
      files: projectFiles,
      css: {
        classes: sorted(cssRegistry.getClassesForDocument(uri)),
        ids: sorted(cssRegistry.getIDsForDocument(uri)),
      },
      layout: { ids: sorted(layout?.ids ?? []), classes: sorted(layout?.classes ?? []) },
      selectors: { classes: sorted(selectors.classes), ids: sorted(selectors.ids) },
      locales,
      host: {
        operations: hostOperations(program).map(hostEntry),
        controllers: hostControllers(program).map(hostEntry),
        functions: hostFunctions(program).map(hostEntry),
      },
      assets: { problems },
    },
    outline: new EligianDocumentSymbolProvider()
      .getSymbols(document)
      .map(symbol => outlineNode(symbol, program, true)),
    timelines: timelineNames(program),
    storyboardText,
  };
}

/** The storyboard section: beat rows per declared timeline, against the ranged actions. */
function storyboardOf(
  text: string | undefined,
  timelines: readonly string[],
  compiled: CompileResult | undefined
): ProjectProgram['storyboard'] {
  if (text === undefined) return null;
  const storyboard = readStoryboard(text);
  const beats = new Map<string, number>();
  for (const beat of storyboard.beats)
    beats.set(beat.timeline, (beats.get(beat.timeline) ?? 0) + 1);
  const declared = [...beats.keys()].filter(name => timelines.includes(name));
  return {
    timelines: declared.map(name => {
      const config = compiled?.config.timelines[timelines.indexOf(name)];
      return {
        timeline: name,
        beats: beats.get(name) ?? 0,
        timelineActions: config
          ? config.timelineActions.filter(action => action.duration.end !== undefined).length
          : null,
      };
    }),
    unknownTimelines: [...beats.keys()].filter(name => !timelines.includes(name)),
    interactions: storyboard.interactions,
    ignoredRows: storyboard.ignoredRows,
  };
}

/** `compileFile` rejected: the program does not compile (its errors are `eligian_check`'s). */
interface CompileRejected {
  readonly _tag: 'CompileRejected';
}
const compileRejected: CompileRejected = { _tag: 'CompileRejected' };

/** One program's section: load, read, release, then compile; all under the lock. */
const inspectProgram = (
  file: string,
  detailed: boolean
): Effect.Effect<ProjectProgram, ToolError> =>
  Effect.gen(function* () {
    const unreadable: string[] = [];
    const inspected = yield* Effect.tryPromise({
      try: () =>
        withLoadedDocuments(
          [file],
          loaded => inspect(loaded, file, unreadable, detailed),
          missing => unreadable.push(missing)
        ),
      catch: cause =>
        new ToolInternal({
          message: `inspecting ${file} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          path: file,
        }),
    });
    if (inspected === undefined) {
      return yield* new ToolInternal({ message: `${file} was not loaded`, path: file });
    }
    const compiled = yield* Effect.tryPromise({
      try: () => compileFile(file),
      catch: () => compileRejected,
    }).pipe(Effect.orElseSucceed(() => undefined));
    const durationOf = (name: string): number | null =>
      compiled?.config.timelines[inspected.timelines.indexOf(name)]?.duration ?? null;
    const outline = inspected.outline.map(node => {
      const name =
        node.container === undefined ? undefined : /^timeline "(.*)"$/.exec(node.name)?.[1];
      return name === undefined ? node : { ...node, duration: durationOf(name) };
    });
    return {
      ...inspected.section,
      outline,
      storyboard: storyboardOf(inspected.storyboardText, inspected.timelines, compiled),
    };
  });

export const handle = (
  params: typeof Parameters.Type,
  context: ToolContext
): Effect.Effect<typeof Success.Type, ToolError, CompilerLock> =>
  Effect.gen(function* () {
    const detailed = params.response_format === 'detailed';
    const root = yield* projectRoot(context.ai, context.cwd);
    const input = yield* resolveInputPath(root, params.path);
    const matched = yield* resolveInputPatterns(root, [params.path]);
    const sources = yield* Effect.forEach(matched, file =>
      Effect.tryPromise({
        try: () => fs.promises.readFile(file, 'utf8'),
        catch: toToolError('read', file),
      }).pipe(Effect.map(source => ({ file, library: isLibrary(source) })))
    );
    const lock = yield* CompilerLock;
    const programs = yield* Effect.forEach(
      sources.filter(source => !source.library),
      source => lock.run(context.requestId, inspectProgram(source.file, detailed))
    );
    // A directory's library files (FR-020); a program's own libraries are in its section
    const libraries: ProjectFile[] = sources
      .filter(source => source.library)
      .map(source => ({
        path: source.file,
        kind: 'library',
        exists: true,
        ...(detailed ? { bytes: fs.statSync(source.file).size } : {}),
      }));
    return {
      header: header(context, input),
      root: root.root,
      files: libraries,
      programs,
      ...(detailed
        ? {
            starters: STARTERS.map(starter => ({
              name: starter.name,
              description: starter.description,
            })),
          }
        : {}),
    };
  });
