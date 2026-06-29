import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatBadgeModule, MatMenuModule],
  template: `
    <button mat-icon-button [matMenuTriggerFor]="menu"
      [matBadge]="notificationService.unreadCount() || null"
      matBadgeColor="warn" matBadgeSize="small">
      <mat-icon>notifications</mat-icon>
    </button>

    <mat-menu #menu="matMenu" class="notification-menu">
      <div class="menu-header" (click)="$event.stopPropagation()">
        <span>Notifications</span>
        @if (notificationService.unreadCount() > 0) {
          <button mat-button class="clear-all" (click)="notificationService.dismissAll()">Clear All</button>
        }
      </div>

      @if (notificationService.notifications().length === 0) {
        <div class="empty" (click)="$event.stopPropagation()">
          <mat-icon>check_circle</mat-icon>
          <span>All clear!</span>
        </div>
      } @else {
        @for (n of notificationService.notifications(); track n.id) {
          <div class="notif-item" [class]="n.severity" (click)="navigate(n.link)">
            <div class="notif-content">
              <mat-icon class="notif-icon">{{ getIcon(n.type) }}</mat-icon>
              <div>
                <div class="notif-title">{{ n.title }}</div>
                <div class="notif-message">{{ n.message }}</div>
              </div>
            </div>
            <button mat-icon-button class="dismiss-btn" (click)="dismiss($event, n.id)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      }
    </mat-menu>
  `,
  styles: [`
    .menu-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; border-bottom: 1px solid #e2e8f0;
      font-weight: 600; font-size: 0.9rem; color: #1e293b;
    }
    .clear-all { font-size: 0.75rem; color: #4f46e5; }
    .empty {
      display: flex; align-items: center; gap: 8px; padding: 24px 16px;
      color: #94a3b8; justify-content: center;
    }
    .notif-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer;
      min-width: 300px;
    }
    .notif-item:hover { background: #f8fafc; }
    .notif-item.warning { border-left: 3px solid #d97706; }
    .notif-item.error { border-left: 3px solid #dc2626; }
    .notif-content { display: flex; align-items: flex-start; gap: 10px; flex: 1; }
    .notif-icon { font-size: 20px; width: 20px; height: 20px; margin-top: 2px; }
    .warning .notif-icon { color: #d97706; }
    .error .notif-icon { color: #dc2626; }
    .notif-title { font-size: 0.85rem; font-weight: 600; color: #1e293b; }
    .notif-message { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    .dismiss-btn { opacity: 0.4; }
    .notif-item:hover .dismiss-btn { opacity: 1; }
    @media (max-width: 480px) {
      .notif-item { min-width: 0; }
    }
  `],
})
export class NotificationBellComponent {
  notificationService = inject(NotificationService);
  private router = inject(Router);

  getIcon(type: string): string {
    switch (type) {
      case 'loan_overdue': return 'account_balance';
      case 'task_overdue': return 'assignment_late';
      case 'budget_warning': return 'warning';
      case 'budget_exceeded': return 'error';
      default: return 'notifications';
    }
  }

  navigate(link: string): void {
    this.router.navigateByUrl(link);
  }

  dismiss(event: Event, id: string): void {
    event.stopPropagation();
    this.notificationService.dismiss(id);
  }
}
