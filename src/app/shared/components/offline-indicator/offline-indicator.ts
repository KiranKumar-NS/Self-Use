import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConnectivityService } from '../../../core/offline/connectivity.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-offline-indicator',
  imports: [MatIconModule, TranslateModule],
  template: `
    @if (!connectivity.isOnline()) {
      <div class="offline-badge">
        <mat-icon>cloud_off</mat-icon>
        <span>{{ 'APP.OFFLINE_MESSAGE' | translate }}</span>
      </div>
    }
  `,
  styles: `
    .offline-badge {
      display: flex; align-items: center; gap: 8px;
      background: #fff3e0; color: #e65100; padding: 8px 16px;
      border-radius: 8px; font-size: 13px; margin-bottom: 16px;
    }
  `,
})
export class OfflineIndicator {
  readonly connectivity = inject(ConnectivityService);
}
