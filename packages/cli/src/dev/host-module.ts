/**
 * Loading a program's host module (audit idea #24) in Node, for `eligian
 * smoke`: bundled with esbuild into a temporary ES module (TypeScript and its
 * npm imports included), imported, and turned into Eligius resource
 * registrations with only the declared names.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { HostModule } from '@eligian/language';
import * as esbuild from 'esbuild';

export interface HostRegistrations {
  operations: Record<string, never>;
  controllers: Record<string, never>;
  functions: Record<string, never>;
}

/** Bundle and import the host module; the declared names that it does not export are reported. */
export async function loadHostModule(
  host: HostModule
): Promise<{ registrations: HostRegistrations; missing: string[] }> {
  const outfile = path.join(
    os.tmpdir(),
    `eligian-host-${createHash('sha1').update(host.path).digest('hex').slice(0, 12)}-${Date.now()}.mjs`
  );
  await esbuild.build({
    entryPoints: [host.path],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'ES2022',
    outfile,
    logLevel: 'silent',
  });
  try {
    const module = (await import(pathToFileURL(outfile).href)) as Record<
      string,
      Record<string, never> | undefined
    >;
    return registrationsOf(module, host);
  } finally {
    await fs.rm(outfile, { force: true });
  }
}

/** The declared operations, controllers and functions of an imported host module. */
export function registrationsOf(
  module: Record<string, Record<string, never> | undefined>,
  host: HostModule
): { registrations: HostRegistrations; missing: string[] } {
  const missing: string[] = [];
  const pick = (kind: 'operations' | 'controllers' | 'functions', names: readonly string[]) => {
    const picked: Record<string, never> = {};
    for (const name of names) {
      const value = module[kind]?.[name];
      if (value === undefined) missing.push(`${kind}.${name}`);
      else picked[name] = value;
    }
    return picked;
  };
  return {
    registrations: {
      operations: pick('operations', host.operations),
      controllers: pick('controllers', host.controllers),
      functions: pick('functions', host.functions),
    },
    missing,
  };
}
