import { Routes } from '@angular/router';

export const NOTIFICATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./notification-list/notification-list').then((m) => m.NotificationList),
  },
];
