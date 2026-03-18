import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { FeedService } from '../services/feed.service';
import { FeedLog } from '../../../core/models';

export const FeedStore = signalStore(
  { providedIn: 'root' },
  withState({ loading: false }),
  withEntities<FeedLog>(),

  withComputed((store) => ({
    totalCost: computed(() =>
      store.entities().reduce((sum, f) => sum + f.totalCostInr, 0),
    ),
    recentLogs: computed(() => store.entities().slice(0, 20)),
  })),

  withMethods((store, service = inject(FeedService)) => ({
    loadLogs: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(() => service.getFeedLogs$()),
        tap((logs) => {
          patchState(store, setAllEntities(logs, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),
  })),

  withHooks({ onInit(store) { store.loadLogs(); } }),
);
