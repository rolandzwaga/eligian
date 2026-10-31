// @vitest-environment jsdom
// jsdom: the compiled configuration is initialized with the real Eligius engine.
/**
 * Feature 049: a compiled `using scroll` timeline is accepted by the Eligius
 * engine, which drives it with a ScrollPositionSource (the per-timeline
 * positionSource override replaces the animation type's RafPositionSource).
 */
import { Effect } from 'effect';
import { EligiusResourceImporter, EngineFactory } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { expect, test } from 'vitest';
import { emitJSON, optimize, transformAST, typeCheck } from '../../compiler/pipeline.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

test('the engine runs a compiled scroll timeline on a ScrollPositionSource', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  const doc = await parse(`timeline "story" in "#stage" using scroll "#scroller" duration 120s {
    at 0s..10s [ selectElement("#stage") ]
  }`);
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
      '<div id="scroller" style="height:100px;overflow:auto"><div id="stage" style="height:1000px"></div></div>',
  };

  const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
    runnable
  );
  const positionSource = await engine.init();

  expect(engine.currentTimelineUri).toBe('story');
  expect(engine.duration).toBe(120);
  expect(positionSource.constructor.name).toBe('ScrollPositionSource');
  await engine.destroy();
});
