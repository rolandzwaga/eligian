/**
 * Spec 058 Phase 1 (FR-020, FR-036, FR-037; plan C7, C9): the knowledge card
 * renderers shared by `eligian_operations` and the docs generator, and the
 * curated Eligius lint rule list. Phase 2 (FR-073, FR-074; plan F1): the operation
 * and controller overlays; the controller status comes from the overlay only.
 */
import { getOperationSignature, type OperationSignature } from '@eligian/language';
import { CONTROLLERS, TIMELINE_EVENTS } from '@eligian/language/mcp';
import { describe, expect, it, test } from 'vitest';
import { ELIGIUS_LINT_RULES } from '../mcp/knowledge/lint-rules.js';
import * as render from '../mcp/knowledge/render.js';
import { controllerCard, eventLine, eventName, operationCard } from '../mcp/knowledge/render.js';

function signature(name: string): OperationSignature {
  const found = getOperationSignature(name);
  if (!found) throw new Error(`no registry operation ${name}`);
  return found;
}

describe('operationCard', () => {
  test('starts with NEEDS, PROVIDES, ERASES', () => {
    for (const name of ['addClass', 'selectElement']) {
      const lines = operationCard(signature(name)).split('\n');
      expect(lines[0].startsWith('NEEDS:')).toBe(true);
      expect(lines[1].startsWith('PROVIDES:')).toBe(true);
      expect(lines[2].startsWith('ERASES:')).toBe(true);
      expect(lines[3].startsWith('RESOLVES CHAINS IN:')).toBe(true);
    }
    const addClass = operationCard(signature('addClass'));
    expect(addClass).toContain('addClass(className)');
    expect(addClass.split('\n').slice(0, 4)).toEqual([
      'NEEDS: selectedElement',
      'PROVIDES: none',
      'ERASES: className',
      'RESOLVES CHAINS IN: none',
    ]);
    const selectElement = operationCard(signature('selectElement'));
    expect(selectElement.split('\n').slice(0, 4)).toEqual([
      'NEEDS: none',
      'PROVIDES: selectedElement',
      'ERASES: selector, useSelectedElementAsRoot',
      'RESOLVES CHAINS IN: selector',
    ]);
    expect(selectElement).toContain('selectElement(selector, useSelectedElementAsRoot?)');
  });

  test('parameters give type, enum, required, default and erased', () => {
    const card = operationCard(signature('setElementContent'));
    expect(card).toContain("insertionType: 'overwrite' | 'append' | 'prepend'");
    expect(card).toMatch(/insertionType: .* · optional · erased/);
    expect(operationCard(signature('when'))).toContain('RESOLVES CHAINS IN: all fields');
  });

  test('host variant states none declared', () => {
    // The shape of hostSignature (host-operations.ts): no dependencies, no outputs
    const host: OperationSignature = {
      systemName: 'score',
      description: 'Host operation from ./host.ts',
      parameters: [{ name: 'points', type: ['ParameterType:number'], required: true }],
      dependencies: [],
      outputs: [],
      category: 'Host',
    };
    const lines = operationCard(host, { host: true }).split('\n');
    expect(lines[0]).toBe('NEEDS: none declared (host operations declare no needs)');
    expect(lines[1]).toBe('PROVIDES: none declared');
    expect(lines[2].startsWith('ERASES:')).toBe(true);
    expect(lines).toContain('CALL: score(points)');
  });

  it('operationCard appends the overlay card', () => {
    const overlay = { card: 'Select once, then chain addClass / removeClass on the selection.' };
    const plain = operationCard(signature('addClass'));
    const card = operationCard(signature('addClass'), { overlay });
    expect(card).toBe(`${plain}\n\n${overlay.card}`);
    expect(card.split('\n')[0]).toBe('NEEDS: selectedElement');
    // no overlay: the card is unchanged
    expect(operationCard(signature('addClass'), {})).toBe(plain);
    // a host card takes an overlay the same way
    const host = operationCard(signature('addClass'), { host: true, overlay });
    expect(host.split('\n')[0]).toBe('NEEDS: none declared (host operations declare no needs)');
    expect(host.endsWith(`\n\n${overlay.card}`)).toBe(true);
  });
});

describe('controllers', () => {
  it('controllerCard takes its status from the overlay', () => {
    // FR-074: the overlay statuses are the single source; the render table is gone
    expect(render).not.toHaveProperty('CONTROLLER_STATUS');
    expect(render).not.toHaveProperty('STATUS_REASON');
    expect(CONTROLLERS).toHaveLength(9);
    for (const controller of CONTROLLERS) {
      // no overlay: no status line
      expect(controllerCard(controller)).not.toContain('STATUS:');
      for (const status of ['recommended', 'constrained', 'do-not-use'] as const) {
        const overlay = { status, card: `Overlay card of ${controller.name}.` };
        const card = controllerCard(controller, overlay);
        const lines = card.split('\n');
        expect(lines[0]).toBe(`STATUS: ${status}`);
        expect(lines[1]).toBe(`CONTROLLER: ${controller.name}`);
        expect(lines.filter(line => line.startsWith('STATUS:'))).toHaveLength(1);
        expect(card.endsWith(`\n\n${overlay.card}`)).toBe(true);
      }
    }
  });

  test('a card gives needs, parameters and the addController form', () => {
    const label = CONTROLLERS.find(c => c.name === 'LabelController');
    if (!label) throw new Error('no LabelController');
    const card = controllerCard(label);
    expect(card).toContain('NEEDS: selectedElement');
    expect(card).toContain('addController("LabelController", translationKey, attributeName?)');
  });
});

describe('events', () => {
  test('eventName is the first line', () => {
    const names = TIMELINE_EVENTS.map(eventName);
    expect(names).toHaveLength(46);
    for (const name of names) expect(name).not.toContain('\n');
    expect(names).toContain('before-request-timeline-uri');
  });

  test('eventLine gives the name and the argument annotations', () => {
    const event = TIMELINE_EVENTS.find(e => eventName(e) === 'before-request-timeline-uri');
    const complete = TIMELINE_EVENTS.find(e => eventName(e) === 'timeline-complete');
    if (!event || !complete) throw new Error('missing events');
    const line = eventLine(event);
    expect(line).not.toContain('\n');
    expect(line.startsWith('before-request-timeline-uri')).toBe(true);
    expect(line).toContain('uri: string');
    expect(line).toContain('position?: number');
    expect(eventLine(complete)).toContain('no args');
    for (const e of TIMELINE_EVENTS) expect(eventLine(e)).not.toContain('\n');
  });
});

describe('ELIGIUS_LINT_RULES', () => {
  test('is the 14 curated rules', () => {
    expect(ELIGIUS_LINT_RULES).toEqual([
      'E001',
      'E101',
      'E111',
      'E120',
      'E130',
      'E131',
      'E140',
      'E141',
      'E160',
      'E310',
      'W110',
      'W150',
      'W151',
      'W160',
    ]);
  });
});
