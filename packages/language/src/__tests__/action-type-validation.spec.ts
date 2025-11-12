import { beforeAll, describe, expect, test } from 'vitest';
import { getElements } from '../utils/program-helpers.js';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

describe('Action Call Type Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  test('should validate action call argument types', async () => {
    const document = await ctx.parse(`
      action test(name: string) [
        selectElement(name)
      ]

      timeline "t" in "#c" using raf {
        at 0s..1s test("hello")
        at 1s..2s test(123)
      }
    `);

    // Check for parsing errors
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    // Build the document (this triggers validation)
    await ctx.services.shared.workspace.DocumentBuilder.build([document]);

    // Get validation diagnostics
    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);

    // Filter for type-related errors (excluding CSS validation errors)
    const typeErrors = diagnostics.filter(
      d =>
        (d.message.includes('type') ||
          d.message.includes('number') ||
          d.message.includes('string') ||
          d.message.includes('match')) &&
        !d.message.includes('CSS')
    );

    // We expect at least one type error for test(123) - parameter type mismatch
    // The Typir type system (Feature 021) catches this: number is not assignable to string
    expect(typeErrors.length).toBeGreaterThan(0);
    expect(typeErrors[0].message).toContain('number');
    expect(typeErrors[0].message).toContain('string');
  });

  test('should create function type for action with typed parameter', async () => {
    const document = await ctx.parse(`
      action test(name: string) [
        selectElement(name)
      ]

      timeline "t" in "#c" using raf {
        at 0s..1s test("hello")
      }
    `);

    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    // Build the document
    await ctx.services.shared.workspace.DocumentBuilder.build([document]);

    // Access Typir services to check if function type was created
    const typirServices = ctx.services.Eligian.typir;

    //console.log('Typir services:', typirServices);
    //console.log('Typir Functions:', typirServices?.Functions);

    // Try to get all registered functions
    if (typirServices?.Functions) {
      const allFunctions = typirServices.Functions.getAll();
      console.log('All registered functions:', allFunctions);
      console.log('Number of functions:', allFunctions.length);

      // Look for our action function
      const testFunction = allFunctions.find((f: any) => f.functionName === 'test');
      console.log('Found "test" function:', testFunction);

      if (testFunction) {
        console.log('Function input parameters:', testFunction.inputParameters);
      }
    }
  });

  test('should match action calls to function types', async () => {
    const document = await ctx.parse(`
      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      timeline "t" in "#c" using raf {
        at 0s..1s fadeIn("#box")
        at 1s..2s fadeIn(999)
      }
    `);

    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    await ctx.services.shared.workspace.DocumentBuilder.build([document]);

    // Check Typir inference
    const typirServices = ctx.services.Eligian.typir;
    if (typirServices?.Inference) {
      const program = document.parseResult.value;

      // Try to infer type of action calls
      const timeline = getElements(program).find(e => e.$type === 'Timeline') as any;
      if (timeline) {
        //console.log('Timeline events:', timeline.events);

        for (const event of timeline.events) {
          if (event.actionInvocation?.actionCall) {
            const call = event.actionInvocation.actionCall;
            console.log('Action call:', call);
            console.log('Action reference text:', call.action.$refText);
            console.log('Action reference resolved:', call.action.ref);
            console.log('Arguments:', call.args);

            // Try to infer type
            const inferredType = typirServices.Inference.inferType(call);
            console.log('Inferred type of call:', inferredType);

            // Try to infer types of arguments
            for (let i = 0; i < call.args.length; i++) {
              const arg = call.args[i];
              const argType = typirServices.Inference.inferType(arg);
              console.log(`Argument ${i} type:`, argType);
            }
          }
        }
      }
    }

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    //console.log('Diagnostics:', diagnostics);

    const _typeErrors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    //console.log('Errors:', _typeErrors);
  });
});
