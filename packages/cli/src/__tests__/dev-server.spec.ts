/**
 * `eligian dev` (audit idea #23): serves the bundle with the dev client and
 * tells the browser how to apply a change (swap the CSS, reload, show the
 * build error).
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type DevServer, startDevServer, styleOf, withClient } from '../dev/dev-server.js';

const PROGRAM = `layout "./layout.html"
styles "./styles.css"
timeline "t" in "#stage" using raf {
  at 0s..1s [ selectElement("#a") addClass("on") ] [ selectElement("#a") removeClass("on") ]
}
`;

describe('eligian dev', () => {
  let dir: string;
  let server: DevServer;
  const events: { event: string; data: unknown }[] = [];
  let stream: http.ClientRequest;

  const get = (url: string) =>
    new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
      http
        .get(url, response => {
          let body = '';
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              type: String(response.headers['content-type']),
              body,
            })
          );
        })
        .on('error', reject);
    });

  const write = (file: string, content: string) => fs.writeFileSync(path.join(dir, file), content);

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-dev-'));
    write('layout.html', '<div id="stage"><div id="a"></div></div>\n');
    write('styles.css', '#stage {}\n#a {}\n.on { color: red; }\n');
    write('main.eligian', PROGRAM);
    server = await startDevServer(path.join(dir, 'main.eligian'), { port: 0, debounceMs: 50 });
    // Listen to the events like the browser does
    await new Promise<void>(resolve => {
      stream = http.get(`${server.url}__eligian/events`, response => {
        let buffer = '';
        response.on('data', chunk => {
          buffer += chunk;
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event) events.push({ event, data: data ? JSON.parse(data) : undefined });
          }
        });
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    stream?.destroy();
    await server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const next = async (event: string) => {
    const from = events.length;
    return async () => {
      await vi.waitFor(() => expect(events.slice(from).map(e => e.event)).toContain(event), {
        timeout: 15000,
        interval: 50,
      });
      return events.slice(from).find(e => e.event === event)!;
    };
  };

  it('serves the bundle with the dev client', async () => {
    const page = await get(server.url);
    expect(page.status).toBe(200);
    expect(page.body).toContain('<script type="module" src="bundle.js"></script>');
    expect(page.body).toContain('<script src="/__eligian/client.js"></script>');
    const client = await get(`${server.url}__eligian/client.js`);
    expect(client.type).toContain('text/javascript');
    expect(client.body).toContain("new EventSource('/__eligian/events')");
    expect((await get(`${server.url}bundle.js`)).status).toBe(200);
    expect((await get(`${server.url}missing.png`)).status).toBe(404);
  });

  it('a stylesheet change swaps the styles in place', async () => {
    const wait = await next('css');
    write('styles.css', '#stage {}\n#a {}\n.on { color: blue; }\n');
    const { data } = await wait();
    expect((data as { css: string }).css).toContain('color: blue');
  }, 20000);

  it('a program change reloads; a build error shows; the fix reloads', async () => {
    let wait = await next('reload');
    write('main.eligian', PROGRAM.replace('0s..1s', '0s..2s'));
    await wait();

    wait = await next('build-error');
    write('main.eligian', `${PROGRAM}action loop() [ ]\n`);
    const { data } = await wait();
    expect((data as { message: string }).message).toContain("'loop' is a keyword");

    wait = await next('reload');
    write('main.eligian', PROGRAM);
    await wait();
  }, 40000);

  it('helpers: the client goes before </body>, the CSS comes from the <style>', () => {
    expect(withClient('<html><body><p></p></body></html>')).toBe(
      '<html><body><p></p>  <script src="/__eligian/client.js"></script>\n</body></html>'
    );
    expect(styleOf('<head>\n  <style>\n.a { color: red; }\n  </style>\n</head>')).toBe(
      '.a { color: red; }'
    );
  });
});
