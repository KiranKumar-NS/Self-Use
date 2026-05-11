import { Routes } from '@angular/router';

export const AUDIT_LOG_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./audit-log-page/audit-log-page.component').then(m => m.AuditLogPageComponent) },
];
