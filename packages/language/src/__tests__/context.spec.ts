/**
 * Unit tests for context detection module
 *
 * These tests verify that the detectContext function correctly identifies
 * cursor position contexts (inside loop, inside action, etc.)
 */

import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { describe, expect, it } from 'vitest';
import { detectContext } from '../completion/context.js';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

const services = createEligianServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Eligian);

describe('Context Detection', () => {
  describe('isInsideAction', () => {
    it('should detect cursor inside regular action body', async () => {
      const text = s`
        action fadeIn [
          selectElement(".box")
          <|>animate({opacity: 1}, 500)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.action).toBeDefined();
      expect(context.action?.name).toBe('fadeIn');
    });

    it('should detect cursor inside endable action start operations', async () => {
      const text = s`
        endable action showThenHide [
          selectElement(".box")
          <|>addClass("visible")
        ] [
          removeClass("visible")
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.action).toBeDefined();
    });

    it('should detect cursor inside endable action end operations', async () => {
      const text = s`
        endable action showThenHide [
          selectElement(".box")
          addClass("visible")
        ] [
          <|>removeClass("visible")
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.action).toBeDefined();
    });

    it('should detect action even when cursor is on action keyword', async () => {
      const text = s`
        <|>action fadeIn [
          selectElement(".box")
          animate({opacity: 1}, 500)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      // NOTE: getContainerOfType finds the action even when cursor is on the keyword
      // This is expected Langium behavior - cursor on 'action' is still within ActionDefinition AST node
      expect(context.isInsideAction).toBe(true);
      expect(context.action).toBeDefined();
    });

    it('should detect cursor inside inline action (timeline event start operations)', async () => {
      const text = s`
        timeline "main" in "#container" using video from "video.mp4" {
          at 0s..5s [
            selectElement(".box")
            <|>addClass("visible")
          ] [
            removeClass("visible")
          ]
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.isInsideTimeline).toBe(true);
      expect(context.isInsideEvent).toBe(true);
      // Inline actions don't have a name, so action should be undefined
      expect(context.action).toBeUndefined();
    });

    it('should detect cursor inside inline action (timeline event end operations)', async () => {
      const text = s`
        timeline "main" in "#container" using video from "video.mp4" {
          at 0s..5s [
            addClass("visible")
          ] [
            selectElement(".box")
            <|>removeClass("visible")
          ]
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.isInsideTimeline).toBe(true);
      expect(context.isInsideEvent).toBe(true);
      expect(context.action).toBeUndefined();
    });

    it('should detect cursor inside inline action with raf provider (real-world case)', async () => {
      const text = s`
        timeline "Test Preview" in ".eligius" using raf {
          at 0s..5s [
            createElement("div", "hello world", {class: 'test'})
            selectElement(".eligius")
            setElementContent()
            <|>
            log()
          ] [
            selectElement(".test")
            removeElement()
          ]
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.isInsideTimeline).toBe(true);
      expect(context.isInsideEvent).toBe(true);
      expect(context.action).toBeUndefined();
    });
  });

  describe('isInsideLoop', () => {
    it('should detect cursor inside for loop body', async () => {
      const text = s`
        action processItems [
          for (item in items) {
            selectElement(".template")
            <|>setElementContent(@@currentItem)
          }
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideLoop).toBe(true);
      expect(context.loop).toBeDefined();
      expect(context.loop?.itemName).toBe('item');
    });

    it('should detect cursor is inside action AND loop', async () => {
      const text = s`
        action processItems [
          for (item in items) {
            <|>selectElement(".template")
          }
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideAction).toBe(true);
      expect(context.isInsideLoop).toBe(true);
      expect(context.action?.name).toBe('processItems');
      expect(context.loop?.itemName).toBe('item');
    });

    it('should detect loop even when cursor is on for keyword', async () => {
      const text = s`
        action processItems [
          <|>for (item in items) {
            selectElement(".template")
          }
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      // NOTE: Cursor on 'for' keyword is still within ForStatement AST node
      expect(context.isInsideLoop).toBe(true);
      expect(context.loop).toBeDefined();
    });
  });

  describe('isInsideTimeline', () => {
    it('should detect cursor inside timeline block', async () => {
      const text = s`
        timeline "main" in "#container" using video from "video.mp4" {
          <|>at 0s..5s fadeIn()
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideTimeline).toBe(true);
      expect(context.timeline).toBeDefined();
      expect(context.timeline?.name).toBe('main'); // STRING type strips quotes
    });

    it('should detect timeline even when cursor is on timeline keyword', async () => {
      const text = s`
        <|>timeline "main" in "#container" using video from "video.mp4" {
          at 0s..5s fadeIn()
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      // NOTE: Cursor on 'timeline' keyword is still within Timeline AST node
      expect(context.isInsideTimeline).toBe(true);
      expect(context.timeline).toBeDefined();
    });
  });

  describe('isInsideEvent', () => {
    it('should detect cursor inside timeline event', async () => {
      const text = s`
        timeline "main" in "#container" using video from "video.mp4" {
          at 0s..5s {
            <|>fadeIn()
          }
        }
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isInsideEvent).toBe(true);
      expect(context.isInsideTimeline).toBe(true);
    });
  });

  describe('isAfterVariablePrefix', () => {
    it('should detect cursor after @@ prefix', async () => {
      const text = s`
        action test [
          selectElement(@@<|>)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isAfterVariablePrefix).toBe(true);
    });

    it('should detect @@ when cursor is inside SystemPropertyReference', async () => {
      const text = s`
        action test [
          selectElement(@@curr<|>entItem)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      // NOTE: detectVariablePrefix now checks if we're inside a SystemPropertyReference AST node
      // When cursor is at "@@curr<|>", we are inside SystemPropertyReference, so this should be true
      expect(context.isAfterVariablePrefix).toBe(true);
    });

    it('should not detect cursor without @@ prefix', async () => {
      const text = s`
        action test [
          selectElement(<|>selector)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isAfterVariablePrefix).toBe(false);
    });

    it('should not detect cursor with only one @ symbol', async () => {
      const text = s`
        action test [
          selectElement(@<|>var)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.isAfterVariablePrefix).toBe(false);
    });
  });

  describe('insideOperationCall', () => {
    it('should detect cursor inside operation call arguments', async () => {
      const text = s`
        action test [
          selectElement(<|>)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.insideOperationCall).toBe('selectElement');
      expect(context.operationCall).toBeDefined();
    });

    it('should detect operation name when cursor is in second argument', async () => {
      const text = s`
        action test [
          animate({opacity: 1}, <|>500)
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      expect(context.insideOperationCall).toBe('animate');
    });

    it('should detect operation call even when cursor is on operation name', async () => {
      const text = s`
        action test [
          <|>selectElement(".box")
        ]
      `;

      const { document, position } = await parseWithCursor(text);
      const context = detectContext(document, position);

      // NOTE: Cursor on operation name is still within OperationCall AST node
      expect(context.insideOperationCall).toBe('selectElement');
      expect(context.operationCall).toBeDefined();
    });
  });

  describe('Event Action Detection', () => {
    describe('isAfterEventKeyword', () => {
      it('should detect cursor after "on event" keywords', async () => {
        const text = s`
          on event <|>
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isAfterEventKeyword).toBe(true);
        expect(context.eventAction).toBeDefined();
      });

      it('should detect cursor after "on event" with extra whitespace', async () => {
        const text = s`
          on event    <|>
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isAfterEventKeyword).toBe(true);
      });

      it('should NOT detect when eventName is already set', async () => {
        const text = s`
          on event "timeline-play" <|>
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isAfterEventKeyword).toBe(false);
      });

      it('should NOT detect cursor before "event" keyword', async () => {
        const text = s`
          on <|>event
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isAfterEventKeyword).toBe(false);
      });
    });

    describe('isInEventNameString', () => {
      it('should detect cursor inside empty event name string', async () => {
        const text = s`
          on event "<|>"
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isInEventNameString).toBe(true);
        expect(context.eventAction).toBeDefined();
      });

      it('should detect cursor inside partial event name string', async () => {
        const text = s`
          on event "time<|>"
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isInEventNameString).toBe(true);
      });

      it('should detect cursor at start of event name string', async () => {
        const text = s`
          on event "<|>timeline-play"
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isInEventNameString).toBe(true);
      });

      it('should NOT detect cursor after "topic" keyword', async () => {
        const text = s`
          on event "timeline-play" topic "<|>"
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isInEventNameString).toBe(false);
      });

      it('should NOT detect cursor after "action" keyword', async () => {
        const text = s`
          on event "timeline-play" action <|>
        `;

        const { document, position } = await parseWithCursor(text);
        const context = detectContext(document, position);

        expect(context.isInEventNameString).toBe(false);
      });
    });
  });
});

/**
 * Parse text with cursor position marker (<|>) and return document + position
 */
async function parseWithCursor(text: string): Promise<{
  document: LangiumDocument<Program>;
  position: { line: number; character: number };
}> {
  // Find cursor marker
  const cursorIndex = text.indexOf('<|>');
  if (cursorIndex === -1) {
    throw new Error('No cursor marker <|> found in test text');
  }

  // Remove cursor marker
  const cleanText = text.replace('<|>', '');

  // Calculate line and character position
  const lines = cleanText.substring(0, cursorIndex).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;

  // Parse document
  const document = await parse(cleanText);

  return {
    document,
    position: { line, character },
  };
}
