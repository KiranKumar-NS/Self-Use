import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule],
  template: `
    <div class="sidebar">
      <div class="logo">
        <h2>Farm Tracker</h2>
        <p class="text-sm text-gray-400">Financial Management</p>
      </div>

      <nav class="nav-links">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
          <mat-icon>dashboard</mat-icon>
          <span>Dashboard</span>
        </a>

        @if (!auth.isViewer()) {
          <a routerLink="/transactions" routerLinkActive="active" class="nav-item">
            <mat-icon>receipt_long</mat-icon>
            <span>Transactions</span>
          </a>

          <a routerLink="/loans" routerLinkActive="active" class="nav-item">
            <mat-icon>account_balance</mat-icon>
            <span>Owe & Lent</span>
          </a>
        }

        <a routerLink="/tasks" routerLinkActive="active" class="nav-item">
          <mat-icon>view_kanban</mat-icon>
          <span>Tasks</span>
        </a>

        <a routerLink="/reports" routerLinkActive="active" class="nav-item">
          <mat-icon>assessment</mat-icon>
          <span>Reports</span>
        </a>

        @if (auth.isAdmin()) {
          <a routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-item">
            <mat-icon>admin_panel_settings</mat-icon>
            <span>Admin</span>
          </a>

          <a routerLink="/admin/data-setup" routerLinkActive="active" class="nav-item">
            <mat-icon>dataset</mat-icon>
            <span>Data Setup</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    .sidebar {
      width: 250px;
      min-height: 100vh;
      background: #1e293b;
      color: white;
      padding: 1rem 0;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 50;
    }
    .logo {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #334155;
      margin-bottom: 1rem;
    }
    .logo h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 0.5rem;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      color: #94a3b8;
      text-decoration: none;
      border-radius: 8px;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    .nav-item:hover {
      background: #334155;
      color: white;
    }
    .nav-item.active {
      background: #4f46e5;
      color: white;
    }
    .nav-item mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  `],
})
export class SidebarComponent {
  auth = inject(AuthService);
}
