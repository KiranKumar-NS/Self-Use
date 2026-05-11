import { Routes } from '@angular/router';

export const TRANSACTION_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./transaction-list/transaction-list.component').then(m => m.TransactionListComponent) },
  { path: 'new', loadComponent: () => import('./transaction-form/transaction-form.component').then(m => m.TransactionFormComponent) },
  { path: ':id', loadComponent: () => import('./transaction-detail/transaction-detail.component').then(m => m.TransactionDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./transaction-form/transaction-form.component').then(m => m.TransactionFormComponent) },
];
