import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <mat-toolbar class="header">
      <span class="spacer"></span>

      <div class="user-info">
        <span class="user-name">{{ auth.userProfile()?.displayName }}</span>

        <button mat-icon-button [matMenuTriggerFor]="menu">
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
      background: white;
      color: #1e293b;
      border-bottom: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
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
  `],
})
export class HeaderComponent {
  auth = inject(AuthService);
  private router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
