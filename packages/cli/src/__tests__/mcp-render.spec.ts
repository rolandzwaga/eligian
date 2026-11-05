/**
 * Spec 058 Phase 1 (FR-020, FR-036, FR-037; plan C7, C9): the knowledge card
 * renderers shared by `eligian_operations` and the docs generator, and the
 * curated Eligius lint rule list.
 */
import { getOperationSignature, type OperationSignature } from '@eligian/language';
import { CONTROLLERS, TIMELINE_EVENTS } from '@eligian/language/mcp';
import { describe, expect, test } from 'vitest';
import { ELIGIUS_LINT_RULES } from '../mcp/knowledge/lint-rules.js';
import {
  CONTROLLER_STATUS,
  controllerCard,
  eventLine,
  eventName,
  operationCard,
} from '../mcp/knowledge/render.js';

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
});

describe('controllers', () => {
  test('status of Routing and Lottie', () => {
    expect(CONTROLLER_STATUS).toEqual({
      RoutingController: 'do-not-use',
      LottieController: 'constrained',
    });
    expect(CONTROLLERS).toHaveLength(9);
    for (const controller of CONTROLLERS) {
      const first = controllerCard(controller).split('\n')[0];
      const status = CONTROLLER_STATUS[controller.name];
      if (status) {
        expect(first.startsWith(`STATUS: ${status}`)).toBe(true);
      } else {
        expect(controllerCard(controller)).not.toContain('STATUS:');
      }
    }
    expect(CONTROLLERS.filter(c => !CONTROLLER_STATUS[c.name])).toHaveLength(7);
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
