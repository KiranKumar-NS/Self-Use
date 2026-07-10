import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="bottom-nav" aria-label="Mobile navigation">
      <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
        <mat-icon>dashboard</mat-icon>
        <span>Home</span>
      </a>
      <a routerLink="/transactions" routerLinkActive="active" class="nav-item">
        <mat-icon>receipt_long</mat-icon>
        <span>Txns</span>
      </a>
      <a routerLink="/loans" routerLinkActive="active" class="nav-item">
        <mat-icon>account_balance</mat-icon>
        <span>Loans</span>
      </a>
      <a routerLink="/stock" routerLinkActive="active" class="nav-item">
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
        border-top: 1px solid var(--color-border);
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
        color: var(--color-sidebar-text);
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
        color: var(--color-primary);
      }
      .nav-item:hover {
        color: var(--color-primary);
      }
    }
  `],
})
export class BottomNavComponent {
  moreClick = output();
}
