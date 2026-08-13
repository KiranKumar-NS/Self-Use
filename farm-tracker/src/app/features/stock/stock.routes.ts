import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const STOCK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./stock-page/stock-page.component').then(m => m.StockPageComponent),
  },
  // Registration now happens via the unified inventory-event dialog on the stock
  // page; keep the redirect so old bookmarks (/stock/new, /animals/new) don't
  // fall through to the ':id' route with id='new'.
  { path: 'new', redirectTo: '', pathMatch: 'full' },
  {
    path: 'analytics',
    loadComponent: () => import('../animals/animal-analytics/animal-analytics.component').then(m => m.AnimalAnalyticsComponent),
  },
  {
    path: 'mortality',
    loadComponent: () => import('../animals/mortality-dashboard/mortality-dashboard.component').then(m => m.MortalityDashboardComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('../animals/animal-detail/animal-detail.component').then(m => m.AnimalDetailComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('../animals/animal-form/animal-form.component').then(m => m.AnimalFormComponent),
    canDeactivate: [unsavedChangesGuard],
  },
];
