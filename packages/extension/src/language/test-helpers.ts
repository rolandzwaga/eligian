/**
 * Test helpers for language testing
 */

import type { TextDocument } from 'vscode-languageserver-protocol';

/**
 * Create a TextDocument for testing from source code
 *
 * @param source - Source code string
 * @param uri - Optional document URI (defaults to 'file:///test.eligian')
 * @returns TextDocument compatible with vscode-languageserver-protocol
 */
export async function createTestDocument(
  source: string,
  uri = 'file:///test.eligian'
): Promise<TextDocument> {
  return {
    uri,
    languageId: 'eligian',
    version: 1,
    getText: () => source,
    positionAt: (offset: number) => {
      const lines = source.split('\n');
      let currentOffset = 0;
      for (let line = 0; line < lines.length; line++) {
        const lineLength = lines[line].length + 1; // +1 for newline
        if (currentOffset + lineLength > offset) {
          return { line, character: offset - currentOffset };
        }
        currentOffset += lineLength;
      }
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    },
    offsetAt: (position: { line: number; character: number }) => {
      const lines = source.split('\n');
      let offset = 0;
      for (let i = 0; i < position.line; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      offset += position.character;
      return offset;
    },
    lineCount: source.split('\n').length,
  };
}
