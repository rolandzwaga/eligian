// @vitest-environment jsdom
/// <reference lib="dom" />
// jsdom: the operations are executed with the real `eligius` runtime, which needs a window/document.
import { Effect } from 'effect';
import type { IOperationScope, TOperationData } from 'eligius';
import * as eligius from 'eligius';
import $ from 'jquery';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { RUNTIME_CONCAT_CONTEXT_MESSAGE } from '../runtime-concat.js';
import type { OperationConfigIR } from '../types/eligius-ir.js';

/**
 * Runtime string concatenation (`"#" + id`) and forwarding of runtime values to
 * operations that do not resolve property chains themselves.
 *
 * The compiled operations are run through the real Eligius operation functions,
 * with the same data flow as Eligius's Action.executeOperation: each operation's
 * configured data is merged into the running operation data, and the operation's
 * return value becomes the operation data of the next one.
 */
describe('runtime string concatenation and value forwarding', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="box"></div>
      <div id="slide-2"></div>
      <div id="other"></div>
    `;
  });

  async function compileProgram(source: string) {
    const doc = await parse(`${source}\ntimeline "t" in ".c" using raf {}`);
    expect(doc.parseResult.parserErrors).toHaveLength(0);
    return Effect.runPromise(transformAST(doc.parseResult.value));
  }

  async function actionOps(source: string, name?: string): Promise<OperationConfigIR[]> {
    const { config } = await compileProgram(source);
    const action = name ? config.actions.find(a => a.name === name) : config.actions[0];
    expect(action).toBeDefined();
    return [...(action!.startOperations as OperationConfigIR[])];
  }

  async function compileError(source: string): Promise<{ message: string }> {
    const doc = await parse(`${source}
timeline "t" in ".c" using raf {}`);
    const result = await Effect.runPromise(Effect.result(transformAST(doc.parseResult.value)));
    expect(result._tag).toBe('Failure');
    if (result._tag !== 'Failure') throw new Error('expected a compile error');
    return result.failure;
  }

  /** An operation scope whose event bus answers selectElement's engine-root request. */
  function makeScope(): IOperationScope {
    const eventbus = {
      request: (name: string) => (name === 'request-engine-root' ? $(document.body) : undefined),
    };
    return {
      variables: {},
      operations: [],
      currentIndex: 0,
      eventbus,
    } as unknown as IOperationScope;
  }

  type EligiusOperation = (
    this: IOperationScope,
    data: TOperationData
  ) => TOperationData | Promise<TOperationData> | undefined;

  /** Executes operations like Eligius's Action.executeOperation does. */
  async function run(
    ops: readonly OperationConfigIR[],
    initial: Record<string, unknown> = {},
    scope: IOperationScope = makeScope()
  ): Promise<TOperationData> {
    let data: TOperationData = { ...initial };
    for (const op of ops) {
      const fn = (eligius as unknown as Record<string, EligiusOperation | undefined>)[
        op.systemName
      ];
      expect(fn, `eligius operation ${op.systemName}`).toBeTypeOf('function');
      const configured = structuredClone(op.operationData ?? {});
      const merged = Object.assign(data, configured);
      data = (await fn!.call(scope, merged)) ?? {};
    }
    return data;
  }

  const names = (ops: readonly OperationConfigIR[]) => ops.map(op => op.systemName);

  describe('forwarding runtime values', () => {
    test('a parameter forwarded under another name reaches a non-resolving operation', async () => {
      const ops = await actionOps(
        `action show(label) [ selectElement("#box") setElementContent(label) ]`
      );

      await run(ops, { label: 'hello' });

      expect(document.querySelector('#box')!.innerHTML).toBe('hello');
    });

    test('a same-name parameter needs no extra operations', async () => {
      const ops = await actionOps(
        `action show(template) [ selectElement("#box") setElementContent(template) ]`
      );

      expect(names(ops)).toEqual(['selectElement', 'setElementContent']);
      await run(ops, { template: 'same' });
      expect(document.querySelector('#box')!.innerHTML).toBe('same');
    });

    test('an operation that resolves its own input is left unchanged', async () => {
      const ops = await actionOps(`action show(target) [ selectElement(target) addClass("on") ]`);

      expect(names(ops)).toEqual(['selectElement', 'addClass']);
      await run(ops, { target: '#box' });
      expect(document.querySelector('#box')!.classList.contains('on')).toBe(true);
    });

    test('a runtime action-level const is stored as its value, not as the chain', async () => {
      const ops = await actionOps(
        `action show(label) [ const text = label selectElement("#box") setElementContent(@text) ]`
      );

      await run(ops, { label: 'via variable' });

      expect(document.querySelector('#box')!.innerHTML).toBe('via variable');
    });
  });

  describe('concatenation', () => {
    test('builds a selector at runtime with two extra operations', async () => {
      const ops = await actionOps(`action show(id) [ selectElement("#" + id) addClass("on") ]`);

      expect(names(ops)).toEqual([
        'setOperationData',
        'concatenateStrings',
        'selectElement',
        'addClass',
      ]);
      await run(ops, { id: 'box' });
      expect(document.querySelector('#box')!.classList.contains('on')).toBe(true);
    });

    test('feeds a non-resolving operation', async () => {
      const ops = await actionOps(
        `action greet(name) [ selectElement("#box") setElementContent("Hello " + name + "!") ]`
      );

      await run(ops, { name: 'Ada' });

      expect(document.querySelector('#box')!.innerHTML).toBe('Hello Ada!');
    });

    test('joins numbers and merges adjacent constants', async () => {
      const ops = await actionOps(
        `action show(n) [ selectElement("#" + "slide-" + n) addClass("on") ]`
      );

      expect(ops[0].operationData).toEqual({
        properties: { strings: ['#slide-', '$operationdata.n'] },
      });
      await run(ops, { n: 2 });
      expect(document.querySelector('#slide-2')!.classList.contains('on')).toBe(true);
    });

    test('uses private keys for several concatenations and removes them', async () => {
      const ops = await actionOps(
        `action size(w, h) [ selectElement("#box") setStyle({ width: w + "px", height: h + "px" }) ]`
      );

      const data = await run(ops, { w: 10, h: 20 });

      const box = document.querySelector('#box') as HTMLElement;
      expect(box.style.width).toBe('10px');
      expect(box.style.height).toBe('20px');
      expect(Object.keys(data).filter(k => k.startsWith('__eligian') || k === 'result')).toEqual(
        []
      );
    });

    test('passes a concatenation as an action call argument', async () => {
      const ops = await actionOps(
        `action inner(text) [ log(text) ]
         action outer(name) [ inner("Hi " + name) ]`,
        'outer'
      );

      let received: Record<string, unknown> | undefined;
      const actionInstance = {
        start: (data: Record<string, unknown>) => {
          received = data;
          return Promise.resolve(data);
        },
      };
      // requestAction needs the engine's event bus; stand in for its output
      await run(
        ops.filter(op => op.systemName !== 'requestAction'),
        { name: 'Grace', actionInstance }
      );

      expect(received?.text).toBe('Hi Grace');
    });

    test('works in an action-level const declaration', async () => {
      const ops = await actionOps(
        `action show(id) [ const sel = "#" + id selectElement(@sel) addClass("on") ]`
      );

      await run(ops, { id: 'box' });

      expect(document.querySelector('#box')!.classList.contains('on')).toBe(true);
    });

    test('keeps a $operationdata.result the action uses itself', async () => {
      const ops = await actionOps(
        `action show(id) [
           concatenateStrings(["kept"])
           selectElement("#" + id)
           setElementContent($operationdata.result)
         ]`
      );

      await run(ops, { id: 'box' });

      expect(document.querySelector('#box')!.innerHTML).toBe('kept');
    });

    test('a parameter annotated as string concatenates with another parameter', async () => {
      const ops = await actionOps(
        `action show(prefix: string, id) [ selectElement(prefix + id) addClass("on") ]`
      );

      await run(ops, { prefix: '#', id: 'box' });

      expect(document.querySelector('#box')!.classList.contains('on')).toBe(true);
    });

    test('a constant concatenation still folds at compile time', async () => {
      const ops = await actionOps(`action show() [ selectElement("#" + "box") ]`);

      expect(names(ops)).toEqual(['selectElement']);
      expect(ops[0].operationData).toEqual({ selector: '#box' });
    });
  });

  describe('lowering shape and other contexts', () => {
    test('an action call argument needs three extra operations and no cleanup', async () => {
      const ops = await actionOps(
        `action inner(selector) [ selectElement(selector) ]
         action outer(id) [ inner("#" + id) ]`,
        'outer'
      );

      expect(names(ops)).toEqual([
        'requestAction',
        'setOperationData',
        'concatenateStrings',
        'setOperationData',
        'startAction',
      ]);
      expect(ops[3].operationData).toEqual({
        properties: { actionOperationData: { selector: '$operationdata.result' } },
      });
    });

    test('a same-name argument of a nested action call is not passed again', async () => {
      const ops = await actionOps(
        `action inner(sel) [ selectElement(sel) ]
         action outer(sel) [ inner(sel) ]`,
        'outer'
      );

      expect(names(ops)).toEqual(['requestAction', 'startAction']);
      expect(ops[1].operationData).toEqual({ actionOperationData: {} });
    });

    test('works inside if and for bodies', async () => {
      const ops = await actionOps(
        `action show(id, items) [
           if (id != "") { selectElement("#" + id) addClass("on") }
           for (item in items) { selectElement("#" + @@item) addClass("seen") }
         ]`
      );

      expect(names(ops).filter(n => n === 'concatenateStrings')).toHaveLength(2);
      expect(ops.find(op => op.systemName === 'forEach')?.operationData?.collection).toBe(
        '$operationdata.items'
      );
    });

    test('an event action forwards its event arguments to a non-resolving operation', async () => {
      const { config } = await compileProgram(
        `on event "user-updated" action show(name) [ selectElement("#box") setElementContent("Hi " + name) ]`
      );
      const ops = config.eventActions![0].startOperations as OperationConfigIR[];

      await run(ops, { eventArgs: ['Linus'] });

      expect(document.querySelector('#box')!.innerHTML).toBe('Hi Linus');
    });

    test('a timeline action call can concatenate global data', async () => {
      const { config } = await compileProgram(
        `action reveal(selector) [ selectElement(selector) addClass("on") ]
         timeline "main" in "#app" using raf {
           at 0s..1s reveal("#" + $globaldata.target)
         }`
      );
      const main = config.timelines.find(t => t.uri === 'main') ?? config.timelines[1];
      const ops = main.timelineActions[0].startOperations as OperationConfigIR[];

      expect(names(ops)).toEqual([
        'requestAction',
        'setOperationData',
        'concatenateStrings',
        'setOperationData',
        'startAction',
      ]);
      expect(ops[1].operationData).toEqual({
        properties: { strings: ['#', '$globaldata.target'] },
      });
    });
  });

  describe('rejected', () => {
    test('arithmetic on untyped runtime values is still an error', async () => {
      const error = await compileError(`action show(a, b) [ log(a + b) ]`);
      expect(error.message).toContain("Arithmetic operator '+'");
    });

    test('addition before the first string is arithmetic, as in JavaScript', async () => {
      const error = await compileError(`action show(a, b) [ log(a + b + "s") ]`);
      expect(error.message).toContain("Arithmetic operator '+'");
    });

    test('a concatenation in a for collection is reported', async () => {
      const error = await compileError(`action show(id) [ for (x in "a" + id) { log() } ]`);
      expect(error.message).toBe(RUNTIME_CONCAT_CONTEXT_MESSAGE);
    });

    test('objects cannot be concatenated', async () => {
      const error = await compileError(`action show(id) [ log("a" + id + { k: 1 }) ]`);
      expect(error.message).toContain('Objects and arrays');
    });
  });
});
