import { Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule],
  template: `
    @if (open()) {
      <div class="overlay" (click)="closed.emit()"></div>
    }
    <div class="sidebar" [class.open]="open()">
      <div class="logo">
        <h2>Farm Tracker</h2>
        <p class="text-sm text-gray-400">Financial Management</p>
      </div>

      <nav class="nav-links">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
          <mat-icon>dashboard</mat-icon>
          <span>Dashboard</span>
        </a>

        @if (!auth.isViewer()) {
          <a routerLink="/transactions" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
            <mat-icon>receipt_long</mat-icon>
            <span>Transactions</span>
          </a>

          <a routerLink="/loans" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
            <mat-icon>account_balance</mat-icon>
            <span>Owe & Lent</span>
          </a>

          <a routerLink="/inventory" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
            <mat-icon>inventory_2</mat-icon>
            <span>Inventory</span>
          </a>
        }

        <a routerLink="/tasks" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
          <mat-icon>view_kanban</mat-icon>
          <span>Tasks</span>
        </a>

        <a routerLink="/analytics" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
          <mat-icon>analytics</mat-icon>
          <span>Analytics</span>
        </a>

        @if (auth.isAdmin()) {
          <div class="nav-section">
            <span class="nav-section-label">Admin</span>
          </div>
          <a routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-item" (click)="closed.emit()">
            <mat-icon>admin_panel_settings</mat-icon>
            <span>Users</span>
          </a>

          <a routerLink="/admin/data-setup" routerLinkActive="active" class="nav-item" (click)="closed.emit()">
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
      transition: transform 0.3s ease;
    }
    .overlay {
      display: none;
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
    .nav-section {
      padding: 16px 16px 4px;
    }
    .nav-section-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    @media (max-width: 768px) {
      .sidebar {
        transform: translateX(-100%);
        z-index: 100;
      }
      .sidebar.open {
        transform: translateX(0);
      }
      .overlay {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 99;
      }
    }
  `],
})
export class SidebarComponent {
  auth = inject(AuthService);
  open = input(false);
  closed = output();
}
