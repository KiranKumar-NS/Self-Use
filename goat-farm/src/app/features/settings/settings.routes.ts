import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-management/user-management').then((m) => m.UserManagement),
  },
  {
    path: 'farm',
    loadComponent: () => import('./farm-settings/farm-settings').then((m) => m.FarmSettings),
  },
];
