import { Routes } from '@angular/router';

export const REPORT_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./report-page/report-page.component').then(m => m.ReportPageComponent) },
];
