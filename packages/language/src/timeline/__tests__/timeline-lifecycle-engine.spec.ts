// @vitest-environment jsdom
// jsdom: the compiled configuration runs on the real Eligius engine.
/**
 * Audit idea #6: `on enter` / `on leave` compile to one open-ended timeline
 * action. On the real engine its start operations run when the timeline
 * becomes active and its end operations when the timeline is left, while the
 * content events start and end at their times and leave it running.
 */
import { Effect } from 'effect';
import { EligiusResourceImporter, EngineFactory, type IEngineConfiguration } from 'eligius';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { expect, test, vi } from 'vitest';
import { emitJSON, optimize, transformAST, typeCheck } from '../../compiler/pipeline.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';

const classes = (id: string) => document.getElementById(id)?.className.split(' ').filter(Boolean);

test('on enter runs when a timeline becomes active, on leave when it is left', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  const doc = await parse(`
    timeline "Hub" in "#stage" using raf {
      on enter [ selectElement("#hub") addClass("shown") ]
      on leave [ selectElement("#hub") removeClass("shown") ]
    }
    timeline "Chapter" in "#stage" using raf {
      on enter [ selectElement("#chapter") addClass("shown") ]
      on leave [ selectElement("#chapter") removeClass("shown") ]
      at 0s for 2s [ selectElement("#beat") addClass("on") ] [ selectElement("#beat") removeClass("on") ]
    }`);
  const config = await Effect.runPromise(
    transformAST(doc.parseResult.value).pipe(
      Effect.flatMap(typeCheck),
      Effect.flatMap(optimize),
      Effect.flatMap(emitJSON)
    )
  );
  // Lifecycle blocks are not part of the durations
  expect(config.timelines.map(t => t.duration)).toEqual([0, 2]);

  const runnable = {
    ...config,
    containerSelector: '#app',
    layoutTemplate:
      '<div id="stage"><div id="hub"></div><div id="chapter"></div><div id="beat"></div></div>',
  } as unknown as IEngineConfiguration;
  const { engine } = new EngineFactory(new EligiusResourceImporter(), window).createEngine(
    runnable
  );
  await engine.init();
  // The first timeline becomes active at 0s
  await engine.seek(0);
  await vi.waitFor(() => expect(classes('hub')).toContain('shown'));

  // Navigating away runs the hub's on leave, then the chapter's on enter
  await engine.switchTimeline('Chapter');
  await vi.waitFor(() => expect(classes('chapter')).toContain('shown'));
  expect(classes('hub')).not.toContain('shown');
  await vi.waitFor(() => expect(classes('beat')).toContain('on'));

  // Past the content (its end, 2s): the beat ends, the chapter stays shown
  await engine.seek(2);
  await vi.waitFor(() => expect(classes('beat')).not.toContain('on'));
  expect(classes('chapter')).toContain('shown');

  // Leaving the chapter runs its on leave
  await engine.switchTimeline('Hub');
  await vi.waitFor(() => expect(classes('hub')).toContain('shown'));
  expect(classes('chapter')).not.toContain('shown');
  await engine.destroy();
});
