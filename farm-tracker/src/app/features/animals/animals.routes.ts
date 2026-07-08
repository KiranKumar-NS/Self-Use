import { Routes } from '@angular/router';

export const ANIMAL_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./animal-list/animal-list.component').then(m => m.AnimalListComponent) },
  { path: 'new', loadComponent: () => import('./animal-form/animal-form.component').then(m => m.AnimalFormComponent) },
  { path: 'analytics', loadComponent: () => import('./animal-analytics/animal-analytics.component').then(m => m.AnimalAnalyticsComponent) },
  { path: ':id', loadComponent: () => import('./animal-detail/animal-detail.component').then(m => m.AnimalDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./animal-form/animal-form.component').then(m => m.AnimalFormComponent) },
];
