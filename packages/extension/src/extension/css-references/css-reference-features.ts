/**
 * From CSS and HTML files to the .eligian strings that use their classes and
 * ids (audit idea #22): the "Eligian: Find Eligian References" command (CSS
 * and HTML editors) and an "N Eligian references" CodeLens on CSS rules
 * (setting `eligian.codeLens.cssReferences`). The language server finds the
 * uses (`eligian/cssReferences`, `eligian/cssReferenceLenses`).
 */
import {
  CSS_REFERENCE_LENSES_REQUEST,
  CSS_REFERENCES_REQUEST,
  type CssReferenceLens,
  type CssReferencesParams,
} from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { identifierInCss, identifierInHtml } from './css-identifier.js';

type Client = Pick<LanguageClient, 'sendRequest' | 'protocol2CodeConverter'>;

export const FIND_ELIGIAN_REFERENCES = 'eligian.findEligianReferences';

/** Register the command and the CSS CodeLens. */
export function registerCssReferenceFeatures(client: Client): vscode.Disposable[] {
  const lenses = new CssReferenceLensProvider(client);
  return [
    vscode.commands.registerCommand(FIND_ELIGIAN_REFERENCES, () => findEligianReferences(client)),
    vscode.languages.registerCodeLensProvider({ language: 'css' }, lenses),
    // The uses change when .eligian files are re-validated
    vscode.languages.onDidChangeDiagnostics(() => lenses.refresh()),
    lenses,
  ];
}

export async function findEligianReferences(client: Client): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const { document, selection } = editor;
  const line = document.lineAt(selection.active.line).text;
  const character = selection.active.character;
  const identifier =
    document.languageId === 'html'
      ? identifierInHtml(line, character)
      : identifierInCss(line, character);
  if (!identifier) {
    vscode.window.showInformationMessage(
      'Eligian: put the cursor on a class or id (.name, #name, class="…", id="…").'
    );
    return;
  }
  const params: CssReferencesParams = { uri: document.uri.toString(), ...identifier };
  const locations = await client.sendRequest<{ uri: string; range: unknown }[]>(
    CSS_REFERENCES_REQUEST,
    params
  );
  const label = `${identifier.kind === 'class' ? '.' : '#'}${identifier.name}`;
  if (locations.length === 0) {
    vscode.window.showInformationMessage(`Eligian: no .eligian file uses ${label}.`);
    return;
  }
  await vscode.commands.executeCommand(
    'editor.action.showReferences',
    document.uri,
    selection.active,
    locations.map(location => client.protocol2CodeConverter.asLocation(location as never))
  );
}

export class CssReferenceLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  constructor(private readonly client: Client) {}

  refresh(): void {
    this.changed.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!vscode.workspace.getConfiguration('eligian').get('codeLens.cssReferences', true)) {
      return [];
    }
    const lenses = await this.client.sendRequest<CssReferenceLens[]>(CSS_REFERENCE_LENSES_REQUEST, {
      uri: document.uri.toString(),
    });
    // One lens per rule line: `.card.on { … }` lists both
    const byLine = new Map<number, CssReferenceLens[]>();
    for (const lens of lenses) {
      if (lens.references.length === 0) continue;
      const list = byLine.get(lens.range.start.line) ?? [];
      list.push(lens);
      byLine.set(lens.range.start.line, list);
    }
    return [...byLine.values()].map(group => {
      const { start, end } = group[0].range;
      const range = new vscode.Range(start.line, start.character, end.line, end.character);
      const references = group.flatMap(lens => lens.references);
      const count = references.length;
      const names = group.map(lens => `${lens.kind === 'class' ? '.' : '#'}${lens.name}`);
      return new vscode.CodeLens(range, {
        title: `${count} Eligian reference${count === 1 ? '' : 's'}${group.length > 1 ? ` (${names.join(', ')})` : ''}`,
        command: 'editor.action.showReferences',
        arguments: [
          document.uri,
          range.start,
          references.map(location =>
            this.client.protocol2CodeConverter.asLocation(location as never)
          ),
        ],
      });
    });
  }

  dispose(): void {
    this.changed.dispose();
  }
}
