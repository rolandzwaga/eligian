/**
 * A stand-in for the browser `EventSource` (spec 058 phase 4): records the
 * listeners by event name so a test can fire the dev server's SSE events.
 */
type Listener = (event: { data: string }) => void;

export function createFakeEventSource(): {
  FakeEventSource: new (
    url: string
  ) => {
    addEventListener(name: string, listener: Listener): void;
    close(): void;
  };
  listeners: Record<string, Listener>;
} {
  const listeners: Record<string, Listener> = {};
  class FakeEventSource {
    constructor(public url: string) {}
    addEventListener(name: string, listener: Listener): void {
      listeners[name] = listener;
    }
    close(): void {}
  }
  return { FakeEventSource, listeners };
}
