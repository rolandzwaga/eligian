/**
 * The preview's resource registrations for a program's host module (audit
 * idea #24). In a trusted workspace the extension bundled the module and sends
 * its URL: it is imported and the declared names are registered. In an
 * untrusted workspace (`stub`) the names are registered as stand-ins that do
 * nothing, so the presentation still runs.
 */
import type { IEligiusResourceRegistrations } from 'eligius';

export interface HostPayload {
  /** The import path as written (for messages) */
  readonly path: string;
  /** The bundled module (a webview URI); absent for stubs */
  readonly url?: string;
  /** Untrusted workspace: register stand-ins */
  readonly stub?: boolean;
  readonly operations: readonly string[];
  readonly controllers: readonly string[];
  readonly functions: readonly string[];
}

type HostModuleExports = Record<string, Record<string, unknown> | undefined>;

const importModule = (url: string): Promise<HostModuleExports> => import(/* @vite-ignore */ url);

export async function hostRegistrations(
  host: HostPayload | undefined,
  load: (url: string) => Promise<HostModuleExports> = importModule
): Promise<IEligiusResourceRegistrations> {
  if (!host) return {};
  if (host.stub || !host.url) return stubRegistrations(host);
  const module = await load(host.url);
  const missing: string[] = [];
  const pick = (kind: 'operations' | 'controllers' | 'functions', names: readonly string[]) => {
    const picked: Record<string, never> = {};
    for (const name of names) {
      const value = module[kind]?.[name];
      if (value === undefined) missing.push(`${kind}.${name}`);
      else picked[name] = value as never;
    }
    return picked;
  };
  const registrations = {
    operations: pick('operations', host.operations),
    controllers: pick('controllers', host.controllers),
    functions: pick('functions', host.functions),
  };
  if (missing.length > 0) {
    throw new Error(`The extensions module ${host.path} does not export ${missing.join(', ')}`);
  }
  return registrations;
}

/** Stand-ins for an untrusted workspace: operations pass their data on, controllers do nothing. */
export function stubRegistrations(host: HostPayload): IEligiusResourceRegistrations {
  const skipped = (name: string) =>
    console.info(
      `[Eligian preview] ${name} from ${host.path} skipped: the workspace is not trusted`
    );
  const operations = Object.fromEntries(
    host.operations.map(name => [
      name,
      (operationData: Record<string, unknown>) => {
        skipped(name);
        return operationData;
      },
    ])
  );
  const controllers = Object.fromEntries(
    host.controllers.map(name => [
      name,
      class {
        name = name;
        init() {}
        attach() {
          skipped(name);
        }
        detach() {}
      },
    ])
  );
  const functions = Object.fromEntries(host.functions.map(name => [name, () => skipped(name)]));
  return { operations, controllers, functions } as unknown as IEligiusResourceRegistrations;
}
