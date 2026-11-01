/**
 * Output formats of `eligian check`: pretty (terminal), json, sarif (GitHub
 * code scanning and other tools) and github (workflow commands that annotate
 * pull requests).
 */
import * as path from 'node:path';
import type { CheckDiagnostic, CheckFileResult } from '@eligian/language';
import chalk from 'chalk';

export type CheckFormat = 'pretty' | 'json' | 'sarif' | 'github';
export const CHECK_FORMATS: readonly CheckFormat[] = ['pretty', 'json', 'sarif', 'github'];

export interface CheckSummary {
  readonly files: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly hints: number;
}

export function summarize(results: readonly CheckFileResult[]): CheckSummary {
  const all = results.flatMap(r => r.diagnostics);
  const count = (severity: CheckDiagnostic['severity']) =>
    all.filter(d => d.severity === severity).length;
  return {
    files: results.length,
    errors: count('error'),
    warnings: count('warning'),
    infos: count('info'),
    hints: count('hint'),
  };
}

/** Path relative to `cwd`, with forward slashes (stable across platforms, used by GitHub). */
export function displayPath(file: string, cwd: string): string {
  const relative = path.relative(cwd, file);
  const shown =
    relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
  return shown.split(path.sep).join('/');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function summaryLine(summary: CheckSummary): string {
  const parts = [
    plural(summary.files, 'file'),
    plural(summary.errors, 'error'),
    plural(summary.warnings, 'warning'),
  ];
  if (summary.infos > 0) parts.push(plural(summary.infos, 'info'));
  if (summary.hints > 0) parts.push(plural(summary.hints, 'hint'));
  return parts.join(', ');
}

export function formatResults(
  format: CheckFormat,
  results: readonly CheckFileResult[],
  cwd: string,
  version: string
): string {
  switch (format) {
    case 'json':
      return formatJson(results, cwd);
    case 'sarif':
      return formatSarif(results, cwd, version);
    case 'github':
      return formatGithub(results, cwd);
    default:
      return formatPretty(results, cwd);
  }
}

const SEVERITY_LABEL: Record<CheckDiagnostic['severity'], string> = {
  error: chalk.red('error'),
  warning: chalk.yellow('warning'),
  info: chalk.blue('info'),
  hint: chalk.gray('hint'),
};

/** Grouped by file, like eslint's stylish format. */
export function formatPretty(results: readonly CheckFileResult[], cwd: string): string {
  const lines: string[] = [];
  for (const result of results) {
    if (result.diagnostics.length === 0) continue;
    lines.push(chalk.underline(displayPath(result.file, cwd)));
    const width = Math.max(...result.diagnostics.map(d => `${d.line}:${d.column}`.length));
    for (const d of result.diagnostics) {
      const position = `${d.line}:${d.column}`.padEnd(width);
      const label = SEVERITY_LABEL[d.severity];
      const pad = ' '.repeat(Math.max(0, 7 - d.severity.length));
      const code = d.code ? chalk.gray(`  ${d.code}`) : '';
      // Continuation lines of multi-line messages line up with the message
      const indent = ' '.repeat(2 + width + 2 + 7 + 2);
      const message = d.message.split('\n').join(`\n${indent}`);
      lines.push(`  ${chalk.dim(position)}  ${label}${pad}  ${message}${code}`);
    }
    lines.push('');
  }
  const summary = summarize(results);
  const text = summaryLine(summary);
  lines.push(
    summary.errors > 0
      ? chalk.red(text)
      : summary.warnings > 0
        ? chalk.yellow(text)
        : chalk.green(text)
  );
  return lines.join('\n');
}

export function formatJson(results: readonly CheckFileResult[], cwd: string): string {
  return JSON.stringify(
    {
      files: results.map(r => ({
        file: displayPath(r.file, cwd),
        diagnostics: r.diagnostics.map(({ file: _file, ...d }) => d),
      })),
      summary: summarize(results),
    },
    null,
    2
  );
}

const SARIF_LEVEL: Record<CheckDiagnostic['severity'], 'error' | 'warning' | 'note'> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
  hint: 'note',
};

/** SARIF 2.1.0, for GitHub code scanning and other static-analysis tools. */
export function formatSarif(
  results: readonly CheckFileResult[],
  cwd: string,
  version: string
): string {
  const diagnostics = results.flatMap(r => r.diagnostics);
  const ruleIds = [...new Set(diagnostics.map(d => d.code ?? 'eligian'))].sort();
  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'eligian',
              version,
              informationUri: 'https://github.com/rolandzwaga/eligian',
              rules: ruleIds.map(id => ({ id })),
            },
          },
          results: diagnostics.map(d => ({
            ruleId: d.code ?? 'eligian',
            level: SARIF_LEVEL[d.severity],
            message: { text: d.message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: displayPath(d.file, cwd) },
                  region: {
                    startLine: d.line,
                    startColumn: d.column,
                    endLine: d.endLine,
                    endColumn: d.endColumn,
                  },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2
  );
}

const GITHUB_COMMAND: Record<CheckDiagnostic['severity'], 'error' | 'warning' | 'notice'> = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
  hint: 'notice',
};

/** GitHub Actions workflow-command escaping: a message (data). */
export const escapeData = (s: string) =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
/** … and a property value (file, title). */
export const escapeProperty = (s: string) =>
  escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

/** GitHub Actions workflow commands: annotations on the pull request diff. */
export function formatGithub(results: readonly CheckFileResult[], cwd: string): string {
  const lines = results.flatMap(r =>
    r.diagnostics.map(d => {
      const properties = [
        `file=${escapeProperty(displayPath(d.file, cwd))}`,
        `line=${d.line}`,
        `col=${d.column}`,
        `endLine=${d.endLine}`,
        `endColumn=${d.endColumn}`,
        ...(d.code ? [`title=${escapeProperty(d.code)}`] : []),
      ].join(',');
      return `::${GITHUB_COMMAND[d.severity]} ${properties}::${escapeData(d.message)}`;
    })
  );
  lines.push(summaryLine(summarize(results)));
  return lines.join('\n');
}
