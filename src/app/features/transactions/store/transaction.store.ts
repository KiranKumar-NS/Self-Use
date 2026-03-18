import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { TransactionService } from '../services/transaction.service';
import { Transaction, TransactionCategory } from '../../../core/models';

export const TransactionStore = signalStore(
  { providedIn: 'root' },
  withState({ loading: false, filterCategory: 'all' as TransactionCategory | 'all' }),
  withEntities<Transaction>(),

  withComputed((store) => ({
    filteredTransactions: computed(() => {
      const cat = store.filterCategory();
      if (cat === 'all') return store.entities();
      return store.entities().filter((t) => t.category === cat);
    }),
    totalIncome: computed(() =>
      store.entities().filter((t) => t.category === 'income').reduce((sum, t) => sum + t.amountInr, 0),
    ),
    totalExpense: computed(() =>
      store.entities().filter((t) => t.category === 'expense').reduce((sum, t) => sum + t.amountInr, 0),
    ),
    netProfit: computed(() => {
      const income = store.entities().filter((t) => t.category === 'income').reduce((sum, t) => sum + t.amountInr, 0);
      const expense = store.entities().filter((t) => t.category === 'expense').reduce((sum, t) => sum + t.amountInr, 0);
      return income - expense;
    }),
  })),

  withMethods((store, service = inject(TransactionService)) => ({
    loadTransactions: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(() => service.getTransactions$()),
        tap((txns) => {
          patchState(store, setAllEntities(txns, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),
    setFilterCategory(cat: TransactionCategory | 'all') {
      patchState(store, { filterCategory: cat });
    },
  })),

  withHooks({ onInit(store) { store.loadTransactions(); } }),
);
