import { Routes } from '@angular/router';

export const HARVEST_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./harvest-list/harvest-list.component').then(m => m.HarvestListComponent) },
  { path: ':id', loadComponent: () => import('./harvest-detail/harvest-detail.component').then(m => m.HarvestDetailComponent) },
];
