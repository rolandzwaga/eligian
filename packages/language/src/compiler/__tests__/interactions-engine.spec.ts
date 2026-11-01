// @vitest-environment jsdom
// jsdom: the compiled configuration runs on the real Eligius engine.
/**
 * Audit idea #19: on the real engine, a DOM event on an element seeks, pauses,
 * switches timelines and starts an action with its arguments.
 */
import { Effect } from 'effect';
import { EligiusResourceImporter, EngineFactory, type IEngineConfiguration } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { expect, test, vi } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { emitJSON, optimize, transformAST, typeCheck } from '../pipeline.js';

const click = (id: string, type = 'click') =>
  document.getElementById(id)?.dispatchEvent(new MouseEvent(type, { bubbles: true }));

test('interaction verbs drive the engine', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  const doc = await parse(`
    action mark(sel, name) [ selectElement(sel) addClass(name) ]
    timeline "Hub" in "#stage" using raf {
      on enter [
        on click "#skip" seek intro.end
        on click "#pause" pause
        on mouseenter "#card" run mark("#card", "hot")
        on click "#go" navigate "Chapter" at beat.start
      ]
      at 0s for 4s as intro [ selectElement("#a") ] [ selectElement("#a") ]
      at 4s..6s [ selectElement("#a") ] [ selectElement("#a") ]
    }
    timeline "Chapter" in "#stage" using raf {
      at 1s..2s [ selectElement("#a") ] [ selectElement("#a") ]
      at 2s..3s as beat [ selectElement("#a") ] [ selectElement("#a") ]
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
    layoutTemplate:
      '<div id="stage"><button id="skip"></button><button id="pause"></button><div id="card"></div><button id="go"></button><div id="a"></div></div>',
  } as unknown as IEngineConfiguration;
  const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
    runnable
  );
  await engine.init();
  await engine.seek(0);
  await vi.waitFor(() => expect(document.getElementById('skip')).not.toBeNull());

  // seek intro.end: 4s on the current timeline
  click('skip');
  await vi.waitFor(() => expect(engine.position).toBe(4));

  // run mark("#card", "hot"): the action starts with its arguments (jQuery
  // emulates mouseenter with mouseover)
  click('card', 'mouseover');
  await vi.waitFor(() => expect(document.getElementById('card')?.classList).toContain('hot'));

  // pause
  await engine.start();
  expect(engine.playState).toBe('playing');
  click('pause');
  await vi.waitFor(() => expect(engine.playState).not.toBe('playing'));

  // navigate "Chapter" at beat.start: the label of the target timeline (2s)
  click('go');
  await vi.waitFor(() => expect(engine.currentTimelineUri).toBe('Chapter'));
  await vi.waitFor(() => expect(engine.position).toBe(2));
  await engine.destroy();
});

// keydown then keyup: hotkeys-js tracks the keys held down
const press = (key: string, target: EventTarget = document.body) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
};

test('on key drives the engine through a KeyboardController', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  const doc = await parse(`
    timeline "Hub" in "#stage" using raf {
      on enter [
        on key "ArrowRight" seek intro.end
        on key "Escape" in "#dialog" seek 1s
      ]
      at 0s for 4s as intro [ selectElement("#a") ] [ selectElement("#a") ]
      at 4s..6s [ selectElement("#a") ] [ selectElement("#a") ]
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
    layoutTemplate:
      '<div id="stage"><div id="a"></div><div id="dialog"><button id="close"></button></div></div>',
  } as unknown as IEngineConfiguration;
  const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
    runnable
  );
  await engine.init();
  await engine.seek(0);
  await vi.waitFor(() => expect(document.getElementById('close')).not.toBeNull());

  // Nothing has focus: the document-scope key works
  press('ArrowRight');
  await vi.waitFor(() => expect(engine.position).toBe(4));

  // Escape is scoped to #dialog: ignored while nothing has focus there...
  press('Escape');
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(engine.position).toBe(4);

  // ...and handled while the focus is inside it
  const close = document.getElementById('close') as HTMLButtonElement;
  close.focus();
  press('Escape', close);
  await vi.waitFor(() => expect(engine.position).toBe(1));
  await engine.destroy();
});
