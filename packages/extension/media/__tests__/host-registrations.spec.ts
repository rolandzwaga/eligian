/**
 * The preview's registrations for a host module (audit idea #24): the
 * declared names of the bundled module, or stand-ins in an untrusted workspace.
 */
import { describe, expect, it, vi } from 'vitest';
import { hostRegistrations, stubRegistrations } from '../host-registrations.js';

const HOST = {
  path: './host.ts',
  operations: ['trackEvent'],
  controllers: ['Confetti'],
  functions: ['formatPrice'],
};

class Confetti {
  name = 'Confetti';
  init() {}
  attach() {}
  detach() {}
}

describe('host registrations', () => {
  it('nothing without a host module', async () => {
    expect(await hostRegistrations(undefined)).toEqual({});
  });

  it('the declared names of the bundled module', async () => {
    const trackEvent = (data: unknown) => data;
    const formatPrice = (n: number) => n.toFixed(2);
    const load = vi.fn().mockResolvedValue({
      operations: { trackEvent, other: () => {} },
      controllers: { Confetti },
      functions: { formatPrice },
    });
    const registrations = await hostRegistrations({ ...HOST, url: 'https://file/host-1.js' }, load);
    expect(load).toHaveBeenCalledWith('https://file/host-1.js');
    expect(registrations).toEqual({
      operations: { trackEvent },
      controllers: { Confetti },
      functions: { formatPrice },
    });
  });

  it('a declared name the module does not export is an error', async () => {
    const load = vi.fn().mockResolvedValue({ operations: {}, controllers: { Confetti } });
    await expect(hostRegistrations({ ...HOST, url: 'u' }, load)).rejects.toThrow(
      'The extensions module ./host.ts does not export operations.trackEvent, functions.formatPrice'
    );
  });

  it('stand-ins in an untrusted workspace: operations pass their data on', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const registrations = (await hostRegistrations({ ...HOST, stub: true })) as unknown as {
      operations: Record<string, (d: unknown) => unknown>;
      controllers: Record<string, new () => { name: string; attach(): void }>;
      functions: Record<string, () => unknown>;
    };
    expect(registrations.operations.trackEvent({ a: 1 })).toEqual({ a: 1 });
    const controller = new registrations.controllers.Confetti();
    expect(controller.name).toBe('Confetti');
    controller.attach();
    expect(registrations.functions.formatPrice()).toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      '[Eligian preview] trackEvent from ./host.ts skipped: the workspace is not trusted'
    );
    info.mockRestore();
    expect(Object.keys(stubRegistrations(HOST))).toEqual([
      'operations',
      'controllers',
      'functions',
    ]);
  });
});
