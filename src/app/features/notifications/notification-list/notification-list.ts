import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatePipe } from '@angular/common';
import { NotificationStore } from '../store/notification.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';
import { FarmNotification, NotificationType } from '../../../core/models';

@Component({
  selector: 'app-notification-list',
  imports: [
    DatePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    MatBadgeModule, MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="NOTIFICATIONS.TITLE" icon="notifications">
      @if (store.unreadCount() > 0) {
        <button mat-stroked-button (click)="store.markAllAsRead()">
          <mat-icon>done_all</mat-icon>
          {{ 'NOTIFICATIONS.MARK_ALL_READ' | translate }}
        </button>
      }
    </app-page-header>

    @if (store.loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (store.entities().length === 0) {
      <mat-card>
        <mat-card-content class="empty-text">
          <mat-icon class="empty-icon">notifications_off</mat-icon>
          <p>{{ 'NOTIFICATIONS.NO_NOTIFICATIONS' | translate }}</p>
        </mat-card-content>
      </mat-card>
    } @else {
      <mat-card>
        <mat-list>
          @for (notification of store.entities(); track notification.id) {
            <mat-list-item
              [class.unread]="!notification.isRead"
              (click)="store.markAsRead(notification.id)">
              <mat-icon matListItemIcon [style.color]="getIconColor(notification.type)">
                {{ getIcon(notification.type) }}
              </mat-icon>
              <span matListItemTitle>{{ notification.title }}</span>
              <span matListItemLine>{{ notification.message }}</span>
              <span matListItemMeta>{{ notification.scheduledDate.toDate() | date:'short' }}</span>
            </mat-list-item>
          }
        </mat-list>
      </mat-card>
    }
  `,
  styles: `
    .loading { display: flex; justify-content: center; padding: 40px; }
    .empty-text { text-align: center; padding: 40px; color: #999; }
    .empty-icon { font-size: 48px; height: 48px; width: 48px; color: #ccc; }
    .unread { background: #e8f5e9; }
  `,
})
export class NotificationList {
  readonly store = inject(NotificationStore);

  getIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      breeding_reminder: 'favorite',
      vaccination_due: 'vaccines',
      feed_stock_low: 'inventory',
      kidding_due: 'child_care',
      weight_check: 'monitor_weight',
      custom: 'notifications',
    };
    return icons[type] || 'notifications';
  }

  getIconColor(type: NotificationType): string {
    const colors: Record<NotificationType, string> = {
      breeding_reminder: '#7b1fa2',
      vaccination_due: '#1565c0',
      feed_stock_low: '#e65100',
      kidding_due: '#c62828',
      weight_check: '#2e7d32',
      custom: '#666',
    };
    return colors[type] || '#666';
  }
}
