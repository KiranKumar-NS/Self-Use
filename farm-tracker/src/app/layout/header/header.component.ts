import { Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, NotificationBellComponent],
  template: `
    <mat-toolbar class="header">
      <button mat-icon-button class="menu-btn" (click)="menuToggle.emit()" aria-label="Toggle navigation menu">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="spacer"></span>

      <div class="user-info">
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
    @media (max-width: 768px) {
      .user-name { display: none; }
    }
  `],
})
export class HeaderComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  menuToggle = output();

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
