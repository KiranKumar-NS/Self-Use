import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Central snackbar wrapper. Deduplicates identical messages fired in quick
 * succession so a burst of failures doesn't queue a storm of snackbars.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private snackBar = inject(MatSnackBar);

  private lastMessage = '';
  private lastShownAt = 0;
  private readonly DEDUP_WINDOW_MS = 3000;

  success(message: string): void {
    this.show(message);
  }

  info(message: string): void {
    this.show(message);
  }

  error(message: string): void {
    this.show(message, 5000);
  }

  private show(message: string, duration?: number): void {
    const now = Date.now();
    if (message === this.lastMessage && now - this.lastShownAt < this.DEDUP_WINDOW_MS) {
      return;
    }
    this.lastMessage = message;
    this.lastShownAt = now;
    this.snackBar.open(message, 'Close', duration ? { duration } : undefined);
  }
}
