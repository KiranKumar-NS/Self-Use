import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const TRANSACTION_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./transaction-list/transaction-list.component').then(m => m.TransactionListComponent) },
  { path: 'new', loadComponent: () => import('./transaction-form/transaction-form.component').then(m => m.TransactionFormComponent), canDeactivate: [unsavedChangesGuard] },
  { path: ':id', loadComponent: () => import('./transaction-detail/transaction-detail.component').then(m => m.TransactionDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./transaction-form/transaction-form.component').then(m => m.TransactionFormComponent), canDeactivate: [unsavedChangesGuard] },
];
