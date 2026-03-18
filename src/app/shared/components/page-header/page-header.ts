import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-page-header',
  imports: [MatIconModule, TranslateModule],
  template: `
    <div class="page-header">
      <div class="header-left">
        @if (icon()) {
          <mat-icon class="header-icon">{{ icon() }}</mat-icon>
        }
        <div>
          <h1 class="header-title">{{ titleKey() | translate }}</h1>
          @if (subtitleKey()) {
            <p class="header-subtitle">{{ subtitleKey() | translate }}</p>
          }
        </div>
      </div>
      <div class="header-actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; height: 32px; width: 32px; color: #2e7d32; }
    .header-title { margin: 0; font-size: 24px; font-weight: 500; }
    .header-subtitle { margin: 0; color: #666; font-size: 14px; }
    .header-actions { display: flex; gap: 8px; }
  `,
})
export class PageHeader {
  titleKey = input.required<string>();
  subtitleKey = input<string>('');
  icon = input<string>('');
}
