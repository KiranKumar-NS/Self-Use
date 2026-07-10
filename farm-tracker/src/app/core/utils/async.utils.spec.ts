import { signal } from '@angular/core';
import { safeLoad } from './async.utils';

describe('safeLoad', () => {
  it('sets loading true during the load and false after success', async () => {
    const loading = signal(false);
    let seenDuring = false;
    const ok = await safeLoad(loading, async () => {
      seenDuring = loading();
    });
    expect(ok).toBe(true);
    expect(seenDuring).toBe(true);
    expect(loading()).toBe(false);
  });

  it('clears loading and toasts on failure', async () => {
    const loading = signal(false);
    const toast = { error: vi.fn() } as any;
    const ok = await safeLoad(loading, async () => {
      throw new Error('boom');
    }, toast);
    expect(ok).toBe(false);
    expect(loading()).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no toast service is provided', async () => {
    const loading = signal(false);
    const ok = await safeLoad(loading, async () => {
      throw new Error('boom');
    });
    expect(ok).toBe(false);
    expect(loading()).toBe(false);
  });
});
