import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState, withHooks } from '@ngrx/signals';
import { withEntities, setAllEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';
import { ScheduledNotificationService } from '../services/scheduled-notification.service';
import { FarmNotification } from '../../../core/models';

export const NotificationStore = signalStore(
  { providedIn: 'root' },
  withState({ loading: false }),
  withEntities<FarmNotification>(),

  withComputed((store) => ({
    unreadCount: computed(() => store.entities().filter((n) => !n.isRead).length),
    unreadNotifications: computed(() => store.entities().filter((n) => !n.isRead)),
  })),

  withMethods((store, service = inject(ScheduledNotificationService)) => ({
    loadNotifications: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true })),
        switchMap(() => service.getNotifications$()),
        tap((notifications) => {
          patchState(store, setAllEntities(notifications, { selectId: (e: any) => e.id }));
          patchState(store, { loading: false });
        }),
        catchError(() => {
          patchState(store, { loading: false });
          return of([]);
        }),
      ),
    ),
    async markAsRead(id: string) {
      await service.markAsRead(id);
    },
    async markAllAsRead() {
      const unreadIds = store.entities().filter((n) => !n.isRead).map((n) => n.id);
      if (unreadIds.length > 0) await service.markAllAsRead(unreadIds);
    },
  })),

  withHooks({ onInit(store) { store.loadNotifications(); } }),
);
