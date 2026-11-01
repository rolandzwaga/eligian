/**
 * `eligian init [dir] [--template <name>] [--title <title>] [--force]`
 * (audit feature idea #12).
 *
 * Writes a starter project (see `starterFiles` in @eligian/language): a
 * presentation that checks without errors, its layout, styles, locales, a
 * package.json with check / build / fmt scripts and a README. Existing files
 * are never overwritten without `--force`.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { findStarter, STARTER_ENTRY, STARTERS, starterFiles } from '@eligian/language';

export interface InitOptions {
  readonly template: string;
  /** The presentation title (default: from the directory name) */
  readonly title?: string;
  readonly force: boolean;
  readonly cwd: string;
}

export interface InitOutcome {
  readonly output: string;
  readonly exitCode: number;
}

/** "my-talk" → "My Talk" */
export function titleFromDirectory(directory: string): string {
  const words = path
    .basename(path.resolve(directory))
    .split(/[-_\s]+/)
    .filter(Boolean);
  return (
    words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'My Presentation'
  );
}

export async function runInit(directory: string, options: InitOptions): Promise<InitOutcome> {
  const starter = findStarter(options.template);
  if (!starter) {
    const names = STARTERS.map(s => s.name).join(', ');
    return {
      output: `Unknown template '${options.template}'. Use one of: ${names}`,
      exitCode: 2,
    };
  }
  const target = path.resolve(options.cwd, directory);
  const title = options.title?.trim() || titleFromDirectory(target);
  const files = starterFiles(starter.name, { title });

  if (!options.force) {
    const existing: string[] = [];
    for (const file of Object.keys(files)) {
      if (await exists(path.join(target, file))) existing.push(file);
    }
    if (existing.length > 0) {
      return {
        output: `Not overwriting existing files in ${displayDir(directory)}: ${existing.join(', ')}\nUse --force to overwrite them.`,
        exitCode: 1,
      };
    }
  }

  for (const [file, content] of Object.entries(files)) {
    const full = path.join(target, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }

  const inPlace = path.resolve(options.cwd) === target;
  const lines = [
    `Created ${displayDir(directory)} (${starter.label} starter): ${Object.keys(files).join(', ')}`,
    ...starter.notes.map(note => `Note: ${note}`),
    '',
    'Next:',
    ...(inPlace ? [] : [`  cd ${directory}`]),
    `  eligian check ${STARTER_ENTRY}`,
    '  open the folder in VS Code and run "Eligian: Preview Timeline" (Ctrl+K V)',
  ];
  return { output: lines.join('\n'), exitCode: 0 };
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function displayDir(directory: string): string {
  return directory === '.' || directory === '' ? 'the current directory' : `${directory}/`;
}
