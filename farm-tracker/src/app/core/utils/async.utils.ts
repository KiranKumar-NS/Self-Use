import { WritableSignal } from '@angular/core';
import { ToastService } from '../services/toast.service';

/**
 * Runs an async load under a loading signal, guaranteeing the signal clears
 * and the user sees a toast if the load fails (no more stuck spinners).
 * Returns true when fn completed without throwing.
 */
export async function safeLoad(
  loading: WritableSignal<boolean>,
  fn: () => Promise<void>,
  toast?: ToastService,
  errorMessage = 'Failed to load data. Check your connection and try again.'
): Promise<boolean> {
  loading.set(true);
  try {
    await fn();
    return true;
  } catch (err) {
    console.error('[safeLoad]', err);
    toast?.error(errorMessage);
    return false;
  } finally {
    loading.set(false);
  }
}
