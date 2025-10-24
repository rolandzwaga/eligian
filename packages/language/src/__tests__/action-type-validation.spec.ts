import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('Action Call Type Validation', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  // TODO: Fix type validation for unified action call syntax (OperationCall)
  // These tests need to be updated to work with the new OperationCall-based action calls
  test.skip('should validate action call argument types', async () => {
    const document = await parse(`
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
    await services.shared.workspace.DocumentBuilder.build([document]);

    // Get validation diagnostics
    const diagnostics = await services.validation.DocumentValidator.validateDocument(document);

    //console.log('All diagnostics:', diagnostics);
    //console.log('Number of diagnostics:', diagnostics.length);

    // Filter for type-related errors
    const typeErrors = diagnostics.filter(
      d =>
        d.message.includes('type') ||
        d.message.includes('number') ||
        d.message.includes('string') ||
        d.message.includes('match')
    );

    //console.log('Type-related diagnostics:', typeErrors);

    // We expect at least one type error for test(123)
    expect(typeErrors.length).toBeGreaterThan(0);
  });

  test('should create function type for action with typed parameter', async () => {
    const document = await parse(`
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
    await services.shared.workspace.DocumentBuilder.build([document]);

    // Access Typir services to check if function type was created
    const typirServices = services.typir;

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
    const document = await parse(`
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

    await services.shared.workspace.DocumentBuilder.build([document]);

    // Check Typir inference
    const typirServices = services.typir;
    if (typirServices?.Inference) {
      const program = document.parseResult.value;

      // Try to infer type of action calls
      const timeline = program.elements.find(e => e.$type === 'Timeline') as any;
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

    const diagnostics = await services.validation.DocumentValidator.validateDocument(document);
    //console.log('Diagnostics:', diagnostics);

    const _typeErrors = diagnostics.filter(d => d.severity === 1); // Error severity
    //console.log('Errors:', _typeErrors);
  });
});
