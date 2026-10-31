/**
 * "▶ Preview from 22s" CodeLenses (audit feature idea #5).
 *
 * Above each timeline header ("▶ Preview") and above each `at` event, sequence
 * item and stagger block whose start time is known statically, a lens runs the
 * client command `eligian.previewAt` with the document, the timeline's uri (as
 * compiled) and the start time in seconds. Times come from the shared resolver
 * (time-resolver.ts), so they are the compiled times. Events whose time depends
 * on a runtime value get no lens.
 *
 * Setting `eligian.codeLens.preview` (default true) turns the lenses off.
 */
import type { AstNode, LangiumDocument } from 'langium';
import type { CodeLensProvider } from 'langium/lsp';
import type { CodeLens, CodeLensParams } from 'vscode-languageserver';
import { timelineUri } from '../compiler/transformers/navigate-operations.js';
import { resolveTimelineTimes } from '../compiler/transformers/time-resolver.js';
import type { EligianServices } from '../eligian-module.js';
import { isProgram, isSequenceBlock, isTimeline, type Timeline } from '../generated/ast.js';

/** The client command the lenses run: (documentUri, timelineUri, seconds). */
export const PREVIEW_AT_COMMAND = 'eligian.previewAt';

const seconds = (n: number) => `${Math.round(n * 1e6) / 1e6}s`;

export class EligianCodeLensProvider implements CodeLensProvider {
  private enabled = true;

  constructor(services: EligianServices) {
    // As in the inlay hint provider: settings are only readable once the client initialized
    const configuration = services.shared.workspace.ConfigurationProvider;
    const ready = (configuration as { ready?: Promise<void> }).ready;
    ready
      ?.then(() => configuration.getConfiguration('eligian', 'codeLens'))
      .then(settings => this.applySettings(settings))
      .catch(() => {});
    configuration.onConfigurationSectionUpdate(update => {
      if (update.section === 'eligian') {
        this.applySettings(update.configuration?.codeLens);
      }
    });
  }

  /** Apply the `eligian.codeLens` settings object. */
  applySettings(settings: unknown): void {
    this.enabled = (settings as Record<string, unknown> | undefined)?.preview !== false;
  }

  provideCodeLens(document: LangiumDocument, _params: CodeLensParams): CodeLens[] {
    const program = document.parseResult.value;
    if (!this.enabled || !isProgram(program)) return [];
    const documentUri = document.uri.toString();
    // Timelines are top-level statements only
    return program.statements
      .filter(isTimeline)
      .flatMap(timeline => this.lensesFor(timeline, documentUri));
  }

  private lensesFor(timeline: Timeline, documentUri: string): CodeLens[] {
    const uri = timelineUri(timeline);
    const lenses: CodeLens[] = [];
    const lens = (node: AstNode, start: number, title: string) => {
      const cst = node.$cstNode;
      if (!cst) return;
      lenses.push({
        range: { start: cst.range.start, end: cst.range.start },
        command: { title, command: PREVIEW_AT_COMMAND, arguments: [documentUri, uri, start] },
      });
    };

    lens(timeline, 0, '▶ Preview');
    const times = resolveTimelineTimes(timeline);
    for (const event of timeline.events) {
      const spans = times.events.get(event);
      if (!spans || spans.length === 0) continue;
      if (isSequenceBlock(event)) {
        for (const item of event.items) {
          const span = times.sequenceItems.get(item);
          if (span) lens(item, span.start, `▶ Preview from ${seconds(span.start)}`);
        }
      } else {
        const start = spans[0].start;
        lens(event, start, `▶ Preview from ${seconds(start)}`);
      }
    }
    return lenses;
  }
}
