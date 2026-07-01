import { Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <nav class="bottom-nav">
      <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
        <mat-icon>dashboard</mat-icon>
        <span>Home</span>
      </a>
      <a routerLink="/transactions" routerLinkActive="active" class="nav-item">
        <mat-icon>receipt_long</mat-icon>
        <span>Txns</span>
      </a>
      <a routerLink="/tasks" routerLinkActive="active" class="nav-item">
        <mat-icon>view_kanban</mat-icon>
        <span>Tasks</span>
      </a>
      <a routerLink="/inventory" routerLinkActive="active" class="nav-item">
        <mat-icon>inventory_2</mat-icon>
        <span>Stock</span>
      </a>
      <button class="nav-item" (click)="moreClick.emit()">
        <mat-icon>more_horiz</mat-icon>
        <span>More</span>
      </button>
    </nav>
  `,
  styles: [`
    .bottom-nav {
      display: none;
    }
    @media (max-width: 768px) {
      .bottom-nav {
        display: flex;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: white;
        border-top: 1px solid #e2e8f0;
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
        z-index: 90;
        padding: 4px 0;
        padding-bottom: env(safe-area-inset-bottom, 0);
      }
      .nav-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 0;
        color: #94a3b8;
        text-decoration: none;
        font-size: 0.65rem;
        font-weight: 600;
        background: none;
        border: none;
        cursor: pointer;
        transition: color 0.2s;
        min-height: 48px;
        justify-content: center;
      }
      .nav-item mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
      .nav-item.active {
        color: #4f46e5;
      }
      .nav-item:hover {
        color: #4f46e5;
      }
    }
  `],
})
export class BottomNavComponent {
  moreClick = output();
}
