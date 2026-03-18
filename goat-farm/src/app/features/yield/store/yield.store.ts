import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { YieldService } from '../services/yield.service';
import { MilkYield } from '../../../core/models';

export const YieldStore = signalStore(
  { providedIn: 'root' },
  withState({ loading: false }),
  withEntities<MilkYield>(),

  withComputed((store) => ({
    totalYield: computed(() =>
      store.entities().reduce((sum, y) => sum + y.totalYieldLiters, 0),
    ),
    averageYield: computed(() => {
      const entities = store.entities();
      if (entities.length === 0) return 0;
      return entities.reduce((sum, y) => sum + y.totalYieldLiters, 0) / entities.length;
    }),
    recentYields: computed(() => store.entities().slice(0, 30)),
  })),

  withMethods((store, service = inject(YieldService)) => ({
    loadYields: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(() => service.getMilkYields$()),
        tap((yields) => {
          patchState(store, setAllEntities(yields, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),
  })),

  withHooks({ onInit(store) { store.loadYields(); } }),
);
