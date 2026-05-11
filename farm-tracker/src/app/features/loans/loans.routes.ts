import { Routes } from '@angular/router';

export const LOAN_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./loan-list/loan-list.component').then(m => m.LoanListComponent) },
  { path: 'new', loadComponent: () => import('./loan-form/loan-form.component').then(m => m.LoanFormComponent) },
  { path: ':id', loadComponent: () => import('./loan-detail/loan-detail.component').then(m => m.LoanDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./loan-form/loan-form.component').then(m => m.LoanFormComponent) },
];
