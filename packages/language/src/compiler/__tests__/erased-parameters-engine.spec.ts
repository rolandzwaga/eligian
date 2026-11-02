// @vitest-environment jsdom
// jsdom: the compiled configuration runs on the real Eligius engine.
/**
 * On the real engine, an action parameter that an operation erases
 * (`selectElement(selector)` removes `selector`) is still there for the rest
 * of the block: a second selectElement, forwarding it to another action
 * (also through a library-style chain) and the next loop iteration.
 */
import { Effect } from 'effect';
import { EligiusResourceImporter, EngineFactory, type IEngineConfiguration } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { expect, test, vi } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { emitJSON, optimize, transformAST, typeCheck } from '../pipeline.js';

const classes = (id: string) => document.getElementById(id)?.className.split(' ').filter(Boolean);

test('parameters survive the operations that erase them', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  const doc = await parse(`
    action mark(selector) [ selectElement(selector) addClass("on") ]
    action twice(selector) [ selectElement(selector) addClass("one") selectElement(selector) addClass("two") ]
    action forward(selector) [ selectElement(selector) addClass("outer") mark(selector) ]
    action chain(selector) [ selectElement(selector) forward(selector) ]
    action repeat(selector) [ for (x in ["a", "b"]) { selectElement(selector) addClass(@@x) } ]
    timeline "t" in "#stage" using raf {
      at 0s..1s twice("#t")
      at 0s..1s chain("#f")
      at 0s..1s repeat("#r")
    }`);
  expect(doc.parseResult.parserErrors).toEqual([]);
  const config = await Effect.runPromise(
    transformAST(doc.parseResult.value).pipe(
      Effect.flatMap(typeCheck),
      Effect.flatMap(optimize),
      Effect.flatMap(emitJSON)
    )
  );
  const runnable = {
    ...config,
    containerSelector: '#app',
    layoutTemplate: '<div id="stage"><div id="t"></div><div id="f"></div><div id="r"></div></div>',
  } as unknown as IEngineConfiguration;
  const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
    runnable
  );
  const errors: unknown[] = [];
  engine.on('error', error => errors.push(error));
  await engine.init();
  await engine.seek(0);
  await vi.waitFor(() => expect(classes('r')).toEqual(['a', 'b']));
  expect(classes('t')).toEqual(['one', 'two']);
  expect(classes('f')).toEqual(['outer', 'on']);
  expect(errors).toEqual([]);
  await engine.destroy();
});
