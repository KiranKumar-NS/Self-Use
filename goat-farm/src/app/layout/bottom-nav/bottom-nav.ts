import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, MatIconModule, TranslateModule],
  template: `
    <nav class="bottom-nav">
      <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
        <mat-icon>dashboard</mat-icon>
        <span>{{ 'NAV.DASHBOARD' | translate }}</span>
      </a>
      <a routerLink="/goats" routerLinkActive="active" class="nav-item">
        <mat-icon>pets</mat-icon>
        <span>{{ 'NAV.GOATS' | translate }}</span>
      </a>
      <a routerLink="/breeding" routerLinkActive="active" class="nav-item">
        <mat-icon>favorite</mat-icon>
        <span>{{ 'NAV.BREEDING' | translate }}</span>
      </a>
      <a routerLink="/yield" routerLinkActive="active" class="nav-item">
        <mat-icon>water_drop</mat-icon>
        <span>{{ 'NAV.YIELD' | translate }}</span>
      </a>
      <a routerLink="/notifications" routerLinkActive="active" class="nav-item">
        <mat-icon>notifications</mat-icon>
        <span>{{ 'NAV.ALERTS' | translate }}</span>
      </a>
    </nav>
  `,
  styles: `
    .bottom-nav {
      display: flex; justify-content: space-around; align-items: center;
      background: white; border-top: 1px solid rgba(0,0,0,0.12);
      padding: 4px 0; position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
    }
    .nav-item {
      display: flex; flex-direction: column; align-items: center;
      text-decoration: none; color: #666; font-size: 10px; padding: 4px 8px;
    }
    .nav-item mat-icon { font-size: 22px; height: 22px; width: 22px; }
    .nav-item.active { color: #2e7d32; }
    .nav-item.active mat-icon { color: #2e7d32; }
  `,
})
export class BottomNav {}
