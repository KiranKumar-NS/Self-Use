import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { GoatService } from '../services/goat.service';
import { Goat, GoatBreed, GoatStatus } from '../../../core/models';

interface GoatStoreState {
  loading: boolean;
  error: string | null;
  filterBreed: GoatBreed | 'all';
  filterStatus: GoatStatus | 'all';
  searchQuery: string;
}

const initialState: GoatStoreState = {
  loading: false,
  error: null,
  filterBreed: 'all',
  filterStatus: 'all',
  searchQuery: '',
};

export const GoatStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withEntities<Goat>(),

  withComputed((store) => ({
    filteredGoats: computed(() => {
      let goats = store.entities();
      const breed = store.filterBreed();
      const status = store.filterStatus();
      const query = store.searchQuery().toLowerCase();

      if (breed !== 'all') goats = goats.filter((g) => g.breed === breed);
      if (status !== 'all') goats = goats.filter((g) => g.status === status);
      if (query) {
        goats = goats.filter(
          (g) => g.tagNumber.toLowerCase().includes(query) || g.name?.toLowerCase().includes(query),
        );
      }
      return goats;
    }),
    totalCount: computed(() => store.entities().length),
    activeCount: computed(() => store.entities().filter((g) => g.status === 'active').length),
    maleCount: computed(() => store.entities().filter((g) => g.gender === 'male' && g.status === 'active').length),
    femaleCount: computed(() => store.entities().filter((g) => g.gender === 'female' && g.status === 'active').length),
    breedCounts: computed(() => {
      const counts: Record<string, number> = {};
      for (const g of store.entities()) {
        counts[g.breed] = (counts[g.breed] || 0) + 1;
      }
      return counts;
    }),
  })),

  withMethods((store, goatService = inject(GoatService)) => ({
    loadGoats: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() => goatService.getAllGoats$()),
        tap((goats) => {
          patchState(store, setAllEntities(goats, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),

    async registerGoat(data: Omit<Goat, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
      patchState(store, { loading: true });
      try {
        const id = await goatService.registerGoat(data);
        patchState(store, { loading: false });
        return id;
      } catch (err: unknown) {
        patchState(store, { loading: false, error: err instanceof Error ? err.message : 'Error' });
        throw err;
      }
    },

    setFilterBreed(breed: GoatBreed | 'all') {
      patchState(store, { filterBreed: breed });
    },
    setFilterStatus(status: GoatStatus | 'all') {
      patchState(store, { filterStatus: status });
    },
    setSearchQuery(query: string) {
      patchState(store, { searchQuery: query });
    },
  })),

  withHooks({
    onInit(store) {
      store.loadGoats();
    },
  }),
);
