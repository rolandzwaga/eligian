/**
 * Spec 058 Phase 1 (FR-018, FR-026; plan C8): the server `instructions` string of
 * this phase and the `AGENTS.md` block `eligian_init` writes, built from the same text.
 * (The backtick-token check against `index.json` ids is T041's, after the docs exist.)
 */
import { describe, expect, it } from 'vitest';
import {
  agentsMdBlock,
  INSTRUCTIONS,
  INSTRUCTIONS_PHASE_1,
  MCP_PHASE,
} from '../mcp/instructions.js';

/** The numbered engine rules of the instructions, one entry per rule (continuations joined). */
const rulesOf = (text: string): string[] => {
  const start = text.indexOf('Rules the engine imposes:');
  const end = text.indexOf('Review STORYBOARD.md');
  const rules: string[] = [];
  for (const line of text.slice(start, end).split('\n').slice(1)) {
    if (/^\d\. /.test(line)) {
      rules.push(line);
    } else if (line.trim() !== '' && rules.length > 0) {
      rules[rules.length - 1] += `\n${line}`;
    }
  }
  return rules;
};

describe('mcp instructions', () => {
  it('phase 1 text is within 4096 chars', () => {
    expect(INSTRUCTIONS_PHASE_1.length).toBeGreaterThan(0);
    expect(INSTRUCTIONS_PHASE_1.length).toBeLessThanOrEqual(4096);
  });

  it('names no phase 2 tool and no scenario', () => {
    for (const absent of ['eligian_project', 'eligian_smoke', 'eligian_compile', 'scenario']) {
      expect(INSTRUCTIONS_PHASE_1).not.toContain(absent);
    }
    for (const tool of [
      'eligian_docs',
      'eligian_operations',
      'eligian_init',
      'eligian_check',
      'eligian_fmt',
    ]) {
      expect(INSTRUCTIONS_PHASE_1).toContain(`\`${tool}\``);
    }
  });

  it('INSTRUCTIONS[MCP_PHASE] is INSTRUCTIONS_PHASE_1', () => {
    expect(MCP_PHASE).toBe(1);
    expect(INSTRUCTIONS[MCP_PHASE]).toBe(INSTRUCTIONS_PHASE_1);
  });

  it('agentsMdBlock holds both markers and the docs pointer', () => {
    const block = agentsMdBlock();
    expect(block.startsWith('<!-- eligian:begin -->')).toBe(true);
    expect(block.trimEnd().endsWith('<!-- eligian:end -->')).toBe(true);
    expect(block.split('<!-- eligian:begin -->')).toHaveLength(2);
    expect(block.split('<!-- eligian:end -->')).toHaveLength(2);
    expect(block).toContain('node_modules/eligian/dist/docs');

    const rules = rulesOf(INSTRUCTIONS_PHASE_1);
    expect(rules.map(rule => rule.slice(0, 2))).toEqual(['1.', '2.', '3.', '4.', '5.']);
    for (const rule of rules) {
      expect(block).toContain(rule);
    }
    // The workflow: every tool trigger of the instructions is repeated.
    for (const tool of [
      'eligian_docs',
      'eligian_operations',
      'eligian_init',
      'eligian_check',
      'eligian_fmt',
    ]) {
      expect(block).toContain(`\`${tool}\``);
    }
  });
});
