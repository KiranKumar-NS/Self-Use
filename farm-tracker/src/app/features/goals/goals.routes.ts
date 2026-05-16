import { Routes } from '@angular/router';

export const GOAL_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./goal-list/goal-list.component').then(m => m.GoalListComponent) },
  { path: 'new', loadComponent: () => import('./goal-form/goal-form.component').then(m => m.GoalFormComponent) },
  { path: ':id/edit', loadComponent: () => import('./goal-form/goal-form.component').then(m => m.GoalFormComponent) },
];
