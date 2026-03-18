import { Routes } from '@angular/router';

export const GOAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./goat-list/goat-list').then((m) => m.GoatList),
    title: 'All Goats',
  },
  {
    path: 'new',
    loadComponent: () => import('./goat-form/goat-form').then((m) => m.GoatForm),
    title: 'Register Goat',
  },
  {
    path: ':goatId',
    loadComponent: () => import('./goat-profile/goat-profile').then((m) => m.GoatProfile),
    title: 'Goat Profile',
  },
  {
    path: ':goatId/edit',
    loadComponent: () => import('./goat-form/goat-form').then((m) => m.GoatForm),
    title: 'Edit Goat',
  },
];
