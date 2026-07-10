import { Injectable, signal } from '@angular/core';

/**
 * Tracks browser connectivity. Firestore's persistent cache serves reads
 * offline; this exists so the UI can tell the user why writes are queued.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }
}
