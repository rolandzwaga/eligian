/**
 * User-configurable validation options (audit feature idea #18, follow-up).
 *
 * `eligian.validation.selectorNotInLayout` (editor setting; `eligian check
 * --selector-not-in-layout` on the command line):
 * - `off` (default): selectors may use any class or id of the CSS or the layout
 * - `ids`: warn when a selector's id is defined in the CSS but is not in the
 *   imported layout HTML (it then only exists if an operation creates it)
 * - `all`: the same for classes (noisier: classes are often added at runtime)
 */
import type { EligianServices } from '../eligian-module.js';

export type SelectorNotInLayout = 'off' | 'ids' | 'all';

const MODES: readonly SelectorNotInLayout[] = ['off', 'ids', 'all'];

/** A valid mode, or undefined. */
export function parseSelectorNotInLayout(value: unknown): SelectorNotInLayout | undefined {
  return MODES.includes(value as SelectorNotInLayout) ? (value as SelectorNotInLayout) : undefined;
}

export class ValidationSettings {
  selectorNotInLayout: SelectorNotInLayout = 'off';

  constructor(services?: EligianServices) {
    if (!services) return;
    // As the inlay hint provider: settings are readable once the client initialized
    const configuration = services.shared.workspace.ConfigurationProvider;
    const ready = (configuration as { ready?: Promise<void> }).ready;
    // Only a configuration a client sent: without one (the CLI, tests) a value
    // set directly (\`eligian check --selector-not-in-layout\`) must not be reset
    ready
      ?.then(() => configuration.getConfiguration('eligian', 'validation'))
      .then(settings => {
        if (settings !== undefined) this.apply(settings);
      })
      .catch(() => {});
    configuration.onConfigurationSectionUpdate(update => {
      if (update.section !== 'eligian') return;
      const before = this.selectorNotInLayout;
      this.apply(update.configuration?.validation);
      if (this.selectorNotInLayout === before) return;
      // Re-validate the open documents with the new setting
      const uris = services.shared.workspace.LangiumDocuments.all.map(d => d.uri).toArray();
      void services.shared.workspace.DocumentBuilder.update(uris, []).catch(() => {});
    });
  }

  /** Apply the `eligian.validation` settings object (unknown values: the default). */
  apply(settings: unknown): void {
    const values = (settings ?? {}) as Record<string, unknown>;
    this.selectorNotInLayout = parseSelectorNotInLayout(values.selectorNotInLayout) ?? 'off';
  }
}
