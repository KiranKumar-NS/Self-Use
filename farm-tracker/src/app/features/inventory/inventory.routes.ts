import { Routes } from '@angular/router';

export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./inventory-page/inventory-page.component').then(m => m.InventoryPageComponent),
  },
];
