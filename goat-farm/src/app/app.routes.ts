import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { MainLayout } from './layout/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        title: 'Dashboard',
      },
      {
        path: 'goats',
        loadChildren: () => import('./features/goats/goats.routes').then((m) => m.GOAT_ROUTES),
        title: 'Goats',
      },
      {
        path: 'breeding',
        loadChildren: () => import('./features/breeding/breeding.routes').then((m) => m.BREEDING_ROUTES),
        title: 'Breeding',
      },
      {
        path: 'feed',
        loadChildren: () => import('./features/feed/feed.routes').then((m) => m.FEED_ROUTES),
        title: 'Feed',
      },
      {
        path: 'yield',
        loadChildren: () => import('./features/yield/yield.routes').then((m) => m.YIELD_ROUTES),
        title: 'Yield',
      },
      {
        path: 'transactions',
        loadChildren: () => import('./features/transactions/transactions.routes').then((m) => m.TRANSACTION_ROUTES),
        canActivate: [roleGuard],
        data: { roles: ['admin', 'manager'] },
        title: 'Transactions',
      },
      {
        path: 'notifications',
        loadChildren: () => import('./features/notifications/notifications.routes').then((m) => m.NOTIFICATION_ROUTES),
        title: 'Notifications',
      },
      {
        path: 'reports',
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORT_ROUTES),
        canActivate: [roleGuard],
        data: { roles: ['admin', 'manager'] },
        title: 'Reports',
      },
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        title: 'Settings',
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
