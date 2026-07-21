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

/**
 * Rejects with `message` if `promise` doesn't settle within `ms`.
 * Guards against a network call (e.g. Firebase Auth/Firestore) hanging forever
 * and leaving the UI stuck on a loading state. The underlying promise is left
 * to settle on its own — only the caller stops waiting.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms = 20_000,
  message = 'Network timed out — check your connection and try again.'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
