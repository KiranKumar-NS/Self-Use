import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

/**
 * Catches errors that escape component/service handling so the user sees a
 * friendly message instead of a silently broken screen.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);
    // Zone/promise wrappers bury the original error in `rejection`
    const unwrapped = (error as { rejection?: unknown })?.rejection ?? error;
    const message = unwrapped instanceof Error ? unwrapped.message : '';
    // Chunk-load failures after a redeploy are fixed by reloading
    if (/ChunkLoadError|Failed to fetch dynamically imported module/i.test(message)) {
      this.toast.error('App was updated. Please reload the page.');
      return;
    }
    this.toast.error('Something went wrong. Please try again.');
  }
}
