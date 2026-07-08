import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { NotFoundComponent } from './layout/not-found/not-found.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES),
      },
      {
        path: 'transactions',
        loadChildren: () => import('./features/transactions/transactions.routes').then(m => m.TRANSACTION_ROUTES),
        canActivate: [roleGuard(['admin', 'manager'])],
      },
      {
        path: 'loans',
        loadChildren: () => import('./features/loans/loans.routes').then(m => m.LOAN_ROUTES),
        canActivate: [roleGuard(['admin', 'manager'])],
      },
      {
        path: 'stock',
        loadChildren: () => import('./features/stock/stock.routes').then(m => m.STOCK_ROUTES),
        canActivate: [roleGuard(['admin', 'manager'])],
      },
      { path: 'animals', redirectTo: 'stock', pathMatch: 'prefix' as const },
      { path: 'inventory', redirectTo: 'stock', pathMatch: 'full' as const },
      {
        path: 'buyers',
        loadChildren: () => import('./features/buyers/buyers.routes').then(m => m.BUYER_ROUTES),
        canActivate: [roleGuard(['admin', 'manager'])],
      },
      {
        path: 'tasks',
        loadChildren: () => import('./features/tasks/tasks.routes').then(m => m.TASK_ROUTES),
      },
      {
        path: 'analytics',
        redirectTo: 'dashboard',
        pathMatch: 'full' as const,
      },
      {
        path: 'admin',
        loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
        canActivate: [roleGuard(['admin'])],
      },
    ],
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  { path: '**', component: NotFoundComponent },
];
