import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { BreedingService } from '../services/breeding.service';
import { BreedingRecord, BreedingStatus } from '../../../core/models';

export const BreedingStore = signalStore(
  { providedIn: 'root' },
  withState({ loading: false, filterStatus: 'all' as BreedingStatus | 'all' }),
  withEntities<BreedingRecord>(),

  withComputed((store) => ({
    filteredRecords: computed(() => {
      const status = store.filterStatus();
      if (status === 'all') return store.entities();
      return store.entities().filter((r) => r.status === status);
    }),
    activePregnancies: computed(() =>
      store.entities().filter((r) => ['mated', 'confirmed_pregnant', 'kidding_due'].includes(r.status)),
    ),
    upcomingKiddings: computed(() =>
      store.entities().filter((r) => r.status === 'kidding_due' || r.status === 'confirmed_pregnant'),
    ),
  })),

  withMethods((store, service = inject(BreedingService)) => ({
    loadRecords: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(() => service.getBreedingRecords$()),
        tap((records) => {
          patchState(store, setAllEntities(records, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),
    setFilterStatus(status: BreedingStatus | 'all') {
      patchState(store, { filterStatus: status });
    },
  })),

  withHooks({ onInit(store) { store.loadRecords(); } }),
);
