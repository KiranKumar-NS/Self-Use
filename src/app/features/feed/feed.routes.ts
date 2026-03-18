import { Routes } from '@angular/router';

export const FEED_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./feed-log/feed-log').then((m) => m.FeedLogComponent),
  },
  {
    path: 'stock',
    loadComponent: () => import('./feed-stock/feed-stock').then((m) => m.FeedStockComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./feed-form/feed-form').then((m) => m.FeedFormComponent),
  },
];
