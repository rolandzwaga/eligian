/**
 * `eligian init` (audit idea #12): writes a starter project, never overwrites
 * without --force, and every starter checks without errors or warnings (the
 * `video` starter: one media-file-missing until its video exists), also with
 * the stricter 'not in layout' setting (so they stay in sync with the grammar
 * and the validators).
 *
 * Spec 058 Phase 2 (FR-064, Q7; SC-011(8), SC-012 automated half): after the starter, init
 * writes the agent files through `setupAgents`, always in the `node` form pointing at
 * `<abs>/node_modules/eligian/bin/cli.js`; `agents: []` (`--no-agents`) writes none.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STARTERS, starterFiles } from '@eligian/language';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../check/check-command.js';
import { runInit, titleFromDirectory } from '../init.js';

/** A stand-in for the generated `dist/docs/agents-block.md` (agents.spec.ts uses it too). */
const DOCS_ROOT = path.join(import.meta.dirname, '__fixtures__', 'agents', 'docs');
const AGENT_FILES = ['.mcp.json', 'CLAUDE.md', 'AGENTS.md'];

describe('eligian init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-init-'));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const read = (file: string) => fs.readFileSync(path.join(cwd, file), 'utf-8');

  it('writes the starter into a new directory, titled after it', async () => {
    const outcome = await runInit('my-talk', {
      template: 'chapters',
      force: false,
      cwd,
      docsRoot: DOCS_ROOT,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toContain('Created my-talk/ (Chapters starter)');
    expect(outcome.output).toContain('cd my-talk');
    for (const file of Object.keys(starterFiles('chapters'))) {
      expect(fs.existsSync(path.join(cwd, 'my-talk', file))).toBe(true);
    }
    expect(JSON.parse(read('my-talk/locales.json'))['en-US'].hub.title).toBe('My Talk');
    expect(JSON.parse(read('my-talk/package.json')).name).toBe('my-talk');
  });

  it("the starter's package.json depends on this package, in the minor that introduced eligian mcp", async () => {
    const cli = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'package.json'), 'utf-8')
    ) as { name: string; version: string };
    await runInit('.', { template: 'blank', force: false, cwd, docsRoot: DOCS_ROOT });
    const major = cli.version.split('.')[0];
    // 1.1 introduced `eligian mcp`
    expect(JSON.parse(read('package.json')).devDependencies).toEqual({
      [cli.name]: `^${major}.1.0`,
    });
  });

  it('never overwrites existing files without --force', async () => {
    fs.writeFileSync(path.join(cwd, 'main.eligian'), 'keep me');
    const refused = await runInit('.', {
      template: 'blank',
      force: false,
      cwd,
      docsRoot: DOCS_ROOT,
    });
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain('main.eligian');
    expect(read('main.eligian')).toBe('keep me');
    // Nothing else was written either
    expect(fs.existsSync(path.join(cwd, 'layout.html'))).toBe(false);

    const forced = await runInit('.', {
      template: 'blank',
      force: true,
      title: 'Talk',
      cwd,
      docsRoot: DOCS_ROOT,
    });
    expect(forced.exitCode).toBe(0);
    expect(read('main.eligian')).toContain('timeline "Talk"');
  });

  it('rejects an unknown template', async () => {
    const outcome = await runInit('x', {
      template: 'slides',
      force: false,
      cwd,
      docsRoot: DOCS_ROOT,
    });
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain('blank, chapters, video, library');
  });

  describe('agent files', () => {
    it('writes .mcp.json pointing at <abs>/node_modules/eligian/bin/cli.js without node_modules', async () => {
      const outcome = await runInit('demo', {
        template: 'chapters',
        agents: ['claude'],
        docsRoot: DOCS_ROOT,
        force: false,
        cwd,
      });
      const abs = path.join(cwd, 'demo');

      expect(outcome.exitCode, outcome.output).toBe(0);
      expect(fs.existsSync(path.join(abs, 'node_modules'))).toBe(false);
      const mcp = JSON.parse(read('demo/.mcp.json')) as {
        mcpServers: { eligian: { command: string; args: string[] } };
      };
      expect(mcp.mcpServers.eligian.command).toBe('node');
      expect(mcp.mcpServers.eligian.args[0]).toBe(
        path.join(abs, 'node_modules', 'eligian', 'bin', 'cli.js')
      );
      expect(mcp.mcpServers.eligian.args).toEqual([mcp.mcpServers.eligian.args[0], 'mcp']);
      expect(read('demo/CLAUDE.md')).toBe('@AGENTS.md\n');
      expect(read('demo/AGENTS.md')).toBe(
        fs.readFileSync(path.join(DOCS_ROOT, 'agents-block.md'), 'utf-8').replace(/\r\n/g, '\n')
      );
    });

    it('agents: [] writes no agent file', async () => {
      const outcome = await runInit('.', {
        template: 'blank',
        agents: [],
        docsRoot: DOCS_ROOT,
        force: false,
        cwd,
      });

      expect(outcome.exitCode, outcome.output).toBe(0);
      expect(outcome.agentFiles).toEqual([]);
      for (const file of AGENT_FILES) expect(fs.existsSync(path.join(cwd, file)), file).toBe(false);
      expect(fs.readdirSync(cwd).sort()).toEqual(Object.keys(starterFiles('blank')).sort());
      for (const file of AGENT_FILES) expect(outcome.output).not.toContain(file);
    });

    it('reports agentFiles with statuses', async () => {
      // `agents` absent: the default is ['claude']
      const first = await runInit('.', {
        template: 'blank',
        docsRoot: DOCS_ROOT,
        force: false,
        cwd,
      });
      expect(first.exitCode, first.output).toBe(0);
      expect(first.agentFiles).toEqual(AGENT_FILES.map(file => ({ file, status: 'written' })));
      const lines = first.output.split('\n');
      for (const file of AGENT_FILES) {
        expect(lines.filter(line => line.includes(file) && line.includes('written'))).toHaveLength(
          1
        );
      }

      const second = await runInit('.', {
        template: 'blank',
        docsRoot: DOCS_ROOT,
        force: true,
        cwd,
      });
      expect(second.exitCode, second.output).toBe(0);
      expect(second.agentFiles).toEqual(AGENT_FILES.map(file => ({ file, status: 'unchanged' })));
    });

    it('a refused starter writes no agent file', async () => {
      fs.writeFileSync(path.join(cwd, 'main.eligian'), 'keep me');
      const refused = await runInit('.', {
        template: 'blank',
        docsRoot: DOCS_ROOT,
        force: false,
        cwd,
      });
      expect(refused.exitCode).toBe(1);
      expect(refused.agentFiles).toBeUndefined();
      for (const file of AGENT_FILES) expect(fs.existsSync(path.join(cwd, file)), file).toBe(false);
    });
  });

  /** Spec 059 Phase 2 (FR-060, P9, SC-022): the CLI action passes `firstRecord: true`. */
  describe('eligian init writes the first record', () => {
    const recordOf = (dir: string) => path.join(cwd, dir, '.eligian', 'programs.json');
    const init = (dir: string, template = 'blank') =>
      runInit(dir, { template, force: false, cwd, docsRoot: DOCS_ROOT, firstRecord: true });

    it.each(['blank', 'chapters', 'video', 'library'])(
      'template %s into an empty dir: { version: 1, programs: [] }, .gitignore *, no main.eligian entry',
      async template => {
        expect((await init('talk', template)).exitCode).toBe(0);
        expect(JSON.parse(read('talk/.eligian/programs.json'))).toEqual({
          version: 1,
          programs: [],
        });
        expect(read('talk/.eligian/.gitignore')).toBe('*\n');
        expect(read('talk/.eligian/programs.json')).not.toContain('main.eligian');
      }
    );

    it('a dir holding a.eligian and lib.eligian → exactly a.eligian via first-run', async () => {
      fs.mkdirSync(path.join(cwd, 'talk'));
      fs.writeFileSync(path.join(cwd, 'talk', 'a.eligian'), 'timeline "A" in "#s" using raf {}\n');
      fs.writeFileSync(path.join(cwd, 'talk', 'lib.eligian'), 'library lib\naction f() [\n]\n');
      expect((await init('talk')).exitCode).toBe(0);
      expect(JSON.parse(read('talk/.eligian/programs.json'))).toEqual({
        version: 1,
        programs: [
          {
            path: 'a.eligian',
            timelines: ['A'],
            languages: [],
            extensions: false,
            via: 'first-run',
          },
        ],
      });
    });

    it('an existing programs.json is byte-identical afterwards', async () => {
      const text = '{"version":1,"programs":[]}';
      fs.mkdirSync(path.join(cwd, 'talk', '.eligian'), { recursive: true });
      fs.writeFileSync(recordOf('talk'), text);
      fs.writeFileSync(path.join(cwd, 'talk', 'a.eligian'), 'timeline "A" in "#s" using raf {}\n');
      expect((await init('talk')).exitCode).toBe(0);
      expect(fs.readFileSync(recordOf('talk'), 'utf-8')).toBe(text);
    });

    it('without firstRecord (eligian_init) no .eligian/ is created', async () => {
      const outcome = await runInit('talk', {
        template: 'blank',
        force: false,
        cwd,
        docsRoot: DOCS_ROOT,
      });
      expect(outcome.exitCode).toBe(0);
      expect(fs.existsSync(path.join(cwd, 'talk', '.eligian'))).toBe(false);
    });

    it('a refused init (existing starter files) writes no record', async () => {
      fs.mkdirSync(path.join(cwd, 'talk'));
      fs.writeFileSync(path.join(cwd, 'talk', 'main.eligian'), 'keep me');
      expect((await init('talk')).exitCode).toBe(1);
      expect(fs.existsSync(path.join(cwd, 'talk', '.eligian'))).toBe(false);
    });
  });

  it('derives a title from the directory name', () => {
    expect(titleFromDirectory('my-first_talk')).toBe('My First Talk');
  });

  describe.each(STARTERS.map(starter => starter.name))('the %s starter', name => {
    it('checks without errors or warnings', async () => {
      expect(
        (await runInit('.', { template: name, force: false, cwd, docsRoot: DOCS_ROOT })).exitCode
      ).toBe(0);
      // `review: true` is what `eligian check` runs by default (spec 058 FR-051)
      const outcome = await runCheck(['**/*.eligian'], {
        format: 'json',
        warningsAsErrors: true,
        selectorNotInLayout: 'ids',
        review: true,
        cwd,
        version: 'test',
      });
      const report = JSON.parse(outcome.output);
      const diagnostics = report.files.flatMap(
        (f: { diagnostics: { code?: string; message: string }[] }) => f.diagnostics
      );
      if (name === 'video') {
        // The starter writes no media file: one warning until media/intro.mp4 exists (Q1)
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].code).toBe('media-file-missing');
        expect(diagnostics[0].message).toContain(path.join('media', 'intro.mp4'));
        expect(outcome.exitCode).toBe(1);
      } else {
        expect(diagnostics).toEqual([]);
        expect(outcome.exitCode).toBe(0);
      }
    }, 30000);
  });
});
