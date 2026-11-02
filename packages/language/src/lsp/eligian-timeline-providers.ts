/**
 * Go to Definition, Find References and Rename for timeline names (audit
 * feature idea #16): a `navigate "<name>"` target and the timeline of the
 * same program with that name are one symbol. Everything else is handled by
 * Langium's default providers.
 */
import type { LangiumDocument, MaybePromise } from 'langium';
import {
  DefaultDefinitionProvider,
  DefaultReferencesProvider,
  DefaultRenameProvider,
} from 'langium/lsp';
import type {
  CancellationToken,
  DefinitionParams,
  Location,
  LocationLink,
  Range,
  ReferenceParams,
  RenameParams,
  TextDocumentPositionParams,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
import type { EligianServices } from '../eligian-module.js';
import { cssDefinitions } from './css-navigation.js';
import {
  innerRange,
  invalidTimelineName,
  renameTimelineEdits,
  timelineNamed,
  timelineNameTokens,
  timelineSymbolAt,
} from './timeline-symbols.js';

const symbolAt = (document: LangiumDocument, position: { line: number; character: number }) =>
  timelineSymbolAt(document, document.textDocument.offsetAt(position));

export class EligianDefinitionProvider extends DefaultDefinitionProvider {
  constructor(private readonly eligian: EligianServices) {
    super(eligian);
  }

  override getDefinition(
    document: LangiumDocument,
    params: DefinitionParams,
    cancelToken?: CancellationToken
  ): MaybePromise<LocationLink[] | undefined> {
    const symbol = symbolAt(document, params.position);
    const timeline = symbol ? timelineNamed(symbol.program, symbol.name) : undefined;
    const declaration = timeline && timelineNameTokens(symbol!.program, symbol!.name).declaration;
    if (symbol && timeline?.$cstNode && declaration) {
      return [
        {
          originSelectionRange: symbol.token.range,
          targetUri: document.uri.toString(),
          targetRange: timeline.$cstNode.range,
          targetSelectionRange: declaration.range,
        },
      ];
    }
    // Idea #22: a class or id in a className / selector string → its CSS rule and layout element
    const css = cssDefinitions(this.eligian, document, params.position);
    if (css) return css;
    return super.getDefinition(document, params, cancelToken);
  }
}

export class EligianReferencesProvider extends DefaultReferencesProvider {
  override findReferences(
    document: LangiumDocument,
    params: ReferenceParams,
    cancelToken?: CancellationToken
  ): MaybePromise<Location[]> {
    const symbol = symbolAt(document, params.position);
    if (!symbol) return super.findReferences(document, params, cancelToken);
    const { declaration, references } = timelineNameTokens(symbol.program, symbol.name);
    const uri = document.uri.toString();
    return [
      ...(params.context.includeDeclaration && declaration ? [declaration] : []),
      ...references,
    ].map(token => ({ uri, range: token.range }));
  }
}

export class EligianRenameProvider extends DefaultRenameProvider {
  override async rename(
    document: LangiumDocument,
    params: RenameParams,
    cancelToken?: CancellationToken
  ): Promise<WorkspaceEdit | undefined> {
    const symbol = symbolAt(document, params.position);
    if (!symbol) return super.rename(document, params, cancelToken);
    const problem = invalidTimelineName(params.newName);
    if (problem) throw new Error(problem);
    if (params.newName !== symbol.name && timelineNamed(symbol.program, params.newName)) {
      throw new Error(`A timeline named '${params.newName}' already exists`);
    }
    return {
      changes: {
        [document.uri.toString()]: renameTimelineEdits(symbol.program, symbol.name, params.newName),
      },
    };
  }

  override prepareRename(
    document: LangiumDocument,
    params: TextDocumentPositionParams,
    cancelToken?: CancellationToken
  ): MaybePromise<Range | undefined> {
    const symbol = symbolAt(document, params.position);
    return symbol ? innerRange(symbol.token) : super.prepareRename(document, params, cancelToken);
  }
}
