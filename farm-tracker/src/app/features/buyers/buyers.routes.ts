import { Routes } from '@angular/router';

export const BUYER_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./buyer-list/buyer-list.component').then(m => m.BuyerListComponent) },
  { path: ':id', loadComponent: () => import('./buyer-detail/buyer-detail.component').then(m => m.BuyerDetailComponent) },
];
