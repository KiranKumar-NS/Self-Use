import { Routes } from '@angular/router';

export const BREEDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./breeding-list/breeding-list').then((m) => m.BreedingList),
  },
  {
    path: 'new',
    loadComponent: () => import('./breeding-form/breeding-form').then((m) => m.BreedingForm),
  },
  {
    path: 'calendar',
    loadComponent: () => import('./breeding-calendar/breeding-calendar').then((m) => m.BreedingCalendar),
  },
  {
    path: ':recordId/edit',
    loadComponent: () => import('./breeding-form/breeding-form').then((m) => m.BreedingForm),
  },
];
