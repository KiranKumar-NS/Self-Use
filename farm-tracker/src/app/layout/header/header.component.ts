import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { UserGuideDialogComponent } from '../user-guide/user-guide-dialog.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, NotificationBellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="header">
      <button mat-icon-button class="menu-btn" (click)="menuToggle.emit()" aria-label="Toggle navigation menu">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="spacer"></span>

      @if (!connectivity.online()) {
        <span class="offline-chip" role="status" aria-live="polite">
          <mat-icon>cloud_off</mat-icon>
          Offline — changes will sync later
        </span>
      }

      <div class="user-info">
        <button mat-icon-button (click)="openGuide()" aria-label="User guide" class="guide-btn">
          <mat-icon>help_outline</mat-icon>
        </button>
        <app-notification-bell />
        <span class="user-name">{{ auth.userProfile()?.displayName }}</span>

        <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="User menu">
          <mat-icon>account_circle</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          <button mat-menu-item disabled>
            <mat-icon>person</mat-icon>
            <span>{{ auth.userProfile()?.email }}</span>
          </button>
          <button mat-menu-item (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>Logout</span>
          </button>
        </mat-menu>
      </div>
    </mat-toolbar>
  `,
  styles: [`
    .header {
      background: var(--color-surface);
      color: var(--color-text);
      border-bottom: 1px solid var(--color-border);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .menu-btn { display: none; }
    .spacer { flex: 1; }
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .user-name {
      font-size: 0.875rem;
      font-weight: 500;
    }
    .offline-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      margin-right: 8px;
      border-radius: 12px;
      background: var(--color-warning, #f59e0b);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .offline-chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    @media (max-width: 768px) {
      .user-name { display: none; }
      .offline-chip { font-size: 0; gap: 0; padding: 4px; }
      .offline-chip mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }
  `],
})
export class HeaderComponent {
  auth = inject(AuthService);
  connectivity = inject(ConnectivityService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  menuToggle = output();

  openGuide(): void {
    this.dialog.open(UserGuideDialogComponent, {
      data: { currentRoute: this.router.url },
      panelClass: 'guide-dialog-panel',
      maxWidth: '95vw',
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
