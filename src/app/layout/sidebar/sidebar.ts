import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { TranslateModule } from '@ngx-translate/core';

interface NavItem {
  icon: string;
  labelKey: string;
  route: string;
  roles?: string[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule, TranslateModule],
  template: `
    <div class="sidebar-header">
      <mat-icon class="logo-icon">agriculture</mat-icon>
      <span class="logo-text">{{ 'APP.TITLE' | translate }}</span>
    </div>
    <mat-nav-list>
      @for (item of visibleNavItems; track item.route) {
        <a mat-list-item [routerLink]="item.route" routerLinkActive="active-link">
          <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
          <span matListItemTitle>{{ item.labelKey | translate }}</span>
        </a>
      }
    </mat-nav-list>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .sidebar-header {
      display: flex; align-items: center; padding: 16px;
      gap: 8px; border-bottom: 1px solid rgba(0,0,0,0.12);
    }
    .logo-icon { color: #2e7d32; font-size: 28px; height: 28px; width: 28px; }
    .logo-text { font-size: 18px; font-weight: 600; color: #2e7d32; }
    .active-link { background: rgba(46, 125, 50, 0.1) !important; }
    .active-link mat-icon { color: #2e7d32; }
  `,
})
export class Sidebar {
  private readonly auth = inject(AuthService);

  private readonly navItems: NavItem[] = [
    { icon: 'dashboard', labelKey: 'NAV.DASHBOARD', route: '/dashboard' },
    { icon: 'pets', labelKey: 'NAV.GOATS', route: '/goats' },
    { icon: 'favorite', labelKey: 'NAV.BREEDING', route: '/breeding' },
    { icon: 'grass', labelKey: 'NAV.FEED', route: '/feed' },
    { icon: 'water_drop', labelKey: 'NAV.YIELD', route: '/yield' },
    { icon: 'receipt_long', labelKey: 'NAV.TRANSACTIONS', route: '/transactions', roles: ['admin', 'manager'] },
    { icon: 'notifications', labelKey: 'NAV.NOTIFICATIONS', route: '/notifications' },
    { icon: 'assessment', labelKey: 'NAV.REPORTS', route: '/reports', roles: ['admin', 'manager'] },
    { icon: 'settings', labelKey: 'NAV.SETTINGS', route: '/settings', roles: ['admin'] },
  ];

  get visibleNavItems(): NavItem[] {
    return this.navItems.filter((item) => {
      if (!item.roles) return true;
      return this.auth.hasRole(item.roles as any);
    });
  }
}
