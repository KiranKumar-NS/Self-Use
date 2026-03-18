import { Routes } from '@angular/router';

export const YIELD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./milk-yield/milk-yield').then((m) => m.MilkYieldComponent),
  },
  {
    path: 'growth',
    loadComponent: () => import('./growth-tracker/growth-tracker').then((m) => m.GrowthTracker),
  },
  {
    path: 'new',
    loadComponent: () => import('./yield-form/yield-form').then((m) => m.YieldFormComponent),
  },
];
