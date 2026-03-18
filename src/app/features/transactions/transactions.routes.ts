import { Routes } from '@angular/router';

export const TRANSACTION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./transaction-list/transaction-list').then((m) => m.TransactionList),
  },
  {
    path: 'new',
    loadComponent: () => import('./transaction-form/transaction-form').then((m) => m.TransactionForm),
  },
];
