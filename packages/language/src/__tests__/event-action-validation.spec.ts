/**
 * Event Action Validation Tests (Feature 028 - User Story 4)
 *
 * Tests validation rules for event action definitions:
 * - Event name must be string literal (not variable) and ≤100 chars
 * - Action body must have at least one operation
 * - Parameters must not use reserved keywords
 * - No duplicate parameter names
 * - Warn about duplicate event/topic combinations
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

describe('Event Action Validation - Event Name (T026)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should reject variable as event name', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      const myVar = "click"
      on event myVar action HandleClick() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('string literal'))).toBe(true);
  });

  test('should accept string literal as event name', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action HandleClick() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  test('should reject event name exceeding 100 characters', async () => {
    // Create a 101-character string
    const longName = 'a'.repeat(101);
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "${longName}" action HandleLongEvent() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('100 character'))).toBe(true);
  });
});

describe('Event Action Validation - Empty Body (T027)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should reject event action with no operations', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Empty() []

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('at least one operation'))).toBe(true);
  });
});

describe('Event Action Validation - Reserved Keyword Parameters (T028)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  // NOTE: Reserved keywords ('if', 'for', 'break', etc.) are grammar keywords
  // and fail PARSING before validation runs. The validator's reserved keyword check
  // is defensive but won't be reached in practice since Langium prevents these as IDs.
  //
  // These tests verify that grammar-level rejection occurs (parse errors).

  test('should reject "if" as parameter name (parse error)', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Foo(if) [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Expecting parse error (keywords rejected at grammar level)
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(e => e.message.includes('Expecting') || e.message.includes('unexpected'))
    ).toBe(true);
  });

  test('should reject "for" as parameter name (parse error)', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Foo(for) [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Expecting parse error (keywords rejected at grammar level)
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(e => e.message.includes('Expecting') || e.message.includes('unexpected'))
    ).toBe(true);
  });

  test('should reject "break" as parameter name (parse error)', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Foo(break) [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    // Expecting parse error (keywords rejected at grammar level)
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(e => e.message.includes('Expecting') || e.message.includes('unexpected'))
    ).toBe(true);
  });

  test('should accept valid parameter name', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Foo(validName) [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });
});

describe('Event Action Validation - Duplicate Parameters (T029)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should reject duplicate parameter names', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action Foo(a, a) [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Duplicate parameter'))).toBe(true);
  });
});

describe('Event Action Validation - Duplicate Event/Topic Combinations (T030)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should warn about duplicate event names', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action First() [
        selectElement("#app")
      ]

      on event "dom-mutation" action Second() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.message.includes('Multiple handlers'))).toBe(true);
  });

  test('should warn about duplicate event name + topic combinations', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" topic "nav" action First() [
        selectElement("#app")
      ]

      on event "dom-mutation" topic "nav" action Second() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.message.includes('Multiple handlers'))).toBe(true);
  });

  test('should not warn about different event names', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action First() [
        selectElement("#app")
      ]

      on event "submit" action Second() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const warnings = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Warning &&
        (d.message.includes('duplicate') || d.message.includes('multiple handlers'))
    );

    expect(warnings).toHaveLength(0);
  });
});

describe('Event Action Validation - Empty Topic Strings (T042)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: [],
      ids: ['app'],
    });
  });

  test('should reject empty topic string', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" topic "" action HandleClick() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Event topic cannot be an empty string'))).toBe(
      true
    );
  });

  test('should accept non-empty topic string', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" topic "navigation" action HandleClick() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });

  test('should accept event action without topic', async () => {
    const code = `
      styles "./test.css"

      action init() [ selectElement("#app") ]

      on event "dom-mutation" action HandleClick() [
        selectElement("#app")
      ]

      timeline "test" in "#app" using raf {
        at 0s..1s init()
      }
    `;

    const { diagnostics } = await ctx.parseAndValidate(code);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    expect(errors).toHaveLength(0);
  });
});
