/**
 * Event-name string detection must be limited to the eventName STRING of the
 * EventActionDefinition header (audit 2026-10-22, medium #27).
 */

import { EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import { expectCompletion, parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import { detectContext } from '../completion/context.js';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

const services = createEligianServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Eligian);
const completion = expectCompletion(services.Eligian);

async function contextAt(text: string) {
  const cursor = text.indexOf('<|>');
  const code = text.replace('<|>', '');
  const document = await parse(code);
  return detectContext(document, document.textDocument.positionAt(cursor));
}

describe('isInEventNameString is limited to the eventName string', () => {
  it('is false for a string argument on its own line in the body', async () => {
    const context = await contextAt(s`
      on event "timeline-play" action handler() [
        setElementContent("hel<|>lo")
      ]
    `);
    expect(context.eventAction).toBeDefined();
    expect(context.isInEventNameString).toBe(false);
  });

  it('is false for a body string that follows the header on the same line', async () => {
    const context = await contextAt(
      'on event "timeline-play" action handler() [ setElementContent("hel<|>lo") ]'
    );
    expect(context.isInEventNameString).toBe(false);
  });

  it('is false for an empty body string', async () => {
    const context = await contextAt(s`
      on event "timeline-play" action handler() [
        setElementContent("<|>")
      ]
    `);
    expect(context.isInEventNameString).toBe(false);
  });

  it('is false for the topic string', async () => {
    const context = await contextAt(
      'on event "timeline-play" topic "my-<|>topic" action handler() [ selectElement("#a") ]'
    );
    expect(context.isInEventNameString).toBe(false);
  });

  it('is true inside the eventName string of a full definition', async () => {
    const context = await contextAt(
      'on event "time<|>line-play" action handler() [ selectElement("#a") ]'
    );
    expect(context.isInEventNameString).toBe(true);
  });

  it('is false when the cursor is after the closing quote of the eventName', async () => {
    const context = await contextAt(
      'on event "timeline-play"<|> action handler() [ selectElement("#a") ]'
    );
    expect(context.isInEventNameString).toBe(false);
  });

  it('is false for text "on event " typed inside a body string', async () => {
    const context = await contextAt(s`
      on event "timeline-play" action handler() [
        setElementContent("on event <|>")
      ]
    `);
    expect(context.isAfterEventKeyword).toBe(false);
  });

  it('keeps detecting an empty name string', async () => {
    const context = await contextAt('on event "<|>"');
    expect(context.isInEventNameString).toBe(true);
  });
});

describe('event-name completions are not offered for body strings', () => {
  it('does not offer event names (with skeleton edits) inside a body string', async () => {
    await completion({
      text: s`
        on event "timeline-play" action handler() [
          setElementContent("<|>")
        ]
      `,
      index: 0,
      assert: (completions: CompletionList) => {
        expect(completions.items.some(item => item.label === 'timeline-play')).toBe(false);
        expect(completions.items.some(item => (item.additionalTextEdits?.length ?? 0) > 0)).toBe(
          false
        );
      },
    });
  });
});
