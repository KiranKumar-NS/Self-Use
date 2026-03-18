import { Routes } from '@angular/router';

export const REPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./report-builder/report-builder').then((m) => m.ReportBuilder),
  },
  {
    path: 'financial',
    loadComponent: () => import('./financial-report/financial-report').then((m) => m.FinancialReport),
  },
  {
    path: 'herd',
    loadComponent: () => import('./herd-report/herd-report').then((m) => m.HerdReport),
  },
];
