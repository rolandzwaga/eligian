/**
 * The browser side of `eligian dev` (audit idea #23), served at
 * `/__eligian/client.js` and added to the bundle's index.html.
 *
 * Server-sent events from `/__eligian/events`:
 * - `reload`: the program changed. The current timeline, position and play
 *   state are kept in sessionStorage, the page reloads, and the new engine
 *   (`window.EligiusBundled.ready`) is switched / seeked back there.
 * - `css` (`{ css }`): only stylesheets changed, so the page's <style> is
 *   replaced in place; the presentation keeps running.
 * - `build-error` (`{ message }`): the build failed; an overlay shows why
 *   until the next successful build (`ok`).
 */
export const DEV_CLIENT_SCRIPT = `(() => {
  const KEY = 'eligian-dev-playhead';
  const OVERLAY = 'eligian-dev-overlay';

  function showError(message) {
    let overlay = document.getElementById(OVERLAY);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY;
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;padding:24px;background:rgba(20,20,24,0.94);color:#f8f8f2;font:13px/1.5 ui-monospace,Consolas,monospace';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = 'eligian dev: the build failed (fix the file to continue)';
    title.style.cssText = 'color:#ff6b6b;font-weight:bold;margin-bottom:12px';
    const text = document.createElement('pre');
    text.textContent = message;
    text.style.cssText = 'white-space:pre-wrap;margin:0';
    overlay.append(title, text);
  }

  function hideError() {
    document.getElementById(OVERLAY)?.remove();
  }

  async function engine() {
    const bundled = window.EligiusBundled;
    return bundled && bundled.ready ? bundled.ready.catch(() => undefined) : undefined;
  }

  // Back to where the previous page was
  const saved = sessionStorage.getItem(KEY);
  if (saved) {
    sessionStorage.removeItem(KEY);
    const resume = async () => {
      const current = await engine();
      if (!current) return;
      const { uri, position, playing } = JSON.parse(saved);
      try {
        if (uri && uri !== current.currentTimelineUri) await current.switchTimeline(uri, position);
        else await current.seek(position);
        if (!playing) current.pause();
        console.info('[eligian dev] resumed at ' + uri + ' ' + position + 's');
      } catch (error) {
        console.warn('[eligian dev] could not resume:', error);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(resume, 0));
    } else {
      setTimeout(resume, 0);
    }
  }

  const events = new EventSource('/__eligian/events');
  events.addEventListener('reload', async () => {
    const current = await engine();
    if (current) {
      sessionStorage.setItem(KEY, JSON.stringify({
        uri: current.currentTimelineUri,
        position: current.position,
        playing: current.playState === 'playing',
      }));
    }
    location.reload();
  });
  events.addEventListener('css', event => {
    const style = document.querySelector('head style');
    if (style) style.textContent = JSON.parse(event.data).css;
    hideError();
  });
  events.addEventListener('build-error', event => showError(JSON.parse(event.data).message));
  events.addEventListener('ok', hideError);
})();
`;
