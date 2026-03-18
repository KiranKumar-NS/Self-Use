import { inject, Injectable, effect } from '@angular/core';
import { ConnectivityService } from './connectivity.service';
import { FIRESTORE } from '../firebase/firebase.config';
import { enableNetwork, disableNetwork, waitForPendingWrites } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly connectivity = inject(ConnectivityService);
  private readonly firestore = inject(FIRESTORE);

  constructor() {
    effect(() => {
      if (this.connectivity.isOnline()) {
        this.handleOnline();
      } else {
        this.handleOffline();
      }
    });
  }

  private async handleOnline(): Promise<void> {
    try {
      await enableNetwork(this.firestore);
      await waitForPendingWrites(this.firestore);
    } catch (err) {
      console.error('Error re-enabling network:', err);
    }
  }

  private async handleOffline(): Promise<void> {
    try {
      await disableNetwork(this.firestore);
    } catch (err) {
      console.error('Error disabling network:', err);
    }
  }
}
